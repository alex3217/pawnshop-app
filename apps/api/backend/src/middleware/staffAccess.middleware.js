// File: apps/api/backend/src/middleware/staffAccess.middleware.js

import { prisma } from "../lib/prisma.js";

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeUpper(value) {
  return normalizeString(value).toUpperCase();
}

function getUserId(req) {
  return (
    req?.user?.sub ||
    req?.user?.id ||
    req?.user?.userId ||
    req?.auth?.user?.sub ||
    ""
  );
}

function getUserEmail(req) {
  return normalizeString(req?.user?.email || req?.auth?.user?.email).toLowerCase();
}

function getUserRole(req) {
  return normalizeUpper(req?.user?.role || req?.auth?.user?.role);
}

function isAdmin(req) {
  const role = getUserRole(req);
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

function isOwner(req) {
  return getUserRole(req) === "OWNER";
}

function normalizePermission(permission) {
  return normalizeString(permission).toLowerCase();
}

function normalizePermissions(permissions) {
  if (!Array.isArray(permissions)) return [];
  return permissions.map(normalizePermission).filter(Boolean);
}

function staffRowCan(row, permission) {
  const required = normalizePermission(permission);
  if (!required) return false;

  return normalizePermissions(row.permissions).includes(required);
}

async function loadStaffRowsForUser(req) {
  if (Array.isArray(req.staffAccess?.records)) {
    return req.staffAccess.records;
  }

  const userId = getUserId(req);
  const email = getUserEmail(req);

  const or = [];
  if (userId) or.push({ userId });
  if (email) or.push({ email });

  if (or.length === 0) {
    req.staffAccess = {
      records: [],
      getShopIds: () => [],
      canAccessShop: () => false,
    };
    return [];
  }

  const records = await prisma.staff.findMany({
    where: {
      status: "ACTIVE",
      OR: or,
    },
    include: {
      shop: {
        select: {
          id: true,
          ownerId: true,
          isDeleted: true,
          subscriptionStatus: true,
        },
      },
    },
  });

  const activeRecords = records.filter(
    (row) =>
      row.shop &&
      !row.shop.isDeleted &&
      normalizeUpper(row.shop.subscriptionStatus) === "ACTIVE",
  );

  req.staffAccess = {
    records: activeRecords,
    getShopIds(permission) {
      return activeRecords
        .filter((row) => staffRowCan(row, permission))
        .map((row) => row.shopId)
        .filter(Boolean);
    },
    canAccessShop(permission, shopId) {
      const targetShopId = normalizeString(shopId);
      if (!targetShopId) return false;

      return activeRecords.some(
        (row) => row.shopId === targetShopId && staffRowCan(row, permission),
      );
    },
  };

  return activeRecords;
}

export function getStaffAccessibleShopIds(req, permission) {
  if (!req.staffAccess?.getShopIds) return [];
  return req.staffAccess.getShopIds(permission);
}

export function canAccessShopWithStaffPermission(req, permission, shopId) {
  if (!req.staffAccess?.canAccessShop) return false;
  return req.staffAccess.canAccessShop(permission, shopId);
}

export function requireOwnerAdminOrStaffPermission(permission) {
  return async function staffPermissionMiddleware(req, res, next) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (isAdmin(req) || isOwner(req)) {
        return next();
      }

      const rows = await loadStaffRowsForUser(req);
      const allowed = rows.some((row) => staffRowCan(row, permission));

      if (!allowed) {
        return res.status(403).json({
          error: "Forbidden",
          requiredPermission: permission,
        });
      }

      return next();
    } catch (error) {
      return res.status(500).json({
        error: error?.message || "Failed to verify staff permissions",
      });
    }
  };
}

export default {
  requireOwnerAdminOrStaffPermission,
  getStaffAccessibleShopIds,
  canAccessShopWithStaffPermission,
};
