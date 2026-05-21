import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { exportCsv } from "../utils/exportCsv";

type PricingStatus = "ACTIVE" | "DRAFT" | "NEEDS_BACKEND_RULE";

type PricingControl = {
  area: string;
  control: string;
  description: string;
  current: string;
  route: string;
  status: PricingStatus;
};

const pricingControls: PricingControl[] = [
  {
    area: "Subscriptions",
    control: "Seller plan pricing",
    description: "Owner/shop monthly and yearly plan prices, feature gates, limits, and commission settings.",
    current: "Seller plans",
    route: "/super-admin/plans/seller",
    status: "ACTIVE",
  },
  {
    area: "Subscriptions",
    control: "Buyer plan pricing",
    description: "Buyer subscription tiers, billing intervals, plan benefits, and upgrade/downgrade controls.",
    current: "Buyer plans",
    route: "/super-admin/plans/buyer",
    status: "ACTIVE",
  },
  {
    area: "Subscriptions",
    control: "Buyer subscription state",
    description: "Per-buyer subscription status, renewal state, interval, and billing controls.",
    current: "Buyer subscriptions",
    route: "/super-admin/buyer-subscriptions",
    status: "ACTIVE",
  },
  {
    area: "Platform fees",
    control: "Commission rules",
    description: "Global platform commission, seller commission, and marketplace fee policies.",
    current: "Platform settings",
    route: "/super-admin/platform-settings",
    status: "ACTIVE",
  },
  {
    area: "Platform fees",
    control: "Buyer service fee",
    description: "Buyer-side service fee rules for checkout, offers, or paid marketplace services.",
    current: "Needs fee-rule backend",
    route: "/super-admin/platform-settings",
    status: "NEEDS_BACKEND_RULE",
  },
  {
    area: "Platform fees",
    control: "Seller service fee",
    description: "Seller-side service fee rules for listing, fulfillment, marketplace services, and owner tooling.",
    current: "Needs fee-rule backend",
    route: "/super-admin/platform-settings",
    status: "NEEDS_BACKEND_RULE",
  },
  {
    area: "Auctions",
    control: "Auction listing fee",
    description: "Optional fee to create, publish, or promote an auction listing.",
    current: "Needs fee-rule backend",
    route: "/super-admin/platform-settings",
    status: "NEEDS_BACKEND_RULE",
  },
  {
    area: "Auctions",
    control: "Auction success fee",
    description: "Optional platform fee applied when an auction closes successfully.",
    current: "Needs fee-rule backend",
    route: "/super-admin/platform-settings",
    status: "NEEDS_BACKEND_RULE",
  },
  {
    area: "Listings",
    control: "Featured listing / boost fee",
    description: "Price for promoted listings, featured placement, and future marketplace boosts.",
    current: "Needs fee-rule backend",
    route: "/super-admin/platform-settings",
    status: "NEEDS_BACKEND_RULE",
  },
  {
    area: "Integrations",
    control: "Bulk upload / connector fee",
    description: "Optional owner charge for inventory imports, API connectors, integrations, or premium automation.",
    current: "Needs fee-rule backend",
    route: "/super-admin/platform-settings",
    status: "NEEDS_BACKEND_RULE",
  },
  {
    area: "Settlements",
    control: "Payout / settlement fee",
    description: "Optional payout, settlement, reconciliation, refund, cancellation, or processing fee controls.",
    current: "Settlement control",
    route: "/super-admin/settlements",
    status: "ACTIVE",
  },
  {
    area: "Reporting",
    control: "Revenue and commission visibility",
    description: "Review what was collected, commission visibility, payout estimates, date filters, and exports.",
    current: "Revenue dashboard",
    route: "/super-admin/revenue",
    status: "ACTIVE",
  },
];

function statusLabel(status: PricingStatus) {
  if (status === "ACTIVE") return "Active control";
  if (status === "DRAFT") return "Draft";
  return "Needs backend rule";
}

function statusClass(status: PricingStatus) {
  if (status === "ACTIVE") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "DRAFT") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

