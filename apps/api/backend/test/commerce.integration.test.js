import assert from "node:assert/strict";
import test, {
  after,
  before,
  beforeEach,
} from "node:test";

import jwt from "jsonwebtoken";
import request from "supertest";

const TEST_JWT_SECRET =
  "pawnloop-db-tests-only-secret-2026";

const TEST_DOMAIN =
  "@commerce.integration.pawnloop.test";

let app;
let prisma;

function email(prefix) {
  return `${prefix}${TEST_DOMAIN}`;
}

function authorize(httpRequest, token) {
  return httpRequest.set(
    "Authorization",
    `Bearer ${token}`,
  );
}

async function registerActor(prefix, role) {
  const password = "Commerce123!";

  const response = await request(app)
    .post("/api/auth/register")
    .send({
      name: `${role} ${prefix}`,
      email: email(prefix),
      password,
      role,
    });

  assert.equal(
    response.status,
    201,
    JSON.stringify(response.body),
  );

  return {
    token: response.body.token,
    user: response.body.user,
    password,
  };
}

async function createShop(owner, suffix = "primary") {
  const response = await authorize(
    request(app).post("/api/shops"),
    owner.token,
  ).send({
    name: `Commerce Test Shop ${suffix}`,
    address: "100 Integration Test Lane",
    phone: "555-0100",
    description: "Database integration test shop",
    hours: "9-5",
  });

  assert.equal(
    response.status,
    201,
    JSON.stringify(response.body),
  );

  return response.body;
}

async function createItem(
  owner,
  shop,
  {
    title = "Commerce Test Item",
    price = 125,
  } = {},
) {
  const response = await authorize(
    request(app).post("/api/items"),
    owner.token,
  ).send({
    pawnShopId: shop.id,
    title,
    description: "Commerce integration test item",
    price,
    images: [],
    currency: "USD",
  });

  assert.equal(
    response.status,
    201,
    JSON.stringify(response.body),
  );

  return response.body;
}

async function createLiveAuction(
  owner,
  shop,
  item,
) {
  const now = Date.now();

  const response = await authorize(
    request(app).post("/api/auctions"),
    owner.token,
  ).send({
    itemId: item.id,
    shopId: shop.id,
    startingPrice: 100,
    minIncrement: 5,
    startsAt: new Date(
      now - 5 * 60 * 1000,
    ).toISOString(),
    endsAt: new Date(
      now + 60 * 60 * 1000,
    ).toISOString(),
    antiSnipeWindowSec: 0,
  });

  assert.equal(
    response.status,
    201,
    JSON.stringify(response.body),
  );

  return response.body;
}

