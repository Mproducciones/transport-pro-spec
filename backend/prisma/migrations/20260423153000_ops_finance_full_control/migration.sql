CREATE TYPE "CargoType" AS ENUM ('pallet', 'contenedor', 'granel', 'caja', 'otro');

ALTER TABLE "Shipment"
  ADD COLUMN "cargoType" "CargoType",
  ADD COLUMN "cargoQuantity" DECIMAL(12,2),
  ADD COLUMN "cargoWeightKg" DECIMAL(12,2),
  ADD COLUMN "cargoVolumeM3" DECIMAL(12,2),
  ADD COLUMN "baseAmount" DECIMAL(12,2),
  ADD COLUMN "requiresHelper" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "helperSurcharge" DECIMAL(12,2),
  ADD COLUMN "totalAmount" DECIMAL(12,2),
  ADD COLUMN "deliveryEvidence" TEXT,
  ADD COLUMN "deliveredLat" DECIMAL(10,7),
  ADD COLUMN "deliveredLng" DECIMAL(10,7);

UPDATE "Shipment"
SET "baseAmount" = "amount",
    "totalAmount" = "amount",
    "helperSurcharge" = 0
WHERE "amount" IS NOT NULL;

CREATE TABLE "Expense" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "shipmentId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "note" TEXT,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "recordedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Expense"
  ADD CONSTRAINT "Expense_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Expense"
  ADD CONSTRAINT "Expense_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Expense"
  ADD CONSTRAINT "Expense_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Expense_tenantId_recordedAt_idx" ON "Expense"("tenantId", "recordedAt");
CREATE INDEX "Expense_shipmentId_idx" ON "Expense"("shipmentId");

