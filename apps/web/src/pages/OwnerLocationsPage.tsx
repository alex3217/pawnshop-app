// File: apps/web/src/pages/OwnerLocationsPage.tsx

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Link, useOutletContext } from "react-router-dom";
import { getAuthToken } from "../services/auth";
import { getMyLocations, updateLocation, verifyLocation } from "../services/locations";
import { updateShopBranding } from "../services/ownerPhotoWorkflows";
import "../styles/owner-locations-readability.css";
import { selectActiveOwnerShopId, setActiveOwnerShopId } from "../services/ownerActiveShop";
import { shopHasPermission, type ShopAccessSnapshot } from "../services/shopAccess";

type LocationRecord = {
  id: string;
  name: string;
  address: string;
  addressLine2: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  mapVerificationRequired: boolean;
  phone: string;
  hours: string;
  description: string;
  staffCount: number;
  inventoryCount: number;
  status: string;
};

type ApiLocationRecord = Partial<{
  id: string;
  name: string;
  shopName: string;
  title: string;
  address: string;
  addressLine2: string;
  city: string;
  state: string;
  zip: string;
  postalCode: string;
  country: string;
  latitude: number;
  longitude: number;
  mapVerificationRequired: boolean;
  location: string;
  phone: string;
  hours: string;
  description: string;
  staffCount: number;
  inventoryCount: number;
  itemCount: number;
  status: string;
}>;

type LocationEditForm = Pick<LocationRecord, "name" | "address" | "addressLine2" | "city" | "state" | "zip" | "country" | "phone" | "hours" | "description">;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeStatus(value: string | undefined) {
  const normalized = String(value || "ACTIVE").trim().toUpperCase();
  return normalized || "ACTIVE";
}

function normalizeLocation(
  row: ApiLocationRecord,
  index: number,
): LocationRecord {
  return {
    id: String(row.id || `location-${index}`),
    name: String(
      row.name || row.shopName || row.title || `Location ${index + 1}`,
    ),
    address: String(row.address || row.location || ""),
    addressLine2: String(row.addressLine2 || ""),
    city: String(row.city || ""),
    state: String(row.state || ""),
    zip: String(row.zip || row.postalCode || ""),
    country: String(row.country || "US"),
    latitude: Number.isFinite(row.latitude) ? Number(row.latitude) : null,
    longitude: Number.isFinite(row.longitude) ? Number(row.longitude) : null,
    mapVerificationRequired: row.mapVerificationRequired === true,
    phone: String(row.phone || "—"),
    hours: String(row.hours || "—"),
    description: String(row.description || ""),
    staffCount: Number.isFinite(row.staffCount) ? Number(row.staffCount) : 0,
    inventoryCount: Number.isFinite(row.inventoryCount)
      ? Number(row.inventoryCount)
      : Number.isFinite(row.itemCount)
        ? Number(row.itemCount)
        : 0,
    status: normalizeStatus(row.status),
  };
}

function extractLocationRows(payload: unknown): ApiLocationRecord[] {
  if (Array.isArray(payload)) return payload as ApiLocationRecord[];

  if (isObject(payload)) {
    if (Array.isArray(payload.data)) {
      return payload.data as ApiLocationRecord[];
    }
    if (Array.isArray(payload.shops)) {
      return payload.shops as ApiLocationRecord[];
    }
    if (Array.isArray(payload.locations)) {
      return payload.locations as ApiLocationRecord[];
    }
  }

  return [];
}


function sortLocations(items: LocationRecord[]) {
  return [...items].sort((a, b) => a.name.localeCompare(b.name));
}

async function fetchOwnerLocations(
  signal?: AbortSignal,
): Promise<LocationRecord[]> {
  const token = getAuthToken();
  if (!token) {
    throw new Error("Missing owner token. Please log in again.");
  }

  try {
    const locations = await getMyLocations(signal);
    const locationRows = extractLocationRows(locations);

    if (locationRows.length > 0) {
      return sortLocations(
        locationRows.map((row: ApiLocationRecord, index: number) =>
          normalizeLocation(row, index),
        ),
      );
    }

    return [];
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }

    throw error instanceof Error
      ? error
      : new Error("Unable to load owner locations.");
  }
}

