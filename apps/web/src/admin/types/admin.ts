// File: apps/web/src/admin/types/admin.ts

import type React from "react";

export type AdminNavKey =
  | "overview"
  | "users"
  | "owners"
  | "shops"
  | "inventory"
  | "auctions"
  | "offers"
  | "orders"
  | "reviews"
  | "support"
  | "subscriptions"
  | "revenue"
  | "analytics"
  | "risk"
  | "audit"
  | "system"
  | "settings"
  | "superAdminOverview"
  | "superAdminUsers"
  | "superAdminShops"
  | "superAdminSellerPlans"
  | "superAdminBuyerPlans"
  | "superAdminBuyerSubscriptions"
  | "superAdminSettlements"
  | "superAdminRevenue"
  | "superAdminAudit"
  | "superAdminSettings";

export type AdminPermission =
  | "admin:overview:read"
  | "admin:users:read"
  | "admin:owners:read"
  | "admin:shops:read"
  | "admin:inventory:read"
  | "admin:auctions:read"
  | "admin:offers:read"
  | "admin:orders:read"
  | "admin:reviews:read"
  | "admin:support:read"
  | "admin:subscriptions:read"
  | "admin:revenue:read"
  | "admin:analytics:read"
  | "admin:risk:read"
  | "admin:audit:read"
  | "admin:system:read"
  | "admin:settings:read";

export type AdminSectionKey =
  | "core"
  | "ops"
  | "growth"
  | "system"
  | "super-admin-core"
  | "super-admin-commercial"
  | "super-admin-governance";

export type AdminRouteGroup =
  | "admin-core"
  | "admin-operations"
  | "admin-growth"
  | "admin-system"
  | "super-admin-core"
  | "super-admin-commercial"
  | "super-admin-governance";

export type AdminBadgeTone =
  | "default"
  | "info"
  | "success"
  | "warning"
  | "danger";

export type AdminSidebarBadge = {
  text: string;
  tone?: AdminBadgeTone;
};

export type AdminSidebarItem = {
  key: AdminNavKey | string;
  label: string;
  to?: string;
  path?: string;
  href?: string;
  section?: AdminSectionKey;
  permissions: AdminPermission[];
  description?: string;
  enabled?: boolean;
  comingSoon?: boolean;
  disabledReason?: string;
  icon?: string;
  badge?: AdminSidebarBadge;
  sortOrder?: number;
  children?: AdminSidebarItem[];
};

export type AdminRouteConfig = {
  key: AdminNavKey | string;
  path: string;
  label: string;
  permissions: AdminPermission[];
  enabled?: boolean;
  comingSoon?: boolean;
  group?: AdminRouteGroup;
};

export type AdminKpi = {
  key: string;
  label: string;
  value: string | number;
  helpText?: string;
  trend?: {
    value: string;
    tone?: AdminBadgeTone;
  };
};

export type AdminPageMeta = {
  title: string;
  subtitle?: string;
};

export type AdminViewerRole =
  | "CONSUMER"
  | "OWNER"
  | "ADMIN"
  | "SUPER_ADMIN"
  | null;

export type AdminViewerContext = {
  role: AdminViewerRole;
  permissions: Set<AdminPermission>;
};

export type AdminTableColumn<T> = {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  width?: number | string;
  align?: "left" | "center" | "right";
};

export type AdminTableConfig<T> = {
  key: string;
  title: string;
  emptyMessage: string;
  rowKey: (row: T) => string;
  columns: AdminTableColumn<T>[];
};