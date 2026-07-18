// File: apps/web/src/pages/OwnerDashboardPage.tsx

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { Link } from "react-router-dom";
import { getAuthToken } from "../services/auth";
import {
  createOwnerBuyerItemSubmissionOffer,
  getOwnerBuyerItemSubmissions,
  getOwnerItems,
  getOwnerShops,
  getShopEntitlements,
  reviewBuyerItemSubmission,
  type OwnerBuyerItemSubmission,
} from "../services/ownerWorkspace";
import "../styles/owner-dashboard-readability.css";
import { DEFAULT_FOUNDING_SHOP_PROGRAM, getFoundingShopProgramSettings } from "../services/foundingShopProgram";
import { firstUsableImage } from "../utils/imageUrl";

type Shop = {
  id: string;
  name: string;
  address?: string | null;
};

type Item = {
  id: string;
  title: string;
  price: string | number;
  status: string;
  pawnShopId: string;
};

type Entitlements = {
  shopId: string;
  shopName: string;
  ownerId?: string;
  subscription: {
    storedPlan?: string;
    effectivePlan: string;
    status: string;
    currentPeriodEnd?: string | null;
    cancelAtPeriodEnd?: boolean;
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
  };
  billing: {
    commissionPercent: number;
    commissionBps?: number;
    monthlyPriceCents?: number;
    yearlyPriceCents?: number;
  };
  usage: {
    activeListingCount: number;
    remainingActiveListings: number | null;
    isUnlimitedListings: boolean;
    countedStatuses?: string[];
  };
  features: {
    canCreateAuctions: boolean;
    canFeatureListings: boolean;
    analyticsLevel: string;
  };
  limits?: {
    maxActiveListings?: number | null;
    maxLocations?: number | null;
    maxStaffUsers?: number | null;
  };
};

type ApiEnvelope<T> = {
  success?: boolean;
  error?: string;
  message?: string;
  data?: T;
  shops?: T;
  items?: T;
  entitlements?: T;
};


function requireAuthToken() {
  const token = getAuthToken();
  if (!token) {
    throw new Error("Missing owner token. Please log in again.");
  }
  return token;
}



function unwrapData<T = unknown>(payload: unknown): T | null {
  if (payload == null) return null;
  if (Array.isArray(payload)) return payload as T;
  if (typeof payload !== "object") return payload as T;

  const maybe = payload as ApiEnvelope<T>;
  if (maybe.data !== undefined) return maybe.data as T;

  return payload as T;
}

function extractArrayPayload(payload: unknown, keys: string[]): unknown[] {
  if (Array.isArray(payload)) return payload;

  if (!payload || typeof payload !== "object") return [];

  const record = payload as Record<string, unknown>;

  for (const key of keys) {
    const value = record[key];

    if (Array.isArray(value)) return value;

    if (value && typeof value === "object") {
      const nested = value as Record<string, unknown>;

      for (const nestedKey of keys) {
        const nestedValue = nested[nestedKey];

        if (Array.isArray(nestedValue)) return nestedValue;

        if (nestedValue && typeof nestedValue === "object") {
          const deep = nestedValue as Record<string, unknown>;

          for (const deepKey of keys) {
            if (Array.isArray(deep[deepKey])) return deep[deepKey] as unknown[];
          }
        }
      }
    }
  }

  return [];
}

function normalizeShops(payload: unknown): Shop[] {
  const rows = extractArrayPayload(payload, [
    "rows",
    "shops",
    "data",
    "items",
    "results",
  ]);

  return rows
    .filter(
      (value): value is Record<string, unknown> =>
        Boolean(value) && typeof value === "object",
    )
    .map((shop) => ({
      id: String(shop.id || ""),
      name: String(shop.name || "Unnamed Shop"),
      address: shop.address == null ? null : String(shop.address),
    }))
    .filter((shop) => Boolean(shop.id));
}

function normalizeItems(payload: unknown): Item[] {
  const rows = extractArrayPayload(payload, [
    "rows",
    "items",
    "data",
    "results",
  ]);

  return rows
    .filter(
      (value): value is Record<string, unknown> =>
        Boolean(value) && typeof value === "object",
    )
    .map((item) => ({
      id: String(item.id || ""),
      title: String(item.title || "Untitled Item"),
      price:
        typeof item.price === "number" || typeof item.price === "string"
          ? item.price
          : "0",
      status: String(item.status || "UNKNOWN"),
      pawnShopId: String(item.pawnShopId || item.shopId || ""),
    }))
    .filter((item) => Boolean(item.id));
}

