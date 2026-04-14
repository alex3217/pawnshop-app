import { prisma } from "../lib/prisma.js";

export async function listUsers(req, res) {
  const users = await prisma.user.findMany({ orderBy: { createdAt: "desc" } });
  res.json(users.map(u => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    isActive: u.isActive,
    createdAt: u.createdAt
  })));
}

export async function blockUser(req, res) {
  const { id } = req.params;
  const user = await prisma.user.update({ where: { id }, data: { isActive: false } });
  res.json({ ok: true, id: user.id, isActive: user.isActive });
}

export async function unblockUser(req, res) {
  const { id } = req.params;
  const user = await prisma.user.update({ where: { id }, data: { isActive: true } });
  res.json({ ok: true, id: user.id, isActive: user.isActive });
}

export async function adminListItems(req, res) {
  const all = req.query.all === "true";
  const where = all ? {} : { isDeleted: false };
  const items = await prisma.item.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { shop: true }
  });
  res.json(items);
}

export async function softDeleteItem(req, res) {
  const { id } = req.params;
  const item = await prisma.item.update({ where: { id }, data: { isDeleted: true } });
  res.json({ ok: true, id: item.id, isDeleted: item.isDeleted });
}

export async function restoreItem(req, res) {
  const { id } = req.params;
  const item = await prisma.item.update({ where: { id }, data: { isDeleted: false } });
  res.json({ ok: true, id: item.id, isDeleted: item.isDeleted });
}

export async function adminListShops(req, res) {
  const all = req.query.all === "true";
  const where = all ? {} : { isDeleted: false };
  const shops = await prisma.pawnShop.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { owner: true }
  });
  res.json(shops.map(s => ({
    id: s.id,
    name: s.name,
    address: s.address,
    phone: s.phone,
    ownerId: s.ownerId,
    ownerEmail: s.owner?.email,
    isDeleted: s.isDeleted,
    createdAt: s.createdAt
  })));
}

export async function softDeleteShop(req, res) {
  const { id } = req.params;
  const shop = await prisma.pawnShop.update({ where: { id }, data: { isDeleted: true } });
  res.json({ ok: true, id: shop.id, isDeleted: shop.isDeleted });
}

export async function restoreShop(req, res) {
  const { id } = req.params;
  const shop = await prisma.pawnShop.update({ where: { id }, data: { isDeleted: false } });
  res.json({ ok: true, id: shop.id, isDeleted: shop.isDeleted });
}
