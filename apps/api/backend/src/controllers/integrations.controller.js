// File: apps/api/backend/src/controllers/integrations.controller.js

import { prisma } from "../lib/prisma.js";
import { runInventoryIntegrationSync } from "../services/inventorySync.service.js";

const ALLOWED_TYPES = new Set([
  "CSV_UPLOAD",
  "API_PULL",
  "WEBHOOK_PUSH",
  "SFTP_FEED",
  "POS_SYSTEM",
  "MOBILE_SCAN",
]);

const ALLOWED_STATUSES = new Set([
  "NEEDS_SETUP",
  "CONNECTED",
  "PAUSED",
  "ERROR",
  "ARCHIVED",
]);

const ALLOWED_AUTH_TYPES = new Set([
  "NONE",
  "API_KEY",
  "BEARER_TOKEN",
  "BASIC",
  "CUSTOM_HEADER",
]);

function sendError(res, error, fallback = "Internal server error") {
  const status =
    Number.isInteger(error?.statusCode) && error.statusCode >= 400
      ? error.statusCode
      : 500;

  return res.status(status).json({
    success: false,
    error: error?.message || fallback,
  });
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizeString(value, fallback = "") {
  if (value === undefined || value === null) return fallback;
  const str = String(value).trim();
  return str.length ? str : fallback;
}

function normalizeUpper(value, fallback = "") {
  return normalizeString(value, fallback).toUpperCase();
}

function getUserId(req) {
  return req?.user?.sub || req?.user?.id || req?.user?.userId || "";
}

function getUserRole(req) {
  return normalizeUpper(req?.user?.role);
}

function isAdmin(req) {
  const role = getUserRole(req);
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

function maskSecret(value) {
  const raw = normalizeString(value);
  if (!raw) return null;
  if (raw.length <= 4) return "••••";
  return `••••${raw.slice(-4)}`;
}

function normalizeIntegrationType(value) {
  const type = normalizeUpper(value, "CSV_UPLOAD");
  return ALLOWED_TYPES.has(type) ? type : "CSV_UPLOAD";
}

function normalizeStatus(value) {
  const status = normalizeUpper(value, "NEEDS_SETUP");
  return ALLOWED_STATUSES.has(status) ? status : "NEEDS_SETUP";
}

function normalizeAuthType(value) {
  const authType = normalizeUpper(value, "NONE");
  return ALLOWED_AUTH_TYPES.has(authType) ? authType : "NONE";
}

async function assertShopAccess(req, shopId) {
  const userId = getUserId(req);

  if (!userId) {
    throw httpError(401, "Unauthorized");
  }

  const where = isAdmin(req)
    ? { id: shopId, isDeleted: false }
    : { id: shopId, ownerId: userId, isDeleted: false };

  const shop = await prisma.pawnShop.findFirst({
    where,
    select: {
      id: true,
      name: true,
      ownerId: true,
    },
  });

  if (!shop) {
    throw httpError(404, "Owned shop not found");
  }

  return shop;
}

async function getIntegrationForAccess(req, integrationId) {
  const where = isAdmin(req)
    ? { id: integrationId }
    : { id: integrationId, ownerId: getUserId(req) };

  const integration = await prisma.inventoryIntegration.findFirst({
    where,
    include: {
      shop: {
        select: {
          id: true,
          name: true,
          address: true,
        },
      },
    },
  });

  if (!integration || integration.status === "ARCHIVED") {
    throw httpError(404, "Integration not found");
  }

  return integration;
}

function normalizeIntegration(row) {
  return {
    id: row.id,
    ownerId: row.ownerId,
    shopId: row.shopId,
    shopName: row.shop?.name || null,
    name: row.name,
    type: row.type,
    provider: row.provider,
    status: row.status,
    baseUrl: row.baseUrl,
    inventoryEndpoint: row.inventoryEndpoint,
    authType: row.authType,
    credentialHint: row.credentialHint,
    syncFrequencyMinutes: row.syncFrequencyMinutes,
    lastSyncAt: row.lastSyncAt,
    nextSyncAt: row.nextSyncAt,
    metadata: row.metadata || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listMyIntegrations(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const rows = await prisma.inventoryIntegration.findMany({
      where: {
        ...(isAdmin(req) ? {} : { ownerId: userId }),
        status: { not: "ARCHIVED" },
      },
      include: {
        shop: {
          select: {
            id: true,
            name: true,
            address: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return res.json({
      success: true,
      integrations: rows.map(normalizeIntegration),
    });
  } catch (error) {
    return sendError(res, error, "Failed to load integrations");
  }
}

export async function createIntegration(req, res) {
  try {
    const userId = getUserId(req);
    const shopId = normalizeString(req.body?.shopId);
    const name = normalizeString(req.body?.name);
    const type = normalizeIntegrationType(req.body?.type);
    const authType = normalizeAuthType(req.body?.authType);

    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    if (!shopId) {
      return res.status(400).json({ success: false, error: "shopId is required" });
    }

    if (!name) {
      return res.status(400).json({ success: false, error: "name is required" });
    }

    const shop = await assertShopAccess(req, shopId);

    const integration = await prisma.inventoryIntegration.create({
      data: {
        ownerId: isAdmin(req) ? shop.ownerId : userId,
        shopId,
        name,
        type,
        provider: normalizeString(req.body?.provider) || null,
        status: normalizeStatus(req.body?.status),
        baseUrl: normalizeString(req.body?.baseUrl) || null,
        inventoryEndpoint: normalizeString(req.body?.inventoryEndpoint) || null,
        authType,
        credentialHint:
          maskSecret(req.body?.apiKey) ||
          maskSecret(req.body?.bearerToken) ||
          normalizeString(req.body?.credentialHint) ||
          null,
        syncFrequencyMinutes:
          Number.isFinite(Number(req.body?.syncFrequencyMinutes))
            ? Number(req.body.syncFrequencyMinutes)
            : null,
        metadata:
          req.body?.metadata && typeof req.body.metadata === "object"
            ? req.body.metadata
            : null,
      },
      include: {
        shop: {
          select: {
            id: true,
            name: true,
            address: true,
          },
        },
      },
    });

    return res.status(201).json({
      success: true,
      integration: normalizeIntegration(integration),
    });
  } catch (error) {
    return sendError(res, error, "Failed to create integration");
  }
}

export async function updateIntegration(req, res) {
  try {
    const integrationId = normalizeString(req.params?.id);
    if (!integrationId) {
      return res.status(400).json({ success: false, error: "Integration id is required" });
    }

    await getIntegrationForAccess(req, integrationId);

    const data = {};

    if (req.body?.name !== undefined) data.name = normalizeString(req.body.name);
    if (req.body?.type !== undefined) data.type = normalizeIntegrationType(req.body.type);
    if (req.body?.provider !== undefined) {
      data.provider = normalizeString(req.body.provider) || null;
    }
    if (req.body?.status !== undefined) data.status = normalizeStatus(req.body.status);
    if (req.body?.baseUrl !== undefined) {
      data.baseUrl = normalizeString(req.body.baseUrl) || null;
    }
    if (req.body?.inventoryEndpoint !== undefined) {
      data.inventoryEndpoint = normalizeString(req.body.inventoryEndpoint) || null;
    }
    if (req.body?.authType !== undefined) {
      data.authType = normalizeAuthType(req.body.authType);
    }
    if (req.body?.apiKey !== undefined || req.body?.bearerToken !== undefined) {
      data.credentialHint =
        maskSecret(req.body?.apiKey) || maskSecret(req.body?.bearerToken);
    }
    if (req.body?.syncFrequencyMinutes !== undefined) {
      data.syncFrequencyMinutes = Number.isFinite(Number(req.body.syncFrequencyMinutes))
        ? Number(req.body.syncFrequencyMinutes)
        : null;
    }
    if (req.body?.metadata !== undefined) {
      data.metadata =
        req.body.metadata && typeof req.body.metadata === "object"
          ? req.body.metadata
          : null;
    }

    const integration = await prisma.inventoryIntegration.update({
      where: { id: integrationId },
      data,
      include: {
        shop: {
          select: {
            id: true,
            name: true,
            address: true,
          },
        },
      },
    });

    return res.json({
      success: true,
      integration: normalizeIntegration(integration),
    });
  } catch (error) {
    return sendError(res, error, "Failed to update integration");
  }
}

export async function testIntegration(req, res) {
  try {
    const integration = await getIntegrationForAccess(req, req.params?.id);

    const needsEndpoint =
      ["API_PULL", "WEBHOOK_PUSH", "SFTP_FEED", "POS_SYSTEM"].includes(
        integration.type,
      );

    if (needsEndpoint && !integration.baseUrl && !integration.inventoryEndpoint) {
      const job = await prisma.inventorySyncJob.create({
        data: {
          integrationId: integration.id,
          shopId: integration.shopId,
          status: "FAILED",
          startedAt: new Date(),
          finishedAt: new Date(),
          errorCount: 1,
          errorSummary: {
            message: "Connector needs a base URL or endpoint before testing.",
          },
        },
      });

      return res.status(400).json({
        success: false,
        error: "Connector needs a base URL or endpoint before testing.",
        job,
      });
    }

    const job = await prisma.inventorySyncJob.create({
      data: {
        integrationId: integration.id,
        shopId: integration.shopId,
        status: "COMPLETED",
        startedAt: new Date(),
        finishedAt: new Date(),
        skippedCount: 0,
        errorSummary: {
          message:
            "Configuration validation passed. External live test will be enabled in connector implementation.",
        },
      },
    });

    return res.json({
      success: true,
      message: "Integration configuration test passed.",
      job,
    });
  } catch (error) {
    return sendError(res, error, "Failed to test integration");
  }
}

export async function syncIntegration(req, res) {
  try {
    const integration = await getIntegrationForAccess(req, req.params?.id);
    const job = await runInventoryIntegrationSync(integration);

    const updated = await prisma.inventoryIntegration.findUnique({
      where: { id: integration.id },
      include: {
        shop: {
          select: {
            id: true,
            name: true,
            address: true,
          },
        },
      },
    });

    return res.json({
      success: job.status !== "FAILED",
      integration: normalizeIntegration(updated || integration),
      job,
    });
  } catch (error) {
    return sendError(res, error, "Failed to sync integration");
  }
}

export async function listIntegrationJobs(req, res) {
  try {
    const integration = await getIntegrationForAccess(req, req.params?.id);

    const jobs = await prisma.inventorySyncJob.findMany({
      where: { integrationId: integration.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return res.json({
      success: true,
      jobs,
    });
  } catch (error) {
    return sendError(res, error, "Failed to load integration jobs");
  }
}

export async function listIntegrationLogs(req, res) {
  return listIntegrationJobs(req, res);
}

export async function deleteIntegration(req, res) {
  try {
    const integration = await getIntegrationForAccess(req, req.params?.id);

    const archived = await prisma.inventoryIntegration.update({
      where: { id: integration.id },
      data: { status: "ARCHIVED" },
      include: {
        shop: {
          select: {
            id: true,
            name: true,
            address: true,
          },
        },
      },
    });

    return res.json({
      success: true,
      integration: normalizeIntegration(archived),
    });
  } catch (error) {
    return sendError(res, error, "Failed to archive integration");
  }
}

export async function receiveIntegrationWebhook(req, res) {
  try {
    const integration = await prisma.inventoryIntegration.findFirst({
      where: {
        id: normalizeString(req.params?.id),
        status: { not: "ARCHIVED" },
      },
    });

    if (!integration) {
      return res.status(404).json({
        success: false,
        error: "Integration not found",
      });
    }

    const event = await prisma.integrationWebhookEvent.create({
      data: {
        integrationId: integration.id,
        eventType: normalizeString(req.body?.eventType, "inventory.updated"),
        payload: req.body || {},
        signatureValid: false,
        status: "PENDING",
      },
    });

    return res.status(202).json({
      success: true,
      eventId: event.id,
      status: event.status,
    });
  } catch (error) {
    return sendError(res, error, "Failed to receive integration webhook");
  }
}
