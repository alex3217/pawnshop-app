// File: apps/web/src/pages/ScanConsolePage.tsx

import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { API_BASE } from "../config";

type ScanResult = {
  data?: {
    item?: {
      id: string;
      [key: string]: unknown;
    };
  };
  sold?: unknown;
  [key: string]: unknown;
};

async function apiFetch(
  path: string,
  opts: RequestInit & { token?: string } = {}
) {
  const headers = new Headers(opts.headers || {});
  headers.set("Content-Type", "application/json");

  if (opts.token) {
    headers.set("Authorization", `Bearer ${opts.token}`);
  }

  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new Error(json?.error || json?.message || `Request failed (${res.status})`);
  }

  return json;
}

export default function ScanConsolePage() {
  const [token, setToken] = useState(
    localStorage.getItem("auth_token") ||
      localStorage.getItem("authToken") ||
      ""
  );
  const [shopId, setShopId] = useState("");
  const [code, setCode] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [err, setErr] = useState("");

  const item = useMemo(() => result?.data?.item ?? null, [result]);

  async function resolveScan(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr("");
    setResult(null);

    try {
      const data = await apiFetch("/items/scan", {
        method: "POST",
        token,
        body: JSON.stringify({ shopId, code }),
      });

      setResult(data);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Scan failed";
      setErr(message);
    }
  }

  async function markSold() {
    if (!item?.id) return;

    setErr("");

    try {
      const data = await apiFetch(`/items/${item.id}/sell`, {
        method: "POST",
        token,
      });

      setResult((prev) => ({
        ...(prev || {}),
        sold: data,
      }));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Sell action failed";
      setErr(message);
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 16 }}>
      <h2>Scan Console</h2>
      <p style={{ opacity: 0.8 }}>
        Experimental tool. Requires backend support for <code>/items/scan</code> and{" "}
        <code>/items/:id/sell</code>.
      </p>

      <form onSubmit={resolveScan} style={{ display: "grid", gap: 10, maxWidth: 520 }}>
        <input
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Bearer token"
          style={{ padding: 10 }}
        />
        <input
          value={shopId}
          onChange={(e) => setShopId(e.target.value)}
          placeholder="Shop ID"
          style={{ padding: 10 }}
        />
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Scan code (PWN-... or UPC)"
          style={{ padding: 10 }}
        />
        <button style={{ padding: 10 }} type="submit">
          Resolve Scan
        </button>
      </form>

      {err ? <div style={{ color: "crimson", marginTop: 10 }}>{err}</div> : null}

      {result ? (
        <div
          style={{
            marginTop: 16,
            border: "1px solid #eee",
            borderRadius: 12,
            padding: 12,
          }}
        >
          <div style={{ fontWeight: 700 }}>Result</div>
          <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(result, null, 2)}</pre>

          {item ? (
            <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
              <button onClick={markSold} style={{ padding: 10 }}>
                Mark SOLD
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}