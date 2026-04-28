// File: apps/web/src/admin/config/routes.ts

import type { AdminPermission, AdminRouteConfig } from "../types/admin";

type AdminRouteGroup =
  | "admin-core"
  | "admin-operations"
  | "admin-growth"
  | "admin-system"
  | "super-admin-core"
  | "super-admin-commercial"
  | "super-admin-governance";

type AdminRouteInput = {
  key: string;
  path: string;
  label: string;
  permissions?: AdminPermission[];
  enabled?: boolean;
  comingSoon?: boolean;
  group: AdminRouteGroup;
};

export type AdminRouteWithGroup = AdminRouteConfig & {
  group: AdminRouteGroup;
};

function route(config: AdminRouteInput): AdminRouteWithGroup {
  const item: AdminRouteWithGroup = {
    key: config.key,
    path: config.path,
    label: config.label,
    permissions: config.permissions ?? [],
    enabled: config.enabled ?? true,
    group: config.group,
  };

  if (config.comingSoon === true) {
    item.comingSoon = true;
  }

  return item;
}

export const ADMIN_ROUTES: AdminRouteWithGroup[] = [
  route({
    key: "overview",
    path: "/admin",
    label: "Overview",
    permissions: ["admin:overview:read"],
    group: "admin-core",
  }),
  route({
    key: "users",
    path: "/admin/users",
    label: "Users",
    permissions: ["admin:users:read"],
    group: "admin-core",
  }),
  route({
    key: "owners",
    path: "/admin/owners",
    label: "Owners",
    permissions: ["admin:owners:read"],
    group: "admin-core",
  }),
  route({
    key: "shops",
    path: "/admin/shops",
    label: "Shops",
    permissions: ["admin:shops:read"],
    group: "admin-core",
  }),

  route({
    key: "inventory",
    path: "/admin/inventory",
    label: "Inventory",
    permissions: ["admin:inventory:read"],
    group: "admin-operations",
  }),
  route({
    key: "auctions",
    path: "/admin/auctions",
    label: "Auctions",
    permissions: ["admin:auctions:read"],
    group: "admin-operations",
  }),
  route({
    key: "offers",
    path: "/admin/offers",
    label: "Offers",
    permissions: ["admin:offers:read"],
    group: "admin-operations",
  }),
  route({
    key: "orders",
    path: "/admin/orders",
    label: "Orders & Settlements",
    permissions: ["admin:orders:read"],
    enabled: false,
    comingSoon: true,
    group: "admin-operations",
  }),
  route({
    key: "reviews",
    path: "/admin/reviews",
    label: "Reviews & Feedback",
    permissions: ["admin:reviews:read"],
    enabled: false,
    comingSoon: true,
    group: "admin-operations",
  }),
  route({
    key: "support",
    path: "/admin/support",
    label: "Support & Inquiries",
    permissions: ["admin:support:read"],
    enabled: false,
    comingSoon: true,
    group: "admin-operations",
  }),

  route({
    key: "subscriptions",
    path: "/admin/subscriptions",
    label: "Subscriptions & Plans",
    permissions: ["admin:subscriptions:read"],
    group: "admin-growth",
  }),
  route({
    key: "revenue",
    path: "/admin/revenue",
    label: "Revenue",
    permissions: ["admin:revenue:read"],
    enabled: false,
    comingSoon: true,
    group: "admin-growth",
  }),
  route({
    key: "analytics",
    path: "/admin/analytics",
    label: "Analytics",
    permissions: ["admin:analytics:read"],
    enabled: false,
    comingSoon: true,
    group: "admin-growth",
  }),

  route({
    key: "risk",
    path: "/admin/risk",
    label: "Fraud & Risk",
    permissions: ["admin:risk:read"],
    enabled: false,
    comingSoon: true,
    group: "admin-system",
  }),
  route({
    key: "audit",
    path: "/admin/audit",
    label: "Audit Logs",
    permissions: ["admin:audit:read"],
    enabled: false,
    comingSoon: true,
    group: "admin-system",
  }),
  route({
    key: "system",
    path: "/admin/system",
    label: "System Health",
    permissions: ["admin:system:read"],
    enabled: false,
    comingSoon: true,
    group: "admin-system",
  }),
  route({
    key: "settings",
    path: "/admin/settings",
    label: "Settings",
    permissions: ["admin:settings:read"],
    enabled: false,
    comingSoon: true,
    group: "admin-system",
  }),

  route({
    key: "superAdminOverview",
    path: "/super-admin",
    label: "Platform Overview",
    permissions: ["admin:overview:read"],
    group: "super-admin-core",
  }),
  route({
    key: "superAdminUsers",
    path: "/super-admin/users",
    label: "Platform Users",
    permissions: ["admin:users:read"],
    group: "super-admin-core",
  }),
  route({
    key: "superAdminShops",
    path: "/super-admin/shops",
    label: "Platform Shops",
    permissions: ["admin:shops:read"],
    group: "super-admin-core",
  }),

  route({
    key: "superAdminSellerPlans",
    path: "/super-admin/plans/seller",
    label: "Seller Plans",
    permissions: ["admin:subscriptions:read"],
    group: "super-admin-commercial",
  }),
  route({
    key: "superAdminBuyerPlans",
    path: "/super-admin/plans/buyer",
    label: "Buyer Plans",
    permissions: ["admin:subscriptions:read"],
    group: "super-admin-commercial",
  }),
  route({
    key: "superAdminBuyerSubscriptions",
    path: "/super-admin/buyer-subscriptions",
    label: "Buyer Subscriptions",
    permissions: ["admin:subscriptions:read"],
    group: "super-admin-commercial",
  }),
  route({
    key: "superAdminRevenue",
    path: "/super-admin/revenue",
    label: "Platform Revenue",
    permissions: ["admin:revenue:read"],
    group: "super-admin-commercial",
  }),
  route({
    key: "superAdminSettlements",
    path: "/super-admin/settlements",
    label: "Settlements Control",
    permissions: ["admin:orders:read"],
    group: "super-admin-commercial",
  }),

  route({
    key: "superAdminAudit",
    path: "/super-admin/audit",
    label: "Platform Audit",
    permissions: ["admin:audit:read"],
    group: "super-admin-governance",
  }),
  route({
    key: "superAdminSettings",
    path: "/super-admin/platform-settings",
    label: "Platform Settings",
    permissions: ["admin:settings:read"],
    group: "super-admin-governance",
  }),
];

