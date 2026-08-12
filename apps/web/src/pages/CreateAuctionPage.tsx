// File: apps/web/src/pages/CreateAuctionPage.tsx

import { useMemo, useState, useEffect, useRef } from "react";
import type { FormEvent } from "react";
import {
  Link,
  useNavigate,
  useOutletContext,
  useSearchParams,
} from "react-router-dom";
import { createAuction, getAuctions } from "../services/auctions";
import { getMyItems, type Item } from "../services/items";
import { getAuthToken } from "../services/auth";
import type {
  ShopCapabilityOutletContext,
} from "../components/RequireShopCapability";
import {
  shopHasPermission,
} from "../services/shopAccess";
import "../styles/create-auction-page.css";
import ItemImagePicker from "../components/ItemImagePicker";
import { createAuctionPagePhotoWorkflow } from "../services/auctionPhotoWorkflow";

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
  const [searchParams] = useSearchParams();
  const requestedItemId = searchParams.get("itemId")?.trim() || "";

  const { shopAccess } =
    useOutletContext<ShopCapabilityOutletContext>();

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
    itemId: requestedItemId,
    startPrice: "10.00",
    minIncrement: "1.00",
    startsAt: nowPlusOneHour,
    endsAt: tomorrow,
  });

  const [msg, setMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadingInventory, setLoadingInventory] = useState(true);
  const [inventoryLoadError, setInventoryLoadError] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [existingAuctionItemIds, setExistingAuctionItemIds] = useState<string[]>([]);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const photoWorkflowRef = useRef(createAuctionPagePhotoWorkflow());
  const submittingRef = useRef(false);


  const token = getAuthToken();
  const canCreateAuction =
    shopAccess.capabilities.auctionsWrite;

  const canOpenOwnerInventory = [
    "OWNER",
    "ADMIN",
    "SUPER_ADMIN",
  ].includes(
    String(shopAccess.role || "")
      .trim()
      .toUpperCase(),
  );

  const writableItems = useMemo(
    () =>
      items.filter((item) =>
        shopHasPermission(
          shopAccess,
          item.pawnShopId || item.shop?.id,
          "auctions:write",
        ),
      ),
    [items, shopAccess],
  );
  const eligibleItems = useMemo(
    () => writableItems.filter(
      (item) => !existingAuctionItemIds.includes(String(item.id)),
    ),
    [existingAuctionItemIds, writableItems],
  );
  const hasEligibleItems = eligibleItems.length > 0;
  const selectedItem = eligibleItems.find((item) => String(item.id) === form.itemId) || null;
  const canEditSelectedItem = Boolean(selectedItem && shopHasPermission(
    shopAccess,
    selectedItem.pawnShopId || selectedItem.shop?.id,
    "inventory:write",
  ));

  const startsAtIso = toIsoOrNull(form.startsAt);
  const endsAtIso = toIsoOrNull(form.endsAt);
  useEffect(() => {
    (async () => {
      setLoadingInventory(true);
      setInventoryLoadError("");
      try {
        const [itemsData, auctionsRaw] = await Promise.all([
          getMyItems(),
          getAuctions(),
        ]);

        const auctionsData = Array.isArray(auctionsRaw.auctions)
          ? auctionsRaw.auctions
          : [];

        setItems(itemsData);

        const usedIds = auctionsData
          .filter((auction) => Boolean(auction.itemId))
          .map((auction) => String(auction.itemId));

        setExistingAuctionItemIds(usedIds);
      } catch {
        setItems([]);
        setExistingAuctionItemIds([]);
        setInventoryLoadError(
          "Inventory could not be loaded. Refresh the page or open Inventory to confirm your items are available.",
        );
      } finally {
        setLoadingInventory(false);
      }
    })();
  }, []);


  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    if (key === "itemId" && value !== form.itemId) {
      setPhotoFiles([]);
      photoWorkflowRef.current.reset();
    }
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;
    setMsg(null);

    if (!token) {
      setMsg("Login as an owner to create an auction.");
      return;
    }

    if (!canCreateAuction) {
      setMsg("Your account does not have auctions:write permission.");
      return;
    }

    const itemId = form.itemId.trim();
    if (!itemId) {
      setMsg("Select an inventory item.");
      return;
    }

    const selectedItem = writableItems.find(
      (item) => String(item.id) === itemId,
    );

    const shopId = String(
      selectedItem?.pawnShopId ||
        selectedItem?.shop?.id ||
        "",
    ).trim();

    if (!selectedItem || !shopId) {
      setMsg(
        "The selected item is not available in a shop "
          + "where you have auction write permission.",
      );
      return;
    }

    if (photoFiles.length && !canEditSelectedItem) {
      setMsg("inventory:write permission is required to add auction photos.");
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

    if (!startsAtIso) {
      setMsg("Enter a valid auction start time.");
      return;
    }

    if (!endsAtIso) {
      setMsg("Enter a valid auction end time.");
      return;
    }

    const startDate = new Date(startsAtIso);
    const endDate = new Date(endsAtIso);

    if (endDate.getTime() <= startDate.getTime()) {
      setMsg("Auction end time must be after the start time.");
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);

    try {
      const auctionInput = {
        itemId,
        shopId,
        startingPrice: startPrice,
        minIncrement,
        startsAt: startsAtIso,
        endsAt: endsAtIso,
      };
      const auction = photoFiles.length
        ? await photoWorkflowRef.current.submit(
            selectedItem,
            photoFiles,
            auctionInput,
          )
        : await createAuction(auctionInput);

      setMsg("Auction created.");
      navigate(`/auctions/${auction.id}`);
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : "Failed to create auction.");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <div className="page-stack create-auction-page">
      <div className="page-card create-auction-card" style={{ display: "grid", gap: 16 }}>
        <div className="create-auction-header">
          <div>
            <h1 style={{ margin: 0 }}>Create Auction</h1>
            <p className="muted" style={{ margin: "6px 0 0" }}>
              Create a live auction for one of your pawnshop inventory items.
            </p>
          </div>

          <Link className="btn create-auction-secondary-link" to="/owner/auctions">
            Shop Auctions
          </Link>
        </div>

        {!token ? (
          <div className="alert alert-warning">
            Login before creating an auction.
          </div>
        ) : null}

        {token && !canCreateAuction ? (
          <div className="alert alert-warning">
            Your shop assignment does not include auction write permission.
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
            <span>Inventory item</span>
            <select
                value={form.itemId}
                onChange={(event) => updateForm("itemId", event.target.value)}
                disabled={submitting || loadingInventory || !hasEligibleItems}
              >
                <option value="">
                  {loadingInventory
                    ? "Loading inventory…"
                    : hasEligibleItems
                      ? "Select an inventory item"
                      : "No auction-ready inventory"}
                </option>
                {eligibleItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title || "Untitled Item"}
                    </option>
                  ))}
              </select>
            {hasEligibleItems ? (
              <small className="muted">
                {requestedItemId ? "Preselected from inventory. You can choose another item if needed." : "Choose an item from your shop inventory."}
              </small>
            ) : null}
          </label>

          {inventoryLoadError ? (
            <div className="alert alert-danger" role="alert">
              {inventoryLoadError}
            </div>
          ) : null}

          {!loadingInventory && !inventoryLoadError && items.length === 0 ? (
            <section className="create-auction-empty-state" role="status">
              <div className="create-auction-empty-icon" aria-hidden="true">+</div>
              <div className="create-auction-empty-copy">
                <h2>Add your first auction item</h2>
                <p>
                  Auctions begin with a saved inventory item. Add the item and its photos first, then return here to set the bidding details.
                </p>
                <div className="create-auction-empty-actions">
                  <Link className="btn btn-primary" to="/owner/items/new">Create Inventory Item</Link>
                  <Link className="btn create-auction-secondary-link" to="/owner/inventory">View Inventory</Link>
                </div>
              </div>
            </section>
          ) : null}

          {!loadingInventory && !inventoryLoadError && items.length > 0 && writableItems.length === 0 ? (
            <section className="create-auction-empty-state" role="status">
              <div className="create-auction-empty-icon" aria-hidden="true">!</div>
              <div className="create-auction-empty-copy">
                <h2>No auction-ready items</h2>
                <p>Your inventory exists, but your current shop access does not include auction permission for those items.</p>
                <div className="create-auction-empty-actions">
                  <Link className="btn create-auction-secondary-link" to="/owner/inventory">Review Inventory</Link>
                  <Link className="btn create-auction-secondary-link" to="/owner/auctions">Manage Auctions</Link>
                </div>
              </div>
            </section>
          ) : null}

          {!loadingInventory && !inventoryLoadError && writableItems.length > 0 && eligibleItems.length === 0 ? (
            <section className="create-auction-empty-state" role="status">
              <div className="create-auction-empty-icon" aria-hidden="true">✓</div>
              <div className="create-auction-empty-copy">
                <h2>All eligible items are already in auctions</h2>
                <p>Create another inventory item or manage an existing auction before starting a new one.</p>
                <div className="create-auction-empty-actions">
                  <Link className="btn btn-primary" to="/owner/items/new">Add Another Item</Link>
                  <Link className="btn create-auction-secondary-link" to="/owner/auctions">Manage Auctions</Link>
                </div>
              </div>
            </section>
          ) : null}

          {hasEligibleItems ? (
            selectedItem ? (
              <ItemImagePicker
                files={photoFiles}
                onChange={(files) => {
                  setPhotoFiles(files);
                  photoWorkflowRef.current.reset();
                }}
                existingImages={selectedItem.images || []}
                disabled={submitting || !canEditSelectedItem}
                disabledReason={
                  !canEditSelectedItem
                    ? "You can create this auction, but inventory:write permission is required to add or remove item photos."
                    : ""
                }
                cameraLabel="Take Auction Photo"
                galleryLabel="Choose Auction Images"
              />
            ) : (
              <div className="create-auction-photo-prompt">
                Select an inventory item above to review or add auction photos.
              </div>
            )
          ) : null}

          {hasEligibleItems ? (
            <>

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
                required
              />
              <small className="muted">
                A start time is required for production auctions.
              </small>
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

          <div className="create-auction-form-actions">
            <button
              className="btn btn-primary"
              type="submit"
              disabled={submitting || !token || !canCreateAuction}
            >
              {submitting ? "Creating…" : "Create Auction"}
            </button>

            {canOpenOwnerInventory ? (
              <Link
                className="btn create-auction-secondary-link"
                to="/owner/inventory"
              >
                Go to Inventory
              </Link>
            ) : (
              <Link
                className="btn create-auction-secondary-link"
                to="/owner/auctions"
              >
                Back to Shop Auctions
              </Link>
            )}

            <Link className="btn create-auction-secondary-link" to="/auctions">
              View Auctions
            </Link>
          </div>
            </>
          ) : null}
        </form>
      </div>
    </div>
  );
}
