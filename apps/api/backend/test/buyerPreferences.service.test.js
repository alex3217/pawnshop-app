import assert from "node:assert/strict";
import test from "node:test";
import { buyerPreferencePatchSchema, getBuyerPreferences, updateBuyerPreferences } from "../src/services/buyerPreferences.service.js";

function database() {
  const state = { user: { id: "buyer-1", name: "Buyer", email: "buyer@test.example" }, preference: null };
  const client = {
    user: {
      findUnique: async ({ where }) => where.id === state.user.id ? { ...state.user, buyerPreference: state.preference } : null,
      update: async ({ where, data }) => { assert.equal(where.id, "buyer-1"); Object.assign(state.user, data); return state.user; },
    },
    buyerPreference: { upsert: async ({ where, create, update }) => { assert.equal(where.userId, "buyer-1"); state.preference = { ...(state.preference || create), ...update, updatedAt: new Date() }; return state.preference; } },
  };
  client.$transaction = async (callback) => callback(client);
  return client;
}

test("buyer preference defaults are readable", async () => { const value = await getBuyerPreferences("buyer-1", database()); assert.equal(value.searchRadiusMiles, 25); assert.equal(value.email, "buyer@test.example"); });
test("buyer preferences support validated partial updates", async () => { const value = await updateBuyerPreferences("buyer-1", { phone: "+1 (713) 555-0100", auctionAlerts: false }, database()); assert.equal(value.phone, "+1 (713) 555-0100"); assert.equal(value.auctionAlerts, false); assert.equal(value.savedSearchNotifications, true); });
test("buyer preference ownership comes from the service user id", async () => { await assert.rejects(() => updateBuyerPreferences("buyer-1", { userId: "buyer-2", auctionAlerts: false }, database()), /Invalid buyer preferences/); });
test("buyer preference validation rejects unsafe fields and ranges", () => { assert.equal(buyerPreferencePatchSchema.safeParse({ searchRadiusMiles: 0 }).success, false); assert.equal(buyerPreferencePatchSchema.safeParse({ email: "replace@test.example" }).success, false); assert.equal(buyerPreferencePatchSchema.safeParse({ phone: "javascript:bad" }).success, false); });
