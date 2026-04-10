// File: apps/web/src/pages/AuctionDetailPage.tsx

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { io } from "socket.io-client";
import { API_BASE, SOCKET_PATH, SOCKET_URL } from "../config";
import { getAuthToken } from "../services/auth";

type Auction = {
  id: string;
  status: string;
  currentPrice: string;
  minIncrement: string;
  endsAt: string;
  extendedEndsAt?: string | null;
  item?: { title?: string | null } | null;
  shop?: { name?: string | null } | null;
};

type AuctionUpdatedPayload = {
  auctionId?: string;
  currentPrice?: string | number;
  extendedEndsAt?: string | null;
  status?: string;
};

function formatMoney(value: string | number | null | undefined) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  return amount.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function getSuggestedBidValue(auction: Auction | null) {
  if (!auction) return "";
  const current = Number(auction.currentPrice);
  const increment = Number(auction.minIncrement);
  if (!Number.isFinite(current) || !Number.isFinite(increment)) return "";
  return String(current + increment);
}

async function safeJson<T = unknown>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function extractApiError(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const maybe = payload as {
    error?: unknown;
    message?: unknown;
    minRequired?: unknown;
  };

  const errorText = String(maybe.error || maybe.message || "").trim();
  if (!errorText) return "";

  const minRequired = Number(maybe.minRequired);
  if (Number.isFinite(minRequired) && !errorText.includes(String(minRequired))) {
    return `${errorText} (minimum ${formatMoney(minRequired)})`;
  }

  return errorText;
}