export default function OwnerLocationsPage() {
  const { shopAccess } = useOutletContext<{ shopAccess: ShopAccessSnapshot }>();
  const editHeadingRef = useRef<HTMLHeadingElement>(null);
  const [locations, setLocations] = useState<LocationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [verificationFailures, setVerificationFailures] = useState<Set<string>>(new Set());
  const [editForm, setEditForm] = useState<LocationEditForm>({
    name: "",
    address: "",
    addressLine2: "",
    city: "",
    state: "",
    zip: "",
    country: "US",
    phone: "",
    hours: "",
    description: "",
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);

  const load = useCallback(
    async (
      mode: "initial" | "refresh" = "initial",
      signal?: AbortSignal,
    ) => {
      if (mode === "refresh") setRefreshing(true);
      else setLoading(true);

      setError("");

      try {
        const data = await fetchOwnerLocations(signal);
        setLocations(data);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to load locations.");
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

  useEffect(() => {
    if (loading || editingId || locations.length === 0 || !window.location.hash) return;
    const queryShopId = new URLSearchParams(window.location.search).get("shopId") || "";
    const shopId = selectActiveOwnerShopId(locations, queryShopId);
    const location = locations.find((item) => item.id === shopId) || locations[0];
    beginEditLocation(location);
  }, [editingId, loading, locations]);

  useEffect(() => {
    if (loading || !editingId) return;

    const revealDeepLinkedField = () => {
      const target = document.getElementById(window.location.hash.slice(1));
      if (!target) return;

      target.scrollIntoView({ block: "center", inline: "nearest" });
      const headerBottom = document.querySelector(".site-header")?.getBoundingClientRect().bottom || 0;
      const targetTop = target.getBoundingClientRect().top;
      if (targetTop < headerBottom) window.scrollBy({ top: targetTop - headerBottom - 16 });
    };

    revealDeepLinkedField();
    window.addEventListener("hashchange", revealDeepLinkedField);
    return () => window.removeEventListener("hashchange", revealDeepLinkedField);
  }, [editingId, loading]);

  function beginEditLocation(location: LocationRecord) {
    setActionMessage("");
    setActionError("");
    setEditingId(location.id);
    setActiveOwnerShopId(location.id);
    setEditForm({
      name: location.name || "",
      address: location.address || "",
      addressLine2: location.addressLine2 || "",
      city: location.city,
      state: location.state,
      zip: location.zip,
      country: location.country || "US",
      phone: location.phone === "—" ? "" : location.phone,
      hours: location.hours === "—" ? "" : location.hours,
      description: location.description || "",
    });
    setLogoFile(null);
    setBannerFile(null);
    window.requestAnimationFrame(() => editHeadingRef.current?.focus());
  }

  function cancelEditLocation() {
    setEditingId(null);
    setActionError("");
    setEditForm({
      name: "",
      address: "",
      addressLine2: "",
      city: "",
      state: "",
      zip: "",
      country: "US",
      phone: "",
      hours: "",
      description: "",
    });
    setLogoFile(null);
    setBannerFile(null);
  }

  async function saveLocation(id: string) {
    const name = editForm.name.trim();

    if (!name) {
      setActionError("Location name is required.");
      return;
    }

    setSavingId(id);
    setActionMessage("");
    setActionError("");

    try {
      const address = editForm.address.trim();
      const city = editForm.city.trim();
      const addressLine2 = editForm.addressLine2.trim();
      const state = editForm.state.trim();
      const postalCode = editForm.zip.trim();
      const country = editForm.country.trim().toUpperCase();
      const phone = editForm.phone.trim();
      const hours = editForm.hours.trim();
      const description = editForm.description.trim();

      const updated = await updateLocation(id, {
        name,
        address,
        addressLine2,
        city,
        state,
        postalCode,
        country,
        phone,
        hours,
        description,
      });
      if (logoFile || bannerFile) {
        await updateShopBranding(id, {}, logoFile, bannerFile);
      }

      setLocations((current) =>
        sortLocations(
          current.map((item) =>
            item.id === id
              ? {
                  ...item,
                  name,
                  address,
                  addressLine2,
                  city,
                  state,
                  zip: postalCode,
                  country,
                  latitude: updated.latitude ?? null,
                  longitude: updated.longitude ?? null,
                  mapVerificationRequired: updated.mapVerificationRequired === true,
                  phone: phone || "—",
                  hours: hours || "—",
                  description,
                }
              : item,
          ),
        ),
      );

      setEditingId(null);
      setLogoFile(null);
      setBannerFile(null);
      setActionMessage("Shop profile updated.");
      setVerificationFailures((current) => { const next = new Set(current); next.delete(id); return next; });
      window.dispatchEvent(new CustomEvent("pawnloop:owner-setup-updated"));
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to update location.",
      );
    } finally {
      setSavingId(null);
    }
  }

  async function verifyMapLocation(id: string) {
    setSavingId(id);
    setActionMessage("");
    setActionError("");
    try {
      const updated = await verifyLocation(id);
      setLocations((current) => current.map((item) => item.id === id ? {
        ...item,
        address: updated.address ?? item.address,
        city: updated.city ?? item.city,
        state: updated.state ?? item.state,
        zip: updated.zip ?? updated.postalCode ?? item.zip,
        country: updated.country ?? item.country,
        latitude: updated.latitude ?? null,
        longitude: updated.longitude ?? null,
        mapVerificationRequired: false,
      } : item));
      setVerificationFailures((current) => { const next = new Set(current); next.delete(id); return next; });
      setActionMessage("Map location verified.");
    } catch (err) {
      setVerificationFailures((current) => new Set(current).add(id));
      setActionError(err instanceof Error ? err.message : "Location verification failed.");
    } finally {
      setSavingId(null);
    }
  }

  const summary = useMemo(() => {
    return {
      count: locations.length,
      totalInventory: locations.reduce(
        (sum, item) => sum + item.inventoryCount,
        0,
      ),
      totalStaff: locations.reduce((sum, item) => sum + item.staffCount, 0),
      activeLocations: locations.filter((item) => item.status === "ACTIVE")
        .length,
    };
  }, [locations]);

  return (
    <div className="owner-locations-page" style={styles.page}>
      <div style={styles.hero}>
        <div>
          <div style={styles.eyebrow}>Owner</div>
          <h1 style={styles.title}>Shop Profile &amp; Locations</h1>
          <p style={styles.subtitle}>
            Manage your public shop details, address, map verification,
            inventory, staff, phone number, and business hours.
          </p>
        </div>

        <div style={styles.heroActions}>
          <button
            type="button"
            onClick={() => void load("refresh")}
            disabled={loading || refreshing}
            style={{
              ...styles.secondaryButton,
              ...(loading || refreshing ? styles.buttonDisabled : {}),
            }}
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>

          {shopAccess.role !== "CONSUMER" ? (
            <Link to="/owner/shops/new" style={styles.primaryLink}>
              Add location
            </Link>
          ) : null}
        </div>
      </div>

        {actionMessage ? (
          <div style={styles.actionBanner}>{actionMessage}</div>
        ) : null}

        {actionError ? (
          <div style={styles.actionError}>{actionError}</div>
        ) : null}

      <div style={styles.statsGrid}>
        <div style={styles.statCard}>
          <div style={styles.statLabel}>Locations</div>
          <div style={styles.statValue}>{summary.count}</div>
        </div>

        <div style={styles.statCard}>
          <div style={styles.statLabel}>Active locations</div>
          <div style={styles.statValue}>{summary.activeLocations}</div>
        </div>

        <div style={styles.statCard}>
          <div style={styles.statLabel}>Inventory across locations</div>
          <div style={styles.statValue}>{summary.totalInventory}</div>
        </div>

        <div style={styles.statCard}>
          <div style={styles.statLabel}>Staff assigned</div>
          <div style={styles.statValue}>{summary.totalStaff}</div>
        </div>
      </div>

      {loading ? (
        <div style={styles.stateCard}>Loading locations...</div>
      ) : error ? (
        <div style={styles.errorCard}>
          <div style={styles.emptyTitle}>Unable to load locations</div>
          <p style={styles.emptyText}>{error}</p>
        </div>
      ) : locations.length === 0 ? (
        <div style={styles.stateCard}>
          <div style={styles.emptyTitle}>No locations found</div>
          <p style={styles.emptyText}>
            Create your first shop location to start managing inventory and
            staff.
          </p>
          <Link to="/owner/shops/new" style={styles.primaryLink}>
            Create location
          </Link>
        </div>
      ) : (
        <div style={styles.list}>
          {locations.map((location) => (
            <article key={location.id} style={styles.card}>
              <div style={styles.cardHeader}>
                <div>
                  <h2 style={styles.cardTitle}>{location.name}</h2>
                  <div style={styles.metaRow}>
                    <span>{[location.address, location.addressLine2, location.city, location.state, location.zip, location.country].filter(Boolean).join(", ") || "Address not available"}</span>
                    <span>•</span>
                    <span>Status: {location.status}</span>
                  </div>
                </div>

                <div style={styles.statusPill}>{location.status}</div>
              </div>

              <div style={styles.detailGrid}>
                <div>
                  <div style={styles.detailLabel}>Map location</div>
                  <div style={styles.detailValue}>{verificationFailures.has(location.id) ? "Verification failed" : location.mapVerificationRequired ? "Address changed — verification required" : location.latitude !== null && location.longitude !== null ? "Verified" : "Missing coordinates"}</div>
                </div>
                <div>
                  <div style={styles.detailLabel}>Phone</div>
                  <div style={styles.detailValue}>{location.phone}</div>
                </div>
                <div>
                  <div style={styles.detailLabel}>Hours</div>
                  <div style={styles.detailValue}>{location.hours}</div>
                </div>
                <div>
                  <div style={styles.detailLabel}>Inventory</div>
                  <div style={styles.detailValue}>{location.inventoryCount}</div>
                </div>
                <div>
                  <div style={styles.detailLabel}>Staff</div>
                  <div style={styles.detailValue}>{location.staffCount}</div>
                </div>
              </div>

                {editingId === location.id ? (
                  <form
                    style={styles.editForm}
                    onSubmit={(event) => {
                      event.preventDefault();
                      void saveLocation(location.id);
                    }}
                  >
                    <div>
                      <h3 ref={editHeadingRef} tabIndex={-1} style={styles.formTitle}>Edit Shop Profile</h3>
                      <p style={styles.publicNote}>These shop details are publicly visible on your shop profile. Owner account information is never shown here.</p>
                    </div>
                    <div style={styles.fieldGrid}>
                      <label id="shop-name" style={styles.fieldLabel}>
                        Shop name
                        <input
                          required
                          maxLength={160}
                          value={editForm.name}
                          onChange={(event) =>
                            setEditForm((current) => ({
                              ...current,
                              name: event.target.value,
                            }))
                          }
                          style={styles.input}
                        />
                      </label>
                      <label style={styles.fieldLabel}>
                        Shop logo
                        <input type="file" accept="image/jpeg,image/png,image/webp" disabled={savingId === location.id} onChange={(event) => setLogoFile(event.target.files?.[0] || null)} style={styles.input} />
                      </label>
                      <label style={styles.fieldLabel}>
                        Shop banner
                        <input type="file" accept="image/jpeg,image/png,image/webp" disabled={savingId === location.id} onChange={(event) => setBannerFile(event.target.files?.[0] || null)} style={styles.input} />
                      </label>

                      <label id="shop-address" style={styles.fieldLabel}>
                        Street address
                        <input
                          required
                          maxLength={240}
                          value={editForm.address}
                          onChange={(event) =>
                            setEditForm((current) => ({
                              ...current,
                              address: event.target.value,
                            }))
                          }
                          style={styles.input}
                          autoComplete="address-line1"
                        />
                      </label>
                      <label style={styles.fieldLabel}>Address line 2 <span style={styles.optionalText}>(optional)</span><input value={editForm.addressLine2} onChange={(event) => setEditForm((current) => ({ ...current, addressLine2: event.target.value }))} style={styles.input} maxLength={240} autoComplete="address-line2" /></label>
                      <label style={styles.fieldLabel}>City<input required maxLength={120} value={editForm.city} onChange={(event) => setEditForm((current) => ({ ...current, city: event.target.value }))} style={styles.input} autoComplete="address-level2" /></label>
                      <label style={styles.fieldLabel}>State / region<input required maxLength={120} value={editForm.state} onChange={(event) => setEditForm((current) => ({ ...current, state: event.target.value }))} style={styles.input} autoComplete="address-level1" /></label>
                      <label style={styles.fieldLabel}>ZIP / postal code<input required maxLength={24} value={editForm.zip} onChange={(event) => setEditForm((current) => ({ ...current, zip: event.target.value }))} style={styles.input} autoComplete="postal-code" /></label>
                      <label style={styles.fieldLabel}>Country code<input required value={editForm.country} onChange={(event) => setEditForm((current) => ({ ...current, country: event.target.value }))} style={styles.input} minLength={2} maxLength={2} pattern="[A-Za-z]{2}" autoComplete="country" /></label>
                      <label id="shop-description" style={styles.fieldLabel}>
                        Public description
                        <textarea maxLength={2000} value={editForm.description} onChange={(event) => setEditForm((current) => ({ ...current, description: event.target.value }))} style={styles.input} rows={4} />
                      </label>

                      <label id="shop-phone" style={styles.fieldLabel}>
                        Public phone number
                        <input
                          type="tel"
                          maxLength={40}
                          value={editForm.phone}
                          onChange={(event) =>
                            setEditForm((current) => ({
                              ...current,
                              phone: event.target.value,
                            }))
                          }
                          style={styles.input}
                        />
                      </label>

                      <label id="shop-hours" style={styles.fieldLabel}>
                        Business hours
                        <input
                          maxLength={500}
                          value={editForm.hours}
                          onChange={(event) =>
                            setEditForm((current) => ({
                              ...current,
                              hours: event.target.value,
                            }))
                          }
                          style={styles.input}
                        />
                      </label>
                    </div>

                    {location.mapVerificationRequired || editForm.address !== location.address || editForm.addressLine2 !== location.addressLine2 || editForm.city !== location.city || editForm.state !== location.state || editForm.zip !== location.zip || editForm.country !== location.country ? (
                      <p role="status" style={styles.verificationNote}>Address changes preserve the current verified coordinates. Use “Update map location” after saving to verify the public map position again.</p>
                    ) : null}

                    <div style={styles.formActions}>
                      <button
                        type="submit"
                        disabled={savingId === location.id}
                        style={{
                          ...styles.primaryButton,
                          ...(savingId === location.id
                            ? styles.buttonDisabled
                            : {}),
                        }}
                      >
                        {savingId === location.id ? "Saving..." : "Save changes"}
                      </button>

                      <button
                        type="button"
                        onClick={cancelEditLocation}
                        disabled={savingId === location.id}
                        style={{
                          ...styles.secondaryButton,
                          ...(savingId === location.id
                            ? styles.buttonDisabled
                            : {}),
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : null}

                <div style={styles.cardActions} aria-label={`Actions for ${location.name}`}>
                  {shopHasPermission(shopAccess, location.id, "locations:write") ? (
                  <button
                    type="button"
                    onClick={() => beginEditLocation(location)}
                    disabled={savingId === location.id}
                    style={{
                      ...styles.secondaryButton,
                      ...(savingId === location.id ? styles.buttonDisabled : {}),
                    }}
                    aria-label={`Edit shop profile for ${location.name}`}
                  >
                    Edit shop profile
                  </button>
                  ) : null}

                  {shopHasPermission(shopAccess, location.id, "locations:write") ? (
                  <button type="button" onClick={() => void verifyMapLocation(location.id)} disabled={savingId === location.id} style={styles.secondaryButton} aria-label={`${location.latitude !== null && location.longitude !== null ? "Update" : "Verify"} map location for ${location.name}`}>
                    {location.latitude !== null && location.longitude !== null ? "Update map location" : "Verify location"}
                  </button>
                  ) : null}

                  <Link to={`/shops/${encodeURIComponent(location.id)}`} style={styles.secondaryLink} aria-label={`View public profile for ${location.name}`}>
                    View public profile
                  </Link>

                  <Link to={`/owner/inventory?shopId=${encodeURIComponent(location.id)}`} onClick={() => setActiveOwnerShopId(location.id)} style={styles.secondaryLink}>
                    View inventory
                  </Link>
                  <Link to={`/owner/staff?shopId=${encodeURIComponent(location.id)}`} onClick={() => setActiveOwnerShopId(location.id)} style={styles.secondaryLink}>
                    View staff
                  </Link>
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
    background: "var(--owner-locations-page-bg)",
    color: "var(--owner-locations-text)",
  },
  hero: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    flexWrap: "wrap",
  },
  heroActions: {
    display: "flex",
    gap: 10,
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
    color: "var(--owner-locations-muted)",
    lineHeight: 1.6,
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 16,
  },
  statCard: {
    border: "1px solid var(--owner-locations-soft-border)",
    background: "var(--owner-locations-card-bg)",
    borderRadius: 18,
    padding: 18,
    boxShadow: "var(--owner-locations-shadow)",
  },
  statLabel: {
    fontSize: 13,
    color: "var(--owner-locations-muted)",
    marginBottom: 8,
  },
  statValue: {
    fontSize: 28,
    fontWeight: 900,
  },
  stateCard: {
    border: "1px solid var(--owner-locations-soft-border)",
    background: "var(--owner-locations-card-bg)",
    borderRadius: 18,
    padding: 22,
    boxShadow: "var(--owner-locations-shadow)",
  },
  errorCard: {
    border: "1px solid var(--owner-locations-danger-border)",
    background: "var(--owner-locations-danger-bg)",
    color: "var(--owner-locations-danger-text)",
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
    color: "var(--owner-locations-muted)",
  },
  primaryLink: {
    display: "inline-flex",
    textDecoration: "none",
    color: "var(--owner-locations-primary-text)",
    background: "var(--owner-locations-primary-bg)",
    fontWeight: 800,
    padding: "10px 14px",
    borderRadius: 12,
  },
  secondaryButton: {
    border: "1px solid var(--owner-locations-border)",
    background: "var(--owner-locations-button-bg)",
    color: "var(--owner-locations-text)",
    borderRadius: 12,
    padding: "10px 14px",
    fontWeight: 700,
    cursor: "pointer",
  },
  buttonDisabled: {
    opacity: 0.6,
    cursor: "not-allowed",
  },
  list: {
    display: "grid",
    gap: 16,
  },
  card: {
    border: "1px solid var(--owner-locations-soft-border)",
    background: "var(--owner-locations-card-bg)",
    borderRadius: 18,
    padding: 20,
    display: "grid",
    gap: 18,
    boxShadow: "var(--owner-locations-shadow)",
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
    color: "var(--owner-locations-muted)",
    fontSize: 14,
  },
  statusPill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    padding: "10px 14px",
    background: "var(--owner-locations-success-bg)",
    border: "1px solid var(--owner-locations-success-border)",
    fontWeight: 900,
  },
  detailGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 14,
  },
  detailLabel: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "var(--owner-locations-subtle)",
    marginBottom: 6,
  },
  detailValue: {
    fontSize: 15,
    fontWeight: 700,
  },
  cardActions: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  secondaryLink: {
    textDecoration: "none",
    color: "var(--owner-locations-text)",
    border: "1px solid var(--owner-locations-border)",
    borderRadius: 12,
    padding: "10px 14px",
    fontWeight: 700,
  },
  actionBanner: {
    border: "1px solid var(--owner-locations-success-border)",
    background: "var(--owner-locations-success-bg)",
    color: "var(--owner-locations-success-text)",
    borderRadius: 16,
    padding: "12px 14px",
    fontWeight: 800,
  },
  actionError: {
    border: "1px solid var(--owner-locations-danger-border)",
    background: "var(--owner-locations-danger-bg)",
    color: "var(--owner-locations-danger-text)",
    borderRadius: 16,
    padding: "12px 14px",
    fontWeight: 800,
  },
  editForm: {
    border: "1px solid var(--owner-locations-accent-border)",
    background: "var(--owner-locations-card-bg)",
    borderRadius: 16,
    padding: 16,
    display: "grid",
    gap: 14,
  },
  formTitle: {
    margin: 0,
    fontSize: 20,
    fontWeight: 900,
  },
  publicNote: {
    margin: "6px 0 0",
    color: "var(--owner-locations-muted)",
    lineHeight: 1.5,
  },
  optionalText: {
    textTransform: "none",
    letterSpacing: 0,
    fontWeight: 600,
  },
  verificationNote: {
    margin: 0,
    border: "1px solid var(--owner-locations-accent-border)",
    borderRadius: 12,
    padding: 12,
    color: "var(--owner-locations-muted)",
    lineHeight: 1.5,
  },
  fieldGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
  },
  fieldLabel: {
    display: "grid",
    gap: 8,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "var(--owner-locations-subtle)",
    fontWeight: 800,
  },
  input: {
    border: "1px solid var(--owner-locations-border)",
    background: "var(--owner-locations-input-bg)",
    color: "var(--owner-locations-input-text)",
    borderRadius: 12,
    padding: "11px 12px",
    fontSize: 14,
    fontWeight: 700,
    textTransform: "none",
    letterSpacing: 0,
  },
  formActions: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  primaryButton: {
    border: "1px solid var(--owner-locations-primary-bg)",
    background: "var(--owner-locations-primary-bg)",
    color: "var(--owner-locations-primary-text)",
    borderRadius: 12,
    padding: "10px 14px",
    fontWeight: 800,
    cursor: "pointer",
  },

};
