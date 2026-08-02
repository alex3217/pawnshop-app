import bcrypt from "bcryptjs";

import { classifyDatabaseTarget } from "../../../../scripts/lib/database-target-safety.mjs";
import { prisma } from "../src/lib/prisma.js";

const runtimePassword = String(process.env.ROLE_TENANT_CERT_PASSWORD || "");

if (!runtimePassword) {
  console.error("Refusing role/tenant certification seed: runtime password is required.");
  process.exit(1);
}

const safety = classifyDatabaseTarget(process.env.DATABASE_URL, process.env);

if (!safety.safe || safety.target?.database !== "pawnshop_test") {
  console.error("Refusing role/tenant certification seed: disposable pawnshop_test is required.");
  for (const error of safety.errors || []) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  const password = await bcrypt.hash(runtimePassword, 8);
  const verifiedAt = new Date("2026-01-01T00:00:00.000Z");

  const actors = [
    ["cert-buyer-a", "Buyer A", "buyer-a@role-certification.test", "CONSUMER", true],
    ["cert-buyer-b", "Buyer B", "buyer-b@role-certification.test", "CONSUMER", true],
    ["cert-disabled-buyer", "Disabled Buyer", "disabled-buyer@role-certification.test", "CONSUMER", false],
    ["cert-owner-a", "Owner A", "owner-a@role-certification.test", "OWNER", true],
    ["cert-owner-b", "Owner B", "owner-b@role-certification.test", "OWNER", true],
    ["cert-pending-owner", "Pending Owner", "pending-owner@role-certification.test", "OWNER", true],
    ["cert-active-staff-a", "Active Staff A", "active-staff-a@role-certification.test", "CONSUMER", true],
    ["cert-inactive-staff", "Inactive Staff", "inactive-staff@role-certification.test", "CONSUMER", true],
    ["cert-admin", "Administrator", "admin@role-certification.test", "ADMIN", true],
    ["cert-super-admin", "Super Administrator", "super-admin@role-certification.test", "SUPER_ADMIN", true],
  ];

  await prisma.$transaction(async (tx) => {
    for (const [id, name, email, role, isActive] of actors) {
      await tx.user.upsert({
        where: { id },
        create: { id, name, email, password, role, isActive, emailVerifiedAt: verifiedAt, authVersion: 0 },
        update: { name, email, password, role, isActive, emailVerifiedAt: verifiedAt, authVersion: 0 },
      });
    }

    for (const [id, ownerId, status, businessName] of [
      ["cert-owner-application-a", "cert-owner-a", "APPROVED", "Certification Shop A"],
      ["cert-owner-application-b", "cert-owner-b", "APPROVED", "Certification Shop B"],
      ["cert-owner-application-pending", "cert-pending-owner", "PENDING", "Pending Certification Shop"],
    ]) {
      await tx.ownerApplication.upsert({
        where: { ownerId },
        create: { id, ownerId, status, businessName, businessEmail: `${ownerId}@role-certification.test` },
        update: { status, businessName, decisionReason: null, reviewedAt: status === "APPROVED" ? verifiedAt : null },
      });
    }

    for (const [id, name, slug, ownerId] of [
      ["cert-shop-a", "Shop A", "certification-shop-a", "cert-owner-a"],
      ["cert-shop-b", "Shop B", "certification-shop-b", "cert-owner-b"],
    ]) {
      await tx.pawnShop.upsert({
        where: { id },
        create: { id, name, slug, ownerId, isDeleted: false, subscriptionStatus: "ACTIVE" },
        update: { name, slug, ownerId, isDeleted: false, subscriptionStatus: "ACTIVE", description: null },
      });
    }

    for (const [id, pawnShopId, title] of [
      ["cert-shop-a-item", "cert-shop-a", "Shop A certification item"],
      ["cert-shop-b-item", "cert-shop-b", "Shop B certification item"],
    ]) {
      await tx.item.upsert({
        where: { id },
        create: { id, pawnShopId, title, price: "100.00", images: [], status: "AVAILABLE", isDeleted: false },
        update: { pawnShopId, title, price: "100.00", status: "AVAILABLE", isDeleted: false },
      });
    }

    for (const [id, buyerId, title] of [
      ["cert-buyer-a-submission", "cert-buyer-a", "Buyer A certification submission"],
      ["cert-buyer-b-submission", "cert-buyer-b", "Buyer B certification submission"],
    ]) {
      await tx.buyerItemSubmission.upsert({
        where: { id },
        create: { id, buyerId, title, status: "SUBMITTED", images: [] },
        update: { buyerId, title, status: "SUBMITTED", reviewMessage: null, reviewedAt: null, reviewedById: null },
      });
    }

    for (const [id, userId, email, name, status] of [
      ["cert-active-staff-a-membership", "cert-active-staff-a", "active-staff-a@role-certification.test", "Active Staff A", "ACTIVE"],
      ["cert-inactive-staff-membership", "cert-inactive-staff", "inactive-staff@role-certification.test", "Inactive Staff", "INACTIVE"],
    ]) {
      await tx.staff.upsert({
        where: { id },
        create: { id, shopId: "cert-shop-a", userId, email, name, role: "SHOP_VIEWER", status, permissions: ["staff:read"], acceptedAt: verifiedAt },
        update: { shopId: "cert-shop-a", userId, email, name, role: "SHOP_VIEWER", status, permissions: ["staff:read"], acceptedAt: verifiedAt },
      });
    }
  });

  console.log("Seeded role/tenant certification matrix (10 actors, 2 shops, 2 items, 2 buyer submissions, 2 staff memberships).");
  await prisma.$disconnect();
}
