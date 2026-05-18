import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { getAuthRole } from "../services/auth";
import {
  acceptCounterOffer,
  acceptOffer,
  cancelOffer,
  counterOffer,
  createOffer,
  declineCounterOffer,
  getMyOffers,
  getOwnerOffers,
  rejectOffer,
  type Offer,
} from "../services/offers";
import "../styles/offers-v2.css";

function normalizeLabel(value: string | number | null | undefined, fallback: string) {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function toNumber(value: string | number | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: string | number | null | undefined) {
  const amount = toNumber(value);

  if (!amount) return "—";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function normalizeStatus(status: string | null | undefined) {
  return String(status || "UNKNOWN").trim().toUpperCase();
}

function statusClass(status: string | null | undefined) {
  return `offers2-status offers2-status-${normalizeStatus(status).toLowerCase()}`;
}

function itemHref(offer: Offer) {
  const itemId = offer.item?.id || offer.itemId;
  return itemId ? `/items/${encodeURIComponent(itemId)}` : "/marketplace";
}

function shopHref(offer: Offer) {
  const shopId = offer.item?.shop?.id;
  return shopId ? `/shops/${encodeURIComponent(shopId)}` : "/shops";
}

function offerTitle(offer: Offer) {
  return normalizeLabel(offer.item?.title, "Unknown item");
}

function shopName(offer: Offer) {
  return normalizeLabel(offer.item?.shop?.name, "Unknown shop");
}

function canCancelBuyerOffer(offer: Offer) {
  return ["PENDING", "COUNTERED"].includes(normalizeStatus(offer.status));
}

export default function OffersPage() {
  const role = getAuthRole();
  const isOwnerView = useMemo(
    () => role === "OWNER" || role === "ADMIN" || role === "SUPER_ADMIN",
    [role],
  );

  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actioningId, setActioningId] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const [newItemId, setNewItemId] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [creatingOffer, setCreatingOffer] = useState(false);

  const [counterAmounts, setCounterAmounts] = useState<Record<string, string>>({});
  const [counterMessages, setCounterMessages] = useState<Record<string, string>>({});

  const loadOffers = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const nextOffers = isOwnerView ? await getOwnerOffers() : await getMyOffers();
      setOffers(nextOffers);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load offers.");
    } finally {
      setLoading(false);
    }
  }, [isOwnerView]);

  useEffect(() => {
    void loadOffers();
  }, [loadOffers]);

  const filteredOffers = useMemo(() => {
    const q = query.trim().toLowerCase();

    return offers.filter((offer) => {
      const status = normalizeStatus(offer.status);
      const searchable = [
        offerTitle(offer),
        shopName(offer),
        offer.message || "",
        offer.counterMessage || "",
        status,
      ].join(" ").toLowerCase();

      if (statusFilter !== "ALL" && status !== statusFilter) return false;
      if (q && !searchable.includes(q)) return false;

      return true;
    });
  }, [offers, query, statusFilter]);

  const statusOptions = useMemo(() => {
    return Array.from(new Set(offers.map((offer) => normalizeStatus(offer.status)))).sort();
  }, [offers]);

  const stats = useMemo(() => {
    const pending = offers.filter((offer) => normalizeStatus(offer.status) === "PENDING").length;
    const countered = offers.filter((offer) => normalizeStatus(offer.status) === "COUNTERED").length;
    const accepted = offers.filter((offer) => normalizeStatus(offer.status) === "ACCEPTED").length;
    const canceled = offers.filter((offer) =>
      ["CANCELED", "CANCELLED"].includes(normalizeStatus(offer.status)),
    ).length;
    const totalValue = offers.reduce((sum, offer) => sum + toNumber(offer.amount), 0);

    return {
      total: offers.length,
      pending,
      countered,
      accepted,
      canceled,
      totalValue,
    };
  }, [offers]);

  const needsAction = useMemo(() => {
    return filteredOffers.filter((offer) => {
      const status = normalizeStatus(offer.status);
      return isOwnerView ? status === "PENDING" : status === "COUNTERED";
    });
  }, [filteredOffers, isOwnerView]);

  async function handleCreateOffer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isOwnerView) return;

    const amount = Number(newAmount);

    if (!newItemId.trim()) {
      setError("Enter an item ID before creating an offer.");
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Offer amount must be a valid number.");
      return;
    }

    try {
      setCreatingOffer(true);
      setError(null);
      setNotice(null);

      await createOffer({
        itemId: newItemId.trim(),
        amount,
        message: newMessage.trim() || undefined,
      });

      setNotice("Offer created.");
      setNewItemId("");
      setNewAmount("");
      setNewMessage("");
      await loadOffers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create offer.");
    } finally {
      setCreatingOffer(false);
    }
  }

  async function runAction(id: string, action: () => Promise<Offer>, success: string) {
    try {
      setActioningId(id);
      setError(null);
      setNotice(null);
      await action();
      setNotice(success);
      await loadOffers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Offer action failed.");
    } finally {
      setActioningId(null);
    }
  }

  async function handleCounter(event: FormEvent<HTMLFormElement>, offer: Offer) {
    event.preventDefault();

    const nextAmount = Number(counterAmounts[offer.id] || "");

    if (!Number.isFinite(nextAmount) || nextAmount <= 0) {
      setError("Counteroffer amount must be a valid number.");
      return;
    }

    await runAction(
      offer.id,
      () =>
        counterOffer({
          offerId: offer.id,
          counterAmount: nextAmount,
          counterMessage: counterMessages[offer.id] || "",
        }),
      "Counteroffer sent.",
    );

    setCounterAmounts((current) => ({ ...current, [offer.id]: "" }));
    setCounterMessages((current) => ({ ...current, [offer.id]: "" }));
  }

  function renderOfferCard(offer: Offer) {
    const status = normalizeStatus(offer.status);
    const isWorking = actioningId === offer.id;
    const canOwnerAct = isOwnerView && status === "PENDING";
    const canBuyerAct = !isOwnerView && status === "COUNTERED";
    const canBuyerCancel = !isOwnerView && canCancelBuyerOffer(offer);

    return (
      <article key={offer.id} className="offers2-card">
        <div className="offers2-card-top">
          <div>
            <Link to={itemHref(offer)} className="offers2-item-title">
              {offerTitle(offer)}
            </Link>
            <p>{shopName(offer)}</p>
          </div>

          <span className={statusClass(offer.status)}>{status}</span>
        </div>

        <div className="offers2-money-grid">
          <div>
            <span>Offer</span>
            <strong>{formatMoney(offer.amount)}</strong>
          </div>
          <div>
            <span>Counter</span>
            <strong>{formatMoney(offer.counterAmount)}</strong>
          </div>
        </div>

        {offer.message ? (
          <div className="offers2-message">
            <span>Buyer message</span>
            <p>{offer.message}</p>
          </div>
        ) : null}

        {offer.counterMessage ? (
          <div className="offers2-message counter">
            <span>Counter message</span>
            <p>{offer.counterMessage}</p>
          </div>
        ) : null}

        {canOwnerAct ? (
          <form className="offers2-counter-form" onSubmit={(event) => void handleCounter(event, offer)}>
            <label>
              <span>Counter amount</span>
              <input
                value={counterAmounts[offer.id] || ""}
                onChange={(event) =>
                  setCounterAmounts((current) => ({
                    ...current,
                    [offer.id]: event.target.value,
                  }))
                }
                inputMode="decimal"
                placeholder={normalizeLabel(offer.amount, "100")}
              />
            </label>

            <label>
              <span>Counter message</span>
              <input
                value={counterMessages[offer.id] || ""}
                onChange={(event) =>
                  setCounterMessages((current) => ({
                    ...current,
                    [offer.id]: event.target.value,
                  }))
                }
                placeholder="Optional message..."
              />
            </label>

            <div className="offers2-actions">
              <button
                type="button"
                onClick={() =>
                  void runAction(offer.id, () => acceptOffer(offer.id), "Offer accepted.")
                }
                disabled={isWorking}
                className="offers2-accept"
              >
                Accept
              </button>
              <button
                type="button"
                onClick={() =>
                  void runAction(offer.id, () => rejectOffer(offer.id), "Offer rejected.")
                }
                disabled={isWorking}
                className="offers2-reject"
              >
                Reject
              </button>
              <button type="submit" disabled={isWorking} className="offers2-counter">
                Counter
              </button>
            </div>
          </form>
        ) : null}

        {canBuyerAct ? (
          <div className="offers2-actions">
            <button
              type="button"
              onClick={() =>
                void runAction(
                  offer.id,
                  () => acceptCounterOffer(offer.id),
                  "Counteroffer accepted.",
                )
              }
              disabled={isWorking}
              className="offers2-accept"
            >
              Accept counter
            </button>
            <button
              type="button"
              onClick={() =>
                void runAction(
                  offer.id,
                  () => declineCounterOffer(offer.id),
                  "Counteroffer declined.",
                )
              }
              disabled={isWorking}
              className="offers2-reject"
            >
              Decline counter
            </button>
          </div>
        ) : null}

        {canBuyerCancel ? (
          <button
            type="button"
            className="offers2-cancel-wide"
            disabled={isWorking}
            onClick={() =>
              void runAction(offer.id, () => cancelOffer(offer.id), "Offer canceled.")
            }
          >
            {isWorking ? "Working..." : "Cancel / withdraw offer"}
          </button>
        ) : null}

        <div className="offers2-card-links">
          <Link to={itemHref(offer)}>View item</Link>
          <Link to={shopHref(offer)}>View shop</Link>
          <Link to="/marketplace">Marketplace</Link>
        </div>
      </article>
    );
  }

  return (
    <main className="offers2-page">
      <section className="offers2-hero">
        <div className="offers2-hero-copy">
          <span className="offers2-pill">
            {isOwnerView ? "Owner offer center" : "Buyer offer center"}
          </span>
          <h1>{isOwnerView ? "Control incoming offers." : "Create and manage your offers."}</h1>
          <p>
            {isOwnerView
              ? "Accept, reject, or counter buyer offers from one workspace."
              : "Create offers, track responses, cancel pending offers, and manage counteroffers."}
          </p>

          <div className="offers2-hero-actions">
            <Link to="/marketplace">Browse marketplace</Link>
            <Link to="/buyer/item-locator">Find an item</Link>
            <button type="button" onClick={() => void loadOffers()}>
              Refresh
            </button>
          </div>
        </div>

        <aside className="offers2-hero-panel">
          <div>
            <span>Total</span>
            <strong>{stats.total}</strong>
            <small>offers</small>
          </div>
          <div>
            <span>Pending</span>
            <strong>{stats.pending}</strong>
            <small>awaiting response</small>
          </div>
          <div>
            <span>Countered</span>
            <strong>{stats.countered}</strong>
            <small>negotiating</small>
          </div>
          <div>
            <span>Canceled</span>
            <strong>{stats.canceled}</strong>
            <small>withdrawn offers</small>
          </div>
        </aside>
      </section>

      <section className="offers2-control-panel">
        <div className="offers2-control-head">
          <div>
            <span>Controls</span>
            <h2>Search, filter, and manage offers</h2>
          </div>
          <button type="button" onClick={() => {
            setQuery("");
            setStatusFilter("ALL");
          }}>
            Clear filters
          </button>
        </div>

        <div className="offers2-filter-row">
          <label>
            <span>Search</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search item, shop, message, status..."
            />
          </label>

          <label>
            <span>Status</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="ALL">All statuses</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
        </div>

        {!isOwnerView ? (
          <form className="offers2-create-form" onSubmit={handleCreateOffer}>
            <div>
              <span>Add offer manually</span>
              <h3>Create an offer by item ID</h3>
            </div>

            <input
              value={newItemId}
              onChange={(event) => setNewItemId(event.target.value)}
              placeholder="Item ID"
            />
            <input
              value={newAmount}
              onChange={(event) => setNewAmount(event.target.value)}
              placeholder="Offer amount"
              inputMode="decimal"
            />
            <input
              value={newMessage}
              onChange={(event) => setNewMessage(event.target.value)}
              placeholder="Optional message"
            />
            <button type="submit" disabled={creatingOffer}>
              {creatingOffer ? "Creating..." : "Create offer"}
            </button>
          </form>
        ) : null}
      </section>

      <section className="offers2-discovery-strip">
        <Link to="/buyer/dashboard">
          Buyer dashboard <span>Return to command center</span>
        </Link>
        <Link to="/marketplace">
          Marketplace <span>Browse inventory</span>
        </Link>
        <Link to="/watchlist">
          Watchlist <span>Track saved items</span>
        </Link>
        <Link to="/buyer/item-locator">
          Item locator <span>Find who has an item</span>
        </Link>
      </section>

      {notice ? <section className="offers2-notice">{notice}</section> : null}

      {error ? (
        <section className="offers2-error">
          <h2>Offers need attention</h2>
          <p>{error}</p>
          <button type="button" onClick={() => void loadOffers()}>
            Try again
          </button>
        </section>
      ) : null}

      {loading ? (
        <section className="offers2-grid">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="offers2-skeleton" />
          ))}
        </section>
      ) : filteredOffers.length === 0 ? (
        <section className="offers2-empty">
          <h2>No offers matched</h2>
          <p>
            {isOwnerView
              ? "Incoming buyer offers will appear here when shoppers start negotiating."
              : "Create an offer from an item detail page or use the manual item ID form above."}
          </p>
          <Link to="/marketplace">Browse marketplace</Link>
        </section>
      ) : (
        <>
          {needsAction.length ? (
            <section className="offers2-section">
              <div className="offers2-section-title">
                <span>Action needed</span>
                <h2>{isOwnerView ? "Incoming offers" : "Counteroffers waiting"}</h2>
              </div>
              <div className="offers2-grid">
                {needsAction.map((offer) => renderOfferCard(offer))}
              </div>
            </section>
          ) : null}

          <section className="offers2-section">
            <div className="offers2-section-title">
              <span>All offers</span>
              <h2>{isOwnerView ? "Offer activity" : "Your offer activity"}</h2>
            </div>
            <div className="offers2-grid">
              {filteredOffers.map((offer) => renderOfferCard(offer))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
