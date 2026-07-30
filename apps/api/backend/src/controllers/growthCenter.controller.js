import { z } from "zod";
import { prisma } from "../lib/prisma.js";

const BUSINESS_STATUSES = ["DISCOVERED", "ACTIVE", "INACTIVE", "CLOSED"];
const VERIFICATION_STATUSES = ["UNVERIFIED", "PENDING", "VERIFIED", "REJECTED"];
const OUTREACH_STATUSES = [
  "NOT_CONTACTED", "CONTACTED", "INTERESTED", "DEMO_SCHEDULED",
  "APPLICATION_STARTED", "ONBOARDING", "LIVE", "DECLINED", "DO_NOT_CONTACT",
];
const SOURCE_TYPES = [
  "MANUAL", "IMPORT", "GOVERNMENT_DATASET", "PUBLIC_WEBSITE", "REFERRAL", "OTHER",
];
const CONTACT_TYPES = ["OWNER", "MANAGER", "BUSINESS", "LICENSING", "OTHER"];
const ACTIVITY_TYPES = ["NOTE", "CALL", "EMAIL", "MEETING", "STATUS_CHANGE", "FOLLOW_UP", "SUPPRESSION"];
const CHANNELS = ["PHONE", "EMAIL", "IN_PERSON", "VIDEO", "INTERNAL", "OTHER"];
const DIRECTIONS = ["INBOUND", "OUTBOUND", "INTERNAL"];

const text = (max = 255) => z.string().trim().min(1).max(max);
const optionalText = (max = 255) => text(max).nullable().optional();
const optionalUrl = z.string().trim().url().max(2048).nullable().optional();
const optionalEmail = z.string().trim().email().max(320).nullable().optional();
const optionalDate = z.coerce.date().nullable().optional();

const leadFields = {
  businessName: text(200),
  legalName: optionalText(200),
  addressLine1: text(250),
  addressLine2: optionalText(250),
  city: text(120),
  state: text(100),
  postalCode: text(20),
  country: z.string().trim().length(2).toUpperCase().default("US"),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  phone: optionalText(40),
  publicEmail: optionalEmail,
  website: optionalUrl,
  facebookUrl: optionalUrl,
  instagramUrl: optionalUrl,
  linkedinUrl: optionalUrl,
  licenseNumber: optionalText(100),
  licenseAuthority: optionalText(200),
  licenseStatus: optionalText(80),
  licenseExpirationDate: optionalDate,
  sourceType: z.enum(SOURCE_TYPES),
  sourceName: optionalText(200),
  sourceUrl: optionalUrl,
  sourceRecordId: optionalText(200),
  businessStatus: z.enum(BUSINESS_STATUSES).optional(),
  verificationStatus: z.enum(VERIFICATION_STATUSES).optional(),
  outreachStatus: z.enum(OUTREACH_STATUSES).optional(),
  leadScore: z.number().int().min(0).max(100).optional(),
  assignedUserId: optionalText(128),
  claimedShopId: optionalText(128),
  doNotContact: z.boolean().optional(),
  lastVerifiedAt: optionalDate,
};

export const createLeadSchema = z.object(leadFields).strict();
export const updateLeadSchema = z.object({
  ...Object.fromEntries(Object.entries(leadFields).map(([key, value]) => [key, value.optional()])),
}).strict().refine((value) => Object.keys(value).length > 0, "At least one field is required.");

export const contactSchema = z.object({
  name: optionalText(160),
  title: optionalText(160),
  email: optionalEmail,
  phone: optionalText(40),
  contactType: z.enum(CONTACT_TYPES),
  isPublicBusinessContact: z.boolean().optional(),
  verificationStatus: z.enum(VERIFICATION_STATUSES).optional(),
  isPrimary: z.boolean().optional(),
}).strict().refine((value) => Boolean(value.name || value.email || value.phone), {
  message: "A contact name, email, or phone is required.",
});

export const activitySchema = z.object({
  activityType: z.enum(ACTIVITY_TYPES),
  channel: z.enum(CHANNELS).nullable().optional(),
  direction: z.enum(DIRECTIONS).nullable().optional(),
  status: optionalText(100),
  subject: optionalText(250),
  notes: optionalText(5000),
  occurredAt: z.coerce.date().optional(),
  nextFollowUpAt: optionalDate,
}).strict();

export const suppressionSchema = z.object({
  email: optionalEmail,
  phone: optionalText(40),
  reason: text(1000),
  source: text(120).default("SUPER_ADMIN"),
}).strict();

function validationError(res, error) {
  return res.status(400).json({
    success: false,
    error: "Validation failed",
    details: error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })),
  });
}

function parse(schema, value, res) {
  const result = schema.safeParse(value);
  if (!result.success) {
    validationError(res, result.error);
    return null;
  }
  return result.data;
}

function notFound(res, resource = "Lead") {
  return res.status(404).json({ success: false, error: `${resource} not found` });
}

