import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Link } from "react-router-dom";
import {
  getOwnerFinanceBalance,
  getOwnerFinanceLedger,
  getOwnerFinancePayouts,
  getOwnerFinanceShops,
  type FinancePagination,
  type OwnerFinanceBalance,
  type OwnerFinanceLedgerEntry,
  type OwnerFinancePayout,
  type OwnerFinanceShop,
} from "../services/ownerFinance";
import "../styles/owner-finance-readability.css";

const EMPTY_PAGINATION: FinancePagination = {
  page: 1,
  limit: 25,
  total: 0,
  totalPages: 0,
};

const LEDGER_TYPES = [
  "",
  "SETTLEMENT_CREDIT",
  "PAYOUT_DEBIT",
  "REFUND_DEBIT",
  "REVERSAL_CREDIT",
  "ADJUSTMENT_CREDIT",
  "ADJUSTMENT_DEBIT",
];

const LEDGER_STATUSES = [
  "",
  "PENDING",
  "AVAILABLE",
  "HELD",
  "PAID",
  "REVERSED",
];

const PAYOUT_STATUSES = [
  "",
  "PENDING",
  "PROCESSING",
  "PAID",
  "FAILED",
  "CANCELED",
];

function formatMoney(
  cents: number | null | undefined,
  currency = "USD",
) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(Number(cents || 0) / 100);
}

function formatDate(value?: string | null) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function formatLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map(
      (part) =>
        part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join(" ");
}

function getErrorMessage(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "response" in error
  ) {
    const response = (
      error as {
        response?: {
          data?: {
            error?: string;
            message?: string;
          };
        };
      }
    ).response;

    return (
      response?.data?.error ||
      response?.data?.message ||
      "Failed to load finance information."
    );
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Failed to load finance information.";
}

