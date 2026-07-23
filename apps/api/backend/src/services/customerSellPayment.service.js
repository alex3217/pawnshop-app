import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { appendMarketplaceTransactionEvent } from "./marketplaceTransactionEvent.service.js";
import {
  assertCustomerSellActor,
  CUSTOMER_SELL_DETAIL_INCLUDE,
  workflowError,
} from "./customerSellFulfillment.service.js";

const MAX_ATTEMPTS = 3;
const METHODS = new Set(["CASH", "SHOP_CHECK"]);
const clean = (value) => String(value ?? "").trim();
const upper = (value) => clean(value).toUpperCase();

async function completeOnce(options) {
  const prismaClient = options.prismaClient || prisma;
  return prismaClient.$transaction(async (tx) => {
    const fulfillment = await tx.customerSellFulfillment.findUnique({
      where: { transactionId: clean(options.transactionId) },
      include: {
        ...CUSTOMER_SELL_DETAIL_INCLUDE,
        transaction: true,
        shop: { select: { id: true, name: true, address: true, ownerId: true, isDeleted: true, subscriptionStatus: true } },
        customer: { select: { id: true, name: true, isActive: true } },
      },
    });
    if (!fulfillment) throw workflowError("Customer sale fulfillment not found", 404, "CUSTOMER_SELL_NOT_FOUND");
    const actor = await assertCustomerSellActor({ tx, fulfillment, actorUserId: options.actorUserId, actorRole: options.actorRole });
    const key = clean(options.idempotencyKey);
    if (!key || key.length > 200) throw workflowError("idempotencyKey is required", 400, "CUSTOMER_SELL_INVALID_INPUT");
    const existingReceipt = await tx.customerSellReceipt.findUnique({ where: { transactionId: fulfillment.transactionId } });
    if (existingReceipt) {
      if (fulfillment.payment?.idempotencyKey && fulfillment.payment.idempotencyKey !== key) {
        throw workflowError("Customer sale is already completed");
      }
      return { fulfillment, payment: fulfillment.payment, receipt: existingReceipt, inventoryItemId: fulfillment.inventoryItemId, reused: true };
    }
    if (fulfillment.lifecycleStatus !== "READY_FOR_PAYMENT" || !fulfillment.finalAmount) {
      throw workflowError("Inspection and final-price acceptance are required before payment", 409, "CUSTOMER_SELL_NOT_READY_FOR_PAYMENT");
    }
    const method = upper(options.method);
    if (!METHODS.has(method)) throw workflowError("Only CASH and SHOP_CHECK are supported", 400, "CUSTOMER_SELL_PAYMENT_METHOD_UNSUPPORTED");
    const referenceNumber = clean(options.referenceNumber);
    if (method === "SHOP_CHECK" && !referenceNumber) {
      throw workflowError("A check/reference number is required", 400, "CUSTOMER_SELL_CHECK_REFERENCE_REQUIRED");
    }
    const amount = clean(options.amount);
    const currency = upper(options.currency);
    let amountMatches = false;
    try {
      amountMatches = new Prisma.Decimal(amount).equals(fulfillment.finalAmount);
    } catch {
      amountMatches = false;
    }
    if (!amountMatches || currency !== fulfillment.currency) {
      throw workflowError("Payment amount and currency must equal the final agreed amount", 409, "CUSTOMER_SELL_PAYMENT_MISMATCH");
    }
    if (options.intakeId && fulfillment.intakeId && options.intakeId !== fulfillment.intakeId) {
      throw workflowError("Intake does not match this customer sale", 409, "CUSTOMER_SELL_INTAKE_MISMATCH");
    }
    const evidenceUrls = Array.isArray(options.evidenceUrls) ? options.evidenceUrls.map(clean).filter(Boolean) : [];
    if (evidenceUrls.length > 10) throw workflowError("Too many evidence URLs", 400, "CUSTOMER_SELL_INVALID_INPUT");
    const now = new Date();
    const paymentUpdate = await tx.customerSellPayment.updateMany({
      where: { fulfillmentId: fulfillment.id, status: "PENDING", amount: fulfillment.finalAmount, currency: fulfillment.currency },
      data: { method, status: "COMPLETED", referenceNumber: referenceNumber || null, evidenceUrls, recordedByUserId: actor.user.id, idempotencyKey: key, recordedAt: now },
    });
    if (paymentUpdate.count !== 1) throw workflowError("Payment was completed concurrently");
    await tx.customerSellFulfillment.update({
      where: { id: fulfillment.id },
      data: { lifecycleStatus: "PAID", paidAt: now, lastActorUserId: actor.user.id, version: { increment: 1 } },
    });
    await appendMarketplaceTransactionEvent({
      tx, transactionId: fulfillment.transactionId, fulfillmentId: fulfillment.id,
      actorUserId: actor.user.id, actorRole: actor.role, eventType: "CUSTOMER_SELL_PAYMENT_RECORDED",
      fromStatus: "READY_FOR_PAYMENT", toStatus: "PAID", idempotencyKey: `${key}:payment`,
      data: { method, amount, currency, referenceNumber: referenceNumber || undefined },
    });

    let inventoryItem;
    if (options.inventoryItemId) {
      inventoryItem = await tx.item.findFirst({ where: { id: options.inventoryItemId, pawnShopId: fulfillment.shopId, isDeleted: false } });
      if (!inventoryItem) throw workflowError("Inventory item does not belong to this shop", 409, "CUSTOMER_SELL_INVENTORY_MISMATCH");
    } else {
      inventoryItem = await tx.item.create({
        data: {
          pawnShopId: fulfillment.shopId,
          title: fulfillment.submission.title,
          description: fulfillment.submission.description,
          category: fulfillment.submission.category,
          condition: fulfillment.observedCondition || fulfillment.submission.condition,
          price: fulfillment.finalAmount,
          currency: fulfillment.currency,
          images: fulfillment.submission.images,
          status: "AVAILABLE",
        },
      });
    }
    if (fulfillment.intakeId) {
      const intakeLink = await tx.itemIntake.updateMany({
        where: { id: fulfillment.intakeId, linkedSubmissionId: fulfillment.submissionId, shopId: fulfillment.shopId, customerId: fulfillment.customerId, destination: "CUSTOMER_SELL", OR: [{ linkedItemId: null }, { linkedItemId: inventoryItem.id }] },
        data: { linkedItemId: inventoryItem.id, status: "APPROVED" },
      });
      if (intakeLink.count !== 1) throw workflowError("Intake relationship changed", 409, "CUSTOMER_SELL_INTAKE_MISMATCH");
    }
    const payment = await tx.customerSellPayment.findUnique({ where: { fulfillmentId: fulfillment.id } });
    const snapshot = {
      transactionId: fulfillment.transactionId, submissionId: fulfillment.submissionId,
      submissionOfferId: fulfillment.submissionOfferId, shopId: fulfillment.shopId,
      customerId: fulfillment.customerId, inventoryItemId: inventoryItem.id,
      originalAmount: fulfillment.originalAmount.toFixed(2), finalAmount: fulfillment.finalAmount.toFixed(2),
      currency: fulfillment.currency, paymentMethod: method, paymentReferenceNumber: referenceNumber || null,
      revenuePolicy: fulfillment.revenuePolicy, platformFee: "0.00",
    };
    const receipt = await tx.customerSellReceipt.create({
      data: {
        transactionId: fulfillment.transactionId, fulfillmentId: fulfillment.id, paymentId: payment.id,
        shopId: fulfillment.shopId, customerId: fulfillment.customerId, submissionId: fulfillment.submissionId,
        submissionOfferId: fulfillment.submissionOfferId, inventoryItemId: inventoryItem.id,
        originalAmount: fulfillment.originalAmount, finalAmount: fulfillment.finalAmount, currency: fulfillment.currency,
        paymentMethod: method, paymentReferenceNumber: referenceNumber || null, shopName: fulfillment.shop.name,
        shopAddress: fulfillment.shop.address, customerName: fulfillment.customer.name, itemTitle: fulfillment.submission.title,
        observedCondition: fulfillment.observedCondition, verifiedSerial: fulfillment.verifiedSerial,
        revenuePolicy: fulfillment.revenuePolicy, platformFee: 0, completedByUserId: actor.user.id,
        completedByRole: actor.role, customerAcknowledgedAt: fulfillment.customerAcknowledgedAt, snapshot,
      },
    });
    await tx.customerSellFulfillment.update({
      where: { id: fulfillment.id },
      data: { lifecycleStatus: "COMPLETED", completedAt: now, inventoryItemId: inventoryItem.id, lastActorUserId: actor.user.id, version: { increment: 1 } },
    });
    await tx.marketplaceTransaction.update({
      where: { id: fulfillment.transactionId },
      data: { status: "COMPLETED", fulfillmentStatus: "COMPLETED", completedAt: now },
    });
    await appendMarketplaceTransactionEvent({
      tx, transactionId: fulfillment.transactionId, fulfillmentId: fulfillment.id,
      actorUserId: actor.user.id, actorRole: actor.role, eventType: "CUSTOMER_SELL_COMPLETED",
      fromStatus: "PAID", toStatus: "COMPLETED", idempotencyKey: `${key}:completed`,
      data: { receiptId: receipt.id, inventoryItemId: inventoryItem.id },
    });
    return {
      fulfillment: await tx.customerSellFulfillment.findUnique({ where: { id: fulfillment.id }, include: CUSTOMER_SELL_DETAIL_INCLUDE }),
      payment, receipt, inventoryItemId: inventoryItem.id, reused: false,
    };
  }, { isolationLevel: "Serializable" });
}

export async function completeCustomerSellWithOfflinePayment(options) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      return await completeOnce(options);
    } catch (error) {
      const retryable = error?.code === "P2034" || error?.code === "P2002";
      if (!retryable || attempt === MAX_ATTEMPTS - 1) throw error;
      const existing = await (options.prismaClient || prisma).customerSellReceipt.findUnique({ where: { transactionId: clean(options.transactionId) } });
      if (existing) return completeOnce(options);
    }
  }
}