async function cleanupCommerceData() {
  const users = await prisma.user.findMany({
    where: {
      email: {
        endsWith: TEST_DOMAIN,
      },
    },
    select: {
      id: true,
    },
  });

  const userIds = users.map((row) => row.id);

  const shops =
    userIds.length > 0
      ? await prisma.pawnShop.findMany({
          where: {
            ownerId: {
              in: userIds,
            },
          },
          select: {
            id: true,
          },
        })
      : [];

  const shopIds = shops.map((row) => row.id);

  const items =
    shopIds.length > 0
      ? await prisma.item.findMany({
          where: {
            pawnShopId: {
              in: shopIds,
            },
          },
          select: {
            id: true,
          },
        })
      : [];

  const itemIds = items.map((row) => row.id);

  const auctions =
    itemIds.length > 0
      ? await prisma.auction.findMany({
          where: {
            itemId: {
              in: itemIds,
            },
          },
          select: {
            id: true,
          },
        })
      : [];

  const auctionIds = auctions.map(
    (row) => row.id,
  );

  const offerFilters = [];

  if (userIds.length > 0) {
    offerFilters.push({
      buyerId: {
        in: userIds,
      },
    });

    offerFilters.push({
      ownerId: {
        in: userIds,
      },
    });
  }

  if (itemIds.length > 0) {
    offerFilters.push({
      itemId: {
        in: itemIds,
      },
    });
  }

  const offers =
    offerFilters.length > 0
      ? await prisma.offer.findMany({
          where: {
            OR: offerFilters,
          },
          select: {
            id: true,
          },
        })
      : [];

  const offerIds = offers.map((row) => row.id);

  const settlementFilters = [];

  if (auctionIds.length > 0) {
    settlementFilters.push({
      auctionId: {
        in: auctionIds,
      },
    });
  }

  if (offerIds.length > 0) {
    settlementFilters.push({
      offerId: {
        in: offerIds,
      },
    });
  }

  if (userIds.length > 0) {
    settlementFilters.push({
      winnerUserId: {
        in: userIds,
      },
    });
  }

  if (settlementFilters.length > 0) {
    await prisma.settlement.deleteMany({
      where: {
        OR: settlementFilters,
      },
    });
  }

  const bidFilters = [];

  if (auctionIds.length > 0) {
    bidFilters.push({
      auctionId: {
        in: auctionIds,
      },
    });
  }

  if (userIds.length > 0) {
    bidFilters.push({
      userId: {
        in: userIds,
      },
    });
  }

  if (bidFilters.length > 0) {
    await prisma.bid.deleteMany({
      where: {
        OR: bidFilters,
      },
    });

    await prisma.autoBid.deleteMany({
      where: {
        OR: bidFilters,
      },
    });
  }

  if (offerIds.length > 0) {
    await prisma.offer.deleteMany({
      where: {
        id: {
          in: offerIds,
        },
      },
    });
  }

  if (auctionIds.length > 0) {
    await prisma.auction.deleteMany({
      where: {
        id: {
          in: auctionIds,
        },
      },
    });
  }

  if (itemIds.length > 0) {
    await prisma.watchlist.deleteMany({
      where: {
        itemId: {
          in: itemIds,
        },
      },
    });

    await prisma.inquiry.deleteMany({
      where: {
        itemId: {
          in: itemIds,
        },
      },
    });

    await prisma.item.deleteMany({
      where: {
        id: {
          in: itemIds,
        },
      },
    });
  }

  if (shopIds.length > 0) {
    await prisma.staff.deleteMany({
      where: {
        shopId: {
          in: shopIds,
        },
      },
    });

    await prisma.pawnShop.deleteMany({
      where: {
        id: {
          in: shopIds,
        },
      },
    });
  }

  if (userIds.length > 0) {
    await prisma.buyerSubscription.deleteMany({
      where: {
        userId: {
          in: userIds,
        },
      },
    });

    await prisma.user.deleteMany({
      where: {
        id: {
          in: userIds,
        },
      },
    });
  }
}

before(async () => {
  Object.assign(process.env, {
    NODE_ENV: "test",
    APP_ENV: "test",
    APP_NAME: "pawnloop-commerce-test",
    JWT_SECRET: TEST_JWT_SECRET,
    AUCTION_SCHEDULER_ENABLED: "false",
  });

  const rawDatabaseUrl = String(
    process.env.DATABASE_URL || "",
  );

  assert.ok(
    rawDatabaseUrl,
    "DATABASE_URL is required",
  );

  const databaseName = decodeURIComponent(
    new URL(rawDatabaseUrl).pathname.replace(
      /^\/+/,
      "",
    ),
  );

  assert.equal(
    databaseName,
    "pawnshop_test",
    "Commerce tests may only use pawnshop_test",
  );

  const appModule = await import("../src/app.js");
  const prismaModule = await import(
    "../src/lib/prisma.js"
  );

  app = appModule.createApp();
  prisma = prismaModule.prisma;

  const database = await prisma.$queryRaw`
    SELECT current_database() AS database_name
  `;

  assert.equal(
    database[0]?.database_name,
    "pawnshop_test",
  );
});

beforeEach(async () => {
  await cleanupCommerceData();
});

after(async () => {
  if (!prisma) return;

  await cleanupCommerceData();
  await prisma.$disconnect();
});

test(
  "owners can manage only their own shops",
  async () => {
    const owner = await registerActor(
      "shop-owner",
      "OWNER",
    );

    const otherOwner = await registerActor(
      "shop-other-owner",
      "OWNER",
    );

    const shop = await createShop(owner);

    assert.equal(shop.ownerId, owner.user.id);

    const denied = await authorize(
      request(app).put(`/api/shops/${shop.id}`),
      otherOwner.token,
    ).send({
      name: "Unauthorized Shop Rename",
    });

    assert.equal(denied.status, 403);
    assert.equal(denied.body.error, "Forbidden");

    const updated = await authorize(
      request(app).put(`/api/shops/${shop.id}`),
      owner.token,
    ).send({
      name: "Commerce Shop Updated",
    });

    assert.equal(updated.status, 200);
    assert.equal(
      updated.body.name,
      "Commerce Shop Updated",
    );

    const publicResponse = await request(app)
      .get(`/api/shops/${shop.id}`);

    assert.equal(publicResponse.status, 200);
    assert.equal(
      publicResponse.body.name,
      "Commerce Shop Updated",
    );
  },
);

