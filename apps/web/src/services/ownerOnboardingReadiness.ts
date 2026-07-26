import type { Shop } from "./shops";

export type OwnerReadinessItem = {
  id: string;
  label: string;
  description: string;
  complete: boolean;
  href: string;
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

type BuildOwnerReadinessInput = {
  shop: Shop | null;
  selectedPlanCode?: string | null;
  hasStaffInvite?: boolean;
  inventoryCount?: number;
};

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function buildOwnerReadiness({
  shop,
  selectedPlanCode,
  hasStaffInvite = false,
  inventoryCount = 0,
}: BuildOwnerReadinessInput): OwnerReadinessSummary {
  const items: OwnerReadinessItem[] = [
    {
      id: "shop-created",
      label: "Create your shop",
      description: "Create the pawn shop profile that customers will see.",
      complete: Boolean(shop?.id),
      href: "/owner/onboarding?step=1",
      required: true,
    },
    {
      id: "shop-name",
      label: "Add a shop name",
      description: "Use the public business name customers recognize.",
      complete: hasText(shop?.name),
      href: "/owner/onboarding?step=1",
      required: true,
    },
    {
      id: "shop-address",
      label: "Add the business address",
      description: "Provide a valid location for customer visits and pickup.",
      complete: hasText(shop?.address),
      href: "/owner/locations",
      required: true,
    },
    {
      id: "shop-phone",
      label: "Add a shop phone number",
      description: "Give customers and staff a reliable contact number.",
      complete: hasText(shop?.phone),
      href: "/owner/locations",
      required: true,
    },
    {
      id: "shop-hours",
      label: "Add business hours",
      description: "Show customers when your shop is open.",
      complete: hasText(shop?.hours),
      href: "/owner/locations",
      required: true,
    },
    {
      id: "shop-description",
      label: "Complete the shop description",
      description: "Explain your services, specialties, and customer experience.",
      complete: hasText(shop?.description),
      href: "/owner/locations",
      required: false,
    },
    {
      id: "seller-plan",
      label: "Choose a seller plan",
      description: "Select the plan that supports your shop operations.",
      complete: hasText(selectedPlanCode),
      href: "/owner/onboarding?step=2",
      required: true,
    },
    {
      id: "staff",
      label: "Invite a staff member",
      description: "Add a trusted employee and assign shop permissions.",
      complete: hasStaffInvite,
      href: "/owner/staff",
      required: false,
    },
    {
      id: "inventory",
      label: "Add your first inventory item",
      description: "Create or import at least one item before opening to customers.",
      complete: inventoryCount > 0,
      href: "/owner/inventory",
      required: true,
    },
  ];

  const completedCount = items.filter((item) => item.complete).length;
  const totalCount = items.length;
  const requiredItems = items.filter((item) => item.required);
  const readyToLaunch = requiredItems.every((item) => item.complete);
  const launched = Boolean(shop?.onboardingCompletedAt);

  return {
    completedCount,
    totalCount,
    percentComplete:
      totalCount === 0
        ? 0
        : Math.round((completedCount / totalCount) * 100),
    readyToLaunch,
    launched,
    items,
  };
}
