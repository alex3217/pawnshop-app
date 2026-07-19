import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import {
  Link,
  useNavigate,
  useSearchParams,
} from "react-router-dom";

import {
  getAuthRole,
  type Role,
} from "../services/auth";

import {
  getMyItems,
  type Item,
} from "../services/items";

import {
  createMarketplaceListing,
  type MarketplaceListingType,
} from "../services/marketplaceListings";

import {
  getMyShops,
  type Shop,
} from "../services/shops";

import "../styles/create-marketplace-listing.css";

const CUSTOMER_TYPES: MarketplaceListingType[] = [
  "CUSTOMER_TO_CUSTOMER",
  "CUSTOMER_TO_SHOP",
];

const SHOP_TYPES: MarketplaceListingType[] = [
  "SHOP_TO_CUSTOMER",
  "SHOP_TO_SHOP",
];

function readable(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(
      /\b\w/g,
      (letter) =>
        letter.toUpperCase(),
    );
}

function isShopListing(
  type: MarketplaceListingType,
) {
  return SHOP_TYPES.includes(type);
}

function listingTypesForRole(
  role: Role | null,
): MarketplaceListingType[] {
  if (role === "OWNER") {
    return SHOP_TYPES;
  }

  if (role === "CONSUMER") {
    return CUSTOMER_TYPES;
  }

  if (
    role === "ADMIN" ||
    role === "SUPER_ADMIN"
  ) {
    return [
      ...CUSTOMER_TYPES,
      ...SHOP_TYPES,
    ];
  }

  return [];
}

function defaultListingType(
  role: Role | null,
): MarketplaceListingType {
  return role === "OWNER"
    ? "SHOP_TO_CUSTOMER"
    : "CUSTOMER_TO_CUSTOMER";
}

function parseImages(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[\n,]/)
        .map(
          (image) =>
            image.trim(),
        )
        .filter(Boolean),
    ),
  ).slice(0, 20);
}

function queryValue(
  params: URLSearchParams,
  key: string,
) {
  return String(
    params.get(key) ||
    "",
  ).trim();
}

