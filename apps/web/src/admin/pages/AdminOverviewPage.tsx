import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AdminPageShell from "../components/AdminPageShell";
import { adminApi } from "../services/adminApi";

type AnyRow = Record<string, unknown>;

type DashboardState = {
  overview: {
    usersCount?: number;
    ownersCount?: number;
    consumersCount?: number;
    adminsCount?: number;
    itemsCount?: number;
    shopsCount?: number;
    liveAuctionsCount?: number;
    endedAuctionsCount?: number;
    canceledAuctionsCount?: number;
    offersCount?: number;
    pendingOffersCount?: number;
    acceptedOffersCount?: number;
    counteredOffersCount?: number;
  } | null;
  users: AnyRow[];
  items: AnyRow[];
  shops: AnyRow[];
  auctions: AnyRow[];
  offers: AnyRow[];
  settlements: AnyRow[];
  errors: string[];
};

const EMPTY_STATE: DashboardState = {
  overview: null,
  users: [],
  items: [],
  shops: [],
  auctions: [],
  offers: [],
  settlements: [],
  errors: [],
};

function asRows<T>(value: T[] | unknown): AnyRow[] {
  return Array.isArray(value) ? (value as AnyRow[]) : [];
}

function getString(row: AnyRow, key: string, fallback = "—") {
  const value = row[key];
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function getNestedString(row: AnyRow, key: string, nestedKey: string, fallback = "—") {
  const nested = row[key];
  if (!nested || typeof nested !== "object") return fallback;
  const value = (nested as AnyRow)[nestedKey];
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function getStatus(row: AnyRow) {
  return getString(row, "status", getString(row, "subscriptionStatus", "UNKNOWN"));
}

function isDeleted(row: AnyRow) {
  return Boolean(row.isDeleted);
}

function isInactiveUser(row: AnyRow) {
  return row.isActive === false || row.isBlocked === true;
}

function statusBadgeClass(value?: string | null) {
  const normalized = String(value || "").toUpperCase();

  if (["ACTIVE", "AVAILABLE", "LIVE", "ACCEPTED", "COMPLETED", "CHARGED"].includes(normalized)) {
    return "bg-green-100 text-green-700";
  }

  if (["FAILED", "CANCELED", "DELETED", "BLOCKED", "INACTIVE", "PAST_DUE"].includes(normalized)) {
    return "bg-red-100 text-red-700";
  }

  if (["PENDING", "COUNTERED", "TRIALING", "PAUSED"].includes(normalized)) {
    return "bg-yellow-100 text-yellow-700";
  }

  return "bg-muted text-muted-foreground";
}

function formatDate(value: unknown) {
  if (!value) return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

function formatMoney(value: unknown, currency = "USD") {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";

  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(number);
}

function ResultBadge({ value }: { value: string }) {
  return (
    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusBadgeClass(value)}`}>
      {value}
    </span>
  );
}

function MetricCard({
  label,
  value,
  helper,
  to,
}: {
  label: string;
  value: string | number;
  helper: string;
  to?: string;
}) {
  const content = (
    <div className="rounded-2xl border bg-background p-4 shadow-sm transition hover:shadow-md">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="mt-1 text-sm font-medium">{label}</div>
      <div className="mt-1 text-xs text-muted-foreground">{helper}</div>
    </div>
  );

  if (!to) return content;

  return (
    <Link to={to} className="block text-inherit no-underline">
      {content}
    </Link>
  );
}

function QueueCard({
  title,
  value,
  description,
  to,
  tone = "neutral",
}: {
  title: string;
  value: string | number;
  description: string;
  to: string;
  tone?: "neutral" | "warning" | "danger" | "success";
}) {
  const toneClass =
    tone === "danger"
      ? "border-red-200 bg-red-50"
      : tone === "warning"
        ? "border-yellow-200 bg-yellow-50"
        : tone === "success"
          ? "border-green-200 bg-green-50"
          : "border-border bg-background";

  return (
    <Link
      to={to}
      className={`block rounded-2xl border p-4 text-inherit no-underline shadow-sm transition hover:shadow-md ${toneClass}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold">{title}</div>
          <div className="mt-1 text-xs text-muted-foreground">{description}</div>
        </div>
        <div className="text-xl font-semibold">{value}</div>
      </div>
    </Link>
  );
}

function MiniTable({
  title,
  rows,
  empty,
  columns,
  to,
}: {
  title: string;
  rows: AnyRow[];
  empty: string;
  to: string;
  columns: Array<{
    key: string;
    label: string;
    render: (row: AnyRow) => React.ReactNode;
  }>;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border bg-background shadow-sm">
      <div className="flex items-center justify-between border-b bg-muted/40 p-3">
        <h3 className="font-semibold">{title}</h3>
        <Link to={to} className="text-sm font-medium">
          View all
        </Link>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] border-collapse text-sm">
          <thead>
            <tr className="border-b text-left">
              {columns.map((column) => (
                <th key={column.key} className="p-3 font-medium">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="p-4 text-center text-muted-foreground">
                  {empty}
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={String(row.id || index)} className="border-b last:border-b-0">
                  {columns.map((column) => (
                    <td key={column.key} className="p-3 align-top">
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function AdminOverviewPage() {
  const [state, setState] = useState<DashboardState>(EMPTY_STATE);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);

    const errors: string[] = [];

    const [
      overviewResult,
      usersResult,
      itemsResult,
      shopsResult,
      auctionsResult,
      offersResult,
      settlementsResult,
    ] = await Promise.allSettled([
      adminApi.getOverview(),
      adminApi.getUsers(),
      adminApi.getItems(),
      adminApi.getShops(),
      adminApi.getAuctions("ALL"),
      adminApi.getOffers(),
      adminApi.getSettlements(),
    ]);

    function read<T>(result: PromiseSettledResult<T>, fallback: T, label: string): T {
      if (result.status === "fulfilled") return result.value;
      errors.push(`${label}: ${result.reason instanceof Error ? result.reason.message : "Unable to load"}`);
      return fallback;
    }

    setState({
      overview: read(overviewResult, null, "Overview"),
      users: asRows(read(usersResult, [], "Users")),
      items: asRows(read(itemsResult, [], "Inventory")),
      shops: asRows(read(shopsResult, [], "Shops")),
      auctions: asRows(read(auctionsResult, [], "Auctions")),
      offers: asRows(read(offersResult, [], "Offers")),
      settlements: asRows(read(settlementsResult, [], "Settlements")),
      errors,
    });

    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const derived = useMemo(() => {
    const deletedItems = state.items.filter(isDeleted);
    const inactiveUsers = state.users.filter(isInactiveUser);
    const deletedShops = state.shops.filter(isDeleted);
    const liveAuctions = state.auctions.filter((row) => getStatus(row).toUpperCase() === "LIVE");
    const pendingOffers = state.offers.filter((row) => getStatus(row).toUpperCase() === "PENDING");
    const failedSettlements = state.settlements.filter((row) =>
      ["FAILED", "PAST_DUE", "CANCELED"].includes(getStatus(row).toUpperCase()),
    );

    return {
      deletedItems,
      inactiveUsers,
      deletedShops,
      liveAuctions,
      pendingOffers,
      failedSettlements,
      recentUsers: state.users.slice(0, 6),
      recentShops: state.shops.slice(0, 6),
      recentItems: state.items.slice(0, 6),
      recentAuctions: state.auctions.slice(0, 6),
      recentSettlements: state.settlements.slice(0, 6),
    };
  }, [state]);

  const overview = state.overview || {};

  return (
    <AdminPageShell
      title="Admin Command Center"
      subtitle="Daily marketplace operations for users, shops, inventory, auctions, offers, settlements, and support workflows."
      actions={
        <button className="btn btn-secondary" onClick={() => void load()} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      }
    >
      {state.errors.length ? (
        <div className="mb-4 rounded-2xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
          <div className="font-semibold">Some admin panels could not load.</div>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {state.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard label="Users" value={overview.usersCount ?? state.users.length} helper="All platform accounts" to="/admin/users" />
        <MetricCard label="Owners" value={overview.ownersCount ?? 0} helper="Shop owner accounts" to="/admin/owners" />
        <MetricCard label="Shops" value={overview.shopsCount ?? state.shops.length} helper="Marketplace shops" to="/admin/shops" />
        <MetricCard label="Inventory" value={overview.itemsCount ?? state.items.length} helper="Marketplace listings" to="/admin/inventory" />
        <MetricCard label="Live Auctions" value={overview.liveAuctionsCount ?? derived.liveAuctions.length} helper="Currently active auctions" to="/admin/auctions" />
        <MetricCard label="Pending Offers" value={overview.pendingOffersCount ?? derived.pendingOffers.length} helper="Offers requiring attention" to="/admin/offers" />
        <MetricCard label="Settlements" value={state.settlements.length} helper="Payment/settlement records" to="/admin/orders" />
        <MetricCard label="Subscriptions" value={state.shops.length} helper="Shop subscription oversight" to="/admin/subscriptions" />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <QueueCard
          title="Inventory Moderation"
          value={derived.deletedItems.length}
          description="Deleted or moderated marketplace listings."
          to="/admin/inventory"
          tone={derived.deletedItems.length ? "warning" : "success"}
        />
        <QueueCard
          title="User Review"
          value={derived.inactiveUsers.length}
          description="Inactive or blocked user accounts."
          to="/admin/users"
          tone={derived.inactiveUsers.length ? "warning" : "success"}
        />
        <QueueCard
          title="Shop Review"
          value={derived.deletedShops.length}
          description="Disabled or archived shop records."
          to="/admin/shops"
          tone={derived.deletedShops.length ? "warning" : "success"}
        />
        <QueueCard
          title="Offer Queue"
          value={derived.pendingOffers.length}
          description="Pending offers across the marketplace."
          to="/admin/offers"
          tone={derived.pendingOffers.length ? "warning" : "success"}
        />
        <QueueCard
          title="Payment Issues"
          value={derived.failedSettlements.length}
          description="Failed or canceled settlement records."
          to="/admin/orders"
          tone={derived.failedSettlements.length ? "danger" : "success"}
        />
        <QueueCard
          title="Risk & Support"
          value="Open"
          description="Operational queue for disputes, risk review, and support."
          to="/admin/risk"
        />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <Link className="btn btn-secondary" to="/admin/users">Manage Users</Link>
        <Link className="btn btn-secondary" to="/admin/owners">Review Owners</Link>
        <Link className="btn btn-secondary" to="/admin/shops">Manage Shops</Link>
        <Link className="btn btn-secondary" to="/admin/inventory">Moderate Inventory</Link>
        <Link className="btn btn-secondary" to="/admin/auctions">Review Auctions</Link>
        <Link className="btn btn-secondary" to="/admin/offers">Manage Offers</Link>
        <Link className="btn btn-secondary" to="/admin/orders">Settlement Queue</Link>
        <Link className="btn btn-secondary" to="/admin/subscriptions">Subscriptions</Link>
        <Link className="btn btn-secondary" to="/admin/support">Support Center</Link>
        <Link className="btn btn-secondary" to="/admin/risk">Risk Center</Link>
        <Link className="btn btn-secondary" to="/admin/audit">Audit Review</Link>
        <Link className="btn btn-secondary" to="/admin/system">System Status</Link>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <MiniTable
          title="Recent Users"
          rows={derived.recentUsers}
          empty="No users found."
          to="/admin/users"
          columns={[
            {
              key: "user",
              label: "User",
              render: (row) => (
                <div>
                  <div className="font-medium">{getString(row, "email")}</div>
                  <div className="text-xs text-muted-foreground">{getString(row, "name", "Unnamed user")}</div>
                </div>
              ),
            },
            { key: "role", label: "Role", render: (row) => <ResultBadge value={getString(row, "role", "UNKNOWN")} /> },
            {
              key: "status",
              label: "Status",
              render: (row) => <ResultBadge value={isInactiveUser(row) ? "INACTIVE" : "ACTIVE"} />,
            },
            { key: "created", label: "Created", render: (row) => formatDate(row.createdAt) },
          ]}
        />

        <MiniTable
          title="Recent Shops"
          rows={derived.recentShops}
          empty="No shops found."
          to="/admin/shops"
          columns={[
            {
              key: "shop",
              label: "Shop",
              render: (row) => (
                <div>
                  <div className="font-medium">{getString(row, "name")}</div>
                  <div className="text-xs text-muted-foreground">{getString(row, "ownerEmail")}</div>
                </div>
              ),
            },
            { key: "phone", label: "Phone", render: (row) => getString(row, "phone") },
            { key: "status", label: "Status", render: (row) => <ResultBadge value={isDeleted(row) ? "DELETED" : "ACTIVE"} /> },
            { key: "created", label: "Created", render: (row) => formatDate(row.createdAt) },
          ]}
        />

        <MiniTable
          title="Recent Inventory"
          rows={derived.recentItems}
          empty="No inventory found."
          to="/admin/inventory"
          columns={[
            {
              key: "item",
              label: "Item",
              render: (row) => (
                <div>
                  <div className="font-medium">{getString(row, "title")}</div>
                  <div className="text-xs text-muted-foreground">
                    {getNestedString(row, "shop", "name", "Unknown shop")}
                  </div>
                </div>
              ),
            },
            { key: "price", label: "Price", render: (row) => formatMoney(row.price, getString(row, "currency", "USD")) },
            { key: "status", label: "Status", render: (row) => <ResultBadge value={isDeleted(row) ? "DELETED" : getStatus(row)} /> },
            { key: "created", label: "Created", render: (row) => formatDate(row.createdAt) },
          ]}
        />

        <MiniTable
          title="Recent Auctions"
          rows={derived.recentAuctions}
          empty="No auctions found."
          to="/admin/auctions"
          columns={[
            { key: "auction", label: "Auction", render: (row) => getString(row, "title", getString(row, "id")) },
            { key: "status", label: "Status", render: (row) => <ResultBadge value={getStatus(row)} /> },
            { key: "currentBid", label: "Current", render: (row) => formatMoney(row.currentBidCents ? Number(row.currentBidCents) / 100 : row.currentBid) },
            { key: "created", label: "Created", render: (row) => formatDate(row.createdAt) },
          ]}
        />

        <MiniTable
          title="Recent Settlements"
          rows={derived.recentSettlements}
          empty="No settlement records found."
          to="/admin/orders"
          columns={[
            { key: "id", label: "Settlement", render: (row) => getString(row, "id") },
            { key: "status", label: "Status", render: (row) => <ResultBadge value={getStatus(row)} /> },
            { key: "amount", label: "Amount", render: (row) => formatMoney(row.amountCents ? Number(row.amountCents) / 100 : row.amount) },
            { key: "created", label: "Created", render: (row) => formatDate(row.createdAt) },
          ]}
        />

        <section className="rounded-2xl border bg-background p-4 shadow-sm">
          <h3 className="font-semibold">Operational Notes</h3>
          <div className="mt-3 grid gap-3 text-sm text-muted-foreground">
            <p>
              Admin handles day-to-day marketplace operations. Super Admin handles platform governance,
              settings, system health, and sensitive ownership controls.
            </p>
            <p>
              Next recommended admin additions: risk queue, support queue, limited audit review, and
              settlement issue triage.
            </p>
          </div>
        </section>
      </div>
    </AdminPageShell>
  );
}
