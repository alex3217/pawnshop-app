import { prisma } from "../lib/prisma.js";
import { changeTrainingStatus, createTrainingContent, getPublishedTraining, listAdminTraining, listPublishedTraining, reorderTraining, updateOwnTrainingProgress, updateTrainingContent } from "../services/training.service.js";

const actor = (req) => ({ id: String(req.user?.id || req.user?.sub), email: req.user?.email, role: req.user?.role });
const send = (res, promise, key) => promise.then((value) => res.json({ success: true, [key]: value }));
export const listTraining = (req, res) => send(res, listPublishedTraining(actor(req), req.query), "items");
export const getTraining = (req, res) => send(res, getPublishedTraining(actor(req), req.params.slug), "item");
export const updateProgress = (req, res) => send(res, updateOwnTrainingProgress(actor(req), req.params.id, req.body), "progress");
export const listManagedTraining = (req, res) => send(res, listAdminTraining(req.query), "items");

export async function runTrainingAuditTransaction(req, action, targetId, operation, db = prisma) {
  return db.$transaction(async (tx) => {
    const result = await operation(tx);
    await tx.superAdminAuditLog.create({ data: { actorId: actor(req).id, actorEmail: actor(req).email, actorRole: actor(req).role, action, method: req.method, path: req.originalUrl, routeKey: "training-content", targetType: "TrainingContent", targetId, statusCode: 200, success: true, requestId: req.requestId, metadata: { contentId: targetId || result.id || null } } });
    return result;
  });
}
export const createManagedTraining = async (req, res) => res.status(201).json({ success: true, item: await runTrainingAuditTransaction(req, "TRAINING_CONTENT_CREATED", null, (tx) => createTrainingContent(actor(req), req.body, tx)) });
export const updateManagedTraining = async (req, res) => res.json({ success: true, item: await runTrainingAuditTransaction(req, "TRAINING_CONTENT_UPDATED", req.params.id, (tx) => updateTrainingContent(actor(req), req.params.id, req.body, tx)) });
export const lifecycleManagedTraining = async (req, res) => { const status = String(req.body?.status || "").toUpperCase(); return res.json({ success: true, item: await runTrainingAuditTransaction(req, `TRAINING_CONTENT_${status}`, req.params.id, (tx) => changeTrainingStatus(actor(req), req.params.id, status, tx)) }); };
export const reorderManagedTraining = async (req, res) => res.json({ success: true, items: await runTrainingAuditTransaction(req, "TRAINING_CONTENT_REORDERED", null, (tx) => reorderTraining(actor(req), req.body?.items, tx)) });