export function getEnabledAdminRoutes(): AdminRouteWithGroup[] {
  return ADMIN_ROUTES.filter((adminRoute) => adminRoute.enabled !== false);
}

export function getComingSoonAdminRoutes(): AdminRouteWithGroup[] {
  return ADMIN_ROUTES.filter((adminRoute) => adminRoute.comingSoon === true);
}

export function getAdminRoutesByGroup(
  group: AdminRouteGroup
): AdminRouteWithGroup[] {
  return ADMIN_ROUTES.filter((adminRoute) => adminRoute.group === group);
}

export function getAdminRouteByKey(
  key: string
): AdminRouteWithGroup | undefined {
  return ADMIN_ROUTES.find((adminRoute) => adminRoute.key === key);
}

export function getAdminRouteByPath(
  path: string
): AdminRouteWithGroup | undefined {
  const normalizedPath = normalizeAdminPath(path);

  return ADMIN_ROUTES.find(
    (adminRoute) => normalizeAdminPath(adminRoute.path) === normalizedPath
  );
}

export function isAdminRouteEnabled(path: string): boolean {
  const found = getAdminRouteByPath(path);
  return Boolean(found && found.enabled !== false);
}

function normalizeAdminPath(path: string): string {
  const cleaned = String(path || "").replace(/\/+$/, "");
  return cleaned || "/admin";
}

export default ADMIN_ROUTES;