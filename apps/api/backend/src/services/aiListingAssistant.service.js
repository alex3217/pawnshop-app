import { prisma } from "../lib/prisma.js";
import { getBuyerEntitlementsForUser } from "./buyerEntitlements.service.js";
import { getSellerEntitlementsForShop } from "./sellerPlan.service.js";

const DEFAULT_MODEL = "gpt-4o-mini";

const LISTING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    category: { type: "string" },
    condition: { type: "string" },
    tags: {
      type: "array",
      items: { type: "string" },
    },
    searchKeywords: {
      type: "array",
      items: { type: "string" },
    },
    qualityScore: { type: "number" },
    qualityIssues: {
      type: "array",
      items: { type: "string" },
    },
    riskWarnings: {
      type: "array",
      items: { type: "string" },
    },
    ownerChecklist: {
      type: "array",
      items: { type: "string" },
    },
    buyerTrustNotes: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: [
    "title",
    "description",
    "category",
    "condition",
    "tags",
    "searchKeywords",
    "qualityScore",
    "qualityIssues",
    "riskWarnings",
    "ownerChecklist",
    "buyerTrustNotes",
  ],
};

function cleanText(value, fallback = "") {
  return String(value ?? "").trim() || fallback;
}

function clampScore(value) {
  const score = Number(value);
  if (!Number.isFinite(score)) return 70;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function uniqueStrings(values, fallback = []) {
  const source = Array.isArray(values) ? values : fallback;
  return [...new Set(source.map((value) => cleanText(value)).filter(Boolean))].slice(0, 12);
}

function titleCase(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/\b[a-z]/g, (char) => char.toUpperCase());
}

function normalizeInput(body = {}) {
  const title = cleanText(body.title);
  const description = cleanText(body.description);
  const category = cleanText(body.category, "General");
  const condition = cleanText(body.condition, "Good");
  const price = cleanText(body.price);

  const images = Array.isArray(body.images) ? body.images.map(cleanText).filter((value) => /^https:\/\//i.test(value) || /^data:image\/(jpeg|png|webp);base64,/i.test(value)).slice(0, 6) : [];
  if (!title && !description && !(cleanText(body.category) && cleanText(body.condition)) && !cleanText(body.productCode) && !images.length) {
    const err = new Error("Provide a title, description, category and condition, product code, or usable image for the AI listing assistant.");
    err.statusCode = 400;
    throw err;
  }

  return {
    title,
    description,
    category,
    condition,
    price,
    shopName: cleanText(body.shopName),
    notes: cleanText(body.notes),
    brand: cleanText(body.brand), model: cleanText(body.model), serialNumber: cleanText(body.serialNumber), productCode: cleanText(body.productCode), accessories: cleanText(body.accessories), defects: cleanText(body.defects), pickupAvailable: Boolean(body.pickupAvailable), shippingAvailable: Boolean(body.shippingAvailable), images,
  };
}

function buildFallbackSuggestion(input, reason = "OpenAI is not configured yet.") {
  const baseTitle = titleCase(input.title || `${input.condition} ${input.category} Item`);
  const description =
    input.description ||
    `Pre-owned ${input.category.toLowerCase()} item in ${input.condition.toLowerCase()} condition. Review photos, accessories, serial/model information, and pickup or shipping terms before publishing.`;

  const issues = [];
  if (!input.title) issues.push("Add a specific item title.");
  if (!input.description) issues.push("Add condition details, included accessories, flaws, and pickup/shipping notes.");
  if (!input.price) issues.push("Add a verified price before publishing.");

  return {
    title: baseTitle,
    description,
    category: input.category,
    condition: input.condition,
    tags: uniqueStrings([input.category, input.condition, ...baseTitle.split(" ")], ["pawnshop", "marketplace"]),
    searchKeywords: uniqueStrings([baseTitle, input.category, input.condition]),
    qualityScore: clampScore(issues.length ? 72 - issues.length * 8 : 82),
    qualityIssues: issues,
    riskWarnings: [reason],
    ownerChecklist: [
      "Verify brand, model, serial number, and authenticity where applicable.",
      "Add clear photos before publishing.",
      "Confirm condition and any defects.",
      "Confirm pickup, shipping, warranty, and return terms.",
    ],
    buyerTrustNotes: [
      "Clear condition notes improve buyer confidence.",
      "Detailed photos and model information reduce disputes.",
    ],
    source: "fallback",
  };
}

function normalizeSuggestion(value, input, source = "openai") {
  const fallback = buildFallbackSuggestion(input, "Fallback normalization was used.");

  const suggestion = value && typeof value === "object" ? value : {};

  return {
    title: cleanText(suggestion.title, fallback.title),
    description: cleanText(suggestion.description, fallback.description),
    category: cleanText(suggestion.category, input.category),
    condition: cleanText(suggestion.condition, input.condition),
    tags: uniqueStrings(suggestion.tags, fallback.tags),
    searchKeywords: uniqueStrings(suggestion.searchKeywords, fallback.searchKeywords),
    qualityScore: clampScore(suggestion.qualityScore ?? fallback.qualityScore),
    qualityIssues: uniqueStrings(suggestion.qualityIssues, fallback.qualityIssues),
    riskWarnings: uniqueStrings(suggestion.riskWarnings, fallback.riskWarnings),
    ownerChecklist: uniqueStrings(suggestion.ownerChecklist, fallback.ownerChecklist),
    buyerTrustNotes: uniqueStrings(suggestion.buyerTrustNotes, fallback.buyerTrustNotes),
    source,
  };
}

function extractOutputText(payload) {
  if (!payload || typeof payload !== "object") return "";

  if (typeof payload.output_text === "string") {
    return payload.output_text;
  }

  const output = Array.isArray(payload.output) ? payload.output : [];

  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];

    for (const part of content) {
      if (typeof part?.text === "string") return part.text;
      if (typeof part?.content === "string") return part.content;
    }
  }

  return "";
}

