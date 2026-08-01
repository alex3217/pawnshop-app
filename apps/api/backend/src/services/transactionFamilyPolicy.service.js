export const TRANSACTION_FAMILIES = Object.freeze({
  RETAIL: "RETAIL_BUYER_TO_SHOP",
  CUSTOMER_SELL: "CUSTOMER_SELL_TO_SHOP",
  CUSTOMER_PAWN: "CUSTOMER_PAWN_TO_SHOP",
  DEALER: "DEALER_SHOP_TO_SHOP",
  COMMUNITY: "COMMUNITY_CUSTOMER_TO_CUSTOMER",
});

const POLICIES = Object.freeze({
  [TRANSACTION_FAMILIES.RETAIL]: Object.freeze({ buyerType: "CUSTOMER", sellerType: "SHOP", paymentRequired: true, inspectionRequired: false, delayedReleaseRequired: false, stripeChargeModel: "SEPARATE_CHARGE_AND_TRANSFER", refundSupport: true, disputeSupport: true, transferEligible: true, staffPermissions: ["settlements:read"], ownerApproval: false, enabled: true }),
  [TRANSACTION_FAMILIES.CUSTOMER_SELL]: Object.freeze({ buyerType: "SHOP", sellerType: "CUSTOMER", paymentRequired: false, inspectionRequired: true, delayedReleaseRequired: false, stripeChargeModel: "NONE_OFFLINE_IN_PERSON_V1", refundSupport: false, disputeSupport: false, transferEligible: false, staffPermissions: ["customer-sell:read", "customer-sell:write"], ownerApproval: true, enabled: true }),
  [TRANSACTION_FAMILIES.CUSTOMER_PAWN]: Object.freeze({ buyerType: "SHOP", sellerType: "CUSTOMER", paymentRequired: false, inspectionRequired: true, delayedReleaseRequired: false, stripeChargeModel: "NONE_INQUIRY_ONLY", refundSupport: false, disputeSupport: false, transferEligible: false, staffPermissions: ["customer-sell:read", "customer-sell:write"], ownerApproval: true, enabled: true }),
  [TRANSACTION_FAMILIES.DEALER]: Object.freeze({ buyerType: "SHOP", sellerType: "SHOP", paymentRequired: true, inspectionRequired: true, delayedReleaseRequired: true, stripeChargeModel: "SEPARATE_CHARGE_AND_TRANSFER", refundSupport: true, disputeSupport: true, transferEligible: true, staffPermissions: ["dealer-marketplace:read", "dealer-marketplace:buy", "dealer-marketplace:sell", "dealer-marketplace:approve", "dealer-marketplace:finance", "dealer-marketplace:dispute"], ownerApproval: true, enabled: true }),
  [TRANSACTION_FAMILIES.COMMUNITY]: Object.freeze({ buyerType: "CUSTOMER", sellerType: "CUSTOMER", paymentRequired: true, inspectionRequired: true, delayedReleaseRequired: true, stripeChargeModel: "NOT_APPROVED", refundSupport: false, disputeSupport: false, transferEligible: false, staffPermissions: [], ownerApproval: false, enabled: false, reason: "Separate verification, fraud, policy, and legal approval required" }),
});

function normalized(value) { return String(value || "").trim().toUpperCase(); }

export function resolveTransactionFamily(record = {}) {
  const explicit = normalized(record.transactionFamily || record.family || record.metadata?.transactionFamily);
  if (Object.values(TRANSACTION_FAMILIES).includes(explicit)) return explicit;

  const type = normalized(record.type || record.transactionType);
  const listingType = normalized(record.listingType || record.listing?.listingType);
  const intent = normalized(record.intent || record.submission?.intent);

  if (type === "DEALER_TRANSFER" || listingType === "SHOP_TO_SHOP") return TRANSACTION_FAMILIES.DEALER;
  if (type === "CUSTOMER_SELL_TO_SHOP") return intent.includes("PAWN") && !intent.includes("SELL") ? TRANSACTION_FAMILIES.CUSTOMER_PAWN : TRANSACTION_FAMILIES.CUSTOMER_SELL;
  if (listingType === "CUSTOMER_TO_SHOP") return intent.includes("PAWN") ? TRANSACTION_FAMILIES.CUSTOMER_PAWN : TRANSACTION_FAMILIES.CUSTOMER_SELL;
  if (listingType === "CUSTOMER_TO_CUSTOMER") return TRANSACTION_FAMILIES.COMMUNITY;
  if (["DIRECT_PURCHASE", "ACCEPTED_OFFER"].includes(type) || listingType === "SHOP_TO_CUSTOMER") return TRANSACTION_FAMILIES.RETAIL;
  throw Object.assign(new Error("Unable to resolve transaction family"), { statusCode: 422, code: "TRANSACTION_FAMILY_UNRESOLVED" });
}

export function getTransactionFamilyPolicy(recordOrFamily) {
  const family = typeof recordOrFamily === "string" && POLICIES[recordOrFamily] ? recordOrFamily : resolveTransactionFamily(recordOrFamily);
  return { family, ...POLICIES[family] };
}

export function getCommunityMarketplaceAvailability() {
  const policy = getTransactionFamilyPolicy(TRANSACTION_FAMILIES.COMMUNITY);
  return { enabled: policy.enabled, reason: policy.reason };
}
