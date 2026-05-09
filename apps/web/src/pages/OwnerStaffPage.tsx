// File: apps/web/src/pages/OwnerStaffPage.tsx

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import { Link } from "react-router-dom";
import {
  activateStaffMember,
  archiveStaffMember,
  createStaffMember,
  deactivateStaffMember,
  getMyStaff,
  getStaffAssignableShops,
  updateStaffMember,
  type StaffMember,
  type StaffPermission,
  type StaffRole,
  type StaffShopOption,
  type StaffStatus,
} from "../services/staff";

type StatusFilter = "ALL" | "ACTIVE" | "INVITED" | "INACTIVE" | "ARCHIVED";

type StaffRecord = {
  id: string;
  shopId: string;
  userId: string | null;
  name: string;
  email: string;
  phone: string;
  role: StaffRole;
  locationName: string;
  status: StaffStatus;
  permissions: StaffPermission[];
  invitedAt: string | null;
  acceptedAt: string | null;
  updatedAt: string | null;
};

type StaffFormState = {
  id: string;
  shopId: string;
  name: string;
  email: string;
  phone: string;
  role: StaffRole;
  status: StaffStatus;
  permissions: StaffPermission[];
};

const STATUS_FILTERS: StatusFilter[] = [
  "ALL",
  "ACTIVE",
  "INVITED",
  "INACTIVE",
  "ARCHIVED",
];

const STAFF_ROLES: StaffRole[] = [
  "SHOP_ADMIN",
  "SHOP_MANAGER",
  "SHOP_STAFF",
  "SHOP_VIEWER",
  "INVENTORY_MANAGER",
  "AUCTION_MANAGER",
  "SALES_ASSOCIATE",
  "FINANCE_VIEWER",
];

const STAFF_STATUSES: StaffStatus[] = [
  "INVITED",
  "ACTIVE",
  "INACTIVE",
  "ARCHIVED",
];

const STAFF_PERMISSIONS: StaffPermission[] = [
  "inventory:read",
  "inventory:write",
  "auctions:read",
  "auctions:write",
  "offers:read",
  "offers:write",
  "locations:read",
  "locations:write",
  "staff:read",
  "staff:write",
  "settlements:read",
];

const DEFAULT_PERMISSIONS_BY_ROLE: Record<string, StaffPermission[]> = {
  SHOP_ADMIN: [
    "inventory:read",
    "inventory:write",
    "auctions:read",
    "auctions:write",
    "offers:read",
    "offers:write",
    "locations:read",
    "locations:write",
    "staff:read",
    "staff:write",
    "settlements:read",
  ],
  SHOP_MANAGER: [
    "inventory:read",
    "inventory:write",
    "auctions:read",
    "auctions:write",
    "offers:read",
    "offers:write",
    "locations:read",
    "locations:write",
    "staff:read",
    "settlements:read",
  ],
  SHOP_STAFF: ["inventory:read", "auctions:read", "offers:read", "locations:read"],
  SHOP_VIEWER: ["inventory:read", "auctions:read", "offers:read", "locations:read"],
  INVENTORY_MANAGER: ["inventory:read", "inventory:write", "locations:read"],
  AUCTION_MANAGER: ["inventory:read", "auctions:read", "auctions:write"],
  SALES_ASSOCIATE: ["inventory:read", "offers:read", "offers:write"],
  FINANCE_VIEWER: ["settlements:read", "offers:read"],
};

const EMPTY_FORM: StaffFormState = {
  id: "",
  shopId: "",
  name: "",
  email: "",
  phone: "",
  role: "SHOP_STAFF",
  status: "INVITED",
  permissions: DEFAULT_PERMISSIONS_BY_ROLE.SHOP_STAFF,
};

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
    shopId: String(row.shopId || ""),
    userId: row.userId ? String(row.userId) : null,
    name: String(row.name || row.fullName || `Staff ${index + 1}`),
    email: String(row.email || row.userEmail || "—"),
    phone: String(row.phone || ""),
    role: normalizeUpper(row.role || row.staffRole, "SHOP_STAFF"),
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

function getDefaultPermissions(role: StaffRole) {
  return DEFAULT_PERMISSIONS_BY_ROLE[String(role).toUpperCase()] || [];
}

function buildEmptyForm(shops: StaffShopOption[]): StaffFormState {
  return {
    ...EMPTY_FORM,
    shopId: shops[0]?.id || "",
  };
}

