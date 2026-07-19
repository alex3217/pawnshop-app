import {
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Link,
  useNavigate,
  useParams,
} from "react-router-dom";

import {
  CardElement,
  Elements,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";

import { stripePromise } from "../lib/stripe";

import {
  getAuthRole,
  getAuthUser,
} from "../services/auth";

import {
  cancelMarketplaceTransactionReservation,
  createMarketplaceTransactionPaymentIntent,
  getMarketplaceTransactionById,
  updateMarketplaceTransactionFulfillment,
  type MarketplaceFulfillmentStatus,
  type MarketplaceFulfillmentUpdateTarget,
  type MarketplacePaymentIntent,
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

function metadataText(
  value: unknown,
) {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function sellerNetAmount(
  transaction: MarketplaceTransaction,
) {
  const metadata =
    metadataRecord(
      transaction.metadata,
    );

  const cents =
    Number(
      metadata.sellerNetCents,
    );

  if (
    Number.isFinite(cents) &&
    cents >= 0
  ) {
    return cents / 100;
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

function fulfillmentMetadata(
  transaction: MarketplaceTransaction,
) {
  const metadata =
    metadataRecord(
      transaction.metadata,
    );

  const fulfillment =
    metadataRecord(
      metadata.fulfillment,
    );

  return {
    carrier:
      metadataText(
        fulfillment.carrier,
      ),

    trackingNumber:
      metadataText(
        fulfillment.trackingNumber,
      ),

    note:
      metadataText(
        fulfillment.note,
      ),

    updatedAt:
      metadataText(
        fulfillment.updatedAt,
      ),
  };
}

function nextFulfillmentChoices(
  transaction: MarketplaceTransaction,
): Array<{
  value:
    MarketplaceFulfillmentUpdateTarget;

  label:
    string;

  description:
    string;
}> {
  switch (
    transaction.fulfillmentStatus
  ) {
    case "PAYMENT_PENDING":
      return [
        ...(transaction
          .listing
          ?.pickupAvailable
          ? [
              {
                value:
                  "READY_FOR_PICKUP" as const,

                label:
                  "Ready for pickup",

                description:
                  "Tell the buyer the item can be collected.",
              },
            ]
          : []),

        ...(transaction
          .listing
          ?.shippingAvailable
          ? [
              {
                value:
                  "SHIPPED" as const,

                label:
                  "Shipped",

                description:
                  "Record the carrier and tracking number.",
              },
            ]
          : []),
      ];

    case "READY_FOR_PICKUP":
      return [
        {
          value:
            "PICKED_UP",

          label:
            "Picked up",

          description:
            "Confirm the buyer collected the item.",
        },
      ];

    case "PICKED_UP":
    case "SHIPPED":
      return [
        {
          value:
            "COMPLETED",

          label:
            "Completed",

          description:
            "Close the transaction after fulfillment.",
        },
      ];

    default:
      return [];
  }
}

function fulfillmentGuidance(
  status: MarketplaceFulfillmentStatus,
) {
  switch (status) {
    case "PAYMENT_PENDING":
      return "Payment is complete, but the seller has not started fulfillment.";

    case "READY_FOR_PICKUP":
      return "The item is ready for pickup. Coordinate collection with the seller.";

    case "PICKED_UP":
      return "The seller recorded that the buyer collected the item.";

    case "SHIPPED":
      return "The seller shipped the item. Review the carrier and tracking information below.";

    case "COMPLETED":
      return "Payment and fulfillment are complete.";

    case "CANCELED":
      return "This fulfillment was canceled.";

    default:
      return "Review the latest fulfillment information below.";
  }
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

function MarketplaceCheckoutPanel({
  payment,
  disabled,
  onClose,
  onError,
  onSuccess,
}: {
  payment: MarketplacePaymentIntent;
  disabled: boolean;
  onClose: () => void;
  onError: (message: string) => void;
  onSuccess: () => Promise<void>;
}) {
  const stripe = useStripe();
  const elements = useElements();

  const [processing, setProcessing] =
    useState(false);

  async function submitPayment(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (
      !stripe ||
      !elements
    ) {
      onError(
        "Stripe is still loading. Please try again.",
      );

      return;
    }

    if (!payment.clientSecret) {
      onError(
        "The marketplace payment is missing its Stripe client secret.",
      );

      return;
    }

    const card =
      elements.getElement(
        CardElement,
      );

    if (!card) {
      onError(
        "The secure card form is not ready yet.",
      );

      return;
    }

    setProcessing(true);
    onError("");

    try {
      const result =
        await stripe.confirmCardPayment(
          payment.clientSecret,
          {
            payment_method: {
              card,
            },
          },
        );

      if (result.error) {
        throw new Error(
          result.error.message ||
          "Marketplace payment failed.",
        );
      }

      if (
        result.paymentIntent?.status !==
        "succeeded"
      ) {
        throw new Error(
          `Payment is ${
            result.paymentIntent?.status ||
            "not complete"
          } yet.`,
        );
      }

      await onSuccess();
    } catch (caught) {
      onError(
        caught instanceof Error
          ? caught.message
          : "Marketplace payment failed.",
      );
    } finally {
      setProcessing(false);
    }
  }

  return (
    <section
      style={{
        marginTop: 20,
        padding: 20,
        border:
          "1px solid var(--border)",
        borderRadius:
          "var(--radius-md)",
        background:
          "var(--bg-soft)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent:
            "space-between",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 18,
        }}
      >
        <div>
          <p
            style={{
              margin: "0 0 6px",
              color: "var(--accent)",
              fontWeight: 900,
              textTransform:
                "uppercase",
              letterSpacing:
                "0.07em",
              fontSize: 12,
            }}
          >
            Secure checkout
          </p>

          <h3
            style={{
              marginBottom: 6,
            }}
          >
            Pay marketplace transaction
          </h3>

          <p
            style={{
              margin: 0,
              color: "var(--muted)",
            }}
          >
            Payment reference{" "}
            {payment.paymentIntentId}
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          disabled={
            disabled ||
            processing
          }
          style={buttonStyle}
        >
          Close payment
        </button>
      </div>

      <form
        onSubmit={submitPayment}
        style={{
          display: "grid",
          gap: 16,
        }}
      >
        <div
          style={{
            padding: 16,
            border:
              "1px solid var(--border-strong)",
            borderRadius:
              "var(--radius-sm)",
            background:
              "var(--surface)",
          }}
        >
          <CardElement
            options={{
              hidePostalCode: true,
              style: {
                base: {
                  color: "#0f172a",
                  fontSize: "16px",
                  "::placeholder": {
                    color:
                      "#64748b",
                  },
                },
                invalid: {
                  color:
                    "#dc2626",
                },
              },
            }}
          />
        </div>

        <button
          type="submit"
          disabled={
            !stripe ||
            disabled ||
            processing
          }
          style={{
            ...buttonStyle,
            borderColor:
              "var(--accent)",
            background:
              "var(--accent)",
            color: "white",
            opacity:
              disabled ||
              processing
                ? 0.65
                : 1,
          }}
        >
          {processing
            ? "Confirming payment..."
            : "Confirm secure payment"}
        </button>
      </form>
    </section>
  );
}

export default function MarketplaceTransactionDetailPage() {
  const navigate = useNavigate();
  const { id = "" } = useParams<{ id: string }>();

  const [transaction, setTransaction] =
    useState<MarketplaceTransaction | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [
    activePayment,
    setActivePayment,
  ] =
    useState<MarketplacePaymentIntent | null>(
      null,
    );

  const [
    actionBusy,
    setActionBusy,
  ] =
    useState<
      "payment" |
      "cancellation" |
      "fulfillment" |
      null
    >(null);

  const [
    actionError,
    setActionError,
  ] = useState("");

  const [
    actionNotice,
    setActionNotice,
  ] = useState("");

  const [
    fulfillmentTarget,
    setFulfillmentTarget,
  ] = useState<
    MarketplaceFulfillmentUpdateTarget |
    ""
  >("");

  const [
    fulfillmentCarrier,
    setFulfillmentCarrier,
  ] = useState("");

  const [
    fulfillmentTracking,
    setFulfillmentTracking,
  ] = useState("");

  const [
    fulfillmentNote,
    setFulfillmentNote,
  ] = useState("");

  const [
    fulfillmentError,
    setFulfillmentError,
  ] = useState("");

  const [
    fulfillmentNotice,
    setFulfillmentNotice,
  ] = useState("");

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

  async function preparePayment() {
    if (!transaction) {
      return;
    }

    setActionBusy("payment");
    setActionError("");
    setActionNotice("");
    setActivePayment(null);

    try {
      const payment =
        await createMarketplaceTransactionPaymentIntent(
          transaction.id,
        );

      if (
        payment.finalized ||
        payment.paymentStatus ===
          "succeeded"
      ) {
        setActionNotice(
          "Stripe already reports this payment as successful. Refreshing the marketplace status.",
        );

        await load(true);
        return;
      }

      if (!payment.clientSecret) {
        throw new Error(
          "Stripe did not return a marketplace payment client secret.",
        );
      }

      setActivePayment(
        payment,
      );

      setActionNotice(
        "Payment is ready. Enter your card details below to complete checkout.",
      );
    } catch (caught) {
      setActionError(
        caught instanceof Error
          ? caught.message
          : "Unable to prepare marketplace payment.",
      );
    } finally {
      setActionBusy(null);
    }
  }

  async function paymentConfirmed() {
    setActivePayment(null);
    setActionError("");

    setActionNotice(
      "Stripe confirmed the payment. The transaction will show Paid after webhook processing completes.",
    );

    await load(true);
  }

  async function cancelReservation() {
    if (!transaction) {
      return;
    }

    const confirmed =
      window.confirm(
        "Cancel this marketplace reservation and return the item quantity to the listing?",
      );

    if (!confirmed) {
      return;
    }

    setActionBusy(
      "cancellation",
    );

    setActionError("");
    setActionNotice("");

    try {
      const cancellation =
        await cancelMarketplaceTransactionReservation(
          transaction.id,
          "BUYER_CANCELED_FROM_TRANSACTION_DETAIL",
        );

      setActivePayment(null);

      setActionNotice(
        cancellation.idempotent
          ? "This reservation was already canceled."
          : `Reservation canceled. ${cancellation.quantityRestored} item${
              cancellation.quantityRestored === 1
                ? ""
                : "s"
            } returned to the listing.`,
      );

      await load(true);
    } catch (caught) {
      setActionError(
        caught instanceof Error
          ? caught.message
          : "Unable to cancel the marketplace reservation.",
      );
    } finally {
      setActionBusy(null);
    }
  }

  async function submitFulfillment(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (
      !transaction ||
      !fulfillmentTarget
    ) {
      setFulfillmentError(
        "Choose the next fulfillment status.",
      );

      return;
    }

    setActionBusy(
      "fulfillment",
    );

    setFulfillmentError("");
    setFulfillmentNotice("");

    try {
      const result =
        await updateMarketplaceTransactionFulfillment(
          transaction.id,
          {
            fulfillmentStatus:
              fulfillmentTarget,

            carrier:
              fulfillmentTarget ===
                "SHIPPED"
                ? fulfillmentCarrier
                : undefined,

            trackingNumber:
              fulfillmentTarget ===
                "SHIPPED"
                ? fulfillmentTracking
                : undefined,

            note:
              fulfillmentNote,
          },
        );

      setTransaction(
        result.transaction,
      );

      setFulfillmentNotice(
        result.idempotent
          ? `Fulfillment was already ${readable(
              result.transaction.fulfillmentStatus,
            )}.`
          : `Fulfillment updated to ${readable(
              result.transaction.fulfillmentStatus,
            )}.`,
      );

      setFulfillmentTarget("");
      setFulfillmentCarrier("");
      setFulfillmentTracking("");
      setFulfillmentNote("");
    } catch (caught) {
      setFulfillmentError(
        caught instanceof Error
          ? caught.message
          : "Unable to update marketplace fulfillment.",
      );
    } finally {
      setActionBusy(null);
    }
  }

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

  const authUser =
    getAuthUser();

  const authRole =
    getAuthRole();

  const normalizedAuthRole =
    String(authRole || "")
      .trim()
      .toUpperCase();

  const isAdministrator =
    normalizedAuthRole ===
      "ADMIN" ||
    normalizedAuthRole ===
      "SUPER_ADMIN";

  const isTransactionBuyer =
    Boolean(
      authUser?.id &&
      authUser.id ===
        transaction.buyerUserId,
    );

  const isTransactionSeller =
    Boolean(
      authUser?.id &&
      (
        authUser.id ===
          transaction.sellerUserId ||
        authUser.id ===
          transaction.sellerShop?.ownerId
      ),
    );

  const canManageCheckout =
    isTransactionBuyer ||
    isAdministrator;

  const canManageFulfillment =
    isTransactionSeller ||
    isAdministrator;

  const transactionIsActionable =
    transaction.status ===
      "PENDING" ||
    transaction.status ===
      "PAYMENT_PROCESSING";

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

  const fulfillmentInfo =
    fulfillmentMetadata(
      transaction,
    );

  const fulfillmentChoices =
    nextFulfillmentChoices(
      transaction,
    );

  const sellerNet =
    sellerNetAmount(
      transaction,
    );

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
            label="Seller net proceeds"
            value={sellerNet}
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

          <p
            role="status"
            style={{
              color: "var(--muted)",
              marginTop: 10,
              marginBottom: 0,
            }}
          >
            {fulfillmentGuidance(
              transaction.fulfillmentStatus,
            )}
          </p>

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

            {fulfillmentInfo.carrier ? (
              <Field label="Carrier">
                {fulfillmentInfo.carrier}
              </Field>
            ) : null}

            {fulfillmentInfo.trackingNumber ? (
              <Field label="Tracking number">
                {fulfillmentInfo.trackingNumber}
              </Field>
            ) : null}

            {fulfillmentInfo.note ? (
              <Field label="Fulfillment note">
                {fulfillmentInfo.note}
              </Field>
            ) : null}

            {fulfillmentInfo.updatedAt ? (
              <Field label="Fulfillment updated">
                {dateLabel(
                  fulfillmentInfo.updatedAt,
                )}
              </Field>
            ) : null}

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

      {canManageFulfillment ? (
        <section
          style={{
            ...panelStyle,
            padding: 22,
            marginTop: 20,
          }}
        >
          <h2>
            Seller fulfillment actions
          </h2>

          <p
            style={{
              color: "var(--muted)",
              marginBottom: 18,
            }}
          >
            Record pickup or shipping progress so the buyer can follow the transaction.
          </p>

          {fulfillmentError ? (
            <p
              role="alert"
              style={{
                padding: 14,
                borderRadius: "var(--radius-sm)",
                background: "rgba(255, 142, 161, 0.14)",
                color: "var(--danger)",
                fontWeight: 800,
              }}
            >
              {fulfillmentError}
            </p>
          ) : null}

          {fulfillmentNotice ? (
            <p
              role="status"
              style={{
                padding: 14,
                borderRadius: "var(--radius-sm)",
                background: "rgba(126, 242, 167, 0.14)",
                color: "var(--text-strong)",
                fontWeight: 800,
              }}
            >
              {fulfillmentNotice}
            </p>
          ) : null}

          {![
            "PAID",
            "FULFILLING",
            "COMPLETED",
          ].includes(
            transaction.status,
          ) ? (
            <p
              style={{
                color: "var(--muted)",
                fontWeight: 700,
              }}
            >
              Fulfillment controls unlock after marketplace payment completes.
            </p>
          ) : transaction.fulfillmentStatus ===
            "COMPLETED" ? (
            <p
              style={{
                color: "var(--success)",
                fontWeight: 800,
              }}
            >
              This transaction has completed fulfillment.
            </p>
          ) : fulfillmentChoices.length === 0 ? (
            <p
              style={{
                color: "var(--muted)",
                fontWeight: 700,
              }}
            >
              No additional fulfillment transition is currently available.
            </p>
          ) : (
            <form
              onSubmit={submitFulfillment}
              style={{
                display: "grid",
                gap: 16,
              }}
            >
              <label>
                Next fulfillment status

                <select
                  aria-label="Next fulfillment status"
                  value={fulfillmentTarget}
                  onChange={(event) =>
                    setFulfillmentTarget(
                      event.target.value as
                        MarketplaceFulfillmentUpdateTarget |
                        "",
                    )
                  }
                  required
                  style={{
                    marginTop: 7,
                  }}
                >
                  <option value="">
                    Choose next status
                  </option>

                  {fulfillmentChoices.map(
                    (choice) => (
                      <option
                        key={choice.value}
                        value={choice.value}
                      >
                        {choice.label}
                      </option>
                    ),
                  )}
                </select>
              </label>

              {fulfillmentTarget ? (
                <p
                  style={{
                    margin: 0,
                    color: "var(--muted)",
                  }}
                >
                  {
                    fulfillmentChoices.find(
                      (choice) =>
                        choice.value ===
                        fulfillmentTarget,
                    )?.description
                  }
                </p>
              ) : null}

              {fulfillmentTarget ===
              "SHIPPED" ? (
                <>
                  <label>
                    Carrier

                    <input
                      aria-label="Carrier"
                      value={fulfillmentCarrier}
                      onChange={(event) =>
                        setFulfillmentCarrier(
                          event.target.value,
                        )
                      }
                      maxLength={80}
                      required
                      style={{
                        marginTop: 7,
                      }}
                    />
                  </label>

                  <label>
                    Tracking number

                    <input
                      aria-label="Tracking number"
                      value={fulfillmentTracking}
                      onChange={(event) =>
                        setFulfillmentTracking(
                          event.target.value,
                        )
                      }
                      maxLength={120}
                      required
                      style={{
                        marginTop: 7,
                      }}
                    />
                  </label>
                </>
              ) : null}

              <label>
                Fulfillment note

                <textarea
                  aria-label="Fulfillment note"
                  value={fulfillmentNote}
                  onChange={(event) =>
                    setFulfillmentNote(
                      event.target.value,
                    )
                  }
                  maxLength={500}
                  rows={3}
                  placeholder="Optional instructions or fulfillment update"
                  style={{
                    marginTop: 7,
                  }}
                />
              </label>

              <button
                type="submit"
                disabled={
                  !fulfillmentTarget ||
                  actionBusy !== null ||
                  refreshing
                }
                style={{
                  ...buttonStyle,
                  borderColor: "var(--accent)",
                  background: "var(--accent)",
                  color: "white",
                  opacity:
                    !fulfillmentTarget ||
                    actionBusy !== null ||
                    refreshing
                      ? 0.65
                      : 1,
                }}
              >
                {actionBusy ===
                "fulfillment"
                  ? "Updating fulfillment..."
                  : "Update fulfillment"}
              </button>
            </form>
          )}
        </section>
      ) : null}

      {canManageCheckout ? (
        <section
          style={{
            ...panelStyle,
            padding: 22,
            marginTop: 20,
          }}
        >
          <h2>
            Checkout actions
          </h2>

          <p
            style={{
              color:
                "var(--muted)",
              marginBottom: 18,
            }}
          >
            Pay this reservation securely or cancel it before payment completes.
          </p>

          {actionError ? (
            <p
              role="alert"
              style={{
                padding: 14,
                borderRadius:
                  "var(--radius-sm)",
                background:
                  "rgba(255, 142, 161, 0.14)",
                color:
                  "var(--danger)",
                fontWeight: 800,
              }}
            >
              {actionError}
            </p>
          ) : null}

          {actionNotice ? (
            <p
              role="status"
              style={{
                padding: 14,
                borderRadius:
                  "var(--radius-sm)",
                background:
                  "rgba(126, 242, 167, 0.14)",
                color:
                  "var(--text-strong)",
                fontWeight: 800,
              }}
            >
              {actionNotice}
            </p>
          ) : null}

          <div
            style={{
              display: "flex",
              gap: 12,
              flexWrap:
                "wrap",
            }}
          >
            <button
              type="button"
              onClick={() =>
                void preparePayment()
              }
              disabled={
                !transactionIsActionable ||
                actionBusy !== null ||
                refreshing
              }
              style={{
                ...buttonStyle,
                borderColor:
                  "var(--accent)",
                background:
                  "var(--accent)",
                color: "white",
                opacity:
                  !transactionIsActionable ||
                  actionBusy !== null ||
                  refreshing
                    ? 0.65
                    : 1,
              }}
            >
              {actionBusy ===
              "payment"
                ? "Preparing payment..."
                : "Pay now"}
            </button>

            <button
              type="button"
              onClick={() =>
                void cancelReservation()
              }
              disabled={
                !transactionIsActionable ||
                actionBusy !== null ||
                refreshing
              }
              style={{
                ...buttonStyle,
                borderColor:
                  "var(--danger)",
                color:
                  "var(--danger)",
                opacity:
                  !transactionIsActionable ||
                  actionBusy !== null ||
                  refreshing
                    ? 0.65
                    : 1,
              }}
            >
              {actionBusy ===
              "cancellation"
                ? "Canceling reservation..."
                : "Cancel reservation"}
            </button>
          </div>

          {!transactionIsActionable ? (
            <p
              style={{
                margin:
                  "16px 0 0",
                color:
                  "var(--muted)",
                fontWeight: 700,
              }}
            >
              Payment and reservation cancellation are unavailable for a {readable(
                transaction.status,
              )} transaction.
            </p>
          ) : null}

          {activePayment?.clientSecret ? (
            <Elements
              stripe={
                stripePromise
              }
            >
              <MarketplaceCheckoutPanel
                payment={
                  activePayment
                }
                disabled={
                  actionBusy !==
                    null ||
                  refreshing
                }
                onClose={() =>
                  setActivePayment(
                    null,
                  )
                }
                onError={
                  setActionError
                }
                onSuccess={
                  paymentConfirmed
                }
              />
            </Elements>
          ) : null}
        </section>
      ) : null}

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
