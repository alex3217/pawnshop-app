import assert from "node:assert/strict";
import test from "node:test";

import {
  assertShopPermission,
  getAccessibleShopScope,
  resolveShopAccess,
} from "../src/services/shopAccess.service.js";

function matchesIdentity(row, conditions = []) {
  return conditions.some((condition) => {
    if (
      condition.userId !== undefined &&
      row.userId === condition.userId
    ) {
      return true;
    }

    if (
      condition.email !== undefined &&
      row.email === condition.email
    ) {
      return true;
    }

    return false;
  });
}

function makePrisma({
  shops = [],
  staff = [],
} = {}) {
  return {
    pawnShop: {
      async findUnique({ where }) {
        return (
          shops.find(
            (shop) => shop.id === where.id,
          ) || null
        );
      },

      async findMany({ where }) {
        const conditions = where?.OR || [];

        return shops
          .filter(
            (shop) =>
              where?.isDeleted === undefined ||
              shop.isDeleted ===
                where.isDeleted,
          )
          .filter((shop) =>
            conditions.some((condition) => {
              if (
                condition.ownerId !== undefined &&
                shop.ownerId ===
                  condition.ownerId
              ) {
                return true;
              }

              if (
                condition.id?.in &&
                condition.id.in.includes(
                  shop.id,
                )
              ) {
                return true;
              }

              return false;
            }),
          )
          .map((shop) => ({
            id: shop.id,
          }));
      },
    },

    staff: {
      async findFirst({ where }) {
        return (
          staff.find(
            (member) =>
              member.shopId === where.shopId &&
              member.status ===
                where.status &&
              matchesIdentity(
                member,
                where.OR,
              ),
          ) || null
        );
      },

      async findMany({ where }) {
        return staff.filter(
          (member) =>
            member.status === where.status &&
            matchesIdentity(
              member,
              where.OR,
            ),
        );
      },
    },
  };
}

const shops = [
  {
    id: "shop-a",
    ownerId: "owner-a",
    name: "Shop A",
    isDeleted: false,
  },
  {
    id: "shop-b",
    ownerId: "owner-b",
    name: "Shop B",
    isDeleted: false,
  },
];

test(
  "shop owner receives full access to an owned shop",
  async () => {
    const access = await assertShopPermission({
      user: {
        sub: "owner-a",
        role: "OWNER",
        email: "owner-a@example.com",
      },
      shopId: "shop-a",
      permission: "staff:write",
      prismaClient: makePrisma({ shops }),
    });

    assert.equal(
      access.source,
      "SHOP_OWNER",
    );
    assert.equal(access.authorized, true);
  },
);

test(
  "shop owner cannot access another owner's shop",
  async () => {
    await assert.rejects(
      assertShopPermission({
        user: {
          sub: "owner-a",
          role: "OWNER",
          email: "owner-a@example.com",
        },
        shopId: "shop-b",
        permission: "staff:read",
        prismaClient: makePrisma({
          shops,
        }),
      }),
      (error) =>
        error.statusCode === 403,
    );
  },
);

test(
  "Super Admin receives platform access",
  async () => {
    const access = await assertShopPermission({
      user: {
        sub: "super-admin-1",
        role: "SUPER_ADMIN",
      },
      shopId: "shop-a",
      permission: "staff:write",
      prismaClient: makePrisma({ shops }),
    });

    assert.equal(
      access.source,
      "SUPER_ADMIN",
    );
  },
);

test(
  "active staff member receives an assigned permission",
  async () => {
    const prismaClient = makePrisma({
      shops,
      staff: [
        {
          id: "staff-1",
          shopId: "shop-a",
          userId: "user-1",
          email: "staff@example.com",
          role: "SHOP_MANAGER",
          status: "ACTIVE",
          permissions: [
            "staff:read",
            "inventory:write",
          ],
        },
      ],
    });

    const access = await assertShopPermission({
      user: {
        sub: "user-1",
        role: "CONSUMER",
        email: "staff@example.com",
      },
      shopId: "shop-a",
      permission: "staff:read",
      prismaClient,
    });

    assert.equal(access.source, "STAFF");
    assert.equal(
      access.membership.id,
      "staff-1",
    );
  },
);

test(
  "staff member without the required permission is denied",
  async () => {
    const prismaClient = makePrisma({
      shops,
      staff: [
        {
          id: "staff-1",
          shopId: "shop-a",
          userId: "user-1",
          email: "staff@example.com",
          role: "SHOP_VIEWER",
          status: "ACTIVE",
          permissions: [
            "inventory:read",
          ],
        },
      ],
    });

    await assert.rejects(
      assertShopPermission({
        user: {
          sub: "user-1",
          role: "CONSUMER",
          email: "staff@example.com",
        },
        shopId: "shop-a",
        permission: "staff:write",
        prismaClient,
      }),
      (error) =>
        error.statusCode === 403 &&
        /missing required/i.test(
          error.message,
        ),
    );
  },
);

test(
  "inactive staff membership does not grant access",
  async () => {
    const prismaClient = makePrisma({
      shops,
      staff: [
        {
          id: "staff-1",
          shopId: "shop-a",
          userId: "user-1",
          email: "staff@example.com",
          role: "SHOP_ADMIN",
          status: "INACTIVE",
          permissions: [
            "staff:read",
            "staff:write",
          ],
        },
      ],
    });

    const access = await resolveShopAccess({
      user: {
        sub: "user-1",
        role: "CONSUMER",
        email: "staff@example.com",
      },
      shopId: "shop-a",
      prismaClient,
    });

    assert.equal(
      access.authorized,
      false,
    );
  },
);

test(
  "membership in Shop A does not grant access to Shop B",
  async () => {
    const prismaClient = makePrisma({
      shops,
      staff: [
        {
          id: "staff-1",
          shopId: "shop-a",
          userId: "user-1",
          email: "staff@example.com",
          role: "SHOP_ADMIN",
          status: "ACTIVE",
          permissions: [
            "staff:read",
          ],
        },
      ],
    });

    await assert.rejects(
      assertShopPermission({
        user: {
          sub: "user-1",
          role: "CONSUMER",
          email: "staff@example.com",
        },
        shopId: "shop-b",
        permission: "staff:read",
        prismaClient,
      }),
      (error) =>
        error.statusCode === 403,
    );
  },
);

test(
  "accessible scope combines owned and assigned shops",
  async () => {
    const prismaClient = makePrisma({
      shops,
      staff: [
        {
          id: "staff-1",
          shopId: "shop-b",
          userId: "owner-a",
          email: "owner-a@example.com",
          role: "SHOP_MANAGER",
          status: "ACTIVE",
          permissions: [
            "staff:read",
          ],
        },
      ],
    });

    const scope =
      await getAccessibleShopScope({
        user: {
          sub: "owner-a",
          role: "OWNER",
          email: "owner-a@example.com",
        },
        permission: "staff:read",
        prismaClient,
      });

    assert.deepEqual(
      [...scope.shopIds].sort(),
      ["shop-a", "shop-b"],
    );
  },
);

test(
  "user without ownership or staff membership has an empty scope",
  async () => {
    const scope =
      await getAccessibleShopScope({
        user: {
          sub: "consumer-1",
          role: "CONSUMER",
          email: "buyer@example.com",
        },
        permission: "staff:read",
        prismaClient: makePrisma({
          shops,
        }),
      });

    assert.equal(
      scope.unrestricted,
      false,
    );
    assert.deepEqual(
      scope.shopIds,
      [],
    );
  },
);
