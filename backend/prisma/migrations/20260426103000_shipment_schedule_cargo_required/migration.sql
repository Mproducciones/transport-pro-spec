-- Backfill nullable operational fields before enforcing NOT NULL.
UPDATE "Shipment" SET "scheduledPickup" = "createdAt" WHERE "scheduledPickup" IS NULL;
UPDATE "Shipment" SET "scheduledDelivery" = "scheduledPickup" + interval '5 hours' WHERE "scheduledDelivery" IS NULL;
UPDATE "Shipment" SET "cargoType" = 'caja' WHERE "cargoType" IS NULL;

ALTER TABLE "Shipment" ALTER COLUMN "scheduledPickup" SET NOT NULL;
ALTER TABLE "Shipment" ALTER COLUMN "scheduledDelivery" SET NOT NULL;
ALTER TABLE "Shipment" ALTER COLUMN "cargoType" SET NOT NULL;
