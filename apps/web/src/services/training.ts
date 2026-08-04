import { api } from "./apiClient";
import type { Role } from "./auth";

export type TrainingStatus = "DRAFT" | "PUBLISHED" | "UNPUBLISHED" | "ARCHIVED";
export type TrainingItem = {
  id: string; slug: string; title: string; summary: string; category: string;
  type: "VIDEO" | "TUTORIAL"; status: TrainingStatus; difficulty: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  durationSeconds: number | null; videoUrl: string | null; featured: boolean; required: boolean; sortOrder: number;
  audiences: Role[]; steps: Array<{ position: number; title: string; body: string }>;
  progress: { resumePositionSeconds: number; completedAt: string | null } | null;
  statistics?: { started: number; completed: number };
};
export type TrainingInput = Omit<TrainingItem, "id" | "status" | "progress" | "statistics">;
const query = (values: Record<string, string>) => { const params = new URLSearchParams(Object.entries(values).filter(([, value]) => value)); return params.size ? `?${params}` : ""; };
export const trainingApi = {
  list(filters: Record<string, string> = {}) { return api.get<{ success: true; items: TrainingItem[] }>(`/training${query(filters)}`); },
  get(slug: string) { return api.get<{ success: true; item: TrainingItem }>(`/training/content/${encodeURIComponent(slug)}`); },
  progress(id: string, resumePositionSeconds: number, completed = false) { return api.put(`/training/content/${encodeURIComponent(id)}/progress`, { resumePositionSeconds, completed }); },
  adminList(filters: Record<string, string> = {}) { return api.get<{ success: true; items: TrainingItem[] }>(`/training/admin${query(filters)}`); },
  create(input: TrainingInput) { return api.post<{ success: true; item: TrainingItem }>("/training/admin", input); },
  update(id: string, input: Partial<TrainingInput>) { return api.patch<{ success: true; item: TrainingItem }>(`/training/admin/${encodeURIComponent(id)}`, input); },
  lifecycle(id: string, status: Exclude<TrainingStatus, "DRAFT">) { return api.post(`/training/admin/${encodeURIComponent(id)}/lifecycle`, { status }); },
  reorder(items: Array<{ id: string; sortOrder: number }>) { return api.patch("/training/admin/order", { items }); },
};
