export async function appendMarketplaceTransactionEvent({
  tx,
  transactionId,
  fulfillmentId = null,
  actorUserId = null,
  actorRole = "SYSTEM",
  eventType,
  fromStatus = null,
  toStatus = null,
  idempotencyKey = null,
  data = undefined,
}) {
  return tx.marketplaceTransactionEvent.create({
    data: {
      transactionId,
      fulfillmentId,
      actorUserId,
      actorRole: String(actorRole || "SYSTEM").toUpperCase(),
      eventType,
      fromStatus,
      toStatus,
      idempotencyKey,
      ...(data === undefined ? {} : { data }),
    },
  });
}

export const SAFE_EVENT_SELECT = Object.freeze({
  id: true,
  actorUserId: true,
  actorRole: true,
  eventType: true,
  fromStatus: true,
  toStatus: true,
  data: true,
  createdAt: true,
});
