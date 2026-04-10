// File: apps/web/src/pages/OwnerSubscriptionPage.tsx

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { API_BASE } from "../config";
import { getAuthHeaders, getAuthToken } from "../services/auth";

type SellerPlan = {
  code: "FREE" | "PRO" | "PREMIUM" | "ULTRA" | string;
  label: string;
  monthlyPriceCents: number;
  yearlyPriceCents: number;
  maxActiveListings: number | null;
  maxLocations: number | null;
  maxStaffUsers: number | null;
  canCreateAuctions: boolean;
  canFeatureListings: boolean;
  analyticsLevel: string;
  commissionBps: number;
  features: string[];
};

type Entitlements = {
  shopId: string;
  shopName: string;
  ownerId: string;
  subscription: {
    storedPlan: string;
    effectivePlan: string;
    status: string;
    isUsable?: boolean;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
  };
  limits: {
    maxActiveListings: number | null;
    maxLocations: number | null;
    maxStaffUsers: number | null;
  };
  features: {
    canCreateAuctions: boolean;
    canFeatureListings: boolean;
    analyticsLevel: string;
  };
  billing: {
    commissionBps: number;
    commissionPercent: number;
    monthlyPriceCents: number;
    yearlyPriceCents: number;
  };
  usage: {
    activeListingCount: number;
    remainingActiveListings: number | null;
    isUnlimitedListings: boolean;
    countedStatuses?: string[];
  };
};

type Shop = {
  id: string;
  name: string;
};

type CheckoutSessionResponse = {
  url?: string;
  sessionId?: string;
  customerId?: string;
  planCode?: string;
  error?: string;
};

type ApiEnvelope<T> = {
  success?: boolean;
  message?: string;
  error?: string;
  data?: T;
  entitlements?: T;
  plans?: T;
  shops?: T;
};

const PAID_PLAN_CODES = new Set(["PRO", "PREMIUM", "ULTRA"]);