export default function OwnerFinancePage() {
  const [shops, setShops] = useState<OwnerFinanceShop[]>(
    [],
  );

  const [selectedShopId, setSelectedShopId] =
    useState("");

  const [balance, setBalance] =
    useState<OwnerFinanceBalance | null>(null);

  const [ledgerRows, setLedgerRows] = useState<
    OwnerFinanceLedgerEntry[]
  >([]);

  const [payoutRows, setPayoutRows] = useState<
    OwnerFinancePayout[]
  >([]);

  const [ledgerPagination, setLedgerPagination] =
    useState<FinancePagination>(EMPTY_PAGINATION);

  const [payoutPagination, setPayoutPagination] =
    useState<FinancePagination>(EMPTY_PAGINATION);

  const [ledgerType, setLedgerType] = useState("");
  const [ledgerStatus, setLedgerStatus] = useState("");
  const [payoutStatus, setPayoutStatus] = useState("");

  const [loadingShops, setLoadingShops] = useState(true);
  const [loadingFinance, setLoadingFinance] =
    useState(false);

  const [error, setError] = useState("");
  const [activeSection, setActiveSection] = useState<
    "ledger" | "payouts"
  >("ledger");

  const selectedShop = useMemo(
    () =>
      shops.find(
        (shop) => shop.id === selectedShopId,
      ) || null,
    [selectedShopId, shops],
  );

  const loadShops = useCallback(async () => {
    setLoadingShops(true);
    setError("");

    try {
      const rows = await getOwnerFinanceShops();

      setShops(rows);

      if (rows.length > 0) {
        setSelectedShopId((current) =>
          rows.some((shop) => shop.id === current)
            ? current
            : rows[0].id,
        );
      }
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoadingShops(false);
    }
  }, []);

  const loadFinance = useCallback(async () => {
    if (!selectedShopId) {
      return;
    }

    setLoadingFinance(true);
    setError("");

    try {
      const [
        balanceResponse,
        ledgerResponse,
        payoutResponse,
      ] = await Promise.all([
        getOwnerFinanceBalance(selectedShopId),

        getOwnerFinanceLedger(selectedShopId, {
          page: ledgerPagination.page,
          limit: ledgerPagination.limit,
          type: ledgerType || undefined,
          status: ledgerStatus || undefined,
        }),

        getOwnerFinancePayouts(selectedShopId, {
          page: payoutPagination.page,
          limit: payoutPagination.limit,
          status: payoutStatus || undefined,
        }),
      ]);

      setBalance(balanceResponse.balance);
      setLedgerRows(ledgerResponse.rows);
      setLedgerPagination(ledgerResponse.pagination);
      setPayoutRows(payoutResponse.rows);
      setPayoutPagination(payoutResponse.pagination);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoadingFinance(false);
    }
  }, [
    ledgerPagination.limit,
    ledgerPagination.page,
    ledgerStatus,
    ledgerType,
    payoutPagination.limit,
    payoutPagination.page,
    payoutStatus,
    selectedShopId,
  ]);

  useEffect(() => {
    void loadShops();
  }, [loadShops]);

  useEffect(() => {
    void loadFinance();
  }, [loadFinance]);

  function resetLedgerPage() {
    setLedgerPagination((current) => ({
      ...current,
      page: 1,
    }));
  }

  function resetPayoutPage() {
    setPayoutPagination((current) => ({
      ...current,
      page: 1,
    }));
  }

  return (
    <main className="owner-finance-page">
      <section className="owner-finance-hero">
        <div>
          <p className="owner-finance-eyebrow">
            Owner workspace
          </p>

          <h1>Finance dashboard</h1>

          <p>
            Review balances, seller ledger activity, and
            payout history for each shop.
          </p>
        </div>

        <div className="owner-finance-hero-actions">
          <Link
            className="owner-finance-secondary-button"
            to="/owner"
          >
            Back to owner dashboard
          </Link>

          <button
            className="owner-finance-primary-button"
            type="button"
            onClick={() => void loadFinance()}
            disabled={
              loadingFinance || !selectedShopId
            }
          >
            {loadingFinance
              ? "Refreshing…"
              : "Refresh finance"}
          </button>
        </div>
      </section>

      <section className="owner-finance-toolbar">
        <label>
          Shop
          <select
            value={selectedShopId}
            onChange={(event) => {
              setSelectedShopId(event.target.value);

              setLedgerPagination(
                EMPTY_PAGINATION,
              );

              setPayoutPagination(
                EMPTY_PAGINATION,
              );
            }}
            disabled={loadingShops}
          >
            {shops.length === 0 ? (
              <option value="">
                No shops available
              </option>
            ) : null}

            {shops.map((shop) => (
              <option
                key={shop.id}
                value={shop.id}
              >
                {shop.name}
              </option>
            ))}
          </select>
        </label>

        <div className="owner-finance-shop-summary">
          <strong>
            {selectedShop?.name || "Select a shop"}
          </strong>

          <span>
            {selectedShop
              ? [
                  selectedShop.address,
                  selectedShop.city,
                  selectedShop.state,
                ]
                  .filter(Boolean)
                  .join(", ") || "Shop finance account"
              : "Choose a shop to load finance information."}
          </span>
        </div>
      </section>

      {error ? (
        <div
          className="owner-finance-alert"
          role="alert"
        >
          <strong>Finance data could not be loaded.</strong>
          <span>{error}</span>
        </div>
      ) : null}

      <section
        className="owner-finance-balance-grid"
        aria-label="Finance balances"
      >
        <article>
          <span>Available</span>
          <strong>
            {formatMoney(
              balance?.availableCents,
              balance?.currency,
            )}
          </strong>
          <small>Eligible for future payout</small>
        </article>

        <article>
          <span>Pending</span>
          <strong>
            {formatMoney(
              balance?.pendingCents,
              balance?.currency,
            )}
          </strong>
          <small>Awaiting availability</small>
        </article>

        <article>
          <span>Held</span>
          <strong>
            {formatMoney(
              balance?.heldCents,
              balance?.currency,
            )}
          </strong>
          <small>Temporarily unavailable</small>
        </article>

        <article>
          <span>Paid</span>
          <strong>
            {formatMoney(
              balance?.paidCents,
              balance?.currency,
            )}
          </strong>
          <small>Recorded as paid</small>
        </article>

        <article>
          <span>Total ledger</span>
          <strong>
            {formatMoney(
              balance?.totalCents,
              balance?.currency,
            )}
          </strong>
          <small>
            {balance?.entryCount || 0} ledger entries
          </small>
        </article>
      </section>

      <section className="owner-finance-panel">
        <div className="owner-finance-tabs">
          <button
            type="button"
            className={
              activeSection === "ledger"
                ? "is-active"
                : ""
            }
            onClick={() =>
              setActiveSection("ledger")
            }
          >
            Ledger activity
          </button>

          <button
            type="button"
            className={
              activeSection === "payouts"
                ? "is-active"
                : ""
            }
            onClick={() =>
              setActiveSection("payouts")
            }
          >
            Payout history
          </button>
        </div>

        {activeSection === "ledger" ? (
          <>
            <div className="owner-finance-filters">
              <label>
                Transaction type
                <select
                  value={ledgerType}
                  onChange={(event) => {
                    setLedgerType(
                      event.target.value,
                    );

                    resetLedgerPage();
                  }}
                >
                  {LEDGER_TYPES.map((value) => (
                    <option
                      key={value || "all"}
                      value={value}
                    >
                      {value
                        ? formatLabel(value)
                        : "All types"}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Status
                <select
                  value={ledgerStatus}
                  onChange={(event) => {
                    setLedgerStatus(
                      event.target.value,
                    );

                    resetLedgerPage();
                  }}
                >
                  {LEDGER_STATUSES.map(
                    (value) => (
                      <option
                        key={value || "all"}
                        value={value}
                      >
                        {value
                          ? formatLabel(value)
                          : "All statuses"}
                      </option>
                    ),
                  )}
                </select>
              </label>
            </div>

            <div className="owner-finance-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Description</th>
                    <th className="owner-finance-money-column">
                      Amount
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {ledgerRows.map((entry) => (
                    <tr key={entry.id}>
                      <td>
                        {formatDate(
                          entry.createdAt,
                        )}
                      </td>

                      <td>
                        {formatLabel(entry.type)}
                      </td>

                      <td>
                        <span
                          className={`owner-finance-status owner-finance-status-${entry.status.toLowerCase()}`}
                        >
                          {formatLabel(
                            entry.status,
                          )}
                        </span>
                      </td>

                      <td>
                        {entry.description ||
                          entry.settlementId ||
                          "Ledger transaction"}
                      </td>

                      <td className="owner-finance-money-column">
                        {formatMoney(
                          entry.amountCents,
                          entry.currency,
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {!loadingFinance &&
              ledgerRows.length === 0 ? (
                <div className="owner-finance-empty">
                  <strong>
                    No ledger activity yet
                  </strong>
                  <span>
                    Charged settlements and future
                    payouts will appear here.
                  </span>
                </div>
              ) : null}
            </div>

            <div className="owner-finance-pagination">
              <button
                type="button"
                disabled={
                  loadingFinance ||
                  ledgerPagination.page <= 1
                }
                onClick={() =>
                  setLedgerPagination(
                    (current) => ({
                      ...current,
                      page: Math.max(
                        1,
                        current.page - 1,
                      ),
                    }),
                  )
                }
              >
                Previous
              </button>

              <span>
                Page {ledgerPagination.page} of{" "}
                {Math.max(
                  1,
                  ledgerPagination.totalPages,
                )}{" "}
                · {ledgerPagination.total} entries
              </span>

              <button
                type="button"
                disabled={
                  loadingFinance ||
                  ledgerPagination.totalPages ===
                    0 ||
                  ledgerPagination.page >=
                    ledgerPagination.totalPages
                }
                onClick={() =>
                  setLedgerPagination(
                    (current) => ({
                      ...current,
                      page: current.page + 1,
                    }),
                  )
                }
              >
                Next
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="owner-finance-filters">
              <label>
                Payout status
                <select
                  value={payoutStatus}
                  onChange={(event) => {
                    setPayoutStatus(
                      event.target.value,
                    );

                    resetPayoutPage();
                  }}
                >
                  {PAYOUT_STATUSES.map(
                    (value) => (
                      <option
                        key={value || "all"}
                        value={value}
                      >
                        {value
                          ? formatLabel(value)
                          : "All statuses"}
                      </option>
                    ),
                  )}
                </select>
              </label>
            </div>

            <div className="owner-finance-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Requested</th>
                    <th>Status</th>
                    <th>Provider</th>
                    <th>Reference</th>
                    <th className="owner-finance-money-column">
                      Amount
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {payoutRows.map((payout) => (
                    <tr key={payout.id}>
                      <td>
                        {formatDate(
                          payout.requestedAt,
                        )}
                      </td>

                      <td>
                        <span
                          className={`owner-finance-status owner-finance-status-${payout.status.toLowerCase()}`}
                        >
                          {formatLabel(
                            payout.status,
                          )}
                        </span>
                      </td>

                      <td>
                        {payout.provider || "—"}
                      </td>

                      <td>
                        {payout.providerPayoutId ||
                          payout.failureCode ||
                          "—"}
                      </td>

                      <td className="owner-finance-money-column">
                        {formatMoney(
                          payout.amountCents,
                          payout.currency,
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {!loadingFinance &&
              payoutRows.length === 0 ? (
                <div className="owner-finance-empty">
                  <strong>
                    No payouts yet
                  </strong>
                  <span>
                    Processed seller payouts will
                    appear here.
                  </span>
                </div>
              ) : null}
            </div>

            <div className="owner-finance-pagination">
              <button
                type="button"
                disabled={
                  loadingFinance ||
                  payoutPagination.page <= 1
                }
                onClick={() =>
                  setPayoutPagination(
                    (current) => ({
                      ...current,
                      page: Math.max(
                        1,
                        current.page - 1,
                      ),
                    }),
                  )
                }
              >
                Previous
              </button>

              <span>
                Page {payoutPagination.page} of{" "}
                {Math.max(
                  1,
                  payoutPagination.totalPages,
                )}{" "}
                · {payoutPagination.total} payouts
              </span>

              <button
                type="button"
                disabled={
                  loadingFinance ||
                  payoutPagination.totalPages ===
                    0 ||
                  payoutPagination.page >=
                    payoutPagination.totalPages
                }
                onClick={() =>
                  setPayoutPagination(
                    (current) => ({
                      ...current,
                      page: current.page + 1,
                    }),
                  )
                }
              >
                Next
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
