import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { Link } from "react-router-dom";
import "../styles/buyer-purchases-readability.css";

import {
  getMyMarketplacePurchases,
  type MarketplaceFulfillmentStatus,
  type MarketplaceTransaction,
  type MarketplaceTransactionFilters,
  type MarketplaceTransactionStatus,
  type MarketplaceTransactionType,
} from "../services/marketplaceTransactions";

type PurchaseSortOrder =
  | "newest"
  | "oldest"
  | "price-high"
  | "price-low";

const STATUS_OPTIONS: Array<{
  value: MarketplaceTransactionStatus;
  label: string;
}> = [
  { value: "PENDING", label: "Pending" },
  {
    value: "PAYMENT_PROCESSING",
    label: "Payment processing",
  },
  { value: "PAID", label: "Paid" },
  { value: "FULFILLING", label: "Fulfilling" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELED", label: "Canceled" },
  { value: "REFUNDED", label: "Refunded" },
  { value: "DISPUTED", label: "Disputed" },
];

const TYPE_OPTIONS: Array<{
  value: MarketplaceTransactionType;
  label: string;
}> = [
  { value: "DIRECT_PURCHASE", label: "Direct purchase" },
  { value: "ACCEPTED_OFFER", label: "Accepted offer" },
  { value: "DEALER_TRANSFER", label: "Dealer transfer" },
  {
    value: "CUSTOMER_SELL_TO_SHOP",
    label: "Sold to pawn shop",
  },
];

const FULFILLMENT_OPTIONS: Array<{
  value: MarketplaceFulfillmentStatus;
  label: string;
}> = [
  { value: "PAYMENT_PENDING", label: "Payment pending" },
  { value: "READY_FOR_PICKUP", label: "Ready for pickup" },
  { value: "PICKED_UP", label: "Picked up" },
  { value: "SHIPPED", label: "Shipped" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELED", label: "Canceled" },
];

const pageStyle: CSSProperties = {
  width: "min(1180px, calc(100% - 2rem))",
  margin: "0 auto",
  padding: "32px 0 64px",
};

const panelStyle: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-lg)",
  background: "var(--surface)",
  boxShadow: "var(--shadow-soft)",
};

const buttonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 42,
  padding: "10px 16px",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius-sm)",
  background: "var(--surface-strong)",
  color: "var(--text-strong)",
  fontWeight: 800,
  cursor: "pointer",
};

function money(
  value: number | string,
  currency = "USD",
) {
  const amount = Number(value);

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
  }).format(Number.isFinite(amount) ? amount : 0);
}

function dateLabel(value: string | null | undefined) {
  if (!value) return "—";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString();
}

function readable(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusStyle(
  status: MarketplaceTransactionStatus,
): CSSProperties {
  const common: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: "0.03em",
  };

  switch (status) {
    case "COMPLETED":
    case "PAID":
      return {
        ...common,
        background: "rgba(126, 242, 167, 0.14)",
        color: "var(--success)",
      };

    case "CANCELED":
    case "REFUNDED":
      return {
        ...common,
        background: "rgba(184, 192, 228, 0.12)",
        color: "var(--muted)",
      };

    case "DISPUTED":
      return {
        ...common,
        background: "rgba(255, 142, 161, 0.14)",
        color: "var(--danger)",
      };

    default:
      return {
        ...common,
        background: "rgba(255, 213, 128, 0.14)",
        color: "var(--warning)",
      };
  }
}

