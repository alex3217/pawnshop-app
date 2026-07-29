import { prisma } from "../lib/prisma.js";

function userIdFrom(req) {
  return String(req.user?.sub || req.user?.id || req.user?.userId || "").trim();
}

export async function listMyNotifications(req, res) {
  const userId = userIdFrom(req);
  const notifications = await prisma.notification.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 50,
  });
  return res.json({ success: true, notifications });
}

export async function markMyNotificationRead(req, res) {
  const result = await prisma.notification.updateMany({
    where: { id: req.params.id, userId: userIdFrom(req), readAt: null },
    data: { readAt: new Date() },
  });
  if (result.count !== 1) {
    return res.status(404).json({ success: false, error: "Notification not found." });
  }
  return res.json({ success: true });
}
