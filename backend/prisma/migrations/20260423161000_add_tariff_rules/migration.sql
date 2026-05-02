CREATE TABLE "TariffRule" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "customerId" TEXT,
  "origin" TEXT NOT NULL,
  "destination" TEXT NOT NULL,
  "cargoType" "CargoType",
  "baseAmount" DECIMAL(14,2) NOT NULL,
  "helperSurcharge" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TariffRule_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "TariffRule"
  ADD CONSTRAINT "TariffRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TariffRule"
  ADD CONSTRAINT "TariffRule_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "TariffRule_tenantId_customerId_origin_destination_cargoType_active_idx"
ON "TariffRule"("tenantId", "customerId", "origin", "destination", "cargoType", "active");

