-- Add driver taxId
ALTER TABLE "Driver" ADD COLUMN "taxId" TEXT;

-- Unique taxId per tenant for customers and drivers.
-- PostgreSQL allows multiple NULL values on unique indexes.
CREATE UNIQUE INDEX "Customer_tenantId_taxId_key" ON "Customer"("tenantId", "taxId");
CREATE UNIQUE INDEX "Driver_tenantId_taxId_key" ON "Driver"("tenantId", "taxId");

