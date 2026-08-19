import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import {
  searchMarketplaceCustomerDestinations,
  searchMarketplaceShopDestinations,
  type MarketplaceCustomerDestination,
  type MarketplaceShopDestination,
} from "../services/marketplaceListings";

type Destination = MarketplaceCustomerDestination | MarketplaceShopDestination;
type Props = {
  mode: "customer" | "shop";
  selected: Destination | null;
  onSelect: (destination: Destination | null) => void;
};

function keyOf(destination: Destination) {
  return "reference" in destination ? destination.reference : destination.id;
}

function labelOf(destination: Destination) {
  return "reference" in destination
    ? `${destination.displayName} (@${destination.publicIdentifier})`
    : `${destination.name}${[destination.city, destination.state].filter(Boolean).length ? ` — ${[destination.city, destination.state].filter(Boolean).join(", ")}` : ""}`;
}

export default function MarketplaceDestinationPicker({ mode, selected, onSelect }: Props) {
  const id = useId().replaceAll(":", "");
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Destination[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    if (selected || query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      setError("");
      setActiveIndex(-1);
      return;
    }
    const controller = new AbortController();
    setResults([]);
    setActiveIndex(-1);
    const timeout = window.setTimeout(() => {
      setLoading(true);
      setError("");
      const search = mode === "customer" ? searchMarketplaceCustomerDestinations : searchMarketplaceShopDestinations;
      void search(query.trim(), controller.signal)
        .then((rows) => { if (!controller.signal.aborted) { setResults(rows); setActiveIndex(rows.length ? 0 : -1); } })
        .catch((caught) => { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Destination search failed."); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 300);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [mode, query, selected]);

  function choose(destination: Destination) {
    onSelect(destination);
    setQuery("");
    setResults([]);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!results.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) => (current + delta + results.length) % results.length);
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      choose(results[activeIndex]);
    } else if (event.key === "Escape") {
      setResults([]);
      setActiveIndex(-1);
    }
  }

  if (selected) {
    return (
      <div className="destination-selected-card" role="group" aria-label={`Selected ${mode} destination`}>
        <span>Selected {mode}</span><strong>{labelOf(selected)}</strong>
        <div><button type="button" onClick={() => { onSelect(null); window.setTimeout(() => inputRef.current?.focus(), 0); }}>Change</button><button type="button" className="secondary" onClick={() => { onSelect(null); setQuery(""); }}>Clear</button></div>
      </div>
    );
  }

  const listboxId = `${id}-destination-results`;
  return (
    <div className="destination-combobox">
      <label htmlFor={`${id}-destination-input`}>Find receiving {mode}</label>
      <input
        ref={inputRef}
        id={`${id}-destination-input`}
        type="search"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={results.length > 0}
        aria-controls={listboxId}
        aria-activedescendant={activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined}
        aria-describedby={`${id}-destination-help ${id}-destination-status`}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={handleKeyDown}
        autoComplete="off"
      />
      <small id={`${id}-destination-help`}>{mode === "customer" ? "Type at least 2 characters of a public name or @identifier." : "Type at least 2 characters of a shop name or location."}</small>
      <div id={`${id}-destination-status`} className="destination-search-status" role="status" aria-live="polite">
        {query.trim().length > 0 && query.trim().length < 2 ? "Enter 2 or more characters." : loading ? "Searching destinations…" : error ? `Search failed: ${error}` : query.trim().length >= 2 && !results.length ? "No destinations found." : results.length ? `${results.length} destinations found.` : ""}
      </div>
      {results.length ? (
        <div id={listboxId} role="listbox" aria-label={`${mode} destination results`} className="destination-results">
          {results.map((destination, index) => (
            <div
              key={keyOf(destination)} id={`${id}-option-${index}`} role="option" aria-selected={index === activeIndex}
              className={index === activeIndex ? "active" : ""}
              onMouseDown={(event) => { event.preventDefault(); choose(destination); }}
            >{labelOf(destination)}</div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
