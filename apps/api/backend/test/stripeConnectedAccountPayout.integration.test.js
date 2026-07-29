import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";
import bcrypt from "bcryptjs";
import Stripe from "stripe";
import request from "supertest";

const DOMAIN = "@connect-payout.integration.pawnloop.test";
const WEBHOOK_SECRET = "whsec_connect_payout_integration_only";
let app;
let prisma;
let signer;

async function cleanup() {
  await prisma.stripeConnectedAccountPayoutEvent.deleteMany({
    where: { payout: { stripeAccountId: { startsWith: "acct_reconciliation_" } } },
  });
  await prisma.stripeConnectedAccountPayout.deleteMany({
    where: { stripeAccountId: { startsWith: "acct_reconciliation_" } },
  });
  const users = await prisma.user.findMany({
    where: { email: { endsWith: DOMAIN } },
    select: { id: true },
  });
  if (users.length) {
    await prisma.pawnShop.deleteMany({ where: { ownerId: { in: users.map(({ id }) => id) } } });
    await prisma.user.deleteMany({
      where: { id: { in: users.map(({ id }) => id) } },
    });
  }
}

async function fixture() {
  const owner = await prisma.user.create({
    data: {
      name: "Connect payout owner",
      email: `owner${DOMAIN}`,
      password: await bcrypt.hash("ConnectPayout123!", 4),
      role: "OWNER",
    },
  });
  const shop = await prisma.pawnShop.create({
    data: {
      name: "Connect payout shop",
      ownerId: owner.id,
      stripeConnectAccountId: "acct_reconciliation_known",
    },
  });
  return { owner, shop };
}

function stripeEvent(type, object, suffix, {
  account = "acct_reconciliation_known",
  created = 100,
} = {}) {
  return {
    id: `evt_connect_payout_${suffix}`,
    object: "event",
    account,
    api_version: "2025-01-27.acacia",
    created,
    data: { object },
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type,
  };
}

function payout(status = "pending", patch = {}) {
  return {
    id: "po_reconciliation_1",
    object: "payout",
    amount: 4200,
    currency: "usd",
    status,
    arrival_date: 200,
    created: 90,
    method: "standard",
    type: "bank_account",
    ...patch,
  };
}

async function send(event, secret = WEBHOOK_SECRET) {
  const payload = JSON.stringify(event);
  const signature = signer.webhooks.generateTestHeaderString({ payload, secret });
  return request(app)
    .post("/api/webhooks/stripe/connect")
    .set("Content-Type", "application/json")
    .set("stripe-signature", signature)
    .send(payload);
}

before(async () => {
  Object.assign(process.env, {
    NODE_ENV: "test",
    APP_ENV: "test",
    JWT_SECRET: "connect-payout-integration-jwt",
    STRIPE_SECRET_KEY: "sk_test_connect_payout_integration_only",
    STRIPE_CONNECT_WEBHOOK_SECRET: WEBHOOK_SECRET,
    AUCTION_SCHEDULER_ENABLED: "false",
  });
  const [prismaModule, appModule] = await Promise.all([
    import("../src/lib/prisma.js"),
    import("../src/app.js"),
  ]);
  prisma = prismaModule.prisma;
  app = appModule.createApp({ readinessCheck: async () => true });
  signer = new Stripe("sk_test_connect_payout_integration_only");
  await cleanup();
});

beforeEach(cleanup);
after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test("signed connected payout lifecycle returns 200 and reconciles idempotently", async () => {
  const { shop } = await fixture();
  assert.equal((await send(stripeEvent("payout.created", payout(), "created"))).status, 200);
  assert.equal((await send(stripeEvent(
    "payout.updated",
    payout("in_transit"),
    "updated",
    { created: 110 },
  ))).status, 200);
  const paidEvent = stripeEvent("payout.paid", payout("paid"), "paid", { created: 120 });
  assert.equal((await send(paidEvent)).status, 200);
  assert.equal((await send(paidEvent)).status, 200);

  const stored = await prisma.stripeConnectedAccountPayout.findUnique({
    where: { stripePayoutId: "po_reconciliation_1" },
    include: { events: true },
  });
  assert.equal(stored.shopId, shop.id);
  assert.equal(stored.status, "paid");
  assert.ok(stored.paidAt);
  assert.equal(stored.events.length, 3);
});

test("failed payout stores failure details and an older event cannot overwrite it", async () => {
  await fixture();
  assert.equal((await send(stripeEvent(
    "payout.failed",
    payout("failed", {
      id: "po_reconciliation_failed",
      failure_code: "account_closed",
      failure_message: "The bank account is closed",
    }),
    "failed",
    { created: 200 },
  ))).status, 200);
  assert.equal((await send(stripeEvent(
    "payout.created",
    payout("pending", { id: "po_reconciliation_failed" }),
    "older",
    { created: 100 },
  ))).status, 200);
  const stored = await prisma.stripeConnectedAccountPayout.findUnique({
    where: { stripePayoutId: "po_reconciliation_failed" },
  });
  assert.equal(stored.status, "failed");
  assert.equal(stored.failureCode, "account_closed");
  assert.equal(stored.failureMessage, "The bank account is closed");
  assert.ok(stored.failedAt);
});

test("missing account and invalid signatures are rejected", async () => {
  await fixture();
  assert.equal((await send(stripeEvent(
    "payout.created",
    payout(),
    "missing_account",
    { account: "" },
  ))).status, 400);
  assert.equal((await send(
    stripeEvent("payout.created", payout(), "bad_signature"),
    "whsec_wrong",
  )).status, 400);
});

test("unknown connected accounts are recorded without a false shop association", async () => {
  await fixture();
  assert.equal((await send(stripeEvent(
    "payout.created",
    payout("pending", { id: "po_reconciliation_unknown" }),
    "unknown",
    { account: "acct_reconciliation_unknown" },
  ))).status, 200);
  const stored = await prisma.stripeConnectedAccountPayout.findUnique({
    where: { stripePayoutId: "po_reconciliation_unknown" },
  });
  assert.equal(stored.shopId, null);
  assert.equal(stored.stripeAccountId, "acct_reconciliation_unknown");
});