test(
  "owners can manage only inventory belonging to their shops",
  async () => {
    const owner = await registerActor(
      "inventory-owner",
      "OWNER",
    );

    const otherOwner = await registerActor(
      "inventory-other-owner",
      "OWNER",
    );

    const shop = await createShop(
      owner,
      "inventory",
    );

    const item = await createItem(owner, shop, {
      title: "Original Inventory Item",
      price: 125,
    });

    assert.equal(
      item.pawnShopId,
      shop.id,
    );

    const denied = await authorize(
      request(app).put(`/api/items/${item.id}`),
      otherOwner.token,
    ).send({
      title: "Unauthorized Update",
      price: 1,
    });

    assert.equal(denied.status, 403);
    assert.equal(denied.body.error, "Forbidden");

    const updated = await authorize(
      request(app).put(`/api/items/${item.id}`),
      owner.token,
    ).send({
      title: "Authorized Inventory Update",
      price: 199.99,
    });

    assert.equal(updated.status, 200);
    assert.equal(
      updated.body.title,
      "Authorized Inventory Update",
    );
    assert.equal(
      Number(updated.body.price),
      199.99,
    );

    const publicResponse = await request(app)
      .get(`/api/items/${item.id}`);

    assert.equal(publicResponse.status, 200);
    assert.equal(
      publicResponse.body.title,
      "Authorized Inventory Update",
    );
  },
);

