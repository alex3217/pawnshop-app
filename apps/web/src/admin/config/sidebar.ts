// File: apps/web/src/admin/config/sidebar.ts

import type {
  AdminPermission,
  AdminSectionKey,
  AdminSidebarBadge,
  AdminSidebarItem,
} from "../types/admin";

type SidebarItemInput = {
  key: string;
  label: string;
  path: string;
  icon?: string;
  section: AdminSectionKey;
  permissions?: AdminPermission[];
  enabled?: boolean;
  comingSoon?: boolean;
  disabledReason?: string;
  badge?: AdminSidebarBadge;
  sortOrder?: number;
  children?: AdminSidebarItem[];
};

function item(config: SidebarItemInput): AdminSidebarItem {
  const sidebarItem: AdminSidebarItem = {
    key: config.key,
    label: config.label,
    path: config.path,
    to: config.path,
    section: config.section,
    permissions: config.permissions ?? [],
    enabled: config.enabled ?? true,
  };

  if (config.icon) sidebarItem.icon = config.icon;
  if (config.badge) sidebarItem.badge = config.badge;
  if (config.children?.length) sidebarItem.children = config.children;
  if (config.comingSoon === true) sidebarItem.comingSoon = true;
  if (config.disabledReason) sidebarItem.disabledReason = config.disabledReason;
  if (typeof config.sortOrder === "number") sidebarItem.sortOrder = config.sortOrder;

  return sidebarItem;
}

export const ADMIN_SIDEBAR_ITEMS: AdminSidebarItem[] = [
  item({
    key: "overview",
    label: "Overview",
    path: "/admin",
    icon: "LayoutDashboard",
    section: "core",
    permissions: ["admin:overview:read"],
    sortOrder: 10,
  }),
  item({
    key: "users",
    label: "Users",
    path: "/admin/users",
    icon: "Users",
    section: "core",
    permissions: ["admin:users:read"],
    sortOrder: 20,
  }),
  item({
    key: "owners",
    label: "Owners",
    path: "/admin/owners",
    icon: "Store",
    section: "core",
    permissions: ["admin:owners:read"],
    sortOrder: 30,
  }),
  item({
    key: "shops",
    label: "Shops",
    path: "/admin/shops",
    icon: "Building2",
    section: "core",
    permissions: ["admin:shops:read"],
    sortOrder: 40,
  }),

  item({
    key: "inventory",
    label: "Inventory",
    path: "/admin/inventory",
    icon: "PackageSearch",
    section: "ops",
    permissions: ["admin:inventory:read"],
    sortOrder: 100,
  }),
  item({
    key: "auctions",
    label: "Auctions",
    path: "/admin/auctions",
    icon: "Gavel",
    section: "ops",
    permissions: ["admin:auctions:read"],
    sortOrder: 110,
  }),
  item({
    key: "offers",
    label: "Offers",
    path: "/admin/offers",
    icon: "Handshake",
    section: "ops",
    permissions: ["admin:offers:read"],
    sortOrder: 120,
  }),
  item({
    key: "orders",
    label: "Orders",
    path: "/admin/orders",
    icon: "ShoppingBag",
    section: "ops",
    permissions: ["admin:orders:read"],
    enabled: false,
    comingSoon: true,
    disabledReason: "Orders UI is not enabled yet.",
    sortOrder: 130,
  }),
  item({
    key: "reviews",
    label: "Reviews",
    path: "/admin/reviews",
    icon: "Star",
    section: "ops",
    permissions: ["admin:reviews:read"],
    enabled: false,
    comingSoon: true,
    disabledReason: "Reviews moderation UI is not enabled yet.",
    sortOrder: 140,
  }),
  item({
    key: "support",
    label: "Support",
    path: "/admin/support",
    icon: "LifeBuoy",
    section: "ops",
    permissions: ["admin:support:read"],
    enabled: false,
    comingSoon: true,
    disabledReason: "Support queue UI is not enabled yet.",
    sortOrder: 150,
  }),

  item({
    key: "subscriptions",
    label: "Subscriptions",
    path: "/admin/subscriptions",
    icon: "CreditCard",
    section: "growth",
    permissions: ["admin:subscriptions:read"],
    sortOrder: 200,
  }),
  item({
    key: "revenue",
    label: "Revenue",
    path: "/admin/revenue",
    icon: "DollarSign",
    section: "growth",
    permissions: ["admin:revenue:read"],
    enabled: false,
    comingSoon: true,
    disabledReason: "Revenue dashboard is not enabled yet.",
    sortOrder: 210,
  }),
  item({
    key: "analytics",
    label: "Analytics",
    path: "/admin/analytics",
    icon: "BarChart3",
    section: "growth",
    permissions: ["admin:analytics:read"],
    enabled: false,
    comingSoon: true,
    disabledReason: "Analytics dashboard is not enabled yet.",
    sortOrder: 220,
  }),

  item({
    key: "system",
    label: "System Health",
    path: "/admin/system",
    icon: "Settings",
    section: "system",
    permissions: ["admin:system:read"],
    enabled: false,
    comingSoon: true,
    disabledReason: "System health UI is not enabled yet.",
    sortOrder: 300,
  }),
];

export function getEnabledSidebarItems(): AdminSidebarItem[] {
  return ADMIN_SIDEBAR_ITEMS.filter((sidebarItem) => sidebarItem.enabled !== false)
    .slice()
    .sort(sortSidebarItems);
}

export function getSidebarItemsBySection(
  section: AdminSectionKey
): AdminSidebarItem[] {
  return ADMIN_SIDEBAR_ITEMS.filter((sidebarItem) => sidebarItem.section === section)
    .slice()
    .sort(sortSidebarItems);
}

export function getSidebarItemByKey(key: string): AdminSidebarItem | undefined {
  return ADMIN_SIDEBAR_ITEMS.find((sidebarItem) => sidebarItem.key === key);
}

export function getSidebarItemByPath(path: string): AdminSidebarItem | undefined {
  const normalizedPath = normalizeAdminPath(path);

  return ADMIN_SIDEBAR_ITEMS.find((sidebarItem) => {
    const itemPath = sidebarItem.path ?? sidebarItem.to ?? sidebarItem.href ?? "";
    return normalizeAdminPath(itemPath) === normalizedPath;
  });
}

function sortSidebarItems(a: AdminSidebarItem, b: AdminSidebarItem): number {
  return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
}

function normalizeAdminPath(path: string): string {
  return String(path || "").replace(/\/+$/, "") || "/admin";
}

export default ADMIN_SIDEBAR_ITEMS;