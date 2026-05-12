import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import AdminPageShell from "../components/AdminPageShell";
import { adminApi, type AdminSettlementRow } from "../services/adminApi";
import {
  compareValues,
  downloadCsv,
  formatDate,
  formatMoney,
  includesSearch,
  type SortDirection,
} from "../utils/adminControlUtils";

type StatusFilter = "ALL" | "PENDING" | "CHARGED" | "FAILED" | "CANCELED";
type ModalMode = "view" | "edit";

type SettlementFormState = {
  id: string;
  status: string;
  currency: string;
  finalAmountCents: string;
  stripePaymentIntent: string;
};

const EMPTY_FORM: SettlementFormState = {
  id: "",
  status: "PENDING",
  currency: "USD",
  finalAmountCents: "",
  stripePaymentIntent: "",
};

const SETTLEMENT_STATUS_OPTIONS = ["PENDING", "CHARGED", "FAILED", "CANCELED"];


function getSettlementStatus(row: AdminSettlementRow) {
  return String(row.status || "UNKNOWN").toUpperCase();
}

function badgeClass(status: string) {
  if (["CHARGED", "COMPLETED", "PAID"].includes(status)) return "badge badge-success";
  if (["FAILED", "CANCELED"].includes(status)) return "badge badge-danger";
  if (["PENDING"].includes(status)) return "badge badge-warning";
  return "badge";
}

function getSettlementTitle(row: AdminSettlementRow) {
  return row.auction?.item?.title || row.auctionId || row.id;
}

function getFinalAmountCents(row: AdminSettlementRow) {
  if (typeof row.finalAmountCents === "number") return String(row.finalAmountCents);
  const price = Number(row.finalPrice);
  if (Number.isFinite(price)) return String(Math.round(price * 100));
  return "";
}

function buildForm(row: AdminSettlementRow): SettlementFormState {
  return {
    id: row.id,
    status: getSettlementStatus(row),
    currency: String(row.currency || "USD").toUpperCase(),
    finalAmountCents: getFinalAmountCents(row),
    stripePaymentIntent: row.stripePaymentIntent || "",
  };
}

