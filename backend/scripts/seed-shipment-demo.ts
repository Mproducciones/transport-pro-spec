import {
  PaymentTerm,
  Prisma,
  PrismaClient,
  Role,
  ShipmentStatus,
} from "@prisma/client";

const prisma = new PrismaClient();

/** Solo estas empresas reciben el lote demo (evita tocar otros tenants del servidor). */
const PREFERRED_SLUGS = ["andescargo", "patagoniaruta"];

const ROUTES: Array<{
  origin: string;
  destination: string;
  oLat: number;
  oLng: number;
  dLat: number;
  dLng: number;
}> = [
  {
    origin: "Santiago Centro",
    destination: "Valparaiso Puerto",
    oLat: -33.4489,
    oLng: -70.6693,
    dLat: -33.0458,
    dLng: -71.6197,
  },
  {
    origin: "Rancagua Centro",
    destination: "Concepcion Terminal",
    oLat: -34.1708,
    oLng: -70.7444,
    dLat: -36.8201,
    dLng: -73.0444,
  },
  {
    origin: "La Serena Centro",
    destination: "Santiago Centro",
    oLat: -29.9027,
    oLng: -71.2519,
    dLat: -33.4489,
    dLng: -70.6693,
  },
  {
    origin: "Temuco Centro",
    destination: "Puerto Montt",
    oLat: -38.7359,
    oLng: -72.5904,
    dLat: -41.4693,
    dLng: -72.9424,
  },
];

function addHours(d: Date, h: number) {
  return new Date(d.getTime() + h * 3600000);
}

function approvalNote(
  total: number,
  term: PaymentTerm,
  upfrontPercent?: number
): string {
  const t = total.toLocaleString("es-CL");
  if (term === PaymentTerm.upfront_full) {
    return `Solicitud aprobada. Monto acordado: ${t}. Debes pagar el 100% ahora y subir comprobante para validación.`;
  }
  if (term === PaymentTerm.upfront_partial) {
    const pct = Math.round(upfrontPercent ?? 50);
    const up = Math.round((total * pct) / 100).toLocaleString("es-CL");
    return `Solicitud aprobada. Monto total: ${t}. Debes pagar ${pct}% ahora (${up}) y el saldo contra entrega.`;
  }
  return `Solicitud aprobada. Monto acordado: ${t}. Modalidad pactada: pago contra entrega.`;
}

async function wipeAllShipments() {
  const ids = (await prisma.shipment.findMany({ select: { id: true } })).map((s) => s.id);
  if (ids.length === 0) return { removed: 0 };

  await prisma.$transaction(async (tx) => {
    await tx.invoiceLine.updateMany({
      where: { shipmentId: { in: ids } },
      data: { shipmentId: null },
    });
    await tx.payment.deleteMany({ where: { shipmentId: { in: ids } } });
    await tx.expense.deleteMany({ where: { shipmentId: { in: ids } } });
    await tx.alert.deleteMany({ where: { shipmentId: { in: ids } } });
    await tx.shipment.deleteMany({ where: { id: { in: ids } } });
  });

  return { removed: ids.length };
}

