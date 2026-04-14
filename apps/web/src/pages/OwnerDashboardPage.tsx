// File: apps/web/src/pages/OwnerDashboardPage.tsx

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import { API_BASE } from "../config";
import { getAuthHeaders, getAuthToken } from "../services/auth";

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

function apiUrl(path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${normalized}`;
}

function requireAuthToken() {
  const token = getAuthToken();
  if (!token) {
    throw new Error("Missing owner token. Please log in again.");
  }
  return token;
}

async function safeJson<T = unknown>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function extractApiError(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";

  const candidate = payload as Record<string, unknown>;
  const nested =
    candidate.data && typeof candidate.data === "object"
      ? (candidate.data as Record<string, unknown>)
      : null;

  return String(
    candidate.error ||
      candidate.message ||
      nested?.error ||
      nested?.message ||
      ""
  );
}

function unwrapData<T = unknown>(payload: unknown): T | null {
  if (payload == null) return null;
  if (Array.isArray(payload)) return payload as T;
  if (typeof payload !== "object") return payload as T;

  const maybe = payload as ApiEnvelope<T>;
  if (maybe.data !== undefined) return maybe.data as T;

  return payload as T;
}

function normalizeShops(payload: unknown): Shop[] {
  const unwrapped = unwrapData(payload);

  if (Array.isArray(unwrapped)) {
    return unwrapped
      .filter(
        (value): value is Record<string, unknown> =>
          Boolean(value) && typeof value === "object"
      )
      .map((shop) => ({
        id: String(shop.id || ""),
        name: String(shop.name || "Unnamed Shop"),
        address: shop.address == null ? null : String(shop.address),
      }))
      .filter((shop) => Boolean(shop.id));
  }

  if (
    unwrapped &&
    typeof unwrapped === "object" &&
    Array.isArray((unwrapped as { shops?: unknown }).shops)
  ) {
    return normalizeShops((unwrapped as { shops: unknown[] }).shops);
  }

  return [];
}

function normalizeItems(payload: unknown): Item[] {
  const unwrapped = unwrapData(payload);

  if (Array.isArray(unwrapped)) {
    return unwrapped
      .filter(
        (value): value is Record<string, unknown> =>
          Boolean(value) && typeof value === "object"
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

  if (
    unwrapped &&
    typeof unwrapped === "object" &&
    Array.isArray((unwrapped as { items?: unknown }).items)
  ) {
    return normalizeItems((unwrapped as { items: unknown[] }).items);
  }

  return [];
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
  const navigate = useNavigate();
  const [shops, setShops] = useState<Shop[]>([]);
  const [items, setItems] = useState<Item[]>([]);
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

        const res = await fetch(apiUrl(`/shops/${shopId}/entitlements`), {
          headers: getAuthHeaders(),
          credentials: "same-origin",
          signal,
        });

        const json = await safeJson(res);

        if (!res.ok) {
          throw new Error(
            extractApiError(json) || `Failed to load entitlements (${res.status})`
          );
        }

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

        const [shopsRes, itemsRes] = await Promise.all([
          fetch(apiUrl("/shops/mine"), {
            headers: getAuthHeaders(),
            credentials: "same-origin",
            signal,
          }),
          fetch(apiUrl("/items/mine"), {
            headers: getAuthHeaders(),
            credentials: "same-origin",
            signal,
          }),
        ]);

        const [shopsJson, itemsJson] = await Promise.all([
          safeJson(shopsRes),
          safeJson(itemsRes),
        ]);

        if (!shopsRes.ok) {
          throw new Error(
            extractApiError(shopsJson) || `Failed to load shops (${shopsRes.status})`
          );
        }

        if (!itemsRes.ok) {
          throw new Error(
            extractApiError(itemsJson) || `Failed to load items (${itemsRes.status})`
          );
        }

        const nextShops = normalizeShops(shopsJson);
        const nextItems = normalizeItems(itemsJson);

        setShops(nextShops);
        setItems(nextItems);

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
        `Checkout completed${plan ? ` for ${plan}` : ""}. Dashboard refreshed.`
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

  useEffect(() => {
    if (pageLoading) return;
    if (shops.length === 0) {
      navigate("/owner/shops/new", { replace: true });
    }
  }, [pageLoading, shops.length, navigate]);

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

  return (
    <div style={styles.page}>
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
    color: "#eef2ff",
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
    color: "#a7b0d8",
  },
  actions: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
    alignItems: "center",
  },
  linkButton: {
    textDecoration: "none",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "#eef2ff",
    background: "#1a2345",
    padding: "10px 14px",
    borderRadius: 12,
    fontWeight: 700,
  },
  linkButtonPrimary: {
    textDecoration: "none",
    border: "none",
    color: "#08111f",
    background: "#6ea8fe",
    padding: "10px 14px",
    borderRadius: 12,
    fontWeight: 800,
  },
  refreshButton: {
    border: "1px solid rgba(255,255,255,0.12)",
    color: "#eef2ff",
    background: "#121935",
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
    background: "rgba(110,168,254,0.12)",
    color: "#cfe0ff",
    border: "1px solid rgba(110,168,254,0.2)",
    fontSize: 13,
    fontWeight: 700,
  },
  label: {
    display: "block",
    marginBottom: 8,
    color: "#a7b0d8",
    fontSize: 14,
    fontWeight: 600,
  },
  select: {
    minWidth: 280,
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "#121935",
    color: "#eef2ff",
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
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 16,
    padding: 16,
    background: "#121935",
  },
  kicker: {
    fontSize: 12,
    color: "#6ea8fe",
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
    color: "#a7b0d8",
    marginTop: 6,
  },
  smallMuted: {
    color: "#8d97c5",
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
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 14,
    padding: 14,
    background: "#121935",
  },
  activeListCard: {
    border: "1px solid rgba(110,168,254,0.42)",
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
    background: "rgba(110,168,254,0.14)",
    color: "#6ea8fe",
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
    color: "#a7b0d8",
  },
};