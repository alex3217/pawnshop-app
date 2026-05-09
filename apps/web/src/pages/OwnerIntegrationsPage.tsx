// File: apps/web/src/pages/OwnerIntegrationsPage.tsx

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import {
  getOwnerIntegrationOverview,
  type OwnerIntegrationConnector,
  type OwnerIntegrationOverview,
} from "../services/integrations";

function statusLabel(status: OwnerIntegrationConnector["status"]) {
  if (status === "READY") return "Ready";
  if (status === "CONNECTED") return "Connected";
  if (status === "NEEDS_SETUP") return "Needs setup";
  return "Coming soon";
}

function statusStyle(status: OwnerIntegrationConnector["status"]): CSSProperties {
  const base: CSSProperties = {
    alignSelf: "flex-start",
    borderRadius: 999,
    padding: "8px 12px",
    fontSize: 12,
    fontWeight: 900,
    border: "1px solid rgba(255,255,255,0.14)",
  };

  if (status === "READY" || status === "CONNECTED") {
    return {
      ...base,
      background: "rgba(34,197,94,0.12)",
      color: "#bbf7d0",
      borderColor: "rgba(74,222,128,0.28)",
    };
  }

  if (status === "NEEDS_SETUP") {
    return {
      ...base,
      background: "rgba(245,158,11,0.12)",
      color: "#fde68a",
      borderColor: "rgba(251,191,36,0.28)",
    };
  }

  return {
    ...base,
    background: "rgba(148,163,184,0.1)",
    color: "#cbd5e1",
    borderColor: "rgba(148,163,184,0.24)",
  };
}

