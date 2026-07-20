import { prisma } from "../lib/prisma.js";
import {
  getStripe,
  mapStripeSubscriptionStatus,
} from "../lib/stripe.js";
import {
  BUYER_PLAN_CODES,
} from "./platformPricingCatalog.service.js";

const LIFECYCLE_ACTIONS = new Set([
  "ADMIN_CORRECTION",
  "CANCEL_AT_PERIOD_END",
  "KEEP_ACTIVE",
  "SYNC_FROM_STRIPE",
]);

const SUBSCRIPTION_STATUSES = new Set([
  "UNKNOWN",
  "ACTIVE",
  "TRIALING",
  "PAST_DUE",
  "INCOMPLETE",
  "INCOMPLETE_EXPIRED",
  "CANCELED",
  "PAUSED",
]);

function createHttpError(
  message,
  statusCode = 500,
  details = undefined,
) {
  const error = new Error(message);
  error.statusCode = statusCode;

  if (details !== undefined) {
    error.details = details;
  }

  return error;
}

function normalizeString(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function normalizeUpper(value, fallback = "") {
  return normalizeString(value, fallback).toUpperCase();
}

function normalizeReason(value) {
  const reason = normalizeString(value);

  if (reason.length < 10) {
    throw createHttpError(
      "Administrator reason must contain at least 10 characters.",
      400,
    );
  }

  if (reason.length > 500) {
    throw createHttpError(
      "Administrator reason cannot exceed 500 characters.",
      400,
    );
  }

  return reason;
}

function normalizeAction(value) {
  const action = normalizeUpper(value);

  if (!LIFECYCLE_ACTIONS.has(action)) {
    throw createHttpError(
      "Invalid buyer subscription lifecycle action.",
      400,
      {
        allowedActions: [...LIFECYCLE_ACTIONS],
      },
    );
  }

  return action;
}

function normalizePlanCode(value) {
  const code = normalizeUpper(value);

  if (!BUYER_PLAN_CODES.includes(code)) {
    throw createHttpError(
      "Invalid buyer plan code.",
      400,
      {
        allowedPlanCodes: BUYER_PLAN_CODES,
      },
    );
  }

  return code;
}

function normalizeStatus(value) {
  const status = normalizeUpper(value);

  if (!SUBSCRIPTION_STATUSES.has(status)) {
    throw createHttpError(
      "Invalid buyer subscription status.",
      400,
      {
        allowedStatuses: [...SUBSCRIPTION_STATUSES],
      },
    );
  }

  return status;
}

function unixToDateOrNull(value) {
  const seconds = Number(value);

  if (!Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }

  return new Date(seconds * 1000);
}

function getStripeObjectId(value) {
  if (!value) return null;
  if (typeof value === "string") return value;

  return normalizeString(value.id) || null;
}

function mapStripeSubscriptionUpdate(
  stripeSubscription,
  existing,
) {
  const item =
    stripeSubscription?.items?.data?.[0] || null;

  const recurringInterval = normalizeString(
    item?.price?.recurring?.interval,
  ).toLowerCase();

  const billingInterval =
    recurringInterval === "year"
      ? "YEAR"
      : recurringInterval === "month"
        ? "MONTH"
        : existing.billingInterval || null;

  const metadataPlan = normalizeUpper(
    stripeSubscription?.metadata?.planCode,
  );

  const plan = BUYER_PLAN_CODES.includes(metadataPlan)
    ? metadataPlan
    : existing.plan;

  return {
    plan,
    status: mapStripeSubscriptionStatus(
      stripeSubscription?.status,
    ),
    billingInterval,
    currentPeriodStart: unixToDateOrNull(
      stripeSubscription?.current_period_start,
    ),
    currentPeriodEnd: unixToDateOrNull(
      stripeSubscription?.current_period_end,
    ),
    startedAt:
      unixToDateOrNull(stripeSubscription?.start_date) ||
      existing.startedAt ||
      null,
    canceledAt: unixToDateOrNull(
      stripeSubscription?.canceled_at,
    ),
    trialEndsAt: unixToDateOrNull(
      stripeSubscription?.trial_end,
    ),
    cancelAtPeriodEnd: Boolean(
      stripeSubscription?.cancel_at_period_end,
    ),
    stripeCustomerId:
      getStripeObjectId(stripeSubscription?.customer) ||
      existing.stripeCustomerId ||
      null,
    stripeSubscriptionId:
      normalizeString(stripeSubscription?.id) ||
      existing.stripeSubscriptionId ||
      null,
    stripePriceId:
      normalizeString(item?.price?.id) ||
      existing.stripePriceId ||
      null,
    stripeLatestInvoiceId:
      getStripeObjectId(
        stripeSubscription?.latest_invoice,
      ) ||
      existing.stripeLatestInvoiceId ||
      null,
  };
}

async function findSubscription(
  prismaClient,
  subscriptionId,
) {
  const id = normalizeString(subscriptionId);

  if (!id) {
    throw createHttpError(
      "Buyer subscription id is required.",
      400,
    );
  }

  const subscription =
    await prismaClient.buyerSubscription.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

  if (!subscription) {
    throw createHttpError(
      "Buyer subscription not found.",
      404,
    );
  }

  return subscription;
}

async function updateSubscription(
  prismaClient,
  subscriptionId,
  data,
) {
  return prismaClient.buyerSubscription.update({
    where: { id: subscriptionId },
    data,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });
}

export async function executeBuyerSubscriptionLifecycle({
  subscriptionId,
  input,
  prismaClient = prisma,
  stripeClient = null,
}) {
  const action = normalizeAction(input?.action);
  const reason = normalizeReason(input?.reason);

  const existing = await findSubscription(
    prismaClient,
    subscriptionId,
  );

  if (action === "ADMIN_CORRECTION") {
    const update = {};

    if (
      existing.stripeSubscriptionId &&
      (
        input?.planCode !== undefined ||
        input?.status !== undefined ||
        input?.cancelAtPeriodEnd !== undefined
      )
    ) {
      throw createHttpError(
        "Stripe-backed subscriptions cannot receive local corrections. Synchronize from Stripe instead.",
        409,
      );
    }

    if (input?.planCode !== undefined) {
      update.plan = normalizePlanCode(input.planCode);
    }

    if (input?.status !== undefined) {
      update.status = normalizeStatus(input.status);
    }

    if (input?.cancelAtPeriodEnd !== undefined) {
      if (typeof input.cancelAtPeriodEnd !== "boolean") {
        throw createHttpError(
          "cancelAtPeriodEnd must be a boolean.",
          400,
        );
      }

      update.cancelAtPeriodEnd =
        input.cancelAtPeriodEnd;
    }

    if (Object.keys(update).length === 0) {
      throw createHttpError(
        "No administrative correction fields were supplied.",
        400,
      );
    }

    const subscription = await updateSubscription(
      prismaClient,
      existing.id,
      update,
    );

    return {
      action,
      reason,
      stripeApplied: false,
      subscription,
    };
  }

  if (!existing.stripeSubscriptionId) {
    if (action === "SYNC_FROM_STRIPE") {
      throw createHttpError(
        "This buyer subscription has no Stripe subscription id.",
        409,
      );
    }

    const subscription = await updateSubscription(
      prismaClient,
      existing.id,
      {
        cancelAtPeriodEnd:
          action === "CANCEL_AT_PERIOD_END",
      },
    );

    return {
      action,
      reason,
      stripeApplied: false,
      subscription,
    };
  }

  const stripe = stripeClient || getStripe();
  let stripeSubscription;

  if (action === "SYNC_FROM_STRIPE") {
    stripeSubscription =
      await stripe.subscriptions.retrieve(
        existing.stripeSubscriptionId,
      );
  } else {
    stripeSubscription =
      await stripe.subscriptions.update(
        existing.stripeSubscriptionId,
        {
          cancel_at_period_end:
            action === "CANCEL_AT_PERIOD_END",
        },
      );
  }

  const subscription = await updateSubscription(
    prismaClient,
    existing.id,
    mapStripeSubscriptionUpdate(
      stripeSubscription,
      existing,
    ),
  );

  return {
    action,
    reason,
    stripeApplied: true,
    subscription,
  };
}

export const BUYER_SUBSCRIPTION_LIFECYCLE_ACTIONS =
  Object.freeze([...LIFECYCLE_ACTIONS]);
