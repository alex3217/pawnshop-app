// File: apps/web/src/pages/OwnerStaffPage.tsx

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { Link } from "react-router-dom";
import { getAuthToken } from "../services/auth";
import { getMyStaff, type StaffMember } from "../services/staff";

type StatusFilter = "ALL" | "ACTIVE" | "INVITED" | "INACTIVE" | "ARCHIVED";

type StaffRecord = {
  id: string;
  name: string;
  email: string;
  role: string;
  locationName: string;
  status: string;
  permissions: string[];
  invitedAt: string | null;
  acceptedAt: string | null;
  updatedAt: string | null;
};

const STATUS_FILTERS: StatusFilter[] = [
  "ALL",
  "ACTIVE",
  "INVITED",
  "INACTIVE",
  "ARCHIVED",
];

function normalizeLabel(value: string | null | undefined, fallback: string) {
  const normalized = String(value || fallback).trim();
  return normalized || fallback;
}

function normalizeUpper(value: string | null | undefined, fallback: string) {
  const normalized = String(value || fallback).trim().toUpperCase();
  return normalized || fallback;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString();
}

function normalizeStaff(row: StaffMember, index: number): StaffRecord {
  return {
    id: String(row.id || `staff-${index}`),
    name: String(row.name || row.fullName || `Staff ${index + 1}`),
    email: String(row.email || row.userEmail || "—"),
    role: normalizeUpper(row.role || row.staffRole, "TEAM_MEMBER"),
    locationName: normalizeLabel(
      row.locationName || row.shopName || row.pawnShopName,
      "Unassigned",
    ),
    status: normalizeUpper(row.status, "ACTIVE"),
    permissions: Array.isArray(row.permissions) ? row.permissions : [],
    invitedAt: row.invitedAt || null,
    acceptedAt: row.acceptedAt || null,
    updatedAt: row.updatedAt || null,
  };
}

function getStatusStyle(status: string): CSSProperties {
  const normalized = normalizeUpper(status, "ACTIVE");

  const base: CSSProperties = {
    alignSelf: "flex-start",
    borderRadius: 999,
    padding: "10px 14px",
    fontWeight: 900,
  };

  if (normalized === "ACTIVE") {
    return {
      ...base,
      background: "rgba(34,197,94,0.18)",
      border: "1px solid rgba(74,222,128,0.3)",
    };
  }

  if (normalized === "INVITED") {
    return {
      ...base,
      background: "rgba(245,158,11,0.18)",
      border: "1px solid rgba(251,191,36,0.3)",
    };
  }

  if (normalized === "ARCHIVED" || normalized === "INACTIVE") {
    return {
      ...base,
      background: "rgba(148,163,184,0.14)",
      border: "1px solid rgba(148,163,184,0.25)",
    };
  }

  return base;
}

async function fetchOwnerStaff(signal?: AbortSignal): Promise<StaffRecord[]> {
  const token = getAuthToken();

  if (!token) {
    throw new Error("Missing owner token. Please log in again.");
  }

  const response = await getMyStaff(undefined, signal);
  return response.staff.map((row, index) => normalizeStaff(row, index));
}

