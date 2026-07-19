import {
  getMarketplaceTransaction,
  listMarketplacePurchases,
  listMarketplaceSales,
  reserveMarketplacePurchase,
} from "../services/marketplaceTransaction.service.js";

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
  });
}

function getActor(req) {
  return {
    userId: req?.user?.sub,
    role: req?.user?.role,
  };
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