function normalizeEntitlements(payload: unknown): Entitlements | null {
  const unwrapped = unwrapData(payload);
  if (!unwrapped || typeof unwrapped !== "object") return null;

  const maybe = unwrapped as Record<string, unknown>;

  if (maybe.entitlements && typeof maybe.entitlements === "object") {
    return maybe.entitlements as Entitlements;
  }

  if (
    typeof maybe.shopId === "string" &&
    maybe.subscription &&
    typeof maybe.subscription === "object"
  ) {
    return maybe as unknown as Entitlements;
  }

  return null;
}


function formatSubmissionValue(value?: string | number | null) {
  const num = Number(value || 0);
  if (!Number.isFinite(num) || num <= 0) return "—";
  return `$${num.toFixed(2)}`;
}

function getSubmissionStatusTone(status: string): CSSProperties {
  const normalized = String(status || "").toUpperCase();

  if (["SUBMITTED", "REVIEWING"].includes(normalized)) {
    return {
      color: "#1d4ed8",
      background: "#dbeafe",
      border: "1px solid rgba(37, 99, 235, 0.25)",
    };
  }

  if (["OFFERED"].includes(normalized)) {
    return {
      color: "#166534",
      background: "#dcfce7",
      border: "1px solid rgba(22, 101, 52, 0.22)",
    };
  }

  if (["NEEDS_INFO"].includes(normalized)) {
    return {
      color: "#92400e",
      background: "#fef3c7",
      border: "1px solid rgba(146, 64, 14, 0.22)",
    };
  }

  if (["REJECTED", "WITHDRAWN"].includes(normalized)) {
    return {
      color: "#991b1b",
      background: "#fee2e2",
      border: "1px solid rgba(153, 27, 27, 0.22)",
    };
  }

  return {
    color: "#334155",
    background: "#f1f5f9",
    border: "1px solid rgba(148, 163, 184, 0.35)",
  };
}

function getSubmissionPreview(submission: OwnerBuyerItemSubmission) {
  return firstUsableImage(submission.images);
}

function formatMoney(cents?: number | null) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

function formatPrice(value: string | number) {
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  return `$${num.toFixed(2)}`;
}

