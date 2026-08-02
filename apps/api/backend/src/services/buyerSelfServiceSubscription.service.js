import { prisma } from "../lib/prisma.js";
import { getStripe } from "../lib/stripe.js";

export async function setAuthenticatedBuyerStripeCancellation({ userId, cancelAtPeriodEnd, prismaClient = prisma, stripeClient = null }) {
  const existing = await prismaClient.buyerSubscription.findUnique({ where: { userId } });
  if (!existing?.stripeSubscriptionId) { const error = new Error("No Stripe-backed buyer subscription is available to manage."); error.statusCode = 400; throw error; }
  const stripe = stripeClient || getStripe();
  const subscription = await stripe.subscriptions.update(existing.stripeSubscriptionId, { cancel_at_period_end: Boolean(cancelAtPeriodEnd) });
  return { pendingWebhookSync: true, cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end) };
}
