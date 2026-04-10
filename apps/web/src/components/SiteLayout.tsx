// File: apps/web/src/components/SiteLayout.tsx

import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { getAuthRole, logout } from "../services/auth";

export default function SiteLayout() {
  const nav = useNavigate();
  const role = getAuthRole();

  function onLogout() {
    logout();
    nav("/login");
  }

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `nav-link${isActive ? " active" : ""}`;

  const showMyBids = role === "CONSUMER" || role === "ADMIN";

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="container topbar-inner">
          <Link to="/" className="brand" aria-label="PawnShop Marketplace home">
            <span className="brand-mark">P</span>
            <span>PawnShop Marketplace</span>
          </Link>

          <nav className="nav-links" aria-label="Primary navigation">
            <NavLink to="/" end className={navLinkClass}>
              Home
            </NavLink>

            <NavLink to="/auctions" className={navLinkClass}>
              Auctions
            </NavLink>

            {showMyBids ? (
              <NavLink to="/my-bids" className={navLinkClass}>
                My Bids
              </NavLink>
            ) : null}

            {!role ? (
              <>
                <NavLink to="/login" className={navLinkClass}>
                  Login
                </NavLink>

                <NavLink to="/register" className={navLinkClass}>
                  Register
                </NavLink>
              </>
            ) : null}

            {role === "OWNER" ? (
              <>
                <NavLink to="/owner" end className={navLinkClass}>
                  Owner Dashboard
                </NavLink>

                <NavLink to="/owner/auctions" className={navLinkClass}>
                  My Auctions
                </NavLink>

                <NavLink to="/owner/subscription" className={navLinkClass}>
                  Subscription
                </NavLink>

                <NavLink to="/owner/items/new" className={navLinkClass}>
                  Create Item
                </NavLink>

                <NavLink to="/owner/auctions/new" className={navLinkClass}>
                  Create Auction
                </NavLink>
              </>
            ) : null}

            {role === "ADMIN" ? (
              <>
                <NavLink to="/admin/users" className={navLinkClass}>
                  Admin Users
                </NavLink>

                <NavLink to="/admin/items" className={navLinkClass}>
                  Admin Items
                </NavLink>

                <NavLink to="/admin/subscription" className={navLinkClass}>
                  Subscription
                </NavLink>
              </>
            ) : null}
          </nav>

          <div className="topbar-actions">
            {role ? (
              <span className="pill">{role}</span>
            ) : (
              <span className="pill pill-muted">Guest</span>
            )}

            {role ? (
              <button type="button" className="btn btn-secondary" onClick={onLogout}>
                Logout
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <main className="page-main">
        <div className="container">
          <Outlet />
        </div>
      </main>

      <footer className="footer">
        <div className="container footer-inner">
          <div>
            <div className="brand">
              <span className="brand-mark">P</span>
              <span>PawnShop Marketplace</span>
            </div>
            <div className="footer-copy">
              Browse inventory, manage listings, run auctions, and manage subscription plans.
            </div>
          </div>

          <div className="footer-links">
            <Link className="footer-link" to="/">
              Home
            </Link>

            <Link className="footer-link" to="/auctions">
              Auctions
            </Link>

            {showMyBids ? (
              <Link className="footer-link" to="/my-bids">
                My Bids
              </Link>
            ) : null}

            {!role ? (
              <>
                <Link className="footer-link" to="/login">
                  Login
                </Link>
                <Link className="footer-link" to="/register">
                  Register
                </Link>
              </>
            ) : null}

            {role === "OWNER" ? (
              <>
                <Link className="footer-link" to="/owner">
                  Owner Dashboard
                </Link>
                <Link className="footer-link" to="/owner/auctions">
                  My Auctions
                </Link>
              </>
            ) : null}
          </div>
        </div>
      </footer>
    </div>
  );
}