export default function OwnerIntegrationsPage() {
  const [overview, setOverview] = useState<OwnerIntegrationOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadOverview() {
      setLoading(true);
      setError("");

      try {
        const data = await getOwnerIntegrationOverview(controller.signal);
        setOverview(data);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load owner integrations.",
        );
      } finally {
        setLoading(false);
      }
    }

    void loadOverview();

    return () => controller.abort();
  }, []);

  const shopSummary = useMemo(() => {
    const shops = overview?.shops || [];
    if (shops.length === 0) return "No shops connected yet.";
    if (shops.length === 1) return `${shops[0]?.name || "1 shop"} ready for sync.`;
    return `${shops.length} shops ready for sync.`;
  }, [overview]);

  const connectors = overview?.connectors || [];

  return (
    <div style={styles.page}>
      <section style={styles.hero}>
        <div>
          <div style={styles.eyebrow}>Owner tools</div>
          <h1 style={styles.title}>Owner Integrations</h1>
          <p style={styles.subtitle}>
            Connect inventory sources, import CSV files, scan items from mobile,
            and prepare live sync connections for your pawnshop inventory.
          </p>
        </div>

        <div style={styles.heroActions}>
          <Link to="/owner/bulk-upload" style={styles.primaryLink}>
            Upload inventory
          </Link>
          <Link to="/owner/scan-console" style={styles.secondaryLink}>
            Open scanner
          </Link>
        </div>
      </section>

      {error ? (
        <div style={styles.errorCard}>
          <strong>Integrations failed to load</strong>
          <p style={styles.messageText}>{error}</p>
        </div>
      ) : null}

      <section style={styles.statsGrid}>
        <div style={styles.statCard}>
          <div style={styles.statLabel}>Shops available</div>
          <div style={styles.statValue}>{overview?.shops.length ?? "—"}</div>
          <div style={styles.statHelper}>{shopSummary}</div>
        </div>

        <div style={styles.statCard}>
          <div style={styles.statLabel}>Ready tools</div>
          <div style={styles.statValue}>{overview?.readyCount ?? "—"}</div>
          <div style={styles.statHelper}>CSV upload and mobile scanning.</div>
        </div>

        <div style={styles.statCard}>
          <div style={styles.statLabel}>Planned connectors</div>
          <div style={styles.statValue}>{overview?.comingSoonCount ?? "—"}</div>
          <div style={styles.statHelper}>API, webhook, SFTP, POS systems.</div>
        </div>
      </section>

      <section style={styles.panel}>
        <div>
          <div style={styles.sectionLabel}>Live inventory sync</div>
          <h2 style={styles.sectionTitle}>Connection options</h2>
          <p style={styles.sectionText}>
            Start with CSV imports and mobile scanning today. API pull, webhook
            push, SFTP feeds, and named POS integrations will build on this hub.
          </p>
        </div>

        {loading ? (
          <div style={styles.loadingCard}>Loading integrations...</div>
        ) : (
          <div style={styles.connectorGrid}>
            {connectors.map((connector) => (
              <article key={connector.id} style={styles.connectorCard}>
                <div style={styles.connectorHeader}>
                  <div>
                    <div style={styles.connectorKind}>{connector.kind}</div>
                    <h3 style={styles.connectorTitle}>{connector.name}</h3>
                  </div>

                  <span style={statusStyle(connector.status)}>
                    {statusLabel(connector.status)}
                  </span>
                </div>

                <p style={styles.connectorDescription}>
                  {connector.description}
                </p>

                <ul style={styles.bulletList}>
                  {connector.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>

                <div style={styles.cardActions}>
                  <Link
                    to={connector.primaryHref}
                    style={
                      connector.status === "READY"
                        ? styles.primaryLinkSmall
                        : styles.secondaryLinkSmall
                    }
                  >
                    {connector.primaryActionLabel}
                  </Link>

                  {connector.secondaryHref && connector.secondaryActionLabel ? (
                    <Link
                      to={connector.secondaryHref}
                      style={styles.secondaryLinkSmall}
                    >
                      {connector.secondaryActionLabel}
                    </Link>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section style={styles.panel}>
        <div>
          <div style={styles.sectionLabel}>Recommended rollout</div>
          <h2 style={styles.sectionTitle}>Build path</h2>
        </div>

        <div style={styles.timeline}>
          <div style={styles.timelineStep}>
            <strong>Phase 1</strong>
            <span>CSV upload, bulk import, mobile scanning.</span>
          </div>
          <div style={styles.timelineStep}>
            <strong>Phase 2</strong>
            <span>Generic API pull connector with scheduled sync.</span>
          </div>
          <div style={styles.timelineStep}>
            <strong>Phase 3</strong>
            <span>Webhook push endpoint for real-time item updates.</span>
          </div>
          <div style={styles.timelineStep}>
            <strong>Phase 4</strong>
            <span>SFTP/vendor feeds and named POS integrations.</span>
          </div>
        </div>
      </section>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    display: "grid",
    gap: 20,
  },
  hero: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    flexWrap: "wrap",
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    opacity: 0.72,
    marginBottom: 8,
  },
  title: {
    margin: 0,
    fontSize: "clamp(2rem, 5vw, 3rem)",
    fontWeight: 900,
  },
  subtitle: {
    margin: "10px 0 0",
    maxWidth: 820,
    color: "rgba(238,242,255,0.78)",
    lineHeight: 1.6,
  },
  heroActions: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  primaryLink: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    textDecoration: "none",
    border: "1px solid rgba(255,255,255,0.18)",
    background: "#eef2ff",
    color: "#0f172a",
    borderRadius: 12,
    padding: "10px 14px",
    fontWeight: 900,
  },
  secondaryLink: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    textDecoration: "none",
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    color: "#eef2ff",
    borderRadius: 12,
    padding: "10px 14px",
    fontWeight: 800,
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 16,
  },
  statCard: {
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)",
    borderRadius: 18,
    padding: 18,
  },
  statLabel: {
    color: "rgba(238,242,255,0.68)",
    fontSize: 13,
    fontWeight: 800,
  },
  statValue: {
    marginTop: 8,
    fontSize: 34,
    fontWeight: 900,
  },
  statHelper: {
    marginTop: 6,
    color: "rgba(238,242,255,0.66)",
    fontSize: 13,
  },
  panel: {
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)",
    borderRadius: 18,
    padding: 18,
    display: "grid",
    gap: 18,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: "0.09em",
    textTransform: "uppercase",
    color: "rgba(147,197,253,0.9)",
  },
  sectionTitle: {
    margin: "6px 0 0",
    fontSize: 24,
    fontWeight: 900,
  },
  sectionText: {
    margin: "8px 0 0",
    maxWidth: 820,
    color: "rgba(238,242,255,0.72)",
    lineHeight: 1.55,
  },
  loadingCard: {
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(15,23,42,0.48)",
    borderRadius: 14,
    padding: 16,
  },
  connectorGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: 14,
  },
  connectorCard: {
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(15,23,42,0.54)",
    borderRadius: 16,
    padding: 16,
    display: "grid",
    gap: 14,
  },
  connectorHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
  },
  connectorKind: {
    color: "rgba(147,197,253,0.86)",
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: "0.08em",
  },
  connectorTitle: {
    margin: "4px 0 0",
    fontSize: 19,
    fontWeight: 900,
  },
  connectorDescription: {
    margin: 0,
    color: "rgba(238,242,255,0.72)",
    lineHeight: 1.5,
  },
  bulletList: {
    margin: 0,
    paddingLeft: 20,
    color: "rgba(238,242,255,0.74)",
    lineHeight: 1.7,
  },
  cardActions: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
  },
  primaryLinkSmall: {
    display: "inline-flex",
    textDecoration: "none",
    borderRadius: 12,
    padding: "9px 12px",
    background: "#eef2ff",
    color: "#0f172a",
    fontWeight: 900,
  },
  secondaryLinkSmall: {
    display: "inline-flex",
    textDecoration: "none",
    borderRadius: 12,
    padding: "9px 12px",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
    color: "#eef2ff",
    fontWeight: 800,
  },
  timeline: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
  },
  timelineStep: {
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(15,23,42,0.48)",
    borderRadius: 14,
    padding: 14,
    display: "grid",
    gap: 6,
    color: "rgba(238,242,255,0.76)",
  },
  errorCard: {
    border: "1px solid rgba(248,113,113,0.3)",
    background: "rgba(248,113,113,0.1)",
    color: "#fecaca",
    borderRadius: 18,
    padding: 16,
  },
  messageText: {
    margin: "6px 0 0",
  },
};
