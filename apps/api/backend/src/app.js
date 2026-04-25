// File: apps/api/backend/src/app.js

import crypto from "node:crypto";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";

import authRoutes from "./routes/auth.routes.js";
import shopRoutes from "./routes/shops.routes.js";
import offersRoutes from "./routes/offers.routes.js";
import itemRoutes from "./routes/items.routes.js";
import inquiryRoutes from "./routes/inquiries.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import superAdminRoutes from "./routes/superAdmin.routes.js";
import auctionRoutes from "./routes/auctions.routes.js";
import bidsRoutes from "./routes/bids.routes.js";
import watchlistRoutes from "./routes/watchlist.routes.js";
import inventoryBulkRoutes from "./routes/inventoryBulk.routes.js";
import savedSearchesRoutes from "./routes/savedSearches.routes.js";
import sellerPlansRoutes from "./routes/sellerPlans.routes.js";
import buyerPlansRoutes from "./routes/buyerPlans.routes.js";
import locationsRoutes from "./routes/locations.routes.js";
import staffRoutes from "./routes/staff.routes.js";
import settlementsRoutes from "./routes/settlements.routes.js";
import stripeRoutes from "./routes/stripe.routes.js";
import stripeWebhookRoutes from "./routes/stripeWebhook.routes.js";

function parseAllowedOrigins(...values) {
  return new Set(
    values
      .flatMap((value) => String(value || "").split(","))
      .map((value) => value.trim())
      .filter(Boolean)
  );
}

function normalizeMountPath(path) {
  const trimmed = String(path || "").trim();
  if (!trimmed || trimmed === "/") return "/";
  return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
}

function mountApi(app, path, router) {
  const normalizedPath = normalizeMountPath(path);

  if (normalizedPath === "/") {
    app.use(router);
    app.use("/api", router);
    return;
  }

  app.use(normalizedPath, router);
  app.use(`/api${normalizedPath}`, router);
}

function createCorsOptions(allowedOrigins) {
  return {
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (allowedOrigins.size === 0) return cb(null, true);
      if (allowedOrigins.has(origin)) return cb(null, true);

      const err = new Error(`CORS blocked: ${origin}`);
      err.statusCode = 403;
      return cb(err);
    },
    credentials: true,
    optionsSuccessStatus: 204,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "X-Request-Id",
      "Stripe-Signature",
    ],
  };
}

function shouldTrustProxy() {
  return process.env.TRUST_PROXY === "1" || process.env.NODE_ENV === "production";
}

function requestIdMiddleware(req, res, next) {
  const incomingId = String(req.headers["x-request-id"] || "").trim();
  const requestId = incomingId || crypto.randomUUID();

  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  next();
}

function noStore(_req, res, next) {
  res.setHeader("Cache-Control", "no-store");
  next();
}

function createHealthPayload(serviceName, env) {
  return {
    ok: true,
    success: true,
    service: serviceName,
    env,
    ts: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    pid: process.pid,
    memory: process.memoryUsage(),
  };
}

function createErrorResponse(err, req) {
  const rawStatus = Number(err?.statusCode || err?.status || 500);
  const statusCode = rawStatus >= 400 && rawStatus <= 599 ? rawStatus : 500;
  const message = err?.message || "Internal Server Error";

  const body = {
    success: false,
    error:
      process.env.NODE_ENV === "production" && statusCode >= 500
        ? "Internal Server Error"
        : message,
    requestId: req.requestId,
  };

  if (process.env.NODE_ENV !== "production" && err?.details) {
    body.details = err.details;
  }

  return { statusCode, body, message };
}

