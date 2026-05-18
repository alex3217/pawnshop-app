import { useState } from "react";
import { Link } from "react-router-dom";
import "../styles/buyer-dashboard.css";

type ViewMode = "grid" | "list" | "map";

type BuyerItem = {
  id: string;
  title: string;
  price: string;
  shop: string;
  distance: string;
  meta: string;
  badge: string;
  action: string;
  href: string;
  x: number;
  y: number;
};

type BuyerShop = {
  id: string;
  name: string;
  distance: string;
  inventory: number;
  auctions: number;
  status: string;
};

const featuredItems: BuyerItem[] = [
  {
    id: "ps5",
    title: "PS5 Console Bundle",
    price: "$329",
    shop: "West End Pawn",
    distance: "2.1 mi",
    meta: "Gaming · Good condition",
    badge: "Accepts offers",
    action: "Make offer",
    href: "/marketplace",
    x: 30,
    y: 42,
  },
  {
    id: "gold-chain",
    title: "14K Gold Chain",
    price: "$420",
    shop: "Cash City Pawn",
    distance: "3.4 mi",
    meta: "Jewelry · Verified",
    badge: "Price drop",
    action: "View item",
    href: "/marketplace",
    x: 58,
    y: 34,
  },
  {
    id: "drill",
    title: "Milwaukee Drill Set",
    price: "$85 bid",
    shop: "Northline Pawn",
    distance: "4.8 mi",
    meta: "Tools · Tested",
    badge: "Ends soon",
    action: "Place bid",
    href: "/auctions",
    x: 68,
    y: 64,
  },
  {
    id: "watch",
    title: "Citizen Watch",
    price: "$145",
    shop: "Bayou Pawn",
    distance: "5.2 mi",
    meta: "Watches · Excellent",
    badge: "New arrival",
    action: "Watch item",
    href: "/marketplace",
    x: 42,
    y: 72,
  },
];

const shops: BuyerShop[] = [
  {
    id: "west-end",
    name: "West End Pawn",
    distance: "2.1 mi",
    inventory: 148,
    auctions: 12,
    status: "Open until 7 PM",
  },
  {
    id: "cash-city",
    name: "Cash City Pawn",
    distance: "3.4 mi",
    inventory: 92,
    auctions: 7,
    status: "Open now",
  },
  {
    id: "northline",
    name: "Northline Pawn",
    distance: "4.8 mi",
    inventory: 64,
    auctions: 5,
    status: "Closes soon",
  },
];

const actionItems = [
  {
    title: "You were outbid",
    body: "Milwaukee Drill Set ends in 22 minutes.",
    cta: "Bid again",
    href: "/auctions",
  },
  {
    title: "Counteroffer received",
    body: "Cash City Pawn responded on 14K Gold Chain.",
    cta: "Review offer",
    href: "/offers",
  },
  {
    title: "New saved-search matches",
    body: "8 new nearby items match your saved searches.",
    cta: "View matches",
    href: "/saved-searches",
  },
];

function StatCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="bd-stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{helper}</small>
    </div>
  );
}

function SectionTitle({
  eyebrow,
  title,
  link,
  linkLabel,
}: {
  eyebrow?: string;
  title: string;
  link?: string;
  linkLabel?: string;
}) {
  return (
    <div className="bd-section-title">
      <div>
        {eyebrow ? <p>{eyebrow}</p> : null}
        <h2>{title}</h2>
      </div>

      {link && linkLabel ? (
        <Link to={link} className="bd-section-link">
          {linkLabel}
        </Link>
      ) : null}
    </div>
  );
}

function ItemCard({ item, compact = false }: { item: BuyerItem; compact?: boolean }) {
  return (
    <article className={compact ? "bd-item-card bd-item-card-compact" : "bd-item-card"}>
      <div className="bd-item-image">
        <span className="bd-item-badge">{item.badge}</span>
        <span className="bd-item-distance">{item.distance}</span>
      </div>

      <div className="bd-item-body">
        <div className="bd-item-topline">
          <div>
            <h3>{item.title}</h3>
            <p>{item.shop}</p>
          </div>
          <strong>{item.price}</strong>
        </div>

        <p className="bd-item-meta">{item.meta}</p>

        <div className="bd-item-actions">
          <Link to={item.href} className="bd-primary-small">
            {item.action}
          </Link>
          <Link to="/watchlist" className="bd-secondary-small">
            Watch
          </Link>
        </div>
      </div>
    </article>
  );
}