function apiUrl(path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${normalized}`;
}

function formatMoney(cents: number) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

function formatPercent(value: number) {
  return `${Number(value || 0).toFixed(2)}%`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString();
}

function formatLimit(value: number | null | undefined) {
  if (value === null) return "Unlimited";
  if (value === undefined) return "—";
  return String(value);
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function getBaseReturnUrl() {
  if (typeof window === "undefined") {
    return "http://127.0.0.1:5176/owner/subscription";
  }

  return `${window.location.origin}/owner/subscription`;
}

function buildCheckoutReturnUrl(
  result: "success" | "cancelled",
  shopId: string,
  planCode: string
) {
  const url = new URL(getBaseReturnUrl());
  url.searchParams.set("checkout", result);
  url.searchParams.set("shopId", shopId);
  url.searchParams.set("plan", planCode);
  return url.toString();
}

function isPaidPlanCode(planCode: string) {
  return PAID_PLAN_CODES.has(String(planCode || "").trim().toUpperCase());
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

  const direct =
    candidate.error ||
    candidate.message ||
    (candidate.data &&
    typeof candidate.data === "object" &&
    !Array.isArray(candidate.data)
      ? (candidate.data as Record<string, unknown>).error ||
        (candidate.data as Record<string, unknown>).message
      : "");

  return typeof direct === "string" ? direct : "";
}

function requireAuthToken() {
  const token = getAuthToken();
  if (!token) {
    throw new Error("Missing owner token. Please log in again.");
  }
  return token;
}

function unwrapData<T = unknown>(payload: unknown): T | null {
  if (payload == null) return null;

  if (Array.isArray(payload)) {
    return payload as T;
  }

  if (typeof payload !== "object") {
    return payload as T;
  }

  const maybe = payload as ApiEnvelope<T> & Record<string, unknown>;

  if ("data" in maybe && maybe.data !== undefined) {
    return maybe.data as T;
  }

  return payload as T;
}

function toSellerPlan(value: unknown): SellerPlan | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;

  const code = String(v.code || "").trim();
  if (!code) return null;

  return {
    code,
    label: String(v.label || code),
    monthlyPriceCents: Number(v.monthlyPriceCents || 0),
    yearlyPriceCents: Number(v.yearlyPriceCents || 0),
    maxActiveListings:
      v.maxActiveListings === null || v.maxActiveListings === undefined
        ? null
        : Number(v.maxActiveListings),
    maxLocations:
      v.maxLocations === null || v.maxLocations === undefined
        ? null
        : Number(v.maxLocations),
    maxStaffUsers:
      v.maxStaffUsers === null || v.maxStaffUsers === undefined
        ? null
        : Number(v.maxStaffUsers),
    canCreateAuctions: Boolean(v.canCreateAuctions),
    canFeatureListings: Boolean(v.canFeatureListings),
    analyticsLevel: String(v.analyticsLevel || "none"),
    commissionBps: Number(v.commissionBps || 0),
    features: Array.isArray(v.features)
      ? v.features.map((item) => String(item))
      : [],
  };
}

function normalizePlans(payload: unknown): SellerPlan[] {
  const unwrapped = unwrapData(payload);

  if (Array.isArray(unwrapped)) {
    return unwrapped.map(toSellerPlan).filter(Boolean) as SellerPlan[];
  }

  if (unwrapped && typeof unwrapped === "object") {
    const maybe = unwrapped as Record<string, unknown>;

    if (Array.isArray(maybe.plans)) {
      return maybe.plans.map(toSellerPlan).filter(Boolean) as SellerPlan[];
    }
  }

  return [];
}

function toShop(value: unknown): Shop | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;

  const id = String(v.id || "").trim();
  if (!id) return null;

  return {
    id,
    name: String(v.name || "Unnamed Shop"),
  };
}

function normalizeShops(payload: unknown): Shop[] {
  const unwrapped = unwrapData(payload);

  if (Array.isArray(unwrapped)) {
    return unwrapped.map(toShop).filter(Boolean) as Shop[];
  }

  if (unwrapped && typeof unwrapped === "object") {
    const maybe = unwrapped as Record<string, unknown>;

    if (Array.isArray(maybe.shops)) {
      return maybe.shops.map(toShop).filter(Boolean) as Shop[];
    }
  }

  return [];
}

function normalizeEntitlements(payload: unknown): Entitlements | null {
  if (!payload) return null;

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
    return unwrapped as Entitlements;
  }

  return null;
}

function sortPlans(plans: SellerPlan[]) {
  return [...plans].sort((a, b) => {
    const aMonthly = Number(a.monthlyPriceCents || 0);
    const bMonthly = Number(b.monthlyPriceCents || 0);
    return aMonthly - bMonthly;
  });
}

function resolveCurrentPlan(plans: SellerPlan[], effectivePlanCode: string) {
  return plans.find((plan) => plan.code === effectivePlanCode) || null;
}

function getPlanButtonLabel(
  plan: SellerPlan,
  currentPlanCode: string,
  switchingPlan: string
) {
  if (switchingPlan === plan.code) return "Switching...";
  if (plan.code === currentPlanCode) return "Current Plan";
  return isPaidPlanCode(plan.code)
    ? `Upgrade to ${plan.label}`
    : `Switch to ${plan.label}`;
}

function getStatusTone(status: string): CSSProperties {
  const normalized = String(status || "").toUpperCase();

  if (["ACTIVE", "TRIALING"].includes(normalized)) return styles.statusGood;
  if (["PAST_DUE", "INCOMPLETE", "UNPAID"].includes(normalized)) {
    return styles.statusWarn;
  }
  if (["CANCELED", "CANCELLED", "EXPIRED", "INACTIVE"].includes(normalized)) {
    return styles.statusBad;
  }

  return styles.statusNeutral;
}

export default function OwnerSubscriptionPage() {
  const [plans, setPlans] = useState<SellerPlan[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [selectedShopId, setSelectedShopId] = useState("");
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);

  const [pageLoading, setPageLoading] = useState(true);
  const [entitlementsLoading, setEntitlementsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [switchingPlan, setSwitchingPlan] = useState("");

  const [pageError, setPageError] = useState("");
  const [entitlementsError, setEntitlementsError] = useState("");
  const [checkoutMessage, setCheckoutMessage] = useState("");

  const hasShops = shops.length > 0;

  const selectedShop = useMemo(
    () => shops.find((shop) => shop.id === selectedShopId) || null,
    [shops, selectedShopId]
  );

  const currentPlanCode = entitlements?.subscription?.effectivePlan ?? "";
  const currentPlan = useMemo(
    () => resolveCurrentPlan(plans, currentPlanCode),
    [plans, currentPlanCode]
  );

  const currentPlanLabel =
    currentPlan?.label ||
    currentPlanCode ||
    entitlements?.subscription?.storedPlan ||
    "Unavailable";

  const loadEntitlements = useCallback(
    async (shopId: string, opts?: { silent?: boolean; signal?: AbortSignal }) => {
      if (!shopId) {
        setEntitlements(null);
        setEntitlementsError("");
        return null;
      }

      if (opts?.silent) {
        setRefreshing(true);
      } else {
        setEntitlementsLoading(true);
        setEntitlementsError("");
        setEntitlements(null);
      }

      try {
        requireAuthToken();

        const res = await fetch(apiUrl(`/shops/${shopId}/entitlements`), {
          headers: getAuthHeaders(),
          credentials: "same-origin",
          signal: opts?.signal,
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
        setEntitlementsError("");
        return nextEntitlements;
      } catch (err: unknown) {
        if ((err as Error)?.name === "AbortError") {
          return null;
        }

        setEntitlements(null);
        setEntitlementsError(getErrorMessage(err, "Failed to load entitlements"));
        return null;
      } finally {
        setEntitlementsLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    const controller = new AbortController();

    async function boot() {
      setPageLoading(true);
      setPageError("");
      setEntitlements(null);
      setEntitlementsError("");

      try {
        requireAuthToken();

        const [plansRes, shopsRes] = await Promise.all([
          fetch(apiUrl("/seller-plans"), {
            headers: getAuthHeaders(),
            credentials: "same-origin",
            signal: controller.signal,
          }),
          fetch(apiUrl("/shops/mine"), {
            headers: getAuthHeaders(),
            credentials: "same-origin",
            signal: controller.signal,
          }),
        ]);

        const [plansJson, shopsJson] = await Promise.all([
          safeJson(plansRes),
          safeJson(shopsRes),
        ]);

        if (!plansRes.ok) {
          throw new Error(
            extractApiError(plansJson) || `Failed to load plans (${plansRes.status})`
          );
        }

        if (!shopsRes.ok) {
          throw new Error(
            extractApiError(shopsJson) || `Failed to load owner shops (${shopsRes.status})`
          );
        }

        const nextPlans = sortPlans(normalizePlans(plansJson));
        const nextShops = normalizeShops(shopsJson);

        setPlans(nextPlans);
        setShops(nextShops);

        if (nextShops.length === 0) {
          setSelectedShopId("");
          setPageError("No shops found for this owner account.");
          return;
        }

        const search =
          typeof window !== "undefined"
            ? new URLSearchParams(window.location.search)
            : null;
        const queryShopId = search?.get("shopId") || "";
        const selectedFromQuery =
          queryShopId && nextShops.some((shop) => shop.id === queryShopId)
            ? queryShopId
            : "";

        setSelectedShopId((prev) => {
          if (selectedFromQuery) return selectedFromQuery;
          if (prev && nextShops.some((shop) => shop.id === prev)) return prev;
          return nextShops[0].id;
        });
      } catch (err: unknown) {
        if ((err as Error)?.name === "AbortError") return;

        setPageError(getErrorMessage(err, "Failed to load subscription data"));
        setPlans([]);
        setShops([]);
        setSelectedShopId("");
      } finally {
        setPageLoading(false);
      }
    }

    boot();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    if (!selectedShopId) {
      setEntitlements(null);
      setEntitlementsError("");
      return () => controller.abort();
    }

    loadEntitlements(selectedShopId, { signal: controller.signal });

    return () => controller.abort();
  }, [selectedShopId, loadEntitlements]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const url = new URL(window.location.href);
    const checkout = url.searchParams.get("checkout");
    const plan = url.searchParams.get("plan");

    if (checkout === "success") {
      setCheckoutMessage(
        `Checkout completed${plan ? ` for ${plan}` : ""}. Refreshing subscription details.`
      );
    } else if (checkout === "cancelled") {
      setCheckoutMessage("Checkout was cancelled. No billing changes were made.");
    } else {
      return;
    }

    url.searchParams.delete("checkout");
    url.searchParams.delete("plan");
    url.searchParams.delete("shopId");
    window.history.replaceState({}, "", url.toString());

    const queryShopId =
      new URLSearchParams(window.location.search).get("shopId") || selectedShopId;

    if (queryShopId) {
      void loadEntitlements(queryShopId, { silent: true });
    }
  }, [loadEntitlements, selectedShopId]);

  async function switchPlan(planCode: string) {
    if (!selectedShopId || !entitlements) return;

    const normalizedPlanCode = String(planCode || "").trim().toUpperCase();
    setSwitchingPlan(normalizedPlanCode);
    setPageError("");
    setEntitlementsError("");
    setCheckoutMessage("");

    try {
      requireAuthToken();

      if (isPaidPlanCode(normalizedPlanCode)) {
        const successUrl = buildCheckoutReturnUrl(
          "success",
          selectedShopId,
          normalizedPlanCode
        );
        const cancelUrl = buildCheckoutReturnUrl(
          "cancelled",
          selectedShopId,
          normalizedPlanCode
        );

        const res = await fetch(apiUrl("/stripe/checkout/subscription"), {
          method: "POST",
          headers: getAuthHeaders(true),
          credentials: "same-origin",
          body: JSON.stringify({
            shopId: selectedShopId,
            planCode: normalizedPlanCode,
            successUrl,
            cancelUrl,
          }),
        });

        const json = (await safeJson<CheckoutSessionResponse>(res)) || {};

        if (!res.ok) {
          throw new Error(
            extractApiError(json) || `Failed to start checkout (${res.status})`
          );
        }

        if (!json.url) {
          throw new Error("Stripe checkout session did not return a redirect URL.");
        }

        if (typeof window !== "undefined") {
          window.location.assign(json.url);
          return;
        }

        return;
      }

      const res = await fetch(apiUrl(`/shops/${selectedShopId}/subscription`), {
        method: "PATCH",
        headers: getAuthHeaders(true),
        credentials: "same-origin",
        body: JSON.stringify({
          plan: normalizedPlanCode,
          status: "ACTIVE",
          cancelAtPeriodEnd: false,
        }),
      });

      const json = await safeJson(res);

      if (!res.ok) {
        throw new Error(
          extractApiError(json) || `Failed to switch plan (${res.status})`
        );
      }

      const nextEntitlements = normalizeEntitlements(json);

      if (nextEntitlements) {
        setEntitlements(nextEntitlements);
      } else {
        await loadEntitlements(selectedShopId, { silent: true });
      }

      setCheckoutMessage(`Plan updated to ${normalizedPlanCode}.`);
    } catch (err: unknown) {
      setEntitlementsError(getErrorMessage(err, "Failed to switch plan"));
    } finally {
      setSwitchingPlan("");
    }
  }

  async function refreshCurrentShop() {
    if (!selectedShopId) return;
    await loadEntitlements(selectedShopId, { silent: true });
  }

  const usagePct = useMemo(() => {
    if (!entitlements) return null;
    if (entitlements.limits.maxActiveListings === null) return null;
    const max = Number(entitlements.limits.maxActiveListings || 0);
    if (max <= 0) return null;
    const pct = Math.min(
      100,
      Math.max(0, (Number(entitlements.usage.activeListingCount || 0) / max) * 100)
    );
    return pct;
  }, [entitlements]);

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.headerRow}>
          <div>
            <h1 style={styles.title}>Owner Subscription</h1>
            <p style={styles.subtitle}>
              View your seller plan, billing impact, usage, limits, and upgrade options.
            </p>
          </div>

          <div style={styles.headerControls}>
            <div>
              <label style={styles.label}>Shop</label>
              <select
                value={selectedShopId}
                onChange={(e) => setSelectedShopId(e.target.value)}
                style={styles.select}
                disabled={pageLoading || !hasShops}
              >
                {!hasShops ? (
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

            <button
              type="button"
              onClick={refreshCurrentShop}
              disabled={!selectedShopId || entitlementsLoading || refreshing || pageLoading}
              style={{
                ...styles.button,
                ...styles.secondaryButton,
                ...styles.refreshButton,
                ...((!selectedShopId || entitlementsLoading || refreshing || pageLoading)
                  ? styles.disabledButton
                  : {}),
              }}
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        {checkoutMessage ? <div style={styles.success}>{checkoutMessage}</div> : null}
        {pageError ? <div style={styles.error}>{pageError}</div> : null}
        {entitlementsError ? <div style={styles.error}>{entitlementsError}</div> : null}

        {pageLoading ? (
          <div style={styles.card}>Loading subscription data...</div>
        ) : !hasShops ? (
          <div style={styles.card}>
            This owner account does not have any shops yet. Create a shop first, then return
            to subscription management.
          </div>
        ) : entitlementsLoading && !entitlements ? (
          <div style={styles.card}>Loading shop entitlements...</div>
        ) : !entitlements ? (
          <div style={styles.card}>
            Unable to load subscription details for the selected shop.
          </div>
        ) : (
          <>
            <div style={styles.summaryGrid}>
              <div style={styles.card}>
                <div style={styles.sectionLabel}>Current Plan</div>
                <div style={styles.planName}>{currentPlanLabel}</div>

                <div
                  style={{
                    ...styles.statusPill,
                    ...getStatusTone(entitlements.subscription.status),
                  }}
                >
                  {entitlements.subscription.status || "UNKNOWN"}
                </div>

                <div style={styles.muted}>
                  Shop: {entitlements.shopName || selectedShop?.name || "—"}
                </div>
                <div style={styles.muted}>
                  Effective plan: {entitlements.subscription.effectivePlan || "—"}
                </div>
                <div style={styles.muted}>
                  Stored plan: {entitlements.subscription.storedPlan || "—"}
                </div>

                {entitlements.subscription.storedPlan !==
                entitlements.subscription.effectivePlan ? (
                  <div style={styles.warningText}>
                    Stored plan is {entitlements.subscription.storedPlan}, but the effective plan
                    is {entitlements.subscription.effectivePlan}. This usually means the current
                    subscription status is not usable.
                  </div>
                ) : null}
              </div>

              <div style={styles.card}>
                <div style={styles.sectionLabel}>Billing</div>
                <div style={styles.metric}>
                  {formatMoney(entitlements.billing.monthlyPriceCents)}/month
                </div>
                <div style={styles.muted}>
                  {formatMoney(entitlements.billing.yearlyPriceCents)}/year
                </div>
                <div style={styles.muted}>
                  Commission: {formatPercent(entitlements.billing.commissionPercent)}
                </div>
                <div style={styles.muted}>
                  Cancel at period end:{" "}
                  {entitlements.subscription.cancelAtPeriodEnd ? "Yes" : "No"}
                </div>
                <div style={styles.muted}>
                  Current period end: {formatDate(entitlements.subscription.currentPeriodEnd)}
                </div>
              </div>

              <div style={styles.card}>
                <div style={styles.sectionLabel}>Usage</div>
                <div style={styles.metric}>
                  Active listings: {entitlements.usage.activeListingCount}
                </div>
                <div style={styles.muted}>
                  Remaining:{" "}
                  {entitlements.usage.isUnlimitedListings
                    ? "Unlimited"
                    : entitlements.usage.remainingActiveListings}
                </div>
                <div style={styles.muted}>
                  Listing cap: {formatLimit(entitlements.limits.maxActiveListings)}
                </div>
                {usagePct !== null ? (
                  <div style={styles.progressWrap}>
                    <div style={styles.progressTrack}>
                      <div style={{ ...styles.progressFill, width: `${usagePct}%` }} />
                    </div>
                    <div style={styles.progressLabel}>{usagePct.toFixed(0)}% used</div>
                  </div>
                ) : null}
                {entitlements.usage.countedStatuses?.length ? (
                  <div style={styles.muted}>
                    Counted statuses: {entitlements.usage.countedStatuses.join(", ")}
                  </div>
                ) : null}
              </div>

              <div style={styles.card}>
                <div style={styles.sectionLabel}>Feature Access</div>
                <div style={styles.muted}>
                  Auctions:{" "}
                  {entitlements.features.canCreateAuctions ? "Enabled" : "Disabled"}
                </div>
                <div style={styles.muted}>
                  Featured listings:{" "}
                  {entitlements.features.canFeatureListings ? "Enabled" : "Disabled"}
                </div>
                <div style={styles.muted}>
                  Analytics: {entitlements.features.analyticsLevel || "none"}
                </div>
                <div style={styles.muted}>
                  Locations: {formatLimit(entitlements.limits.maxLocations)}
                </div>
                <div style={styles.muted}>
                  Staff users: {formatLimit(entitlements.limits.maxStaffUsers)}
                </div>
              </div>
            </div>

            <div style={styles.planGrid}>
              {plans.map((plan) => {
                const active = plan.code === currentPlanCode;
                const disabled =
                  !selectedShopId || active || Boolean(switchingPlan) || entitlementsLoading;

                return (
                  <div
                    key={plan.code}
                    style={{
                      ...styles.planCard,
                      ...(active ? styles.activePlanCard : {}),
                    }}
                  >
                    <div style={styles.planHeader}>
                      <div>
                        <div style={styles.planTitle}>{plan.label}</div>
                        <div style={styles.planPrice}>
                          {plan.monthlyPriceCents === 0
                            ? "Free"
                            : `${formatMoney(plan.monthlyPriceCents)}/month`}
                        </div>
                        <div style={styles.planSubPrice}>
                          {plan.yearlyPriceCents === 0
                            ? "No yearly billing"
                            : `${formatMoney(plan.yearlyPriceCents)}/year`}
                        </div>
                      </div>

                      {active ? <div style={styles.activeBadge}>Current</div> : null}
                    </div>

                    <div style={styles.planMeta}>
                      Listings: {formatLimit(plan.maxActiveListings)}
                    </div>
                    <div style={styles.planMeta}>
                      Locations: {formatLimit(plan.maxLocations)}
                    </div>
                    <div style={styles.planMeta}>
                      Staff users: {formatLimit(plan.maxStaffUsers)}
                    </div>
                    <div style={styles.planMeta}>
                      Auctions: {plan.canCreateAuctions ? "Yes" : "No"}
                    </div>
                    <div style={styles.planMeta}>
                      Featured listings: {plan.canFeatureListings ? "Yes" : "No"}
                    </div>
                    <div style={styles.planMeta}>
                      Commission: {formatPercent(plan.commissionBps / 100)}
                    </div>
                    <div style={styles.planMeta}>Analytics: {plan.analyticsLevel}</div>

                    <ul style={styles.featureList}>
                      {plan.features.length > 0 ? (
                        plan.features.map((feature) => <li key={feature}>{feature}</li>)
                      ) : (
                        <li>Standard seller access</li>
                      )}
                    </ul>

                    <button
                      type="button"
                      onClick={() => switchPlan(plan.code)}
                      disabled={disabled}
                      style={{
                        ...styles.button,
                        ...(active ? styles.secondaryButton : styles.primaryButton),
                        ...(disabled ? styles.disabledButton : {}),
                      }}
                    >
                      {getPlanButtonLabel(plan, currentPlanCode, switchingPlan)}
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    background:
      "linear-gradient(180deg, #0b1020 0%, #0f1530 52%, #0b1020 100%)",
    color: "#eef2ff",
    padding: 24,
  },
  container: {
    maxWidth: 1240,
    margin: "0 auto",
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    marginBottom: 20,
    flexWrap: "wrap",
  },
  headerControls: {
    display: "flex",
    alignItems: "flex-end",
    gap: 12,
    flexWrap: "wrap",
  },
  title: {
    margin: 0,
    fontSize: 32,
    fontWeight: 800,
    letterSpacing: -0.6,
  },
  subtitle: {
    marginTop: 8,
    color: "#a7b0d8",
    maxWidth: 700,
  },
  label: {
    display: "block",
    marginBottom: 8,
    color: "#a7b0d8",
    fontSize: 14,
    fontWeight: 600,
  },
  select: {
    minWidth: 260,
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "#121935",
    color: "#eef2ff",
    outline: "none",
  },
  error: {
    padding: 12,
    marginBottom: 16,
    borderRadius: 12,
    background: "rgba(255, 128, 143, 0.12)",
    color: "#ffb2bc",
    border: "1px solid rgba(255, 128, 143, 0.24)",
  },
  success: {
    padding: 12,
    marginBottom: 16,
    borderRadius: 12,
    background: "rgba(46, 204, 113, 0.12)",
    color: "#b4f6cf",
    border: "1px solid rgba(46, 204, 113, 0.24)",
  },
  warningText: {
    marginTop: 10,
    color: "#ffd98a",
    fontSize: 13,
    lineHeight: 1.5,
  },
  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 16,
    marginBottom: 20,
  },
  card: {
    background: "rgba(18, 25, 53, 0.94)",
    borderRadius: 18,
    padding: 18,
    border: "1px solid rgba(255,255,255,0.10)",
    boxShadow: "0 8px 30px rgba(0,0,0,0.16)",
  },
  sectionLabel: {
    color: "#6ea8fe",
    fontSize: 12,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  planName: {
    fontSize: 24,
    fontWeight: 800,
    marginBottom: 8,
  },
  metric: {
    fontSize: 18,
    fontWeight: 800,
    marginBottom: 6,
  },
  muted: {
    color: "#a7b0d8",
    marginTop: 6,
    lineHeight: 1.5,
  },
  statusPill: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    padding: "6px 10px",
    fontSize: 12,
    fontWeight: 800,
    marginBottom: 8,
    border: "1px solid transparent",
  },
  statusGood: {
    color: "#7ef0b3",
    background: "rgba(46, 204, 113, 0.12)",
    borderColor: "rgba(46, 204, 113, 0.24)",
  },
  statusWarn: {
    color: "#ffd98a",
    background: "rgba(255, 193, 7, 0.12)",
    borderColor: "rgba(255, 193, 7, 0.24)",
  },
  statusBad: {
    color: "#ff9ead",
    background: "rgba(255, 128, 143, 0.12)",
    borderColor: "rgba(255, 128, 143, 0.24)",
  },
  statusNeutral: {
    color: "#c7d2fe",
    background: "rgba(199, 210, 254, 0.10)",
    borderColor: "rgba(199, 210, 254, 0.18)",
  },
  progressWrap: {
    marginTop: 10,
  },
  progressTrack: {
    width: "100%",
    height: 10,
    borderRadius: 999,
    background: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    background: "linear-gradient(90deg, #6ea8fe 0%, #8f7cff 100%)",
  },
  progressLabel: {
    marginTop: 6,
    fontSize: 12,
    color: "#a7b0d8",
  },
  planGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))",
    gap: 16,
  },
  planCard: {
    background: "rgba(18, 25, 53, 0.94)",
    borderRadius: 18,
    padding: 18,
    border: "1px solid rgba(255,255,255,0.10)",
    boxShadow: "0 8px 30px rgba(0,0,0,0.16)",
  },
  activePlanCard: {
    border: "1px solid rgba(110,168,254,0.42)",
    boxShadow:
      "0 0 0 1px rgba(110,168,254,0.18) inset, 0 10px 30px rgba(18,25,53,0.24)",
  },
  planHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 12,
  },
  planTitle: {
    fontSize: 22,
    fontWeight: 800,
  },
  planPrice: {
    color: "#6ea8fe",
    fontWeight: 800,
    marginTop: 6,
  },
  planSubPrice: {
    color: "#8ea7e6",
    fontSize: 13,
    marginTop: 4,
  },
  activeBadge: {
    background: "rgba(110,168,254,0.14)",
    color: "#6ea8fe",
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
    border: "1px solid rgba(110,168,254,0.28)",
    whiteSpace: "nowrap",
  },
  planMeta: {
    color: "#c7d2fe",
    marginBottom: 6,
    lineHeight: 1.5,
  },
  featureList: {
    color: "#a7b0d8",
    paddingLeft: 18,
    lineHeight: 1.75,
    minHeight: 132,
    marginTop: 14,
    marginBottom: 16,
  },
  button: {
    width: "100%",
    borderRadius: 12,
    padding: "12px 14px",
    fontWeight: 800,
    cursor: "pointer",
    transition: "opacity 0.2s ease, transform 0.2s ease",
  },
  primaryButton: {
    background: "#6ea8fe",
    color: "#08111f",
    border: "none",
  },
  secondaryButton: {
    background: "#1a2345",
    color: "#eef2ff",
    border: "1px solid rgba(255,255,255,0.12)",
  },
  refreshButton: {
    width: "auto",
    minWidth: 110,
  },
  disabledButton: {
    opacity: 0.65,
    cursor: "not-allowed",
  },
};