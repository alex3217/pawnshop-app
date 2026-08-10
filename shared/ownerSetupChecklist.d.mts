export type OwnerSetupChecklistItem = {
  id: string; label: string; description: string; href: string;
  required: boolean; completionKey: string; editHref: string;
};
export type OwnerSetupProgressItem = Omit<OwnerSetupChecklistItem, "completionKey"> & { complete: boolean };
export type OwnerSetupProgress = {
  completedCount: number; totalCount: number; percentComplete: number;
  readyToLaunch: boolean; launched: boolean; items: OwnerSetupProgressItem[];
};
export const OWNER_SETUP_CHECKLIST: readonly OwnerSetupChecklistItem[];
export function calculateOwnerSetupProgress(facts?: Record<string, unknown>): OwnerSetupProgress;