async function seedTenant(tenantId: string, adminId: string) {
  const customers = await prisma.customer.findMany({
    where: { tenantId },
    orderBy: { createdAt: "asc" },
    take: 8,
  });
  if (customers.length === 0) return { created: 0 };

  const drivers = await prisma.driver.findMany({
    where: { tenantId },
    take: 4,
    include: { assignedVehicle: true },
  });

  const now = new Date();
  let idx = 0;
  const marker = (slug: string) => `demo-${slug}-${Date.now()}-${idx++}`;

  async function actorForCustomer(customerId: string) {
    const u = await prisma.user.findFirst({
      where: { tenantId, customerId, role: Role.cliente },
      select: { id: true },
    });
    return u?.id ?? adminId;
  }

  type Scenario =
    | { kind: "pendiente" }
    | {
        kind: "confirmado";
        total: number;
        term: PaymentTerm;
        upfrontPercent?: number;
        assignDriver?: boolean;
      }
    | { kind: "rechazado"; reason: string };

  const scenarios: Scenario[] = [
    { kind: "pendiente" },
    { kind: "pendiente" },
    { kind: "pendiente" },
    { kind: "pendiente" },
    {
      kind: "confirmado",
      total: 185_000,
      term: PaymentTerm.upfront_full,
    },
    {
      kind: "confirmado",
      total: 240_000,
      term: PaymentTerm.upfront_partial,
      upfrontPercent: 50,
    },
    {
      kind: "confirmado",
      total: 99_000,
      term: PaymentTerm.delivery,
    },
    {
      kind: "confirmado",
      total: 310_000,
      term: PaymentTerm.upfront_partial,
      upfrontPercent: 30,
      assignDriver: true,
    },
    { kind: "rechazado", reason: "Fuera de zona de cobertura acordada para esta semana." },
    { kind: "rechazado", reason: "No disponibilidad de flota para la ventana de retiro solicitada." },
    { kind: "rechazado", reason: "Carga no compatible con capacidad mínima del servicio." },
    { kind: "rechazado", reason: "Documentación incompleta: falta detalle de mercadería para cotizar." },
  ];

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { slug: true },
  });
  const slug = tenant?.slug ?? "tenant";

  let created = 0;

  for (let i = 0; i < scenarios.length; i++) {
    const sc = scenarios[i];
    const customer = customers[i % customers.length];
    const route = ROUTES[i % ROUTES.length];
    const pickup = addHours(now, 6 + i * 5);
    const delivery = addHours(pickup, 5 + (i % 4));

    if (sc.kind === "pendiente") {
      const createdById = await actorForCustomer(customer.id);
      await prisma.$transaction(async (tx) => {
        const s = await tx.shipment.create({
          data: {
            tenantId,
            customerId: customer.id,
            origin: route.origin,
            destination: route.destination,
            pickupAddress: route.origin,
            deliveryAddress: route.destination,
            originLat: new Prisma.Decimal(route.oLat),
            originLng: new Prisma.Decimal(route.oLng),
            destinationLat: new Prisma.Decimal(route.dLat),
            destinationLng: new Prisma.Decimal(route.dLng),
            cargoType: i % 2 === 0 ? "pallet" : "caja",
            cargoWeightKg: new Prisma.Decimal(180 + i * 25),
            cargoVolumeM3: new Prisma.Decimal(1.2 + i * 0.15),
            cargoDescription: marker(slug),
            amount: null,
            baseAmount: null,
            totalAmount: null,
            helperSurcharge: new Prisma.Decimal(0),
            scheduledPickup: pickup,
            scheduledDelivery: delivery,
            pickupWindowStart: addHours(pickup, -1),
            pickupWindowEnd: addHours(pickup, 1),
            deliveryWindowStart: addHours(delivery, -1),
            deliveryWindowEnd: addHours(delivery, 1),
            pickupNotes: "Cliente solicita servicio — precio por confirmar con administración.",
            deliveryNotes: "Entrega en horario hábil.",
            status: ShipmentStatus.pendiente,
            paymentStatus: "pendiente",
            paymentTerm: PaymentTerm.delivery,
            driverId: null,
            vehicleId: null,
          },
        });
        await tx.shipmentStatusHistory.create({
          data: {
            shipmentId: s.id,
            fromStatus: null,
            toStatus: ShipmentStatus.pendiente,
            note: "Solicitud creada por cliente (demo)",
            changedById: createdById,
          },
        });
      });
      created++;
      continue;
    }

    if (sc.kind === "rechazado") {
      const createdById = await actorForCustomer(customer.id);
      await prisma.$transaction(async (tx) => {
        const s = await tx.shipment.create({
          data: {
            tenantId,
            customerId: customer.id,
            origin: route.origin,
            destination: route.destination,
            pickupAddress: route.origin,
            deliveryAddress: route.destination,
            originLat: new Prisma.Decimal(route.oLat),
            originLng: new Prisma.Decimal(route.oLng),
            destinationLat: new Prisma.Decimal(route.dLat),
            destinationLng: new Prisma.Decimal(route.dLng),
            cargoType: "otro",
            cargoWeightKg: new Prisma.Decimal(220),
            cargoVolumeM3: new Prisma.Decimal(2.1),
            cargoDescription: marker(slug),
            amount: null,
            baseAmount: null,
            totalAmount: null,
            helperSurcharge: new Prisma.Decimal(0),
            scheduledPickup: pickup,
            scheduledDelivery: delivery,
            pickupWindowStart: addHours(pickup, -1),
            pickupWindowEnd: addHours(pickup, 1),
            deliveryWindowStart: addHours(delivery, -1),
            deliveryWindowEnd: addHours(delivery, 1),
            pickupNotes: "Solicitud evaluada y rechazada.",
            status: ShipmentStatus.rechazado,
            paymentStatus: "pendiente",
            paymentTerm: PaymentTerm.delivery,
            approvedById: adminId,
            approvedAt: addHours(now, -2 - i),
            decisionNote: sc.reason,
            driverId: null,
            vehicleId: null,
          },
        });
        await tx.shipmentStatusHistory.createMany({
          data: [
            {
              shipmentId: s.id,
              fromStatus: null,
              toStatus: ShipmentStatus.pendiente,
              note: "Solicitud creada por cliente (demo)",
              changedById: createdById,
            },
            {
              shipmentId: s.id,
              fromStatus: ShipmentStatus.pendiente,
              toStatus: ShipmentStatus.rechazado,
              note: sc.reason,
              changedById: adminId,
            },
          ],
        });
      });
      created++;
      continue;
    }

    const total = sc.total;
    const term = sc.term;
    const pct = term === PaymentTerm.upfront_partial ? sc.upfrontPercent ?? 50 : undefined;
    const upfrontAmt =
      term === PaymentTerm.upfront_full
        ? total
        : term === PaymentTerm.upfront_partial && pct
          ? Math.round((total * pct) / 100)
          : null;

    const driverPick = sc.assignDriver ? drivers[i % drivers.length] : null;
    const vehicleId = driverPick?.assignedVehicleId ?? null;
    const createdById = await actorForCustomer(customer.id);

    await prisma.$transaction(async (tx) => {
      const s = await tx.shipment.create({
        data: {
          tenantId,
          customerId: customer.id,
          origin: route.origin,
          destination: route.destination,
          pickupAddress: route.origin,
          deliveryAddress: route.destination,
          originLat: new Prisma.Decimal(route.oLat),
          originLng: new Prisma.Decimal(route.oLng),
          destinationLat: new Prisma.Decimal(route.dLat),
          destinationLng: new Prisma.Decimal(route.dLng),
          cargoType: "pallet",
          cargoDescription: marker(slug),
          amount: new Prisma.Decimal(total),
          baseAmount: new Prisma.Decimal(total),
          totalAmount: new Prisma.Decimal(total),
          helperSurcharge: new Prisma.Decimal(0),
          scheduledPickup: pickup,
          scheduledDelivery: delivery,
          pickupWindowStart: addHours(pickup, -1),
          pickupWindowEnd: addHours(pickup, 1),
          deliveryWindowStart: addHours(delivery, -1),
          deliveryWindowEnd: addHours(delivery, 1),
          pickupNotes: "Retiro acordado con cliente.",
          deliveryNotes: "Entrega según instrucciones del admin.",
          status: ShipmentStatus.confirmado,
          paymentStatus: "pendiente",
          paymentTerm: term,
          upfrontPercent:
            pct !== undefined ? new Prisma.Decimal(pct) : null,
          upfrontAmount:
            upfrontAmt !== null ? new Prisma.Decimal(upfrontAmt) : null,
          approvedById: adminId,
          approvedAt: addHours(now, -1 - i),
          decisionNote: approvalNote(total, term, pct),
          driverId: driverPick?.id ?? null,
          vehicleId,
        },
      });
      await tx.shipmentStatusHistory.createMany({
        data: [
          {
            shipmentId: s.id,
            fromStatus: null,
            toStatus: ShipmentStatus.pendiente,
            note: "Solicitud creada por cliente (demo)",
            changedById: createdById,
          },
          {
            shipmentId: s.id,
            fromStatus: ShipmentStatus.pendiente,
            toStatus: ShipmentStatus.confirmado,
            note: "Aprobado: monto y modalidad definidos",
            changedById: adminId,
          },
        ],
      });
    });
    created++;
  }

  return { created };
}

async function main() {
  let tenants = await prisma.tenant.findMany({
    where: { slug: { in: PREFERRED_SLUGS } },
    select: { id: true, slug: true },
    orderBy: { slug: "asc" },
  });

  if (tenants.length === 0) {
    tenants = await prisma.tenant.findMany({
      select: { id: true, slug: true },
      orderBy: { slug: "asc" },
      take: 2,
    });
  }

  const wipe = await wipeAllShipments();

  const summary: Array<{ slug: string; created: number }> = [];
  let totalCreated = 0;

  for (const t of tenants) {
    const admin = await prisma.user.findFirst({
      where: { tenantId: t.id, role: Role.admin },
    });
    if (!admin) continue;
    const { created } = await seedTenant(t.id, admin.id);
    totalCreated += created;
    summary.push({ slug: t.slug, created });
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        shipmentsRemoved: wipe.removed,
        shipmentsCreated: totalCreated,
        byTenant: summary,
        note:
          "Pendientes sin monto; confirmados con precio y mensaje al cliente; rechazados con motivo.",
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
