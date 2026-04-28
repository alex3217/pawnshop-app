// File: apps/web/src/pages/AuctionDetailPage.tsx

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { io, type Socket } from "socket.io-client";
import { API_BASE, SOCKET_PATH, SOCKET_URL } from "../config";
import { getAuthRole, getAuthToken } from "../services/auth";
import { getAuction, placeBid as placeBidApi } from "../services/auctions";

void API_BASE;

type AuctionStatus = "SCHEDULED" | "LIVE" | "ENDED" | "CANCELED" | string;

type Auction = {
  id: string;
  status: AuctionStatus;
  currentPrice: string | number;
  minIncrement: string | number;
  startsAt?: string | null;
  endsAt: string;
  extendedEndsAt?: string | null;
  item?: {
    id?: string;
    title?: string | null;
    description?: string | null;
    category?: string | null;
    condition?: string | null;
    images?: string[] | null;
  } | null;
  shop?: {
    id?: string;
    name?: string | null;
    address?: string | null;
    phone?: string | null;
  } | null;
};

type AuctionRealtimePayload = {
  auctionId?: string;
  id?: string;
  currentPrice?: string | number;
  minIncrement?: string | number;
  extendedEndsAt?: string | null;
  endsAt?: string | null;
  status?: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function formatMoney(value: string | number | null | undefined) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";

  return amount.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function normalizeAmountInput(value: string) {
  const cleaned = value.replace(/[^\d.]/g, "");
  const parts = cleaned.split(".");

  if (parts.length <= 1) return cleaned;

  return `${parts[0]}.${parts.slice(1).join("").slice(0, 2)}`;
}

function getSuggestedBidValue(auction: Auction | null) {
  if (!auction) return "";

  const current = Number(auction.currentPrice);
  const increment = Number(auction.minIncrement);

  if (!Number.isFinite(current) || !Number.isFinite(increment)) return "";

  return (current + increment).toFixed(2);
}

export async function safeJson<T = unknown>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export function extractApiError(payload: unknown) {
  if (!isObject(payload)) return "";

  const errorText = String(
    payload.error || payload.message || payload.details || "",
  ).trim();

  const minRequired = Number(payload.minRequired);

  if (Number.isFinite(minRequired) && !errorText.includes(String(minRequired))) {
    return `${errorText || "Bid is too low"} minimum ${formatMoney(minRequired)}`;
  }

  return errorText;
}

export function getAuctionPayload(payload: unknown): Auction | null {
  if (!isObject(payload)) return null;

  if (typeof payload.id === "string") return payload as Auction;

  if (isObject(payload.auction)) {
    return payload.auction as Auction;
  }

  if (isObject(payload.data)) {
    if (isObject(payload.data.auction)) {
      return payload.data.auction as Auction;
    }

    if (typeof payload.data.id === "string") {
      return payload.data as Auction;
    }
  }

  return null;
}

function getRealtimePayload(payload: unknown): AuctionRealtimePayload | null {
  if (!isObject(payload)) return null;

  return {
    auctionId:
      typeof payload.auctionId === "string" ? payload.auctionId : undefined,
    id: typeof payload.id === "string" ? payload.id : undefined,
    currentPrice:
      typeof payload.currentPrice === "string" ||
      typeof payload.currentPrice === "number"
        ? payload.currentPrice
        : undefined,
    minIncrement:
      typeof payload.minIncrement === "string" ||
      typeof payload.minIncrement === "number"
        ? payload.minIncrement
        : undefined,
    extendedEndsAt:
      typeof payload.extendedEndsAt === "string" || payload.extendedEndsAt === null
        ? payload.extendedEndsAt
        : undefined,
    endsAt:
      typeof payload.endsAt === "string" || payload.endsAt === null
        ? payload.endsAt
        : undefined,
    status: typeof payload.status === "string" ? payload.status : undefined,
  };
}

function getEffectiveEndDate(auction: Auction | null) {
  if (!auction) return null;

  const raw = auction.extendedEndsAt || auction.endsAt;
  const date = new Date(raw);

  return Number.isNaN(date.getTime()) ? null : date;
}

function getStatusLabel(status: string | undefined | null) {
  return String(status || "UNKNOWN").toUpperCase();
}

function getTimeLeft(endTime: Date | null, now: number) {
  if (!endTime) return "—";

  const ms = endTime.getTime() - now;

  if (ms <= 0) return "Ended";

  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hh = Math.floor((totalSeconds % 86400) / 3600);
  const mm = Math.floor((totalSeconds % 3600) / 60);
  const ss = totalSeconds % 60;

  if (days > 0) return `${days}d ${hh}h ${mm}m`;
  if (hh > 0) {
    return `${hh}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  }

  return `${mm}:${String(ss).padStart(2, "0")}`;
}

export default function AuctionDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [auction, setAuction] = useState<Auction | null>(null);
  const [bidAmount, setBidAmount] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [socketConnected, setSocketConnected] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const userEditedBidRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const role = getAuthRole();
  const token = getAuthToken();

  const normalizedRole = String(role || "").toUpperCase();
  const isBuyer = normalizedRole === "CONSUMER" || normalizedRole === "BUYER";
  const canModerateBid =
    normalizedRole === "ADMIN" || normalizedRole === "SUPER_ADMIN";
  const canBid = isBuyer || canModerateBid;

  const endTime = useMemo(() => getEffectiveEndDate(auction), [auction]);

  const timeLeft = useMemo(() => getTimeLeft(endTime, now), [endTime, now]);

  const statusLabel = getStatusLabel(auction?.status);
  const isLive = statusLabel === "LIVE";
  const hasEnded = timeLeft === "Ended" || statusLabel === "ENDED";
  const suggestedBid = useMemo(() => getSuggestedBidValue(auction), [auction]);

  const bidDisabled =
    loading ||
    refreshing ||
    submitting ||
    !auction ||
    !isLive ||
    hasEnded ||
    !canBid ||
    !token;

  const applySuggestedBidIfSafe = useCallback((nextAuction: Auction | null) => {
    const suggested = getSuggestedBidValue(nextAuction);
    if (!suggested) return;

    setBidAmount((prev) => {
      if (!prev) return suggested;
      if (!userEditedBidRef.current) return suggested;
      return prev;
    });
  }, []);

  const mergeRealtimeAuction = useCallback(
    (payload: AuctionRealtimePayload) => {
      const incomingAuctionId = payload.auctionId || payload.id;
      if (!id || incomingAuctionId !== id) return;

      setAuction((prev) => {
        if (!prev) return prev;

        const beforeSuggested = getSuggestedBidValue(prev);

        const nextAuction: Auction = {
          ...prev,
          currentPrice:
            payload.currentPrice !== undefined
              ? payload.currentPrice
              : prev.currentPrice,
          minIncrement:
            payload.minIncrement !== undefined
              ? payload.minIncrement
              : prev.minIncrement,
          extendedEndsAt:
            payload.extendedEndsAt !== undefined
              ? payload.extendedEndsAt
              : prev.extendedEndsAt,
          endsAt: payload.endsAt || prev.endsAt,
          status: payload.status || prev.status,
        };

        const nextSuggested = getSuggestedBidValue(nextAuction);

        setBidAmount((currentBid) => {
          if (!nextSuggested) return currentBid;
          if (!currentBid) return nextSuggested;

          if (!userEditedBidRef.current || currentBid === beforeSuggested) {
            userEditedBidRef.current = false;
            return nextSuggested;
          }

          return currentBid;
        });

        return nextAuction;
      });
    },
    [id],
  );

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!id) {
        setAuction(null);
        setMsg("Missing auction id.");
        setLoading(false);
        return;
      }

      abortRef.current?.abort();

      const controller = new AbortController();
      abortRef.current = controller;

      if (mode === "initial") setLoading(true);
      else setRefreshing(true);

      setMsg(null);

      try {
          const nextAuction = await getAuction(id);
          setAuction(nextAuction);
          applySuggestedBidIfSafe(nextAuction);
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") return;

        setMsg(err instanceof Error ? err.message : "Failed to load auction.");

        if (mode === "initial") setAuction(null);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [applySuggestedBidIfSafe, id],
  );

  useEffect(() => {
    void load("initial");

    return () => {
      abortRef.current?.abort();
    };
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!id) return;

    const socket = io(SOCKET_URL, {
      path: SOCKET_PATH,
      transports: ["websocket", "polling"],
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 750,
      timeout: 10000,
      auth: token ? { token } : undefined,
    });

    socketRef.current = socket;

    const joinAuctionRoom = () => {
      setSocketConnected(true);
      socket.emit("auction:join", id);
    };

    const leaveAuctionRoom = () => {
      socket.emit("auction:leave", id);
    };

    const handleDisconnect = () => {
      setSocketConnected(false);
    };

    const handleRealtimeUpdate = (data: unknown) => {
      const payload = getRealtimePayload(data);
      if (!payload) return;
      mergeRealtimeAuction(payload);
    };

    socket.on("connect", joinAuctionRoom);
    socket.on("reconnect", joinAuctionRoom);
    socket.on("disconnect", handleDisconnect);
    socket.on("auction:updated", handleRealtimeUpdate);
    socket.on("auction:bidPlaced", handleRealtimeUpdate);

    return () => {
      leaveAuctionRoom();
      socket.off("connect", joinAuctionRoom);
      socket.off("reconnect", joinAuctionRoom);
      socket.off("disconnect", handleDisconnect);
      socket.off("auction:updated", handleRealtimeUpdate);
      socket.off("auction:bidPlaced", handleRealtimeUpdate);
      socket.disconnect();
      socketRef.current = null;
      setSocketConnected(false);
    };
  }, [id, mergeRealtimeAuction, token]);

  async function placeBid() {
    setMsg(null);

    if (!id || !auction) return;

    if (!token) {
      setMsg("Login as a buyer to place a bid.");
      return;
    }

    if (!canBid) {
      setMsg("Only buyer accounts can place bids.");
      return;
    }

    if (!isLive || hasEnded) {
      setMsg("Auction is not live.");
      return;
    }

    const amount = Number(bidAmount);

    if (!Number.isFinite(amount) || amount <= 0) {
      setMsg("Enter a valid bid amount.");
      return;
    }

    const minimum = Number(suggestedBid);

    if (Number.isFinite(minimum) && amount < minimum) {
      setMsg(`Bid must be at least ${formatMoney(minimum)}.`);
      return;
    }

    setSubmitting(true);

    try {
        await placeBidApi(id, amount);

        const refreshed = await getAuction(id);
        setAuction(refreshed);
        applySuggestedBidIfSafe(refreshed);

        userEditedBidRef.current = false;
        setMsg("Bid placed!");
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : "Bid failed.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="page-stack">
        <div className="page-card">Loading auction…</div>
      </div>
    );
  }

  if (!auction) {
    return (
      <div className="page-stack">
        <div className="page-card" style={{ display: "grid", gap: 12 }}>
          <h2 style={{ margin: 0 }}>Auction not available</h2>

          <p className="muted" style={{ margin: 0 }}>
            {msg ?? "Auction not found."}
          </p>

          <Link className="btn btn-primary" to="/auctions">
            Back to Auctions
          </Link>
        </div>
      </div>
    );
  }

  const success = msg === "Bid placed!";
  const itemImage =
    Array.isArray(auction.item?.images) && auction.item.images.length
      ? auction.item.images[0]
      : null;

  return (
    <div className="page-stack">
      <div className="page-card" style={{ display: "grid", gap: 18 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            alignItems: "flex-start",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "grid", gap: 6 }}>
            <Link to="/auctions" style={{ color: "#93c5fd", fontWeight: 800 }}>
              ← Back to Auctions
            </Link>

            <h2 style={{ margin: 0 }}>
              {auction.item?.title ?? "Auction Item"}
            </h2>

            <div className="muted">
              {auction.shop?.name ?? "Shop"} ·{" "}
              {auction.item?.condition ?? "Condition not listed"}
            </div>
          </div>

          <span
            style={{
              borderRadius: 999,
              padding: "8px 12px",
              fontSize: 12,
              fontWeight: 900,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: isLive ? "#bbf7d0" : "#fecaca",
              background: isLive
                ? "rgba(22,163,74,0.16)"
                : "rgba(220,38,38,0.16)",
              border: isLive
                ? "1px solid rgba(34,197,94,0.32)"
                : "1px solid rgba(248,113,113,0.32)",
            }}
          >
            {statusLabel}
          </span>
        </div>

        {itemImage ? (
          <img
            src={itemImage}
            alt={auction.item?.title ?? "Auction item"}
            loading="lazy"
            style={{
              width: "100%",
              maxHeight: 360,
              objectFit: "cover",
              borderRadius: 18,
              border: "1px solid rgba(255,255,255,0.12)",
            }}
          />
        ) : (
          <div
            style={{
              minHeight: 220,
              display: "grid",
              placeItems: "center",
              borderRadius: 18,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.04)",
              color: "#94a3b8",
              fontWeight: 800,
            }}
          >
            No item image available
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
          }}
        >
          <div style={statCardStyle}>
            <div style={statLabelStyle}>Current Price</div>
            <div style={statValueStyle}>{formatMoney(auction.currentPrice)}</div>
          </div>

          <div style={statCardStyle}>
            <div style={statLabelStyle}>Minimum Increment</div>
            <div style={statValueStyle}>{formatMoney(auction.minIncrement)}</div>
          </div>

          <div style={statCardStyle}>
            <div style={statLabelStyle}>Time Left</div>
            <div style={statValueStyle}>{isLive ? timeLeft : "—"}</div>
          </div>

          <div style={statCardStyle}>
            <div style={statLabelStyle}>Suggested Bid</div>
            <div style={statValueStyle}>
              {suggestedBid ? formatMoney(suggestedBid) : "—"}
            </div>
          </div>
        </div>

        <div style={{ fontSize: 13, opacity: 0.82 }}>
          Ends at: {endTime ? endTime.toLocaleString() : "—"}
          {auction.extendedEndsAt ? " (extended)" : ""}
          {refreshing ? " · Refreshing…" : ""}
          {" · "}
          Live updates: {socketConnected ? "connected" : "connecting"}
        </div>

        {auction.item?.description ? (
          <p className="muted" style={{ margin: 0 }}>
            {auction.item.description}
          </p>
        ) : null}

        <div
          style={{
            display: "grid",
            gap: 12,
            padding: 16,
            borderRadius: 18,
            border: "1px solid rgba(99,102,241,0.35)",
            background: "rgba(99,102,241,0.09)",
          }}
        >
          <div>
            <h3 style={{ margin: 0 }}>Place a Bid</h3>
            <div className="muted" style={{ fontSize: 13 }}>
              Enter at least{" "}
              {suggestedBid ? formatMoney(suggestedBid) : "the next minimum bid"}.
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input
              value={bidAmount}
              onChange={(event) => {
                userEditedBidRef.current = true;
                setBidAmount(normalizeAmountInput(event.target.value));
              }}
              style={{
                padding: "12px 14px",
                width: 180,
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.18)",
                background: "rgba(255,255,255,0.06)",
                color: "#eef2ff",
                fontWeight: 800,
              }}
              inputMode="decimal"
              disabled={bidDisabled}
              placeholder={suggestedBid || "Bid amount"}
            />

            <button
              type="button"
              onClick={placeBid}
              disabled={bidDisabled}
              style={{
                padding: "12px 16px",
                borderRadius: 12,
                border: "none",
                background: bidDisabled ? "#475569" : "#22c55e",
                color: "#ffffff",
                fontWeight: 900,
                cursor: bidDisabled ? "not-allowed" : "pointer",
              }}
            >
              {submitting ? "Placing Bid..." : "Place Bid"}
            </button>

            <Link to="/my-bids" style={{ color: "#bfdbfe", fontWeight: 800 }}>
              View My Bids
            </Link>
          </div>

          {!token ? <div style={noticeStyle}>Login as a buyer to place bids.</div> : null}
          {token && !canBid ? (
            <div style={noticeStyle}>This account role cannot place buyer bids.</div>
          ) : null}
          {token && canBid && !isLive ? (
            <div style={noticeStyle}>Bidding is closed for this auction.</div>
          ) : null}
          {hasEnded ? <div style={noticeStyle}>This auction has ended.</div> : null}

          {msg ? (
            <div style={{ color: success ? "#22c55e" : "#f87171" }}>{msg}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const statCardStyle = {
  display: "grid",
  gap: 6,
  padding: 14,
  borderRadius: 16,
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.1)",
};

const statLabelStyle = {
  fontSize: 12,
  color: "#94a3b8",
  fontWeight: 800,
  textTransform: "uppercase" as const,
  letterSpacing: "0.08em",
};

const statValueStyle = {
  fontSize: 22,
  fontWeight: 900,
  color: "#eef2ff",
};

const noticeStyle = {
  color: "#fbbf24",
  fontSize: 13,
  fontWeight: 700,
};
