export type LeadBusinessStatus = "DISCOVERED" | "ACTIVE" | "INACTIVE" | "CLOSED";
export type LeadVerificationStatus = "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED";
export type LeadOutreachStatus =
  | "NOT_CONTACTED" | "CONTACTED" | "INTERESTED" | "DEMO_SCHEDULED"
  | "APPLICATION_STARTED" | "ONBOARDING" | "LIVE" | "DECLINED" | "DO_NOT_CONTACT";

export type GrowthUser = { id: string; name: string | null; email: string };
export type GrowthContact = {
  id: string; name: string | null; title: string | null; email: string | null;
  phone: string | null; contactType: string; isPublicBusinessContact: boolean;
  verificationStatus: LeadVerificationStatus; isPrimary: boolean;
};
export type GrowthActivity = {
  id: string; activityType: string; channel: string | null; direction: string | null;
  status: string | null; subject: string | null; notes: string | null;
  occurredAt: string; nextFollowUpAt: string | null; actorUser?: GrowthUser | null;
};
export type GrowthSource = {
  id: string; sourceType: string; sourceName: string; sourceUrl: string | null;
  sourceRecordId: string | null; collectionMethod: string; collectedAt: string;
  lastCheckedAt: string | null; termsReviewedAt: string | null;
};
export type GrowthSuppression = {
  id: string; email: string | null; phone: string | null; reason: string;
  source: string; suppressedAt: string;
};
export type PawnShopLead = {
  id: string; businessName: string; legalName: string | null; addressLine1: string;
  addressLine2: string | null; city: string; state: string; postalCode: string;
  country: string; phone: string | null; publicEmail: string | null; website: string | null;
  licenseNumber: string | null; licenseAuthority: string | null; licenseStatus: string | null;
  licenseExpirationDate: string | null; sourceType: string; sourceName: string | null;
  businessStatus: LeadBusinessStatus; verificationStatus: LeadVerificationStatus;
  outreachStatus: LeadOutreachStatus; leadScore: number; assignedUserId: string | null;
  assignedUser: GrowthUser | null; claimedShop?: { id: string; name: string } | null;
  doNotContact: boolean; lastVerifiedAt: string | null; createdAt: string; updatedAt: string;
  latestActivity?: GrowthActivity | null; nextFollowUp?: string | null;
  contacts?: GrowthContact[]; activities?: GrowthActivity[]; sources?: GrowthSource[];
  suppressions?: GrowthSuppression[];
};
export type GrowthSummary = {
  totalLeads: number; verified: number; notContacted: number; contacted: number;
  interested: number; demoScheduled: number; applicationStarted: number;
  onboarding: number; live: number; doNotContact: number; followUpsDue: number;
};
export type GrowthPagination = {
  page: number; limit: number; total: number; totalPages: number;
  hasNextPage: boolean; hasPreviousPage: boolean;
};
export type LeadListQuery = {
  page?: number; limit?: number; search?: string; state?: string;
  verificationStatus?: string; outreachStatus?: string; businessStatus?: string;
  assignedUserId?: string; doNotContact?: boolean; sortBy?: string; sortOrder?: "asc" | "desc";
};
