import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma.js";
import { geocodeAddress } from "../src/lib/geocode.js";

const SLEEP_MS = 1100; // Nominatim: 1 req/s

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const rows = await prisma.shipment.findMany({
    where: {
      OR: [
        { originLat: null },
        { originLng: null },
        { destinationLat: null },
        { destinationLng: null },
      ],
    },
    select: {
      id: true,
      origin: true,
      destination: true,
      originLat: true,
      originLng: true,
      destinationLat: true,
      destinationLng: true,
    },
  });
  console.log(`Envíos a geocodificar: ${rows.length}`);

  let ok = 0;
  let fail = 0;
  for (const r of rows) {
    const updates: Prisma.ShipmentUpdateInput = {};
    if (r.originLat === null || r.originLng === null) {
      const g = await geocodeAddress(r.origin);
      if (g) {
        updates.originLat = new Prisma.Decimal(g.lat);
        updates.originLng = new Prisma.Decimal(g.lng);
      }
      await sleep(SLEEP_MS);
    }
    if (r.destinationLat === null || r.destinationLng === null) {
      const g = await geocodeAddress(r.destination);
      if (g) {
        updates.destinationLat = new Prisma.Decimal(g.lat);
        updates.destinationLng = new Prisma.Decimal(g.lng);
      }
      await sleep(SLEEP_MS);
    }
    if (Object.keys(updates).length > 0) {
      await prisma.shipment.update({ where: { id: r.id }, data: updates });
      console.log(`  OK  ${r.id}  ${r.origin} -> ${r.destination}`);
      ok += 1;
    } else {
      console.log(`  --  ${r.id}  sin resultados de geocoding`);
      fail += 1;
    }
  }

  console.log(`Listo. OK=${ok} sinResultado=${fail}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
