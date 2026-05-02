CREATE TYPE "PaymentVerificationStatus" AS ENUM ('pendiente', 'aprobado', 'rechazado');

ALTER TABLE "Payment"
  ADD COLUMN "verificationStatus" "PaymentVerificationStatus" NOT NULL DEFAULT 'aprobado',
  ADD COLUMN "verificationNote" TEXT,
  ADD COLUMN "verifiedById" TEXT,
  ADD COLUMN "verifiedAt" TIMESTAMP(3);

ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Payment_tenantId_verificationStatus_idx" ON "Payment"("tenantId", "verificationStatus");

