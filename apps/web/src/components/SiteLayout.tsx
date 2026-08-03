// File: apps/web/src/components/SiteLayout.tsx

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  getAuthRole,
  getAuthToken,
  logout,
  type Role,
} from "../services/auth";
import {
  getMyShopAccess,
  type ShopAccessSnapshot,
} from "../services/shopAccess";
import ScrollToTopButton from "./ScrollToTopButton";
import NavigationTour from "./onboarding/NavigationTour";
import RoleSetupChecklist from "./onboarding/RoleSetupChecklist";
import NotificationCenter from "./NotificationCenter";
import "../styles/site-layout.css";

type NavItem = {
  to: string;
  label: string;
  end?: boolean;
};

type FooterGroup = {
  label: string;
  links: NavItem[];
};

const COMPACT_PRIMARY_NAV_PATHS = new Set([
  "/marketplace/buy-now",
  "/buyer/item-locator",
  "/buyer/sell-item",
  "/shops",
  "/auctions",
]);

const PUBLIC_NAV: NavItem[] = [
  {
    to: "/for-pawn-shops",
    label: "Own a Pawn Shop?",
  },
  { to: "/", label: "Home", end: true },
  { to: "/marketplace", label: "Marketplace" },
  { to: "/marketplace/buy-now", label: "Buy Now" },
  { to: "/buyer/item-locator", label: "Item Locator" },
  { to: "/buyer/sell-item", label: "Sell or Pawn" },
  { to: "/shops", label: "Shops" },
  { to: "/auctions", label: "Auctions" },
];

const BUYER_PRIMARY_NAV: NavItem[] = [
  { to: "/buyer/dashboard", label: "Buyer Dashboard" },
  { to: "/buyer/sell-item#new-item", label: "Sell or Pawn" },
  { to: "/marketplace/purchases", label: "My Purchases" },
  { to: "/my-bids", label: "My Bids" },
  { to: "/offers", label: "Offers" },
  { to: "/watchlist", label: "Watchlist" },
];

const BUYER_SECONDARY_NAV: NavItem[] = [
  { to: "/buyer/workspace", label: "My Activity" },
  { to: "/my-wins", label: "My Wins" },
  { to: "/saved-searches", label: "Saved Searches" },
  { to: "/buyer/success", label: "Buyer Success Center" },
  { to: "/buyer/subscription", label: "Buyer Subscription" },
  { to: "/account/payment-methods", label: "Payment Methods" },
  { to: "/buyer/settings", label: "Account Settings" },
  { to: "/buyer/help", label: "Help Center" },
];

const BUYER_SELLING_NAV: NavItem[] = [
  { to: "/buyer/sell-item#new-item", label: "Start selling or pawning" },
  { to: "/buyer/sell-item#my-submissions", label: "My item submissions" },
  { to: "/buyer/sell-item#shop-offers", label: "Pawnshop offers" },
  { to: "/marketplace/listings/mine", label: "My marketplace listings" },
  { to: "/marketplace/sales", label: "My marketplace sales" },
];

const BUYER_SECONDARY_GROUPS = [
  { label: "Selling & Pawning", links: BUYER_SELLING_NAV },
  { label: "Shopping activity", links: BUYER_SECONDARY_NAV.filter((item) => ["/buyer/workspace", "/my-wins"].includes(item.to)) },
  { label: "Saved tools", links: BUYER_SECONDARY_NAV.filter((item) => ["/saved-searches", "/buyer/success"].includes(item.to)) },
  { label: "Billing & account", links: BUYER_SECONDARY_NAV.filter((item) => ["/buyer/subscription", "/account/payment-methods", "/buyer/settings"].includes(item.to)) },
  { label: "Help", links: BUYER_SECONDARY_NAV.filter((item) => item.to === "/buyer/help") },
] as const;

const STAFF_AUCTION_NAV: NavItem[] = [
  {
    to: "/owner/auctions",
    label: "Shop Auctions",
  },
];

const STAFF_AUCTION_ACTION_NAV: NavItem[] = [
  {
    to: "/owner/auctions/new",
    label: "Create Auction",
  },
];

