import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getReceivedMarketplaceListings, type MarketplaceListing } from "../services/marketplaceListings";
import "../styles/marketplace-seller-listings.css";

function destinationLabel(listing: MarketplaceListing) {
  if (listing.destinationShop) return listing.destinationShop.name;
  if (listing.destinationUser) return `${listing.destinationUser.publicDisplayName} (@${listing.destinationUser.publicMessageIdentifier})`;
  return "Direct recipient";
}

export default function ReceivedMarketplaceListingsPage() {
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void getReceivedMarketplaceListings()
      .then((rows) => { if (active) setListings(rows); })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "Unable to load received listings."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return (
    <main className="marketplace-seller-listings-page">
      <header className="seller-listings-hero">
        <div><span>Direct marketplace</span><h1>Listings sent to me</h1><p>Review active listings that a customer sent directly to you or your shop.</p></div>
        <Link to="/marketplace">Browse marketplace</Link>
      </header>
      {error ? <p role="alert">{error}</p> : null}
      {loading ? <p role="status">Loading received listings…</p> : null}
      {!loading && !error && listings.length === 0 ? <section><h2>No received listings</h2><p>Direct customer and shop listings will appear here.</p></section> : null}
      {listings.length ? (
        <section aria-labelledby="received-listings-heading">
          <h2 id="received-listings-heading">Received listings</h2>
          <div className="seller-listings-grid">
            {listings.map((listing) => (
              <article key={listing.id} className="seller-listing-card">
                <div><span>{listing.listingType.replaceAll("_", " ").toLowerCase()}</span><span>{listing.status.toLowerCase()}</span></div>
                <h3>{listing.title}</h3>
                <p>{listing.description || "No description provided."}</p>
                <dl><div><dt>Destination</dt><dd>{destinationLabel(listing)}</dd></div><div><dt>Price</dt><dd>{new Intl.NumberFormat("en-US", { style: "currency", currency: listing.currency || "USD" }).format(Number(listing.price))}</dd></div></dl>
                <span aria-label={`Listing identifier ${listing.id}`}>Reference: {listing.id}</span>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
