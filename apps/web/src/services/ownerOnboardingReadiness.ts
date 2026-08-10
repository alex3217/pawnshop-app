import { calculateOwnerSetupProgress } from "../../../../shared/ownerSetupChecklist.mjs";

export type OwnerReadinessItem = {
  id: string;
  label: string;
  description: string;
  complete: boolean;
  href: string;
  editHref: string;
  required: boolean;
};

export type OwnerReadinessSummary = {
  completedCount: number;
  totalCount: number;
  percentComplete: number;
  readyToLaunch: boolean;
  launched: boolean;
  items: OwnerReadinessItem[];
};

export const emptyOwnerReadiness = (): OwnerReadinessSummary =>
  calculateOwnerSetupProgress({}) as OwnerReadinessSummary;
