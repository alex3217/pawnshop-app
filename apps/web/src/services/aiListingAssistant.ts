import { api } from "./apiClient";

export type AiDescriptionContext =
  | "INVENTORY_ITEM"
  | "MARKETPLACE_LISTING"
  | "AUCTION"
  | "SELL_SUBMISSION"
  | "PAWN_SUBMISSION";

export type AiDescriptionInput = {
  context: AiDescriptionContext;
  pawnShopId?: string;
  resourceId?: string;
  shopName?: string;
  title: string;
  description: string;
  price?: string;
  category: string;
  condition: string;
  linkedInventoryTitle?: string;
  linkedInventoryDescription?: string;
  notes?: string;
  attributes?: string[];
};

export type AiListingAssistantInput = AiDescriptionInput;
export type AiListingSuggestion = {
  title: string; description: string; category: string; condition: string;
  tags: string[]; searchKeywords: string[]; qualityScore: number;
  qualityIssues: string[]; riskWarnings: string[]; ownerChecklist: string[];
  buyerTrustNotes: string[]; source?: string;
};

function strings(value: unknown): string[] { return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : []; }
function normalizeSuggestion(payload: unknown): AiListingSuggestion {
  const root = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const nested = (root.suggestion || root.data || root) as Record<string, unknown>;
  return {
    title: String(nested.title || "").trim(), description: String(nested.description || "").trim(),
    category: String(nested.category || "").trim(), condition: String(nested.condition || "").trim(),
    tags: strings(nested.tags), searchKeywords: strings(nested.searchKeywords),
    qualityScore: Number(nested.qualityScore || 0), qualityIssues: strings(nested.qualityIssues),
    riskWarnings: strings(nested.riskWarnings), ownerChecklist: strings(nested.ownerChecklist),
    buyerTrustNotes: strings(nested.buyerTrustNotes), source: typeof nested.source === "string" ? nested.source : undefined,
  };
}

export async function requestListingAssistant(input: AiListingAssistantInput, signal?: AbortSignal): Promise<AiListingSuggestion> {
  const suggestion = normalizeSuggestion(await api.post<unknown>("/ai/listing-assistant", input, { signal }));
  if (!suggestion.title || !suggestion.description) throw new Error("AI returned an invalid listing suggestion. Please try again.");
  return suggestion;
}

export async function requestAiDescription(input: AiDescriptionInput, signal?: AbortSignal): Promise<string> {
  return (await requestListingAssistant(input, signal)).description;
}
