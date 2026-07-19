import {
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  Link,
  useNavigate,
  useParams,
} from "react-router-dom";

import {
  getMarketplaceTransactionById,
  type MarketplaceTransaction,
  type MarketplaceTransactionStatus,
} from "../services/marketplaceTransactions";

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

function readable(value: string | null | undefined) {
  return String(value || "Unknown")
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

function statusStyle(
  status: MarketplaceTransactionStatus,
): CSSProperties {
  const common: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    padding: "7px 12px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: "0.04em",
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

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <small>{label}</small>

      <div
        style={{
          marginTop: 5,
          color: "var(--text-strong)",
          fontWeight: 800,
          overflowWrap: "anywhere",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function AmountRow({
  label,
  value,
  currency,
  emphasized = false,
}: {
  label: string;
  value: number | string;
  currency: string;
  emphasized?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        padding: emphasized ? "16px 0 0" : "10px 0",
        marginTop: emphasized ? 6 : 0,
        borderTop: emphasized
          ? "1px solid var(--border)"
          : undefined,
        color: emphasized
          ? "var(--text-strong)"
          : "var(--muted)",
        fontWeight: emphasized ? 900 : 700,
        fontSize: emphasized ? 19 : 15,
      }}
    >
      <span>{label}</span>
      <span>{money(value, currency)}</span>
    </div>
  );
}

function PartyCard({
  title,
  name,
  role,
  shopName,
  address,
}: {
  title: string;
  name: string;
  role?: string;
  shopName?: string | null;
  address?: string;
}) {
  return (
    <section
      style={{
        ...panelStyle,
        padding: 20,
      }}
    >
      <p
        style={{
          margin: "0 0 8px",
          color: "var(--accent)",
          fontWeight: 900,
          textTransform: "uppercase",
          letterSpacing: "0.07em",
          fontSize: 12,
        }}
      >
        {title}
      </p>

      <h2
        style={{
          fontSize: 21,
          marginBottom: 8,
        }}
      >
        {shopName || name}
      </h2>

      {shopName ? (
        <p
          style={{
            color: "var(--muted)",
            marginBottom: 8,
          }}
        >
          Contact: {name}
        </p>
      ) : null}

      {role ? (
        <p
          style={{
            color: "var(--muted)",
            marginBottom: 8,
          }}
        >
          Account type: {readable(role)}
        </p>
      ) : null}

      {address ? (
        <p
          style={{
            color: "var(--muted)",
            marginBottom: 0,
          }}
        >
          {address}
        </p>
      ) : null}
    </section>
  );
}

function shopAddress(
  shop:
    | MarketplaceTransaction["buyerShop"]
    | MarketplaceTransaction["sellerShop"],
) {
  if (!shop) return "";

  return [
    shop.address,
    shop.city,
    shop.state,
    shop.zip,
  ]
    .filter(Boolean)
    .join(", ");
}

export default function MarketplaceTransactionDetailPage() {
  const navigate = useNavigate();
  const { id = "" } = useParams<{ id: string }>();

  const [transaction, setTransaction] =
    useState<MarketplaceTransaction | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(
    async (refresh = false) => {
      const transactionId = id.trim();

      if (!transactionId) {
        setError("Marketplace transaction ID is missing.");
        setLoading(false);
        return;
      }

      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

      try {
        const result =
          await getMarketplaceTransactionById(
            transactionId,
          );

        setTransaction(result);
      } catch (caught) {
        setTransaction(null);

        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to load marketplace transaction.",
        );
      } finally {
        if (refresh) {
          setRefreshing(false);
        } else {
          setLoading(false);
        }
      }
    },
    [id],
  );

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <main style={pageStyle}>
        <section
          aria-live="polite"
          style={{
            ...panelStyle,
            padding: 36,
            textAlign: "center",
            color: "var(--muted)",
          }}
        >
          Loading marketplace transaction...
        </section>
      </main>
    );
  }

  if (error || !transaction) {
    return (
      <main style={pageStyle}>
        <section
          role="alert"
          style={{
            ...panelStyle,
            padding: 32,
            textAlign: "center",
          }}
        >
          <p
            style={{
              margin: "0 0 8px",
              color: "var(--danger)",
              fontWeight: 900,
            }}
          >
            Transaction unavailable
          </p>

          <h1>We could not load this transaction</h1>

          <p style={{ color: "var(--muted)" }}>
            {error ||
              "The transaction could not be found."}
          </p>

          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={() => void load()}
              style={buttonStyle}
            >
              Try again
            </button>

            <Link
              to="/marketplace"
              style={buttonStyle}
            >
              Marketplace
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const listing = transaction.listing;

  const buyerName =
    transaction.buyer?.name ||
    "Marketplace buyer";

  const sellerName =
    transaction.seller?.name ||
    "Marketplace seller";

  const primaryImage =
    listing?.images?.find(
      (image) => typeof image === "string" && image,
    ) || "";

  return (
    <main style={pageStyle}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 18,
        }}
      >
        <button
          type="button"
          onClick={() => navigate(-1)}
          style={buttonStyle}
        >
          Back
        </button>

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
      </div>

      <header
        style={{
          ...panelStyle,
          padding: 24,
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 24,
          marginBottom: 20,
        }}
      >
        {primaryImage ? (
          <div
            style={{
              minHeight: 260,
              borderRadius: "var(--radius-md)",
              overflow: "hidden",
              background: "var(--bg-soft)",
            }}
          >
            <img
              src={primaryImage}
              alt={listing?.title || "Marketplace item"}
              style={{
                width: "100%",
                height: "100%",
                minHeight: 260,
                objectFit: "cover",
              }}
            />
          </div>
        ) : (
          <div
            aria-label="No item image available"
            style={{
              minHeight: 260,
              display: "grid",
              placeItems: "center",
              borderRadius: "var(--radius-md)",
              background: "var(--bg-soft)",
              color: "var(--muted)",
              fontWeight: 800,
            }}
          >
            No item image
          </div>
        )}

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <p
            style={{
              margin: "0 0 8px",
              color: "var(--accent)",
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              fontSize: 12,
            }}
          >
            {readable(transaction.type)}
          </p>

          <h1
            style={{
              fontSize: "clamp(30px, 5vw, 48px)",
            }}
          >
            {listing?.title ||
              "Marketplace transaction"}
          </h1>

          <p
            style={{
              color: "var(--muted)",
              maxWidth: 650,
            }}
          >
            {listing?.description ||
              "Review the payment, participants, item, and fulfillment details for this transaction."}
          </p>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <span style={statusStyle(transaction.status)}>
              {readable(transaction.status)}
            </span>

            <strong
              style={{
                color: "var(--text-strong)",
                fontSize: 24,
              }}
            >
              {money(
                transaction.totalAmount,
                transaction.currency,
              )}
            </strong>
          </div>
        </div>
      </header>

      <section
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 18,
          marginBottom: 20,
        }}
      >
        <PartyCard
          title="Buyer"
          name={buyerName}
          role={transaction.buyer?.role}
          shopName={transaction.buyerShop?.name}
          address={shopAddress(transaction.buyerShop)}
        />

        <PartyCard
          title="Seller"
          name={sellerName}
          role={transaction.seller?.role}
          shopName={transaction.sellerShop?.name}
          address={shopAddress(transaction.sellerShop)}
        />
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(300px, 1fr))",
          gap: 18,
        }}
      >
        <section
          style={{
            ...panelStyle,
            padding: 22,
          }}
        >
          <h2>Payment breakdown</h2>

          <AmountRow
            label="Subtotal"
            value={transaction.subtotal}
            currency={transaction.currency}
          />

          <AmountRow
            label="Platform fee"
            value={transaction.platformFee}
            currency={transaction.currency}
          />

          <AmountRow
            label="Shipping"
            value={transaction.shippingFee}
            currency={transaction.currency}
          />

          <AmountRow
            label="Tax"
            value={transaction.taxAmount}
            currency={transaction.currency}
          />

          <AmountRow
            label="Total"
            value={transaction.totalAmount}
            currency={transaction.currency}
            emphasized
          />
        </section>

        <section
          style={{
            ...panelStyle,
            padding: 22,
          }}
        >
          <h2>Transaction information</h2>

          <div
            style={{
              display: "grid",
              gap: 18,
              marginTop: 18,
            }}
          >
            <Field label="Transaction ID">
              {transaction.id}
            </Field>

            <Field label="Transaction type">
              {readable(transaction.type)}
            </Field>

            <Field label="Quantity">
              {transaction.quantity}
            </Field>

            <Field label="Currency">
              {transaction.currency}
            </Field>

            <Field label="Payment reference">
              {transaction.paymentIntentId || "Not assigned"}
            </Field>
          </div>
        </section>

        <section
          style={{
            ...panelStyle,
            padding: 22,
          }}
        >
          <h2>Fulfillment</h2>

          <div
            style={{
              display: "grid",
              gap: 18,
              marginTop: 18,
            }}
          >
            <Field label="Fulfillment status">
              {readable(transaction.fulfillmentStatus)}
            </Field>

            <Field label="Pickup available">
              {listing?.pickupAvailable ? "Yes" : "No"}
            </Field>

            <Field label="Shipping available">
              {listing?.shippingAvailable ? "Yes" : "No"}
            </Field>

            <Field label="Listing condition">
              {listing?.condition || "Not specified"}
            </Field>

            <Field label="Listing category">
              {listing?.category || "Not specified"}
            </Field>
          </div>
        </section>

        <section
          style={{
            ...panelStyle,
            padding: 22,
          }}
        >
          <h2>Timeline</h2>

          <div
            style={{
              display: "grid",
              gap: 18,
              marginTop: 18,
            }}
          >
            <Field label="Created">
              {dateLabel(transaction.createdAt)}
            </Field>

            <Field label="Last updated">
              {dateLabel(transaction.updatedAt)}
            </Field>

            <Field label="Completed">
              {dateLabel(transaction.completedAt)}
            </Field>

            <Field label="Canceled">
              {dateLabel(transaction.canceledAt)}
            </Field>
          </div>
        </section>
      </section>

      <div
        style={{
          display: "flex",
          justifyContent: "center",
          marginTop: 24,
        }}
      >
        <Link
          to="/marketplace"
          style={buttonStyle}
        >
          Return to marketplace
        </Link>
      </div>
    </main>
  );
}
