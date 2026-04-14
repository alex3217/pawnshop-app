// File: apps/web/src/pages/HomePage.tsx

import { Link } from "react-router-dom";
import { getAuthRole } from "../services/auth";

export default function HomePage() {
  const role = getAuthRole();

  return (
    <div className="page-stack">
      <section className="hero">
        <div className="hero-content">
          <div className="hero-badge">Live marketplace + auction platform</div>

          <h1 className="hero-title">
            Discover local pawn inventory and bid on live auctions in one place.
          </h1>

          <p className="hero-subtitle">
            Browse verified shop inventory, explore active auctions, create listings,
            and manage marketplace activity through a single web experience built to
            expand into native mobile.
          </p>

          <div className="hero-actions">
            <Link to="/marketplace" className="btn btn-primary">
              Browse Marketplace
            </Link>

            <Link to="/auctions" className="btn btn-secondary">
              Browse Auctions
            </Link>

            {!role ? (
              <Link to="/register" className="btn btn-secondary">
                Create Account
              </Link>
            ) : null}

            {role === "OWNER" ? (
              <Link to="/owner" className="btn btn-secondary">
                Owner Dashboard
              </Link>
            ) : null}

            {role === "ADMIN" ? (
              <Link to="/admin/users" className="btn btn-secondary">
                Admin Panel
              </Link>
            ) : null}
          </div>
        </div>

        <div className="hero-panel">
          <div className="stat-card">
            <div className="stat-label">Marketplace</div>
            <div className="stat-value">Live listings + auctions</div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Primary Flow</div>
            <div className="stat-value">Browse · Bid · Inquire</div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Operator Flow</div>
            <div className="stat-value">List · Auction · Moderate</div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Platform</div>
            <div className="stat-value">Web now · Native mobile next</div>
          </div>
        </div>
      </section>

      <section className="grid grid-2">
        <div className="page-card">
          <div className="section-title">For Buyers</div>
          <p className="section-subtitle">
            Browse inventory across pawnshop stores, view item details, and join live auctions.
          </p>

          <div className="stack">
            <div className="list-card">
              <strong>Browse marketplace inventory</strong>
              <span className="muted">
                Search items across pawnshop stores and compare inventory in one place.
              </span>
            </div>

            <div className="list-card">
              <strong>Bid in real time</strong>
              <span className="muted">
                Place bids, track price movement, and stay in the action.
              </span>
            </div>

            <div className="list-card">
              <strong>Send inquiries</strong>
              <span className="muted">
                Contact shops about items before you commit.
              </span>
            </div>
          </div>
        </div>

        <div className="page-card">
          <div className="section-title">For Pawn Shop Owners</div>
          <p className="section-subtitle">
            Manage inventory and launch auctions from a single dashboard.
          </p>

          <div className="stack">
            <div className="list-card">
              <strong>Create item listings</strong>
              <span className="muted">
                Add inventory with title, category, pricing, and condition.
              </span>
            </div>

            <div className="list-card">
              <strong>Launch auctions</strong>
              <span className="muted">
                Turn inventory into live auction listings with pricing controls.
              </span>
            </div>

            <div className="list-card">
              <strong>Grow across platforms</strong>
              <span className="muted">
                Use the web platform now and expand into native mobile next.
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}