const OWNER_PRIMARY_NAV: NavItem[] = [
  { to: "/owner", label: "Owner Dashboard", end: true },
  { to: "/owner/application", label: "Application Status" },
  { to: "/owner/onboarding", label: "Setup Wizard" },
  { to: "/owner/inventory", label: "Inventory" },
  { to: "/owner/item-intakes", label: "Intake Review" },
  { to: "/owner/integrations", label: "Integrations" },
  { to: "/owner/marketing", label: "Marketing Center" },
  { to: "/owner/business-growth", label: "Business Growth" },
  {
    to: "/marketplace/sales",
    label: "Marketplace Sales",
  },
  {
    to: "/marketplace/listings/mine",
    label: "My Listings",
  },
  { to: "/owner/finance", label: "Finance" },
  { to: "/owner/locations", label: "Locations" },
  { to: "/owner/staff", label: "Staff" },
  { to: "/owner/auctions", label: "My Auctions" },
  { to: "/owner/subscription", label: "Subscription" },
];

const OWNER_ACTION_NAV: NavItem[] = [
  { to: "/owner/auctions/new", label: "Create Auction" },
  { to: "/owner/items/new", label: "Create Item" },
  {
    to: "/marketplace/listings/new",
    label: "Create Listing",
  },
  { to: "/owner/shops/new", label: "Create Shop" },
  { to: "/owner/scan-console", label: "Scan Console" },
  { to: "/owner/bulk-upload", label: "Bulk Upload" },
];

const ADMIN_PRIMARY_NAV: NavItem[] = [
  { to: "/admin", label: "Admin Overview", end: true },
  { to: "/admin/subscriptions", label: "Admin Subscriptions" },
];

const ADMIN_SECONDARY_NAV: NavItem[] = [
  { to: "/admin/users", label: "Users" },
  { to: "/admin/shops", label: "Shops" },
  { to: "/admin/auctions", label: "Auctions" },
  { to: "/admin/offers", label: "Offers" },
];

const SUPER_ADMIN_PRIMARY_NAV: NavItem[] = [
  { to: "/super-admin", label: "Platform Overview", end: true },
  { to: "/super-admin/launch-readiness", label: "Launch War Room" },
  { to: "/super-admin/users", label: "Platform Users" },
  { to: "/super-admin/shops", label: "Platform Shops" },
];

const SUPER_ADMIN_SECONDARY_NAV: NavItem[] = [
  { to: "/super-admin/platform-success", label: "Platform Success" },
  { to: "/super-admin/marketing-administration", label: "Marketing Administration" },
  { to: "/super-admin/growth", label: "Growth Center" },
  { to: "/super-admin/plans/seller", label: "Seller Plans" },
  { to: "/super-admin/seller-subscriptions", label: "Seller Subscriptions" },
  { to: "/super-admin/plans/buyer", label: "Buyer Plans" },
  { to: "/super-admin/buyer-subscriptions", label: "Buyer Subscriptions" },
  { to: "/super-admin/revenue", label: "Platform Revenue" },
  { to: "/super-admin/settlements", label: "Settlements Control" },
  { to: "/super-admin/platform-settings", label: "Platform Settings" },
];

const GUEST_NAV: NavItem[] = [
  { to: "/login", label: "Login" },
  { to: "/register", label: "Register" },
];

function dedupeNav(items: NavItem[]) {
  const seen = new Set<string>();

  return items.filter((item) => {
    if (seen.has(item.to)) return false;
    seen.add(item.to);
    return true;
  });
}

function getRoleBadgeLabel(role: Role | null) {
  return role || "Browse as Guest";
}

function getDashboardHref(role: Role | null) {
  if (role === "SUPER_ADMIN") return "/super-admin";
  if (role === "ADMIN") return "/admin";
  if (role === "OWNER") return "/owner";
  if (role === "CONSUMER") return "/buyer/dashboard";
  return "/marketplace";
}

function getWorkspaceLabel(
  role: Role | null,
  isShopStaff = false,
) {
  if (role === "SUPER_ADMIN") {
    return "Platform Tools";
  }

  if (role === "ADMIN") {
    return "Admin Tools";
  }

  if (role === "OWNER") {
    return "Owner Tools";
  }

  if (
    role === "CONSUMER" &&
    isShopStaff
  ) {
    return "Shop Tools";
  }

  if (role === "CONSUMER") {
    return "Buyer Tools";
  }

  return "Account Tools";
}

