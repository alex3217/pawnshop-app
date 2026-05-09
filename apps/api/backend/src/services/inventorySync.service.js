// File: apps/api/backend/src/services/inventorySync.service.js

import crypto from "node:crypto";
import { prisma } from "../lib/prisma.js";

const VALID_STATUSES = new Set(["AVAILABLE", "PENDING", "SOLD"]);
const VALID_CATEGORIES = new Set([
  "Jewelry",
  "Electronics",
  "Musical Instruments",
  "Tools",
  "Collectibles",
  "Watches",
  "Designer Goods",
  "Sports Equipment",
  "Appliances",
  "Vehicles",
  "Other",
]);

const VALID_CONDITIONS = new Set([
  "New",
  "Like New",
  "Excellent",
  "Good",
  "Fair",
  "Poor",
  "For Parts",
]);

function normalizeString(value, fallback = "") {
  if (value === undefined || value === null) return fallback;
  const next = String(value).trim();
  return next.length ? next : fallback;
}

function normalizeNullableString(value) {
  const next = normalizeString(value);
  return next || null;
}

function normalizePrice(value) {
  if (value === undefined || value === null || value === "") return null;

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;

  return parsed;
}

function normalizeStatus(value) {
  const status = normalizeString(value, "AVAILABLE").toUpperCase();
  return VALID_STATUSES.has(status) ? status : "AVAILABLE";
}

function normalizeCategory(value) {
  const category = normalizeNullableString(value);
  if (!category) return null;
  return VALID_CATEGORIES.has(category) ? category : "Other";
}

function normalizeCondition(value) {
  const condition = normalizeNullableString(value);
  if (!condition) return null;
  return VALID_CONDITIONS.has(condition) ? condition : "Good";
}

function normalizeImages(value) {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeString(entry))
      .filter(Boolean);
  }

  const single = normalizeString(value);
  return single ? [single] : [];
}

function pickFirst(row, keys, fallback = undefined) {
  for (const key of keys) {
    if (row?.[key] !== undefined && row?.[key] !== null && row?.[key] !== "") {
      return row[key];
    }
  }

  return fallback;
}

function extractRows(payload) {
  if (Array.isArray(payload)) return payload;

  if (payload && typeof payload === "object") {
    if (Array.isArray(payload.items)) return payload.items;
    if (Array.isArray(payload.inventory)) return payload.inventory;
    if (Array.isArray(payload.data)) return payload.data;
    if (payload.data && typeof payload.data === "object") {
      if (Array.isArray(payload.data.items)) return payload.data.items;
      if (Array.isArray(payload.data.inventory)) return payload.data.inventory;
    }
  }

  return [];
}

function buildInventoryUrl(integration) {
  const baseUrl = normalizeString(integration.baseUrl);
  const endpoint = normalizeString(integration.inventoryEndpoint);

  if (!baseUrl && !endpoint) {
    throw new Error("Integration needs a base URL or inventory endpoint.");
  }

  if (baseUrl.startsWith("data:")) return baseUrl;

  if (!baseUrl) return endpoint;

  if (!endpoint) return baseUrl;

  return new URL(endpoint, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
}

function buildFetchHeaders(integration) {
  const headers = {
    Accept: "application/json",
  };

  if (integration.authType === "API_KEY" && integration.metadata?.apiKeyHeader) {
    headers[String(integration.metadata.apiKeyHeader)] = String(
      integration.metadata.apiKeyValue || "",
    );
  }

  if (integration.authType === "BEARER_TOKEN" && integration.metadata?.bearerToken) {
    headers.Authorization = `Bearer ${integration.metadata.bearerToken}`;
  }

  return headers;
}

async function fetchExternalInventory(integration) {
  if (Array.isArray(integration.metadata?.sampleItems)) {
    return integration.metadata.sampleItems;
  }

  const url = buildInventoryUrl(integration);

  const response = await fetch(url, {
    method: "GET",
    headers: buildFetchHeaders(integration),
  });

  if (!response.ok) {
    throw new Error(`External inventory request failed with HTTP ${response.status}`);
  }

  const payload = await response.json();
  return extractRows(payload);
}

function normalizeExternalRow(row) {
  const externalId = normalizeString(
    pickFirst(row, ["externalId", "external_id", "sku", "SKU", "id", "barcode", "code"]),
  );

  const title = normalizeString(
    pickFirst(row, ["title", "name", "itemName", "item_name", "description_short"]),
  );

  const price = normalizePrice(
    pickFirst(row, ["price", "amount", "retailPrice", "retail_price", "salePrice"]),
  );

  const description = normalizeNullableString(
    pickFirst(row, ["description", "details", "notes"]),
  );

  return {
    externalId,
    title,
    description,
    price,
    currency: normalizeString(pickFirst(row, ["currency"], "USD"), "USD"),
    category: normalizeCategory(pickFirst(row, ["category", "department"])),
    condition: normalizeCondition(pickFirst(row, ["condition", "grade"])),
    status: normalizeStatus(pickFirst(row, ["status", "availability"])),
    images: normalizeImages(pickFirst(row, ["images", "imageUrls", "imageUrl", "photo"])),
  };
}

function hashSource(row) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(row))
    .digest("hex");
}

