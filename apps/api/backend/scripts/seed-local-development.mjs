import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

import {
  validatePassword,
} from "../src/services/passwordPolicy.service.js";

const LOOPBACK_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
]);

function assertSafeLocalDevelopmentTarget() {
  const raw = String(
    process.env.DATABASE_URL || "",
  ).trim();

  const environment = String(
    process.env.APP_ENV ||
      process.env.NODE_ENV ||
      "",
  )
    .trim()
    .toLowerCase();

  if (!raw) {
    throw new Error(
      "DATABASE_URL is required.",
    );
  }

  const target = new URL(raw);
  const database = decodeURIComponent(
    target.pathname.replace(/^\/+/, ""),
  );

  if (
    environment !== "development"
  ) {
    throw new Error(
      `APP_ENV must be development, received ${environment || "(unset)"}.`,
    );
  }

  if (
    !LOOPBACK_HOSTS.has(
      target.hostname.toLowerCase(),
    )
  ) {
    throw new Error(
      "Local development seed requires a loopback database host.",
    );
  }

  if (database !== "pawnshop_dev") {
    throw new Error(
      `Local development seed requires pawnshop_dev, received ${database}.`,
    );
  }
}

assertSafeLocalDevelopmentTarget();

const runtimePassword = String(
  process.env.LOCAL_DEV_ROLE_PASSWORD ||
    "",
);

if (!runtimePassword) {
  throw new Error(
    "LOCAL_DEV_ROLE_PASSWORD is required.",
  );
}

validatePassword(
  runtimePassword,
  {
    email: "",
  },
);

const prisma = new PrismaClient();
const passwordHash = await bcrypt.hash(
  runtimePassword,
  12,
);

const now = new Date();

const actorDefinitions = [
  {
    name: "Local Buyer",
    email: "buyer@pawn.local",
    role: "CONSUMER",
  },
  {
    name: "Local Owner",
    email: "owner1@pawn.local",
    role: "OWNER",
  },
  {
    name: "Local Administrator",
    email: "admin_local@example.com",
    role: "ADMIN",
  },
  {
    name: "Local Super Administrator",
    email: "admin1@example.com",
    role: "SUPER_ADMIN",
  },
];

try {
  const actors = {};

  await prisma.$transaction(
    async (tx) => {
      for (
        const actor of actorDefinitions
      ) {
        const user =
          await tx.user.upsert({
            where: {
              email: actor.email,
            },
            create: {
              name: actor.name,
              email: actor.email,
              password: passwordHash,
              role: actor.role,
              isActive: true,
              emailVerifiedAt: now,
              passwordChangedAt: now,
              authVersion: 0,
            },
            update: {
              name: actor.name,
              password: passwordHash,
              role: actor.role,
              isActive: true,
              emailVerifiedAt: now,
              passwordChangedAt: now,
              authVersion: {
                increment: 1,
              },
            },
          });

        actors[actor.role] = user;
      }

      const owner =
        actors.OWNER;

      await tx.ownerApplication.upsert({
        where: {
          ownerId: owner.id,
        },
        create: {
          ownerId: owner.id,
          status: "APPROVED",
          businessName:
            "PawnLoop Local Shop",
          businessEmail:
            "owner1@pawn.local",
          submittedAt: now,
          reviewedAt: now,
          statusChangedAt: now,
        },
        update: {
          status: "APPROVED",
          businessName:
            "PawnLoop Local Shop",
          businessEmail:
            "owner1@pawn.local",
          reviewedAt: now,
          decisionReason: null,
          statusChangedAt: now,
        },
      });

      await tx.pawnShop.upsert({
        where: {
          id: "pawnloop-local-shop",
        },
        create: {
          id: "pawnloop-local-shop",
          name: "PawnLoop Local Shop",
          slug: "pawnloop-local-shop",
          ownerId: owner.id,
          city: "Local",
          state: "VA",
          zip: "00000",
          isDeleted: false,
          onboardingCompletedAt: now,
          subscriptionPlan: "FREE",
          subscriptionStatus: "ACTIVE",
        },
        update: {
          name: "PawnLoop Local Shop",
          slug: "pawnloop-local-shop",
          ownerId: owner.id,
          isDeleted: false,
          onboardingCompletedAt: now,
          subscriptionPlan: "FREE",
          subscriptionStatus: "ACTIVE",
        },
      });
    },
  );

  console.log(
    JSON.stringify(
      {
        success: true,
        database: "pawnshop_dev",
        actors: actorDefinitions.map(
          ({ email, role }) => ({
            email,
            role,
          }),
        ),
        shop: "pawnloop-local-shop",
      },
      null,
      2,
    ),
  );
} finally {
  await prisma.$disconnect();
}
