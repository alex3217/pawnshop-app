import { useEffect, useMemo, useState, type FormEvent } from "react";
import { exportCsv } from "../utils/exportCsv";
import {
  adminApi,
  type AdminShopRow,
  type AdminUserRow,
} from "../services/adminApi";

const PLAN_OPTIONS = ["FREE", "PRO", "PREMIUM"];
const STATUS_OPTIONS = [
  "ACTIVE",
  "TRIALING",
  "PAST_DUE",
  "INCOMPLETE",
  "CANCELED",
  "PAUSED",
  "UNKNOWN",
];

type CreateShopForm = {
  ownerId: string;
  name: string;
  address: string;
  phone: string;
  description: string;
  hours: string;
  subscriptionPlan: string;
  subscriptionStatus: string;
};

const EMPTY_CREATE_FORM: CreateShopForm = {
  ownerId: "",
  name: "",
  address: "",
  phone: "",
  description: "",
  hours: "",
  subscriptionPlan: "FREE",
  subscriptionStatus: "ACTIVE",
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function getOwnerLabel(owner: AdminUserRow) {
  return `${owner.name || "Unnamed owner"} · ${owner.email}`;
}

export default function SuperAdminShopsPage() {
  const [shops, setShops] = useState<AdminShopRow[]>([]);
  const [owners, setOwners] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState<CreateShopForm>(EMPTY_CREATE_FORM);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadShops() {
    setLoading(true);
    setError("");

    try {
      const [shopResult, userResult] = await Promise.all([
        adminApi.getSuperAdminShopsPaged({ limit: 100 }),
        adminApi.getUsersPaged({ limit: 250 }),
      ]);

      setShops(shopResult.rows);
      setOwners(
        userResult.rows.filter(
          (user) => user.role === "OWNER" && user.isActive !== false,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load shops.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadShops();
  }, []);

  const filteredShops = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return shops;

    return shops.filter((shop) =>
      [
        shop.name,
        shop.address,
        shop.phone,
        shop.ownerName,
        shop.ownerEmail,
        shop.subscriptionPlan,
        shop.subscriptionStatus,
        shop.id,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [query, shops]);

  async function createShop(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");

    if (!createForm.ownerId) {
      setError("Choose an owner before creating a shop.");
      return;
    }

    if (!createForm.name.trim()) {
      setError("Shop name is required.");
      return;
    }

    setCreating(true);

    try {
      const response = await adminApi.createSuperAdminShop({
        ownerId: createForm.ownerId,
        name: createForm.name.trim(),
        address: createForm.address.trim() || undefined,
        phone: createForm.phone.trim() || undefined,
        description: createForm.description.trim() || undefined,
        hours: createForm.hours.trim() || undefined,
        subscriptionPlan: createForm.subscriptionPlan,
        subscriptionStatus: createForm.subscriptionStatus,
      });

      setShops((current) => [response.shop, ...current]);
      setCreateForm(EMPTY_CREATE_FORM);
      setShowCreateForm(false);
      setNotice(`Created shop "${response.shop.name}" for ${response.shop.ownerEmail || "owner"}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create shop.");
    } finally {
      setCreating(false);
    }
  }

  async function updateShop(id: string, input: Partial<AdminShopRow>) {
    if ("isDeleted" in input) {
      const confirmed = window.confirm(
        input.isDeleted ? "Disable this shop?" : "Restore this shop?",
      );
      if (!confirmed) return;
    }

    setSavingId(id);
    setError("");
    setNotice("");

    try {
      const response = await adminApi.updateSuperAdminShop(id, input);

      setShops((current) =>
        current.map((shop) => (shop.id === id ? response.shop : shop)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update shop.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Platform Shops</h1>
          <p className="text-sm text-muted-foreground">
            Create shops for owners, assign plans, and manage shop access.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            className="button"
            onClick={() => setShowCreateForm((value) => !value)}
          >
            {showCreateForm ? "Cancel" : "+ Create Shop"}
          </button>

          <button
            className="button"
            onClick={() =>
              exportCsv(
                "platform-shops.csv",
                filteredShops.map((shop) => ({
                  id: shop.id,
                  name: shop.name,
                  ownerName: shop.ownerName,
                  ownerEmail: shop.ownerEmail,
                  subscriptionPlan: shop.subscriptionPlan,
                  subscriptionStatus: shop.subscriptionStatus,
                  isDeleted: shop.isDeleted,
                  createdAt: shop.createdAt,
                })),
              )
            }
          >
            Export CSV
          </button>

          <button className="button" onClick={loadShops} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {notice ? (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
          {notice}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {showCreateForm ? (
        <form
          onSubmit={createShop}
          className="grid gap-3 rounded-2xl border bg-background p-4 shadow-sm"
        >
          <div className="grid gap-3 md:grid-cols-[1.2fr_1fr_1fr]">
            <label className="grid gap-1 text-sm">
              Owner
              <select
                value={createForm.ownerId}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    ownerId: event.target.value,
                  }))
                }
                required
                className="rounded-lg border px-3 py-2 text-sm"
              >
                <option value="">Choose owner</option>
                {owners.map((owner) => (
                  <option key={owner.id} value={owner.id}>
                    {getOwnerLabel(owner)}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1 text-sm">
              Shop name
              <input
                value={createForm.name}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="Downtown Pawn"
                required
                className="rounded-lg border px-3 py-2 text-sm"
              />
            </label>

            <label className="grid gap-1 text-sm">
              Phone
              <input
                value={createForm.phone}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    phone: event.target.value,
                  }))
                }
                placeholder="Shop phone"
                className="rounded-lg border px-3 py-2 text-sm"
              />
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_1fr]">
            <label className="grid gap-1 text-sm">
              Address
              <input
                value={createForm.address}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    address: event.target.value,
                  }))
                }
                placeholder="Shop address"
                className="rounded-lg border px-3 py-2 text-sm"
              />
            </label>

            <label className="grid gap-1 text-sm">
              Hours
              <input
                value={createForm.hours}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    hours: event.target.value,
                  }))
                }
                placeholder="Mon-Fri 9am-6pm"
                className="rounded-lg border px-3 py-2 text-sm"
              />
            </label>
          </div>

          <label className="grid gap-1 text-sm">
            Description
            <input
              value={createForm.description}
              onChange={(event) =>
                setCreateForm((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              placeholder="Short shop description"
              className="rounded-lg border px-3 py-2 text-sm"
            />
          </label>

          <div className="grid gap-3 md:grid-cols-[220px_220px_auto]">
            <label className="grid gap-1 text-sm">
              Seller plan
              <select
                value={createForm.subscriptionPlan}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    subscriptionPlan: event.target.value,
                  }))
                }
                className="rounded-lg border px-3 py-2 text-sm"
              >
                {PLAN_OPTIONS.map((plan) => (
                  <option key={plan} value={plan}>
                    {plan}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1 text-sm">
              Subscription status
              <select
                value={createForm.subscriptionStatus}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    subscriptionStatus: event.target.value,
                  }))
                }
                className="rounded-lg border px-3 py-2 text-sm"
              >
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-end">
              <button className="button" type="submit" disabled={creating}>
                {creating ? "Creating..." : "Create Shop"}
              </button>
            </div>
          </div>
        </form>
      ) : null}

      <div className="rounded-2xl border bg-background p-4 shadow-sm">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search shops by name, owner, email, plan, status, or id..."
          className="w-full rounded-lg border px-3 py-2 text-sm"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border bg-background shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] border-collapse text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left">
                <th className="p-3 font-medium">Shop</th>
                <th className="p-3 font-medium">Owner</th>
                <th className="p-3 font-medium">Plan</th>
                <th className="p-3 font-medium">Subscription</th>
                <th className="p-3 font-medium">Shop Status</th>
                <th className="p-3 font-medium">Created</th>
                <th className="p-3 font-medium text-right">Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-muted-foreground">
                    Loading shops...
                  </td>
                </tr>
              ) : filteredShops.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-muted-foreground">
                    No shops found.
                  </td>
                </tr>
              ) : (
                filteredShops.map((shop) => {
                  const isSaving = savingId === shop.id;
                  const isDeleted = shop.isDeleted === true;

                  return (
                    <tr key={shop.id} className="border-b last:border-b-0">
                      <td className="p-3">
                        <div className="font-medium">{shop.name}</div>
                        <div className="text-muted-foreground">
                          {shop.address || "No address"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {shop.phone || "No phone"}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {shop.id}
                        </div>
                      </td>

                      <td className="p-3">
                        <div className="font-medium">{shop.ownerName || "—"}</div>
                        <div className="text-muted-foreground">
                          {shop.ownerEmail || "—"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {shop.ownerId || "—"}
                        </div>
                      </td>

                      <td className="p-3">
                        <select
                          value={shop.subscriptionPlan || "FREE"}
                          disabled={isSaving}
                          onChange={(event) =>
                            updateShop(shop.id, {
                              subscriptionPlan: event.target.value,
                            })
                          }
                          className="rounded-lg border px-2 py-1 text-sm"
                        >
                          {PLAN_OPTIONS.map((plan) => (
                            <option key={plan} value={plan}>
                              {plan}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="p-3">
                        <select
                          value={shop.subscriptionStatus || "ACTIVE"}
                          disabled={isSaving}
                          onChange={(event) =>
                            updateShop(shop.id, {
                              subscriptionStatus: event.target.value,
                            })
                          }
                          className="rounded-lg border px-2 py-1 text-sm"
                        >
                          {STATUS_OPTIONS.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>

                        <div className="mt-1 text-xs text-muted-foreground">
                          Period end: {formatDate(shop.subscriptionCurrentPeriodEnd)}
                        </div>
                      </td>

                      <td className="p-3">
                        <span
                          className={`rounded-full px-2 py-1 text-xs ${
                            isDeleted
                              ? "bg-red-100 text-red-700"
                              : "bg-green-100 text-green-700"
                          }`}
                        >
                          {isDeleted ? "Deleted" : "Active"}
                        </span>
                      </td>

                      <td className="p-3 text-muted-foreground">
                        {formatDate(shop.createdAt)}
                      </td>

                      <td className="p-3 text-right">
                        <button
                          disabled={isSaving}
                          onClick={() =>
                            updateShop(shop.id, {
                              isDeleted: !isDeleted,
                            })
                          }
                          className="button"
                        >
                          {isSaving
                            ? "Saving..."
                            : isDeleted
                              ? "Restore"
                              : "Disable"}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
