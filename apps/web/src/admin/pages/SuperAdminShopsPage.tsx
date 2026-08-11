import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { exportCsv } from "../utils/exportCsv";
import {
  adminApi,
  type AdminShopRow,
  type AdminUserRow,
  type PaginationMeta,
  type UpdateSuperAdminShopInput,
} from "../services/adminApi";

const PLAN_OPTIONS = ["FREE", "PRO", "PREMIUM", "ULTRA"];
const STATUS_OPTIONS = [
  "ACTIVE",
  "TRIALING",
  "PAST_DUE",
  "INCOMPLETE",
  "INCOMPLETE_EXPIRED",
  "CANCELED",
  "PAUSED",
  "UNKNOWN",
];
const PROFILE_FIELDS = ["name", "address", "phone", "description", "hours"] as const;
const EMPTY_CREATE = {
  ownerId: "",
  name: "",
  address: "",
  phone: "",
  description: "",
  hours: "",
  subscriptionPlan: "FREE",
  subscriptionStatus: "ACTIVE",
};

type ProfileForm = Pick<AdminShopRow, (typeof PROFILE_FIELDS)[number]>;
type BillingForm = Pick<
  AdminShopRow,
  | "subscriptionPlan"
  | "subscriptionStatus"
  | "subscriptionCurrentPeriodEnd"
  | "cancelAtPeriodEnd"