export default function OwnerStaffPage() {
  const [staff, setStaff] = useState<StaffRecord[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(
    async (
      mode: "initial" | "refresh" = "initial",
      signal?: AbortSignal,
    ) => {
      if (mode === "refresh") setRefreshing(true);
      else setLoading(true);

      setError("");

      try {
        const data = await fetchOwnerStaff(signal);
        setStaff(data);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to load staff.");
      } finally {
        if (mode === "refresh") setRefreshing(false);
        else setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load("initial", controller.signal);
    return () => controller.abort();
  }, [load]);

  const filteredStaff = useMemo(() => {
    const q = query.trim().toLowerCase();

    return staff.filter((member) => {
      const statusMatches =
        statusFilter === "ALL" || member.status === statusFilter;

      const queryMatches =
        !q ||
        [
          member.name,
          member.email,
          member.role,
          member.locationName,
          member.status,
          ...member.permissions,
        ]
          .join(" ")
          .toLowerCase()
          .includes(q);

      return statusMatches && queryMatches;
    });
  }, [query, staff, statusFilter]);

  const summary = useMemo(() => {
    return {
      staffCount: staff.length,
      activeCount: staff.filter((row) => row.status === "ACTIVE").length,
      invitedCount: staff.filter((row) => row.status === "INVITED").length,
      inactiveCount: staff.filter((row) =>
        ["INACTIVE", "ARCHIVED"].includes(row.status),
      ).length,
      locationsCovered: new Set(
        staff.map((row) => row.locationName).filter(Boolean),
      ).size,
    };
  }, [staff]);

  return (
    <div style={styles.page}>
      <div style={styles.hero}>
        <div>
          <div style={styles.eyebrow}>Owner</div>
          <h1 style={styles.title}>Staff</h1>
          <p style={styles.subtitle}>
            Review team members, roles, permissions, invitation status, and
            location coverage.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void load("refresh")}
          disabled={loading || refreshing}
          style={{
            ...styles.actionButton,
            ...(loading || refreshing ? styles.actionButtonDisabled : {}),
          }}
        >
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div style={styles.statsGrid}>
        <div style={styles.statCard}>
          <div style={styles.statLabel}>Total staff</div>
          <div style={styles.statValue}>{summary.staffCount}</div>
        </div>

        <div style={styles.statCard}>
          <div style={styles.statLabel}>Active</div>
          <div style={styles.statValue}>{summary.activeCount}</div>
        </div>

        <div style={styles.statCard}>
          <div style={styles.statLabel}>Invited</div>
          <div style={styles.statValue}>{summary.invitedCount}</div>
        </div>

        <div style={styles.statCard}>
          <div style={styles.statLabel}>Inactive/Archived</div>
          <div style={styles.statValue}>{summary.inactiveCount}</div>
        </div>

        <div style={styles.statCard}>
          <div style={styles.statLabel}>Locations covered</div>
          <div style={styles.statValue}>{summary.locationsCovered}</div>
        </div>
      </div>

      <div style={styles.filterCard}>
        <label style={styles.filterLabel}>
          Status
          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as StatusFilter)
            }
            style={styles.select}
          >
            {STATUS_FILTERS.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>

        <label style={styles.filterLabel}>
          Search
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search staff, role, location, status, permission..."
            style={styles.input}
          />
        </label>
      </div>

      {loading ? (
        <div style={styles.stateCard}>Loading staff...</div>
      ) : error ? (
        <div style={styles.errorCard}>
          <div style={styles.emptyTitle}>Unable to load staff</div>
          <p style={styles.emptyText}>{error}</p>
        </div>
      ) : staff.length === 0 ? (
        <div style={styles.stateCard}>
          <div style={styles.emptyTitle}>No staff assigned yet</div>
          <p style={styles.emptyText}>
            Staff records are not assigned to this owner yet. Once team members
            are added, they will appear here with role and location details.
          </p>
          <Link to="/owner/locations" style={styles.primaryLink}>
            Review locations
          </Link>
        </div>
      ) : filteredStaff.length === 0 ? (
        <div style={styles.stateCard}>
          <div style={styles.emptyTitle}>No matching staff</div>
          <p style={styles.emptyText}>
            Adjust the status filter or search term to find team members.
          </p>
        </div>
      ) : (
        <div style={styles.list}>
          {filteredStaff.map((member) => (
            <article key={member.id} style={styles.card}>
              <div style={styles.cardHeader}>
                <div>
                  <h2 style={styles.cardTitle}>{member.name}</h2>
                  <div style={styles.metaRow}>
                    <span>{member.email}</span>
                    <span>•</span>
                    <span>{member.locationName}</span>
                  </div>
                </div>

                <div style={getStatusStyle(member.status)}>{member.status}</div>
              </div>

              <div style={styles.detailGrid}>
                <div>
                  <div style={styles.detailLabel}>Role</div>
                  <div style={styles.detailValue}>{member.role}</div>
                </div>

                <div>
                  <div style={styles.detailLabel}>Location</div>
                  <div style={styles.detailValue}>{member.locationName}</div>
                </div>

                <div>
                  <div style={styles.detailLabel}>Invited</div>
                  <div style={styles.detailValue}>
                    {formatDate(member.invitedAt)}
                  </div>
                </div>

                <div>
                  <div style={styles.detailLabel}>Accepted</div>
                  <div style={styles.detailValue}>
                    {formatDate(member.acceptedAt)}
                  </div>
                </div>

                <div>
                  <div style={styles.detailLabel}>Last updated</div>
                  <div style={styles.detailValue}>
                    {formatDate(member.updatedAt)}
                  </div>
                </div>
              </div>

              <div style={styles.permissionsRow}>
                {member.permissions.length > 0 ? (
                  member.permissions.map((permission) => (
                    <span key={permission} style={styles.permissionPill}>
                      {permission}
                    </span>
                  ))
                ) : (
                  <span style={styles.mutedText}>No explicit permissions listed</span>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
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
    fontWeight: 800,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    opacity: 0.72,
    marginBottom: 8,
  },
  title: {
    margin: 0,
    fontSize: "clamp(2rem, 4vw, 2.6rem)",
    fontWeight: 900,
  },
  subtitle: {
    margin: "10px 0 0",
    maxWidth: 760,
    color: "rgba(238,242,255,0.78)",
    lineHeight: 1.6,
  },
  actionButton: {
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    color: "#eef2ff",
    borderRadius: 12,
    padding: "10px 14px",
    fontWeight: 700,
    cursor: "pointer",
  },
  actionButtonDisabled: {
    opacity: 0.6,
    cursor: "not-allowed",
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 16,
  },
  statCard: {
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)",
    borderRadius: 18,
    padding: 18,
  },
  statLabel: {
    fontSize: 13,
    color: "rgba(238,242,255,0.7)",
    marginBottom: 8,
  },
  statValue: {
    fontSize: 28,
    fontWeight: 900,
  },
  filterCard: {
    display: "grid",
    gridTemplateColumns: "220px minmax(220px, 1fr)",
    gap: 12,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)",
    borderRadius: 18,
    padding: 16,
  },
  filterLabel: {
    display: "grid",
    gap: 8,
    fontSize: 13,
    fontWeight: 800,
    color: "rgba(238,242,255,0.78)",
  },
  select: {
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(15,23,42,0.9)",
    color: "#eef2ff",
    borderRadius: 12,
    padding: "10px 12px",
  },
  input: {
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(15,23,42,0.9)",
    color: "#eef2ff",
    borderRadius: 12,
    padding: "10px 12px",
  },
  stateCard: {
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)",
    borderRadius: 18,
    padding: 22,
  },
  errorCard: {
    border: "1px solid rgba(255,120,120,0.25)",
    background: "rgba(255,120,120,0.09)",
    color: "#ffd4d4",
    borderRadius: 18,
    padding: 22,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 800,
    marginBottom: 8,
  },
  emptyText: {
    margin: 0,
    color: "rgba(238,242,255,0.76)",
  },
  primaryLink: {
    display: "inline-flex",
    marginTop: 16,
    color: "#0b1020",
    background: "#eef2ff",
    textDecoration: "none",
    fontWeight: 800,
    padding: "10px 14px",
    borderRadius: 12,
  },
  list: {
    display: "grid",
    gap: 16,
  },
  card: {
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)",
    borderRadius: 18,
    padding: 20,
    display: "grid",
    gap: 18,
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
  },
  cardTitle: {
    margin: 0,
    fontSize: 22,
    fontWeight: 800,
  },
  metaRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 8,
    color: "rgba(238,242,255,0.72)",
    fontSize: 14,
  },
  detailGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 14,
  },
  detailLabel: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "rgba(238,242,255,0.6)",
    marginBottom: 6,
  },
  detailValue: {
    fontSize: 15,
    fontWeight: 700,
  },
  permissionsRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  permissionPill: {
    border: "1px solid rgba(147,197,253,0.28)",
    background: "rgba(59,130,246,0.12)",
    borderRadius: 999,
    padding: "6px 10px",
    fontSize: 12,
    fontWeight: 800,
  },
  mutedText: {
    color: "rgba(238,242,255,0.58)",
    fontSize: 13,
  },
};