const safeUserSelect = { id: true, name: true, email: true };
const listInclude = {
  assignedUser: { select: safeUserSelect },
  activities: {
    orderBy: { occurredAt: "desc" },
    take: 1,
    select: { id: true, activityType: true, occurredAt: true, nextFollowUpAt: true },
  },
};
const detailInclude = {
  assignedUser: { select: safeUserSelect },
  claimedShop: { select: { id: true, name: true } },
  contacts: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
  activities: {
    orderBy: { occurredAt: "desc" },
    include: { actorUser: { select: safeUserSelect } },
  },
  sources: { orderBy: { collectedAt: "desc" } },
  suppressions: { orderBy: { suppressedAt: "desc" } },
};

function serializeLead(lead) {
  const latestActivity = lead.activities?.[0] || null;
  const nextFollowUp = (lead.activities || [])
    .filter((activity) => activity.nextFollowUpAt)
    .sort((a, b) => new Date(a.nextFollowUpAt) - new Date(b.nextFollowUpAt))[0]?.nextFollowUpAt || null;
  return { ...lead, latestActivity, nextFollowUp };
}

export async function getGrowthSummary(_req, res) {
  const now = new Date();
  const [
    totalLeads, verified, notContacted, contacted, interested, demoScheduled,
    applicationStarted, onboarding, live, doNotContact, followUpsDue,
  ] = await Promise.all([
    prisma.pawnShopLead.count(),
    prisma.pawnShopLead.count({ where: { verificationStatus: "VERIFIED" } }),
    prisma.pawnShopLead.count({ where: { outreachStatus: "NOT_CONTACTED" } }),
    prisma.pawnShopLead.count({ where: { outreachStatus: "CONTACTED" } }),
    prisma.pawnShopLead.count({ where: { outreachStatus: "INTERESTED" } }),
    prisma.pawnShopLead.count({ where: { outreachStatus: "DEMO_SCHEDULED" } }),
    prisma.pawnShopLead.count({ where: { outreachStatus: "APPLICATION_STARTED" } }),
    prisma.pawnShopLead.count({ where: { outreachStatus: "ONBOARDING" } }),
    prisma.pawnShopLead.count({ where: { outreachStatus: "LIVE" } }),
    prisma.pawnShopLead.count({ where: { doNotContact: true } }),
    prisma.pawnShopLead.count({
      where: {
        doNotContact: false,
        activities: { some: { nextFollowUpAt: { lte: now } } },
      },
    }),
  ]);
  return res.json({
    success: true,
    summary: {
      totalLeads, verified, notContacted, contacted, interested, demoScheduled,
      applicationStarted, onboarding, live, doNotContact, followUpsDue,
    },
  });
}