function PurchaseCard({
  transaction,
}: {
  transaction: MarketplaceTransaction;
}) {
  const sellerName =
    transaction.sellerShop?.name ||
    transaction.seller?.name ||
    "Marketplace seller";

  return (
    <article
      style={{
        ...panelStyle,
        padding: 20,
        display: "grid",
        gap: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <p
            style={{
              margin: "0 0 6px",
              color: "var(--muted)",
              fontSize: 13,
              fontWeight: 800,
            }}
          >
            {readable(transaction.type)}
          </p>

          <h2
            style={{
              margin: 0,
              fontSize: 21,
            }}
          >
            {transaction.listing?.title ||
              "Marketplace purchase"}
          </h2>

          <p
            style={{
              margin: "8px 0 0",
              color: "var(--muted)",
            }}
          >
            Seller: {sellerName}
          </p>
        </div>

        <span style={statusStyle(transaction.status)}>
          {readable(transaction.status)}
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(145px, 1fr))",
          gap: 12,
        }}
      >
        <div>
          <small>Total</small>
          <strong
            style={{
              display: "block",
              color: "var(--text-strong)",
              fontSize: 18,
            }}
          >
            {money(
              transaction.totalAmount,
              transaction.currency,
            )}
          </strong>
        </div>

        <div>
          <small>Quantity</small>
          <strong
            style={{
              display: "block",
              color: "var(--text-strong)",
            }}
          >
            {transaction.quantity}
          </strong>
        </div>

        <div>
          <small>Fulfillment</small>
          <strong
            style={{
              display: "block",
              color: "var(--text-strong)",
            }}
          >
            {readable(transaction.fulfillmentStatus)}
          </strong>
        </div>

        <div>
          <small>Purchased</small>
          <strong
            style={{
              display: "block",
              color: "var(--text-strong)",
            }}
          >
            {dateLabel(transaction.createdAt)}
          </strong>
        </div>
      </div>

      <div
        style={{
          paddingTop: 14,
          borderTop: "1px solid var(--border)",
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <small>
          Transaction {transaction.id}
        </small>

        <Link
          to={`/marketplace/transactions/${encodeURIComponent(
            transaction.id,
          )}`}
          style={buttonStyle}
        >
          View transaction
        </Link>
      </div>
    </article>
  );
}

export default function BuyerPurchasesPage() {
  const [transactions, setTransactions] = useState<
    MarketplaceTransaction[]
  >([]);

  const [filters, setFilters] =
    useState<MarketplaceTransactionFilters>({
      page: 1,
      limit: 12,
    });

  const [pagination, setPagination] = useState({
    page: 1,
    limit: 12,
    total: 0,
    pages: 0,
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [fulfillmentFilter, setFulfillmentFilter] =
    useState<MarketplaceFulfillmentStatus | "">("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sortOrder, setSortOrder] =
    useState<PurchaseSortOrder>("newest");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(
    async (refresh = false) => {
      if (refresh) setRefreshing(true);
      else setLoading(true);

      setError("");

      try {
        const result =
          await getMyMarketplacePurchases(filters);

        setTransactions(result.rows);
        setPagination(result.pagination);
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to load marketplace purchases.",
        );
      } finally {
        if (refresh) setRefreshing(false);
        else setLoading(false);
      }
    },
    [filters],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const displayedTransactions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const fromTime = fromDate
      ? new Date(`${fromDate}T00:00:00`).getTime()
      : null;
    const toTime = toDate
      ? new Date(`${toDate}T23:59:59.999`).getTime()
      : null;

    return transactions
      .filter((transaction) => {
        const createdTime = new Date(
          transaction.createdAt,
        ).getTime();
        const sellerName =
          transaction.sellerShop?.name ||
          transaction.seller?.name ||
          "";
        const haystack = [
          transaction.id,
          transaction.listing?.title,
          sellerName,
          transaction.status,
          transaction.type,
          transaction.fulfillmentStatus,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (query && !haystack.includes(query)) return false;
        if (
          fulfillmentFilter &&
          transaction.fulfillmentStatus !==
            fulfillmentFilter
        ) {
          return false;
        }
        if (
          fromTime !== null &&
          Number.isFinite(createdTime) &&
          createdTime < fromTime
        ) {
          return false;
        }
        if (
          toTime !== null &&
          Number.isFinite(createdTime) &&
          createdTime > toTime
        ) {
          return false;
        }

        return true;
      })
      .sort((left, right) => {
        if (sortOrder === "price-high") {
          return (
            Number(right.totalAmount || 0) -
            Number(left.totalAmount || 0)
          );
        }
        if (sortOrder === "price-low") {
          return (
            Number(left.totalAmount || 0) -
            Number(right.totalAmount || 0)
          );
        }

        const leftTime = new Date(left.createdAt).getTime();
        const rightTime = new Date(right.createdAt).getTime();

        return sortOrder === "oldest"
          ? leftTime - rightTime
          : rightTime - leftTime;
      });
  }, [
    transactions,
    searchQuery,
    fulfillmentFilter,
    fromDate,
    toDate,
    sortOrder,
  ]);

  const activeFilterCount = [
    filters.status,
    filters.type,
    searchQuery.trim(),
    fulfillmentFilter,
    fromDate,
    toDate,
    sortOrder !== "newest" ? sortOrder : "",
  ].filter(Boolean).length;

  const totals = useMemo(() => {
    const completed = transactions.filter(
      (transaction) =>
        transaction.status === "COMPLETED",
    ).length;

    const active = transactions.filter(
      (transaction) =>
        ![
          "COMPLETED",
          "CANCELED",
          "REFUNDED",
        ].includes(transaction.status),
    ).length;

    const displayedValue = transactions.reduce(
      (sum, transaction) =>
        sum + Number(transaction.totalAmount || 0),
      0,
    );

    return {
      completed,
      active,
      displayedValue,
    };
  }, [transactions]);

  function clearFilters() {
    setFilters((current) => ({
      page: 1,
      limit: current.limit ?? 12,
    }));
    setSearchQuery("");
    setFulfillmentFilter("");
    setFromDate("");
    setToDate("");
    setSortOrder("newest");
  }

  function updateStatus(value: string) {
    setFilters((current) => ({
      ...current,
      page: 1,
      status:
        value === ""
          ? undefined
          : (value as MarketplaceTransactionStatus),
    }));
  }

  function updateType(value: string) {
    setFilters((current) => ({
      ...current,
      page: 1,
      type:
        value === ""
          ? undefined
          : (value as MarketplaceTransactionType),
    }));
  }

  return (
    <main className="buyer-purchases-page" style={pageStyle}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 20,
          flexWrap: "wrap",
          marginBottom: 24,
        }}
      >
        <div>
          <p
            style={{
              margin: "0 0 8px",
              color: "var(--accent)",
              fontWeight: 900,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              fontSize: 12,
            }}
          >
            Buyer workspace
          </p>

          <h1 style={{ fontSize: "clamp(30px, 5vw, 48px)" }}>
            My marketplace purchases
          </h1>

          <p
            style={{
              color: "var(--muted)",
              maxWidth: 700,
            }}
          >
            Review purchases, payment status, seller
            information, and fulfillment progress.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void load(true)}
          disabled={refreshing}
          style={{
            ...buttonStyle,
            opacity: refreshing ? 0.65 : 1,
          }}
        >
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </header>

      <section
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 14,
          marginBottom: 20,
        }}
      >
        {[
          ["Total purchases", pagination.total],
          ["Active on page", totals.active],
          ["Completed on page", totals.completed],
          [
            "Value on page",
            money(totals.displayedValue),
          ],
        ].map(([label, value]) => (
          <div
            key={String(label)}
            style={{
              ...panelStyle,
              padding: 18,
            }}
          >
            <small>{label}</small>
            <strong
              style={{
                display: "block",
                marginTop: 6,
                fontSize: 24,
                color: "var(--text-strong)",
              }}
            >
              {value}
            </strong>
          </div>
        ))}
      </section>

      <section
        aria-label="Purchase filters"
        style={{
          ...panelStyle,
          padding: 18,
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 14,
          marginBottom: 20,
        }}
      >
        <label>
          Search this page
          <input
            type="search"
            value={searchQuery}
            onChange={(event) =>
              setSearchQuery(event.target.value)
            }
            placeholder="Item, seller, or transaction ID"
            style={{ marginTop: 7 }}
          />
        </label>

        <label>
          Transaction status
          <select
            value={filters.status ?? ""}
            onChange={(event) =>
              updateStatus(event.target.value)
            }
            style={{ marginTop: 7 }}
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((option) => (
              <option
                key={option.value}
                value={option.value}
              >
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Transaction type
          <select
            value={filters.type ?? ""}
            onChange={(event) =>
              updateType(event.target.value)
            }
            style={{ marginTop: 7 }}
          >
            <option value="">All purchase types</option>
            {TYPE_OPTIONS.map((option) => (
              <option
                key={option.value}
                value={option.value}
              >
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Fulfillment
          <select
            value={fulfillmentFilter}
            onChange={(event) =>
              setFulfillmentFilter(
                event.target
                  .value as MarketplaceFulfillmentStatus | "",
              )
            }
            style={{ marginTop: 7 }}
          >
            <option value="">All fulfillment statuses</option>
            {FULFILLMENT_OPTIONS.map((option) => (
              <option
                key={option.value}
                value={option.value}
              >
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Purchased from
          <input
            type="date"
            value={fromDate}
            max={toDate || undefined}
            onChange={(event) =>
              setFromDate(event.target.value)
            }
            style={{ marginTop: 7 }}
          />
        </label>

        <label>
          Purchased through
          <input
            type="date"
            value={toDate}
            min={fromDate || undefined}
            onChange={(event) =>
              setToDate(event.target.value)
            }
            style={{ marginTop: 7 }}
          />
        </label>

        <label>
          Sort
          <select
            value={sortOrder}
            onChange={(event) =>
              setSortOrder(
                event.target.value as PurchaseSortOrder,
              )
            }
            style={{ marginTop: 7 }}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="price-high">
              Price: high to low
            </option>
            <option value="price-low">
              Price: low to high
            </option>
          </select>
        </label>

        <div
          className="buyer-purchases-filter-actions"
          aria-live="polite"
        >
          <span>
            Showing {displayedTransactions.length} of{" "}
            {transactions.length} purchases on this page
            {activeFilterCount > 0
              ? ` · ${activeFilterCount} active filter${activeFilterCount === 1 ? "" : "s"}`
              : ""}
          </span>
          <button
            type="button"
            onClick={clearFilters}
            disabled={activeFilterCount === 0}
            style={{
              ...buttonStyle,
              opacity: activeFilterCount === 0 ? 0.5 : 1,
            }}
          >
            Clear filters
          </button>
        </div>
      </section>

      {error ? (
        <section
          role="alert"
          style={{
            ...panelStyle,
            padding: 18,
            borderColor: "var(--danger)",
            color: "var(--danger)",
            marginBottom: 20,
          }}
        >
          {error}
        </section>
      ) : null}

      {loading ? (
        <section
          aria-live="polite"
          style={{
            ...panelStyle,
            padding: 28,
            textAlign: "center",
            color: "var(--muted)",
          }}
        >
          Loading marketplace purchases...
        </section>
      ) : transactions.length === 0 ? (
        <section
          style={{
            ...panelStyle,
            padding: 32,
            textAlign: "center",
          }}
        >
          <h2>No purchases found</h2>
          <p style={{ color: "var(--muted)" }}>
            Your marketplace purchases will appear here.
          </p>

          <Link to="/marketplace" style={buttonStyle}>
            Browse marketplace
          </Link>
        </section>
      ) : displayedTransactions.length === 0 ? (
        <section
          style={{
            ...panelStyle,
            padding: 32,
            textAlign: "center",
          }}
        >
          <h2>No purchases match these filters</h2>
          <p style={{ color: "var(--muted)" }}>
            Clear or adjust the filters to see purchases on
            this page.
          </p>
          <button
            type="button"
            onClick={clearFilters}
            style={buttonStyle}
          >
            Clear filters
          </button>
        </section>
      ) : (
        <section
          style={{
            display: "grid",
            gap: 16,
          }}
        >
          {displayedTransactions.map((transaction) => (
            <PurchaseCard
              key={transaction.id}
              transaction={transaction}
            />
          ))}
        </section>
      )}

      <nav
        aria-label="Purchase pages"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 14,
          marginTop: 22,
        }}
      >
        <button
          type="button"
          disabled={pagination.page <= 1}
          onClick={() =>
            setFilters((current) => ({
              ...current,
              page: Math.max(
                1,
                Number(current.page || 1) - 1,
              ),
            }))
          }
          style={{
            ...buttonStyle,
            opacity: pagination.page <= 1 ? 0.5 : 1,
          }}
        >
          Previous
        </button>

        <span style={{ color: "var(--muted)" }}>
          Page {pagination.page} of{" "}
          {Math.max(pagination.pages, 1)}
        </span>

        <button
          type="button"
          disabled={
            pagination.pages === 0 ||
            pagination.page >= pagination.pages
          }
          onClick={() =>
            setFilters((current) => ({
              ...current,
              page: Number(current.page || 1) + 1,
            }))
          }
          style={{
            ...buttonStyle,
            opacity:
              pagination.pages === 0 ||
              pagination.page >= pagination.pages
                ? 0.5
                : 1,
          }}
        >
          Next
        </button>
      </nav>
    </main>
  );
}
