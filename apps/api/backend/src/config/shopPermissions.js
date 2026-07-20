export const SHOP_STAFF_ROLES = Object.freeze([
  "SHOP_ADMIN",
  "SHOP_MANAGER",
  "SHOP_STAFF",
  "SHOP_VIEWER",
  "INVENTORY_MANAGER",
  "AUCTION_MANAGER",
  "SALES_ASSOCIATE",
  "FINANCE_VIEWER",
]);

export const SHOP_STAFF_STATUSES = Object.freeze([
  "INVITED",
  "ACTIVE",
  "INACTIVE",
  "ARCHIVED",
]);

export const SHOP_PERMISSION_CODES = Object.freeze([
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
]);

export const DEFAULT_SHOP_PERMISSIONS_BY_ROLE =
  Object.freeze({
    SHOP_ADMIN: Object.freeze([
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
    ]),
    SHOP_MANAGER: Object.freeze([
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
    ]),
    SHOP_STAFF: Object.freeze([
      "inventory:read",
      "auctions:read",
      "offers:read",
      "locations:read",
    ]),
    SHOP_VIEWER: Object.freeze([
      "inventory:read",
      "auctions:read",
      "offers:read",
      "locations:read",
    ]),
    INVENTORY_MANAGER: Object.freeze([
      "inventory:read",
      "inventory:write",
      "locations:read",
    ]),
    AUCTION_MANAGER: Object.freeze([
      "inventory:read",
      "auctions:read",
      "auctions:write",
    ]),
    SALES_ASSOCIATE: Object.freeze([
      "inventory:read",
      "offers:read",
      "offers:write",
    ]),
    FINANCE_VIEWER: Object.freeze([
      "settlements:read",
      "offers:read",
    ]),
  });

export function isShopPermission(value) {
  return SHOP_PERMISSION_CODES.includes(
    String(value || "").trim().toLowerCase(),
  );
}
