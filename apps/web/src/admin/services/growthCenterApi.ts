import { api } from "../../services/apiClient";
import type {
  GrowthActivity, GrowthPagination, GrowthSummary, LeadListQuery, PawnShopLead,
} from "../types/growthCenter";

const BASE = "/super-admin/growth/leads";

function queryString(query: LeadListQuery) {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== "") params.set(key, String(value));
  });
  const result = params.toString();
  return result ? `?${result}` : "";
}

export const growthCenterApi = {
  summary(signal?: AbortSignal) {
    return api.get<{ success: true; summary: GrowthSummary }>(`${BASE}/summary`, { signal });
  },
  list(query: LeadListQuery, signal?: AbortSignal) {
    return api.get<{ success: true; rows: PawnShopLead[]; pagination: GrowthPagination }>(
      `${BASE}${queryString(query)}`, { signal },
    );
  },
  detail(id: string, signal?: AbortSignal) {
    return api.get<{ success: true; lead: PawnShopLead }>(
      `${BASE}/${encodeURIComponent(id)}`, { signal },
    );
  },
  create(input: Record<string, unknown>) {
    return api.post<{ success: true; lead: PawnShopLead }>(BASE, input);
  },
  update(id: string, input: Partial<PawnShopLead>) {
    return api.patch<{ success: true; lead: PawnShopLead }>(
      `${BASE}/${encodeURIComponent(id)}`, input,
    );
  },
  addContact(id: string, input: Record<string, unknown>) {
    return api.post(`${BASE}/${encodeURIComponent(id)}/contacts`, input);
  },
  addActivity(id: string, input: Record<string, unknown>) {
    return api.post<{ success: true; activity: GrowthActivity }>(
      `${BASE}/${encodeURIComponent(id)}/activities`, input,
    );
  },
  suppress(id: string, input: { reason: string; source?: string }) {
    return api.post(`${BASE}/${encodeURIComponent(id)}/suppress`, input);
  },
};
