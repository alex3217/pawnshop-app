import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "../src/lib/prisma.js";
import {
  activitySchema, createGrowthActivity, createGrowthLead, createLeadSchema,
  getGrowthSummary, listGrowthLeads, suppressGrowthLead, updateLeadSchema,
} from "../src/controllers/growthCenter.controller.js";

function response() {
  return {
    statusCode: 200, body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test("create and update validation rejects invalid and unknown input", () => {
  const base = { businessName: "", addressLine1: "1 Test Way", city: "Testville", state: "TX", postalCode: "75001", sourceType: "MANUAL", publicEmail: "bad" };
  assert.equal(createLeadSchema.safeParse(base).success, false);
  assert.equal(updateLeadSchema.safeParse({ leadScore: 101 }).success, false);
  assert.equal(updateLeadSchema.safeParse({ unexpected: "field" }).success, false);
  assert.equal(activitySchema.safeParse({ activityType: "SEND_CAMPAIGN" }).success, false);
});

test("lead create delegates validated data to Prisma", async () => {
  const original = prisma.pawnShopLead.create;
  prisma.pawnShopLead.create = async ({ data }) => ({ id: "lead-1", ...data, activities: [] });
  try {
    const res = response();
    await createGrowthLead({ body: { businessName: "Fictional Loop Pawn", addressLine1: "1 Test Way", city: "Testville", state: "TX", postalCode: "75001", sourceType: "MANUAL" } }, res);
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.lead.businessName, "Fictional Loop Pawn");
  } finally { prisma.pawnShopLead.create = original; }
});

test("lead list caps pagination and applies search and filters", async () => {
  const originalCount = prisma.pawnShopLead.count;
  const originalFindMany = prisma.pawnShopLead.findMany;
  let captured;
  prisma.pawnShopLead.count = async () => 1;
  prisma.pawnShopLead.findMany = async (input) => {
    captured = input;
    return [{ id: "lead-1", businessName: "Fictional Loop Pawn", activities: [] }];
  };
  try {
    const res = response();
    await listGrowthLeads({ query: { page: "2", limit: "100", search: "Loop", state: "TX", doNotContact: "false" } }, res);
    assert.equal(captured.take, 100);
    assert.equal(captured.skip, 100);
    assert.equal(captured.where.state, "TX");
    assert.equal(captured.where.doNotContact, false);
    assert.equal(captured.where.OR.length, 6);
    const invalid = response();
    await listGrowthLeads({ query: { limit: "101" } }, invalid);
    assert.equal(invalid.statusCode, 400);
  } finally {
    prisma.pawnShopLead.count = originalCount;
    prisma.pawnShopLead.findMany = originalFindMany;
  }
});

test("suppression atomically marks do-not-contact and records activity", async () => {
  const originalFind = prisma.pawnShopLead.findUnique;
  const originalTransaction = prisma.$transaction;
  const calls = [];
  prisma.pawnShopLead.findUnique = async () => ({ id: "lead-1", publicEmail: "public@example.test", phone: "555-0100" });
  prisma.$transaction = async (callback) => callback({
    pawnShopLeadSuppression: { create: async ({ data }) => { calls.push(["suppression", data]); return { id: "s-1", ...data }; } },
    pawnShopLead: { update: async ({ data }) => { calls.push(["lead", data]); return { id: "lead-1", ...data }; } },
    pawnShopLeadActivity: { create: async ({ data }) => { calls.push(["activity", data]); return data; } },
  });
  try {
    const res = response();
    await suppressGrowthLead({ params: { leadId: "lead-1" }, body: { reason: "Owner requested no outreach" }, superAdmin: { id: "admin-1" } }, res);
    assert.equal(res.statusCode, 201);
    assert.deepEqual(calls[1][1], { doNotContact: true, outreachStatus: "DO_NOT_CONTACT" });
    assert.equal(calls[2][1].activityType, "SUPPRESSION");
  } finally {
    prisma.pawnShopLead.findUnique = originalFind;
    prisma.$transaction = originalTransaction;
  }
});

test("activity creation records actor and next follow-up", async () => {
  const originalFind = prisma.pawnShopLead.findUnique;
  const originalCreate = prisma.pawnShopLeadActivity.create;
  let captured;
  prisma.pawnShopLead.findUnique = async () => ({ id: "lead-1" });
  prisma.pawnShopLeadActivity.create = async ({ data }) => { captured = data; return { id: "a-1", ...data }; };
  try {
    const res = response();
    await createGrowthActivity({ params: { leadId: "lead-1" }, body: { activityType: "CALL", notes: "Qualified", nextFollowUpAt: "2026-08-01T12:00:00.000Z" }, superAdmin: { id: "admin-1" } }, res);
    assert.equal(res.statusCode, 201);
    assert.equal(captured.actorUserId, "admin-1");
    assert.ok(captured.nextFollowUpAt instanceof Date);
  } finally {
    prisma.pawnShopLead.findUnique = originalFind;
    prisma.pawnShopLeadActivity.create = originalCreate;
  }
});

test("summary returns funnel and follow-up counts", async () => {
  const originalCount = prisma.pawnShopLead.count;
  let index = 0;
  prisma.pawnShopLead.count = async () => ++index;
  try {
    const res = response();
    await getGrowthSummary({}, res);
    assert.equal(res.body.summary.totalLeads, 1);
    assert.equal(res.body.summary.live, 9);
    assert.equal(res.body.summary.doNotContact, 10);
    assert.equal(res.body.summary.followUpsDue, 11);
  } finally { prisma.pawnShopLead.count = originalCount; }
});