async function callOpenAI(input) {
  const apiKey = process.env.OPENAI_API_KEY;
  const enabled = process.env.AI_LISTING_ASSISTANT_ENABLED !== "false";

  if (!enabled) {
    return { ...buildFallbackSuggestion(input, "AI Listing Assistant is disabled by configuration."), _creditEligible: true };
  }

  if (!apiKey) {
    return { ...buildFallbackSuggestion(input, "OPENAI_API_KEY is not configured. Using safe local fallback."), _creditEligible: true };
  }

  const model = process.env.OPENAI_LISTING_MODEL || DEFAULT_MODEL;

  const textPrompt = JSON.stringify({ task: "Improve this pawnshop marketplace listing draft.", input: { ...input, images: undefined }, rules: ["Make the title clear and searchable.", "Make the description buyer-friendly but honest.", "Flag missing information instead of inventing facts.", "Never claim authenticity or that an item is not stolen without evidence.", "Never invent a brand, model, serial number, accessories, defects, or condition details.", "Never hide visible damage.", "Never guarantee value, safety, legality, warranty, ownership, or condition.", "Ask the seller to verify brand, model, serial number, accessories, condition, and defects.", "Keep the qualityScore between 0 and 100."] });
  const userContent = [{ type: "input_text", text: textPrompt }, ...input.images.map((imageUrl) => ({ type: "input_image", image_url: imageUrl, detail: "low" }))];
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content:
            "You are an AI listing assistant for a pawnshop marketplace. Return safe, accurate, owner-reviewed listing suggestions only. Do not claim authenticity, legality, warranty, or guaranteed value. Use JSON only.",
        },
        {
          role: "user",
          content: userContent,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "pawnshop_listing_assistant",
          strict: true,
          schema: LISTING_SCHEMA,
        },
      },
      max_output_tokens: 1200,
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const providerStatus = response.status;
    const providerType = payload?.error?.type || null;

    console.warn("[aiListingAssistant] OpenAI provider error; using fallback", {
      providerStatus,
      providerType,
    });

    if (input.images.length) {
      const textOnly = await callOpenAI({ ...input, images: [] });
      return { ...textOnly, riskWarnings: uniqueStrings([...textOnly.riskWarnings, "Image analysis was unavailable; the suggestion used text and metadata only."]) };
    }
    return { ...buildFallbackSuggestion(
      input,
      `OpenAI unavailable (${providerStatus}${providerType ? ` ${providerType}` : ""}). Using safe local fallback.`,
    ), _creditEligible: false };
  }

  const outputText = extractOutputText(payload);

  if (!outputText) {
    return { ...buildFallbackSuggestion(input, "OpenAI returned no parseable output."), _creditEligible: false };
  }

  try {
    const parsed = JSON.parse(outputText);
    return { ...normalizeSuggestion(parsed, input, "openai"), _creditEligible: true };
  } catch {
    return { ...buildFallbackSuggestion(input, "OpenAI output could not be parsed."), _creditEligible: false };
  }
}

