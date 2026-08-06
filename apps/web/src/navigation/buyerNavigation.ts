export type BuyerNavigationItem = {
  readonly to: string;
  readonly label: string;
  readonly end?: boolean;
};

/**
 * Authenticated buyer destinations backed by registered routes and existing
 * pages. Visibility is discoverability only; route guards and APIs continue to
 * enforce authorization.
 */
export const BUYER_NAVIGATION = [
  { to: "/buyer/dashboard", label: "Buyer Dashboard" },
  { to: "/my-bids", label: "My Bids" },
  { to: "/my-wins", label: "My Wins" },
  { to: "/marketplace/purchases", label: "My Purchases" },
  { to: "/offers", label: "Offers" },
  { to: "/watchlist", label: "Watchlist" },
  { to: "/saved-searches", label: "Saved Searches" },
  { to: "/marketplace/listings/mine", label: "My Listings" },
  { to: "/marketplace/listings/new", label: "Create Listing" },
  { to: "/account/payment-methods", label: "Payment Methods" },
  { to: "/knowledge", label: "Knowledge Center" },
] as const satisfies readonly BuyerNavigationItem[];

export const BUYER_PATHS = {
  dashboard: "/buyer/dashboard",
  bids: "/my-bids",
  wins: "/my-wins",
  purchases: "/marketplace/purchases",
  offers: "/offers",
  watchlist: "/watchlist",
  savedSearches: "/saved-searches",
  listings: "/marketplace/listings/mine",
  createListing: "/marketplace/listings/new",
  paymentMethods: "/account/payment-methods",
  knowledge: "/knowledge",
} as const;