>;

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function dateTimeLocal(value?: string | null) {
  return value ? new Date(value).toISOString().slice(0, 16) : "";
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

function ownerLabel(owner: AdminUserRow) {
  return `${owner.name || "Unnamed owner"} · ${owner.email}`;
}

export default function SuperAdminShopsPage() {
  const [searchParams] = useSearchParams();
  const [shops, setShops] = useState<AdminShopRow[]>([]);
  const [owners, setOwners] = useState<AdminUserRow[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  });
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [query, setQuery] = useState(() => searchParams.get("q") || "");
  const [plan, setPlan] = useState("");
  const [status, setStatus] = useState("");
  const [access, setAccess] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE);
  const [profileShop, setProfileShop] = useState<AdminShopRow | null>(null);
  const [profile, setProfile] = useState<ProfileForm>({
    name: "",
    address: "",
    phone: "",
    description: "",
    hours: "",
  });
  const [billingShop, setBillingShop] = useState<AdminShopRow | null>(null);
  const [billing, setBilling] = useState<BillingForm>({
    subscriptionPlan: "FREE",
    subscriptionStatus: "ACTIVE",
    subscriptionCurrentPeriodEnd: null,
    cancelAtPeriodEnd: false,
  });
  const [reason, setReason] = useState("");
  const [exporting, setExporting] = useState(false);

  const filters = useMemo(
    () => ({
      q: query.trim() || undefined,
      subscriptionPlan: plan || undefined,
      subscriptionStatus: status || undefined,
      isDeleted: access || undefined,
    }),
    [query, plan, status, access],
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");

      try {
        const result = await adminApi.getSuperAdminShopsPaged(
          { page, limit, ...filters },
          controller.signal,
        );
        setShops(result.rows);
        if (result.pagination) setPagination(result.pagination);
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setError(errorMessage(requestError, "Failed to load shops."));
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [page, limit, filters, refreshVersion]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadOwners() {
      const rows: AdminUserRow[] = [];
      let ownerPage = 1;

      try {
        while (!controller.signal.aborted) {
          const result = await adminApi.getUsersPaged(
            { page: ownerPage, limit: 250, role: "OWNER", isActive: true },
            controller.signal,
          );
          rows.push(...result.rows);
          if (!result.pagination?.hasNextPage) break;
          ownerPage += 1;
        }

        if (!controller.signal.aborted) {
          setOwners(
            rows.filter(
              (user) => user.role === "OWNER" && user.isActive !== false,
            ),
          );
        }
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setError(errorMessage(requestError, "Failed to load owners."));
        }
      }
    }

    void loadOwners();
    return () => controller.abort();
  }, []);

  function refreshShops() {
    setRefreshVersion((value) => value + 1);
  }

  function resetFilters() {
    setQuery("");
    setPlan("");
    setStatus("");
    setAccess("");
    setPage(1);
  }

  function openProfile(shop: AdminShopRow) {
    setProfileShop(shop);
    setProfile({
      name: shop.name,
      address: shop.address || "",
      phone: shop.phone || "",
      description: shop.description || "",
      hours: shop.hours || "",
    });
    setError("");
  }

  function openBilling(shop: AdminShopRow, proposed?: Partial<BillingForm>) {
    setBillingShop(shop);
    setBilling({
      subscriptionPlan: shop.subscriptionPlan || "FREE",
      subscriptionStatus: shop.subscriptionStatus || "ACTIVE",
      subscriptionCurrentPeriodEnd: shop.subscriptionCurrentPeriodEnd || null,
      cancelAtPeriodEnd: Boolean(shop.cancelAtPeriodEnd),
      ...proposed,
    });
    setReason("");
    setError("");
  }

  async function createShop(event: FormEvent) {
    event.preventDefault();
    if (!createForm.name.trim() || !createForm.ownerId) {
      setError("Shop name and owner are required.");
      return;
    }

    setCreating(true);
    setError("");
    try {
      const result = await adminApi.createSuperAdminShop({
        ...createForm,
        name: createForm.name.trim(),
      });
      setNotice(`Created shop “${result.shop.name}”.`);
      setShowCreate(false);
      setCreateForm(EMPTY_CREATE);
      setPage(1);
      refreshShops();
    } catch (requestError) {
      setError(errorMessage(requestError, "Failed to create shop."));
    } finally {
      setCreating(false);
    }
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (!profileShop || !profile.name.trim()) {
      setError("Shop name is required.");
      return;
    }

    setSavingId(profileShop.id);
    setError("");
    try {
      const result = await adminApi.updateSuperAdminShop(profileShop.id, {
        ...profile,
        name: profile.name.trim(),
      });
      setNotice(`Updated profile for “${result.shop.name}”.`);
      setProfileShop(null);
      refreshShops();
    } catch (requestError) {
      setError(errorMessage(requestError, "Failed to update shop profile."));
    } finally {
      setSavingId(null);
    }
  }

  async function saveBilling(event: FormEvent) {
    event.preventDefault();
    if (!billingShop || !reason.trim()) {
      setError("A reason is required for billing overrides.");
      return;
    }

    setSavingId(billingShop.id);
    setError("");
    try {
      const input: UpdateSuperAdminShopInput = {
        ...billing,
        subscriptionCurrentPeriodEnd: billing.subscriptionCurrentPeriodEnd
          ? new Date(billing.subscriptionCurrentPeriodEnd).toISOString()
          : null,
        reason: reason.trim(),
      };
      const result = await adminApi.updateSuperAdminShop(billingShop.id, input);
      setNotice(`Updated billing for “${result.shop.name}”.`);
      setBillingShop(null);
      refreshShops();
    } catch (requestError) {
      setError(errorMessage(requestError, "Failed to update shop billing."));
    } finally {
      setSavingId(null);
    }
  }

  async function toggleAccess(shop: AdminShopRow) {
    const isDeleted = !shop.isDeleted;
    if (!window.confirm(`${isDeleted ? "Disable" : "Restore"} “${shop.name}”?`)) {
      return;
    }

    setSavingId(shop.id);
    setError("");
    try {
      const result = await adminApi.updateSuperAdminShop(shop.id, { isDeleted });
      setNotice(
        `${isDeleted ? "Disabled" : "Restored"} “${result.shop.name}”.`,
      );
      refreshShops();
    } catch (requestError) {
      setError(errorMessage(requestError, "Failed to update shop access."));
    } finally {
      setSavingId(null);
    }
  }

  async function reassign(shop: AdminShopRow, ownerId: string) {
    if (!ownerId || ownerId === shop.ownerId) return;
    const owner = owners.find((item) => item.id === ownerId);
    if (
      !window.confirm(
        `Reassign “${shop.name}” to ${owner?.email || "the selected owner"}?`,
      )
    ) {
      return;
    }

    setSavingId(shop.id);
    setError("");
    try {
      const result = await adminApi.reassignSuperAdminShopOwner(shop.id, ownerId);
      setNotice(`Reassigned “${result.shop.name}”.`);
      refreshShops();
    } catch (requestError) {
      setError(errorMessage(requestError, "Failed to reassign shop owner."));
    } finally {
      setSavingId(null);
    }
  }

  async function exportAll() {
    setExporting(true);
    setError("");
    try {
      const rows: AdminShopRow[] = [];
      let exportPage = 1;

      while (true) {
        const result = await adminApi.getSuperAdminShopsPaged({
          page: exportPage,
          limit: 250,
          ...filters,
        });
        rows.push(...result.rows);
        if (!result.pagination?.hasNextPage) break;
        exportPage += 1;
      }

      exportCsv(
        "platform-shops-filtered.csv",
        rows.map(
          ({
            id,
            name,
            address,
            phone,
            ownerName,
            ownerEmail,
            subscriptionPlan,
            subscriptionStatus,
            isDeleted,
            createdAt,
          }) => ({
            id,
            name,
            address,
            phone,
            ownerName,
            ownerEmail,
            subscriptionPlan,
            subscriptionStatus,
            isDeleted,
            createdAt,
          }),
        ),
      );
    } catch (requestError) {
      setError(errorMessage(requestError, "Failed to export shops."));
    } finally {
      setExporting(false);
    }
  }

  const inputClass = "rounded-lg border px-3 py-2 text-sm";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Platform Shops</h1>
          <p className="text-sm text-muted-foreground">
            Create, find, edit, bill, and manage shops.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="button" onClick={() => setShowCreate((value) => !value)}>
            {showCreate ? "Cancel" : "+ Create Shop"}
          </button>
          <button className="button" onClick={() => void exportAll()} disabled={exporting}>
            {exporting ? "Exporting..." : "Export All Matching Shops"}
          </button>
          <button className="button" onClick={refreshShops} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {notice && <div role="status" className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">{notice}</div>}
      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {showCreate && (
        <form onSubmit={createShop} className="grid gap-3 rounded-2xl border p-4">
          <h2 className="font-semibold">Create shop</h2>
          <select
            aria-label="Owner"
            required
            value={createForm.ownerId}
            onChange={(event) =>
              setCreateForm({ ...createForm, ownerId: event.target.value })
            }
            className={inputClass}
          >
            <option value="">Choose owner</option>
            {owners.map((owner) => <option key={owner.id} value={owner.id}>{ownerLabel(owner)}</option>)}
          </select>
          {PROFILE_FIELDS.map((field) => (
            <label key={field} className="grid gap-1 text-sm">
              {field[0].toUpperCase() + field.slice(1)}
              <input
                required={field === "name"}
                value={createForm[field]}
                onChange={(event) =>
                  setCreateForm({ ...createForm, [field]: event.target.value })
                }
                className={inputClass}
              />
            </label>
          ))}
          <div className="grid gap-3 md:grid-cols-2">
            <select
              aria-label="Seller plan"
              value={createForm.subscriptionPlan}
              onChange={(event) =>
                setCreateForm({ ...createForm, subscriptionPlan: event.target.value })
              }
              className={inputClass}
            >
              {PLAN_OPTIONS.map((value) => <option key={value}>{value}</option>)}
            </select>
            <select
              aria-label="Subscription status"
              value={createForm.subscriptionStatus}
              onChange={(event) =>
                setCreateForm({ ...createForm, subscriptionStatus: event.target.value })
              }
              className={inputClass}
            >
              {STATUS_OPTIONS.map((value) => <option key={value}>{value}</option>)}
            </select>
          </div>
          <button className="button" disabled={creating}>{creating ? "Creating..." : "Create Shop"}</button>
        </form>
      )}

      <div className="grid gap-3 rounded-2xl border p-4 md:grid-cols-5">
        <input
          aria-label="Search shops"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
          }}
          placeholder="Name, ID, owner, email, address, or phone"
          className={inputClass}
        />
        <select
          aria-label="Seller plan filter"
          value={plan}
          onChange={(event) => {
            setPlan(event.target.value);
            setPage(1);
          }}
          className={inputClass}
        >
          <option value="">All plans</option>
          {PLAN_OPTIONS.map((value) => <option key={value}>{value}</option>)}
        </select>
        <select
          aria-label="Subscription status filter"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
          className={inputClass}
        >
          <option value="">All subscription statuses</option>
          {STATUS_OPTIONS.map((value) => <option key={value}>{value}</option>)}
        </select>
        <select
          aria-label="Shop access state"
          value={access}
          onChange={(event) => {
            setAccess(event.target.value);
            setPage(1);
          }}
          className={inputClass}
        >
          <option value="">All</option>
          <option value="false">Active</option>
          <option value="true">Disabled</option>
        </select>
        <button className="button" onClick={resetFilters}>Clear filters</button>
      </div>

      <div className="overflow-x-auto rounded-2xl border">
        <table className="w-full min-w-[1200px] text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left">
              <th className="p-3">Shop</th>
              <th className="p-3">Owner</th>
              <th className="p-3">Plan</th>
              <th className="p-3">Subscription</th>
              <th className="p-3">Access</th>
              <th className="p-3">Created</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="p-6 text-center">Loading shops...</td></tr>
            ) : shops.length === 0 ? (
              <tr><td colSpan={7} className="p-6 text-center">No matching shops found.</td></tr>
            ) : shops.map((shop) => (
              <tr key={shop.id} className="border-b">
                <td className="p-3">
                  <div className="font-medium">{shop.name}</div>
                  <div>{shop.address || "No address"}</div>
                  <div className="text-xs">{shop.phone || "No phone"} · {shop.id}</div>
                </td>
                <td className="p-3">
                  <select
                    aria-label={`Owner for ${shop.name}`}
                    value={shop.ownerId || ""}
                    disabled={savingId === shop.id}
                    onChange={(event) => void reassign(shop, event.target.value)}
                    className={inputClass}
                  >
                    <option value="">Unassigned</option>
                    {owners.map((owner) => <option key={owner.id} value={owner.id}>{ownerLabel(owner)}</option>)}
                  </select>
                  <div className="mt-1 text-muted-foreground">{shop.ownerEmail || "—"}</div>
                  <div className="text-xs text-muted-foreground">{shop.ownerId || "—"}</div>
                </td>
                <td className="p-3">
                  <select
                    aria-label={`Plan for ${shop.name}`}
                    value={shop.subscriptionPlan || "FREE"}
                    disabled={savingId === shop.id}
                    onChange={(event) =>
                      openBilling(shop, { subscriptionPlan: event.target.value })
                    }
                    className={inputClass}
                  >
                    {PLAN_OPTIONS.map((value) => <option key={value}>{value}</option>)}
                  </select>
                </td>
                <td className="p-3">
                  <select
                    aria-label={`Status for ${shop.name}`}
                    value={shop.subscriptionStatus || "ACTIVE"}
                    disabled={savingId === shop.id}
                    onChange={(event) =>
                      openBilling(shop, { subscriptionStatus: event.target.value })
                    }
                    className={inputClass}
                  >
                    {STATUS_OPTIONS.map((value) => <option key={value}>{value}</option>)}
                  </select>
                </td>
                <td className="p-3">{shop.isDeleted ? "Disabled" : "Active"}</td>
                <td className="p-3 text-muted-foreground">{formatDate(shop.createdAt)}</td>
                <td className="space-x-2 p-3 text-right">
                  <button className="button" disabled={savingId === shop.id} onClick={() => openProfile(shop)}>Edit</button>
                  <button className="button" disabled={savingId === shop.id} onClick={() => openBilling(shop)}>Billing</button>
                  <button
                    className="button"
                    disabled={savingId === shop.id}
                    onClick={() => void toggleAccess(shop)}
                  >
                    {shop.isDeleted ? "Restore" : "Disable"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span>Page {pagination.page} of {pagination.totalPages} · {pagination.total} matching shops</span>
        <div className="flex items-center gap-2">
          <label>
            Page size{" "}
            <select
              aria-label="Page size"
              value={limit}
              onChange={(event) => {
                setLimit(Number(event.target.value));
                setPage(1);
              }}
              className={inputClass}
            >
              {[25, 50, 100].map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
          <button
            className="button"
            disabled={!pagination.hasPreviousPage || loading}
            onClick={() => setPage((value) => value - 1)}
          >
            Previous
          </button>
          <button
            className="button"
            disabled={!pagination.hasNextPage || loading}
            onClick={() => setPage((value) => value + 1)}
          >
            Next
          </button>
        </div>
      </div>

      {profileShop && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="profile-title"
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
        >
          <form onSubmit={saveProfile} className="grid w-full max-w-xl gap-3 rounded-2xl bg-background p-6">
            <h2 id="profile-title" className="text-lg font-semibold">Edit {profileShop.name}</h2>
            {PROFILE_FIELDS.map((field) => (
              <label key={field} className="grid gap-1">
                {field[0].toUpperCase() + field.slice(1)}
                <input
                  required={field === "name"}
                  value={profile[field] || ""}
                  disabled={savingId === profileShop.id}
                  onChange={(event) =>
                    setProfile({ ...profile, [field]: event.target.value })
                  }
                  className={inputClass}
                />
              </label>
            ))}
            <div className="flex justify-end gap-2">
              <button type="button" className="button" disabled={savingId === profileShop.id} onClick={() => setProfileShop(null)}>
                Cancel
              </button>
              <button className="button" disabled={savingId === profileShop.id}>
                {savingId === profileShop.id ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        </div>
      )}

      {billingShop && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="billing-title"
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
        >
          <form onSubmit={saveBilling} className="grid w-full max-w-xl gap-3 rounded-2xl bg-background p-6">
            <h2 id="billing-title" className="text-lg font-semibold">Billing override for {billingShop.name}</h2>
            <p className="text-sm">
              Current: {billingShop.subscriptionPlan} /{" "}
              {billingShop.subscriptionStatus} / period end{" "}
              {billingShop.subscriptionCurrentPeriodEnd || "none"} / cancel at
              period end {billingShop.cancelAtPeriodEnd ? "yes" : "no"}
            </p>
            <p className="text-sm">Proposed values:</p>
            <label>
              Seller plan
              <select
                value={billing.subscriptionPlan || "FREE"}
                onChange={(event) =>
                  setBilling({ ...billing, subscriptionPlan: event.target.value })
                }
                className={`${inputClass} w-full`}
              >
                {PLAN_OPTIONS.map((value) => <option key={value}>{value}</option>)}
              </select>
            </label>
            <label>
              Subscription status
              <select
                value={billing.subscriptionStatus || "ACTIVE"}
                onChange={(event) =>
                  setBilling({ ...billing, subscriptionStatus: event.target.value })
                }
                className={`${inputClass} w-full`}
              >
                {STATUS_OPTIONS.map((value) => <option key={value}>{value}</option>)}
              </select>
            </label>
            <label>
              Current period end
              <input
                type="datetime-local"
                value={dateTimeLocal(billing.subscriptionCurrentPeriodEnd)}
                onChange={(event) =>
                  setBilling({
                    ...billing,
                    subscriptionCurrentPeriodEnd: event.target.value || null,
                  })
                }
                className={`${inputClass} w-full`}
              />
            </label>
            <label className="flex gap-2">
              <input
                type="checkbox"
                checked={Boolean(billing.cancelAtPeriodEnd)}
                onChange={(event) =>
                  setBilling({
                    ...billing,
                    cancelAtPeriodEnd: event.target.checked,
                  })
                }
              />
              Cancel at period end
            </label>
            <label>
              Reason (required)
              <textarea required value={reason} onChange={(event) => setReason(event.target.value)} className={`${inputClass} w-full`} />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" className="button" disabled={savingId === billingShop.id} onClick={() => setBillingShop(null)}>
                Cancel
              </button>
              <button className="button" disabled={savingId === billingShop.id || !reason.trim()}>
                {savingId === billingShop.id ? "Saving..." : "Confirm"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
