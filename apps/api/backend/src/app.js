// File: apps/api/backend/src/app.js

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
import auctionRoutes from "./routes/auctions.routes.js";
import bidsRoutes from "./routes/bids.routes.js";
import watchlistRoutes from "./routes/watchlist.routes.js";
import inventoryBulkRoutes from "./routes/inventoryBulk.routes.js";
import savedSearchesRoutes from "./routes/savedSearches.routes.js";
import sellerPlansRoutes from "./routes/sellerPlans.routes.js";
import stripeRoutes from "./routes/stripe.routes.js";
import stripeWebhookRoutes from "./routes/stripeWebhook.routes.js";

function parseAllowedOrigins(...values) {
  const items = values
    .flatMap((value) => String(value || "").split(","))
    .map((value) => value.trim())
    .filter(Boolean);

  return new Set(items);
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
  };
}

export function createApp() {
  const app = express();

  const serviceName = process.env.APP_NAME || "pawnshop-api";
  const env = process.env.APP_ENV || process.env.NODE_ENV || "development";
  const allowedOrigins = parseAllowedOrigins(
    process.env.CORS_ORIGINS,
    process.env.CORS_ORIGIN
  );

  const jsonLimit = process.env.JSON_LIMIT || "1mb";
  const urlencodedLimit = process.env.URLENCODED_LIMIT || jsonLimit;
  const morganFormat = process.env.NODE_ENV === "production" ? "combined" : "dev";

  app.disable("x-powered-by");

  if (process.env.TRUST_PROXY === "1" || process.env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
  }

  app.use(
    helmet({
      crossOriginResourcePolicy: false,
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
    res.set("Cache-Control", "no-store");

    return res.status(200).json({
      ok: true,
      service: serviceName,
      env,
      ts: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    });
  };

  const rootHandler = (_req, res) => {
    res.set("Cache-Control", "no-store");

    return res.status(200).json({
      ok: true,
      service: serviceName,
      message: "API is running",
      env,
    });
  };

  app.get("/", rootHandler);
  app.get("/api", rootHandler);
  app.get("/health", healthHandler);
  app.get("/api/health", healthHandler);

  /**
   * Stripe webhook must be mounted BEFORE express.json() / express.urlencoded()
   * because Stripe signature verification requires the exact raw body bytes.
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
  mountApi(app, "/items", itemRoutes);
  mountApi(app, "/inventory-bulk", inventoryBulkRoutes);
  mountApi(app, "/inquiries", inquiryRoutes);
  mountApi(app, "/admin", adminRoutes);
  mountApi(app, "/auctions", auctionRoutes);
  mountApi(app, "/bids", bidsRoutes);
  mountApi(app, "/watchlist", watchlistRoutes);
  mountApi(app, "/saved-searches", savedSearchesRoutes);
  mountApi(app, "/offers", offersRoutes);
  mountApi(app, "/stripe", stripeRoutes);

  /**
   * sellerPlansRoutes already contains absolute route fragments like:
   * - /seller-plans
   * - /shops/:id/entitlements
   * - /shops/:id/subscription
   *
   * Mount at /api only so the final URLs remain:
   * - /api/seller-plans
   * - /api/shops/:id/entitlements
   * - /api/shops/:id/subscription
   */
  app.use("/api", sellerPlansRoutes);

  app.use((req, res) => {
    return res.status(404).json({
      success: false,
      error: `Cannot ${req.method} ${req.originalUrl}`,
    });
  });

  app.use((err, _req, res, next) => {
    if (res.headersSent) return next(err);

    const message = err?.message || "Internal Server Error";
    const statusCode = err?.statusCode || err?.status || 500;

    if (message.startsWith("CORS blocked:")) {
      return res.status(403).json({
        success: false,
        error: message,
      });
    }

    if (err instanceof SyntaxError && "body" in err) {
      return res.status(400).json({
        success: false,
        error: "Invalid JSON payload",
      });
    }

    if (err?.type === "entity.too.large") {
      return res.status(413).json({
        success: false,
        error: "Request payload too large",
      });
    }

    console.error("[app:error]", {
      name: err?.name,
      message,
      stack: err?.stack,
      statusCode,
    });

    return res.status(statusCode).json({
      success: false,
      error: process.env.NODE_ENV === "production" ? "Internal Server Error" : message,
    });
  });

  return app;
}

export default createApp;