function formatPercent(value?: number | null) {
  return `${Number(value || 0).toFixed(2)}%`;
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function formatLimit(value?: number | null) {
  if (value === null) return "Unlimited";
  if (value === undefined) return "—";
  return String(value);
}

function getStatusTone(status: string): CSSProperties {
  const normalized = String(status || "").toUpperCase();

  if (["ACTIVE", "TRIALING"].includes(normalized)) {
    return {
      color: "#7ef0b3",
      background: "rgba(46, 204, 113, 0.12)",
      border: "1px solid rgba(46, 204, 113, 0.24)",
    };
  }

  if (["PAST_DUE", "INCOMPLETE", "UNPAID"].includes(normalized)) {
    return {
      color: "#ffd98a",
      background: "rgba(255, 193, 7, 0.12)",
      border: "1px solid rgba(255, 193, 7, 0.24)",
    };
  }

  if (["CANCELED", "CANCELLED", "INACTIVE", "EXPIRED"].includes(normalized)) {
    return {
      color: "#ff9ead",
      background: "rgba(255, 128, 143, 0.12)",
      border: "1px solid rgba(255, 128, 143, 0.24)",
    };
  }

  return {
    color: "#c7d2fe",
    background: "rgba(199, 210, 254, 0.10)",
    border: "1px solid rgba(199, 210, 254, 0.18)",
  };
}

function getItemStatusTone(status: string): CSSProperties {
  const normalized = String(status || "").toUpperCase();

  if (["AVAILABLE", "ACTIVE"].includes(normalized)) {
    return {
      color: "#7ef0b3",
      background: "rgba(46, 204, 113, 0.12)",
      border: "1px solid rgba(46, 204, 113, 0.24)",
    };
  }

  if (["PENDING"].includes(normalized)) {
    return {
      color: "#ffd98a",
      background: "rgba(255, 193, 7, 0.12)",
      border: "1px solid rgba(255, 193, 7, 0.24)",
    };
  }

  if (["SOLD", "INACTIVE", "REMOVED"].includes(normalized)) {
    return {
      color: "#ffb2bc",
      background: "rgba(255, 128, 143, 0.10)",
      border: "1px solid rgba(255, 128, 143, 0.18)",
    };
  }

  return {
    color: "#c7d2fe",
    background: "rgba(199, 210, 254, 0.10)",
    border: "1px solid rgba(199, 210, 254, 0.18)",
  };
}

export default function OwnerDashboardPage() {
  const [foundingProgram, setFoundingProgram] = useState(DEFAULT_FOUNDING_SHOP_PROGRAM);

  useEffect(() => {
    let mounted = true;

    getFoundingShopProgramSettings()
      .then((program) => {
        if (mounted) setFoundingProgram(program);
      })
      .catch(() => {
        if (mounted) setFoundingProgram(DEFAULT_FOUNDING_SHOP_PROGRAM);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const [shops, setShops] = useState<Shop[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [buyerItemSubmissions, setBuyerItemSubmissions] = useState<OwnerBuyerItemSubmission[]>([]);
  const [buyerSubmissionActionId, setBuyerSubmissionActionId] = useState<string | null>(null);
  const [submissionOfferAmounts, setSubmissionOfferAmounts] = useState<Record<string, string>>({});
  const [submissionOfferMessages, setSubmissionOfferMessages] = useState<Record<string, string>>({});
  const [selectedShopId, setSelectedShopId] = useState("");
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);

  const [pageLoading, setPageLoading] = useState(true);
  const [entitlementsLoading, setEntitlementsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [pageError, setPageError] = useState<string | null>(null);
  const [entitlementsError, setEntitlementsError] = useState<string | null>(
    null
  );
  const [dashboardMessage, setDashboardMessage] = useState<string | null>(null);

  const selectedShop = useMemo(
    () => shops.find((shop) => shop.id === selectedShopId) || null,
    [shops, selectedShopId]
  );

  const filteredItems = useMemo(() => {
    if (!selectedShopId) return items;
    return items.filter((item) => item.pawnShopId === selectedShopId);
  }, [items, selectedShopId]);

  const activeItemCount = useMemo(() => {
    return filteredItems.filter((item) =>
      ["AVAILABLE", "PENDING", "ACTIVE"].includes(
        String(item.status || "").toUpperCase()
      )
    ).length;
  }, [filteredItems]);

  const loadEntitlements = useCallback(
    async (shopId: string, signal?: AbortSignal, silent = false) => {
      if (!shopId) {
        setEntitlements(null);
        setEntitlementsError(null);
        return;
      }

      if (silent) {
        setRefreshing(true);
      } else {
        setEntitlementsLoading(true);
      }

      setEntitlementsError(null);

      try {
        requireAuthToken();

        const json = await getShopEntitlements(shopId, signal);

        const nextEntitlements = normalizeEntitlements(json);

        if (!nextEntitlements) {
          throw new Error("Entitlements response was empty or invalid.");
        }

        setEntitlements(nextEntitlements);
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;

        const message =
          err instanceof Error ? err.message : "Failed to load entitlements";
        setEntitlements(null);
        setEntitlementsError(message);
      } finally {
        setEntitlementsLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  const loadDashboard = useCallback(
    async (signal?: AbortSignal, silent = false) => {
      if (silent) {
        setRefreshing(true);
      } else {
        setPageLoading(true);
      }

      setPageError(null);
      setEntitlementsError(null);

      try {
        requireAuthToken();

        const [shopsJson, itemsJson, buyerSubmissionsJson] = await Promise.all([
          getOwnerShops(signal),
          getOwnerItems(signal),
          getOwnerBuyerItemSubmissions(signal),
        ]);

        const nextShops = normalizeShops(shopsJson);
        const nextItems = normalizeItems(itemsJson);

        setShops(nextShops);
        setItems(nextItems);
        setBuyerItemSubmissions(buyerSubmissionsJson);

        if (nextShops.length > 0) {
          setSelectedShopId((prev) =>
            prev && nextShops.some((shop) => shop.id === prev)
              ? prev
              : nextShops[0].id
          );
        } else {
          setSelectedShopId("");
          setEntitlements(null);
        }
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;

        const message =
          err instanceof Error ? err.message : "Failed to load owner dashboard";
        setPageError(message);
        setShops([]);
        setItems([]);
        setBuyerItemSubmissions([]);
        setSelectedShopId("");
        setEntitlements(null);
      } finally {
        setPageLoading(false);
        setRefreshing(false);
      }
    },
    []
  );


  useEffect(() => {
    const controller = new AbortController();

    void loadDashboard(controller.signal);

    return () => controller.abort();
  }, [loadDashboard]);

  useEffect(() => {
    const controller = new AbortController();

    if (!selectedShopId) {
      setEntitlements(null);
      setEntitlementsError(null);
      return () => controller.abort();
    }

    void loadEntitlements(selectedShopId, controller.signal);

    return () => controller.abort();
  }, [selectedShopId, loadEntitlements]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const url = new URL(window.location.href);
    const subscriptionUpdated = url.searchParams.get("subscriptionUpdated");
    const checkout = url.searchParams.get("checkout");
    const plan = url.searchParams.get("plan");
    const shopIdFromQuery = url.searchParams.get("shopId");

    if (subscriptionUpdated === "1") {
      setDashboardMessage("Subscription details were refreshed.");
    } else if (checkout === "success") {
      setDashboardMessage(
        `Checkout completed${plan ? ` for ${plan}` : ""}. Dashboard refreshed.`,
      );
    } else if (checkout === "cancelled") {
      setDashboardMessage("Checkout was cancelled. No billing changes were made.");
    } else {
      return;
    }

    if (shopIdFromQuery) {
      setSelectedShopId(shopIdFromQuery);
      void loadEntitlements(shopIdFromQuery, undefined, true);
    } else if (selectedShopId) {
      void loadEntitlements(selectedShopId, undefined, true);
    }

    url.searchParams.delete("subscriptionUpdated");
    url.searchParams.delete("checkout");
    url.searchParams.delete("plan");
    url.searchParams.delete("shopId");
    window.history.replaceState({}, "", url.toString());
  }, [loadEntitlements, selectedShopId]);

  const planSummary = useMemo(() => {
    if (!entitlements) return null;

    return {
      plan: entitlements.subscription.effectivePlan,
      storedPlan:
        entitlements.subscription.storedPlan ||
        entitlements.subscription.effectivePlan,
      status: entitlements.subscription.status,
      listings: entitlements.usage.activeListingCount,
      remaining: entitlements.usage.isUnlimitedListings
        ? "Unlimited"
        : entitlements.usage.remainingActiveListings ?? 0,
      canCreateAuctions: entitlements.features.canCreateAuctions
        ? "Enabled"
        : "Disabled",
      canFeatureListings: entitlements.features.canFeatureListings
        ? "Enabled"
        : "Disabled",
      analytics: entitlements.features.analyticsLevel,
      commission: formatPercent(entitlements.billing.commissionPercent),
      currentPeriodEnd: formatDate(entitlements.subscription.currentPeriodEnd),
      monthlyPrice: formatMoney(entitlements.billing.monthlyPriceCents),
      yearlyPrice: formatMoney(entitlements.billing.yearlyPriceCents),
      maxLocations: formatLimit(entitlements.limits?.maxLocations),
      maxStaffUsers: formatLimit(entitlements.limits?.maxStaffUsers),
      maxActiveListings: formatLimit(entitlements.limits?.maxActiveListings),
      cancelAtPeriodEnd: entitlements.subscription.cancelAtPeriodEnd ? "Yes" : "No",
    };
  }, [entitlements]);

  async function handleRefresh() {
    const controller = new AbortController();
    await loadDashboard(controller.signal, true);

    if (selectedShopId) {
      await loadEntitlements(selectedShopId, controller.signal, true);
    }
  }


  async function handleReviewBuyerSubmission(
    id: string,
    status: "REVIEWING" | "OFFERED" | "REJECTED" | "NEEDS_INFO",
    reviewMessage?: string,
  ) {
    try {
      setBuyerSubmissionActionId(id);
      setPageError(null);

      const updated = await reviewBuyerItemSubmission(id, {
        status,
        reviewMessage,
      });

      setBuyerItemSubmissions((current) =>
        current.map((submission) =>
          submission.id === id ? { ...submission, ...updated } : submission,
        ),
      );

      setDashboardMessage(`Buyer item request marked ${status}.`);
    } catch (err) {
      setPageError(
        err instanceof Error
          ? err.message
          : "Failed to review buyer item request.",
      );
    } finally {
      setBuyerSubmissionActionId(null);
    }
  }



  async function handleCreateBuyerSubmissionOffer(id: string) {
    try {
      if (!selectedShopId) {
        setPageError("Select a shop before sending an offer.");
        return;
      }

      const amount = Number(submissionOfferAmounts[id] || "");

      if (!Number.isFinite(amount) || amount <= 0) {
        setPageError("Enter a valid offer amount before sending.");
        return;
      }

      setBuyerSubmissionActionId(id);
      setPageError(null);

      await createOwnerBuyerItemSubmissionOffer(id, {
        shopId: selectedShopId,
        amount,
        message: submissionOfferMessages[id] || "",
      });

      setSubmissionOfferAmounts((current) => ({ ...current, [id]: "" }));
      setSubmissionOfferMessages((current) => ({ ...current, [id]: "" }));

      setBuyerItemSubmissions((current) =>
        current.map((submission) =>
          submission.id === id ? { ...submission, status: "OFFERED" } : submission,
        ),
      );

      setDashboardMessage("Cash offer sent to buyer.");
    } catch (err) {
      setPageError(
        err instanceof Error ? err.message : "Failed to send cash offer.",
      );
    } finally {
      setBuyerSubmissionActionId(null);
    }
  }


  return (
    <div className="owner-dashboard-readability" style={styles.page}>
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>Owner Dashboard</h2>
          <p style={styles.subtitle}>
            Manage shops, inventory, and seller-plan access from one place.
          </p>
        </div>

        <div style={styles.actions}>
          <Link to="/owner/items/new" style={styles.linkButton}>
            Create Item
          </Link>
          <Link to="/owner/auctions/new" style={styles.linkButton}>
            Create Auction
          </Link>
          <Link to="/owner/subscription" style={styles.linkButtonPrimary}>
            Plan & Billing
          </Link>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={pageLoading || entitlementsLoading || refreshing}
            style={{
              ...styles.refreshButton,
              ...(pageLoading || entitlementsLoading || refreshing
                ? styles.disabledButton
                : {}),
            }}
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {dashboardMessage ? <div style={styles.success}>{dashboardMessage}</div> : null}
      {pageError ? <div style={styles.error}>{pageError}</div> : null}
      {entitlementsError ? <div style={styles.error}>{entitlementsError}</div> : null}

      {foundingProgram.enabled ? (
        <section
          style={{
            ...styles.card,
            border: "1px solid rgba(37, 99, 235, 0.28)",
            background:
              "linear-gradient(135deg, rgba(37,99,235,0.12), rgba(15,23,42,0.04))",
            marginBottom: 18,
          }}
        >
          <div style={styles.kicker}>Founding Shop Program</div>
          <h3 style={styles.sectionTitle}>{foundingProgram.headline}</h3>
          <p style={styles.subtitle}>{foundingProgram.subtitle}</p>
          <div style={styles.muted}>
            {foundingProgram.trialDays} days free · first {foundingProgram.shopLimit} shops ·
            free setup for {foundingProgram.freeUploadCount} items.
          </div>
          <div style={styles.muted}>
            Trial starts after your profile is complete and {foundingProgram.minimumLiveItems} items are live.
          </div>
          <Link to="/owner/subscription" style={styles.linkButtonPrimary}>
            View Trial & Plans
          </Link>
        </section>
      ) : null}

      {!pageLoading ? (
        <section
          style={{
            ...styles.card,
            background:
              "radial-gradient(circle at top left, rgba(110,168,254,0.22), transparent 32%), #121935",
            border: "1px solid rgba(110,168,254,0.28)",
          }}
        >
          <div style={styles.header}>
            <div>
              <div style={styles.kicker}>Owner Command Center</div>
              <h3 style={styles.sectionTitle}>Shop Operating Hub</h3>
              <p style={styles.subtitle}>
                Daily controls for inventory, auctions, offers, settlements, integrations,
                staff, locations, billing, and shop health.
              </p>
            </div>

            <div style={styles.actions}>
              <Link to="/owner/items/new" style={styles.linkButtonPrimary}>
                Add Item
              </Link>
              <Link to="/owner/bulk-upload" style={styles.linkButton}>
                Bulk Upload
              </Link>
              <Link to="/owner/scan-console" style={styles.linkButton}>
                Scan Console
              </Link>
              <Link to="/owner/auctions/new" style={styles.linkButton}>
                Create Auction
              </Link>
              <Link to="/owner/integrations" style={styles.linkButton}>
                Integrations
              </Link>
            </div>
          </div>

          <div style={styles.grid}>
            <div style={styles.card}>
              <div style={styles.kicker}>Shop Health</div>
              <div style={styles.bigValue}>{shops.length}</div>
              <div style={styles.muted}>Total shops</div>
              <div style={styles.muted}>
                Selected: {selectedShop?.name || "No shop selected"}
              </div>
            </div>

            <div style={styles.card}>
              <div style={styles.kicker}>Inventory Health</div>
              <div style={styles.bigValue}>{activeItemCount}</div>
              <div style={styles.muted}>Active listings for selected shop</div>
              <div style={styles.muted}>Total selected-shop items: {filteredItems.length}</div>
            </div>

            <div style={styles.card}>
              <div style={styles.kicker}>Revenue / Offers / Auctions</div>
              <div style={styles.muted}>
                Review buyer offers, live auctions, and payment handoffs.
              </div>
              <div style={styles.actions}>
                <Link to="/offers" style={styles.linkButton}>Offers</Link>
                <Link to="/owner/auctions" style={styles.linkButton}>Auctions</Link>
                <Link to="/settlements" style={styles.linkButton}>Settlements</Link>
              </div>
            </div>

            <div style={styles.card}>
              <div style={styles.kicker}>Incoming Buyer Requests</div>
              <div style={styles.bigValue}>{buyerItemSubmissions.length}</div>
              <div style={styles.muted}>
                Buyer-submitted scan/photo item requests waiting for owner review.
              </div>
            </div>

            <div style={styles.card}>
              <div style={styles.kicker}>Operations</div>
              <div style={styles.muted}>
                Manage staff, locations, subscription, and setup status.
              </div>
              <div style={styles.actions}>
                <Link to="/owner/staff" style={styles.linkButton}>Staff</Link>
                <Link to="/owner/locations" style={styles.linkButton}>Locations</Link>
                <Link to="/owner/subscription" style={styles.linkButton}>Subscription</Link>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {pageLoading ? (
        <div style={styles.card}>Loading owner dashboard...</div>
      ) : (
        <>
          <section style={styles.toolbar}>
            <div>
              <label style={styles.label}>Selected shop</label>
              <select
                value={selectedShopId}
                onChange={(e) => setSelectedShopId(e.target.value)}
                style={styles.select}
                disabled={shops.length === 0}
              >
                {shops.length === 0 ? (
                  <option value="">No shops available</option>
                ) : (
                  shops.map((shop) => (
                    <option key={shop.id} value={shop.id}>
                      {shop.name}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div style={styles.toolbarStats}>
              <div style={styles.statBadge}>Shops: {shops.length}</div>
              <div style={styles.statBadge}>Items: {filteredItems.length}</div>
              <div style={styles.statBadge}>Active: {activeItemCount}</div>
            </div>
          </section>


          <section style={styles.section}>
            <div style={styles.header}>
              <div>
                <h3 style={styles.sectionTitle}>Incoming Buyer Item Requests</h3>
                <p style={styles.subtitle}>
                  Review buyer-submitted scan/photo requests and decide whether to review,
                  request more info, make an offer later, or reject.
                </p>
              </div>

              <button
                type="button"
                onClick={handleRefresh}
                disabled={refreshing || buyerSubmissionActionId !== null}
                style={{
                  ...styles.refreshButton,
                  ...(refreshing || buyerSubmissionActionId !== null
                    ? styles.disabledButton
                    : {}),
                }}
              >
                {refreshing ? "Refreshing..." : "Refresh Requests"}
              </button>
            </div>

            {buyerItemSubmissions.length === 0 ? (
              <div style={styles.card}>
                No buyer item requests are waiting right now.
              </div>
            ) : (
              <div style={styles.grid}>
                {buyerItemSubmissions.slice(0, 6).map((submission) => {
                  const preview = getSubmissionPreview(submission);
                  const working = buyerSubmissionActionId === submission.id;

                  return (
                    <article key={submission.id} style={styles.card}>
                      {preview ? (
                        <img
                          src={preview}
                          alt={submission.title}
                          style={{
                            width: "100%",
                            height: 160,
                            objectFit: "cover",
                            borderRadius: 14,
                            marginBottom: 12,
                          }}
                        />
                      ) : null}

                      <div style={styles.kicker}>Buyer Request</div>
                      <h4 style={{ margin: "6px 0", fontSize: 20 }}>
                        {submission.title}
                      </h4>

                      <div
                        style={{
                          ...styles.pill,
                          ...getSubmissionStatusTone(submission.status),
                          width: "fit-content",
                        }}
                      >
                        {submission.status}
                      </div>

                      <div style={styles.muted}>
                        Category: {submission.category || "Not listed"}
                      </div>
                      <div style={styles.muted}>
                        Condition: {submission.condition || "Not listed"}
                      </div>
                      <div style={styles.muted}>
                        Estimated value: {formatSubmissionValue(submission.estimatedValue)}
                      </div>
                      <div style={styles.muted}>
                        Intent: {submission.intent || "PAWN_OFFERS"}
                      </div>
                      <div style={styles.muted}>
                        Radius: {submission.radiusMiles || 25} miles
                      </div>

                      {submission.description ? (
                        <p style={styles.description}>{submission.description}</p>
                      ) : null}

                      {submission.buyer?.email ? (
                        <div style={styles.muted}>
                          Buyer: {submission.buyer.name || submission.buyer.email}
                        </div>
                      ) : null}

                      <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
                        <label style={styles.label}>Cash offer amount</label>
                        <input
                          value={submissionOfferAmounts[submission.id] || ""}
                          onChange={(event) =>
                            setSubmissionOfferAmounts((current) => ({
                              ...current,
                              [submission.id]: event.target.value,
                            }))
                          }
                          placeholder="250"
                          inputMode="decimal"
                          style={styles.input}
                        />

                        <label style={styles.label}>Offer message</label>
                        <input
                          value={submissionOfferMessages[submission.id] || ""}
                          onChange={(event) =>
                            setSubmissionOfferMessages((current) => ({
                              ...current,
                              [submission.id]: event.target.value,
                            }))
                          }
                          placeholder="We can offer $250 after inspection."
                          style={styles.input}
                        />
                      </div>

                      <div style={styles.actions}>
                        <button
                          type="button"
                          disabled={working}
                          onClick={() =>
                            void handleReviewBuyerSubmission(
                              submission.id,
                              "REVIEWING",
                              "Shop owner is reviewing this item request.",
                            )
                          }
                          style={styles.refreshButton}
                        >
                          Review
                        </button>

                        <button
                          type="button"
                          disabled={working}
                          onClick={() =>
                            void handleReviewBuyerSubmission(
                              submission.id,
                              "NEEDS_INFO",
                              "Please add more photos or item details.",
                            )
                          }
                          style={styles.linkButton}
                        >
                          Needs Info
                        </button>

                        <button
                          type="button"
                          disabled={working}
                          onClick={() => void handleCreateBuyerSubmissionOffer(submission.id)}
                          style={styles.linkButtonPrimary}
                        >
                          Send Cash Offer
                        </button>

                        <button
                          type="button"
                          disabled={working}
                          onClick={() =>
                            void handleReviewBuyerSubmission(
                              submission.id,
                              "REJECTED",
                              "Shop is not interested in this item.",
                            )
                          }
                          style={{
                            ...styles.refreshButton,
                            background: "#fee2e2",
                            color: "#991b1b",
                          }}
                        >
                          Reject
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>


          {planSummary ? (
            <section style={styles.section}>
              <h3 style={styles.sectionTitle}>Subscription Summary</h3>

              <div style={styles.grid}>
                <div style={styles.card}>
                  <div style={styles.kicker}>Plan</div>
                  <div style={styles.bigValue}>{planSummary.plan}</div>
                  {planSummary.storedPlan !== planSummary.plan ? (
                    <div style={styles.muted}>
                      Stored plan: {planSummary.storedPlan}
                    </div>
                  ) : null}
                </div>

                <div style={styles.card}>
                  <div style={styles.kicker}>Status</div>
                  <div style={{ ...styles.pill, ...getStatusTone(planSummary.status) }}>
                    {planSummary.status || "UNKNOWN"}
                  </div>
                  <div style={styles.muted}>
                    Current period end: {planSummary.currentPeriodEnd}
                  </div>
                  <div style={styles.muted}>
                    Cancel at period end: {planSummary.cancelAtPeriodEnd}
                  </div>
                </div>

                <div style={styles.card}>
                  <div style={styles.kicker}>Listings</div>
                  <div style={styles.bigValue}>{planSummary.listings}</div>
                  <div style={styles.muted}>Remaining: {planSummary.remaining}</div>
                  <div style={styles.muted}>
                    Max active listings: {planSummary.maxActiveListings}
                  </div>
                </div>

                <div style={styles.card}>
                  <div style={styles.kicker}>Feature Access</div>
                  <div style={styles.muted}>Auctions: {planSummary.canCreateAuctions}</div>
                  <div style={styles.muted}>
                    Featured listings: {planSummary.canFeatureListings}
                  </div>
                  <div style={styles.muted}>Analytics: {planSummary.analytics}</div>
                  <div style={styles.muted}>Locations: {planSummary.maxLocations}</div>
                  <div style={styles.muted}>Staff users: {planSummary.maxStaffUsers}</div>
                </div>

                <div style={styles.card}>
                  <div style={styles.kicker}>Billing</div>
                  <div style={styles.bigValue}>{planSummary.commission}</div>
                  <div style={styles.muted}>Monthly price: {planSummary.monthlyPrice}</div>
                  <div style={styles.muted}>Yearly price: {planSummary.yearlyPrice}</div>
                </div>
              </div>
            </section>
          ) : entitlementsLoading ? (
            <div style={styles.card}>Loading subscription summary...</div>
          ) : selectedShopId ? (
            <div style={styles.card}>
              Subscription details are not available for the selected shop.
            </div>
          ) : null}

          <section style={styles.section}>
            <h3 style={styles.sectionTitle}>My Shops</h3>
            {shops.length === 0 ? <p style={styles.empty}>No shops found.</p> : null}

            <div style={styles.list}>
              {shops.map((shop) => {
                const active = shop.id === selectedShopId;

                return (
                  <div
                    key={shop.id}
                    style={{
                      ...styles.listCard,
                      ...(active ? styles.activeListCard : {}),
                    }}
                  >
                    <div style={styles.listCardTop}>
                      <div>
                        <div style={styles.listTitle}>{shop.name}</div>
                        <div style={styles.muted}>{shop.address || "No address"}</div>
                      </div>

                      {active ? <div style={styles.activeBadge}>Selected</div> : null}
                    </div>

                    <div style={styles.smallMuted}>Shop ID: {shop.id}</div>
                  </div>
                );
              })}
            </div>
          </section>

          <section style={styles.section}>
            <h3 style={styles.sectionTitle}>
              My Items {selectedShop ? `• ${selectedShop.name}` : ""}
            </h3>

            {filteredItems.length === 0 ? (
              <p style={styles.empty}>No items found for this shop.</p>
            ) : null}

            <div style={styles.list}>
              {filteredItems.map((item) => (
                <div key={item.id} style={styles.listCard}>
                  <div style={styles.listTitle}>{item.title}</div>
                  <div style={styles.price}>{formatPrice(item.price)}</div>
                  <div style={styles.itemMetaRow}>
                    <span
                      style={{
                        ...styles.itemStatusPill,
                        ...getItemStatusTone(item.status),
                      }}
                    >
                      {item.status}
                    </span>
                    <span style={styles.smallMuted}>Shop: {item.pawnShopId}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    display: "grid",
    gap: 20,
    color: "var(--owner-dashboard-text)",
    background: "var(--owner-dashboard-page-bg)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    flexWrap: "wrap",
  },
  title: {
    margin: 0,
    fontSize: 30,
    fontWeight: 800,
  },
  subtitle: {
    marginTop: 8,
    color: "var(--owner-dashboard-muted)",
  },
  actions: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
    alignItems: "center",
  },
  linkButton: {
    textDecoration: "none",
    border: "1px solid var(--owner-dashboard-border)",
    color: "var(--owner-dashboard-text)",
    background: "var(--owner-dashboard-button-bg)",
    padding: "10px 14px",
    borderRadius: 12,
    fontWeight: 700,
  },
  linkButtonPrimary: {
    textDecoration: "none",
    border: "none",
    color: "var(--owner-dashboard-primary-text)",
    background: "var(--owner-dashboard-primary-bg)",
    padding: "10px 14px",
    borderRadius: 12,
    fontWeight: 800,
  },
  refreshButton: {
    border: "1px solid var(--owner-dashboard-border)",
    color: "var(--owner-dashboard-text)",
    background: "var(--owner-dashboard-card-bg)",
    padding: "10px 14px",
    borderRadius: 12,
    fontWeight: 700,
    cursor: "pointer",
  },
  disabledButton: {
    opacity: 0.65,
    cursor: "not-allowed",
  },
  toolbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    flexWrap: "wrap",
  },
  toolbarStats: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  statBadge: {
    borderRadius: 999,
    padding: "8px 12px",
    background: "var(--owner-dashboard-chip-bg)",
    color: "var(--owner-dashboard-chip-text)",
    border: "1px solid var(--owner-dashboard-accent-border)",
    fontSize: 13,
    fontWeight: 700,
  },
  label: {
    display: "block",
    marginBottom: 8,
    color: "var(--owner-dashboard-muted)",
    fontSize: 14,
    fontWeight: 600,
  },
  select: {
    minWidth: 280,
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid var(--owner-dashboard-border)",
    background: "var(--owner-dashboard-card-bg)",
    color: "var(--owner-dashboard-text)",
  },
  section: {
    display: "grid",
    gap: 12,
  },
  sectionTitle: {
    margin: 0,
    fontSize: 20,
    fontWeight: 800,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
  },
  card: {
    border: "1px solid var(--owner-dashboard-soft-border)",
    borderRadius: 16,
    padding: 16,
    background: "var(--owner-dashboard-card-bg)",
    boxShadow: "var(--owner-dashboard-shadow)",
  },
  kicker: {
    fontSize: 12,
    color: "var(--owner-dashboard-accent)",
    textTransform: "uppercase",
    fontWeight: 800,
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  bigValue: {
    fontWeight: 800,
    fontSize: 24,
  },
  muted: {
    color: "var(--owner-dashboard-muted)",
    marginTop: 6,
  },
  smallMuted: {
    color: "var(--owner-dashboard-subtle)",
    marginTop: 8,
    fontSize: 12,
  },
  pill: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    padding: "6px 10px",
    fontWeight: 800,
    fontSize: 12,
  },
  itemMetaRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 10,
    flexWrap: "wrap",
  },
  itemStatusPill: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    padding: "6px 10px",
    fontWeight: 800,
    fontSize: 12,
  },
  error: {
    padding: 12,
    borderRadius: 12,
    background: "rgba(255, 128, 143, 0.12)",
    color: "#ffb2bc",
    border: "1px solid rgba(255, 128, 143, 0.24)",
  },
  success: {
    padding: 12,
    borderRadius: 12,
    background: "rgba(46, 204, 113, 0.12)",
    color: "#b4f6cf",
    border: "1px solid rgba(46, 204, 113, 0.24)",
  },
  list: {
    display: "grid",
    gap: 10,
  },
  listCard: {
    border: "1px solid var(--owner-dashboard-soft-border)",
    borderRadius: 14,
    padding: 14,
    background: "var(--owner-dashboard-card-bg)",
    boxShadow: "var(--owner-dashboard-shadow)",
  },
  activeListCard: {
    border: "1px solid var(--owner-dashboard-active-border)",
    boxShadow: "0 0 0 1px rgba(110,168,254,0.18) inset",
  },
  listCardTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  listTitle: {
    fontWeight: 800,
    fontSize: 16,
  },
  activeBadge: {
    background: "var(--owner-dashboard-active-bg)",
    color: "var(--owner-dashboard-accent)",
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
    border: "1px solid rgba(110,168,254,0.28)",
  },
  price: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: 800,
  },
  empty: {
    margin: 0,
    color: "var(--owner-dashboard-muted)",
  },
};