export default function OwnerStaffPage() {
  const [staff, setStaff] = useState<StaffRecord[]>([]);
  const [shops, setShops] = useState<StaffShopOption[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<StaffFormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(
    async (
      mode: "initial" | "refresh" = "initial",
      signal?: AbortSignal,
    ) => {
      if (mode === "refresh") setRefreshing(true);
      else setLoading(true);

      setError("");

      try {
        const [staffResponse, shopRows] = await Promise.all([
          getMyStaff(undefined, signal),
          getStaffAssignableShops(signal),
        ]);

        const normalizedStaff = staffResponse.staff.map((row, index) =>
          normalizeStaff(row, index),
        );

        setStaff(normalizedStaff);
        setShops(shopRows);

        setForm((current) => {
          if (current.shopId || shopRows.length === 0) return current;
          return {
            ...current,
            shopId: shopRows[0]?.id || "",
          };
        });
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

  function resetForm() {
    setEditingId("");
    setForm(buildEmptyForm(shops));
    setError("");
    setSuccess("");
  }

  function startEdit(member: StaffRecord) {
    setEditingId(member.id);
    setForm({
      id: member.id,
      shopId: member.shopId || shops[0]?.id || "",
      name: member.name === "—" ? "" : member.name,
      email: member.email === "—" ? "" : member.email,
      phone: member.phone || "",
      role: member.role || "SHOP_STAFF",
      status: member.status || "ACTIVE",
      permissions: member.permissions.length
        ? member.permissions
        : getDefaultPermissions(member.role || "SHOP_STAFF"),
    });
    setError("");
    setSuccess("");
  }

  function updateForm<K extends keyof StaffFormState>(
    key: K,
    value: StaffFormState[K],
  ) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function updateRole(role: StaffRole) {
    setForm((current) => ({
      ...current,
      role,
      permissions: getDefaultPermissions(role),
    }));
  }

  function togglePermission(permission: StaffPermission) {
    setForm((current) => {
      const exists = current.permissions.includes(permission);

      return {
        ...current,
        permissions: exists
          ? current.permissions.filter((item) => item !== permission)
          : [...current.permissions, permission],
      };
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      if (!form.shopId) throw new Error("Choose a shop/location.");
      if (!form.email.trim()) throw new Error("Enter a staff email.");

      if (editingId) {
        await updateStaffMember(editingId, {
          email: form.email,
          name: form.name,
          phone: form.phone,
          role: form.role,
          status: form.status,
          permissions: form.permissions,
        });

        setSuccess("Staff member updated.");
      } else {
        await createStaffMember({
          shopId: form.shopId,
          email: form.email,
          name: form.name,
          phone: form.phone,
          role: form.role,
          permissions: form.permissions,
        });

        setSuccess("Staff member added.");
      }

      resetForm();
      await load("refresh");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save staff.");
    } finally {
      setSaving(false);
    }
  }

  async function runAction(member: StaffRecord, action: "ACTIVE" | "INACTIVE" | "ARCHIVED") {
    setActionId(member.id);
    setError("");
    setSuccess("");

    try {
      if (action === "ACTIVE") {
        await activateStaffMember(member.id);
        setSuccess(`${member.name} activated.`);
      } else if (action === "INACTIVE") {
        await deactivateStaffMember(member.id);
        setSuccess(`${member.name} deactivated.`);
      } else {
        await archiveStaffMember(member.id);
        setSuccess(`${member.name} archived.`);
      }

      await load("refresh");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Staff action failed.");
    } finally {
      setActionId("");
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.hero}>
        <div>
          <div style={styles.eyebrow}>Owner</div>
          <h1 style={styles.title}>Staff</h1>
          <p style={styles.subtitle}>
            Add employees, assign shop access, set roles, manage permissions,
            and archive inactive team members.
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

      {error ? (
        <div style={styles.errorCard}>
          <strong>Staff action failed</strong>
          <p style={styles.messageText}>{error}</p>
        </div>
      ) : null}

      {success ? (
        <div style={styles.successCard}>
          <strong>{success}</strong>
        </div>
      ) : null}

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

      {shops.length === 0 && !loading ? (
        <div style={styles.errorCard}>
          <strong>No shop loaded for this owner</strong>
          <p style={styles.messageText}>
            Staff must be assigned to a shop. Refresh the page, confirm the
            owner has a shop, or create a shop before adding staff.
          </p>
          <Link to="/owner/shops/new" style={styles.primaryLink}>
            Create shop
          </Link>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} style={styles.formCard}>
        <div>
          <div style={styles.sectionEyebrow}>
            {editingId ? "Edit staff access" : "Add staff access"}
          </div>
          <h2 style={styles.sectionTitle}>
            {editingId ? "Update employee role" : "Invite or add employee"}
          </h2>
          <p style={styles.sectionText}>
            Assign employees to one of your shops and control what they can see
            or manage.
          </p>
        </div>

        <div style={styles.formGrid}>
          <label style={styles.filterLabel}>
            Shop / Location
            <select
              value={form.shopId}
              onChange={(event) => updateForm("shopId", event.target.value)}
              disabled={Boolean(editingId)}
              style={styles.select}
            >
              <option value="">Choose shop</option>
              {shops.map((shop) => (
                <option key={shop.id} value={shop.id}>
                  {shop.name}
                  {shop.address ? ` — ${shop.address}` : ""}
                </option>
              ))}
            </select>
          </label>

          <label style={styles.filterLabel}>
            Email
            <input
              value={form.email}
              onChange={(event) => updateForm("email", event.target.value)}
              placeholder="employee@example.com"
              style={styles.input}
            />
          </label>

          <label style={styles.filterLabel}>
            Name
            <input
              value={form.name}
              onChange={(event) => updateForm("name", event.target.value)}
              placeholder="Employee name"
              style={styles.input}
            />
          </label>

          <label style={styles.filterLabel}>
            Phone
            <input
              value={form.phone}
              onChange={(event) => updateForm("phone", event.target.value)}
              placeholder="555-0000"
              style={styles.input}
            />
          </label>

          <label style={styles.filterLabel}>
            Role
            <select
              value={form.role}
              onChange={(event) => updateRole(event.target.value)}
              style={styles.select}
            >
              {STAFF_ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </label>

          <label style={styles.filterLabel}>
            Status
            <select
              value={form.status}
              onChange={(event) => updateForm("status", event.target.value)}
              style={styles.select}
            >
              {STAFF_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div>
          <div style={styles.detailLabel}>Permissions</div>
          <div style={styles.permissionGrid}>
            {STAFF_PERMISSIONS.map((permission) => {
              const checked = form.permissions.includes(permission);

              return (
                <label key={permission} style={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => togglePermission(permission)}
                  />
                  <span>{permission}</span>
                </label>
              );
            })}
          </div>
        </div>

        <div style={styles.formActions}>
          <button
            type="submit"
            disabled={saving}
            style={{
              ...styles.primaryButton,
              ...(saving ? styles.actionButtonDisabled : {}),
            }}
          >
            {saving
              ? "Saving..."
              : editingId
                ? "Save staff changes"
                : shops.length === 0
                  ? "Add staff member"
                  : "Add staff member"}
          </button>

          {editingId ? (
            <button type="button" onClick={resetForm} style={styles.actionButton}>
              Cancel edit
            </button>
          ) : null}

          {shops.length === 0 ? (
            <Link to="/owner/shops/new" style={styles.primaryLink}>
              Create a shop first
            </Link>
          ) : null}
        </div>
      </form>

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
      ) : staff.length === 0 ? (
        <div style={styles.stateCard}>
          <div style={styles.emptyTitle}>No staff assigned yet</div>
          <p style={styles.emptyText}>
            Add your first employee above. You can assign shop access, role, and
            permissions before they start helping with inventory or auctions.
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
                  <span style={styles.mutedText}>
                    No explicit permissions listed
                  </span>
                )}
              </div>

              <div style={styles.cardActions}>
                <button
                  type="button"
                  onClick={() => startEdit(member)}
                  style={styles.actionButton}
                >
                  Edit access
                </button>

                {member.status !== "ACTIVE" ? (
                  <button
                    type="button"
                    disabled={actionId === member.id}
                    onClick={() => void runAction(member, "ACTIVE")}
                    style={styles.actionButton}
                  >
                    Activate
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={actionId === member.id}
                    onClick={() => void runAction(member, "INACTIVE")}
                    style={styles.actionButton}
                  >
                    Deactivate
                  </button>
                )}

                {member.status !== "ARCHIVED" ? (
                  <button
                    type="button"
                    disabled={actionId === member.id}
                    onClick={() => void runAction(member, "ARCHIVED")}
                    style={styles.dangerButton}
                  >
                    Archive
                  </button>
                ) : null}
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
  sectionEyebrow: {
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: "rgba(147,197,253,0.9)",
    marginBottom: 8,
  },
  sectionTitle: {
    margin: 0,
    fontSize: 24,
    fontWeight: 900,
  },
  sectionText: {
    margin: "8px 0 0",
    color: "rgba(238,242,255,0.72)",
    lineHeight: 1.5,
  },
  actionButton: {
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    color: "#eef2ff",
    borderRadius: 12,
    padding: "10px 14px",
    fontWeight: 800,
    cursor: "pointer",
  },
  actionButtonDisabled: {
    opacity: 0.6,
    cursor: "not-allowed",
  },
  primaryButton: {
    border: "1px solid rgba(255,255,255,0.2)",
    background: "#eef2ff",
    color: "#0f172a",
    borderRadius: 12,
    padding: "10px 14px",
    fontWeight: 900,
    cursor: "pointer",
  },
  dangerButton: {
    border: "1px solid rgba(248,113,113,0.32)",
    background: "rgba(248,113,113,0.12)",
    color: "#fecaca",
    borderRadius: 12,
    padding: "10px 14px",
    fontWeight: 800,
    cursor: "pointer",
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
  formCard: {
    display: "grid",
    gap: 18,
    border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(255,255,255,0.045)",
    borderRadius: 18,
    padding: 18,
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
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
  permissionGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 10,
    marginTop: 10,
  },
  checkboxLabel: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(15,23,42,0.55)",
    borderRadius: 12,
    padding: "10px 12px",
    color: "rgba(238,242,255,0.82)",
    fontSize: 13,
    fontWeight: 700,
  },
  formActions: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    alignItems: "center",
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
    padding: 18,
  },
  successCard: {
    border: "1px solid rgba(74,222,128,0.26)",
    background: "rgba(34,197,94,0.1)",
    color: "#bbf7d0",
    borderRadius: 18,
    padding: 18,
  },
  messageText: {
    margin: "6px 0 0",
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
  cardActions: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
};
