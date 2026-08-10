export const OWNER_SETUP_CHECKLIST = Object.freeze([
  { id: "shop-created", label: "Create your shop", description: "Create the pawn shop profile customers will see.", href: "/owner/onboarding?step=1#shop-profile", editHref: "/owner/locations#shop-name", required: true, completionKey: "shopCreated" },
  { id: "shop-name", label: "Add a shop name", description: "Use the public business name customers recognize.", href: "/owner/locations#shop-name", editHref: "/owner/locations#shop-name", required: true, completionKey: "shopName" },
  { id: "shop-address", label: "Add the business address", description: "Provide a valid location for customer visits and pickup.", href: "/owner/locations#shop-address", editHref: "/owner/locations#shop-address", required: true, completionKey: "shopAddress" },
  { id: "shop-phone", label: "Add a shop phone number", description: "Give customers and staff a reliable contact number.", href: "/owner/locations#shop-phone", editHref: "/owner/locations#shop-phone", required: true, completionKey: "shopPhone" },
  { id: "shop-hours", label: "Add business hours", description: "Show customers when your shop is open.", href: "/owner/locations#shop-hours", editHref: "/owner/locations#shop-hours", required: true, completionKey: "shopHours" },
  { id: "shop-description", label: "Complete the shop description", description: "Explain your services, specialties, and customer experience.", href: "/owner/locations#shop-description", editHref: "/owner/locations#shop-description", required: false, completionKey: "shopDescription" },
  { id: "seller-plan", label: "Choose a seller plan", description: "Select the plan that supports your shop operations.", href: "/owner/subscription#seller-plan", editHref: "/owner/subscription#seller-plan", required: true, completionKey: "sellerPlan" },
  { id: "staff", label: "Invite a staff member", description: "Send at least one active staff invitation; accepted active members also count.", href: "/owner/staff#invite-staff", editHref: "/owner/staff#invite-staff", required: false, completionKey: "staff" },
  { id: "inventory", label: "Add your first inventory item", description: "Create or import at least one item before opening to customers.", href: "/owner/items/new#item-details", editHref: "/owner/inventory#inventory-list", required: true, completionKey: "inventory" },
]);

export function calculateOwnerSetupProgress(facts = {}) {
  const items = OWNER_SETUP_CHECKLIST.map((item) => ({
    id: item.id,
    label: item.label,
    description: item.description,
    href: item.href,
    editHref: item.editHref,
    required: item.required,
    complete: Boolean(facts[item.completionKey]),
  }));
  const completedCount = items.filter((item) => item.complete).length;
  const totalCount = items.length;
  return {
    completedCount,
    totalCount,
    percentComplete: totalCount ? Math.round((completedCount / totalCount) * 100) : 0,
    readyToLaunch: items.filter((item) => item.required).every((item) => item.complete),
    launched: Boolean(facts.launched),
    items,
  };
}
