import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { adminApi } from "../services/adminApi";
import "./admin-operations.css";

type EndpointStatus = "idle" | "loading" | "ready" | "error";

type EndpointConfig = {
  label: string;
  path: string;
  note: string;
};

type EndpointResult = {
  status: EndpointStatus;
  count: number | null;
  message: string;
};

type AdminOperationsPageProps = {
  eyebrow: string;
  title: string;
  description: string;
  primaryAction?: {
    label: string;
    to: string;
  };
  metrics: Array<{
    label: string;
    value: string;
    note: string;
  }>;
  endpoints: EndpointConfig[];
  checklist: string[];
  links: Array<{
    label: string;
    to: string;
  }>;
};

function getCount(payload: unknown): number | null {
  if (Array.isArray(payload)) return payload.length;
  if (!payload || typeof payload !== "object") return null;

  const record = payload as Record<string, unknown>;

  if (typeof record.total === "number") return record.total;

  for (const key of [
    "rows",
    "items",
    "users",
    "shops",
    "auctions",
    "offers",
    "settlements",
    "subscriptions",
    "settings",
    "plans",
  ]) {
    const value = record[key];
    if (Array.isArray(value)) return value.length;
  }

  const data = record.data;
  if (Array.isArray(data)) return data.length;

  if (data && typeof data === "object") {
    return getCount(data);
  }

  return null;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error || "Request failed");
}

export default function AdminOperationsPage({
  eyebrow,
  title,
  description,
  primaryAction,
  metrics,
  endpoints,
  checklist,
  links,
}: AdminOperationsPageProps) {
  const [results, setResults] = useState<Record<string, EndpointResult>>({});

  useEffect(() => {
    let active = true;

    async function loadEndpoints() {
      const initial: Record<string, EndpointResult> = {};
      endpoints.forEach((endpoint) => {
        initial[endpoint.path] = {
          status: "loading",
          count: null,
          message: "Loading",
        };
      });

      setResults(initial);

      const loadedEntries = await Promise.all(
        endpoints.map(async (endpoint) => {
          try {
            const payload = await adminApi.request<unknown>(endpoint.path);
            return [
              endpoint.path,
              {
                status: "ready" as const,
                count: getCount(payload),
                message: "Connected",
              },
            ] as const;
          } catch (error) {
            return [
              endpoint.path,
              {
                status: "error" as const,
                count: null,
                message: getErrorMessage(error),
              },
            ] as const;
          }
        })
      );

      if (!active) return;

      setResults(Object.fromEntries(loadedEntries));
    }

    loadEndpoints();

    return () => {
      active = false;
    };
  }, [endpoints]);

  return (
    <main className="admin-ops-page">
      <section className="admin-ops-hero">
        <p className="admin-ops-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>

        <div className="admin-ops-actions">
          {primaryAction ? (
            <Link className="admin-ops-button" to={primaryAction.to}>
              {primaryAction.label}
            </Link>
          ) : null}
        </div>
      </section>

      <section className="admin-ops-grid" aria-label={`${title} metrics`}>
        {metrics.map((metric) => (
          <article className="admin-ops-card" key={metric.label}>
            <p className="admin-ops-eyebrow">{metric.label}</p>
            <div className="admin-ops-stat">{metric.value}</div>
            <p>{metric.note}</p>
          </article>
        ))}
      </section>

      <section className="admin-ops-card">
        <h2>Operational checks</h2>
        <div className="admin-ops-endpoints">
          {endpoints.map((endpoint) => {
            const result = results[endpoint.path] || {
              status: "idle" as const,
              count: null,
              message: "Waiting",
            };

            const chipClass =
              result.status === "ready"
                ? "good"
                : result.status === "error"
                  ? "bad"
                  : "warn";

            return (
              <article className="admin-ops-endpoint" key={endpoint.path}>
                <div className="admin-ops-endpoint-head">
                  <strong>{endpoint.label}</strong>
                  <span className={`admin-ops-chip ${chipClass}`}>
                    {result.status === "ready"
                      ? `Ready${result.count === null ? "" : ` · ${result.count}`}`
                      : result.message}
                  </span>
                </div>
                <div className="admin-ops-code">{endpoint.path}</div>
                <p>{endpoint.note}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="admin-ops-grid">
        <article className="admin-ops-card">
          <h2>Admin checklist</h2>
          <ul className="admin-ops-list">
            {checklist.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>

        <article className="admin-ops-card">
          <h2>Related controls</h2>
          <div className="admin-ops-links">
            {links.map((link) => (
              <Link className="admin-ops-link" key={link.to} to={link.to}>
                {link.label}
              </Link>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}