export async function listGrowthLeads(req, res) {
  const querySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    search: z.string().trim().max(200).optional(),
    state: z.string().trim().max(100).optional(),
    verificationStatus: z.enum(VERIFICATION_STATUSES).optional(),
    outreachStatus: z.enum(OUTREACH_STATUSES).optional(),
    businessStatus: z.enum(BUSINESS_STATUSES).optional(),
    assignedUserId: z.string().trim().max(128).optional(),
    doNotContact: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
    sortBy: z.enum(["createdAt", "updatedAt", "leadScore", "businessName", "nextFollowUp"]).default("updatedAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  }).strict();
  const query = parse(querySchema, req.query, res);
  if (!query) return;
  const where = {};
  if (query.search) {
    where.OR = ["businessName", "city", "state", "phone", "publicEmail", "licenseNumber"]
      .map((field) => ({ [field]: { contains: query.search, mode: "insensitive" } }));
  }
  for (const key of ["state", "verificationStatus", "outreachStatus", "businessStatus", "assignedUserId", "doNotContact"]) {
    if (query[key] !== undefined) where[key] = query[key];
  }
  const sortBy = query.sortBy === "nextFollowUp" ? "updatedAt" : query.sortBy;
  const [total, leads] = await Promise.all([
    prisma.pawnShopLead.count({ where }),
    prisma.pawnShopLead.findMany({
      where,
      include: listInclude,
      orderBy: { [sortBy]: query.sortOrder },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / query.limit));
  return res.json({
    success: true,
    rows: leads.map(serializeLead),
    pagination: {
      page: query.page, limit: query.limit, total, totalPages,
      hasNextPage: query.page < totalPages,
      hasPreviousPage: query.page > 1,
    },
  });
}

export async function createGrowthLead(req, res) {
  const data = parse(createLeadSchema, req.body, res);
  if (!data) return;
  const lead = await prisma.pawnShopLead.create({ data, include: detailInclude });
  return res.status(201).json({ success: true, lead: serializeLead(lead) });
}

export async function getGrowthLead(req, res) {
  const lead = await prisma.pawnShopLead.findUnique({ where: { id: req.params.leadId }, include: detailInclude });
  if (!lead) return notFound(res);
  return res.json({ success: true, lead: serializeLead(lead) });
}

export async function updateGrowthLead(req, res) {
  const data = parse(updateLeadSchema, req.body, res);
  if (!data) return;
  const exists = await prisma.pawnShopLead.findUnique({ where: { id: req.params.leadId }, select: { id: true } });
  if (!exists) return notFound(res);
  if (data.doNotContact === true) data.outreachStatus = "DO_NOT_CONTACT";
  if (data.outreachStatus === "DO_NOT_CONTACT") data.doNotContact = true;
  const lead = await prisma.pawnShopLead.update({ where: { id: req.params.leadId }, data, include: detailInclude });
  return res.json({ success: true, lead: serializeLead(lead) });
}

export async function archiveGrowthLead(req, res) {
  const exists = await prisma.pawnShopLead.findUnique({ where: { id: req.params.leadId }, select: { id: true } });
  if (!exists) return notFound(res);
  const lead = await prisma.pawnShopLead.update({
    where: { id: req.params.leadId },
    data: { businessStatus: "INACTIVE" },
    include: detailInclude,
  });
  return res.json({ success: true, archived: true, lead: serializeLead(lead) });
}

export async function createGrowthContact(req, res) {
  const data = parse(contactSchema, req.body, res);
  if (!data) return;
  const lead = await prisma.pawnShopLead.findUnique({ where: { id: req.params.leadId }, select: { id: true } });
  if (!lead) return notFound(res);
  const contact = await prisma.$transaction(async (tx) => {
    if (data.isPrimary) {
      await tx.pawnShopLeadContact.updateMany({ where: { pawnShopLeadId: lead.id }, data: { isPrimary: false } });
    }
    return tx.pawnShopLeadContact.create({ data: { ...data, pawnShopLeadId: lead.id } });
  });
  return res.status(201).json({ success: true, contact });
}

export async function updateGrowthContact(req, res) {
  const schema = contactSchema.partial().refine((value) => Object.keys(value).length > 0, "At least one field is required.");
  const data = parse(schema, req.body, res);
  if (!data) return;
  const contact = await prisma.pawnShopLeadContact.findFirst({
    where: { id: req.params.contactId, pawnShopLeadId: req.params.leadId },
  });
  if (!contact) return notFound(res, "Contact");
  const updated = await prisma.$transaction(async (tx) => {
    if (data.isPrimary) {
      await tx.pawnShopLeadContact.updateMany({ where: { pawnShopLeadId: req.params.leadId }, data: { isPrimary: false } });
    }
    return tx.pawnShopLeadContact.update({ where: { id: contact.id }, data });
  });
  return res.json({ success: true, contact: updated });
}

export async function createGrowthActivity(req, res) {
  const data = parse(activitySchema, req.body, res);
  if (!data) return;
  const lead = await prisma.pawnShopLead.findUnique({ where: { id: req.params.leadId }, select: { id: true } });
  if (!lead) return notFound(res);
  const activity = await prisma.pawnShopLeadActivity.create({
    data: { ...data, pawnShopLeadId: lead.id, actorUserId: req.superAdmin.id || null },
    include: { actorUser: { select: safeUserSelect } },
  });
  return res.status(201).json({ success: true, activity });
}

export async function listGrowthActivities(req, res) {
  const lead = await prisma.pawnShopLead.findUnique({ where: { id: req.params.leadId }, select: { id: true } });
  if (!lead) return notFound(res);
  const rows = await prisma.pawnShopLeadActivity.findMany({
    where: { pawnShopLeadId: lead.id },
    orderBy: { occurredAt: "desc" },
    include: { actorUser: { select: safeUserSelect } },
  });
  return res.json({ success: true, rows });
}

export async function suppressGrowthLead(req, res) {
  const data = parse(suppressionSchema, req.body, res);
  if (!data) return;
  const lead = await prisma.pawnShopLead.findUnique({ where: { id: req.params.leadId } });
  if (!lead) return notFound(res);
  const result = await prisma.$transaction(async (tx) => {
    const suppression = await tx.pawnShopLeadSuppression.create({
      data: {
        pawnShopLeadId: lead.id,
        email: data.email || lead.publicEmail,
        phone: data.phone || lead.phone,
        reason: data.reason,
        source: data.source,
        createdByUserId: req.superAdmin.id || null,
      },
    });
    const updatedLead = await tx.pawnShopLead.update({
      where: { id: lead.id },
      data: { doNotContact: true, outreachStatus: "DO_NOT_CONTACT" },
    });
    await tx.pawnShopLeadActivity.create({
      data: {
        pawnShopLeadId: lead.id,
        actorUserId: req.superAdmin.id || null,
        activityType: "SUPPRESSION",
        channel: "INTERNAL",
        direction: "INTERNAL",
        notes: data.reason,
      },
    });
    return { suppression, lead: updatedLead };
  });
  return res.status(201).json({ success: true, ...result });
}

export function convertGrowthLead(_req, res) {
  return res.status(409).json({
    success: false,
    error: "Lead conversion is not available in Phase 1.",
  });
}