export default function SuperAdminSettlementsPage() {
  const [rows, setRows] = useState<AdminSettlementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [sortKey, setSortKey] = useState<keyof AdminSettlementRow>("updatedAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [modalMode, setModalMode] = useState<ModalMode | null>(null);
  const [selected, setSelected] = useState<AdminSettlementRow | null>(null);
  const [form, setForm] = useState<SettlementFormState>(EMPTY_FORM);

  async function load() {
    setLoading(true);
    setError("");

    try {
      const result = await adminApi.getSuperAdminSettlementsPaged({ limit: 200 });
      setRows(result.rows);
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : "Failed to load settlements.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filteredRows = useMemo(() => {
    return rows
      .filter((row) =>
        includesSearch(row as Record<string, unknown>, query, [
          "id",
          "auctionId",
          "winnerName",
          "winnerEmail",
          "winnerUserId",
          "status",
          "stripePaymentIntent",
        ]) ||
        String(row.auction?.item?.title || "").toLowerCase().includes(query.trim().toLowerCase()) ||
        String(row.auction?.shop?.name || "").toLowerCase().includes(query.trim().toLowerCase()),
      )
      .filter((row) => statusFilter === "ALL" || getSettlementStatus(row) === statusFilter)
      .sort((a, b) => compareValues(a[sortKey], b[sortKey], sortDirection));
  }, [query, rows, sortDirection, sortKey, statusFilter]);

  function openModal(row: AdminSettlementRow, mode: ModalMode) {
    setSelected(row);
    setModalMode(mode);
    setForm(buildForm(row));
    setNotice("");
    setError("");
  }

  function closeModal() {
    if (busyId) return;
    setSelected(null);
    setModalMode(null);
    setForm(EMPTY_FORM);
  }

  function updateForm<K extends keyof SettlementFormState>(key: K, value: SettlementFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function updateSettlementStatus(row: AdminSettlementRow, status: string) {
    const confirmed = window.confirm(`Update settlement ${row.id} to ${status}?`);
    if (!confirmed) return;

    setBusyId(row.id);
    setError("");
    setNotice("");

    try {
      const response = await adminApi.updateSuperAdminSettlement(row.id, { status });

      setRows((current) =>
        current.map((entry) => (entry.id === response.settlement.id ? response.settlement : entry)),
      );

      setNotice(`Settlement updated to ${status}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update settlement.");
    } finally {
      setBusyId("");
    }
  }

  async function submitSettlementForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;

    setBusyId(selected.id);
    setError("");
    setNotice("");

    try {
      const finalAmountCents =
        form.finalAmountCents.trim() === "" ? undefined : Number(form.finalAmountCents);

      if (finalAmountCents !== undefined && (!Number.isFinite(finalAmountCents) || finalAmountCents < 0)) {
        throw new Error("Final amount cents must be a valid non-negative number.");
      }

      const response = await adminApi.updateSuperAdminSettlement(selected.id, {
        status: form.status,
        currency: form.currency,
        ...(finalAmountCents !== undefined ? { finalAmountCents } : {}),
        stripePaymentIntent: form.stripePaymentIntent.trim() || null,
      });

      setRows((current) =>
        current.map((entry) => (entry.id === response.settlement.id ? response.settlement : entry)),
      );

      setNotice("Settlement updated.");
      closeModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settlement.");
    } finally {
      setBusyId("");
    }
  }

  function exportRows() {
    downloadCsv(
      "super-admin-settlements.csv",
      filteredRows.map((row) => ({
        id: row.id,
        auctionId: row.auctionId,
        item: getSettlementTitle(row),
        winnerName: row.winnerName,
        winnerEmail: row.winnerEmail,
        status: row.status,
        finalPrice: row.finalPrice,
        finalAmountCents: row.finalAmountCents,
        currency: row.currency,
        stripePaymentIntent: row.stripePaymentIntent,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
    );
  }

  return (
    <AdminPageShell
      title="Settlement Control"
      subtitle="Search, review, reconcile, and govern settlement/payment handoff records."
      actions={
        <div className="admin-action-row">
          <button className="btn btn-secondary" onClick={exportRows}>Export CSV</button>
          <button className="btn btn-secondary" onClick={() => void load()} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      }
    >
      <section className="super-admin-control-panel">
        <div className="super-admin-control-header">
          <div>
            <div className="super-admin-control-kicker">Super Admin Controls</div>
            <h2 className="super-admin-control-title">Settlement Control Center</h2>
            <p className="super-admin-control-subtitle">
              Search settlements, review payment state, reconcile charged records,
              update Stripe references, export records, and jump to audit history.
            </p>
          </div>
          <div className="super-admin-control-actions">
            <button className="btn btn-secondary" onClick={exportRows}>Export CSV</button>
            <button className="btn btn-secondary" onClick={() => void load()} disabled={loading}>Refresh</button>
            <Link className="btn btn-secondary" to="/super-admin/revenue">Revenue</Link>
            <Link className="btn btn-secondary" to="/super-admin/audit">Audit Logs</Link>
          </div>
        </div>

        <ul className="super-admin-control-list">
          <li>Use Review to inspect details before changing a settlement record.</li>
          <li>Use Reconcile / Mark Charged only when the payment handoff is verified.</li>
          <li>Use Edit to update status, currency, amount, or Stripe PaymentIntent references.</li>
        </ul>
      </section>

      <div className="admin-control-bar">
        <input
          className="admin-control-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search settlements by id, winner, item, auction, payment intent, or status..."
        />

        <select
          className="admin-control-select"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
        >
          <option value="ALL">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="CHARGED">Charged</option>
          <option value="FAILED">Failed</option>
          <option value="CANCELED">Canceled</option>
        </select>

        <select
          className="admin-control-select"
          value={String(sortKey)}
          onChange={(event) => setSortKey(event.target.value as keyof AdminSettlementRow)}
        >
          <option value="updatedAt">Sort by updated</option>
          <option value="createdAt">Sort by created</option>
          <option value="status">Sort by status</option>
          <option value="finalPrice">Sort by amount</option>
        </select>

        <select
          className="admin-control-select"
          value={sortDirection}
          onChange={(event) => setSortDirection(event.target.value as SortDirection)}
        >
          <option value="desc">Descending</option>
          <option value="asc">Ascending</option>
        </select>
      </div>

      {notice ? <div className="admin-notice success">{notice}</div> : null}
      {error ? <div className="admin-notice danger">{error}</div> : null}

      <div className="admin-table-card">
        <div className="admin-table-meta">
          Showing {filteredRows.length} of {rows.length} settlements
        </div>

        <div className="admin-table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Settlement</th>
                <th>Winner</th>
                <th>Amount</th>
                <th>Status</th>
                <th>PaymentIntent</th>
                <th>Updated</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr><td colSpan={7}>Loading settlements...</td></tr>
              ) : filteredRows.length === 0 ? (
                <tr><td colSpan={7}>No settlements match your filters.</td></tr>
              ) : (
                filteredRows.map((row) => {
                  const status = getSettlementStatus(row);

                  return (
                    <tr key={row.id}>
                      <td>
                        <strong>{getSettlementTitle(row)}</strong>
                        <div className="admin-muted">Auction: {row.auctionId || "—"}</div>
                        <div className="admin-muted small">{row.id}</div>
                      </td>
                      <td>
                        <strong>{row.winnerEmail || "Unknown winner"}</strong>
                        <div className="admin-muted">{row.winnerName || row.winnerUserId || "—"}</div>
                      </td>
                      <td>{formatMoney(row.finalPrice, row.currency || "USD")}</td>
                      <td><span className={badgeClass(status)}>{status}</span></td>
                      <td>{row.stripePaymentIntent || "—"}</td>
                      <td>{formatDate(row.updatedAt || row.createdAt)}</td>
                      <td style={{ textAlign: "right" }}>
                        <div className="super-admin-row-actions">
                          <button className="btn btn-secondary" onClick={() => openModal(row, "view")}>Review</button>
                          <button className="btn btn-secondary" onClick={() => openModal(row, "edit")}>Edit</button>
                          <button
                            className="btn btn-secondary"
                            disabled={busyId === row.id || status === "CHARGED"}
                            onClick={() => void updateSettlementStatus(row, "CHARGED")}
                          >
                            Reconcile
                          </button>
                          <button
                            className="btn btn-secondary"
                            disabled={busyId === row.id || status === "PENDING"}
                            onClick={() => void updateSettlementStatus(row, "PENDING")}
                          >
                            Mark Pending
                          </button>
                          <Link className="btn btn-secondary" to={`/super-admin/audit?targetType=SETTLEMENT&targetId=${row.id}`}>
                            Audit
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selected && modalMode ? (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true">
          {modalMode === "view" ? (
            <section className="admin-modal-card">
              <div className="admin-modal-header">
                <div>
                  <h2 className="admin-modal-title">Settlement Review</h2>
                  <p className="admin-modal-subtitle">{selected.id}</p>
                </div>
                <button className="btn btn-secondary" onClick={closeModal}>Close</button>
              </div>

              <div className="stack">
                {Object.entries(selected as Record<string, unknown>).map(([key, value]) => (
                  <div key={key} className="panel" style={{ padding: 12 }}>
                    <strong>{key}</strong>
                    <div className="admin-muted" style={{ wordBreak: "break-word" }}>
                      {typeof value === "object" ? JSON.stringify(value, null, 2) : String(value ?? "—")}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : (
            <form className="admin-modal-card" onSubmit={submitSettlementForm}>
              <div className="admin-modal-header">
                <div>
                  <h2 className="admin-modal-title">Edit Settlement</h2>
                  <p className="admin-modal-subtitle">{selected.id}</p>
                </div>
                <button type="button" className="btn btn-secondary" onClick={closeModal}>Close</button>
              </div>

              <div className="admin-form-grid">
                <label className="admin-form-label">
                  Status
                  <select
                    className="admin-control-select"
                    value={form.status}
                    onChange={(event) => updateForm("status", event.target.value)}
                  >
                    {SETTLEMENT_STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </label>

                <label className="admin-form-label">
                  Currency
                  <input
                    className="admin-control-input"
                    value={form.currency}
                    onChange={(event) => updateForm("currency", event.target.value)}
                    maxLength={3}
                  />
                </label>

                <label className="admin-form-label">
                  Final amount cents
                  <input
                    className="admin-control-input"
                    value={form.finalAmountCents}
                    onChange={(event) => updateForm("finalAmountCents", event.target.value)}
                    type="number"
                    min={0}
                  />
                </label>

                <label className="admin-form-label">
                  Stripe PaymentIntent
                  <input
                    className="admin-control-input"
                    value={form.stripePaymentIntent}
                    onChange={(event) => updateForm("stripePaymentIntent", event.target.value)}
                    placeholder="pi_..."
                  />
                </label>
              </div>

              <div className="admin-modal-footer">
                <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={busyId === selected.id}>
                  {busyId === selected.id ? "Saving..." : "Save Settlement"}
                </button>
              </div>
            </form>
          )}
        </div>
      ) : null}
    </AdminPageShell>
  );
}
