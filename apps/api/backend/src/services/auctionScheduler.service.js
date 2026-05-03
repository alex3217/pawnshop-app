import { prisma } from "../lib/prisma.js";
import { getEffectiveAuctionStatus } from "../lib/auctionStatus.js";

let schedulerRunning = false;
let schedulerTimer = null;
let schedulerTickInProgress = false;

function toInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getIntervalMs() {
  return toInt(process.env.AUCTION_SCHEDULER_INTERVAL_MS, 5000);
}

function getBatchSize() {
  return Math.min(100, toInt(process.env.AUCTION_SCHEDULER_BATCH_SIZE, 50));
}

function getAuctionEndDate(auction) {
  return auction?.extendedEndsAt || auction?.endsAt || null;
}

function getErrorMessage(err) {
  return err instanceof Error ? err.message : String(err);
}

async function finalizeAuction(auction, now) {
  const effectiveStatus = getEffectiveAuctionStatus(auction, now);

  if (effectiveStatus !== "ENDED") {
    return { finalized: false, reason: "NOT_ENDED" };
  }

  const topBid = auction.bids?.[0] || null;

  await prisma.$transaction(async (tx) => {
    await tx.auction.updateMany({
      where: {
        id: auction.id,
        status: { notIn: ["ENDED", "CANCELED"] },
      },
      data: { status: "ENDED" },
    });

    if (!topBid?.userId) return;

    const finalPrice = Number(topBid.amount);
    if (!Number.isFinite(finalPrice) || finalPrice <= 0) return;

    await tx.settlement.upsert({
      where: { auctionId: auction.id },
      update: {
        winnerUserId: topBid.userId,
        finalPrice,
        currency: "USD",
        status: "CHARGED",
      },
      create: {
        auctionId: auction.id,
        winnerUserId: topBid.userId,
        finalPrice,
        currency: "USD",
        status: "CHARGED",
      },
    });
  });

  return {
    finalized: true,
    reason: topBid?.userId ? "SETTLEMENT_CREATED_OR_UPDATED" : "NO_BIDS",
  };
}

async function runAuctionSchedulerTick() {
  if (schedulerTickInProgress) {
    console.log("[scheduler] Previous auction tick still running, skipping.");
    return;
  }

  schedulerTickInProgress = true;

  try {
    const now = new Date();
    const batchSize = getBatchSize();

    const auctions = await prisma.auction.findMany({
      where: {
        status: { notIn: ["ENDED", "CANCELED"] },
      },
      orderBy: [{ endsAt: "asc" }, { id: "asc" }],
      take: batchSize,
      include: {
        bids: {
          orderBy: [{ amount: "desc" }, { createdAt: "asc" }],
          take: 1,
        },
      },
    });

    for (const auction of auctions) {
      const endDate = getAuctionEndDate(auction);
      if (!endDate) continue;

      const result = await finalizeAuction(auction, now);

      if (result.finalized) {
        console.log(
          `[scheduler] Auction ${auction.id} finalized: ${result.reason}`,
        );
      }
    }
  } catch (err) {
    console.error("[scheduler] Error:", getErrorMessage(err));
  } finally {
    schedulerTickInProgress = false;
  }
}

export function startAuctionScheduler() {
  if (schedulerRunning) {
    console.log("[scheduler] Already running, skipping duplicate start.");
    return schedulerTimer;
  }

  if (process.env.AUCTION_SCHEDULER_ENABLED === "false") {
    console.log("[scheduler] Auction scheduler disabled by env.");
    return null;
  }

  schedulerRunning = true;

  const intervalMs = getIntervalMs();

  console.log(`[scheduler] Auction scheduler started (${intervalMs}ms).`);

  void runAuctionSchedulerTick();

  schedulerTimer = setInterval(() => {
    void runAuctionSchedulerTick();
  }, intervalMs);

  schedulerTimer.unref?.();

  return schedulerTimer;
}

export function stopAuctionScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }

  schedulerRunning = false;
  schedulerTickInProgress = false;

  console.log("[scheduler] Auction scheduler stopped.");
}
