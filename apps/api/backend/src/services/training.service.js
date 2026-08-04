import { prisma } from "../lib/prisma.js";

const ROLES = new Set(["CONSUMER", "OWNER", "ADMIN", "SUPER_ADMIN"]);
const TYPES = new Set(["VIDEO", "TUTORIAL"]);
const DIFFICULTIES = new Set(["BEGINNER", "INTERMEDIATE", "ADVANCED"]);
const STATUSES = new Set(["DRAFT", "PUBLISHED", "UNPUBLISHED", "ARCHIVED"]);
const VIDEO_HOSTS = new Set(["youtube.com", "www.youtube.com", "youtu.be", "vimeo.com", "www.vimeo.com"]);

function problem(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function text(value, label, max, required = true) {
  const result = String(value ?? "").trim();
  if (required && !result) throw problem(`${label} is required.`);
  if (result.length > max) throw problem(`${label} must be ${max} characters or fewer.`);
  return result;
}

function normalizeYouTubeTimestamp(value) {
  if (!value) return null;
  const timestamp = String(value);
  if (timestamp.length > 20 || !/^(?:\d{1,6}s?|(?=\d)(?:\d{1,3}h)?(?:\d{1,3}m)?(?:\d{1,3}s)?)$/.test(timestamp)) {
    throw problem("YouTube timestamp is invalid.");
  }
  return timestamp;
}

export function validateTrainingVideoUrl(value) {
  if (!value) return null;
  if (typeof value !== "string" || /<|>|iframe|script/i.test(value)) throw problem("Video URL must not contain embed HTML.");
  let url;
  try { url = new URL(value.trim()); } catch { throw problem("Video URL is invalid."); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash || !VIDEO_HOSTS.has(host)) {
    throw problem("Video URL must be an approved YouTube or Vimeo HTTPS URL.");
  }
  if (host === "youtu.be") {
    if (!/^\/[A-Za-z0-9_-]{6,20}\/?$/.test(url.pathname)) throw problem("YouTube video URL is invalid.");
    const timestamp = normalizeYouTubeTimestamp(url.searchParams.get("t"));
    url.search = "";
    if (timestamp) url.searchParams.set("t", timestamp);
  } else if (host.endsWith("youtube.com")) {
    const videoId = url.searchParams.get("v") || "";
    const timestamp = normalizeYouTubeTimestamp(url.searchParams.get("t"));
    if (url.pathname !== "/watch" || !/^[A-Za-z0-9_-]{6,20}$/.test(videoId)) throw problem("YouTube video URL is invalid.");
    url.search = "";
    url.searchParams.set("v", videoId);
    if (timestamp) url.searchParams.set("t", timestamp);
  } else if (!/^\/\d{6,12}\/?$/.test(url.pathname)) throw problem("Vimeo video URL is invalid.");
  return url.toString();
}

export function validatePublishedTrainingContent(state) {
  if (!state || typeof state !== "object") throw problem("Training content is invalid.");
  if (!Array.isArray(state.audiences) || state.audiences.length === 0) {
    throw problem("Published content requires at least one audience.");
  }
  if (state.type === "VIDEO") {
    if (!state.videoUrl) throw problem("Published video content requires a video URL.");
    validateTrainingVideoUrl(state.videoUrl);
    return;
  }
  if (state.type === "TUTORIAL") {
    if (!Array.isArray(state.steps) || state.steps.length === 0) {
      throw problem("Published tutorial content requires at least one step.");
    }
    state.steps.forEach((step, index) => {
      text(step?.title, `Step ${index + 1} title`, 160);
      text(step?.body, `Step ${index + 1} body`, 10000);
    });
    return;
  }
  throw problem("Published content type is invalid.");
}

function normalizeInput(input, partial = false) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw problem("Request body must be an object.");
  const out = {};
  if (!partial || input.slug !== undefined) {
    const slug = text(input.slug, "Slug", 100).toLowerCase();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw problem("Slug must use lowercase letters, numbers, and hyphens.");
    out.slug = slug;
  }
  for (const [key, label, max] of [["title", "Title", 160], ["summary", "Summary", 1000], ["category", "Category", 80]]) {
    if (!partial || input[key] !== undefined) out[key] = text(input[key], label, max);
  }
  if (!partial || input.type !== undefined) {
    out.type = String(input.type || "").toUpperCase();
    if (!TYPES.has(out.type)) throw problem("Type must be VIDEO or TUTORIAL.");
  }
  if (!partial || input.difficulty !== undefined) {
    out.difficulty = String(input.difficulty || "BEGINNER").toUpperCase();
    if (!DIFFICULTIES.has(out.difficulty)) throw problem("Difficulty is invalid.");
  }
  if (!partial) {
    out.status = String(input.status || "DRAFT").toUpperCase();
    if (!STATUSES.has(out.status) || ["UNPUBLISHED", "ARCHIVED"].includes(out.status)) {
      throw problem("New content status must be DRAFT or PUBLISHED.");
    }
  }
  if (!partial || input.audiences !== undefined) {
    if (!Array.isArray(input.audiences)) throw problem("Audiences must be an array.");
    out.audiences = [...new Set(input.audiences.map((role) => String(role).toUpperCase()))];
    if (!out.audiences.length || out.audiences.some((role) => !ROLES.has(role))) throw problem("At least one valid audience is required.");
  }
  if (!partial || input.steps !== undefined) {
    if (!Array.isArray(input.steps)) throw problem("Steps must be an array.");
    out.steps = input.steps.map((step, index) => ({ position: index + 1, title: text(step?.title, `Step ${index + 1} title`, 160), body: text(step?.body, `Step ${index + 1} body`, 10000) }));
  }
  if (!partial || input.videoUrl !== undefined) out.videoUrl = validateTrainingVideoUrl(input.videoUrl);
  for (const key of ["featured", "required"]) if (!partial || input[key] !== undefined) out[key] = Boolean(input[key]);
  for (const key of ["durationSeconds", "sortOrder"]) if (!partial || input[key] !== undefined) {
    const number = Number(input[key] ?? (key === "sortOrder" ? 0 : 0));
    if (!Number.isInteger(number) || number < 0 || number > (key === "sortOrder" ? 1_000_000 : 86400)) throw problem(`${key} is invalid.`);
    out[key] = key === "durationSeconds" && number === 0 ? null : number;
  }
  return out;
}

