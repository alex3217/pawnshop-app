import { getStripe } from "../lib/stripe.js";
import { prisma } from "../lib/prisma.js";
import { resolveShopAccess } from "./shopAccess.service.js";
import { createHash } from "node:crypto";

function error(message, statusCode = 400, code = "PAYMENT_METHOD_ERROR") { const value = new Error(message); value.statusCode = statusCode; value.code = code; return value; }
const clean = (value) => String(value ?? "").trim();
const activeStatuses = new Set(["ACTIVE", "TRIALING", "PAST_DUE", "INCOMPLETE"]);
const setupKey = (subjectId, requestId) => createHash("sha256").update(`payment-method-setup:${subjectId}:${clean(requestId)}`).digest("hex");

export function safePaymentMethod(method, defaultId = null, now = new Date()) {
  const card = method?.card;
  const bank = method?.us_bank_account;
  const details = card || bank || {};
  const expired = Boolean(card && (Number(card.exp_year) < now.getUTCFullYear() || (Number(card.exp_year) === now.getUTCFullYear() && Number(card.exp_month) < now.getUTCMonth() + 1)));
  return { id: clean(method?.id), type: card ? "CARD" : bank ? "US_BANK_ACCOUNT" : clean(method?.type).toUpperCase(), brand: clean(card?.brand || bank?.bank_name) || null, last4: clean(details.last4) || null, expMonth: card?.exp_month || null, expYear: card?.exp_year || null, funding: clean(card?.funding) || null, default: clean(method?.id) === clean(defaultId), expired, status: expired ? "EXPIRED" : "READY" };
}

