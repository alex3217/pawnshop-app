import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { Link } from "react-router-dom";
import {
  archiveItemIntake,
  getItemIntake,
  listItemIntakes,
  reviewItemIntake,
  type ItemIntake,
  type ItemIntakeDestination,
  type ItemIntakeReviewStatus,
  type ItemIntakeStatus,
} from "../services/itemIntakes";
import { getMyShops, type Shop } from "../services/shops";
import "../styles/owner-item-intakes.css";

const STATUS_OPTIONS: Array<ItemIntakeStatus | "ALL"> = [
  "ALL",
  "DRAFT",
  "SCANNED",
  "NEEDS_REVIEW",
  "APPROVED",
  "REJECTED",
  "PUBLISHED",
  "ARCHIVED",
];

const DESTINATION_OPTIONS: Array<
  ItemIntakeDestination | "ALL"
> = [
  "ALL",
  "SHOP_INVENTORY",
  "CUSTOMER_SELL",
  "CUSTOMER_PAWN",
  "CUSTOMER_MARKETPLACE",
  "DEALER_LISTING",
  "SHOP_TRANSFER",
];

function humanize(value: unknown) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    return "—";
  }

  return normalized
    .toLowerCase()
    .split("_")
    .map((part) =>
      part ? part[0].toUpperCase() + part.slice(1) : "",
    )
    .join(" ");
}

function formatDate(value: unknown) {
  const raw = String(value || "").trim();

  if (!raw) {
    return "—";
  }

  const date = new Date(raw);

  if (Number.isNaN(date.getTime())) {
    return raw;
  }

  return date.toLocaleString();
}

function formatMoney(value: unknown) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return "—";
  }

  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return String(value);
  }

  return amount.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
  });
}

function getCode(intake: ItemIntake) {
  return (
    intake.normalizedCode ||
    intake.code ||
    intake.serialNumber ||
    intake.sku ||
    intake.upc ||
    intake.ean ||
    intake.barcode ||
    "No code"
  );
}

function getStatusClass(status: ItemIntakeStatus) {
  return [
    "item-intake-status",
    `is-${String(status)
      .toLowerCase()
      .replaceAll("_", "-")}`,
  ].join(" ");
}

function replaceRow(
  rows: ItemIntake[],
  replacement: ItemIntake,
) {
  return rows.map((row) =>
    row.id === replacement.id ? replacement : row,
  );
}

