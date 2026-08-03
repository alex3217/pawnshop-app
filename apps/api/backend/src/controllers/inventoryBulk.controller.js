import { prisma } from "../lib/prisma.js";
import { parseInventoryCsv } from "../services/inventoryCsv.service.js";

function sendError(res, error, fallback = "Internal server error") {
  const status =
    Number.isInteger(error?.statusCode) && error?.statusCode >= 400
      ? error.statusCode
      : 500;

  return res.status(status).json({
    success: false,
    error: error?.message || fallback,
  });
}

function normalizeString(value) {
  if (value === undefined || value === null) return null;
  const next = String(value).trim();
  return next.length ? next : null;
}

function normalizePrice(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return null;
  return num;
}

function normalizeStatus(value) {
  const next = String(value || "AVAILABLE").trim().toUpperCase();
  return ["AVAILABLE", "PENDING", "SOLD"].includes(next) ? next : "AVAILABLE";
}

export async function importInventoryCsv(req, res) {
  try {
    const userId = req?.user?.sub;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const shopId = normalizeString(req.body?.shopId);
    if (!shopId) {
      return res.status(400).json({ success: false, error: "shopId is required" });
    }

    if (!req.file?.buffer) {
      return res.status(400).json({ success: false, error: "CSV file is required" });
    }

    const shop = await prisma.pawnShop.findFirst({
      where: {
        id: shopId,
        ownerId: userId,
        isDeleted: false,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!shop) {
      return res.status(404).json({ success: false, error: "Owned shop not found" });
    }

    const { filename, rows } = parseInventoryCsv(req.file);
    const updatedJob = await prisma.$transaction(async (tx) => {
      const importJob = await tx.inventoryImportJob.create({
        data: { userId, shopId, filename, status: "PENDING", totalRows: rows.length },
      });
      for (const row of rows) {
        await tx.item.create({
          data: {
            pawnShopId: shopId,
            title: normalizeString(row.title),
            description: normalizeString(row.description),
            price: normalizePrice(row.price),
            currency: normalizeString(row.currency) || "USD",
            images: [],
            category: normalizeString(row.category),
            condition: normalizeString(row.condition),
            status: normalizeStatus(row.status),
          },
        });
      }
      return tx.inventoryImportJob.update({ where: { id: importJob.id }, data: { status: "COMPLETED", successCount: rows.length, failedCount: 0, errorsJson: [] } });
    });

    return res.status(201).json({
      success: true,
      importJob: updatedJob,
      shop,
      totalRows: rows.length,
      successCount: rows.length,
      failedCount: 0,
      errors: [],
    });
  } catch (error) {
    if (Array.isArray(error?.rowErrors)) return res.status(error.statusCode || 422).json({ success: false, error: error.message, errors: error.rowErrors });
    return sendError(res, error, "Failed to import inventory");
  }
}
