import { paymentMethodsService } from "../services/paymentMethods.service.js";
import { validateStripeConnectReturnUrl } from "../services/stripeConnect.service.js";

function shopId(req) { const value = String(req.query?.shopId || req.body?.shopId || "").trim(); return value || null; }
function sendError(res, cause) { const status = Number.isInteger(cause?.statusCode) ? cause.statusCode : 502; return res.status(status).json({ success: false, error: status >= 500 ? "Stripe billing is temporarily unavailable" : cause.message, ...(cause?.code ? { code: cause.code } : {}) }); }
const context = (req) => ({ user: req.user, shopId: shopId(req) });

export async function listPaymentMethods(req, res) { try { return res.json({ success: true, ...(await paymentMethodsService.listMethods(context(req))) }); } catch (cause) { return sendError(res, cause); } }
export async function createPaymentMethodSetupSession(req, res) { try { const successUrl = validateStripeConnectReturnUrl(req.body?.successUrl, "successUrl"); const cancelUrl = validateStripeConnectReturnUrl(req.body?.cancelUrl, "cancelUrl"); const result = await paymentMethodsService.createSetupSession({ ...context(req), successUrl, cancelUrl, consent: req.body?.consent, requestId: req.headers["idempotency-key"] || req.id, ipAddress: req.ip, userAgent: req.get?.("user-agent") }); return res.status(201).json({ success: true, ...result }); } catch (cause) { return sendError(res, cause); } }
export async function setDefaultPaymentMethod(req, res) { try { return res.json({ success: true, ...(await paymentMethodsService.setDefault({ ...context(req), paymentMethodId: req.params.id })) }); } catch (cause) { return sendError(res, cause); } }
export async function removePaymentMethod(req, res) { try { return res.json({ success: true, ...(await paymentMethodsService.remove({ ...context(req), paymentMethodId: req.params.id })) }); } catch (cause) { return sendError(res, cause); } }
export async function createBillingPortalSession(req, res) { try { const returnUrl = validateStripeConnectReturnUrl(req.body?.returnUrl, "returnUrl"); return res.status(201).json({ success: true, ...(await paymentMethodsService.portal({ ...context(req), returnUrl })) }); } catch (cause) { return sendError(res, cause); } }
