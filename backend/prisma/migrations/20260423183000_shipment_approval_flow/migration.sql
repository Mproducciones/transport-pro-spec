CREATE TYPE "PaymentTerm" AS ENUM ('upfront_full', 'upfront_partial', 'delivery');

ALTER TABLE "Shipment"
  ADD COLUMN "paymentTerm" "PaymentTerm" NOT NULL DEFAULT 'delivery',
  ADD COLUMN "upfrontPercent" DECIMAL(5,2),
  ADD COLUMN "upfrontAmount" DECIMAL(14,2),
  ADD COLUMN "approvedById" TEXT,
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "decisionNote" TEXT;

ALTER TABLE "Shipment"
  ADD CONSTRAINT "Shipment_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

