// File: apps/api/backend/src/server.js

import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { createServer } from "http";

import { createApp } from "./app.js";
import { initSocket } from "./realtime/socket.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, "..");

function loadEnvFiles() {
  const appEnv = (process.env.APP_ENV || process.env.NODE_ENV || "development").trim();

  const candidates = Array.from(
    new Set(
      [
        process.env.DOTENV_CONFIG_PATH,
        path.resolve(backendRoot, `.env.${appEnv}`),
        path.resolve(backendRoot, ".env"),
      ].filter(Boolean)
    )
  );

  for (const file of candidates) {
    if (fs.existsSync(file)) {
      dotenv.config({ path: file, override: false });
    }
  }
}

function resolvePort(...candidates) {
  for (const candidate of candidates) {
    if (candidate == null || candidate === "") continue;

    const parsed = Number(candidate);

    if (Number.isInteger(parsed) && parsed >= 0 && parsed < 65536) {
      return parsed;
    }

    console.warn(`[config] Ignoring invalid port value: ${candidate}`);
  }

  return 6002;
}

loadEnvFiles();

const PORT = resolvePort(process.env.PORT, process.env.PAWN_PORT, 6002);
const HOST = process.env.HOST || "0.0.0.0";

const app = createApp();
const server = createServer(app);

server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

try {
  initSocket(server);
} catch (err) {
  console.error("[socket] Failed to initialize socket server:", err);
}

server.listen(PORT, HOST, () => {
  console.log(`✅ API running: http://localhost:${PORT}`);
});

function shutdown(signal) {
  console.log(`[server] Received ${signal}. Shutting down gracefully...`);

  server.close((err) => {
    if (err) {
      console.error("[server] Error during shutdown:", err);
      process.exit(1);
    }

    console.log("[server] Shutdown complete.");
    process.exit(0);
  });

  setTimeout(() => {
    console.error("[server] Forced shutdown after timeout.");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

process.on("unhandledRejection", (reason) => {
  console.error("[process] Unhandled rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("[process] Uncaught exception:", err);
  shutdown("uncaughtException");
});