export default function AuctionDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [auction, setAuction] = useState<Auction | null>(null);
  const [bidAmount, setBidAmount] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const userEditedBidRef = useRef(false);

  const applySuggestedBidIfSafe = useCallback((nextAuction: Auction | null) => {
    const suggested = getSuggestedBidValue(nextAuction);
    if (!suggested) return;

    setBidAmount((prev) => {
      if (!prev) return suggested;
      if (!userEditedBidRef.current) return suggested;

      const previousSuggested = getSuggestedBidValue(auction);
      if (prev === previousSuggested) {
        userEditedBidRef.current = false;
        return suggested;
      }

      return prev;
    });
  }, [auction]);

  const load = useCallback(async () => {
    if (!id) {
      setAuction(null);
      setMsg("Missing auction id.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setMsg(null);

    try {
      const response = await fetch(`${API_BASE}/auctions/${id}`);
      const json = await safeJson<Auction | { error?: string; message?: string }>(response);

      if (!response.ok) {
        throw new Error(
          extractApiError(json) || `Failed to load auction (${response.status})`
        );
      }

      const nextAuction = json as Auction;
      setAuction(nextAuction);
      applySuggestedBidIfSafe(nextAuction);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to load auction";
      setMsg(message);
      setAuction(null);
    } finally {
      setLoading(false);
    }
  }, [applySuggestedBidIfSafe, id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!id) return;

    const socket = io(SOCKET_URL, {
      path: SOCKET_PATH,
      transports: ["polling", "websocket"],
      withCredentials: true,
    });

    socket.on("connect", () => {
      socket.emit("auction:join", id);
    });

    socket.on("auction:updated", (data: unknown) => {
      if (!data || typeof data !== "object") return;

      const payload = data as AuctionUpdatedPayload;
      if (payload.auctionId !== id) return;

      setAuction((prev) => {
        if (!prev) return prev;

        const nextAuction: Auction = {
          ...prev,
          currentPrice: String(payload.currentPrice ?? prev.currentPrice),
          extendedEndsAt: payload.extendedEndsAt ?? prev.extendedEndsAt,
          status: String(payload.status ?? prev.status),
        };

        const prevSuggested = getSuggestedBidValue(prev);
        const nextSuggested = getSuggestedBidValue(nextAuction);

        setBidAmount((currentBid) => {
          if (!currentBid) return nextSuggested;
          if (!userEditedBidRef.current) return nextSuggested;
          if (currentBid === prevSuggested) {
            userEditedBidRef.current = false;
            return nextSuggested;
          }
          return currentBid;
        });

        return nextAuction;
      });
    });

    return () => {
      socket.emit("auction:leave", id);
      socket.disconnect();
    };
  }, [id]);

  const endTime = useMemo(() => {
    if (!auction) return null;
    const value = auction.extendedEndsAt ?? auction.endsAt;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }, [auction]);

  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const timeLeft = useMemo(() => {
    if (!endTime) return "—";

    const ms = endTime.getTime() - now;
    if (ms <= 0) return "Ended";

    const totalSeconds = Math.floor(ms / 1000);
    const hh = Math.floor(totalSeconds / 3600);
    const mm = Math.floor((totalSeconds % 3600) / 60);
    const ss = totalSeconds % 60;

    if (hh > 0) {
      return `${hh}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
    }

    return `${mm}:${String(ss).padStart(2, "0")}`;
  }, [endTime, now]);

  const suggestedBid = useMemo(() => getSuggestedBidValue(auction), [auction]);
  const isLive = String(auction?.status || "").toUpperCase() === "LIVE";
  const bidDisabled = loading || submitting || !auction || !isLive;

  async function placeBid() {
    setMsg(null);

    if (!id || !auction) return;

    if (!isLive) {
      setMsg("Auction is not live.");
      return;
    }

    const amount = Number(bidAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setMsg("Enter a valid bid amount.");
      return;
    }

    const token = getAuthToken();
    if (!token) {
      setMsg("Login as a buyer to place a bid.");
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch(`${API_BASE}/auctions/${id}/bids`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ amount }),
      });

      const json = await safeJson<Record<string, unknown>>(response);

      if (!response.ok) {
        throw new Error(
          extractApiError(json) || `Bid failed (${response.status})`
        );
      }

      userEditedBidRef.current = false;
      setMsg("Bid placed!");
      await load();
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : "Bid failed.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <p>Loading…</p>;
  }

  if (!auction) {
    return <p>{msg ?? "Auction not found."}</p>;
  }

  const success = msg === "Bid placed!";

  return (
    <div className="page-stack">
      <div className="page-card" style={{ display: "grid", gap: 12 }}>
        <h3 style={{ margin: 0 }}>{auction.item?.title ?? "Auction"}</h3>
        <div className="muted">{auction.shop?.name ?? "Shop"}</div>

        <div
          style={{
            display: "flex",
            gap: 16,
            alignItems: "baseline",
            flexWrap: "wrap",
          }}
        >
          <div style={{ fontSize: 30, fontWeight: 900 }}>
            {formatMoney(auction.currentPrice)}
          </div>
          <div style={{ fontSize: 14, opacity: 0.8 }}>
            Status: {auction.status}
          </div>
          <div style={{ fontSize: 14, opacity: 0.8 }}>
            Time left: {isLive ? timeLeft : "—"}
          </div>
        </div>

        <div style={{ fontSize: 12, opacity: 0.8 }}>
          Ends at: {endTime ? endTime.toLocaleString() : "—"}
          {auction.extendedEndsAt ? " (extended)" : ""}
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <input
            value={bidAmount}
            onChange={(e) => {
              userEditedBidRef.current = true;
              setBidAmount(e.target.value);
            }}
            style={{ padding: 10, width: 160 }}
            inputMode="decimal"
            disabled={bidDisabled}
            placeholder={suggestedBid ? `Suggested: ${suggestedBid}` : "Bid amount"}
            aria-label="Bid amount"
          />

          <button
            onClick={placeBid}
            style={{ padding: "10px 14px" }}
            disabled={bidDisabled}
          >
            {submitting ? "Placing Bid..." : "Place Bid"}
          </button>

          <span style={{ fontSize: 12, opacity: 0.7 }}>
            Min inc: {formatMoney(auction.minIncrement)}
          </span>
        </div>

        {!isLive ? (
          <div className="muted" style={{ fontSize: 13 }}>
            Bidding is closed for this auction.
          </div>
        ) : null}

        {msg ? (
          <div style={{ color: success ? "green" : "crimson" }}>{msg}</div>
        ) : null}
      </div>
    </div>
  );
}