function planLimitError({ resource, planCode, displayName, used, limit, upgradePath }) {
  const error = new Error(`You have reached the ${displayName} plan limit for AI listing generations.`);
  error.statusCode = 409;
  error.code = resource === "buyerAiListingGenerations" ? "BUYER_PLAN_LIMIT_REACHED" : "SELLER_PLAN_LIMIT_REACHED";
  error.details = { resource, planCode, displayName, used, limit, remaining: Math.max(limit - used, 0), upgradePath };
  return error;
}

async function resolveUsageScope(req) {
  const userId = String(req.user?.id || req.user?.sub || "").trim();
  const role = String(req.user?.role || "").toUpperCase();
  if (role === "CONSUMER") {
    const entitlements = await getBuyerEntitlementsForUser(userId);
    const usage = entitlements.usage.aiListingGenerations;
    const periodStart = entitlements.subscription.effectivePlan !== "FREE" && entitlements.subscription.currentPeriodStart ? new Date(entitlements.subscription.currentPeriodStart) : new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    return { userId, shopId: null, usage, periodStart, planCode: entitlements.subscription.effectivePlan, displayName: entitlements.subscription.displayName, resource: "buyerAiListingGenerations", upgradePath: "/buyer/subscription" };
  }
  if (role === "OWNER") {
    const requestedShopId = cleanText(req.body?.pawnShopId);
    const shop = requestedShopId
      ? await prisma.pawnShop.findFirst({ where: { id: requestedShopId, ownerId: userId, isDeleted: false }, select: { id: true, subscriptionCurrentPeriodEnd: true } })
      : await prisma.pawnShop.findFirst({ where: { ownerId: userId, isDeleted: false }, orderBy: { createdAt: "asc" }, select: { id: true, subscriptionCurrentPeriodEnd: true } });
    if (!shop) { const error = new Error("An owned pawn shop is required for AI listing generation."); error.statusCode = 403; throw error; }
    const entitlements = await getSellerEntitlementsForShop(shop.id);
    const periodEnd = shop.subscriptionCurrentPeriodEnd ? new Date(shop.subscriptionCurrentPeriodEnd) : null;
    const periodStart = periodEnd && !Number.isNaN(periodEnd.getTime()) && entitlements.subscription.isUsable ? new Date(Date.UTC(periodEnd.getUTCFullYear(), periodEnd.getUTCMonth() - 1, periodEnd.getUTCDate(), periodEnd.getUTCHours(), periodEnd.getUTCMinutes(), periodEnd.getUTCSeconds())) : new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    return { userId: null, shopId: shop.id, usage: entitlements.usage.aiListingGenerations, periodStart, planCode: entitlements.subscription.effectivePlan, displayName: entitlements.subscription.label, resource: "sellerAiListingGenerations", upgradePath: "/owner/subscription" };
  }
  return null;
}

export function assertAiCapacity(scope) {
  if (scope?.usage?.atLimit) throw planLimitError({ ...scope, used: scope.usage.used, limit: scope.usage.limit });
}

export async function recordAiCredit(scope, source, prismaClient = prisma) {
  if (!scope) return null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prismaClient.$transaction(async (tx) => {
        const where = scope.userId ? { userId: scope.userId, createdAt: { gte: scope.periodStart } } : { shopId: scope.shopId, createdAt: { gte: scope.periodStart } };
        const used = await tx.aiListingGeneration.count({ where });
        if (used >= scope.usage.limit) throw planLimitError({ ...scope, used, limit: scope.usage.limit });
        await tx.aiListingGeneration.create({ data: { userId: scope.userId, shopId: scope.shopId, source } });
        return { used: used + 1, limit: scope.usage.limit, remaining: Math.max(scope.usage.limit - used - 1, 0), effectivePlan: scope.planCode, upgradePath: scope.upgradePath };
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      if (error?.code !== "P2034" || attempt === 2) throw error;
    }
  }
  return null;
}

export async function createListingAssistantSuggestion(req, res) {
  const input = normalizeInput(req.body);
  const scope = await resolveUsageScope(req);
  assertAiCapacity(scope);
  const suggestion = await callOpenAI(input);
  const creditEligible = suggestion._creditEligible === true;
  delete suggestion._creditEligible;
  const usage = creditEligible ? await recordAiCredit(scope, suggestion.source) : scope ? { used: scope.usage.used, limit: scope.usage.limit, remaining: scope.usage.remaining, effectivePlan: scope.planCode, upgradePath: scope.upgradePath } : null;

  return res.status(200).json({
    success: true,
    suggestion,
    usageCharged: creditEligible,
    usage,
  });
}
