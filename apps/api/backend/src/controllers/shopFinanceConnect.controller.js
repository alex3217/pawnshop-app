import { prisma } from "../lib/prisma.js";
import { resolveShopAccess } from "../services/shopAccess.service.js";
import {
  buildStripeConnectStatus,
  createStripeConnectOnboardingLink,
  ensureStripeConnectAccount,
  isStripeConnectEnabled,
  refreshStripeConnectStatus,
} from "../services/stripeConnect.service.js";

function clean(value) {
  return String(value ?? "").trim();
}

function sendError(res, error, logger, operation) {
  const statusCode =
    Number.isInteger(error?.statusCode) && error.statusCode >= 400
      ? error.statusCode
      : 502;

  if (statusCode >= 500) {
    logger.error(`[shopFinanceConnect.${operation}]`, error);
  }

  return res.status(statusCode).json({
    success: false,
    error:
      statusCode >= 500
        ? "Stripe Connect is temporarily unavailable"
        : error?.message || "Request failed",
    ...(error?.code ? { code: error.code } : {}),
  });
}

function connectDisabled(res) {
  return res.status(503).json({
    success: false,
    error: "Stripe Connect is unavailable",
    code: "STRIPE_CONNECT_DISABLED",
  });
}

function statusResponse(shop, enabled) {
  return {
    success: true,
    connect: buildStripeConnectStatus(shop, enabled),
  };
}

export function createShopFinanceConnectControllers({
  prismaClient = prisma,
  resolveAccess = resolveShopAccess,
  connectEnabled = isStripeConnectEnabled,
  ensureAccount = ensureStripeConnectAccount,
  createOnboardingLink = createStripeConnectOnboardingLink,
  refreshStatus = refreshStripeConnectStatus,
  logger = console,
} = {}) {
  async function authorizedShop(req) {
    const shopId = clean(req?.params?.id);
    if (!shopId) {
      const error = new Error("Shop id is required");
      error.statusCode = 400;
      throw error;
    }

    const access = await resolveAccess({
      user: req?.user,
      shopId,
      prismaClient,
    });

    if (
      !access.authorized ||
      !["SHOP_OWNER", "ADMIN", "SUPER_ADMIN"].includes(access.source)
    ) {
      const error = new Error("Forbidden");
      error.statusCode = 403;
      throw error;
    }

    return prismaClient.pawnShop.findUnique({
      where: { id: access.shop.id },
    });
  }

  async function getStatus(req, res) {
    try {
      const shop = await authorizedShop(req);
      const enabled = connectEnabled();

      if (!enabled || !shop.stripeConnectAccountId) {
        return res.status(200).json(statusResponse(shop, enabled));
      }

      const updatedShop = await refreshStatus({
        shop,
        prismaClient,
      });
      return res.status(200).json(statusResponse(updatedShop, true));
    } catch (error) {
      return sendError(res, error, logger, "status");
    }
  }

  async function createAccount(req, res) {
    try {
      const shop = await authorizedShop(req);
      if (!connectEnabled()) return connectDisabled(res);

      const result = await ensureAccount({
        shop,
        prismaClient,
      });
      return res.status(result.created ? 201 : 200).json({
        ...statusResponse(result.shop, true),
        created: result.created,
      });
    } catch (error) {
      return sendError(res, error, logger, "account");
    }
  }

  async function onboardingLink(req, res) {
    try {
      const shop = await authorizedShop(req);
      if (!connectEnabled()) return connectDisabled(res);

      const result = await createOnboardingLink({
        shop,
        returnUrl: req?.body?.returnUrl,
        refreshUrl: req?.body?.refreshUrl,
        prismaClient,
      });

      return res.status(201).json({
        success: true,
        connect: buildStripeConnectStatus(result.shop, true),
        onboarding: {
          url: result.url,
          expiresAt: result.expiresAt,
        },
      });
    } catch (error) {
      return sendError(res, error, logger, "onboardingLink");
    }
  }

  return { getStatus, createAccount, onboardingLink };
}

const controllers = createShopFinanceConnectControllers();

export const getShopFinanceConnectStatus = controllers.getStatus;
export const createShopFinanceConnectAccount = controllers.createAccount;
export const createShopFinanceConnectOnboardingLink = controllers.onboardingLink;