function publishedWhere(user, query = {}) {
  const where = { status: "PUBLISHED", audiences: { some: { role: user.role } } };
  if (query.category) where.category = String(query.category).trim();
  if (query.difficulty && DIFFICULTIES.has(String(query.difficulty).toUpperCase())) where.difficulty = String(query.difficulty).toUpperCase();
  if (query.type && TYPES.has(String(query.type).toUpperCase())) where.type = String(query.type).toUpperCase();
  if (String(query.featured) === "true") where.featured = true;
  const search = String(query.search || "").trim().slice(0, 100);
  if (search) where.OR = ["title", "summary", "category"].map((field) => ({ [field]: { contains: search, mode: "insensitive" } }));
  return where;
}

const publicInclude = (userId) => ({ audiences: { select: { role: true } }, steps: { orderBy: { position: "asc" } }, progress: { where: { userId }, take: 1 } });
const serialize = (row) => ({ ...row, audiences: row.audiences.map((item) => item.role), progress: row.progress?.[0] || null });

export async function listPublishedTraining(user, query) {
  const rows = await prisma.trainingContent.findMany({ where: publishedWhere(user, query), include: publicInclude(user.id), orderBy: [{ featured: "desc" }, { sortOrder: "asc" }, { createdAt: "desc" }] });
  return rows.map(serialize);
}

export async function getPublishedTraining(user, slug) {
  const row = await prisma.trainingContent.findFirst({ where: { ...publishedWhere(user), slug }, include: publicInclude(user.id) });
  if (!row) throw problem("Training content not found.", 404);
  return serialize(row);
}

export async function updateOwnTrainingProgress(user, contentId, input) {
  const content = await prisma.trainingContent.findFirst({ where: { id: contentId, ...publishedWhere(user) }, select: { id: true, durationSeconds: true } });
  if (!content) throw problem("Training content not found.", 404);
  const position = Number(input?.resumePositionSeconds ?? 0);
  if (!Number.isInteger(position) || position < 0 || position > 86400 || (content.durationSeconds && position > content.durationSeconds)) throw problem("Resume position is invalid.");
  const complete = input?.completed === true;
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const existing = await tx.trainingProgress.findUnique({ where: { userId_contentId: { userId: user.id, contentId } } });
    return tx.trainingProgress.upsert({
      where: { userId_contentId: { userId: user.id, contentId } },
      create: { userId: user.id, contentId, resumePositionSeconds: position, completedAt: complete ? now : null, lastViewedAt: now },
      update: { resumePositionSeconds: Math.max(existing?.resumePositionSeconds || 0, position), completedAt: existing?.completedAt || (complete ? now : null), lastViewedAt: now },
    });
  });
}

