-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('delivery_photo', 'delivery_signature');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('borrador', 'cerrado');

-- AlterTable
ALTER TABLE "Company" ADD COLUMN "driverCommissionPercent" DECIMAL(5,2) NOT NULL DEFAULT 40;

-- CreateTable
CREATE TABLE "ShipmentAttachment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "kind" "AttachmentKind" NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipmentAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "shipmentId" TEXT,
    "authorRole" "Role" NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverSettlement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "entregasCount" INTEGER NOT NULL,
    "baseAmount" DECIMAL(14,2) NOT NULL,
    "commissionPercent" DECIMAL(5,2) NOT NULL,
    "grossAmount" DECIMAL(14,2) NOT NULL,
    "bonusAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "deductionAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "status" "SettlementStatus" NOT NULL DEFAULT 'borrador',
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriverSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShipmentAttachment_tenantId_shipmentId_idx" ON "ShipmentAttachment"("tenantId", "shipmentId");

-- CreateIndex
CREATE INDEX "SupportMessage_tenantId_driverId_createdAt_idx" ON "SupportMessage"("tenantId", "driverId", "createdAt");

-- CreateIndex
CREATE INDEX "DriverSettlement_tenantId_driverId_createdAt_idx" ON "DriverSettlement"("tenantId", "driverId", "createdAt");

-- AddForeignKey
ALTER TABLE "ShipmentAttachment" ADD CONSTRAINT "ShipmentAttachment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentAttachment" ADD CONSTRAINT "ShipmentAttachment_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentAttachment" ADD CONSTRAINT "ShipmentAttachment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverSettlement" ADD CONSTRAINT "DriverSettlement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverSettlement" ADD CONSTRAINT "DriverSettlement_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverSettlement" ADD CONSTRAINT "DriverSettlement_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
