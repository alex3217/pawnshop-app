import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import "../styles/buyer-dashboard.css";
import { getMyBids, type BidRow } from "../services/bids";
import { getMyOffers, type Offer } from "../services/offers";
import { getMyWatchlist, type WatchlistEntry } from "../services/watchlist";
import { getMySavedSearches, type SavedSearch } from "../services/savedSearches";
import { getMySettlements, type Settlement } from "../services/settlements";

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

function normalizeStatus(value: unknown) {
  return String(value || "").trim().toUpperCase();
}

function isAuctionLive(row: BidRow) {
  const status = normalizeStatus(row.auction?.status);
  return !["ENDED", "CANCELED", "CANCELLED"].includes(status);
}

function getBidPosition(row: BidRow) {
  const bid = Number(row.amount);
  const current = Number(row.auction?.currentPrice);

  if (!Number.isFinite(bid) || !Number.isFinite(current)) return "Unknown";
  return bid >= current ? "Leading" : "Outbid";
}

function isPaymentNeeded(row: Settlement) {
  const status = normalizeStatus(row.status);
  return ["PENDING", "FAILED"].includes(status);
}

function settledValue<T>(
  result: PromiseSettledResult<T>,
  label: string,
  errors: string[],
): T | null {
  if (result.status === "fulfilled") return result.value;
  errors.push(label);
  return null;
}

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
  const [bids, setBids] = useState<BidRow[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>([]);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [refreshingDashboard, setRefreshingDashboard] = useState(false);
  const [dashboardError, setDashboardError] = useState("");

  async function loadBuyerDashboard(initial = false) {
    const errors: string[] = [];

    if (initial) {
      setDashboardLoading(true);
    } else {
      setRefreshingDashboard(true);
    }

    setDashboardError("");

    try {
      const [
        bidsResult,
        offersResult,
        watchlistResult,
        savedSearchesResult,
        settlementsResult,
      ] = await Promise.allSettled([
        getMyBids(),
        getMyOffers(),
        getMyWatchlist(),
        getMySavedSearches(),
        getMySettlements(),
      ]);

      const nextBids = settledValue(bidsResult, "bids", errors);
      const nextOffers = settledValue(offersResult, "offers", errors);
      const nextWatchlist = settledValue(watchlistResult, "watchlist", errors);
      const nextSavedSearches = settledValue(savedSearchesResult, "saved searches", errors);
      const nextSettlements = settledValue(settlementsResult, "settlements", errors);

      if (nextBids) setBids(nextBids);
      if (nextOffers) setOffers(nextOffers);
      if (nextWatchlist) setWatchlist(nextWatchlist);
      if (nextSavedSearches) setSavedSearches(nextSavedSearches);
      if (nextSettlements) setSettlements(nextSettlements);

      if (errors.length) {
        setDashboardError(`Some dashboard data could not load: ${errors.join(", ")}.`);
      }
    } catch (err) {
      setDashboardError(
        err instanceof Error ? err.message : "Failed to load buyer dashboard data.",
      );
    } finally {
      setDashboardLoading(false);
      setRefreshingDashboard(false);
    }
  }

  useEffect(() => {
    void loadBuyerDashboard(true);
  }, []);

  const dashboardSummary = useMemo(() => {
    const activeBids = bids.filter(isAuctionLive).length;
    const leadingCount = bids.filter((row) => getBidPosition(row) === "Leading").length;
    const outbidCount = bids.filter((row) => getBidPosition(row) === "Outbid").length;
    const counteredOffers = offers.filter(
      (offer) => normalizeStatus(offer.status) === "COUNTERED",
    ).length;
    const pendingOffers = offers.filter(
      (offer) => normalizeStatus(offer.status) === "PENDING",
    ).length;
    const paymentNeeded = settlements.filter(isPaymentNeeded).length;
    const favoriteShopCount = new Set(
      watchlist
        .map((entry) => entry.item?.shop?.id || entry.item?.shop?.name)
        .filter(Boolean),
    ).size;

    return {
      activeBids,
      leadingCount,
      outbidCount,
      offerCount: offers.length,
      counteredOffers,
      pendingOffers,
      watchlistCount: watchlist.length,
      savedSearchCount: savedSearches.length,
      settlementCount: settlements.length,
      paymentNeeded,
      favoriteShopCount,
    };
  }, [bids, offers, savedSearches, settlements, watchlist]);

  const dashboardActions = useMemo(() => {
    const items = [];

    if (dashboardSummary.outbidCount > 0) {
      items.push({
        title: "You were outbid",
        body: `${dashboardSummary.outbidCount} auction bid${dashboardSummary.outbidCount === 1 ? "" : "s"} need attention.`,
        cta: "Bid again",
        href: "/my-bids",
      });
    }

    if (dashboardSummary.counteredOffers > 0) {
      items.push({
        title: "Counteroffer received",
        body: `${dashboardSummary.counteredOffers} offer${dashboardSummary.counteredOffers === 1 ? "" : "s"} waiting for review.`,
        cta: "Review offer",
        href: "/offers",
      });
    }

    if (dashboardSummary.paymentNeeded > 0) {
      items.push({
        title: "Settlement payment needed",
        body: `${dashboardSummary.paymentNeeded} won auction settlement${dashboardSummary.paymentNeeded === 1 ? "" : "s"} need payment.`,
        cta: "Pay now",
        href: "/my-wins",
      });
    }

    if (dashboardSummary.savedSearchCount > 0) {
      items.push({
        title: "Saved searches active",
        body: `${dashboardSummary.savedSearchCount} saved search${dashboardSummary.savedSearchCount === 1 ? "" : "es"} tracking new matches.`,
        cta: "View matches",
        href: "/saved-searches",
      });
    }

    if (items.length === 0) {
      items.push({
        title: "Explore nearby inventory",
        body: "Browse marketplace items, auctions, and shops to start tracking deals.",
        cta: "Browse marketplace",
        href: "/marketplace",
      });
    }

    return items.slice(0, 3);
  }, [dashboardSummary]);

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
            <button
              type="button"
              className="bd-secondary"
              onClick={() => void loadBuyerDashboard(false)}
              disabled={refreshingDashboard}
            >
              {refreshingDashboard ? "Refreshing..." : "Refresh dashboard"}
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
              <strong>{dashboardSummary.watchlistCount}</strong>
              <span>watched items</span>
            </div>
            <div>
              <strong>{dashboardSummary.activeBids}</strong>
              <span>active bids</span>
            </div>
            <div>
              <strong>{dashboardSummary.savedSearchCount}</strong>
              <span>saved searches</span>
            </div>
            <div>
              <strong>{dashboardSummary.favoriteShopCount}</strong>
              <span>tracked shops</span>
            </div>
          </div>
        </aside>
      </section>

      {dashboardError ? (
        <section className="bd-dashboard-notice bd-dashboard-notice-error">
          {dashboardError}
        </section>
      ) : null}

      {dashboardLoading ? (
        <section className="bd-dashboard-notice">Loading live buyer dashboard data...</section>
      ) : null}

      <section className="bd-stats">
        <StatCard
          label="Active bids"
          value={String(dashboardSummary.activeBids)}
          helper={`${dashboardSummary.leadingCount} leading · ${dashboardSummary.outbidCount} outbid`}
        />
        <StatCard
          label="Offers"
          value={String(dashboardSummary.offerCount)}
          helper={`${dashboardSummary.counteredOffers} countered · ${dashboardSummary.pendingOffers} pending`}
        />
        <StatCard
          label="Watchlist"
          value={String(dashboardSummary.watchlistCount)}
          helper="Saved items you are tracking"
        />
        <StatCard
          label="Saved matches"
          value={String(dashboardSummary.savedSearchCount)}
          helper="Saved searches watching inventory"
        />
        <StatCard
          label="Won auctions"
          value={String(dashboardSummary.settlementCount)}
          helper={`${dashboardSummary.paymentNeeded} payment needed`}
        />
      </section>

      <section className="bd-attention">
        <SectionTitle eyebrow="Action needed" title="Needs your attention" />

        <div className="bd-attention-grid">
          {dashboardActions.map((item) => (
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
