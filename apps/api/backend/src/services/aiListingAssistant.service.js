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

  if (!title && !description) {
    const err = new Error("Provide a title or description for the AI listing assistant.");
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
    return buildFallbackSuggestion(input, "AI Listing Assistant is disabled by configuration.");
  }

  if (!apiKey) {
    return buildFallbackSuggestion(input, "OPENAI_API_KEY is not configured. Using safe local fallback.");
  }

  const model = process.env.OPENAI_LISTING_MODEL || DEFAULT_MODEL;

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
          content: JSON.stringify({
            task: "Improve this pawnshop marketplace listing draft.",
            input,
            rules: [
              "Make the title clear and searchable.",
              "Make the description buyer-friendly but honest.",
              "Flag missing information instead of inventing facts.",
              "Never say an item is authentic unless the owner provided proof.",
              "Never guarantee value, safety, legality, warranty, or condition.",
              "Keep the qualityScore between 0 and 100.",
            ],
          }),
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

    return buildFallbackSuggestion(
      input,
      `OpenAI unavailable (${providerStatus}${providerType ? ` ${providerType}` : ""}). Using safe local fallback.`,
    );
  }

  const outputText = extractOutputText(payload);

  if (!outputText) {
    return buildFallbackSuggestion(input, "OpenAI returned no parseable output.");
  }

  try {
    const parsed = JSON.parse(outputText);
    return normalizeSuggestion(parsed, input, "openai");
  } catch {
    return buildFallbackSuggestion(input, "OpenAI output could not be parsed.");
  }
}

export async function createListingAssistantSuggestion(req, res) {
  const input = normalizeInput(req.body);
  const suggestion = await callOpenAI(input);

  return res.status(200).json({
    success: true,
    suggestion,
  });
}
