// File: apps/web/src/pages/CreateAuctionPage.tsx

import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createAuction } from "../services/auctions";
import { getAuthRole, getAuthToken } from "../services/auth";

type FormState = {
  itemId: string;
  startPrice: string;
  minIncrement: string;
  startsAt: string;
  endsAt: string;
};

function toDateTimeLocalValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");

  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function normalizeMoneyInput(value: string) {
  const cleaned = value.replace(/[^\d.]/g, "");
  const parts = cleaned.split(".");

  if (parts.length <= 1) return cleaned;

  return `${parts[0]}.${parts.slice(1).join("").slice(0, 2)}`;
}

function toIsoOrNull(value: string) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString();
}

export default function CreateAuctionPage() {
  const navigate = useNavigate();

  const nowPlusOneHour = useMemo(() => {
    const date = new Date();
    date.setHours(date.getHours() + 1);
    return toDateTimeLocalValue(date);
  }, []);

  const tomorrow = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return toDateTimeLocalValue(date);
  }, []);

  const [form, setForm] = useState<FormState>({
    itemId: "",
    startPrice: "10.00",
    minIncrement: "1.00",
    startsAt: "",
    endsAt: tomorrow,
  });

  const [msg, setMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const token = getAuthToken();
  const role = String(getAuthRole() || "").toUpperCase();
  const canCreateAuction =
    role === "OWNER" || role === "ADMIN" || role === "SUPER_ADMIN";

  const startsAtIso = toIsoOrNull(form.startsAt);
  const endsAtIso = toIsoOrNull(form.endsAt);

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMsg(null);

    if (!token) {
      setMsg("Login as an owner to create an auction.");
      return;
    }

    if (!canCreateAuction) {
      setMsg("Only owner or admin accounts can create auctions.");
      return;
    }

    const itemId = form.itemId.trim();
    if (!itemId) {
      setMsg("Enter an item ID.");
      return;
    }

    const startPrice = Number(form.startPrice);
    if (!Number.isFinite(startPrice) || startPrice <= 0) {
      setMsg("Enter a valid starting price.");
      return;
    }

    const minIncrement = Number(form.minIncrement);
    if (!Number.isFinite(minIncrement) || minIncrement <= 0) {
      setMsg("Enter a valid minimum bid increment.");
      return;
    }

    if (!endsAtIso) {
      setMsg("Enter a valid auction end time.");
      return;
    }

    const endDate = new Date(endsAtIso);
    const startDate = startsAtIso ? new Date(startsAtIso) : new Date();

    if (endDate.getTime() <= startDate.getTime()) {
      setMsg("Auction end time must be after the start time.");
      return;
    }

    setSubmitting(true);

    try {
      const auction = await createAuction({
        itemId,
        startPrice,
        minIncrement,
        startsAt: startsAtIso,
        endsAt: endsAtIso,
      });

      setMsg("Auction created.");
      navigate(`/auctions/${auction.id}`);
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : "Failed to create auction.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page-stack">
      <div className="page-card" style={{ display: "grid", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <h1 style={{ margin: 0 }}>Create Auction</h1>
            <p className="muted" style={{ margin: "6px 0 0" }}>
              Create a live auction for one of your pawnshop inventory items.
            </p>
          </div>

          <Link className="btn" to="/owner/auctions">
            Owner Auctions
          </Link>
        </div>

        {!token ? (
          <div className="alert alert-warning">
            Login as an owner before creating an auction.
          </div>
        ) : null}

        {token && !canCreateAuction ? (
          <div className="alert alert-warning">
            Your current role cannot create auctions.
          </div>
        ) : null}

        {msg ? (
          <div
            className={msg === "Auction created." ? "alert alert-success" : "alert alert-danger"}
          >
            {msg}
          </div>
        ) : null}

        <form onSubmit={onSubmit} style={{ display: "grid", gap: 14 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span>Item ID</span>
            <input
              value={form.itemId}
              onChange={(event) => updateForm("itemId", event.target.value)}
              placeholder="Paste the inventory item ID"
              autoComplete="off"
              disabled={submitting}
            />
            <small className="muted">
              Use an existing item from owner inventory. The next pass can replace this
              with a dropdown picker.
            </small>
          </label>

          <div
            style={{
              display: "grid",
              gap: 14,
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            }}
          >
            <label style={{ display: "grid", gap: 6 }}>
              <span>Starting Price</span>
              <input
                value={form.startPrice}
                onChange={(event) =>
                  updateForm("startPrice", normalizeMoneyInput(event.target.value))
                }
                inputMode="decimal"
                placeholder="10.00"
                disabled={submitting}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span>Minimum Increment</span>
              <input
                value={form.minIncrement}
                onChange={(event) =>
                  updateForm("minIncrement", normalizeMoneyInput(event.target.value))
                }
                inputMode="decimal"
                placeholder="1.00"
                disabled={submitting}
              />
            </label>
          </div>

          <div
            style={{
              display: "grid",
              gap: 14,
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            }}
          >
            <label style={{ display: "grid", gap: 6 }}>
              <span>Start Time</span>
              <input
                type="datetime-local"
                value={form.startsAt}
                min={nowPlusOneHour}
                onChange={(event) => updateForm("startsAt", event.target.value)}
                disabled={submitting}
              />
              <small className="muted">Leave blank to start as soon as backend allows.</small>
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span>End Time</span>
              <input
                type="datetime-local"
                value={form.endsAt}
                min={nowPlusOneHour}
                onChange={(event) => updateForm("endsAt", event.target.value)}
                disabled={submitting}
                required
              />
            </label>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              className="btn btn-primary"
              type="submit"
              disabled={submitting || !token || !canCreateAuction}
            >
              {submitting ? "Creating…" : "Create Auction"}
            </button>

            <Link className="btn" to="/owner/inventory">
              Go to Inventory
            </Link>

            <Link className="btn" to="/auctions">
              View Auctions
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
