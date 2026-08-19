import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import request from "supertest";
import { issueMfaStepUpProof } from "./helpers/mfaStepUp.fixture.js";
import { validateIntegrationTestDatabase } from "./helpers/databaseSafety.fixture.js";

const DOMAIN = "@owner-onboarding-progress.integration.test";
const JWT_SECRET = "owner-onboarding-progress-test-secret-only";
let app;
let prisma;
let token;
let ownerId;

function authenticated(httpRequest) {
  return httpRequest.set("Authorization", `Bearer ${token}`);
}

async function progress(shopId) {
  const response = await authenticated(request(app).get(`/api/shops/${shopId}/onboarding/progress`));
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return {
    ...response.body,
    completionById: Object.fromEntries(response.body.items.map((item) => [item.id, item.complete])),
  };
}

before(async () => {
  Object.assign(process.env, { NODE_ENV: "test", APP_ENV: "test", JWT_SECRET, AUCTION_SCHEDULER_ENABLED: "false" });
  validateIntegrationTestDatabase();
  ({ createApp: app } = await import("../src/app.js"));
  app = app();
  app.locals.shopGeocoder = {
    geocode: async (address) => ({
      address,
      latitude: 41.88,
      longitude: -87.63,
    }),
  };
  ({ prisma } = await import("../src/lib/prisma.js"));

  const email = `owner${DOMAIN}`;
  await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } });
  const registration = await request(app).post("/api/auth/register").send({
    name: "Onboarding Owner", email, password: "OwnerProgress123!", role: "OWNER",
    legalConsent: { accepted: true, termsVersion: "2026-07-28", privacyVersion: "2026-07-28" },
  });
  assert.equal(registration.status, 201, JSON.stringify(registration.body));
  const user = await prisma.user.update({ where: { email }, data: { emailVerifiedAt: new Date() } });
  ownerId = user.id;
  await prisma.ownerApplication.update({ where: { ownerId }, data: { status: "APPROVED" } });
  const login = await request(app).post("/api/auth/login").send({ email, password: "OwnerProgress123!" });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  token = login.body.token;
});

after(async () => {
  if (!prisma || !ownerId) return;
  const shops = await prisma.pawnShop.findMany({ where: { ownerId }, select: { id: true } });
  const shopIds = shops.map((shop) => shop.id);
  await prisma.item.deleteMany({ where: { pawnShopId: { in: shopIds } } });
  await prisma.staff.deleteMany({ where: { shopId: { in: shopIds } } });
  await prisma.pawnShop.deleteMany({ where: { id: { in: shopIds } } });
  await prisma.ownerApplication.deleteMany({ where: { ownerId } });
  await prisma.legalConsent.deleteMany({ where: { userId: ownerId } });
  await prisma.user.delete({ where: { id: ownerId } });
  await prisma.$disconnect();
});

test("all nine checklist destinations persist the facts used by progress", async () => {
  const created = await authenticated(request(app).post("/api/shops")).send({ name: "Progress Shop" });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const shopId = created.body.id;
  let result = await progress(shopId);
  let state = result.completionById;
  assert.equal(state["shop-created"], true);
  assert.equal(state["shop-name"], true);
  assert.equal(state["seller-plan"], true, "default FREE plan should require no paid subscription record");
  assert.equal(result.completedCount, 3);
  assert.equal(result.totalCount, 9);

  for (const [field, itemId, value] of [
    ["address", "shop-address", "100 Progress Lane"],
    ["phone", "shop-phone", "555-0199"],
    ["hours", "shop-hours", "Mon-Fri 9-5"],
    ["description", "shop-description", "A persisted onboarding description"],
  ]) {
    const payload = field === "address"
      ? { address: value, city: "Chicago", state: "IL", zip: "60601", country: "US" }
      : { [field]: value };
    const saved = await authenticated(request(app).patch(`/api/locations/${shopId}`)).send(payload);
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    state = (await progress(shopId)).completionById;
    assert.equal(state[itemId], true, `${itemId} did not change after saving ${field}`);
  }

  const plan = await authenticated(request(app).patch(`/api/shops/${shopId}/subscription`)).send({
    plan: "FREE", status: "ACTIVE", cancelAtPeriodEnd: false,
  });
  assert.equal(plan.status, 200, JSON.stringify(plan.body));
  state = (await progress(shopId)).completionById;
  assert.equal(state["seller-plan"], true);

  const { proof: createStaffProof } = await issueMfaStepUpProof({ app, token, userId: ownerId, scope: "privilege.staff.create" });
  const staff = await authenticated(request(app).post("/api/staff"))
    .set("x-mfa-step-up-proof", createStaffProof).send({
    shopId, email: `invite${DOMAIN}`, role: "SHOP_STAFF", permissions: ["inventory:read"],
  });
  assert.equal(staff.status, 201, JSON.stringify(staff.body));
  state = (await progress(shopId)).completionById;
  assert.equal(state.staff, true);

  const { proof: disableStaffProof } = await issueMfaStepUpProof({ app, token, userId: ownerId, scope: "privilege.staff.update" });
  const disabled = await authenticated(request(app).patch(`/api/staff/${staff.body.id}`))
    .set("x-mfa-step-up-proof", disableStaffProof).send({ status: "INACTIVE" });
  assert.equal(disabled.status, 200, JSON.stringify(disabled.body));
  state = (await progress(shopId)).completionById;
  assert.equal(state.staff, false, "inactive staff must not complete setup");
  const { proof: inviteStaffProof } = await issueMfaStepUpProof({ app, token, userId: ownerId, scope: "privilege.staff.update" });
  await authenticated(request(app).patch(`/api/staff/${staff.body.id}`))
    .set("x-mfa-step-up-proof", inviteStaffProof).send({ status: "INVITED" });

  const item = await authenticated(request(app).post("/api/items")).send({
    pawnShopId: shopId, title: "First persisted item", price: 100, images: [],
  });
  assert.equal(item.status, 201, JSON.stringify(item.body));
  result = await progress(shopId);
  state = result.completionById;
  assert.equal(state.inventory, true);
  assert.equal(Object.values(state).filter(Boolean).length, 9);
  assert.equal(result.completedCount, 9);
  assert.equal(result.totalCount, 9);
});