export function createPaymentMethodsService({ prismaClient = prisma, stripeClient, resolveAccess = resolveShopAccess } = {}) {
  const stripe = () => stripeClient || getStripe();
  async function profile({ user, shopId, createCustomer = false }) {
    const userId = clean(user?.sub || user?.id || user?.userId);
    if (!userId) throw error("Authentication required", 401, "UNAUTHORIZED");
    let subject;
    if (shopId) {
      const access = await resolveAccess({ user, shopId: clean(shopId), prismaClient });
      if (!access.authorized || access.source !== "SHOP_OWNER") throw error("Only the shop owner can manage billing methods", 403, "FORBIDDEN");
      subject = await prismaClient.pawnShop.findUnique({ where: { id: access.shop.id } });
      if (!subject || subject.isDeleted) throw error("Shop not found", 404, "NOT_FOUND");
    } else {
      subject = await prismaClient.user.findUnique({ where: { id: userId }, include: { buyerSubscription: true } });
      if (!subject) throw error("User not found", 404, "NOT_FOUND");
    }
    let customerId = clean(shopId ? subject.stripeCustomerId : subject.stripeCustomerId || subject.buyerSubscription?.stripeCustomerId);
    if (!customerId && createCustomer) {
      const customer = await stripe().customers.create({ email: shopId ? undefined : subject.email, name: subject.name, metadata: shopId ? { pawnShopId: subject.id, pawnShopOwnerId: userId, billingProfile: "SHOP" } : { pawnloopUserId: userId, billingProfile: "BUYER" } }, { idempotencyKey: shopId ? `pawnloop-shop-customer-${subject.id}` : `pawnloop-user-customer-${userId}` });
      customerId = clean(customer.id);
      if (shopId) await prismaClient.pawnShop.update({ where: { id: subject.id }, data: { stripeCustomerId: customerId } });
      else await prismaClient.user.update({ where: { id: userId }, data: { stripeCustomerId: customerId } });
    }
    return { userId, shopId: shopId ? subject.id : null, subject, customerId };
  }
  async function listMethods(args) {
    const value = await profile(args);
    if (!value.customerId) return { methods: [], defaultPaymentMethodId: null, syncStatus: "NOT_CONFIGURED" };
    const customer = await stripe().customers.retrieve(value.customerId);
    if (customer?.deleted) throw error("Stripe customer is unavailable", 409, "CUSTOMER_DELETED");
    const [cards, banks] = await Promise.all([stripe().paymentMethods.list({ customer: value.customerId, type: "card", limit: 100 }), stripe().paymentMethods.list({ customer: value.customerId, type: "us_bank_account", limit: 100 })]);
    const defaultId = clean(customer?.invoice_settings?.default_payment_method);
    const methods = [...(cards.data || []), ...(banks.data || [])].map((method) => safePaymentMethod(method, defaultId));
    const primary = methods.find((method) => method.default) || methods[0] || null;
    const safeState = { billingMethodPresent: Boolean(primary), billingMethodBrand: primary?.brand || null, billingMethodLast4: primary?.last4 || null, billingMethodExpMonth: primary?.expMonth || null, billingMethodExpYear: primary?.expYear || null, billingMethodStatus: primary?.status || "NOT_CONFIGURED", billingMethodSyncedAt: new Date() };
    if (value.shopId) await prismaClient.pawnShop.update({ where: { id: value.shopId }, data: safeState }); else await prismaClient.user.update({ where: { id: value.userId }, data: safeState });
    return { methods, defaultPaymentMethodId: defaultId || null, syncStatus: "SYNCED" };
  }
  async function createSetupSession({ user, shopId, successUrl, cancelUrl, consent, requestId, ipAddress, userAgent }) {
    if (consent?.accepted !== true || !clean(consent?.termsVersion)) throw error("Consent to future and off-session charges is required", 400, "CONSENT_REQUIRED");
    if (!clean(requestId)) throw error("An idempotency key is required", 400, "IDEMPOTENCY_KEY_REQUIRED");
    const value = await profile({ user, shopId, createCustomer: true });
    const idempotencyKey = setupKey(value.shopId || value.userId, requestId);
    let evidence = await prismaClient.paymentMethodConsent.findUnique({ where: { idempotencyKey } });
    if (evidence && (evidence.userId !== value.userId || clean(evidence.shopId) !== clean(value.shopId) || evidence.stripeCustomerId !== value.customerId)) throw error("Setup request ownership mismatch", 409, "SETUP_OWNERSHIP_MISMATCH");
    if (evidence?.stripeCheckoutSessionId) {
      const existing = await stripe().checkout.sessions.retrieve(evidence.stripeCheckoutSessionId);
      return { url: existing.url, sessionId: existing.id };
    }
    if (!evidence) evidence = await prismaClient.paymentMethodConsent.create({ data: { idempotencyKey, userId: value.userId, shopId: value.shopId, stripeCustomerId: value.customerId, termsVersion: clean(consent.termsVersion), consentText: "I authorize PawnLoop and Stripe to store this payment method and use it for future or off-session charges I authorize.", consentedAt: new Date(), ipAddress: clean(ipAddress) || null, userAgent: clean(userAgent) || null, status: "PENDING" } });
    const session = await stripe().checkout.sessions.create({ mode: "setup", customer: value.customerId, success_url: successUrl, cancel_url: cancelUrl, payment_method_types: ["card", "us_bank_account"], client_reference_id: value.shopId || value.userId, metadata: { pawnloopUserId: value.userId, pawnShopId: value.shopId || "", billingProfile: value.shopId ? "SHOP" : "BUYER", paymentMethodConsentId: evidence.id, consentTermsVersion: clean(consent.termsVersion) } }, { idempotencyKey: clean(requestId) });
    await prismaClient.paymentMethodConsent.update({ where: { id: evidence.id }, data: { stripeCheckoutSessionId: session.id, status: "PENDING" } });
    return { url: session.url, sessionId: session.id };
  }
  async function ownedMethod(value, paymentMethodId) {
    const method = await stripe().paymentMethods.retrieve(clean(paymentMethodId));
    if (clean(method?.customer) !== value.customerId) throw error("Payment method not found", 404, "NOT_FOUND");
    return method;
  }
  async function setDefault({ user, shopId, paymentMethodId }) { const value = await profile({ user, shopId }); if (!value.customerId) throw error("No billing profile", 404); await ownedMethod(value, paymentMethodId); await stripe().customers.update(value.customerId, { invoice_settings: { default_payment_method: clean(paymentMethodId) } }); return listMethods({ user, shopId }); }
  async function remove({ user, shopId, paymentMethodId }) {
    const value = await profile({ user, shopId }); if (!value.customerId) throw error("No billing profile", 404); await ownedMethod(value, paymentMethodId);
    const listed = await listMethods({ user, shopId });
    const status = shopId ? clean(value.subject.subscriptionStatus).toUpperCase() : clean(value.subject.buyerSubscription?.status).toUpperCase();
    const eligibleRemaining = listed.methods.filter((method) => method.id !== clean(paymentMethodId) && !method.expired && method.status === "READY");
    if (activeStatuses.has(status) && eligibleRemaining.length === 0) throw error("The only eligible payment method supporting an active subscription cannot be removed", 409, "ACTIVE_SUBSCRIPTION_REQUIRES_METHOD");
    await stripe().paymentMethods.detach(clean(paymentMethodId)); return listMethods({ user, shopId });
  }
  async function portal({ user, shopId, returnUrl }) { const value = await profile({ user, shopId }); if (!value.customerId) throw error("No Stripe billing profile is configured", 409, "NOT_CONFIGURED"); const session = await stripe().billingPortal.sessions.create({ customer: value.customerId, return_url: returnUrl }); return { url: session.url }; }
  return { profile, listMethods, createSetupSession, setDefault, remove, portal };
}

export const paymentMethodsService = createPaymentMethodsService();
