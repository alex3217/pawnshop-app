import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  addSavedSearch,
  getMySavedSearches,
  removeSavedSearch,
  type SavedSearch,
} from "../services/savedSearches";
import "../styles/saved-searches-v2.css";

function normalizeQuery(value: unknown) {
  return String(value || "").trim();
}

function formatSavedDate(value?: string) {
  if (!value) return "recently";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "recently";

  return date.toLocaleString();
}

function handoffHref(path: string, query: string, radius = "25") {
  const cleanQuery = normalizeQuery(query);

  if (!cleanQuery) return path;

  const params = new URLSearchParams();
  params.set("q", cleanQuery);
  params.set("query", cleanQuery);
  params.set("search", cleanQuery);
  params.set("radius", radius);

  return `${path}?${params.toString()}`;
}

function marketplaceHref(query: string, radius = "25") {
  return handoffHref("/marketplace", query, radius);
}

function locatorHref(query: string, radius = "25") {
  return handoffHref("/buyer/item-locator", query, radius);
}

const starterSearches = [
  "PS5 under $400",
  "Gold jewelry",
  "Milwaukee tools",
  "Watches near me",
  "Laptops under $300",
  "Diamond ring",
];

export default function SavedSearchesPage() {
  const [searchParams] = useSearchParams();
  const initialQuery = normalizeQuery(
    searchParams.get("q") || searchParams.get("query") || searchParams.get("search"),
  );
  const initialRadiusParam = searchParams.get("radius") || "25";
  const initialRadius = ["10", "25", "50", "100"].includes(initialRadiusParam)
    ? initialRadiusParam
    : "25";

  const [entries, setEntries] = useState<SavedSearch[]>([]);
  const [query, setQuery] = useState(initialQuery);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function loadSavedSearches(options: { silent?: boolean } = {}) {
    if (options.silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError("");

    try {
      const nextEntries = await getMySavedSearches();
      setEntries(nextEntries);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load saved searches.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadSavedSearches();
  }, []);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextQuery = normalizeQuery(query);

    if (!nextQuery) {
      setError("Enter a keyword, item, category, or price target to save.");
      return;
    }

    const alreadySaved = entries.some(
      (entry) => normalizeQuery(entry.query).toLowerCase() === nextQuery.toLowerCase(),
    );

    if (alreadySaved) {
      setNotice("That saved search already exists.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const created = await addSavedSearch(nextQuery);
      setEntries((current) => [created, ...current]);
      setQuery("");
      setNotice(`Saved search created: ${nextQuery}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create saved search.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(id: string, label: string) {
    const safeLabel = normalizeQuery(label) || "this saved search";
    const confirmed = window.confirm(`Remove saved search "${safeLabel}"?`);

    if (!confirmed) return;

    setRemovingId(id);
    setError("");
    setNotice("");

    try {
      await removeSavedSearch(id);
      setEntries((current) => current.filter((entry) => entry.id !== id));
      setNotice("Saved search removed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove saved search.");
    } finally {
      setRemovingId(null);
    }
  }

  const stats = useMemo(() => {
    const newest = entries[0];

    return {
      total: entries.length,
      newest: newest ? normalizeQuery(newest.query) : "None yet",
      active: entries.length,
    };
  }, [entries]);

  return (
    <main className="saved2-page">
      <section className="saved2-hero">
        <div>
          <span className="saved2-pill">Buyer saved searches</span>
          <h1>Track the items you want before they disappear.</h1>
          <p>
            Save keywords, brands, categories, price targets, or search phrases.
            Then jump back into Marketplace or Item Locator with one click.
          </p>

          <div className="saved2-hero-actions">
            <Link to={marketplaceHref(query, initialRadius)}>Browse marketplace</Link>
            <Link to={locatorHref(query, initialRadius)}>Item locator</Link>
            <button
              type="button"
              onClick={() => void loadSavedSearches({ silent: true })}
              disabled={refreshing || loading}
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        <aside className="saved2-hero-panel">
          <div>
            <span>Total saved</span>
            <strong>{stats.total}</strong>
            <small>saved searches</small>
          </div>
          <div>
            <span>Active tracking</span>
            <strong>{stats.active}</strong>
            <small>watching inventory</small>
          </div>
          <div>
            <span>Newest</span>
            <strong>{stats.newest}</strong>
            <small>latest saved search</small>
          </div>
        </aside>
      </section>

      <section className="saved2-discovery-strip">
        <Link to="/buyer/dashboard">
          Buyer dashboard <span>Return to command center</span>
        </Link>
        <Link to="/marketplace">
          Marketplace <span>Browse all inventory</span>
        </Link>
        <Link to="/buyer/item-locator">
          Item locator <span>Find who has an item</span>
        </Link>
        <Link to="/watchlist">
          Watchlist <span>Track saved items</span>
        </Link>
      </section>

      <section className="saved2-control-panel">
        <div className="saved2-control-head">
          <div>
            <span>Controls</span>
            <h2>Create and manage saved searches</h2>
            <p>
              Add a search once, then reopen that search in Marketplace or Item Locator
              whenever you want to check new inventory. Remove saved searches you no
              longer need from each saved-search card.
            </p>
          </div>
        </div>

        <form className="saved2-form" onSubmit={handleCreate}>
          <label>
            Search phrase
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="PS5 under $400, gold chain, Milwaukee tools..."
            />
          </label>

          <button type="submit" disabled={saving || !query.trim()}>
            {saving ? "Saving..." : "Save search"}
          </button>
        </form>

        <div className="saved2-starters">
          <span>Quick starters</span>
          <div>
            {starterSearches.map((starter) => (
              <button
                key={starter}
                type="button"
                onClick={() => setQuery(starter)}
              >
                {starter}
              </button>
            ))}
          </div>
        </div>
      </section>

      {notice ? <section className="saved2-notice">{notice}</section> : null}

      {error ? (
        <section className="saved2-error">
          <h2>Saved searches need attention</h2>
          <p>{error}</p>
          <button type="button" onClick={() => void loadSavedSearches()}>
            Try again
          </button>
        </section>
      ) : null}

      {loading ? (
        <section className="saved2-grid">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="saved2-skeleton" />
          ))}
        </section>
      ) : entries.length === 0 ? (
        <section className="saved2-empty">
          <h2>No saved searches yet</h2>
          <p>
            Save searches for items you want to track, then return here to run
            those searches across marketplace inventory and item locator.
          </p>
          <Link to={marketplaceHref(query, initialRadius)}>Browse marketplace</Link>
        </section>
      ) : (
        <section className="saved2-grid">
          {entries.map((entry) => {
            const entryQuery = normalizeQuery(entry.query);
            const removing = removingId === entry.id;

            return (
              <article key={entry.id} className="saved2-card">
                <div>
                  <span className="saved2-card-label">Saved search</span>
                  <h3>{entryQuery || "Untitled search"}</h3>
                  <p>Saved {formatSavedDate(entry.createdAt)}</p>
                </div>

                <div className="saved2-card-actions">
                  <Link to={marketplaceHref(entryQuery, initialRadius)} className="saved2-primary-small">
                    Search marketplace
                  </Link>
                  <Link to={locatorHref(entryQuery, initialRadius)} className="saved2-secondary-small">
                    Search item locator
                  </Link>
                  <button
                    type="button"
                    onClick={() => void handleRemove(entry.id, entryQuery)}
                    disabled={removing}
                    className="saved2-remove"
                  >
                    {removing ? "Removing..." : "Remove"}
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