export default function SuperAdminPricingPage() {
  const [query, setQuery] = useState("");
  const [areaFilter, setAreaFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const areas = useMemo(
    () => ["ALL", ...Array.from(new Set(pricingControls.map((item) => item.area)))],
    [],
  );

  const filteredControls = useMemo(() => {
    const q = query.trim().toLowerCase();

    return pricingControls.filter((item) => {
      const matchesQuery = !q || [
        item.area,
        item.control,
        item.description,
        item.current,
        item.status,
      ].join(" ").toLowerCase().includes(q);

      const matchesArea = areaFilter === "ALL" || item.area === areaFilter;
      const matchesStatus = statusFilter === "ALL" || item.status === statusFilter;

      return matchesQuery && matchesArea && matchesStatus;
    });
  }, [areaFilter, query, statusFilter]);

  const stats = useMemo(() => {
    return {
      total: pricingControls.length,
      active: pricingControls.filter((item) => item.status === "ACTIVE").length,
      needsBackend: pricingControls.filter((item) => item.status === "NEEDS_BACKEND_RULE").length,
      filtered: filteredControls.length,
    };
  }, [filteredControls.length]);

  function exportPricingControlCsv() {
    exportCsv(
      "super-admin-pricing-control.csv",
      filteredControls.map((item) => ({
        area: item.area,
        control: item.control,
        description: item.description,
        current: item.current,
        route: item.route,
        status: item.status,
      })),
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-background p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Super Admin Pricing
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              Pricing Control Center
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Central command center for every price, subscription, commission, service fee,
              auction fee, listing fee, payout fee, settlement fee, and platform-fee workflow
              across the application.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button className="button min-h-11" type="button" onClick={exportPricingControlCsv}>
              Export CSV
            </button>
            <Link className="button min-h-11" to="/super-admin/platform-settings">
              Platform Settings
            </Link>
            <Link className="button min-h-11" to="/super-admin/revenue">
              Revenue Dashboard
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border bg-background p-5 shadow-sm">
          <div className="text-sm text-muted-foreground">Total pricing areas</div>
          <div className="mt-2 text-2xl font-semibold">{stats.total}</div>
          <p className="mt-2 text-xs text-muted-foreground">Subscriptions, fees, commissions, payouts, and reporting.</p>
        </div>

        <div className="rounded-2xl border bg-background p-5 shadow-sm">
          <div className="text-sm text-muted-foreground">Active controls</div>
          <div className="mt-2 text-2xl font-semibold">{stats.active}</div>
          <p className="mt-2 text-xs text-muted-foreground">Already connected to existing Super Admin pages.</p>
        </div>

        <div className="rounded-2xl border bg-background p-5 shadow-sm">
          <div className="text-sm text-muted-foreground">Backend fee rules needed</div>
          <div className="mt-2 text-2xl font-semibold">{stats.needsBackend}</div>
          <p className="mt-2 text-xs text-muted-foreground">Global fee rules that need persistent backend support.</p>
        </div>

        <div className="rounded-2xl border bg-background p-5 shadow-sm">
          <div className="text-sm text-muted-foreground">Filtered results</div>
          <div className="mt-2 text-2xl font-semibold">{stats.filtered}</div>
          <p className="mt-2 text-xs text-muted-foreground">Currently visible pricing controls.</p>
        </div>
      </section>

      <section className="rounded-2xl border bg-background p-5 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[1fr_220px_220px]">
          <label className="grid gap-1 text-sm font-medium">
            Search pricing controls
            <input
              className="min-h-11 rounded-xl border bg-background px-3"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search subscription, commission, service fee, payout..."
            />
          </label>

          <label className="grid gap-1 text-sm font-medium">
            Area
            <select
              className="min-h-11 rounded-xl border bg-background px-3"
              value={areaFilter}
              onChange={(event) => setAreaFilter(event.target.value)}
            >
              {areas.map((area) => (
                <option key={area} value={area}>
                  {area === "ALL" ? "All areas" : area}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 text-sm font-medium">
            Status
            <select
              className="min-h-11 rounded-xl border bg-background px-3"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="ALL">All statuses</option>
              <option value="ACTIVE">Active control</option>
              <option value="NEEDS_BACKEND_RULE">Needs backend rule</option>
              <option value="DRAFT">Draft</option>
            </select>
          </label>
        </div>
      </section>

      <section className="grid gap-4">
        {filteredControls.map((item) => (
          <article key={`${item.area}-${item.control}`} className="rounded-2xl border bg-background p-5 shadow-sm">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border bg-muted/40 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {item.area}
                  </span>
                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(item.status)}`}>
                    {statusLabel(item.status)}
                  </span>
                </div>

                <h2 className="mt-3 text-lg font-semibold">{item.control}</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                  {item.description}
                </p>

                <p className="mt-3 text-sm">
                  <span className="font-semibold">Current control:</span>{" "}
                  <span className="text-muted-foreground">{item.current}</span>
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Link className="button min-h-11" to={item.route}>
                  Open control
                </Link>
                <Link className="button min-h-11" to="/super-admin/audit">
                  Audit history
                </Link>
              </div>
            </div>
          </article>
        ))}
      </section>

      <section className="rounded-2xl border bg-background p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Implementation plan</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
          <li>Keep subscription plan prices under Seller Plan Control and Buyer Plan Control.</li>
          <li>Keep revenue reporting under Revenue Dashboard.</li>
          <li>Keep settlement reconciliation under Settlement Control.</li>
          <li>Add a backend fee-rule model next for buyer service fees, seller service fees, auction fees, listing boosts, payout fees, caps, effective dates, and Stripe price IDs.</li>
          <li>Every price change should write to Audit Logs before production launch.</li>
        </ul>
      </section>
    </div>
  );
}
