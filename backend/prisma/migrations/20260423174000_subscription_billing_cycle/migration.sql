CREATE TYPE "BillingCycle" AS ENUM ('monthly', 'annual');

ALTER TABLE "Subscription"
  ADD COLUMN "billingCycle" "BillingCycle" NOT NULL DEFAULT 'monthly',
  ADD COLUMN "billingAmount" DECIMAL(14,2) NOT NULL DEFAULT 49,
  ADD COLUMN "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

