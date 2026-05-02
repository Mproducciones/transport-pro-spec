-- DropIndex
DROP INDEX "Alert_tenantId_createdAt_idx";

-- DropIndex
DROP INDEX "Expense_shipmentId_idx";

-- DropIndex
DROP INDEX "Expense_tenantId_recordedAt_idx";

-- DropIndex
DROP INDEX "Payment_tenantId_verificationStatus_idx";

-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN     "destinationLat" DECIMAL(10,7),
ADD COLUMN     "destinationLng" DECIMAL(10,7),
ADD COLUMN     "lastLat" DECIMAL(10,7),
ADD COLUMN     "lastLng" DECIMAL(10,7),
ADD COLUMN     "lastReportedAt" TIMESTAMP(3),
ADD COLUMN     "originLat" DECIMAL(10,7),
ADD COLUMN     "originLng" DECIMAL(10,7);

-- AlterTable
ALTER TABLE "Subscription" ALTER COLUMN "plan" SET DEFAULT 'pro';

-- RenameIndex
ALTER INDEX "TariffRule_tenantId_customerId_origin_destination_cargoType_act" RENAME TO "TariffRule_tenantId_customerId_origin_destination_cargoType_idx";
