-- CreateEnum
CREATE TYPE "FulfillmentStatus" AS ENUM ('PAYMENT_PENDING', 'READY_FOR_PICKUP', 'PICKED_UP', 'SHIPPED', 'COMPLETED', 'CANCELED');

-- AlterTable
ALTER TABLE "Settlement" ADD COLUMN     "fulfilledAt" TIMESTAMP(3),
ADD COLUMN     "fulfillmentNote" TEXT,
ADD COLUMN     "fulfillmentStatus" "FulfillmentStatus" NOT NULL DEFAULT 'PAYMENT_PENDING';