function LinkCollection({
  label,
  urls,
}: {
  label: string;
  urls: string[];
}) {
  return (
    <div className="item-intake-link-group">
      <strong>{label}</strong>

      {urls.length === 0 ? (
        <span>None uploaded</span>
      ) : (
        <div className="item-intake-link-list">
          {urls.map((url, index) => (
            <a
              key={`${url}-${index}`}
              href={url}
              target="_blank"
              rel="noreferrer"
            >
              Open {label.toLowerCase()} {index + 1}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export default function OwnerItemIntakesPage() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [rows, setRows] = useState<ItemIntake[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [selected, setSelected] =
    useState<ItemIntake | null>(null);

  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [shopId, setShopId] = useState("");
  const [status, setStatus] =
    useState<ItemIntakeStatus | "ALL">("ALL");
  const [destination, setDestination] =
    useState<ItemIntakeDestination | "ALL">("ALL");

  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);

  const [reviewMessage, setReviewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionId, setActionId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadShops() {
      try {
        const nextShops = await getMyShops(
          controller.signal,
        );

        setShops(nextShops);
      } catch (loadError) {
        if (
          loadError instanceof DOMException &&
          loadError.name === "AbortError"
        ) {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load shops.",
        );
      }
    }

    void loadShops();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadQueue() {
      setLoading(true);
      setError("");

      try {
        const result = await listItemIntakes(
          {
            q: appliedQuery,
            shopId: shopId || undefined,
            status,
            destination,
            page,
            limit: 25,
          },
          controller.signal,
        );

        setRows(result.rows);
        setTotal(result.total);
        setPages(result.pages);

        setSelectedId((current) => {
          if (
            current &&
            result.rows.some((row) => row.id === current)
          ) {
            return current;
          }

          return result.rows[0]?.id || "";
        });
      } catch (loadError) {
        if (
          loadError instanceof DOMException &&
          loadError.name === "AbortError"
        ) {
          return;
        }

        setRows([]);
        setTotal(0);
        setPages(1);
        setSelectedId("");
        setSelected(null);

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load item intakes.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void reloadKey;
    void loadQueue();

    return () => controller.abort();
  }, [
    appliedQuery,
    destination,
    page,
    reloadKey,
    shopId,
    status,
  ]);

  useEffect(() => {
    if (!selectedId) {
      setSelected(null);
      setReviewMessage("");
      return;
    }

    const controller = new AbortController();

    async function loadDetail() {
      setDetailLoading(true);
      setError("");

      try {
        const intake = await getItemIntake(
          selectedId,
          controller.signal,
        );

        setSelected(intake);
        setReviewMessage(intake.reviewMessage || "");
      } catch (loadError) {
        if (
          loadError instanceof DOMException &&
          loadError.name === "AbortError"
        ) {
          return;
        }

        setSelected(null);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load item intake.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setDetailLoading(false);
        }
      }
    }

    void loadDetail();

    return () => controller.abort();
  }, [selectedId]);

  const currentNeedsReview = useMemo(
    () =>
      rows.filter(
        (row) => row.status === "NEEDS_REVIEW",
      ).length,
    [rows],
  );

  const currentApproved = useMemo(
    () =>
      rows.filter((row) => row.status === "APPROVED")
        .length,
    [rows],
  );

  const isReviewLocked =
    !selected ||
    selected.status === "PUBLISHED" ||
    selected.status === "ARCHIVED";

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setAppliedQuery(query.trim());
    setReloadKey((current) => current + 1);
  }

  function clearFilters() {
    setQuery("");
    setAppliedQuery("");
    setShopId("");
    setStatus("ALL");
    setDestination("ALL");
    setPage(1);
    setNotice("Item intake filters cleared.");
    setReloadKey((current) => current + 1);
  }

  async function handleReview(
    nextStatus: ItemIntakeReviewStatus,
  ) {
    if (!selected || actionId || isReviewLocked) {
      return;
    }

    const actionLabel =
      nextStatus === "APPROVED"
        ? "approve"
        : nextStatus === "REJECTED"
          ? "reject"
          : "mark for review";

    const confirmed = window.confirm(
      `Are you sure you want to ${actionLabel} this intake?`,
    );

    if (!confirmed) {
      return;
    }

    setActionId(`${selected.id}:${nextStatus}`);
    setError("");
    setNotice("");

    try {
      const updated = await reviewItemIntake(
        selected.id,
        {
          status: nextStatus,
          reviewMessage,
        },
      );

      setSelected(updated);
      setRows((current) => replaceRow(current, updated));
      setReviewMessage(updated.reviewMessage || "");
      setNotice(
        `Item intake updated to ${humanize(
          updated.status,
        )}.`,
      );
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Failed to review item intake.",
      );
    } finally {
      setActionId("");
    }
  }

  async function handleArchive() {
    if (
      !selected ||
      actionId ||
      selected.status === "PUBLISHED" ||
      selected.status === "ARCHIVED"
    ) {
      return;
    }

    const confirmed = window.confirm(
      "Archive this intake record? It will remain in history but cannot be reviewed again.",
    );

    if (!confirmed) {
      return;
    }

    setActionId(`${selected.id}:ARCHIVED`);
    setError("");
    setNotice("");

    try {
      const updated = await archiveItemIntake(
        selected.id,
        reviewMessage,
      );

      setSelected(updated);
      setRows((current) => replaceRow(current, updated));
      setReviewMessage(updated.reviewMessage || "");
      setNotice("Item intake archived.");
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Failed to archive item intake.",
      );
    } finally {
      setActionId("");
    }
  }

  return (
    <div className="owner-item-intakes-page">
      <header className="item-intake-header">
        <div>
          <div className="item-intake-eyebrow">
            Owner inventory workflow
          </div>

          <h1>Item Intake Review Queue</h1>

          <p>
            Review scanner submissions, duplicate warnings,
            destination workflows, supporting documents, and
            staff decisions before items move forward.
          </p>
        </div>

        <div className="item-intake-header-actions">
          <Link
            to="/owner/scan-console"
            className="item-intake-primary-link"
          >
            Scan another item
          </Link>

          <Link
            to="/owner/inventory"
            className="item-intake-secondary-link"
          >
            Open inventory
          </Link>

          <button
            type="button"
            className="item-intake-secondary-button"
            onClick={() =>
              setReloadKey((current) => current + 1)
            }
            disabled={loading}
          >
            {loading ? "Refreshing…" : "Refresh queue"}
          </button>
        </div>
      </header>

      {error ? (
        <div className="item-intake-alert is-error">
          <strong>Review queue alert</strong>
          <span>{error}</span>
        </div>
      ) : null}

      {notice ? (
        <div className="item-intake-alert is-success">
          <strong>Review queue update</strong>
          <span>{notice}</span>
        </div>
      ) : null}

      <section className="item-intake-metrics">
        <article>
          <span>Total matches</span>
          <strong>{total}</strong>
        </article>

        <article>
          <span>Needs review on page</span>
          <strong>{currentNeedsReview}</strong>
        </article>

        <article>
          <span>Approved on page</span>
          <strong>{currentApproved}</strong>
        </article>

        <article>
          <span>Current page</span>
          <strong>
            {page} / {pages}
          </strong>
        </article>
      </section>

      <form
        className="item-intake-filters"
        onSubmit={submitSearch}
      >
        <label>
          Search
          <input
            value={query}
            onChange={(event) =>
              setQuery(event.target.value)
            }
            placeholder="Title, barcode, SKU, serial number…"
          />
        </label>

        <label>
          Shop
          <select
            value={shopId}
            onChange={(event) => {
              setShopId(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All accessible shops</option>

            {shops.map((shop) => (
              <option key={shop.id} value={shop.id}>
                {shop.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Status
          <select
            value={status}
            onChange={(event) => {
              setStatus(
                event.target.value as
                  | ItemIntakeStatus
                  | "ALL",
              );
              setPage(1);
            }}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {humanize(option)}
              </option>
            ))}
          </select>
        </label>

        <label>
          Destination
          <select
            value={destination}
            onChange={(event) => {
              setDestination(
                event.target.value as
                  | ItemIntakeDestination
                  | "ALL",
              );
              setPage(1);
            }}
          >
            {DESTINATION_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {humanize(option)}
              </option>
            ))}
          </select>
        </label>

        <div className="item-intake-filter-actions">
          <button
            type="submit"
            className="item-intake-primary-button"
          >
            Apply search
          </button>

          <button
            type="button"
            className="item-intake-secondary-button"
            onClick={clearFilters}
          >
            Clear filters
          </button>
        </div>
      </form>

      <section className="item-intake-workspace">
        <div className="item-intake-list-panel">
          <div className="item-intake-panel-heading">
            <div>
              <h2>Review records</h2>
              <p>
                Showing {rows.length} of {total} matching
                intakes.
              </p>
            </div>
          </div>

          {loading ? (
            <div className="item-intake-empty">
              Loading review queue…
            </div>
          ) : rows.length === 0 ? (
            <div className="item-intake-empty">
              <strong>No intake records matched.</strong>
              <span>
                Scan an item or change the current filters.
              </span>
            </div>
          ) : (
            <div className="item-intake-list">
              {rows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className={[
                    "item-intake-row",
                    selectedId === row.id
                      ? "is-selected"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => setSelectedId(row.id)}
                >
                  <span className="item-intake-row-top">
                    <strong>
                      {row.title || "Untitled intake"}
                    </strong>

                    <span
                      className={getStatusClass(row.status)}
                    >
                      {humanize(row.status)}
                    </span>
                  </span>

                  <span className="item-intake-row-code">
                    {humanize(row.codeType)} ·{" "}
                    {getCode(row)}
                  </span>

                  <span className="item-intake-row-meta">
                    {row.shop?.name || "Unknown shop"} ·{" "}
                    {humanize(row.destination)}
                  </span>

                  <span className="item-intake-row-meta">
                    Duplicate:{" "}
                    {humanize(row.duplicateStatus)} ·{" "}
                    {formatDate(row.createdAt)}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="item-intake-pagination">
            <button
              type="button"
              className="item-intake-secondary-button"
              disabled={page <= 1 || loading}
              onClick={() =>
                setPage((current) =>
                  Math.max(1, current - 1),
                )
              }
            >
              Previous
            </button>

            <span>
              Page {page} of {pages}
            </span>

            <button
              type="button"
              className="item-intake-secondary-button"
              disabled={page >= pages || loading}
              onClick={() =>
                setPage((current) =>
                  Math.min(pages, current + 1),
                )
              }
            >
              Next
            </button>
          </div>
        </div>

        <aside className="item-intake-detail-panel">
          {!selectedId ? (
            <div className="item-intake-empty">
              Select an intake record to review it.
            </div>
          ) : detailLoading ? (
            <div className="item-intake-empty">
              Loading intake details…
            </div>
          ) : !selected ? (
            <div className="item-intake-empty">
              Intake details are unavailable.
            </div>
          ) : (
            <>
              <div className="item-intake-detail-heading">
                <div>
                  <div className="item-intake-eyebrow">
                    Intake detail
                  </div>

                  <h2>
                    {selected.title || "Untitled intake"}
                  </h2>

                  <p>
                    Created {formatDate(selected.createdAt)}
                  </p>
                </div>

                <span
                  className={getStatusClass(
                    selected.status,
                  )}
                >
                  {humanize(selected.status)}
                </span>
              </div>

              <div className="item-intake-detail-grid">
                <div>
                  <span>Shop</span>
                  <strong>
                    {selected.shop?.name || "—"}
                  </strong>
                </div>

                <div>
                  <span>Destination</span>
                  <strong>
                    {humanize(selected.destination)}
                  </strong>
                </div>

                <div>
                  <span>Source</span>
                  <strong>
                    {humanize(selected.source)}
                  </strong>
                </div>

                <div>
                  <span>Code type</span>
                  <strong>
                    {humanize(selected.codeType)}
                  </strong>
                </div>

                <div>
                  <span>Code</span>
                  <strong>{getCode(selected)}</strong>
                </div>

                <div>
                  <span>Serial number</span>
                  <strong>
                    {selected.serialNumber || "—"}
                  </strong>
                </div>

                <div>
                  <span>Category</span>
                  <strong>
                    {selected.category || "—"}
                  </strong>
                </div>

                <div>
                  <span>Condition</span>
                  <strong>
                    {selected.condition || "—"}
                  </strong>
                </div>

                <div>
                  <span>Estimated value</span>
                  <strong>
                    {formatMoney(
                      selected.estimatedValue,
                    )}
                  </strong>
                </div>

                <div>
                  <span>Duplicate check</span>
                  <strong>
                    {humanize(
                      selected.duplicateStatus,
                    )}
                  </strong>
                </div>

                <div>
                  <span>Screening</span>
                  <strong>
                    {humanize(
                      selected.screeningStatus,
                    )}
                  </strong>
                </div>

                <div>
                  <span>OCR</span>
                  <strong>
                    {humanize(selected.ocrStatus)}
                  </strong>
                </div>
              </div>

              <div className="item-intake-description">
                <strong>Description</strong>
                <p>
                  {selected.description ||
                    "No description supplied."}
                </p>
              </div>

              <div className="item-intake-link-columns">
                <LinkCollection
                  label="Images"
                  urls={selected.images || []}
                />

                <LinkCollection
                  label="Documents"
                  urls={selected.documentUrls || []}
                />

                <LinkCollection
                  label="Receipts"
                  urls={selected.receiptUrls || []}
                />
              </div>

              {selected.duplicateMatches ? (
                <details className="item-intake-details-block">
                  <summary>
                    View duplicate match information
                  </summary>

                  <pre>
                    {JSON.stringify(
                      selected.duplicateMatches,
                      null,
                      2,
                    )}
                  </pre>
                </details>
              ) : null}

              <label className="item-intake-review-notes">
                Review notes
                <textarea
                  value={reviewMessage}
                  onChange={(event) =>
                    setReviewMessage(
                      event.target.value.slice(0, 2000),
                    )
                  }
                  rows={5}
                  placeholder="Add approval, rejection, duplicate, condition, or archive notes…"
                  disabled={isReviewLocked}
                />

                <span>
                  {reviewMessage.length} / 2000 characters
                </span>
              </label>

              <div className="item-intake-review-history">
                <strong>Latest review</strong>

                <span>
                  Reviewer:{" "}
                  {selected.reviewedById ||
                    "Not reviewed"}
                </span>

                <span>
                  Reviewed:{" "}
                  {formatDate(selected.reviewedAt)}
                </span>

                <span>
                  Linked item:{" "}
                  {selected.linkedItemId || "—"}
                </span>

                <span>
                  Linked submission:{" "}
                  {selected.linkedSubmissionId || "—"}
                </span>
              </div>

              <div className="item-intake-review-actions">
                <button
                  type="button"
                  className="item-intake-primary-button"
                  disabled={
                    isReviewLocked ||
                    Boolean(actionId)
                  }
                  onClick={() =>
                    handleReview("APPROVED")
                  }
                >
                  {actionId ===
                  `${selected.id}:APPROVED`
                    ? "Approving…"
                    : "Approve intake"}
                </button>

                <button
                  type="button"
                  className="item-intake-warning-button"
                  disabled={
                    isReviewLocked ||
                    Boolean(actionId)
                  }
                  onClick={() =>
                    handleReview("NEEDS_REVIEW")
                  }
                >
                  {actionId ===
                  `${selected.id}:NEEDS_REVIEW`
                    ? "Updating…"
                    : "Needs review"}
                </button>

                <button
                  type="button"
                  className="item-intake-danger-button"
                  disabled={
                    isReviewLocked ||
                    Boolean(actionId)
                  }
                  onClick={() =>
                    handleReview("REJECTED")
                  }
                >
                  {actionId ===
                  `${selected.id}:REJECTED`
                    ? "Rejecting…"
                    : "Reject intake"}
                </button>

                <button
                  type="button"
                  className="item-intake-secondary-button"
                  disabled={
                    selected.status === "PUBLISHED" ||
                    selected.status === "ARCHIVED" ||
                    Boolean(actionId)
                  }
                  onClick={handleArchive}
                >
                  {actionId ===
                  `${selected.id}:ARCHIVED`
                    ? "Archiving…"
                    : "Archive"}
                </button>
              </div>

              {isReviewLocked ? (
                <div className="item-intake-lock-note">
                  {selected.status === "PUBLISHED"
                    ? "Published intake records are read-only."
                    : "Archived intake records are read-only."}
                </div>
              ) : null}
            </>
          )}
        </aside>
      </section>
    </div>
  );
}
