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
  { path: "/marketplace/listings/mine", label: "buyer listings" },
  { path: "/account/payment-methods", label: "payment methods" },
  { path: "/knowledge", label: "knowledge center" },
] as const;

export const buyerForbiddenRoutes = ["/owner", "/admin"] as const;
