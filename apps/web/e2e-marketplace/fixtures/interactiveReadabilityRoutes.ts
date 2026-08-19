export type AuditRole = "GUEST" | "CONSUMER" | "OWNER" | "ADMIN" | "SUPER_ADMIN";

export type AuditRoute = {
  path: string;
  role: AuditRole;
};

// This literal registry is contract-checked against App.tsx. Keep redirects in
// the registry even when the concrete audit follows their destination.
export const REGISTERED_ROUTE_PATTERNS = [
  "/auctions", "/auctions/:id", "/bids", "/buyer", "/buyer/item-locator",
  "/buyer/messaging-profile", "/buyer/sell-item", "/forgot-password", "/items/:id",
  "/knowledge/:slug", "/login", "/login/mfa", "/marketplace", "/marketplace/buy-now",
  "/marketplace/listings/:id/edit", "/marketplace/listings/received", "/marketplace/sales",
  "/marketplace/transactions/:id", "/messages", "/messages/:id", "/owner",
  "/owner/application", "/owner/auctions", "/owner/auctions/new", "/owner/bulk-upload",
  "/owner/dashboard", "/owner/finance", "/owner/integrations", "/owner/inventory",
  "/owner/item-intakes", "/owner/items/:id/edit", "/owner/items/new", "/owner/messages",
  "/owner/messages/:id", "/owner/onboarding", "/owner/scan-console", "/owner/shops/new",
  "/owner/staff", "/owner/subscription", "/owner/locations", "/privacy", "/register", "/reset-password",
  "/shops", "/shops/:id", "/shops/:id/message", "/terms", "/verification-pending",
  "/verify-email", "/for-pawn-shops", "/admin", "/super-admin", "*", "analytics", "auctions", "audit", "buyer-subscriptions", "governance",
  "growth", "growth/leads", "growth/leads/:leadId", "integrations", "inventory", "items",
  "offers", "orders", "overview", "owner-applications", "owners", "plans/buyer",
  "plans/seller", "platform-settings", "pricing", "revenue", "reviews", "risk",
  "seller-subscriptions", "settings", "settlements", "shops", "shops/:shopId/manage",
  "subscription", "subscriptions", "support", "system", "training", "users",
] as const;

const publicRoutes = [
  "/", "/terms", "/privacy", "/marketplace", "/marketplace/buy-now", "/shops",
  "/shops/audit-shop", "/items/audit-item", "/auctions", "/auctions/audit-auction",
  "/login", "/login/mfa", "/register", "/verification-pending", "/verify-email?token=audit",
  "/forgot-password", "/reset-password?token=audit",
  "/for-pawn-shops", "/missing-route",
].map((path) => ({ path, role: "GUEST" as const }));

const consumerRoutes = [
  "/buyer/dashboard", "/buyer/item-locator", "/buyer/sell-item", "/buyer/subscription",
  "/my-bids", "/my-wins", "/watchlist", "/saved-searches", "/shops/audit-shop/message",
  "/messages", "/buyer/messaging-profile", "/messages/audit-conversation",
  "/marketplace/listings/mine", "/marketplace/listings/received", "/marketplace/listings/new",
  "/marketplace/listings/audit-listing/edit", "/marketplace/purchases", "/marketplace/sales",
  "/marketplace/transactions/audit-transaction", "/offers", "/account/payment-methods",
  "/knowledge", "/knowledge/audit-lesson",
].map((path) => ({ path, role: "CONSUMER" as const }));

const ownerRoutes = [
  "/owner/application", "/owner", "/owner/finance", "/owner/onboarding", "/owner/shops/new",
  "/owner/items/new", "/owner/items/audit-item/edit", "/owner/inventory", "/owner/item-intakes",
  "/owner/integrations", "/owner/staff", "/owner/scan-console", "/owner/bulk-upload",
  "/owner/subscription", "/owner/locations", "/owner/messages", "/owner/messages/audit-conversation",
  "/owner/auctions", "/owner/auctions/new",
].map((path) => ({ path, role: "OWNER" as const }));

const adminChildren = [
  "", "users", "owners", "owner-applications", "shops", "inventory", "integrations",
  "auctions", "offers", "subscriptions", "orders", "reviews", "support", "revenue",
  "analytics", "risk", "audit", "system", "settings",
];

const superAdminChildren = [
  "", "owner-applications", "growth", "growth/leads", "growth/leads/audit-lead", "users",
  "shops", "shops/audit-shop/manage", "owners", "auctions", "offers", "inventory",
  "integrations", "plans/seller", "seller-subscriptions", "plans/buyer", "buyer-subscriptions",
  "settlements", "pricing", "revenue", "audit", "governance", "system", "platform-settings",
  "training",
];

export const AUDITED_ROUTES: AuditRoute[] = [
  ...publicRoutes,
  ...consumerRoutes,
  ...ownerRoutes,
  ...adminChildren.map((child) => ({ path: `/admin${child ? `/${child}` : ""}`, role: "ADMIN" as const })),
  ...superAdminChildren.map((child) => ({ path: `/super-admin${child ? `/${child}` : ""}`, role: "SUPER_ADMIN" as const })),
];

export const REPRESENTATIVE_INTERACTION_ROUTES: AuditRoute[] = [
  { path: "/login", role: "GUEST" },
  { path: "/marketplace", role: "GUEST" },
  { path: "/marketplace/buy-now", role: "GUEST" },
  { path: "/buyer/sell-item", role: "CONSUMER" },
  { path: "/offers", role: "CONSUMER" },
  { path: "/owner", role: "OWNER" },
  { path: "/owner/inventory", role: "OWNER" },
  { path: "/admin", role: "ADMIN" },
  { path: "/admin/users", role: "ADMIN" },
  { path: "/super-admin", role: "SUPER_ADMIN" },
  { path: "/super-admin/platform-settings", role: "SUPER_ADMIN" },
];
