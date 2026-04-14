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

export async function getMySavedSearches(req, res) {
  try {
    const userId = req?.user?.sub;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const rows = await prisma.savedSearch.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    return res.json(rows);
  } catch (error) {
    return sendError(res, error, "Failed to load saved searches");
  }
}

export async function addSavedSearch(req, res) {
  try {
    const userId = req?.user?.sub;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const query = normalizeString(req.body?.query);
    if (!query) {
      return res.status(400).json({ success: false, error: "query is required" });
    }

    const row = await prisma.savedSearch.create({
      data: {
        userId,
        query,
      },
    });

    return res.status(201).json(row);
  } catch (error) {
    return sendError(res, error, "Failed to save search");
  }
}

export async function removeSavedSearch(req, res) {
  try {
    const userId = req?.user?.sub;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const id = normalizeString(req.params?.id);
    if (!id) {
      return res.status(400).json({ success: false, error: "id is required" });
    }

    await prisma.savedSearch.delete({
      where: { id },
    });

    return res.json({ success: true, id });
  } catch (error) {
    return sendError(res, error, "Failed to remove saved search");
  }
}
