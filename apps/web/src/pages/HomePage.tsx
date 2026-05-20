import { Link } from "react-router-dom";
import "../styles/home-page-v2.css";

const buyerFeatures = [
  {
    title: "Browse marketplace inventory",
    body: "Search items across pawnshop stores and compare inventory in one place.",
  },
  {
    title: "Find items near you",
    body: "Use Item Locator to search a keyword and see which shops have matching items.",
  },
  {
    title: "Sell or pawn an item",
    body: "Take photos, submit an item request, and receive pawnshop offers.",
  },
  {
    title: "Bid in real time",
    body: "Place bids, track price movement, and manage auctions from your buyer view.",
  },
];

const ownerFeatures = [
  {
    title: "Create item listings",
    body: "Add inventory with title, category, pricing, photos, and condition.",
  },
  {
    title: "Review buyer item requests",
    body: "See buyer-submitted photos and send real cash offers.",
  },
  {
    title: "Launch auctions",
    body: "Turn inventory into live auction listings with bidding controls.",
  },
  {
    title: "Manage operations",
    body: "Control staff, locations, subscriptions, inventory, offers, and integrations.",
  },
];

export default function HomePage() {
  return (
    <main className="home2-page">
      <section className="home2-hero">
        <div className="home2-hero-copy">
          <span className="home2-pill">Live marketplace + auction platform</span>
          <h1>Discover local pawn inventory, offers, and live auctions in one place.</h1>
          <p>
            Browse verified shop inventory, locate items nearby, submit items for pawnshop
            offers, and manage marketplace activity from one clean web experience.
          </p>

          <div className="home2-actions home2-hero-actions">
            <Link to="/marketplace">Browse Marketplace</Link>
            <Link to="/buyer/item-locator">Find an Item</Link>
            <Link to="/buyer/sell-item">Sell / Pawn Item</Link>
          </div>
        </div>

        <aside className="home2-hero-panel">
          <div>
            <span>Marketplace</span>
            <strong>Live listings + auctions</strong>
          </div>
          <div>
            <span>Buyer flow</span>
            <strong>Browse · Locate · Offer · Bid</strong>
          </div>
          <div>
            <span>Owner flow</span>
            <strong>List · Review · Offer · Auction</strong>
          </div>
          <div>
            <span>Platform</span>
            <strong>Web now · Native mobile next</strong>
          </div>
        </aside>
      </section>

      <section className="home2-grid">
        <article className="home2-card">
          <div className="home2-section-title">
            <span>For buyers</span>
            <h2>Everything a buyer needs to find, track, and offer.</h2>
            <p>
              Browse inventory, locate specific items, save listings, submit your own
              items, and manage offers.
            </p>
          </div>

          <div className="home2-feature-list">
            {buyerFeatures.map((feature) => (
              <div key={feature.title}>
                <strong>{feature.title}</strong>
                <span>{feature.body}</span>
              </div>
            ))}
          </div>

          <div className="home2-card-actions">
            <Link to="/buyer/dashboard">Buyer Dashboard</Link>
            <Link to="/buyer/sell-item">Sell / Pawn Item</Link>
          </div>
        </article>

        <article className="home2-card">
          <div className="home2-section-title">
            <span>For pawnshop owners</span>
            <h2>Run your shop inventory and buyer request flow.</h2>
            <p>
              Manage inventory, launch auctions, review buyer item submissions, and
              send pawn offers from the owner dashboard.
            </p>
          </div>

          <div className="home2-feature-list">
            {ownerFeatures.map((feature) => (
              <div key={feature.title}>
                <strong>{feature.title}</strong>
                <span>{feature.body}</span>
              </div>
            ))}
          </div>

          <div className="home2-card-actions">
            <Link to="/owner">Owner Dashboard</Link>
            <Link to="/owner/items/new">Create Listing</Link>
          </div>
        </article>
      </section>

      <section className="home2-quick-links">
        <Link to="/marketplace">Marketplace</Link>
        <Link to="/buyer/item-locator">Item Locator</Link>
        <Link to="/buyer/sell-item">Sell / Pawn Item</Link>
        <Link to="/shops">Shops</Link>
        <Link to="/auctions">Auctions</Link>
        <Link to="/watchlist">Watchlist</Link>
        <Link to="/offers">Offers</Link>
      </section>
    </main>
  );
}