export default function SiteLayout() {
  const navigate = useNavigate();
  const workspaceMenuRef = useRef<HTMLDetailsElement>(null);

  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") return "light";

    const savedTheme = window.localStorage.getItem("pawnloop-theme-v2");
    if (savedTheme === "dark" || savedTheme === "light") return savedTheme;

    return "light";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("pawnloop-theme-v2", theme);
  }, [theme]);

  const role = getAuthRole();

  const [
    shopAccess,
    setShopAccess,
  ] = useState<ShopAccessSnapshot | null>(
    null,
  );

  useEffect(() => {
    const token = getAuthToken();

    if (!role || !token) {
      setShopAccess(null);
      return;
    }

    const controller =
      new AbortController();

    void getMyShopAccess(
      controller.signal,
    )
      .then((access) => {
        setShopAccess(access);
      })
      .catch((error: unknown) => {
        if (
          error instanceof DOMException &&
          error.name === "AbortError"
        ) {
          return;
        }

        console.warn(
          "[SiteLayout] Failed to load "
            + "shop capabilities",
          error,
        );

        setShopAccess(null);
      });

    return () => {
      controller.abort();
    };
  }, [role]);

  const activeStaffMembership =
    shopAccess?.shops.find(
      (shop) =>
        shop.source === "STAFF",
    ) || null;

  const isShopStaff =
    role === "CONSUMER" &&
    Boolean(activeStaffMembership);

  const showStaffAuctionLinks =
    isShopStaff &&
    shopAccess?.capabilities
      .auctionsRead === true;

  const showStaffAuctionWriteLinks =
    showStaffAuctionLinks &&
    shopAccess?.capabilities
      .auctionsWrite === true;

  const staffRoleLabel =
    activeStaffMembership?.staffRole
      ?.replaceAll("_", " ") ||
    "SHOP STAFF";

  const isSuperAdmin = role === "SUPER_ADMIN";
  const isAdmin = role === "ADMIN";
  const showBuyerLinks = role === "CONSUMER" || isAdmin;
  const showOwnerLinks = role === "OWNER" || isAdmin;
  const showAdminLinks = isAdmin;
  const showSuperAdminLinks = isSuperAdmin;
  const showGuestLinks = !role;

  const {
    primaryLinks,
    compactPrimaryLinks,
    workspaceLinks,
    footerLinks,
    dashboardHref,
    roleBadge,
  } = useMemo(() => {
    const primary = dedupeNav([
      ...PUBLIC_NAV,
      ...(showBuyerLinks ? BUYER_PRIMARY_NAV : []),
      ...(showOwnerLinks ? OWNER_PRIMARY_NAV.slice(0, 2) : []),
      ...(showAdminLinks ? ADMIN_PRIMARY_NAV.slice(0, 1) : []),
      ...(showSuperAdminLinks ? SUPER_ADMIN_PRIMARY_NAV : []),
      ...(showGuestLinks ? GUEST_NAV : []),
    ]);

    const workspace = dedupeNav([
      ...(showBuyerLinks ? [...BUYER_SECONDARY_NAV, ...BUYER_SELLING_NAV] : []),
      ...(showStaffAuctionLinks
        ? STAFF_AUCTION_NAV
        : []),
      ...(showStaffAuctionWriteLinks
        ? STAFF_AUCTION_ACTION_NAV
        : []),
      ...(showOwnerLinks ? OWNER_PRIMARY_NAV.slice(2) : []),
      ...(showOwnerLinks ? OWNER_ACTION_NAV : []),
      ...(showAdminLinks ? ADMIN_PRIMARY_NAV : []),
      ...(showAdminLinks ? ADMIN_SECONDARY_NAV : []),
      ...(showSuperAdminLinks ? SUPER_ADMIN_PRIMARY_NAV : []),
      ...(showSuperAdminLinks ? SUPER_ADMIN_SECONDARY_NAV : []),
    ]);

    const footer = dedupeNav([
      ...PUBLIC_NAV,
      ...(showBuyerLinks ? BUYER_PRIMARY_NAV : []),
      ...(showBuyerLinks ? BUYER_SECONDARY_NAV : []),
      ...(showStaffAuctionLinks
        ? STAFF_AUCTION_NAV
        : []),
      ...(showStaffAuctionWriteLinks
        ? STAFF_AUCTION_ACTION_NAV
        : []),
      ...(showOwnerLinks ? OWNER_PRIMARY_NAV : []),
      ...(showAdminLinks ? ADMIN_PRIMARY_NAV : []),
      ...(showSuperAdminLinks ? SUPER_ADMIN_PRIMARY_NAV : []),
      ...(showGuestLinks ? GUEST_NAV : []),
      { to: "/terms", label: "Terms of Service" },
      { to: "/privacy", label: "Privacy Policy" },
    ]);

    return {
      primaryLinks: primary,
      compactPrimaryLinks: primary.filter((item) =>
        COMPACT_PRIMARY_NAV_PATHS.has(item.to),
      ),
      workspaceLinks: workspace,
      footerLinks: footer,
      dashboardHref:
        isShopStaff &&
        showStaffAuctionLinks
          ? "/owner/auctions"
          : getDashboardHref(role),
      roleBadge:
        isShopStaff
          ? staffRoleLabel
          : getRoleBadgeLabel(role),
    };
  }, [
    isShopStaff,
    role,
    showAdminLinks,
    showBuyerLinks,
    showGuestLinks,
    showOwnerLinks,
    showStaffAuctionLinks,
    showStaffAuctionWriteLinks,
    showSuperAdminLinks,
    staffRoleLabel,
  ]);

  const footerGroups = useMemo<FooterGroup[]>(() => {
    const explorePaths = new Set(PUBLIC_NAV.map((item) => item.to));
    const accountPaths = new Set([
      ...BUYER_PRIMARY_NAV,
      ...BUYER_SECONDARY_NAV,
      ...GUEST_NAV,
    ].map((item) => item.to));
    const legalPaths = new Set(["/terms", "/privacy"]);

    const groups: FooterGroup[] = [
      {
        label: "Explore",
        links: footerLinks.filter((item) => explorePaths.has(item.to)),
      },
      {
        label: "Account",
        links: footerLinks.filter((item) => accountPaths.has(item.to)),
      },
      {
        label: "Workspace",
        links: footerLinks.filter(
          (item) =>
            !explorePaths.has(item.to) &&
            !accountPaths.has(item.to) &&
            !legalPaths.has(item.to),
        ),
      },
      {
        label: "Legal & help",
        links: footerLinks.filter((item) => legalPaths.has(item.to)),
      },
    ];

    return groups.filter((group) => group.links.length > 0);
  }, [footerLinks]);

  function handleLogout() {
    setShopAccess(null);
    logout();
    navigate("/login", { replace: true });
  }

  useEffect(() => {
    function closeWorkspaceOnEscape(event: KeyboardEvent) {
      const menu = workspaceMenuRef.current;
      if (event.key !== "Escape" || !menu?.open) return;
      menu.open = false;
      menu.querySelector("summary")?.focus();
    }
    document.addEventListener("keydown", closeWorkspaceOnEscape);
    return () => document.removeEventListener("keydown", closeWorkspaceOnEscape);
  }, []);

  return (
    <div className="site-shell">
      <header className="site-header">
        <div className="site-header-inner">
          <div className="site-top-row">
            <Link
              to="/"
              className="site-brand"
              aria-label="PawnLoop home"
              data-tour="brand"
            >
              <span className="site-header-logo-frame">
                <img
                  src="/branding/pawnloop-header-final.png"
                  alt="PawnLoop — Buy. Sell. Loan. Repeat."
                  className="site-header-logo"
                />
              </span>
            </Link>

            <div className="site-top-actions">
              <Link
                to={dashboardHref}
                className="site-role-badge"
                data-tour="role-badge"
                aria-label={
                  role
                    ? `Open ${roleBadge} dashboard`
                    : "Browse the marketplace as a guest"
                }
              >
                {roleBadge}
              </Link>

              <button
                type="button"
                className="site-theme-toggle"
                data-tour="theme-toggle"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              >
                {theme === "dark" ? "Theme: Dark" : "Theme: Light"}
              </button>

              {role ? (
                <>
                  <NotificationCenter />
                  {role !== "CONSUMER" ? <Link
                    to={dashboardHref}
                    className="site-primary-button"
                    data-tour="dashboard-button"
                  >Dashboard</Link> : null}

                  <button
                    type="button"
                    className="site-secondary-button"
                    onClick={handleLogout}
                  >
                    Logout
                  </button>
                </>
              ) : (
                <>
                  <Link to="/login" className="site-secondary-button">
                    Login
                  </Link>
                  <Link to="/register" className="site-primary-button">
                    Register
                  </Link>
                </>
              )}
            </div>
          </div>

          <nav
            className="site-primary-nav"
            aria-label="Primary navigation"
            data-tour="primary-navigation"
          >
            {primaryLinks.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  [
                    "site-nav-link",
                    COMPACT_PRIMARY_NAV_PATHS.has(item.to)
                      ? "site-nav-link--compact"
                      : "",
                    isActive ? "active" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")
                }
              >
                {item.label}
              </NavLink>
            ))}

            {compactPrimaryLinks.length > 0 ? (
              <details className="site-primary-more-menu">
                <summary className="site-primary-more-trigger">
                  <span>More</span>
                  <span aria-hidden="true">⌄</span>
                </summary>

                <div className="site-primary-more-panel">
                  {compactPrimaryLinks.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      className={({ isActive }) =>
                        isActive
                          ? "site-workspace-menu-link active"
                          : "site-workspace-menu-link"
                      }
                    >
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              </details>
            ) : null}
          </nav>

          {workspaceLinks.length > 0 ? (
            <details
              ref={workspaceMenuRef}
              className="site-workspace-menu"
              data-tour="workspace-menu"
            >
              <summary className="site-workspace-trigger">
                <span>
                  {getWorkspaceLabel(
                    role,
                    isShopStaff,
                  )}
                </span>
                <span aria-hidden="true">⌄</span>
              </summary>

              <div className="site-workspace-panel">
                {showBuyerLinks ? BUYER_SECONDARY_GROUPS.map((group) => <section className="site-workspace-group" key={group.label} aria-labelledby={`buyer-nav-${group.label.replaceAll(" ", "-").toLowerCase()}`}><h2 id={`buyer-nav-${group.label.replaceAll(" ", "-").toLowerCase()}`}>{group.label}</h2>{group.links.map((item) => <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => isActive ? "site-workspace-menu-link active" : "site-workspace-menu-link"}>{item.label}</NavLink>)}</section>) : null}
                {workspaceLinks.filter((item) => !showBuyerLinks || ![...BUYER_SECONDARY_NAV, ...BUYER_SELLING_NAV].some((buyerItem) => buyerItem.to === item.to)).map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      isActive
                        ? "site-workspace-menu-link active"
                        : "site-workspace-menu-link"
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </details>
          ) : null}
        </div>
      </header>

      <main className="site-main" data-tour="main-content">
        <Outlet />
      </main>

      <ScrollToTopButton />
      <NavigationTour role={role} />
      {role === "OWNER" ? <RoleSetupChecklist role={role} /> : null}

      <footer className="site-footer">
        <div className="site-footer-inner">
          <div>
            <div className="site-footer-brand">
              <img
                src="/branding/pawnloop-header-final.png"
                alt="PawnLoop — Buy. Sell. Loan. Repeat."
                className="site-footer-logo"
              />
            </div>
            <p>
              Real-time pawnshop inventory, auctions, and payments in one place.
              Operated by Bealtair LLC.
            </p>
          </div>

          <div className="site-footer-links" aria-label="Footer navigation">
            {footerGroups.map((group) => (
              <nav
                key={group.label}
                className="site-footer-link-group"
                aria-label={`${group.label} links`}
              >
                <h2>{group.label}</h2>
                {group.links.map((item) => (
                  <Link key={item.to} to={item.to}>
                    {item.label}
                  </Link>
                ))}
                {group.label === "Legal & help" ? (
                  <button
                    type="button"
                    className="navigation-assistance-footer-control"
                    onClick={() => {
                      window.dispatchEvent(
                        new Event("pawnloop:open-navigation-assistance"),
                      );
                    }}
                  >
                    Navigation Assistance
                  </button>
                ) : null}
              </nav>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
