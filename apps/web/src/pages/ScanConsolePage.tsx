import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { getAuthToken } from "../services/auth";
import {
  markItemSold,
  scanItem,
  type ScanPayload,
  type ScanResult,
} from "../services/items";

function toQueryValue(value: unknown) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

export default function ScanConsolePage() {
  const navigate = useNavigate();
  const [token, setToken] = useState(getAuthToken() || "");
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
      const data = await scanItem({ shopId, code }, token);
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
      const data = await markItemSold(item.id, token);

      setResult((prev) => ({
        ...(prev || {}),
        sold: data,
      }));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Sell action failed";
      setErr(message);
    }
  }

  function openCreateItemWithPrefill() {
    const payload = result?.data as ScanPayload | undefined;
    if (!payload) return;

    const sourceItem = payload.item ?? payload;

    const params = new URLSearchParams({
      shopId: toQueryValue(sourceItem.pawnShopId || shopId),
      title: toQueryValue(sourceItem.title),
      description: toQueryValue(sourceItem.description),
      price: toQueryValue(sourceItem.price),
      category: toQueryValue(sourceItem.category),
      condition: toQueryValue(sourceItem.condition),
      code: toQueryValue(payload.code || code),
      source: toQueryValue(payload.source || "scan-console"),
    });

    navigate(`/owner/items/new?${params.toString()}`);
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 16 }}>
      <h2>Scan Console</h2>
      <p style={{ opacity: 0.8 }}>
        Resolve a scanned code, then launch item creation with prefilled values.
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

          <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button onClick={openCreateItemWithPrefill} style={{ padding: 10 }}>
              Create Item From Scan
            </button>

            {item?.id ? (
              <>
                <button
                  onClick={() => navigate(`/items/${item.id}`)}
                  style={{ padding: 10 }}
                >
                  View Existing Item
                </button>

                <button onClick={markSold} style={{ padding: 10 }}>
                  Mark SOLD
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