function nestedWrites(data) {
  const audiences = data.audiences; const steps = data.steps;
  delete data.audiences; delete data.steps;
  return { data, audiences, steps };
}

async function removeOwnedChildren(model, contentId, children) {
  for (const child of children) {
    await model.delete({ where: { id: child.id, contentId } });
  }
}

export async function createTrainingContent(actor, input, db = prisma) {
  const normalized = normalizeInput(input);
  const { data, audiences, steps } = nestedWrites(normalized);
  if (data.status === "PUBLISHED") validatePublishedTrainingContent({ ...data, audiences, steps });
  const now = data.status === "PUBLISHED" ? new Date() : null;
  return db.trainingContent.create({ data: { ...data, publishedAt: now, createdByUserId: actor.id, updatedByUserId: actor.id, audiences: { create: audiences.map((role) => ({ role })) }, steps: { create: steps } }, include: { audiences: true, steps: { orderBy: { position: "asc" } } } });
}

export async function updateTrainingContent(actor, id, input, db = prisma) {
  const normalized = normalizeInput(input, true);
  const { data, audiences, steps: requestedSteps } = nestedWrites(normalized);
  const update = async (tx) => {
    const existing = await tx.trainingContent.findUnique({ where: { id }, include: { audiences: true, steps: { orderBy: { position: "asc" } } } });
    if (!existing) throw problem("Training content not found.", 404);
    if (existing.status === "ARCHIVED") throw problem("Archived content cannot be edited.", 409);
    const steps = data.type === "VIDEO" && existing.type !== "VIDEO" && requestedSteps === undefined
      ? []
      : requestedSteps;
    const finalState = {
      ...existing,
      ...data,
      audiences: audiences ?? existing.audiences,
      steps: steps ?? existing.steps,
    };
    if (existing.status === "PUBLISHED") validatePublishedTrainingContent(finalState);
    if (audiences) {
      await removeOwnedChildren(tx.trainingAudience, id, existing.audiences);
      data.audiences = { create: audiences.map((role) => ({ role })) };
    }
    if (steps) {
      await removeOwnedChildren(tx.trainingTutorialStep, id, existing.steps);
      data.steps = { create: steps };
    }
    return tx.trainingContent.update({ where: { id }, data: { ...data, updatedByUserId: actor.id }, include: { audiences: true, steps: { orderBy: { position: "asc" } } } });
  };
  return db === prisma ? prisma.$transaction(update) : update(db);
}

export async function changeTrainingStatus(actor, id, status, db = prisma) {
  if (!STATUSES.has(status) || status === "DRAFT") throw problem("Lifecycle status is invalid.");
  const row = await db.trainingContent.findUnique({ where: { id }, include: { audiences: true, steps: true } });
  if (!row) throw problem("Training content not found.", 404);
  if (row.status === "ARCHIVED") throw problem("Archived content is immutable.", 409);
  if (status === "PUBLISHED") {
    validatePublishedTrainingContent(row);
  }
  return db.trainingContent.update({ where: { id }, data: { status, updatedByUserId: actor.id, publishedAt: status === "PUBLISHED" ? new Date() : row.publishedAt, archivedAt: status === "ARCHIVED" ? new Date() : null } });
}

export async function listAdminTraining(query = {}) {
  const where = {};
  const status = String(query.status || "").toUpperCase(); if (STATUSES.has(status)) where.status = status;
  if (query.category) where.category = String(query.category).trim();
  const rows = await prisma.trainingContent.findMany({ where, include: { audiences: true, steps: { orderBy: { position: "asc" } }, _count: { select: { progress: true } }, progress: { where: { completedAt: { not: null } }, select: { id: true } } }, orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }] });
  return rows.map((row) => ({ ...row, audiences: row.audiences.map((a) => a.role), statistics: { started: row._count.progress, completed: row.progress.length }, progress: undefined, _count: undefined }));
}

export async function reorderTraining(actor, items, db = prisma) {
  if (!Array.isArray(items) || !items.length || items.length > 200) throw problem("Order items are required.");
  const normalized = items.map((item) => ({ id: text(item?.id, "Content id", 128), sortOrder: Number(item?.sortOrder) }));
  if (normalized.some((item) => !Number.isInteger(item.sortOrder) || item.sortOrder < 0 || item.sortOrder > 1_000_000)) throw problem("Sort order is invalid.");
  return Promise.all(normalized.map((item) => db.trainingContent.update({ where: { id: item.id }, data: { sortOrder: item.sortOrder, updatedByUserId: actor.id } })));
}
