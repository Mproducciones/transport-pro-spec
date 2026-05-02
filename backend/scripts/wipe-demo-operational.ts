/**
 * Borra datos operativos (envíos, facturas, pagos, egresos, alertas, mensajes soporte,
 * liquidaciones chofer, adjuntos) en los tenants demo indicados.
 * NO borra: empresas, usuarios, clientes, choferes, vehículos, suscripciones, tarifas.
 *
 * Slugs por defecto: demo, andescargo, patagoniaruta
 * Personalizar: DEMO_WIPE_SLUGS="demo,mi-empresa" npx tsx scripts/wipe-demo-operational.ts
 *
 * Después podés regenerar escenarios: npm run seed:test-agents | npm run db:seed | npm run seed:demo-ui
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function parseSlugs(): string[] {
  const raw = process.env.DEMO_WIPE_SLUGS?.trim();
  if (raw) {
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return ["demo", "andescargo", "patagoniaruta"];
}

async function main() {
  const slugs = parseSlugs();
  const tenants = await prisma.tenant.findMany({
    where: { slug: { in: slugs } },
    select: { id: true, slug: true, name: true },
  });

  if (tenants.length === 0) {
    console.log(
      JSON.stringify({
        ok: false,
        message: "No se encontraron tenants con los slugs indicados.",
        slugs,
      })
    );
    process.exitCode = 1;
    return;
  }

  const tenantIds = tenants.map((t) => t.id);
  const missing = slugs.filter((s) => !tenants.some((t) => t.slug === s));

  const stats = await prisma.$transaction(async (tx) => {
    const pay = await tx.payment.deleteMany({ where: { tenantId: { in: tenantIds } } });
    const inv = await tx.invoice.deleteMany({ where: { tenantId: { in: tenantIds } } });
    const sup = await tx.supportMessage.deleteMany({ where: { tenantId: { in: tenantIds } } });
    const setSettle = await tx.driverSettlement.deleteMany({ where: { tenantId: { in: tenantIds } } });
    const alerts = await tx.alert.deleteMany({ where: { tenantId: { in: tenantIds } } });
    const ship = await tx.shipment.deleteMany({ where: { tenantId: { in: tenantIds } } });

    return {
      payments: pay.count,
      invoices: inv.count,
      supportMessages: sup.count,
      driverSettlements: setSettle.count,
      alerts: alerts.count,
      shipments: ship.count,
    };
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        tenants: tenants.map((t) => ({ slug: t.slug, name: t.name })),
        slugsSinMatch: missing.length ? missing : undefined,
        deleted: stats,
        kept: "users, customers, drivers, vehicles, companies, subscriptions, tariff rules",
      },
      null,
      2
    )
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
