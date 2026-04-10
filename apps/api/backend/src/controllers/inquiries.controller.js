import { prisma } from "../lib/prisma.js";

export async function createInquiry(req, res) {
  const { itemId, consumerEmail, message } = req.body || {};
  if (!itemId || !consumerEmail || !message) return res.status(400).json({ error: "Missing fields" });

  const item = await prisma.item.findUnique({
    where: { id: itemId },
    include: { shop: true },
  });
  if (!item || item.isDeleted) return res.status(404).json({ error: "Item not found" });

  const inquiry = await prisma.inquiry.create({
    data: { itemId, consumerEmail, message },
  });

  res.status(201).json({ ok: true, inquiry });
}