export default function CreateMarketplaceListingPage() {
  const navigate =
    useNavigate();

  const [
    searchParams,
  ] = useSearchParams();

  const scannerPrefill =
    queryValue(
      searchParams,
      "source",
    ) === "scan-console";

  const scannerCode =
    queryValue(
      searchParams,
      "scanCode",
    );

  const scannerIntakeId =
    queryValue(
      searchParams,
      "intakeId",
    );

  const scannerReviewRequired =
    queryValue(
      searchParams,
      "reviewRequired",
    ) === "true";

  const role =
    getAuthRole();

  const availableTypes =
    useMemo(
      () =>
        listingTypesForRole(
          role,
        ),
      [role],
    );

  const [
    listingType,
    setListingType,
  ] = useState<MarketplaceListingType>(
    () => {
      const requestedType =
        queryValue(
          searchParams,
          "listingType",
        ) as MarketplaceListingType;

      return availableTypes.includes(
        requestedType,
      )
        ? requestedType
        : defaultListingType(
            role,
          );
    },
  );

  const [
    shops,
    setShops,
  ] = useState<Shop[]>([]);

  const [
    items,
    setItems,
  ] = useState<Item[]>([]);

  const [
    sellerShopId,
    setSellerShopId,
  ] = useState(
    () =>
      queryValue(
        searchParams,
        "sellerShopId",
      ),
  );

  const [
    itemId,
    setItemId,
  ] = useState(
    () =>
      queryValue(
        searchParams,
        "itemId",
      ),
  );

  const [
    title,
    setTitle,
  ] = useState(
    () =>
      queryValue(
        searchParams,
        "title",
      ),
  );

  const [
    description,
    setDescription,
  ] = useState(
    () =>
      queryValue(
        searchParams,
        "description",
      ),
  );

  const [
    category,
    setCategory,
  ] = useState(
    () =>
      queryValue(
        searchParams,
        "category",
      ),
  );

  const [
    condition,
    setCondition,
  ] = useState(
    () =>
      queryValue(
        searchParams,
        "condition",
      ),
  );

  const [
    price,
    setPrice,
  ] = useState(
    () =>
      queryValue(
        searchParams,
        "price",
      ),
  );

  const [
    quantity,
    setQuantity,
  ] = useState(
    () =>
      queryValue(
        searchParams,
        "quantity",
      ) ||
      "1",
  );

  const [
    imageUrls,
    setImageUrls,
  ] = useState(
    () =>
      queryValue(
        searchParams,
        "imageUrls",
      ),
  );

  const [
    allowOffers,
    setAllowOffers,
  ] = useState(true);

  const [
    pickupAvailable,
    setPickupAvailable,
  ] = useState(true);

  const [
    shippingAvailable,
    setShippingAvailable,
  ] = useState(false);

  const [
    expiresAt,
    setExpiresAt,
  ] = useState("");

  const [
    loadingOptions,
    setLoadingOptions,
  ] = useState(false);

  const [
    submitting,
    setSubmitting,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  useEffect(() => {
    if (
      role !== "OWNER" &&
      role !== "ADMIN" &&
      role !== "SUPER_ADMIN"
    ) {
      return;
    }

    let active =
      true;

    async function loadSellerOptions() {
      setLoadingOptions(true);
      setError("");

      try {
        const [
          shopRows,
          itemRows,
        ] = await Promise.all([
          getMyShops(),
          getMyItems(),
        ]);

        if (!active) {
          return;
        }

        setShops(shopRows);
        setItems(itemRows);
      } catch (caught) {
        if (!active) {
          return;
        }

        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to load your shops and inventory.",
        );
      } finally {
        if (active) {
          setLoadingOptions(false);
        }
      }
    }

    void loadSellerOptions();

    return () => {
      active =
        false;
    };
  }, [role]);

  useEffect(() => {
    if (
      !isShopListing(
        listingType,
      ) ||
      !shops[0]
    ) {
      return;
    }

    const selectedShopExists =
      shops.some(
        (shop) =>
          shop.id ===
          sellerShopId,
      );

    if (!selectedShopExists) {
      setSellerShopId(
        shops[0].id,
      );

      setItemId("");
    }
  }, [
    listingType,
    sellerShopId,
    shops,
  ]);

  const availableItems =
    useMemo(
      () =>
        items.filter(
          (item) =>
            item.pawnShopId ===
            sellerShopId,
        ),
      [
        items,
        sellerShopId,
      ],
    );

  function handleTypeChange(
    value: MarketplaceListingType,
  ) {
    setListingType(value);

    if (
      !isShopListing(value)
    ) {
      setSellerShopId("");
      setItemId("");
    }
  }

  function handleShopChange(
    shopId: string,
  ) {
    setSellerShopId(shopId);
    setItemId("");
  }

  function handleItemChange(
    selectedItemId: string,
  ) {
    setItemId(
      selectedItemId,
    );

    const item =
      items.find(
        (candidate) =>
          candidate.id ===
          selectedItemId,
      );

    if (!item) {
      return;
    }

    setTitle(
      item.title || "",
    );

    setDescription(
      item.description || "",
    );

    setCategory(
      item.category || "",
    );

    setCondition(
      item.condition || "",
    );

    setPrice(
      String(
        item.price || "",
      ),
    );

    setImageUrls(
      Array.isArray(
        item.images,
      )
        ? item.images.join("\n")
        : "",
    );
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setError("");

    if (
      !pickupAvailable &&
      !shippingAvailable
    ) {
      setError(
        "Select pickup, shipping, or both.",
      );

      return;
    }

    if (
      isShopListing(
        listingType,
      ) &&
      !sellerShopId
    ) {
      setError(
        "Select the shop selling this item.",
      );

      return;
    }

    const parsedPrice =
      Number(price);

    const parsedQuantity =
      Number(quantity);

    if (
      !Number.isFinite(
        parsedPrice,
      ) ||
      parsedPrice <= 0
    ) {
      setError(
        "Enter a valid price greater than 0.",
      );

      return;
    }

    if (
      !Number.isInteger(
        parsedQuantity,
      ) ||
      parsedQuantity < 1
    ) {
      setError(
        "Quantity must be a positive whole number.",
      );

      return;
    }

    let normalizedExpiresAt:
      string |
      null =
        null;

    if (expiresAt) {
      const expiration =
        new Date(
          expiresAt,
        );

      if (
        Number.isNaN(
          expiration.getTime(),
        )
      ) {
        setError(
          "Enter a valid expiration date.",
        );

        return;
      }

      normalizedExpiresAt =
        expiration.toISOString();
    }

    setSubmitting(true);

    try {
      await createMarketplaceListing({
        listingType,

        sellerShopId:
          isShopListing(
            listingType,
          )
            ? sellerShopId
            : null,

        itemId:
          isShopListing(
            listingType,
          )
            ? itemId || null
            : null,

        title,

        description:
          description.trim() ||
          null,

        category:
          category.trim() ||
          null,

        condition:
          condition.trim() ||
          null,

        price:
          parsedPrice,

        currency:
          "USD",

        quantity:
          parsedQuantity,

        images:
          parseImages(
            imageUrls,
          ),

        allowOffers,
        pickupAvailable,
        shippingAvailable,

        expiresAt:
          normalizedExpiresAt,
      });

      navigate(
        "/marketplace/listings/mine",
        {
          replace: true,
        },
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to create marketplace listing.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="create-marketplace-listing-page">
      <header className="create-listing-hero">
        <div>
          <span>
            Seller workspace
          </span>

          <h1>
            Create Marketplace Listing
          </h1>

          <p>
            Save a draft listing, review it in My Listings,
            and publish it when it is ready for buyers.
          </p>
        </div>

        <div className="create-listing-hero-actions">
          <Link to="/marketplace/listings/mine">
            My Listings
          </Link>

          <Link to="/marketplace/buy-now">
            View Buy Now
          </Link>
        </div>
      </header>

      {scannerPrefill ? (
        <section
          className="create-listing-message create-listing-message-info"
          role="status"
        >
          <strong>
            Scanner prefill loaded
          </strong>

          <span>
            Review these scanned details before saving the
            marketplace listing as a draft.
          </span>

          {scannerCode ? (
            <span>
              Scanned code: {scannerCode}
            </span>
          ) : null}

          {scannerIntakeId ? (
            <span>
              Intake ID: {scannerIntakeId}
            </span>
          ) : null}

          {scannerReviewRequired ? (
            <span>
              Manual intake review is required before this
              listing should be published.
            </span>
          ) : null}
        </section>
      ) : null}

      {error ? (
        <section
          className="create-listing-message"
          role="alert"
        >
          {error}
        </section>
      ) : null}

      <form
        className="create-listing-form"
        onSubmit={handleSubmit}
      >
        <section className="create-listing-panel">
          <h2>
            Listing destination
          </h2>

          <p>
            Choose who is selling and who should be able to purchase.
          </p>

          <div className="create-listing-field-grid">
            <label>
              <span>
                Listing type
              </span>

              <select
                value={listingType}
                onChange={(event) =>
                  handleTypeChange(
                    event.target.value as MarketplaceListingType,
                  )
                }
                required
              >
                {availableTypes.map(
                  (type) => (
                    <option
                      key={type}
                      value={type}
                    >
                      {readable(type)}
                    </option>
                  ),
                )}
              </select>
            </label>

            {isShopListing(
              listingType,
            ) ? (
              <label>
                <span>
                  Seller shop
                </span>

                <select
                  value={sellerShopId}
                  onChange={(event) =>
                    handleShopChange(
                      event.target.value,
                    )
                  }
                  disabled={loadingOptions}
                  required
                >
                  <option value="">
                    Select a shop
                  </option>

                  {shops.map(
                    (shop) => (
                      <option
                        key={shop.id}
                        value={shop.id}
                      >
                        {shop.name}
                      </option>
                    ),
                  )}
                </select>
              </label>
            ) : null}

            {isShopListing(
              listingType,
            ) ? (
              <label>
                <span>
                  Link existing inventory
                </span>

                <select
                  value={itemId}
                  onChange={(event) =>
                    handleItemChange(
                      event.target.value,
                    )
                  }
                  disabled={
                    loadingOptions ||
                    !sellerShopId
                  }
                >
                  <option value="">
                    Do not link inventory
                  </option>

                  {availableItems.map(
                    (item) => (
                      <option
                        key={item.id}
                        value={item.id}
                      >
                        {item.title}
                      </option>
                    ),
                  )}
                </select>
              </label>
            ) : null}
          </div>

          {isShopListing(
            listingType,
          ) &&
          !loadingOptions &&
          shops.length === 0 ? (
            <div className="create-listing-help">
              No owned shop was found. Create a shop before
              creating a shop marketplace listing.
              {" "}
              <Link to="/owner/shops/new">
                Create shop
              </Link>
            </div>
          ) : null}
        </section>

        <section className="create-listing-panel">
          <h2>
            Item details
          </h2>

          <div className="create-listing-field-grid">
            <label className="wide">
              <span>
                Listing title
              </span>

              <input
                value={title}
                onChange={(event) =>
                  setTitle(
                    event.target.value,
                  )
                }
                maxLength={180}
                required
              />
            </label>

            <label>
              <span>
                Category
              </span>

              <input
                value={category}
                onChange={(event) =>
                  setCategory(
                    event.target.value,
                  )
                }
                placeholder="Jewelry, electronics, tools..."
              />
            </label>

            <label>
              <span>
                Condition
              </span>

              <input
                value={condition}
                onChange={(event) =>
                  setCondition(
                    event.target.value,
                  )
                }
                placeholder="New, excellent, good..."
              />
            </label>

            <label className="wide">
              <span>
                Description
              </span>

              <textarea
                value={description}
                onChange={(event) =>
                  setDescription(
                    event.target.value,
                  )
                }
                rows={6}
              />
            </label>
          </div>
        </section>

        <section className="create-listing-panel">
          <h2>
            Pricing and quantity
          </h2>

          <div className="create-listing-field-grid">
            <label>
              <span>
                Price
              </span>

              <input
                type="number"
                min="0.01"
                step="0.01"
                value={price}
                onChange={(event) =>
                  setPrice(
                    event.target.value,
                  )
                }
                required
              />
            </label>

            <label>
              <span>
                Quantity
              </span>

              <input
                type="number"
                min="1"
                step="1"
                value={quantity}
                onChange={(event) =>
                  setQuantity(
                    event.target.value,
                  )
                }
                required
              />
            </label>

            <label>
              <span>
                Optional expiration
              </span>

              <input
                type="datetime-local"
                value={expiresAt}
                onChange={(event) =>
                  setExpiresAt(
                    event.target.value,
                  )
                }
              />
            </label>
          </div>
        </section>

        <section className="create-listing-panel">
          <h2>
            Photos
          </h2>

          <label>
            <span>
              Image URLs
            </span>

            <textarea
              value={imageUrls}
              onChange={(event) =>
                setImageUrls(
                  event.target.value,
                )
              }
              rows={5}
              placeholder="Enter one image URL per line"
            />
          </label>
        </section>

        <section className="create-listing-panel">
          <h2>
            Purchase options
          </h2>

          <div className="create-listing-checkbox-grid">
            <label>
              <input
                type="checkbox"
                checked={allowOffers}
                onChange={(event) =>
                  setAllowOffers(
                    event.target.checked,
                  )
                }
              />

              <span>
                Allow buyer offers
              </span>
            </label>

            <label>
              <input
                type="checkbox"
                checked={pickupAvailable}
                onChange={(event) =>
                  setPickupAvailable(
                    event.target.checked,
                  )
                }
              />

              <span>
                Pickup available
              </span>
            </label>

            <label>
              <input
                type="checkbox"
                checked={shippingAvailable}
                onChange={(event) =>
                  setShippingAvailable(
                    event.target.checked,
                  )
                }
              />

              <span>
                Shipping available
              </span>
            </label>
          </div>
        </section>

        <footer className="create-listing-submit-row">
          <Link to="/marketplace/listings/mine">
            Cancel
          </Link>

          <button
            type="submit"
            disabled={
              submitting ||
              availableTypes.length === 0
            }
          >
            {submitting
              ? "Saving draft..."
              : "Save draft"}
          </button>
        </footer>
      </form>
    </main>
  );
}