function toItemData(shopId, normalized) {
  return {
    pawnShopId: shopId,
    title: normalized.title,
    description: normalized.description,
    price: normalized.price,
    currency: normalized.currency || "USD",
    images: normalized.images,
    category: normalized.category,
    condition: normalized.condition,
    status: normalized.status,
  };
}

export async function runInventoryIntegrationSync(integration) {
  const startedAt = new Date();

  const job = await prisma.inventorySyncJob.create({
    data: {
      integrationId: integration.id,
      shopId: integration.shopId,
      status: "RUNNING",
      startedAt,
    },
  });

  let createdCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  const errors = [];

  try {
    if (integration.type === "CSV_UPLOAD") {
      const finishedAt = new Date();

      const updatedJob = await prisma.inventorySyncJob.update({
        where: { id: job.id },
        data: {
          status: "COMPLETED",
          finishedAt,
          skippedCount: 1,
          errorSummary: {
            message: "CSV imports are processed through /inventory-bulk/import.",
          },
        },
      });

      await prisma.inventoryIntegration.update({
        where: { id: integration.id },
        data: { lastSyncAt: finishedAt },
      });

      return updatedJob;
    }

    if (!["API_PULL", "POS_SYSTEM"].includes(integration.type)) {
      const finishedAt = new Date();

      const updatedJob = await prisma.inventorySyncJob.update({
        where: { id: job.id },
        data: {
          status: "COMPLETED",
          finishedAt,
          skippedCount: 1,
          errorSummary: {
            message: `${integration.type} sync worker is not enabled yet.`,
          },
        },
      });

      await prisma.inventoryIntegration.update({
        where: { id: integration.id },
        data: { lastSyncAt: finishedAt },
      });

      return updatedJob;
    }

    const rows = await fetchExternalInventory(integration);

    for (const row of rows) {
      try {
        const normalized = normalizeExternalRow(row);

        if (!normalized.externalId) {
          skippedCount += 1;
          errors.push({ reason: "externalId missing", row });
          continue;
        }

        if (!normalized.title || normalized.price === null) {
          skippedCount += 1;
          errors.push({
            externalId: normalized.externalId,
            reason: "title and valid price are required",
          });
          continue;
        }

        const sourceHash = hashSource(row);

        const existingMapping = await prisma.externalInventoryMapping.findUnique({
          where: {
            integrationId_externalId: {
              integrationId: integration.id,
              externalId: normalized.externalId,
            },
          },
        });

        if (existingMapping?.itemId) {
          const existingItem = await prisma.item.findFirst({
            where: {
              id: existingMapping.itemId,
              pawnShopId: integration.shopId,
              isDeleted: false,
            },
            select: { id: true },
          });

          if (existingItem) {
            await prisma.item.update({
              where: { id: existingItem.id },
              data: toItemData(integration.shopId, normalized),
            });

            await prisma.externalInventoryMapping.update({
              where: { id: existingMapping.id },
              data: {
                lastSeenAt: new Date(),
                sourceHash,
              },
            });

            updatedCount += 1;
            continue;
          }
        }

        const created = await prisma.item.create({
          data: toItemData(integration.shopId, normalized),
          select: { id: true },
        });

        await prisma.externalInventoryMapping.upsert({
          where: {
            integrationId_externalId: {
              integrationId: integration.id,
              externalId: normalized.externalId,
            },
          },
          create: {
            integrationId: integration.id,
            externalId: normalized.externalId,
            itemId: created.id,
            sourceHash,
          },
          update: {
            itemId: created.id,
            lastSeenAt: new Date(),
            sourceHash,
          },
        });

        createdCount += 1;
      } catch (error) {
        errorCount += 1;
        errors.push({
          reason: error instanceof Error ? error.message : "Unknown row error",
          row,
        });
      }
    }

    const finishedAt = new Date();
    const status = errorCount > 0 && createdCount === 0 && updatedCount === 0
      ? "FAILED"
      : "COMPLETED";

    const updatedJob = await prisma.inventorySyncJob.update({
      where: { id: job.id },
      data: {
        status,
        finishedAt,
        createdCount,
        updatedCount,
        skippedCount,
        errorCount,
        errorSummary: {
          totalRows: rows.length,
          errors: errors.slice(0, 25),
        },
      },
    });

    await prisma.inventoryIntegration.update({
      where: { id: integration.id },
      data: {
        status: "CONNECTED",
        lastSyncAt: finishedAt,
      },
    });

    return updatedJob;
  } catch (error) {
    const finishedAt = new Date();

    const updatedJob = await prisma.inventorySyncJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        finishedAt,
        createdCount,
        updatedCount,
        skippedCount,
        errorCount: errorCount + 1,
        errorSummary: {
          message: error instanceof Error ? error.message : "Sync failed",
          errors: errors.slice(0, 25),
        },
      },
    });

    await prisma.inventoryIntegration.update({
      where: { id: integration.id },
      data: {
        status: "ERROR",
        lastSyncAt: finishedAt,
      },
    });

    return updatedJob;
  }
}
