import { prisma } from "../lib/prisma.js";

import {
  expireMarketplaceTransactionReservation,
} from "./marketplaceTransactionReservationRelease.service.js";

const EXPIRABLE_STATUSES = [
  "PENDING",
  "PAYMENT_PROCESSING",
];

const SKIPPABLE_ERROR_CODES =
  new Set([
    "MARKETPLACE_RESERVATION_NOT_EXPIRED",
    "MARKETPLACE_TRANSACTION_ALREADY_FINALIZED",
    "MARKETPLACE_TRANSACTION_NOT_RELEASABLE",
    "MARKETPLACE_TRANSACTION_NOT_FOUND",
  ]);

let schedulerRunning = false;
let schedulerTimer = null;
let schedulerTickInProgress = false;

function toPositiveInt(
  value,
  fallback,
) {
  const parsed =
    Number.parseInt(
      String(value ?? ""),
      10,
    );

  return (
    Number.isInteger(parsed) &&
    parsed > 0
      ? parsed
      : fallback
  );
}

function normalizeDate(
  value = new Date(),
) {
  const date =
    value instanceof Date
      ? value
      : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error(
      "Marketplace reservation scheduler date is invalid",
    );
  }

  return date;
}

function logMessage(
  logger,
  level,
  ...values
) {
  const method =
    logger?.[level];

  if (typeof method === "function") {
    method.call(logger, ...values);
  }
}

export function getMarketplaceReservationSchedulerConfig() {
  return {
    intervalMs:
      toPositiveInt(
        process.env
          .MARKETPLACE_RESERVATION_SCHEDULER_INTERVAL_MS,
        60_000,
      ),

    batchSize:
      Math.min(
        100,
        toPositiveInt(
          process.env
            .MARKETPLACE_RESERVATION_SCHEDULER_BATCH_SIZE,
          50,
        ),
      ),

    reservationTtlMinutes:
      toPositiveInt(
        process.env
          .MARKETPLACE_RESERVATION_TTL_MINUTES,
        30,
      ),
  };
}

export async function runMarketplaceReservationSchedulerTick({
  now = new Date(),
  prismaClient = prisma,
  stripeClient = undefined,
  logger = console,
} = {}) {
  if (schedulerTickInProgress) {
    logMessage(
      logger,
      "log",
      "[marketplace-reservation-scheduler] Previous tick is still running; skipping.",
    );

    return {
      skipped: true,
      reason:
        "TICK_ALREADY_RUNNING",
      scanned: 0,
      released: 0,
      unchanged: 0,
      failed: 0,
    };
  }

  schedulerTickInProgress = true;

  try {
    const currentTime =
      normalizeDate(now);

    const config =
      getMarketplaceReservationSchedulerConfig();

    const cutoff =
      new Date(
        currentTime.getTime() -
        config.reservationTtlMinutes *
          60_000,
      );

    const candidates =
      await prismaClient
        .marketplaceTransaction
        .findMany({
          where: {
            status: {
              in:
                EXPIRABLE_STATUSES,
            },

            updatedAt: {
              lte: cutoff,
            },
          },

          orderBy: [
            {
              updatedAt: "asc",
            },
            {
              id: "asc",
            },
          ],

          take:
            config.batchSize,

          select: {
            id: true,
          },
        });

    const summary = {
      skipped: false,
      reason: null,
      cutoff:
        cutoff.toISOString(),
      scanned:
        candidates.length,
      released: 0,
      unchanged: 0,
      failed: 0,
    };

    for (
      const candidate
      of candidates
    ) {
      try {
        const result =
          await expireMarketplaceTransactionReservation({
            transactionId:
              candidate.id,

            expiredBefore:
              cutoff,

            reason:
              "RESERVATION_EXPIRED",

            stripeClient,
            prismaClient,

            releasedAt:
              currentTime,
          });

        if (
          result?.idempotent ||
          result?.quantityRestored === 0
        ) {
          summary.unchanged += 1;
        } else {
          summary.released += 1;
        }

        logMessage(
          logger,
          "log",
          `[marketplace-reservation-scheduler] Transaction ${candidate.id} processed: ${result?.transactionStatus || "UNKNOWN"}`,
        );
      } catch (error) {
        if (
          SKIPPABLE_ERROR_CODES.has(
            error?.code,
          )
        ) {
          summary.unchanged += 1;

          logMessage(
            logger,
            "log",
            `[marketplace-reservation-scheduler] Transaction ${candidate.id} skipped: ${error.code}`,
          );

          continue;
        }

        summary.failed += 1;

        logMessage(
          logger,
          "error",
          "[marketplace-reservation-scheduler] Transaction expiration failed",
          {
            transactionId:
              candidate.id,
            code:
              error?.code || null,
            message:
              error?.message ||
              String(error),
          },
        );
      }
    }

    return summary;
  } finally {
    schedulerTickInProgress = false;
  }
}

export function startMarketplaceReservationScheduler({
  prismaClient = prisma,
  stripeClient = undefined,
  logger = console,
} = {}) {
  if (schedulerRunning) {
    logMessage(
      logger,
      "log",
      "[marketplace-reservation-scheduler] Already running; skipping duplicate start.",
    );

    return schedulerTimer;
  }

  if (
    process.env
      .MARKETPLACE_RESERVATION_SCHEDULER_ENABLED ===
    "false"
  ) {
    logMessage(
      logger,
      "log",
      "[marketplace-reservation-scheduler] Disabled by environment.",
    );

    return null;
  }

  schedulerRunning = true;

  const {
    intervalMs,
    reservationTtlMinutes,
  } =
    getMarketplaceReservationSchedulerConfig();

  logMessage(
    logger,
    "log",
    `[marketplace-reservation-scheduler] Started (${intervalMs}ms interval, ${reservationTtlMinutes} minute TTL).`,
  );

  void runMarketplaceReservationSchedulerTick({
    prismaClient,
    stripeClient,
    logger,
  });

  schedulerTimer =
    setInterval(() => {
      void runMarketplaceReservationSchedulerTick({
        prismaClient,
        stripeClient,
        logger,
      });
    }, intervalMs);

  schedulerTimer.unref?.();

  return schedulerTimer;
}

export function stopMarketplaceReservationScheduler({
  logger = console,
} = {}) {
  if (schedulerTimer) {
    clearInterval(
      schedulerTimer,
    );

    schedulerTimer = null;
  }

  schedulerRunning = false;
  schedulerTickInProgress = false;

  logMessage(
    logger,
    "log",
    "[marketplace-reservation-scheduler] Stopped.",
  );
}
