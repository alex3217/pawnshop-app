import { getStripe } from "../lib/stripe.js";
import { prisma } from "../lib/prisma.js";

const CONNECT_TRUE_VALUES = new Set(["1", "true", "enabled", "on"]);

function clean(value) {
  return String(value ?? "").trim();
}

function httpError(message, statusCode, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  return error;
}

export function isStripeConnectEnabled(value) {
  const configured = arguments.length === 0 ? process.env.STRIPE_CONNECT_ENABLED : value;
  return CONNECT_TRUE_VALUES.has(clean(configured).toLowerCase());
}

export function normalizeStripeConnectAccount(account) {
  return {
    detailsSubmitted: Boolean(account?.details_submitted),
    chargesEnabled: Boolean(account?.charges_enabled),
    payoutsEnabled: Boolean(account?.payouts_enabled),
  };
}

export function normalizeStripeConnectSafeDetails(account) {
  const candidate = account?.external_accounts?.data?.[0];
  const external = candidate && typeof candidate === "object" ? candidate : null;
  return {
    requirements: {
      currentlyDue: Array.isArray(account?.requirements?.currently_due) ? account.requirements.currently_due.map(String) : [],
      eventuallyDue: Array.isArray(account?.requirements?.eventually_due) ? account.requirements.eventually_due.map(String) : [],
      pastDue: Array.isArray(account?.requirements?.past_due) ? account.requirements.past_due.map(String) : [],
      disabledReason: clean(account?.requirements?.disabled_reason) || null,
    },
    payoutSchedule: account?.settings?.payouts?.schedule ? { interval: clean(account.settings.payouts.schedule.interval) || null, delayDays: account.settings.payouts.schedule.delay_days ?? null } : null,
    externalAccount: external ? { type: clean(external.object).toUpperCase(), bankName: clean(external.bank_name) || null, brand: clean(external.brand) || null, last4: clean(external.last4) || null, status: clean(external.status).toUpperCase() || null } : null,
  };
}

export function buildStripeConnectStatus(shop, enabled = isStripeConnectEnabled()) {
  const hasAccount = Boolean(clean(shop?.stripeConnectAccountId));
  const detailsSubmitted = Boolean(shop?.stripeConnectDetailsSubmitted);
  const chargesEnabled = Boolean(shop?.stripeConnectChargesEnabled);
  const payoutsEnabled = Boolean(shop?.stripeConnectPayoutsEnabled);

  let state = "NOT_STARTED";
  if (!enabled) state = "DISABLED";
  else if (!hasAccount) state = "NOT_STARTED";
  else if (payoutsEnabled) state = "PAYOUTS_ENABLED";
  else if (!detailsSubmitted) state = "SETUP_INCOMPLETE";
  else state = "RESTRICTED";

  return {
    enabled: Boolean(enabled),
    state,
    hasAccount,
    detailsSubmitted,
    chargesEnabled,
    payoutsEnabled,
    onboardingCompletedAt:
      shop?.stripeConnectOnboardingCompletedAt instanceof Date
        ? shop.stripeConnectOnboardingCompletedAt.toISOString()
        : shop?.stripeConnectOnboardingCompletedAt || null,
    statusUpdatedAt:
      shop?.stripeConnectStatusUpdatedAt instanceof Date
        ? shop.stripeConnectStatusUpdatedAt.toISOString()
        : shop?.stripeConnectStatusUpdatedAt || null,
    requirements: shop?.safeConnectDetails?.requirements || { currentlyDue: [], eventuallyDue: [], pastDue: [], disabledReason: null },
    payoutSchedule: shop?.safeConnectDetails?.payoutSchedule || null,
    externalAccount: shop?.safeConnectDetails?.externalAccount || null,
  };
}