export default function BuyerDashboardPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [locationStatus, setLocationStatus] = useState("Houston area");

  function useLocation() {
    if (!navigator.geolocation) {
      setLocationStatus("Location unavailable");
      return;
    }

    setLocationStatus("Finding your area...");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude.toFixed(2);
        const lng = position.coords.longitude.toFixed(2);
        setLocationStatus(`near ${lat}, ${lng}`);
      },
      () => {
        setLocationStatus("Houston area");
      },
      { enableHighAccuracy: false, timeout: 8000 },
    );
  }

  return (
    <main className="buyer-dashboard">
      <section className="bd-hero">
        <div className="bd-hero-copy">
          <span className="bd-pill">Buyer marketplace</span>
          <h1>Find local pawnshop deals worth checking today.</h1>
          <p>
            Discover nearby items, live auctions, favorite shops, saved-search
            matches, and pickup-ready inventory across different pawnshops.
          </p>

          <div className="bd-search-bar">
            <input placeholder="Search PS5, gold chain, tools, watches..." />
            <Link to="/marketplace" className="bd-primary">
              Search
            </Link>
            <button type="button" className="bd-secondary" onClick={useLocation}>
              Use location
            </button>
          </div>
        </div>

        <aside className="bd-hero-panel">
          <div className="bd-hero-panel-top">
            <span>Today {locationStatus}</span>
            <Link to="/marketplace">Browse all</Link>
          </div>

          <div className="bd-hero-grid">
            <div>
              <strong>148</strong>
              <span>nearby items</span>
            </div>
            <div>
              <strong>12</strong>
              <span>active auctions</span>
            </div>
            <div>
              <strong>8</strong>
              <span>saved matches</span>
            </div>
            <div>
              <strong>3</strong>
              <span>favorite shops</span>
            </div>
          </div>
        </aside>
      </section>

      <section className="bd-stats">
        <StatCard label="Active bids" value="3" helper="1 winning · 2 outbid" />
        <StatCard label="Offers" value="4" helper="1 counteroffer" />
        <StatCard label="Watchlist" value="9" helper="2 price drops" />
        <StatCard label="Saved matches" value="8" helper="New nearby items" />
        <StatCard label="Won auctions" value="1" helper="Payment needed" />
      </section>

      <section className="bd-attention">
        <SectionTitle eyebrow="Action needed" title="Needs your attention" />

        <div className="bd-attention-grid">
          {actionItems.map((item) => (
            <article key={item.title} className="bd-attention-card">
              <div>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </div>
              <Link to={item.href}>{item.cta}</Link>
            </article>
          ))}
        </div>
      </section>

      <section className="bd-discovery-grid">
        <div className="bd-map-card">
          <div className="bd-map-header">
            <div>
              <span className="bd-pill bd-pill-light">Local discovery</span>
              <h2>Items and pawnshops near you</h2>
              <p>Switch between grid, list, and map-style discovery.</p>
            </div>

            <div className="bd-view-toggle" aria-label="Buyer discovery view mode">
              {(["grid", "list", "map"] as ViewMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={viewMode === mode ? "active" : ""}
                  onClick={() => setViewMode(mode)}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          <div className="bd-map-stage">
            <div className="bd-map-user">You</div>

            {featuredItems.map((item) => (
              <Link
                key={item.id}
                to={item.href}
                className="bd-map-pin"
                style={{ left: `${item.x}%`, top: `${item.y}%` }}
                title={item.title}
              >
                <strong>{item.price}</strong>
                <span>{item.distance}</span>
              </Link>
            ))}

            <div className="bd-map-footer">
              <strong>Map-ready discovery</strong>
              <span>Real map provider can replace this panel later.</span>
              <Link to="/shops">View shops</Link>
            </div>
          </div>
        </div>

        <aside className="bd-shops-card">
          <SectionTitle title="Nearby pawnshops" link="/shops" linkLabel="View all" />

          <div className="bd-shop-list">
            {shops.map((shop) => (
              <Link key={shop.id} to="/shops" className="bd-shop-row">
                <div>
                  <h3>{shop.name}</h3>
                  <p>
                    {shop.distance} · {shop.status}
                  </p>
                </div>
                <span>
                  {shop.inventory} items
                  <small>{shop.auctions} auctions</small>
                </span>
              </Link>
            ))}
          </div>
        </aside>
      </section>

      <section className="bd-content-section">
        <SectionTitle
          eyebrow="Nearby"
          title="Attractive items close by"
          link="/marketplace"
          linkLabel="View marketplace"
        />

        {viewMode === "list" ? (
          <div className="bd-list-stack">
            {featuredItems.map((item) => (
              <ItemCard key={item.id} item={item} compact />
            ))}
          </div>
        ) : (
          <div className="bd-item-grid">
            {featuredItems.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </section>

      <section className="bd-lower-grid">
        <div className="bd-panel">
          <SectionTitle eyebrow="Deals" title="Deals near you" link="/marketplace" linkLabel="See deals" />
          <div className="bd-list-stack">
            {featuredItems.slice(0, 2).map((item) => (
              <ItemCard key={item.id} item={item} compact />
            ))}
          </div>
        </div>

        <div className="bd-panel">
          <SectionTitle eyebrow="Auctions" title="Ending soon" link="/auctions" linkLabel="View auctions" />
          <div className="bd-list-stack">
            {featuredItems.slice(2, 3).map((item) => (
              <ItemCard key={item.id} item={item} compact />
            ))}
          </div>
        </div>

        <div className="bd-panel">
          <SectionTitle eyebrow="Saved" title="New matches" link="/saved-searches" linkLabel="Open" />
          <div className="bd-link-list">
            <Link to="/saved-searches">PS5 under $400 nearby <span>8 new</span></Link>
            <Link to="/saved-searches">Gold jewelry under $500 <span>4 new</span></Link>
            <Link to="/saved-searches">Milwaukee tools ending soon <span>2 new</span></Link>
          </div>
        </div>
      </section>

      <section className="bd-quick-actions">
        <SectionTitle eyebrow="Quick actions" title="Keep shopping" />

        <div className="bd-actions-grid">
          <Link to="/buyer/item-locator">Item locator</Link>
          <Link to="/marketplace">Marketplace</Link>
          <Link to="/auctions">Auctions</Link>
          <Link to="/shops">Pawnshops</Link>
          <Link to="/watchlist">Watchlist</Link>
          <Link to="/my-bids">My bids</Link>
          <Link to="/offers">Offers</Link>
          <Link to="/my-wins">My wins</Link>
          <Link to="/saved-searches">Saved searches</Link>
        </div>
      </section>
    </main>
  );
}