export function createApp() {
  const app = express();

  const serviceName = process.env.APP_NAME || "pawnshop-api";
  const env = process.env.APP_ENV || process.env.NODE_ENV || "development";
  const allowedOrigins = parseAllowedOrigins(
    process.env.CORS_ORIGINS,
    process.env.CORS_ORIGIN,
    process.env.FRONTEND_URL,
    process.env.WEB_URL
  );

  const jsonLimit = process.env.JSON_LIMIT || "2mb";
  const urlencodedLimit = process.env.URLENCODED_LIMIT || jsonLimit;
  const morganFormat = process.env.NODE_ENV === "production" ? "combined" : "dev";

  app.disable("x-powered-by");

  if (shouldTrustProxy()) {
    app.set("trust proxy", 1);
  }

  app.use(requestIdMiddleware);

  app.use(
    helmet({
      crossOriginResourcePolicy: false,
      contentSecurityPolicy:
        process.env.NODE_ENV === "production" ? undefined : false,
    })
  );

  const corsOptions = createCorsOptions(allowedOrigins);
  app.use(cors(corsOptions));
  app.options(/.*/, cors(corsOptions));

  app.use(
    morgan(morganFormat, {
      skip(req) {
        return req.path === "/health" || req.path === "/api/health";
      },
    })
  );

  const healthHandler = (_req, res) => {
    return res.status(200).json(createHealthPayload(serviceName, env));
  };

  const rootHandler = (_req, res) => {
    return res.status(200).json({
      ok: true,
      success: true,
      service: serviceName,
      message: "API is running",
      env,
    });
  };

  app.get("/", noStore, rootHandler);
  app.get("/api", noStore, rootHandler);
  app.get("/health", noStore, healthHandler);
  app.get("/api/health", noStore, healthHandler);

  /**
   * Stripe webhook must stay before express.json().
   */
  app.use("/webhooks/stripe", stripeWebhookRoutes);
  app.use("/api/webhooks/stripe", stripeWebhookRoutes);

  app.use(
    express.json({
      limit: jsonLimit,
      strict: true,
      type: ["application/json", "application/*+json"],
    })
  );

  app.use(
    express.urlencoded({
      extended: true,
      limit: urlencodedLimit,
    })
  );

  mountApi(app, "/auth", authRoutes);
  mountApi(app, "/shops", shopRoutes);
  mountApi(app, "/locations", locationsRoutes);
  mountApi(app, "/items", itemRoutes);
  mountApi(app, "/inventory-bulk", inventoryBulkRoutes);
  mountApi(app, "/inquiries", inquiryRoutes);
  mountApi(app, "/admin", adminRoutes);
  mountApi(app, "/super-admin", superAdminRoutes);
  mountApi(app, "/auctions", auctionRoutes);
  mountApi(app, "/bids", bidsRoutes);
  mountApi(app, "/watchlist", watchlistRoutes);
  mountApi(app, "/saved-searches", savedSearchesRoutes);
  mountApi(app, "/offers", offersRoutes);
  mountApi(app, "/staff", staffRoutes);
  mountApi(app, "/settlements", settlementsRoutes);
  mountApi(app, "/stripe", stripeRoutes);

  app.use("/api", sellerPlansRoutes);
  app.use("/api", buyerPlansRoutes);

  app.use((req, res) => {
    return res.status(404).json({
      success: false,
      error: `Cannot ${req.method} ${req.originalUrl}`,
      requestId: req.requestId,
    });
  });

  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);

    if (err instanceof SyntaxError && "body" in err) {
      return res.status(400).json({
        success: false,
        error: "Invalid JSON payload",
        requestId: req.requestId,
      });
    }

    if (err?.type === "entity.too.large") {
      return res.status(413).json({
        success: false,
        error: "Request payload too large",
        requestId: req.requestId,
      });
    }

    if (String(err?.message || "").startsWith("CORS blocked:")) {
      return res.status(403).json({
        success: false,
        error: err.message,
        requestId: req.requestId,
      });
    }

    const { statusCode, body, message } = createErrorResponse(err, req);

    console.error("[app:error]", {
      requestId: req.requestId,
      method: req.method,
      url: req.originalUrl,
      name: err?.name,
      message,
      statusCode,
      stack: err?.stack,
    });

    return res.status(statusCode).json(body);
  });

  return app;
}

export default createApp;