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
  applySettlementScopeToAuctionResponse,
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

const auctionControllerSource = readFileSync(
  resolve(
    currentDir,
    "../src/controllers/auctions.controller.js",
  ),
  "utf8",
);

const webSourceRoot = resolve(
  currentDir,
  "../../../web/src",
);

const appSource = readFileSync(
  resolve(webSourceRoot, "App.tsx"),
  "utf8",
);

const siteLayoutSource = readFileSync(
  resolve(
    webSourceRoot,
    "components/SiteLayout.tsx",
  ),
  "utf8",
);

const ownerAuctionsSource = readFileSync(
  resolve(
    webSourceRoot,
    "pages/OwnerAuctionsPage.tsx",
  ),
  "utf8",
);

const createAuctionSource = readFileSync(
  resolve(
    webSourceRoot,
    "pages/CreateAuctionPage.tsx",
  ),
  "utf8",
);

const auctionServiceSource = readFileSync(
  resolve(
    webSourceRoot,
    "services/auctions.ts",
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

test(
  "settlement details are redacted outside the permitted shop scope",
  () => {
    const auction = {
      id: "auction-a",
      shopId: "shop-a",
      settlement: {
        id: "settlement-a",
      },
    };

    const redacted =
      applySettlementScopeToAuctionResponse(
        auction,
        {
          unrestricted: false,
          shopIds: ["shop-b"],
        },
      );

    assert.equal(
      redacted.settlement,
      null,
    );

    const permitted =
      applySettlementScopeToAuctionResponse(
        auction,
        {
          unrestricted: false,
          shopIds: ["shop-a"],
        },
      );

    assert.deepEqual(
      permitted.settlement,
      {
        id: "settlement-a",
      },
    );

    const unrestricted =
      applySettlementScopeToAuctionResponse(
        auction,
        {
          unrestricted: true,
          shopIds: [],
        },
      );

    assert.deepEqual(
      unrestricted.settlement,
      {
        id: "settlement-a",
      },
    );
  },
);

test(
  "frontend auction routes use read and write capability guards",
  () => {
    assert.match(
      appSource,
      /RequireShopCapability capability="auctionsRead"/,
    );

    assert.match(
      appSource,
      /RequireShopCapability capability="auctionsWrite"/,
    );

    assert.match(
      createAuctionSource,
      /valid auction start time/,
    );

    assert.match(
      auctionServiceSource,
      /shopId: input\.shopId/,
    );

    assert.match(
      auctionServiceSource,
      /startingPrice: input\.startingPrice/,
    );
  },
);

test(
  "staff navigation and settlement visibility are permission aware",
  () => {
    assert.match(
      siteLayoutSource,
      /getMyShopAccess/,
    );

    assert.match(
      siteLayoutSource,
      /showStaffAuctionLinks/,
    );

    assert.match(
      siteLayoutSource,
      /Shop Tools/,
    );

    assert.match(
      ownerAuctionsSource,
      /settlements:read/,
    );

    assert.match(
      ownerAuctionsSource,
      /data-owner-auction-settlement-restricted/,
    );

    assert.match(
      auctionControllerSource,
      /applySettlementScopeToAuctionResponse/,
    );
  },
);
