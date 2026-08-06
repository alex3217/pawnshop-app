import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

const DEFAULT_MAX_ATTEMPTS = 3;
const RETRYABLE_DATABASE_CODES = new Set(["40001", "40P01"]);

function databaseCode(error) {
  return String(
    error?.meta?.code
    || error?.meta?.database_error_code
    || error?.cause?.code
    || "",
  ).trim();
}

export function isRetryableBuyerTransactionError(error) {
  return error?.code === "P2034" || RETRYABLE_DATABASE_CODES.has(databaseCode(error));
}

export async function acquireBuyerTransactionLock(transaction, lockKey) {
  await transaction.$queryRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${String(lockKey)}, 0))
  `;
}

export async function runBuyerAtomicTransaction({
  lockKey,
  operation,
  prismaClient = prisma,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
}) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await prismaClient.$transaction(async (transaction) => {
        await acquireBuyerTransactionLock(transaction, lockKey);
        return operation(transaction);
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5_000,
        timeout: 10_000,
      });
    } catch (error) {
      lastError = error;
      if (!isRetryableBuyerTransactionError(error) || attempt === maxAttempts) throw error;
    }
  }
  throw lastError;
}
