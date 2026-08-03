// File: apps/api/backend/src/server.js

import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { createServer } from "http";

import {
  assertSafeDatabaseTargetForRuntime,
} from "./config/databaseRuntimeGuard.js";

import {
  selectRuntimeEnvFile,
} from "./config/runtimeEnvSelection.js";

const __filename = fileURLToPath(
  import.meta.url,
);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(
  __dirname,
  "..",
);

let schedulerStarted = false;
let isShuttingDown = false;

function loadEnvFiles() {
  const appEnv = String(
    process.env.APP_ENV ?? "",
  ).trim();

  const selectedFile =
    selectRuntimeEnvFile({
      backendRoot,
      appEnv,
      explicitPath:
        process.env.DOTENV_CONFIG_PATH,
      exists: fs.existsSync,
      realpath: fs.realpathSync,
    });

  if (!selectedFile) {
    return;
  }

  const override =
    String(
      process.env.PAWN_ENV_OVERRIDE ||
        "",
    ).trim() === "1";

  dotenv.config({
    path: selectedFile,
    override,
  });
}

function resolvePort(...candidates) {
  for (const candidate of candidates) {
    if (
      candidate == null ||
      candidate === ""
    ) {
      continue;
    }

    const parsed = Number(candidate);

    if (
      Number.isInteger(parsed) &&
      parsed >= 0 &&
      parsed < 65536
    ) {
      return parsed;
    }

    console.warn(
      `[config] Ignoring invalid port value: ${candidate}`,
    );
  }

  return 6001;
}

loadEnvFiles();
assertSafeDatabaseTargetForRuntime(
  process.env,
);

const [
  appModule,
  socketModule,
  auctionSchedulerModule,
  reservationSchedulerModule,
] = await Promise.all([
  import("./app.js"),
  import("./realtime/socket.js"),
  import(
    "./services/auctionScheduler.service.js"
  ),
  import(
    "./services/marketplaceTransactionReservationScheduler.service.js"
  ),
]);

const { createApp } = appModule;
const { initSocket } = socketModule;

const {
  startAuctionScheduler,
  stopAuctionScheduler,
} = auctionSchedulerModule;

const {
  startMarketplaceReservationScheduler,
  stopMarketplaceReservationScheduler,
} = reservationSchedulerModule;

const PORT = resolvePort(
  process.env.PORT,
  process.env.PAWN_PORT,
  6001,
);

const HOST =
  process.env.HOST ||
  "0.0.0.0";

function isProductionRuntime() {
  return (
    process.env.NODE_ENV === "production"
  );
}

function shouldStartAuctionScheduler() {
  if (!isProductionRuntime()) {
    console.log(
      "[scheduler] Auction scheduler skipped outside production.",
    );

    return false;
  }

  if (
    process.env.AUCTION_SCHEDULER_ENABLED ===
    "false"
  ) {
    console.log(
      "[scheduler] Auction scheduler disabled by env.",
    );

    return false;
  }

  return true;
}

function shouldStartMarketplaceReservationScheduler() {
  if (!isProductionRuntime()) {
    console.log(
      "[scheduler] Marketplace reservation scheduler skipped outside production.",
    );

    return false;
  }

  if (
    process.env
      .MARKETPLACE_RESERVATION_SCHEDULER_ENABLED ===
    "false"
  ) {
    console.log(
      "[scheduler] Marketplace reservation scheduler disabled by env.",
    );

    return false;
  }

  return true;
}

function startSchedulersOnce() {
  if (schedulerStarted) {
    return;
  }

  schedulerStarted = true;

  if (shouldStartAuctionScheduler()) {
    startAuctionScheduler();
  }

  if (
    shouldStartMarketplaceReservationScheduler()
  ) {
    startMarketplaceReservationScheduler();
  }
}

const app = createApp();
const server = createServer(app);

server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

try {
  initSocket(server);
} catch (error) {
  console.error(
    "[socket] Failed to initialize socket server:",
    error,
  );
}

server.listen(PORT, HOST, () => {
  console.log(
    `✅ API running: http://localhost:${PORT}`,
  );

  startSchedulersOnce();
});

function shutdown(signal) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  console.log(
    `[server] Received ${signal}. Shutting down gracefully...`,
  );

  try {
    stopAuctionScheduler();
  } catch (error) {
    console.error(
      "[scheduler] Failed to stop auction scheduler:",
      error,
    );
  }

  try {
    stopMarketplaceReservationScheduler();
  } catch (error) {
    console.error(
      "[scheduler] Failed to stop marketplace reservation scheduler:",
      error,
    );
  }

  server.close((error) => {
    if (error) {
      console.error(
        "[server] Error during shutdown:",
        error,
      );

      process.exit(1);
    }

    console.log(
      "[server] Shutdown complete.",
    );

    process.exit(0);
  });

  setTimeout(() => {
    console.error(
      "[server] Forced shutdown after timeout.",
    );

    process.exit(1);
  }, 10_000).unref();
}

process.on(
  "SIGINT",
  () => shutdown("SIGINT"),
);

process.on(
  "SIGTERM",
  () => shutdown("SIGTERM"),
);

process.on(
  "unhandledRejection",
  (reason) => {
    console.error(
      "[process] Unhandled rejection",
      reason,
    );
  },
);

process.on(
  "uncaughtException",
  (error) => {
    console.error(
      "[process] Uncaught exception",
      error,
    );

    shutdown(
      "uncaughtException",
    );
  },
);
