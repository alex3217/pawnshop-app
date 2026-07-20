import assert from "node:assert/strict";
import test from "node:test";
import {
  readFileSync,
} from "node:fs";
import {
  fileURLToPath,
} from "node:url";
import {
  dirname,
  resolve,
} from "node:path";

import {
  DEFAULT_SHOP_PERMISSIONS_BY_ROLE,
} from "../src/config/shopPermissions.js";
import {
  buildAccessibleAuctionScopeWhere,
} from "../src/controllers/auctions.controller.js";

const currentDir = dirname(
  fileURLToPath(import.meta.url),
);

const auctionRoutesSource = readFileSync(
  resolve(
    currentDir,
    "../src/routes/auctions.routes.js",
  ),
  "utf8",
);

test(
  "auction staff role defaults enforce read and write boundaries",
  () => {
    assert.deepEqual(
      DEFAULT_SHOP_PERMISSIONS_BY_ROLE
        .AUCTION_MANAGER,
      [
        "inventory:read",
        "auctions:read",
        "auctions:write",
      ],
    );

    assert.equal(
      DEFAULT_SHOP_PERMISSIONS_BY_ROLE
        .SHOP_STAFF
        .includes("auctions:read"),
      true,
    );

    assert.equal(
      DEFAULT_SHOP_PERMISSIONS_BY_ROLE
        .SHOP_STAFF
        .includes("auctions:write"),
      false,
    );

    assert.equal(
      DEFAULT_SHOP_PERMISSIONS_BY_ROLE
        .FINANCE_VIEWER
        .includes("auctions:read"),
      false,
    );
  },
);

test(
  "auction shop scope is restricted to accessible shop ids",
  () => {
    assert.deepEqual(
      buildAccessibleAuctionScopeWhere({
        unrestricted: true,
        shopIds: [],
      }),
      {},
    );

    assert.deepEqual(
      buildAccessibleAuctionScopeWhere({
        unrestricted: false,
        shopIds: [
          "shop-a",
          "shop-b",
          "shop-a",
          "",
        ],
      }),
      {
        shopId: {
          in: [
            "shop-a",
            "shop-b",
          ],
        },
      },
    );
  },
);

test(
  "auction routes require granular shop permissions",
  () => {
    assert.match(
      auctionRoutesSource,
      /requireShopPermission\("auctions:write"/,
    );

    assert.match(
      auctionRoutesSource,
      /shopIdFromAuctionParam\("id"\)/,
    );

    assert.match(
      auctionRoutesSource,
      /shopIdFromBody\("shopId"\)/,
    );

    assert.match(
      auctionRoutesSource,
      /SHOP_AUCTION_ACCESS_ROLES/,
    );

    assert.match(
      auctionRoutesSource,
      /BULK_REVIEW_ROLES/,
    );

    const writeChecks =
      auctionRoutesSource.match(
        /requireShopPermission\("auctions:write"/g,
      ) || [];

    assert.equal(
      writeChecks.length,
      5,
      "Expected review, clear-review, create, cancel, and end write checks.",
    );
  },
);
