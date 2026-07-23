import {
  getMarketplaceTransaction,
  listMarketplacePurchases,
  listMarketplaceSales,
  reserveMarketplacePurchase,
  updateMarketplaceTransactionFulfillment,
} from "../services/marketplaceTransaction.service.js";

import {
  createMarketplaceTransactionPaymentIntent,
} from "../services/marketplaceTransactionPayment.service.js";

import {
  cancelMarketplaceTransactionReservation,
} from "../services/marketplaceTransactionReservationRelease.service.js";
import {
  acknowledgeCustomerSell,
  mutateCustomerSellFulfillment,
} from "../services/customerSellFulfillment.service.js";
import {
  completeCustomerSellWithOfflinePayment,
} from "../services/customerSellPayment.service.js";

function sendError(
  res,
  error,
  fallbackMessage = "Internal server error",
) {
  const statusCode =
    Number.isInteger(error?.statusCode) &&
    error.statusCode >= 400
      ? error.statusCode
      : 500;

  return res.status(statusCode).json({
    success: false,
    error: error?.message || fallbackMessage,
    ...(error?.code
      ? {
          code: error.code,
        }
      : {}),
  });
}

function getActor(req) {
  return {
    userId: req?.user?.sub,
    role: req?.user?.role,
  };
}

function idempotencyKey(req) {
  return req.get?.("Idempotency-Key") || req.body?.idempotencyKey;
}

async function runCustomerSellMutation(req, res, action) {
  try {
    const actor = getActor(req);
    const result = await mutateCustomerSellFulfillment({
      transactionId: req.params.id,
      action,
      actorUserId: actor.userId,
      actorRole: actor.role,
      idempotencyKey: idempotencyKey(req),
      ...(req.body || {}),
    });
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return sendError(res, error, "Unable to update customer sale");
  }
}

export const receiveCustomerSellItem = (req, res) => runCustomerSellMutation(req, res, "RECEIVE_ITEM");
export const startCustomerSellInspection = (req, res) => runCustomerSellMutation(req, res, "START_INSPECTION");
export const acceptCustomerSellOriginalPrice = (req, res) => runCustomerSellMutation(req, res, "ACCEPT_ORIGINAL_PRICE");
export const proposeCustomerSellRevisedPrice = (req, res) => runCustomerSellMutation(req, res, "PROPOSE_REVISED_PRICE");
export const acceptCustomerSellRevisedPrice = (req, res) => runCustomerSellMutation(req, res, "ACCEPT_REVISED_PRICE");
export const refuseCustomerSellRevisedPrice = (req, res) => runCustomerSellMutation(req, res, "REFUSE_REVISED_PRICE");
export const rejectCustomerSellItem = (req, res) => runCustomerSellMutation(req, res, "REJECT_ITEM");
export const returnCustomerSellItem = (req, res) => runCustomerSellMutation(req, res, "MARK_RETURNED");

export async function recordCustomerSellOfflinePayment(req, res) {
  try {
    const actor = getActor(req);
    const result = await completeCustomerSellWithOfflinePayment({
      transactionId: req.params.id,
      actorUserId: actor.userId,
      actorRole: actor.role,
      idempotencyKey: idempotencyKey(req),
      ...(req.body || {}),
    });
    return res.status(result.reused ? 200 : 201).json({ success: true, ...result });
  } catch (error) {
    return sendError(res, error, "Unable to record customer sale payment");
  }
}

export async function acknowledgeCompletedCustomerSell(req, res) {
  try {
    const actor = getActor(req);
    const result = await acknowledgeCustomerSell({
      transactionId: req.params.id,
      actorUserId: actor.userId,
      actorRole: actor.role,
      idempotencyKey: idempotencyKey(req),
    });
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return sendError(res, error, "Unable to acknowledge customer sale");
  }
}

export async function listMyMarketplacePurchases(
  req,
  res,
) {
  try {
    const { userId } = getActor(req);

    const result = await listMarketplacePurchases({
      userId,
      query: req.query || {},
    });

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "Unable to load marketplace purchases",
    );
  }
}

export async function listMyMarketplaceSales(
  req,
  res,
) {
  try {
    const { userId } = getActor(req);

    const result = await listMarketplaceSales({
      userId,
      query: req.query || {},
    });

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "Unable to load marketplace sales",
    );
  }
}

export async function createMarketplacePurchaseReservation(
  req,
  res,
) {
  try {
    const { userId } = getActor(req);

    const transaction =
      await reserveMarketplacePurchase({
        listingId: req.body?.listingId,
        buyerUserId: userId,
        buyerShopId:
          req.body?.buyerShopId || null,
        quantity: req.body?.quantity ?? 1,
      });

    return res.status(201).json({
      success: true,
      transaction,
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "Unable to reserve marketplace purchase",
    );
  }
}

export async function createMarketplacePaymentIntent(
  req,
  res,
) {
  try {
    const actor = getActor(req);

    const payment =
      await createMarketplaceTransactionPaymentIntent({
        transactionId: req.params.id,
        buyerUserId: actor.userId,
        role: actor.role,
      });

    return res
      .status(payment.reused ? 200 : 201)
      .json({
        success: true,
        ...payment,
      });
  } catch (error) {
    return sendError(
      res,
      error,
      "Unable to begin marketplace payment",
    );
  }
}

export async function cancelMarketplaceReservation(
  req,
  res,
) {
  try {
    const actor = getActor(req);

    const cancellation =
      await cancelMarketplaceTransactionReservation({
        transactionId: req.params.id,
        actorUserId: actor.userId,
        role: actor.role,
        reason:
          req.body?.reason ||
          "BUYER_CANCELED",
      });

    return res.status(200).json({
      success: true,
      ...cancellation,
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "Unable to cancel marketplace reservation",
    );
  }
}

export async function updateMarketplaceFulfillment(
  req,
  res,
) {
  try {
    const actor =
      getActor(
        req,
      );

    const result =
      await updateMarketplaceTransactionFulfillment({
        transactionId:
          req.params.id,

        actorUserId:
          actor.userId,

        role:
          actor.role,

        fulfillmentStatus:
          req.body
            ?.fulfillmentStatus,

        trackingNumber:
          req.body
            ?.trackingNumber,

        carrier:
          req.body
            ?.carrier,

        note:
          req.body
            ?.note,
      });

    return res
      .status(200)
      .json({
        success:
          true,

        ...result,
      });
  } catch (error) {
    return sendError(
      res,
      error,
      "Unable to update marketplace fulfillment",
    );
  }
}

export async function getMarketplaceTransactionById(
  req,
  res,
) {
  try {
    const actor = getActor(req);

    const transaction =
      await getMarketplaceTransaction({
        transactionId: req.params.id,
        ...actor,
      });

    return res.status(200).json({
      success: true,
      transaction,
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "Unable to load marketplace transaction",
    );
  }
}