function configuredOrigins() {
  return [
    process.env.FRONTEND_URL,
    process.env.WEB_URL,
    process.env.CORS_ORIGIN,
    process.env.CORS_ORIGINS,
  ]
    .flatMap((value) => clean(value).split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

export function validateStripeConnectReturnUrl(
  value,
  fieldName,
  { allowedOrigins = configuredOrigins() } = {},
) {
  const raw = clean(value);
  if (!raw) throw httpError(`${fieldName} is required`, 400, "INVALID_CONNECT_URL");

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw httpError(`Invalid ${fieldName}`, 400, "INVALID_CONNECT_URL");
  }

  const schemeSeparator = raw.indexOf("://");
  const authorityStart = schemeSeparator + 3;
  const authorityEndCandidate = raw.slice(authorityStart).search(/[/?#]/);
  const authorityEnd = authorityEndCandidate === -1
    ? raw.length
    : authorityStart + authorityEndCandidate;
  const rawAuthority = raw.slice(authorityStart, authorityEnd);

  // Do not let URL normalization turn an encoded or backslash-obfuscated host
  // into a trusted origin after validation. Percent-encoding remains valid in
  // the path and query, where checkout state is expected.
  if (schemeSeparator <= 0 || /[%\\]/.test(rawAuthority)) {
    throw httpError(`Invalid ${fieldName}`, 400, "INVALID_CONNECT_URL");
  }

  const isLocalHttp =
    parsed.protocol === "http:" &&
    ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);

  if (parsed.protocol !== "https:" && !isLocalHttp) {
    throw httpError(
      `${fieldName} must use HTTPS (HTTP is allowed only for localhost)`,
      400,
      "INVALID_CONNECT_URL",
    );
  }

  if (parsed.username || parsed.password || parsed.hash) {
    throw httpError(`Invalid ${fieldName}`, 400, "INVALID_CONNECT_URL");
  }

  const trustedOrigins = new Set();
  for (const candidate of allowedOrigins) {
    try {
      trustedOrigins.add(new URL(candidate).origin);
    } catch {
      // Ignore malformed server configuration rather than trusting it.
    }
  }

  if (!trustedOrigins.has(parsed.origin)) {
    throw httpError(
      `${fieldName} origin is not allowed`,
      400,
      "INVALID_CONNECT_URL",
    );
  }

  return parsed.toString();
}

export async function syncStripeConnectAccountStatus({
  shop,
  account,
  prismaClient = prisma,
  now = new Date(),
}) {
  const normalized = normalizeStripeConnectAccount(account);
  const completedAt =
    normalized.detailsSubmitted &&
    !shop?.stripeConnectOnboardingCompletedAt
      ? now
      : shop?.stripeConnectOnboardingCompletedAt || null;

  return prismaClient.pawnShop.update({
    where: { id: shop.id },
    data: {
      stripeConnectDetailsSubmitted: normalized.detailsSubmitted,
      stripeConnectChargesEnabled: normalized.chargesEnabled,
      stripeConnectPayoutsEnabled: normalized.payoutsEnabled,
      stripeConnectOnboardingCompletedAt: completedAt,
      stripeConnectStatusUpdatedAt: now,
    },
  });
}

export async function refreshStripeConnectStatus({
  shop,
  prismaClient = prisma,
  stripeClient,
}) {
  if (!shop.stripeConnectAccountId) return shop;
  const stripe = stripeClient || getStripe();
  const account = await stripe.accounts.retrieve(shop.stripeConnectAccountId);
  const updated = await syncStripeConnectAccountStatus({
    shop,
    account,
    prismaClient,
  });
  return { ...updated, safeConnectDetails: normalizeStripeConnectSafeDetails(account) };
}

export async function ensureStripeConnectAccount({
  shop,
  prismaClient = prisma,
  stripeClient,
}) {
  const stripe = stripeClient || getStripe();

  if (shop.stripeConnectAccountId) {
    const account = await stripe.accounts.retrieve(shop.stripeConnectAccountId);
    const updatedShop = await syncStripeConnectAccountStatus({
      shop,
      account,
      prismaClient,
    });
    return { shop: { ...updatedShop, safeConnectDetails: normalizeStripeConnectSafeDetails(account) }, created: false };
  }

  const account = await stripe.accounts.create(
    {
      type: "express",
      metadata: {
        pawnShopId: String(shop.id),
        pawnShopOwnerId: String(shop.ownerId),
      },
    },
    {
      idempotencyKey: `pawnshop-connect-account-${shop.id}`,
    },
  );

  const linkedShop = await prismaClient.pawnShop.update({
    where: { id: shop.id },
    data: { stripeConnectAccountId: String(account.id) },
  });
  const updatedShop = await syncStripeConnectAccountStatus({
    shop: linkedShop,
    account,
    prismaClient,
  });

  return { shop: { ...updatedShop, safeConnectDetails: normalizeStripeConnectSafeDetails(account) }, created: true };
}

export async function createStripeConnectOnboardingLink({
  shop,
  returnUrl,
  refreshUrl,
  prismaClient = prisma,
  stripeClient,
  allowedOrigins,
}) {
  const safeReturnUrl = validateStripeConnectReturnUrl(returnUrl, "returnUrl", {
    allowedOrigins,
  });
  const safeRefreshUrl = validateStripeConnectReturnUrl(refreshUrl, "refreshUrl", {
    allowedOrigins,
  });
  const ensured = await ensureStripeConnectAccount({
    shop,
    prismaClient,
    stripeClient,
  });
  const stripe = stripeClient || getStripe();
  const link = await stripe.accountLinks.create({
    account: ensured.shop.stripeConnectAccountId,
    return_url: safeReturnUrl,
    refresh_url: safeRefreshUrl,
    type: "account_onboarding",
  });

  return {
    shop: ensured.shop,
    url: link.url,
    expiresAt: Number.isFinite(Number(link.expires_at))
      ? new Date(Number(link.expires_at) * 1000).toISOString()
      : null,
  };
}

export async function syncStripeConnectAccountUpdated({
  account,
  prismaClient = prisma,
  now = new Date(),
}) {
  const accountId = clean(account?.id);
  if (!accountId) return { matched: false };

  const shop = await prismaClient.pawnShop.findUnique({
    where: { stripeConnectAccountId: accountId },
  });
  if (!shop || shop.isDeleted) return { matched: false };

  const updatedShop = await syncStripeConnectAccountStatus({
    shop,
    account,
    prismaClient,
    now,
  });
  return { matched: true, shop: updatedShop };
}
