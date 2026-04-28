// File: apps/web/src/components/SiteLayout.tsx

import { useMemo, type CSSProperties } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { getAuthRole, logout, type Role } from "../services/auth";
import ScrollToTopButton from "./ScrollToTopButton";

type NavItem = {
  to: string;
  label: string;
  end?: boolean;
};

const PUBLIC_NAV: NavItem[] = [
  { to: "/", label: "Home", end: true },
  { to: "/marketplace", label: "Marketplace" },
  { to: "/shops", label: "Shops" },
  { to: "/auctions", label: "Auctions" },
];

const BUYER_PRIMARY_NAV: NavItem[] = [
  { to: "/my-bids", label: "My Bids" },
  { to: "/my-wins", label: "My Wins" },
  { to: "/offers", label: "Offers" },
];

const BUYER_SECONDARY_NAV: NavItem[] = [
  { to: "/watchlist", label: "Watchlist" },
  { to: "/saved-searches", label: "Saved Searches" },
];

const OWNER_PRIMARY_NAV: NavItem[] = [
  { to: "/owner", label: "Owner Dashboard", end: true },
  { to: "/owner/inventory", label: "Inventory" },
  { to: "/owner/locations", label: "Locations" },
  { to: "/owner/staff", label: "Staff" },
  { to: "/owner/auctions", label: "My Auctions" },
  { to: "/owner/subscription", label: "Subscription" },
];

const OWNER_ACTION_NAV: NavItem[] = [
  { to: "/owner/auctions/new", label: "Create Auction" },
  { to: "/owner/items/new", label: "Create Item" },
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
  { to: "/super-admin/users", label: "Platform Users" },
  { to: "/super-admin/shops", label: "Platform Shops" },
];

const SUPER_ADMIN_SECONDARY_NAV: NavItem[] = [
  { to: "/super-admin/plans/seller", label: "Seller Plans" },
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
  return role || "Guest";
}

function getDashboardHref(role: Role | null) {
  if (role === "SUPER_ADMIN") return "/super-admin";
  if (role === "ADMIN") return "/admin";
  if (role === "OWNER") return "/owner";
  if (role === "CONSUMER") return "/my-bids";
  return "/login";
}

