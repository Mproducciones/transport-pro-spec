-- CreateEnum
CREATE TYPE "ShipmentRejectionPhase" AS ENUM ('solicitud', 'pre_entrega', 'en_entrega');

-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN "rejectionPhase" "ShipmentRejectionPhase";

-- Histórico: sin fase previa se trata como rechazo de solicitud (no aparece en alertas de destino).
UPDATE "Shipment" SET "rejectionPhase" = 'solicitud' WHERE "status" = 'rechazado' AND "rejectionPhase" IS NULL;
