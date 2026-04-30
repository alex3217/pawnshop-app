import { api } from "./apiClient";

export type AiListingAssistantInput = {
  pawnShopId?: string;
  shopName?: string;
  title: string;
  description: string;
  price?: string;
  category: string;
  condition: string;
  notes?: string;
};

export type AiListingSuggestion = {
  title: string;
  description: string;
  category: string;
  condition: string;
  tags: string[];
  searchKeywords: string[];
  qualityScore: number;
  qualityIssues: string[];
  riskWarnings: string[];
  ownerChecklist: string[];
  buyerTrustNotes: string[];
  source?: "openai" | "fallback" | string;
};

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function normalizeSuggestion(payload: unknown): AiListingSuggestion {
  const record =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};

  const nested =
    record.suggestion && typeof record.suggestion === "object"
      ? (record.suggestion as Record<string, unknown>)
      : record.data && typeof record.data === "object"
        ? (record.data as Record<string, unknown>)
        : record;

  return {
    title: String(nested.title || "").trim(),
    description: String(nested.description || "").trim(),
    category: String(nested.category || "").trim(),
    condition: String(nested.condition || "").trim(),
    tags: normalizeStringArray(nested.tags),
    searchKeywords: normalizeStringArray(nested.searchKeywords),
    qualityScore: Number(nested.qualityScore || 0),
    qualityIssues: normalizeStringArray(nested.qualityIssues),
    riskWarnings: normalizeStringArray(nested.riskWarnings),
    ownerChecklist: normalizeStringArray(nested.ownerChecklist),
    buyerTrustNotes: normalizeStringArray(nested.buyerTrustNotes),
    source: typeof nested.source === "string" ? nested.source : undefined,
  };
}

export async function requestListingAssistant(
  input: AiListingAssistantInput,
  signal?: AbortSignal,
): Promise<AiListingSuggestion> {
  if (!input.title.trim() && !input.description.trim()) {
    throw new Error("Add a title or description before asking AI for help.");
  }

  const data = await api.post<unknown>(
    "/ai/listing-assistant",
    {
      pawnShopId: input.pawnShopId,
      shopName: input.shopName,
      title: input.title.trim(),
      description: input.description.trim(),
      price: input.price,
      category: input.category,
      condition: input.condition,
      notes: input.notes,
    },
    { signal },
  );

  const suggestion = normalizeSuggestion(data);

  if (!suggestion.title && !suggestion.description) {
    throw new Error("Invalid AI listing assistant response.");
  }

  return suggestion;
}
