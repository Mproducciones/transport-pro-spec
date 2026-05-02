CREATE TYPE "CompanyAccountStatus" AS ENUM ('activa', 'suspendida');
CREATE TYPE "DriverStatus" AS ENUM ('activo', 'inactivo');
CREATE TYPE "AlertType" AS ENUM ('mantenimiento', 'retraso', 'exceso_velocidad');

ALTER TABLE "Company"
  ADD COLUMN "accountStatus" "CompanyAccountStatus" NOT NULL DEFAULT 'activa';

ALTER TABLE "Driver"
  ADD COLUMN "status" "DriverStatus" NOT NULL DEFAULT 'activo';

CREATE TABLE "Alert" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "shipmentId" TEXT,
  "type" "AlertType" NOT NULL,
  "message" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Alert"
  ADD CONSTRAINT "Alert_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Alert"
  ADD CONSTRAINT "Alert_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Alert_tenantId_createdAt_idx" ON "Alert"("tenantId", "createdAt");
