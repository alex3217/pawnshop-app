-- AlterTable
ALTER TABLE "ItemIntake" ADD COLUMN     "customerId" TEXT;

-- CreateIndex
CREATE INDEX "ItemIntake_customerId_createdAt_idx" ON "ItemIntake"("customerId", "createdAt");

-- AddForeignKey
ALTER TABLE "ItemIntake" ADD CONSTRAINT "ItemIntake_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
