// File: apps/web/src/pages/OwnerOnboardingPage.tsx

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { Link } from "react-router-dom";

import OwnerLaunchReadiness from "../components/onboarding/OwnerLaunchReadiness";
import {
  completeShopOnboarding,
  createShop,
  getMyShops,
  getShopOnboardingProgress,
  type Shop,
} from "../services/shops";
import {
  createSubscriptionCheckoutSession,
  getSellerPlans,
  updateShopSubscription,
} from "../services/ownerWorkspace";
import { inviteStaffMember } from "../services/staff";
import {
  emptyOwnerReadiness,
  type OwnerReadinessSummary,
} from "../services/ownerOnboardingReadiness";

import "../styles/owner-onboarding.css";
import { selectActiveOwnerShopId, setActiveOwnerShopId } from "../services/ownerActiveShop";

type SellerPlan = {
  code: string;
  label: string;
  monthlyPriceCents: number;
  yearlyPriceCents: number;
  features: string[];
};

const STEPS = [
  "Shop profile",
  "Seller plan",
  "Invite staff",
  "Finish setup",
];

const PAID_PLAN_CODES = new Set(["PRO", "PREMIUM", "ULTRA"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizePlans(data: unknown): SellerPlan[] {
  let source: unknown[] = [];

  if (Array.isArray(data)) {
    source = data;
  } else if (isRecord(data)) {
    if (Array.isArray(data.plans)) {
      source = data.plans;
    } else if (Array.isArray(data.data)) {
      source = data.data;
    } else if (isRecord(data.data) && Array.isArray(data.data.plans)) {
      source = data.data.plans;
    }
  }

  return source
    .filter(isRecord)
    .map((row) => ({
      code: String(row.code ?? row.plan ?? "")
        .trim()
        .toUpperCase(),
      label: String(row.label ?? row.name ?? row.code ?? "Plan"),
      monthlyPriceCents: Number(row.monthlyPriceCents ?? 0),
      yearlyPriceCents: Number(row.yearlyPriceCents ?? 0),
      features: Array.isArray(row.features)
        ? row.features.map((feature) => String(feature))
        : [],
    }))
    .filter((plan) => Boolean(plan.code))
    .sort((a, b) => {
      if (a.code === "FREE") return -1;
      if (b.code === "FREE") return 1;
      return a.monthlyPriceCents - b.monthlyPriceCents;
    });
}

function getInitialStep() {
  if (typeof window === "undefined") return 1;

  const parsed = Number(
    new URL(window.location.href).searchParams.get("step") || "1",
  );

  if (!Number.isInteger(parsed)) return 1;
  return Math.min(4, Math.max(1, parsed));
}

function formatMoney(cents: number) {
  if (!cents) return "Free";
  return `$${(cents / 100).toFixed(2)}/month`;
}

export default function OwnerOnboardingPage() {
  const [step, setStep] = useState(getInitialStep);
  const [loading, setLoading] = useState(true);
  const [loadAttempt, setLoadAttempt] = useState(0);

  const [shops, setShops] = useState<Shop[]>([]);
  const [selectedShopId, setSelectedShopId] = useState("");

  const [plans, setPlans] = useState<SellerPlan[]>([]);
  const [selectedPlanCode, setSelectedPlanCode] = useState("FREE");

  const [shopName, setShopName] = useState("");
  const [shopAddress, setShopAddress] = useState("");
  const [shopPhone, setShopPhone] = useState("");
  const [shopHours, setShopHours] = useState("");
  const [shopDescription, setShopDescription] = useState("");

  const [staffEmail, setStaffEmail] = useState("");
  const [staffName, setStaffName] = useState("");
  const [staffPhone, setStaffPhone] = useState("");
  const [staffRole, setStaffRole] = useState("SHOP_STAFF");

  const [shopSubmitting, setShopSubmitting] = useState(false);
  const [planSubmitting, setPlanSubmitting] = useState(false);
  const [staffSubmitting, setStaffSubmitting] = useState(false);
  const [completionSubmitting, setCompletionSubmitting] = useState(false);

  const [readiness, setReadiness] = useState<OwnerReadinessSummary>(emptyOwnerReadiness);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const selectedShop = useMemo(
    () => shops.find((shop) => shop.id === selectedShopId) ?? null,
    [selectedShopId, shops],
  );

  const selectedPlan = useMemo(
    () =>
      plans.find((plan) => plan.code === selectedPlanCode) ?? null,
    [plans, selectedPlanCode],
  );

  const refreshReadiness = useCallback(async (shopId: string, signal?: AbortSignal) => {
    if (!shopId) {
      setReadiness(emptyOwnerReadiness());
      return;
    }
    const progress = await getShopOnboardingProgress(shopId, signal);
    setReadiness(progress);
    window.dispatchEvent(new CustomEvent("pawnloop:owner-setup-updated"));
  }, []);

  function goToStep(nextStep: number) {
    const safeStep = Math.min(4, Math.max(1, nextStep));

    setError("");
    setStep(safeStep);

    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("step", String(safeStep));
      url.searchParams.delete("checkout");
      window.history.replaceState({}, "", url.toString());
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  useEffect(() => {
    const controller = new AbortController();

    async function loadOnboarding() {
      setLoading(true);
      setError("");

      try {
        const [ownerShops, planPayload] = await Promise.all([
          getMyShops(controller.signal),
          getSellerPlans(controller.signal),
        ]);

        setShops(ownerShops);

        if (ownerShops.length > 0) {
          const requestedShopId = new URL(window.location.href).searchParams.get("shopId") || "";
          const activeShopId = selectActiveOwnerShopId(ownerShops, requestedShopId);
          setSelectedShopId(activeShopId);
          await refreshReadiness(activeShopId, controller.signal);

          const requestedStep = getInitialStep();
          if (requestedStep === 1 && window.location.hash !== "#shop-profile") {
            setStep(2);
          }
        }

        const normalized = normalizePlans(planPayload);
        setPlans(normalized);

        if (
          normalized.length > 0 &&
          !normalized.some((plan) => plan.code === "FREE")
        ) {
          setSelectedPlanCode(normalized[0].code);
        }
        if (typeof window !== "undefined") {
          const url = new URL(window.location.href);
          const checkout = url.searchParams.get("checkout");
          const plan = url.searchParams.get("plan");

          if (checkout === "success") {
            setMessage(
              `Subscription checkout completed${
                plan ? ` for ${plan}` : ""
              }. Continue your setup.`,
            );
          } else if (checkout === "cancelled") {
            setMessage(
              "Checkout was cancelled. No billing changes were made.",
            );
          }
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Unable to load your owner setup.",
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadOnboarding();

    return () => controller.abort();
  }, [loadAttempt, refreshReadiness]);

  async function submitShop(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (shopSubmitting) return;

    setError("");
    setMessage("");
    setShopSubmitting(true);

    try {
      const name = shopName.trim();

      if (!name) {
        throw new Error("Shop name is required.");
      }

      const created = await createShop({
        name,
        address: shopAddress.trim(),
        phone: shopPhone.trim(),
        hours: shopHours.trim(),
        description: shopDescription.trim(),
      });

      setShops((current) => [created, ...current]);
      setSelectedShopId(created.id);
      setActiveOwnerShopId(created.id);
      await refreshReadiness(created.id);
      setMessage(`${created.name} was created successfully.`);
      goToStep(2);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to create the shop.",
      );
    } finally {
      setShopSubmitting(false);
    }
  }

  async function continueWithPlan() {
    if (planSubmitting) return;

    if (!selectedShopId) {
      setError("Create or select a shop before choosing a plan.");
      goToStep(1);
      return;
    }

    const planCode = selectedPlanCode.trim().toUpperCase();

    if (!planCode) {
      setError("Select a seller plan.");
      return;
    }

    setError("");
    setMessage("");
    setPlanSubmitting(true);

    try {
      if (PAID_PLAN_CODES.has(planCode)) {
        if (typeof window === "undefined") {
          throw new Error("Stripe Checkout requires a browser window.");
        }

        const baseUrl = `${window.location.origin}/owner/onboarding`;
        const encodedShopId = encodeURIComponent(selectedShopId);
        const encodedPlan = encodeURIComponent(planCode);

        const checkout = await createSubscriptionCheckoutSession({
          shopId: selectedShopId,
          planCode,
          billingInterval: "MONTH",
          successUrl:
            `${baseUrl}?step=3&checkout=success` +
            `&shopId=${encodedShopId}&plan=${encodedPlan}`,
          cancelUrl:
            `${baseUrl}?step=2&checkout=cancelled` +
            `&shopId=${encodedShopId}&plan=${encodedPlan}`,
        });

        if (!checkout.url) {
          throw new Error(
            "Stripe Checkout did not return a redirect URL.",
          );
        }

        window.location.assign(checkout.url);
        return;
      }

      await updateShopSubscription(selectedShopId, {
        plan: planCode,
        status: "ACTIVE",
        cancelAtPeriodEnd: false,
      });

      await refreshReadiness(selectedShopId);

      setMessage(`${planCode} plan selected.`);
      goToStep(3);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to update the seller plan.",
      );
    } finally {
      setPlanSubmitting(false);
    }
  }

  async function submitStaffInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (staffSubmitting) return;

    if (!selectedShopId) {
      setError("A shop is required before inviting staff.");
      return;
    }

    const email = staffEmail.trim().toLowerCase();

    if (!email) {
      setError("Enter the staff member's email or skip this step.");
      return;
    }

    setError("");
    setMessage("");
    setStaffSubmitting(true);

    try {
      await inviteStaffMember({
        shopId: selectedShopId,
        email,
        name: staffName.trim() || undefined,
        phone: staffPhone.trim() || undefined,
        role: staffRole,
        permissions: [
          "inventory:read",
          "offers:read",
          "locations:read",
        ],
      });

      await refreshReadiness(selectedShopId);
      setMessage(`Invitation sent to ${email}.`);
      setStaffEmail("");
      setStaffName("");
      setStaffPhone("");
      goToStep(4);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to invite the staff member.",
      );
    } finally {
      setStaffSubmitting(false);
    }
  }

  async function completeOnboarding() {
    if (completionSubmitting) return;

    if (!selectedShop?.id) {
      setError("Create or select a shop before completing onboarding.");
      return;
    }

    if (readiness.launched) return;

    if (!readiness.readyToLaunch) {
      setError("Complete all required setup steps before launching.");
      return;
    }

    setError("");
    setMessage("");
    setCompletionSubmitting(true);

    try {
      const result = await completeShopOnboarding(selectedShop.id);

      setShops((current) =>
        current.map((shop) =>
          shop.id === result.shop.id
            ? {
                ...shop,
                onboardingCompletedAt:
                  result.shop.onboardingCompletedAt,
              }
            : shop,
        ),
      );
      await refreshReadiness(selectedShop.id);
      setMessage(
        "Shop onboarding is complete and saved to your shop account.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to complete shop onboarding.",
      );
    } finally {
      setCompletionSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="owner-onboarding-page">
        <section className="owner-onboarding-state">
          Loading your owner setup...
        </section>
      </main>
    );
  }

  if (error && shops.length === 0) {
    return (
      <main className="owner-onboarding-page">
        <section className="owner-onboarding-state" role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>
            Try again
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="owner-onboarding-page">
      <header className="owner-onboarding-hero">
        <div>
          <span className="owner-onboarding-eyebrow">
            PawnLoop owner setup
          </span>
          <h1>Launch your pawn shop</h1>
          <p>
            Complete your shop profile, choose a plan, invite your team,
            and review your launch checklist.
          </p>
        </div>

        <Link className="owner-onboarding-dashboard-link" to="/owner">
          Exit to dashboard
        </Link>
      </header>

      <ol className="owner-onboarding-progress" aria-label="Setup progress">
        {STEPS.map((label, index) => {
          const stepNumber = index + 1;
          const isActive = stepNumber === step;
          const isComplete = stepNumber < step;

          return (
            <li
              key={label}
              className={[
                isActive ? "is-active" : "",
                isComplete ? "is-complete" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <span>{isComplete ? "✓" : stepNumber}</span>
              <strong>{label}</strong>
            </li>
          );
        })}
      </ol>

      {error ? (
        <div className="owner-onboarding-alert is-error" role="alert">
          {error}
        </div>
      ) : null}

      {message ? (
        <div className="owner-onboarding-alert is-success" role="status">
          {message}
        </div>
      ) : null}

      {step === 1 ? (
        <section id="shop-profile" data-wizard-step="1" className="owner-onboarding-card">
          <div className="owner-onboarding-card-heading">
            <span>Step 1 of 4</span>
            <h2>Create your shop profile</h2>
            <p>
              This information appears to buyers and becomes your first
              shop location.
            </p>
          </div>

          {shops.length > 0 ? (
            <div className="owner-onboarding-existing">
              <label>
                Use an existing shop
                <select
                  value={selectedShopId}
                  onChange={(event) => {
                    setSelectedShopId(event.target.value);
                    setActiveOwnerShopId(event.target.value);
                    void refreshReadiness(event.target.value);
                  }}
                >
                  {shops.map((shop) => (
                    <option key={shop.id} value={shop.id}>
                      {shop.name}
                    </option>
                  ))}
                </select>
              </label>

              <button type="button" onClick={() => goToStep(2)}>
                Continue with selected shop
              </button>
            </div>
          ) : (
            <form
              className="owner-onboarding-form"
              onSubmit={submitShop}
            >
              <div className="owner-onboarding-grid">
                <label>
                  Shop name
                  <input
                    value={shopName}
                    onChange={(event) =>
                      setShopName(event.target.value)
                    }
                    placeholder="Downtown Pawn"
                    required
                  />
                </label>

                <label>
                  Business phone
                  <input
                    value={shopPhone}
                    onChange={(event) =>
                      setShopPhone(event.target.value)
                    }
                    placeholder="713-555-1111"
                    autoComplete="tel"
                  />
                </label>
              </div>

              <label>
                Shop address
                <input
                  value={shopAddress}
                  onChange={(event) =>
                    setShopAddress(event.target.value)
                  }
                  placeholder="123 Main Street, Houston, TX"
                  autoComplete="street-address"
                />
              </label>

              <label>
                Operating hours
                <input
                  value={shopHours}
                  onChange={(event) =>
                    setShopHours(event.target.value)
                  }
                  placeholder="Monday-Saturday, 10 AM-6 PM"
                />
              </label>

              <label>
                Shop description
                <textarea
                  value={shopDescription}
                  onChange={(event) =>
                    setShopDescription(event.target.value)
                  }
                  placeholder="Tell buyers about your shop, specialties, and services."
                  rows={5}
                />
              </label>

              <div className="owner-onboarding-actions">
                <button type="submit" disabled={shopSubmitting}>
                  {shopSubmitting
                    ? "Creating shop..."
                    : "Create shop and continue"}
                </button>
              </div>
            </form>
          )}
        </section>
      ) : null}

      {step === 2 ? (
        <section id="seller-plan-step" data-wizard-step="2" className="owner-onboarding-card">
          <div className="owner-onboarding-card-heading">
            <span>Step 2 of 4</span>
            <h2>Choose your seller plan</h2>
            <p>
              Select the plan for {selectedShop?.name || "your shop"}.
              Paid plans continue through Stripe Checkout.
            </p>
          </div>

          <div className="owner-onboarding-plan-grid">
            {(plans.length > 0
              ? plans
              : [
                  {
                    code: "FREE",
                    label: "Free",
                    monthlyPriceCents: 0,
                    yearlyPriceCents: 0,
                    features: [
                      "Create a shop profile",
                      "List initial inventory",
                      "Use core owner tools",
                    ],
                  },
                ]
            ).map((plan) => {
              const selected = plan.code === selectedPlanCode;

              return (
                <button
                  key={plan.code}
                  type="button"
                  className={
                    selected
                      ? "owner-onboarding-plan is-selected"
                      : "owner-onboarding-plan"
                  }
                  onClick={() => setSelectedPlanCode(plan.code)}
                  aria-pressed={selected}
                >
                  <span>{plan.label}</span>
                  <strong>{formatMoney(plan.monthlyPriceCents)}</strong>

                  <ul>
                    {plan.features.slice(0, 5).map((feature) => (
                      <li key={feature}>{feature}</li>
                    ))}
                  </ul>
                </button>
              );
            })}
          </div>

          <div className="owner-onboarding-selection">
            Selected:{" "}
            <strong>
              {selectedPlan?.label || selectedPlanCode}
            </strong>
          </div>

          <div className="owner-onboarding-actions">
            <button
              type="button"
              className="is-secondary"
              onClick={() => goToStep(1)}
            >
              Back
            </button>

            <button
              type="button"
              onClick={() => void continueWithPlan()}
              disabled={planSubmitting}
            >
              {planSubmitting
                ? "Updating plan..."
                : PAID_PLAN_CODES.has(selectedPlanCode)
                  ? "Continue to secure checkout"
                  : "Use this plan"}
            </button>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section id="staff-step" data-wizard-step="3" className="owner-onboarding-card">
          <div className="owner-onboarding-card-heading">
            <span>Step 3 of 4</span>
            <h2>Invite your first staff member</h2>
            <p>
              This step is optional. You can manage additional staff and
              permissions later.
            </p>
          </div>

          <form
            className="owner-onboarding-form"
            onSubmit={submitStaffInvite}
          >
            <div className="owner-onboarding-grid">
              <label>
                Staff email
                <input
                  type="email"
                  value={staffEmail}
                  onChange={(event) =>
                    setStaffEmail(event.target.value)
                  }
                  placeholder="employee@example.com"
                  autoComplete="email"
                />
              </label>

              <label>
                Staff name
                <input
                  value={staffName}
                  onChange={(event) =>
                    setStaffName(event.target.value)
                  }
                  placeholder="Employee name"
                  autoComplete="name"
                />
              </label>

              <label>
                Phone
                <input
                  value={staffPhone}
                  onChange={(event) =>
                    setStaffPhone(event.target.value)
                  }
                  placeholder="555-0000"
                  autoComplete="tel"
                />
              </label>

              <label>
                Role
                <select
                  value={staffRole}
                  onChange={(event) =>
                    setStaffRole(event.target.value)
                  }
                >
                  <option value="SHOP_STAFF">Shop staff</option>
                  <option value="SALES_ASSOCIATE">
                    Sales associate
                  </option>
                  <option value="INVENTORY_MANAGER">
                    Inventory manager
                  </option>
                  <option value="AUCTION_MANAGER">
                    Auction manager
                  </option>
                  <option value="SHOP_MANAGER">
                    Shop manager
                  </option>
                </select>
              </label>
            </div>

            <div className="owner-onboarding-actions">
              <button
                type="button"
                className="is-secondary"
                onClick={() => goToStep(2)}
              >
                Back
              </button>

              <button
                type="button"
                className="is-secondary"
                onClick={() => goToStep(4)}
              >
                Skip for now
              </button>

              <button type="submit" disabled={staffSubmitting}>
                {staffSubmitting
                  ? "Sending invitation..."
                  : "Invite and continue"}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {step === 4 ? (
        <section id="finish-setup-step" data-wizard-step="4" className="owner-onboarding-card">
          <div className="owner-onboarding-card-heading">
            <span>Step 4 of 4</span>
            <h2>Your owner workspace is ready</h2>
            <p>
              Your core account setup is complete. Continue with the
              launch checklist below.
            </p>
          </div>

          <OwnerLaunchReadiness summary={readiness} shopId={selectedShopId} />

          <div className="owner-onboarding-next-links">
            <Link to="/owner/items/new">Add inventory</Link>
            <Link to="/owner/locations">Review locations</Link>
            <Link to="/owner/staff">Manage staff</Link>
            <Link to="/owner/subscription">Review subscription</Link>
          </div>

          <div className="owner-onboarding-actions">
            <button
              type="button"
              className="is-secondary"
              onClick={() => goToStep(3)}
            >
              Back
            </button>

            <button
              type="button"
              onClick={() => void completeOnboarding()}
              disabled={
                completionSubmitting ||
                readiness.launched ||
                !readiness.readyToLaunch
              }
            >
              {completionSubmitting
                ? "Saving launch..."
                : readiness.launched
                  ? "LAUNCHED"
                  : "Complete onboarding"}
            </button>
          </div>
        </section>
      ) : null}
    </main>
  );
}
