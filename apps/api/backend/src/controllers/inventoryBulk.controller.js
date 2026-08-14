import { parse } from "csv-parse/sync";
import { prisma } from "../lib/prisma.js";

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

    const isSupport = String(req.user?.role || "").toUpperCase() === "SUPER_ADMIN";
    const supportReason = normalizeString(req.body?.reason);
    const supportSessionId = normalizeString(req.headers["x-support-session-id"] || req.body?.supportSessionId);
    if (isSupport && (!supportReason || supportReason.length < 8)) return res.status(400).json({ success: false, error: "A specific support reason of at least 8 characters is required." });
    if (isSupport && !supportSessionId) return res.status(400).json({ success: false, error: "An active support session is required." });

    const shop = await prisma.pawnShop.findFirst({
      where: {
        id: shopId,
        ...(!isSupport ? { ownerId: userId } : {}),
        isDeleted: false,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!shop) {
      return res.status(404).json({ success: false, error: isSupport ? "Shop not found" : "Owned shop not found" });
    }
    if (isSupport) {
      const active = await prisma.inventorySupportSession.findFirst({ where: { id: supportSessionId, shopId, actorId: userId, endedAt: null } });
      if (!active) return res.status(403).json({ success: false, error: "Support session is invalid, ended, or belongs to another shop." });
    }

    const importJob = await prisma.inventoryImportJob.create({
      data: {
        userId,
        shopId,
        filename: req.file.originalname || "upload.csv",
        status: "PENDING",
      },
    });

    const rows = parse(req.file.buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    let successCount = 0;
    let failedCount = 0;
    const errors = [];

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const line = i + 2;

      try {
        const title = normalizeString(row.title);
        const price = normalizePrice(row.price);

        if (!title) {
          throw new Error("title is required");
        }

        if (price === null) {
          throw new Error("price must be a valid number");
        }

        await prisma.item.create({
          data: {
            pawnShopId: shopId,
            title,
            description: normalizeString(row.description),
            price,
            currency: normalizeString(row.currency) || "USD",
            images: [],
            category: normalizeString(row.category),
            condition: normalizeString(row.condition),
            status: normalizeStatus(row.status),
          },
        });

        successCount += 1;
      } catch (error) {
        failedCount += 1;
        errors.push({
          line,
          row,
          error: error instanceof Error ? error.message : "Unknown row error",
        });
      }
    }

    const finalStatus = failedCount > 0 && successCount === 0 ? "FAILED" : "COMPLETED";

    const updatedJob = await prisma.inventoryImportJob.update({
      where: { id: importJob.id },
      data: {
        status: finalStatus,
        totalRows: rows.length,
        successCount,
        failedCount,
        errorsJson: errors,
      },
    });

    if (isSupport) {
      await prisma.$transaction([
        prisma.inventoryAdminEvent.create({ data: { shopId, actorId: userId, supportSessionId, action: "BULK_IMPORT_INVENTORY", reason: supportReason, requestId: req.requestId || null, afterState: { importJobId: updatedJob.id, filename: updatedJob.filename, totalRows: rows.length, successCount, failedCount } } }),
        prisma.notification.create({ data: { userId: (await prisma.pawnShop.findUnique({ where: { id: shopId }, select: { ownerId: true } })).ownerId, type: "ADMIN_INVENTORY_CHANGE", title: "Administrative inventory import", message: `A Super Admin imported ${successCount} inventory records into ${shop.name}.`, actionUrl: "/owner/inventory", dedupeKey: `admin-inventory-import:${updatedJob.id}` } }),
      ]);
    }

    return res.status(201).json({
      success: true,
      importJob: updatedJob,
      shop,
      totalRows: rows.length,
      successCount,
      failedCount,
      errors,
    });
  } catch (error) {
    return sendError(res, error, "Failed to import inventory");
  }
}
