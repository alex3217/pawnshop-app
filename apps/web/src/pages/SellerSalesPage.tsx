import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { Link } from "react-router-dom";

import {
  getMyMarketplaceSales,
  type MarketplaceTransaction,
  type MarketplaceTransactionFilters,
  type MarketplaceTransactionStatus,
  type MarketplaceTransactionType,
} from "../services/marketplaceTransactions";

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
    label: "Customer sale to shop",
  },
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

function readable(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function dateLabel(value: string | null | undefined) {
  if (!value) return "—";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString();
}

function metadataRecord(
  value: unknown,
): Record<string, unknown> {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  )
    ? value as Record<string, unknown>
    : {};
}

function sellerNetAmount(
  transaction: MarketplaceTransaction,
) {
  const metadata =
    metadataRecord(
      transaction.metadata,
    );

  const sellerNetCents =
    Number(
      metadata.sellerNetCents,
    );

  if (
    Number.isFinite(
      sellerNetCents,
    ) &&
    sellerNetCents >= 0
  ) {
    return sellerNetCents / 100;
  }

  return Math.max(
    0,
    Number(
      transaction.subtotal ||
      0,
    ) -
    Number(
      transaction.platformFee ||
      0,
    ),
  );
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
    case "PAID":
    case "COMPLETED":
      return {
        ...common,
        background: "rgba(126, 242, 167, 0.14)",
        color: "var(--success)",
      };

    case "DISPUTED":
      return {
        ...common,
        background: "rgba(255, 142, 161, 0.14)",
        color: "var(--danger)",
      };

    case "CANCELED":
    case "REFUNDED":
      return {
        ...common,
        background: "rgba(184, 192, 228, 0.12)",
        color: "var(--muted)",
      };

    default:
      return {
        ...common,
        background: "rgba(255, 213, 128, 0.14)",
        color: "var(--warning)",
      };
  }
}

function SaleCard({
  transaction,
}: {
  transaction: MarketplaceTransaction;
}) {
  const buyerName =
    transaction.buyerShop?.name ||
    transaction.buyer?.name ||
    "Marketplace buyer";

  const sellerNet =
    sellerNetAmount(
      transaction,
    );

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
          justifyContent: "space-between",
          alignItems: "flex-start",
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
              "Marketplace sale"}
          </h2>

          <p
            style={{
              margin: "8px 0 0",
              color: "var(--muted)",
            }}
          >
            Buyer: {buyerName}
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
          <small>Sale total</small>
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
          <small>Platform fee</small>
          <strong
            style={{
              display: "block",
              color: "var(--text-strong)",
            }}
          >
            {money(
              transaction.platformFee,
              transaction.currency,
            )}
          </strong>
        </div>

        <div>
          <small>Net proceeds</small>
          <strong
            style={{
              display: "block",
              color: "var(--success)",
              fontSize: 18,
            }}
          >
            {money(
              sellerNet,
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
          <small>Created</small>
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
          borderTop: "1px solid var(--border)",
          paddingTop: 14,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
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

export default function SellerSalesPage() {
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

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(
    async (refresh = false) => {
      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

      try {
        const result =
          await getMyMarketplaceSales(filters);

        setTransactions(result.rows);
        setPagination(result.pagination);
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to load marketplace sales.",
        );
      } finally {
        if (refresh) {
          setRefreshing(false);
        } else {
          setLoading(false);
        }
      }
    },
    [filters],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(() => {
    const grossValue = transactions.reduce(
      (sum, transaction) =>
        sum + Number(transaction.totalAmount || 0),
      0,
    );

    const platformFees = transactions.reduce(
      (sum, transaction) =>
        sum + Number(transaction.platformFee || 0),
      0,
    );

    const netProceeds =
      transactions.reduce(
        (sum, transaction) =>
          sum +
          sellerNetAmount(
            transaction,
          ),
        0,
      );

    const completed = transactions.filter(
      (transaction) =>
        transaction.status === "COMPLETED",
    ).length;

    const awaitingFulfillment = transactions.filter(
      (transaction) =>
        transaction.status === "PAID" ||
        transaction.status === "FULFILLING",
    ).length;

    return {
      grossValue,
      platformFees,
      netProceeds,
      completed,
      awaitingFulfillment,
    };
  }, [transactions]);

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
    <main style={pageStyle}>
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
            Seller workspace
          </p>

          <h1
            style={{
              fontSize: "clamp(30px, 5vw, 48px)",
            }}
          >
            My marketplace sales
          </h1>

          <p
            style={{
              color: "var(--muted)",
              maxWidth: 700,
            }}
          >
            Review buyers, payment state, fees, and
            fulfillment progress for marketplace sales.
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
          ["Total sales", pagination.total],
          [
            "Gross value on page",
            money(totals.grossValue),
          ],
          [
            "Platform fees on page",
            money(totals.platformFees),
          ],
          [
            "Net proceeds on page",
            money(totals.netProceeds),
          ],
          [
            "Awaiting fulfillment",
            totals.awaitingFulfillment,
          ],
          ["Completed on page", totals.completed],
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
        aria-label="Sales filters"
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
            <option value="">All sale types</option>

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
          Loading marketplace sales...
        </section>
      ) : transactions.length === 0 ? (
        <section
          style={{
            ...panelStyle,
            padding: 32,
            textAlign: "center",
          }}
        >
          <h2>No marketplace sales found</h2>

          <p style={{ color: "var(--muted)" }}>
            Completed and pending marketplace sales will
            appear here.
          </p>

          <Link to="/marketplace" style={buttonStyle}>
            View marketplace
          </Link>
        </section>
      ) : (
        <section
          style={{
            display: "grid",
            gap: 16,
          }}
        >
          {transactions.map((transaction) => (
            <SaleCard
              key={transaction.id}
              transaction={transaction}
            />
          ))}
        </section>
      )}

      <nav
        aria-label="Sales pages"
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
