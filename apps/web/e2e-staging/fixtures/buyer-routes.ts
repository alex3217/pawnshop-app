export const buyerReadOnlyRoutes = [
  { path: "/buyer/dashboard", label: "buyer dashboard" },
  { path: "/marketplace", label: "marketplace" },
  { path: "/buyer/item-locator", label: "item locator" },
  { path: "/watchlist", label: "watchlist" },
  { path: "/saved-searches", label: "saved searches" },
  { path: "/offers", label: "offers" },
  { path: "/my-bids", label: "bids" },
  { path: "/my-wins", label: "wins" },
  { path: "/marketplace/purchases", label: "purchases" },
] as const;

export const buyerForbiddenRoutes = ["/owner", "/admin"] as const;