test(
  "live auctions enforce roles and minimum bid increments",
  async () => {
    const owner = await registerActor(
      "auction-owner",
      "OWNER",
    );

    const buyer = await registerActor(
      "auction-buyer",
      "CONSUMER",
    );

    const shop = await createShop(
      owner,
      "auction",
    );

    await prisma.pawnShop.update({
      where: {
        id: shop.id,
      },
      data: {
        subscriptionPlan: "PRO",
        subscriptionStatus: "ACTIVE",
      },
    });

    const item = await createItem(owner, shop, {
      title: "Auction Integration Item",
      price: 250,
    });

    const auction = await createLiveAuction(
      owner,
      shop,
      item,
    );

    assert.equal(auction.status, "LIVE");
    assert.equal(
      Number(auction.currentPrice),
      100,
    );

    const ownerBid = await authorize(
      request(app).post(
        `/api/auctions/${auction.id}/bids`,
      ),
      owner.token,
    ).send({
      amount: 110,
    });

    assert.equal(ownerBid.status, 403);

    const lowBid = await authorize(
      request(app).post(
        `/api/auctions/${auction.id}/bids`,
      ),
      buyer.token,
    ).send({
      amount: 104,
    });

    assert.equal(lowBid.status, 400);
    assert.equal(
      Number(lowBid.body.minRequired),
      105,
    );

    const acceptedBid = await authorize(
      request(app).post(
        `/api/auctions/${auction.id}/bids`,
      ),
      buyer.token,
    ).send({
      amount: 110,
    });

    assert.equal(
      acceptedBid.status,
      201,
      JSON.stringify(acceptedBid.body),
    );

    assert.equal(
      acceptedBid.body.success,
      true,
    );

    assert.equal(
      acceptedBid.body.bid.userId,
      buyer.user.id,
    );

    assert.equal(
      Number(acceptedBid.body.bid.amount),
      110,
    );

    const storedBid = await prisma.bid.findFirst({
      where: {
        auctionId: auction.id,
        userId: buyer.user.id,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    assert.ok(storedBid);
    assert.equal(Number(storedBid.amount), 110);

    const storedAuction =
      await prisma.auction.findUnique({
        where: {
          id: auction.id,
        },
      });

    assert.ok(storedAuction);
    assert.equal(
      Number(storedAuction.currentPrice),
      110,
    );
  },
);

test(
  "counteroffer acceptance creates a buyer settlement",
  async () => {
    const owner = await registerActor(
      "offer-owner",
      "OWNER",
    );

    const otherOwner = await registerActor(
      "offer-other-owner",
      "OWNER",
    );

    const buyer = await registerActor(
      "offer-buyer",
      "CONSUMER",
    );

    const shop = await createShop(
      owner,
      "offers",
    );

    const item = await createItem(owner, shop, {
      title: "Offer Integration Item",
      price: 175,
    });

    const createdOffer = await authorize(
      request(app).post("/api/offers"),
      buyer.token,
    ).send({
      itemId: item.id,
      amount: 125,
      message: "Initial commerce test offer",
    });

    assert.equal(
      createdOffer.status,
      201,
      JSON.stringify(createdOffer.body),
    );

    assert.equal(
      createdOffer.body.status,
      "PENDING",
    );

    const unauthorizedCounter = await authorize(
      request(app).patch(
        `/api/offers/${createdOffer.body.id}/counter`,
      ),
      otherOwner.token,
    ).send({
      counterAmount: 145,
      counterMessage: "Unauthorized counter",
    });

    assert.equal(
      unauthorizedCounter.status,
      403,
    );

    assert.equal(
      unauthorizedCounter.body.error,
      "Forbidden",
    );

    const countered = await authorize(
      request(app).patch(
        `/api/offers/${createdOffer.body.id}/counter`,
      ),
      owner.token,
    ).send({
      counterAmount: 145,
      counterMessage: "Authorized counteroffer",
    });

    assert.equal(countered.status, 200);
    assert.equal(countered.body.status, "COUNTERED");
    assert.equal(
      Number(countered.body.counterAmount),
      145,
    );

    const accepted = await authorize(
      request(app).patch(
        `/api/offers/${createdOffer.body.id}/accept-counter`,
      ),
      buyer.token,
    ).send({});

    assert.equal(
      accepted.status,
      200,
      JSON.stringify(accepted.body),
    );

    assert.equal(accepted.body.status, "ACCEPTED");
    assert.ok(accepted.body.settlement);
    assert.equal(
      accepted.body.settlement.winnerUserId,
      buyer.user.id,
    );
    assert.equal(
      Number(accepted.body.settlement.finalPrice),
      145,
    );
    assert.equal(
      accepted.body.settlement.status,
      "PENDING",
    );

    const settlement =
      await prisma.settlement.findUnique({
        where: {
          offerId: createdOffer.body.id,
        },
      });

    assert.ok(settlement);
    assert.equal(
      settlement.winnerUserId,
      buyer.user.id,
    );
    assert.equal(
      Number(settlement.finalPrice),
      145,
    );
    assert.equal(settlement.status, "PENDING");
  },
);


async function createAdminActor(prefix) {
  const user = await prisma.user.create({
    data: {
      name: `Admin ${prefix}`,
      email: email(prefix),
      password: "integration-admin-password-not-used",
      role: "ADMIN",
      isActive: true,
    },
  });

  const token = jwt.sign(
    {
      sub: user.id,
      id: user.id,
      userId: user.id,
      role: user.role,
      email: user.email,
    },
    TEST_JWT_SECRET,
    {
      expiresIn: "1h",
    },
  );

  return {
    token,
    user,
  };
}

async function createAuctionSettlementScenario(prefix) {
  const owner = await registerActor(
    `${prefix}-owner`,
    "OWNER",
  );

  const otherOwner = await registerActor(
    `${prefix}-other-owner`,
    "OWNER",
  );

  const buyerOne = await registerActor(
    `${prefix}-buyer-one`,
    "CONSUMER",
  );

  const buyerTwo = await registerActor(
    `${prefix}-buyer-two`,
    "CONSUMER",
  );

  const admin = await createAdminActor(
    `${prefix}-admin`,
  );

  const shop = await createShop(
    owner,
    `${prefix}-shop`,
  );

  await prisma.pawnShop.update({
    where: {
      id: shop.id,
    },
    data: {
      subscriptionPlan: "PRO",
      subscriptionStatus: "ACTIVE",
    },
  });

  const item = await createItem(owner, shop, {
    title: `${prefix} auction settlement item`,
    price: 250,
  });

  const auction = await createLiveAuction(
    owner,
    shop,
    item,
  );

  return {
    owner,
    otherOwner,
    buyerOne,
    buyerTwo,
    admin,
    shop,
    item,
    auction,
  };
}

test(
  "auto-bid competition selects the highest bidder and creates a settlement",
  async () => {
    const {
      owner,
      buyerOne,
      buyerTwo,
      auction,
    } = await createAuctionSettlementScenario(
      "auto-bid",
    );

    const ownerDenied = await authorize(
      request(app).post(
        `/api/auctions/${auction.id}/auto-bid`,
      ),
      owner.token,
    ).send({
      maxAmount: 200,
    });

    assert.equal(ownerDenied.status, 403);

    const buyerOneAutoBid = await authorize(
      request(app).post(
        `/api/auctions/${auction.id}/auto-bid`,
      ),
      buyerOne.token,
    ).send({
      maxAmount: 150,
    });

    assert.equal(
      buyerOneAutoBid.status,
      200,
      JSON.stringify(buyerOneAutoBid.body),
    );

    assert.equal(
      Number(
        buyerOneAutoBid.body.autoBid.maxAmount,
      ),
      150,
    );

    const buyerTwoAutoBid = await authorize(
      request(app).post(
        `/api/auctions/${auction.id}/auto-bid`,
      ),
      buyerTwo.token,
    ).send({
      maxAmount: 130,
    });

    assert.equal(
      buyerTwoAutoBid.status,
      200,
      JSON.stringify(buyerTwoAutoBid.body),
    );

    const triggeringBid = await authorize(
      request(app).post(
        `/api/auctions/${auction.id}/bids`,
      ),
      buyerTwo.token,
    ).send({
      amount: 105,
    });

    assert.equal(
      triggeringBid.status,
      201,
      JSON.stringify(triggeringBid.body),
    );

    assert.equal(
      triggeringBid.body.autoBids.length,
      5,
    );

    assert.equal(
      Number(
        triggeringBid.body.auction.currentPrice,
      ),
      130,
    );

    const highestBid =
      await prisma.bid.findFirst({
        where: {
          auctionId: auction.id,
        },
        orderBy: [
          {
            amount: "desc",
          },
          {
            createdAt: "asc",
          },
        ],
      });

    assert.ok(highestBid);

    assert.equal(
      highestBid.userId,
      buyerOne.user.id,
    );

    assert.equal(
      Number(highestBid.amount),
      130,
    );

    const storedAuction =
      await prisma.auction.findUnique({
        where: {
          id: auction.id,
        },
      });

    assert.ok(storedAuction);

    assert.equal(
      Number(storedAuction.currentPrice),
      130,
    );

    const ended = await authorize(
      request(app).post(
        `/api/auctions/${auction.id}/end`,
      ),
      owner.token,
    ).send({});

    assert.equal(
      ended.status,
      200,
      JSON.stringify(ended.body),
    );

    assert.equal(ended.body.success, true);
    assert.equal(ended.body.auction.status, "ENDED");
    assert.ok(ended.body.settlement);

    assert.equal(
      ended.body.settlement.winnerUserId,
      buyerOne.user.id,
    );

    assert.equal(
      ended.body.settlement.finalAmountCents,
      13000,
    );

    assert.equal(
      ended.body.settlement.status,
      "PENDING",
    );

    assert.equal(
      ended.body.settlementReason,
      "CREATED_OR_UPDATED",
    );

    const settlement =
      await prisma.settlement.findUnique({
        where: {
          auctionId: auction.id,
        },
      });

    assert.ok(settlement);

    assert.equal(
      settlement.winnerUserId,
      buyerOne.user.id,
    );

    assert.equal(
      Number(settlement.finalPrice),
      130,
    );

    assert.equal(settlement.status, "PENDING");
  },
);

test(
  "settlement access and fulfillment enforce buyer owner and admin permissions",
  async () => {
    const {
      owner,
      otherOwner,
      buyerOne,
      buyerTwo,
      admin,
      auction,
    } = await createAuctionSettlementScenario(
      "fulfillment",
    );

    const bid = await authorize(
      request(app).post(
        `/api/auctions/${auction.id}/bids`,
      ),
      buyerOne.token,
    ).send({
      amount: 110,
    });

    assert.equal(
      bid.status,
      201,
      JSON.stringify(bid.body),
    );

    const ended = await authorize(
      request(app).post(
        `/api/auctions/${auction.id}/end`,
      ),
      owner.token,
    ).send({});

    assert.equal(
      ended.status,
      200,
      JSON.stringify(ended.body),
    );

    const settlementId =
      ended.body.settlement?.id;

    assert.ok(settlementId);

    const winnerRead = await authorize(
      request(app).get(
        `/api/settlements/${settlementId}`,
      ),
      buyerOne.token,
    );

    assert.equal(winnerRead.status, 200);

    assert.equal(
      winnerRead.body.winnerId,
      buyerOne.user.id,
    );

    const winnerAuctionRead = await authorize(
      request(app).get(
        `/api/settlements/auction/${auction.id}`,
      ),
      buyerOne.token,
    );

    assert.equal(
      winnerAuctionRead.status,
      200,
    );

    const winnerList = await authorize(
      request(app).get(
        "/api/settlements/mine",
      ),
      buyerOne.token,
    );

    assert.equal(winnerList.status, 200);
    assert.ok(Array.isArray(winnerList.body));

    assert.ok(
      winnerList.body.some(
        (row) => row.id === settlementId,
      ),
    );

    const losingBuyerRead = await authorize(
      request(app).get(
        `/api/settlements/${settlementId}`,
      ),
      buyerTwo.token,
    );

    assert.equal(losingBuyerRead.status, 403);

    const ownerRead = await authorize(
      request(app).get(
        `/api/settlements/${settlementId}`,
      ),
      owner.token,
    );

    assert.equal(ownerRead.status, 200);

    const unrelatedOwnerRead = await authorize(
      request(app).get(
        `/api/settlements/${settlementId}`,
      ),
      otherOwner.token,
    );

    assert.equal(
      unrelatedOwnerRead.status,
      403,
    );

    const pendingFulfillment = await authorize(
      request(app).patch(
        `/api/settlements/${settlementId}/fulfillment`,
      ),
      owner.token,
    ).send({
      fulfillmentStatus:
        "READY_FOR_PICKUP",
    });

    assert.equal(
      pendingFulfillment.status,
      400,
    );

    assert.equal(
      pendingFulfillment.body.error,
      "Only charged settlements can be fulfilled.",
    );

    const charged = await authorize(
      request(app).post(
        "/api/settlements",
      ),
      admin.token,
    ).send({
      auctionId: auction.id,
      winnerId: buyerOne.user.id,
      finalAmountCents: 11000,
      currency: "USD",
      status: "CHARGED",
    });

    assert.equal(
      charged.status,
      201,
      JSON.stringify(charged.body),
    );

    assert.equal(
      charged.body.settlement.status,
      "CHARGED",
    );

    assert.equal(
      charged.body.settlement.finalAmountCents,
      11000,
    );

    const unrelatedFulfillment =
      await authorize(
        request(app).patch(
          `/api/settlements/${settlementId}/fulfillment`,
        ),
        otherOwner.token,
      ).send({
        fulfillmentStatus:
          "READY_FOR_PICKUP",
      });

    assert.equal(
      unrelatedFulfillment.status,
      403,
    );

    const readyForPickup = await authorize(
      request(app).patch(
        `/api/settlements/${settlementId}/fulfillment`,
      ),
      owner.token,
    ).send({
      fulfillmentStatus:
        "READY_FOR_PICKUP",
      fulfillmentNote:
        "Customer may collect the item.",
    });

    assert.equal(
      readyForPickup.status,
      200,
      JSON.stringify(readyForPickup.body),
    );

    assert.equal(
      readyForPickup.body.settlement
        .fulfillmentStatus,
      "READY_FOR_PICKUP",
    );

    assert.equal(
      readyForPickup.body.settlement
        .fulfillmentNote,
      "Customer may collect the item.",
    );

    assert.equal(
      readyForPickup.body.settlement
        .fulfilledAt,
      null,
    );

    const completed = await authorize(
      request(app).patch(
        `/api/settlements/${settlementId}/fulfillment`,
      ),
      admin.token,
    ).send({
      fulfillmentStatus: "COMPLETED",
      fulfillmentNote:
        "Transaction completed by administrator.",
    });

    assert.equal(
      completed.status,
      200,
      JSON.stringify(completed.body),
    );

    assert.equal(
      completed.body.settlement
        .fulfillmentStatus,
      "COMPLETED",
    );

    assert.ok(
      completed.body.settlement.fulfilledAt,
    );

    const adminList = await authorize(
      request(app).get("/api/settlements"),
      admin.token,
    );

    assert.equal(adminList.status, 200);
    assert.ok(Array.isArray(adminList.body));

    assert.ok(
      adminList.body.some(
        (row) =>
          row.id === settlementId &&
          row.fulfillmentStatus ===
            "COMPLETED",
      ),
    );

    const stored =
      await prisma.settlement.findUnique({
        where: {
          id: settlementId,
        },
      });

    assert.ok(stored);
    assert.equal(stored.status, "CHARGED");

    assert.equal(
      stored.fulfillmentStatus,
      "COMPLETED",
    );

    assert.ok(stored.fulfilledAt);
  },
);
