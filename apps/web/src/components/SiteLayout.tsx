// File: apps/web/src/components/SiteLayout.tsx

import { useMemo, type CSSProperties } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { getAuthRole, logout, type Role } from "../services/auth";

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
  { to: "/admin", label: "Admin" },
  { to: "/admin/subscriptions", label: "Admin Subscriptions" },
];

const ADMIN_SECONDARY_NAV: NavItem[] = [
  { to: "/admin/users", label: "Users" },
  { to: "/admin/shops", label: "Shops" },
  { to: "/admin/auctions", label: "Auctions" },
  { to: "/admin/offers", label: "Offers" },
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
  if (!role) return "Guest";
  return role;
}

function getDashboardHref(role: Role | null) {
  if (role === "ADMIN") return "/admin";
  if (role === "OWNER") return "/owner";
  if (role === "CONSUMER") return "/my-bids";
  return "/login";
}

export default function SiteLayout() {
  const navigate = useNavigate();
  const role = getAuthRole();

  const isAdmin = role === "ADMIN";
  const showBuyerLinks = role === "CONSUMER" || isAdmin;
  const showOwnerLinks = role === "OWNER" || isAdmin;
  const showAdminLinks = isAdmin;
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
      ...(showGuestLinks ? GUEST_NAV : []),
    ]);

    const workspace = dedupeNav([
      ...(showBuyerLinks ? BUYER_SECONDARY_NAV : []),
      ...(showOwnerLinks ? OWNER_PRIMARY_NAV.slice(2) : []),
      ...(showOwnerLinks ? OWNER_ACTION_NAV : []),
      ...(showAdminLinks ? ADMIN_PRIMARY_NAV : []),
      ...(showAdminLinks ? ADMIN_SECONDARY_NAV : []),
    ]);

    const footer = dedupeNav([
      ...PUBLIC_NAV,
      ...(showBuyerLinks ? BUYER_PRIMARY_NAV : []),
      ...(showBuyerLinks ? BUYER_SECONDARY_NAV : []),
      ...(showOwnerLinks ? OWNER_PRIMARY_NAV : []),
      ...(showAdminLinks ? ADMIN_PRIMARY_NAV : []),
      ...(showGuestLinks ? GUEST_NAV : []),
    ]);

    return {
      primaryLinks: primary,
      workspaceLinks: workspace,
      footerLinks: footer,
      dashboardHref: getDashboardHref(role),
      roleBadge: getRoleBadgeLabel(role),
    };
  }, [role, showAdminLinks, showBuyerLinks, showGuestLinks, showOwnerLinks]);

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
            <Link to="/" className="brand" style={styles.brand} aria-label="PawnShop Marketplace home">
              <span>PawnShop Marketplace</span>
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

      <footer style={styles.footer}>
        <div style={styles.footerInner}>
          <div style={styles.footerBrandRow}>
            <div className="brand" style={styles.brand}>
              <span>PawnShop Marketplace</span>
            </div>
            <div style={styles.footerMeta}>
              Buyer, owner, and admin marketplace workflows in one place.
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
    backdropFilter: "blur(10px)",
    position: "sticky",
    top: 0,
    zIndex: 20,
  },
  headerInner: {
    maxWidth: 1280,
    margin: "0 auto",
    padding: "16px 20px 18px",
    display: "grid",
    gap: 14,
  },
  topRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
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
    textDecoration: "none",
    color: "#eef2ff",
    fontWeight: 900,
    fontSize: 18,
    letterSpacing: "-0.02em",
  },
  roleBadge: {
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    padding: "8px 10px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.12)",
  },
  headerButtonPrimary: {
    textDecoration: "none",
    color: "#0b1020",
    background: "#eef2ff",
    borderRadius: 12,
    padding: "10px 14px",
    fontWeight: 800,
  },
  headerButtonSecondary: {
    textDecoration: "none",
    color: "#eef2ff",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 12,
    padding: "10px 14px",
    fontWeight: 800,
  },
  primaryNav: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
    alignItems: "center",
  },
  workspaceRow: {
    display: "grid",
    gap: 8,
  },
  workspaceLabel: {
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: "rgba(238,242,255,0.62)",
  },
  workspaceLinks: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    alignItems: "center",
  },
  workspaceLink: {
    textDecoration: "none",
    color: "#eef2ff",
    border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(255,255,255,0.04)",
    borderRadius: 999,
    padding: "8px 12px",
    fontSize: 13,
    fontWeight: 700,
  },
  workspaceLinkActive: {
    background: "rgba(99,102,241,0.18)",
    border: "1px solid rgba(129,140,248,0.35)",
  },
  main: {
    maxWidth: 1280,
    width: "100%",
    margin: "0 auto",
    padding: "24px 20px 40px",
  },
  footer: {
    borderTop: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(11,16,32,0.92)",
  },
  footerInner: {
    maxWidth: 1280,
    margin: "0 auto",
    padding: "16px 20px 28px",
    display: "grid",
    gap: 12,
  },
  footerBrandRow: {
    display: "grid",
    gap: 6,
  },
  footerMeta: {
    color: "rgba(238,242,255,0.66)",
    fontSize: 13,
  },
  footerLinks: {
    display: "flex",
    gap: 14,
    flexWrap: "wrap",
    alignItems: "center",
  },
};