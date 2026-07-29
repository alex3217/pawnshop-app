import { api } from "./apiClient";
import type { OwnerApplicationStatus } from "./auth";

export type BusinessAddress = {
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

export type OwnerApplication = {
  id: string;
  status: OwnerApplicationStatus;
  businessName: string | null;
  businessType: string | null;
  businessEmail: string | null;
  businessPhone: string | null;
  websiteUrl: string | null;
  businessAddress: BusinessAddress | null;
  licenseNumber: string | null;
  licenseState: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  decisionReason: string | null;
  statusChangedAt: string | null;
  updatedAt: string | null;
  canEdit: boolean;
  canResubmit: boolean;
};

type ApplicationResponse = {
  success: true;
  application: OwnerApplication;
};

export type OwnerApplicationUpdate = {
  businessName?: string | null;
  businessType?: string | null;
  businessEmail?: string | null;
  businessPhone?: string | null;
  websiteUrl?: string | null;
  businessAddress?: BusinessAddress | null;
  licenseNumber?: string | null;
  licenseState?: string | null;
};

export async function getMyOwnerApplication(signal?: AbortSignal) {
  return (
    await api.get<ApplicationResponse>("/owner-applications/me", { signal })
  ).application;
}

export async function updateMyOwnerApplication(
  input: OwnerApplicationUpdate,
) {
  return (
    await api.patch<ApplicationResponse>("/owner-applications/me", input)
  ).application;
}

export async function resubmitMyOwnerApplication() {
  return (
    await api.post<ApplicationResponse>(
      "/owner-applications/me/resubmit",
      {},
    )
  ).application;
}