export default function SiteLayout() {
  const navigate = useNavigate();
  const role = getAuthRole();

  const isSuperAdmin = role === "SUPER_ADMIN";
  const isAdmin = role === "ADMIN";
  const showBuyerLinks = role === "CONSUMER" || isAdmin || isSuperAdmin;
  const showOwnerLinks = role === "OWNER" || isAdmin || isSuperAdmin;
  const showAdminLinks = isAdmin;
  const showSuperAdminLinks = isSuperAdmin;
  const showGuestLinks = !role;

  const {
    primaryLinks,
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
      ...(showBuyerLinks ? BUYER_SECONDARY_NAV : []),
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
      ...(showOwnerLinks ? OWNER_PRIMARY_NAV : []),
      ...(showAdminLinks ? ADMIN_PRIMARY_NAV : []),
      ...(showSuperAdminLinks ? SUPER_ADMIN_PRIMARY_NAV : []),
      ...(showGuestLinks ? GUEST_NAV : []),
    ]);

    return {
      primaryLinks: primary,
      workspaceLinks: workspace,
      footerLinks: footer,
      dashboardHref: getDashboardHref(role),
      roleBadge: getRoleBadgeLabel(role),
    };
  }, [
    role,
    showAdminLinks,
    showBuyerLinks,
    showGuestLinks,
    showOwnerLinks,
    showSuperAdminLinks,
  ]);

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `nav-link${isActive ? " active" : ""}`;

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <div style={styles.shell}>
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div style={styles.topRow}>
            <Link
              to="/"
              className="brand"
              style={styles.brand}
              aria-label="PawnLoop Marketplace home"
            >
              <span>PawnLoop Marketplace</span>
            </Link>

            <div style={styles.topRowRight}>
              <span style={styles.roleBadge}>{roleBadge}</span>

              {role ? (
                <>
                  <Link to={dashboardHref} style={styles.headerButtonPrimary}>
                    Dashboard
                  </Link>

                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleLogout}
                    style={styles.headerButtonSecondary}
                  >
                    Logout
                  </button>
                </>
              ) : (
                <>
                  <Link to="/login" style={styles.headerButtonSecondary}>
                    Login
                  </Link>
                  <Link to="/register" style={styles.headerButtonPrimary}>
                    Register
                  </Link>
                </>
              )}
            </div>
          </div>

          <nav style={styles.primaryNav} aria-label="Primary navigation">
            {primaryLinks.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={navLinkClass}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          {workspaceLinks.length > 0 ? (
            <div style={styles.workspaceRow}>
              <div style={styles.workspaceLabel}>Workspace</div>

              <div style={styles.workspaceLinks}>
                {workspaceLinks.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    style={({ isActive }) => ({
                      ...styles.workspaceLink,
                      ...(isActive ? styles.workspaceLinkActive : {}),
                    })}
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </header>

      <main style={styles.main}>
        <Outlet />
      </main>

      <ScrollToTopButton />

      <footer style={styles.footer}>
        <div style={styles.footerInner}>
          <div style={styles.footerBrandRow}>
            <div className="brand" style={styles.brand}>
              <span>PawnLoop Marketplace</span>
            </div>
            <div style={styles.footerMeta}>
              Real-time pawnshop inventory, auctions, and payments in one place. Operated by Bealtair LLC.
            </div>
          </div>

          <div style={styles.footerLinks}>
            {footerLinks.map((item) => (
              <Link key={item.to} className="footer-link" to={item.to}>
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  shell: {
    minHeight: "100vh",
    display: "grid",
    gridTemplateRows: "auto 1fr auto",
    background: "#0b1020",
    color: "#eef2ff",
  },
  header: {
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(11,16,32,0.92)",
  },
  headerInner: {
    maxWidth: 1440,
    margin: "0 auto",
    padding: "18px 20px",
    display: "grid",
    gap: 14,
  },
  topRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
  },
  topRowRight: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  brand: {
    color: "#ffffff",
    fontWeight: 900,
    fontSize: 20,
    textDecoration: "none",
  },
  roleBadge: {
    border: "1px solid rgba(255,255,255,0.16)",
    borderRadius: 999,
    padding: "6px 10px",
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "#dbeafe",
    background: "rgba(59,130,246,0.12)",
  },
  headerButtonPrimary: {
    borderRadius: 10,
    padding: "8px 12px",
    background: "#6366f1",
    color: "#ffffff",
    fontWeight: 800,
    textDecoration: "none",
  },
  headerButtonSecondary: {
    borderRadius: 10,
    padding: "8px 12px",
    background: "rgba(255,255,255,0.08)",
    color: "#ffffff",
    fontWeight: 800,
    textDecoration: "none",
    border: "1px solid rgba(255,255,255,0.12)",
    cursor: "pointer",
  },
  primaryNav: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  workspaceRow: {
    display: "grid",
    gap: 8,
    paddingTop: 10,
    borderTop: "1px solid rgba(255,255,255,0.08)",
  },
  workspaceLabel: {
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#94a3b8",
  },
  workspaceLinks: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  workspaceLink: {
    color: "#cbd5e1",
    textDecoration: "none",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 999,
    padding: "7px 10px",
    fontSize: 13,
    fontWeight: 800,
    background: "rgba(255,255,255,0.04)",
  },
  workspaceLinkActive: {
    color: "#ffffff",
    borderColor: "rgba(99,102,241,0.7)",
    background: "rgba(99,102,241,0.22)",
  },
  main: {
    width: "100%",
  },
  footer: {
    borderTop: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(11,16,32,0.92)",
  },
  footerInner: {
    maxWidth: 1440,
    margin: "0 auto",
    padding: "20px",
    display: "grid",
    gap: 12,
  },
  footerBrandRow: {
    display: "grid",
    gap: 6,
  },
  footerMeta: {
    color: "#94a3b8",
    fontSize: 14,
  },
  footerLinks: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
  },
};