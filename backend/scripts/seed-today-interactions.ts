/**
 * Pedidos de prueba con retiro/entrega el día de ejecución (fecha local del servidor)
 * y estados listos para el panel del conductor (confirmado, recogido, en_transito, entregado).
 *
 * Requisito: tenant demo con admin@demo.com y conductor con vehículo (prisma db seed).
 *
 * Uso: npm run seed:today
 * Re-ejecutar borra solo envíos con cargoDescription "hoy-demo-*".
 */
import {
  PaymentTerm,
  Prisma,
  PrismaClient,
  ShipmentStatus,
  PaymentStatus,
} from "@prisma/client";

const prisma = new PrismaClient();

const MARKER_PREFIX = "hoy-demo-";

const ROUTES = [
  {
    origin: "Santiago Centro",
    destination: "Valparaíso Centro",
    oLat: -33.4489,
    oLng: -70.6693,
    dLat: -33.0458,
    dLng: -71.6197,
  },
  {
    origin: "Concepción Centro",
    destination: "Temuco Centro",
    oLat: -36.8201,
    oLng: -73.0444,
    dLat: -38.7359,
    dLng: -72.5984,
  },
  {
    origin: "La Serena Centro",
    destination: "Copiapó Centro",
    oLat: -29.9027,
    oLng: -71.2529,
    dLat: -27.3668,
    dLng: -70.3322,
  },
  {
    origin: "Puerto Montt Centro",
    destination: "Osorno Centro",
    oLat: -41.4693,
    oLng: -72.9424,
    dLat: -40.5739,
    dLng: -73.1219,
  },
] as const;

function startOfTodayLocal(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function todayAt(hour: number, minute = 0): Date {
  const d = startOfTodayLocal();
  d.setHours(hour, minute, 0, 0);
  return d;
}

function addHours(d: Date, h: number): Date {
  return new Date(d.getTime() + h * 3600000);
}

async function wipeTodayDemo(tenantId: string) {
  const existing = await prisma.shipment.findMany({
    where: { tenantId, cargoDescription: { startsWith: MARKER_PREFIX } },
    select: { id: true },
  });
  const ids = existing.map((x) => x.id);
  if (ids.length === 0) return 0;

  await prisma.$transaction(async (tx) => {
    await tx.shipmentAttachment.deleteMany({ where: { shipmentId: { in: ids } } });
    await tx.payment.deleteMany({ where: { shipmentId: { in: ids } } });
    await tx.expense.deleteMany({ where: { shipmentId: { in: ids } } });
    await tx.alert.deleteMany({ where: { shipmentId: { in: ids } } });
    await tx.invoiceLine.updateMany({
      where: { shipmentId: { in: ids } },
      data: { shipmentId: null },
    });
    await tx.shipmentStatusHistory.deleteMany({ where: { shipmentId: { in: ids } } });
    await tx.shipment.deleteMany({ where: { id: { in: ids } } });
  });
  return ids.length;
}

type TodayScenario = {
  suffix: string;
  status: ShipmentStatus;
  /** Hora local de retiro programado hoy */
  pickupHour: number;
  pickupMinute?: number;
  deliveryHour: number;
  loadSequence: number | null;
  paymentStatus: PaymentStatus;
  paymentTerm: PaymentTerm;
  cargoType: "pallet" | "caja" | "granel";
  cargoWeightKg: number;
  cargoVolumeM3: number;
};

/** Retiros temprano hoy para no bloquear el checklist del conductor en horario laboral */
const SCENARIOS: TodayScenario[] = [
  {
    suffix: "a-retirar-1",
    status: "confirmado",
    pickupHour: 6,
    pickupMinute: 0,
    deliveryHour: 14,
    loadSequence: 1,
    paymentStatus: "pagado",
    paymentTerm: "delivery",
    cargoType: "pallet",
    cargoWeightKg: 420,
    cargoVolumeM3: 2.2,
  },
  {
    suffix: "a-retirar-2",
    status: "confirmado",
    pickupHour: 6,
    pickupMinute: 20,
    deliveryHour: 16,
    loadSequence: 2,
    paymentStatus: "pendiente",
    paymentTerm: "delivery",
    cargoType: "caja",
    cargoWeightKg: 180,
    cargoVolumeM3: 1.1,
  },
  {
    suffix: "a-retirar-3",
    status: "confirmado",
    pickupHour: 6,
    pickupMinute: 40,
    deliveryHour: 18,
    loadSequence: 3,
    paymentStatus: "parcial",
    paymentTerm: "delivery",
    cargoType: "caja",
    cargoWeightKg: 95,
    cargoVolumeM3: 0.6,
  },
  {
    suffix: "en-camion",
    status: "recogido",
    pickupHour: 5,
    pickupMinute: 30,
    deliveryHour: 15,
    loadSequence: 2,
    paymentStatus: "pagado",
    paymentTerm: "delivery",
    cargoType: "pallet",
    cargoWeightKg: 510,
    cargoVolumeM3: 3.0,
  },
  {
    suffix: "en-ruta",
    status: "en_transito",
    pickupHour: 5,
    pickupMinute: 0,
    deliveryHour: 12,
    loadSequence: 3,
    paymentStatus: "pendiente",
    paymentTerm: "delivery",
    cargoType: "granel",
    cargoWeightKg: 1200,
    cargoVolumeM3: 8.5,
  },
  {
    suffix: "cerrado-hoy",
    status: "entregado",
    pickupHour: 4,
    pickupMinute: 30,
    deliveryHour: 10,
    loadSequence: null,
    paymentStatus: "pagado",
    paymentTerm: "delivery",
    cargoType: "pallet",
    cargoWeightKg: 330,
    cargoVolumeM3: 1.8,
  },
];

function historyForStatus(
  shipmentId: string,
  status: ShipmentStatus,
  adminId: string
): Prisma.ShipmentStatusHistoryCreateManyInput[] {
  const base: Prisma.ShipmentStatusHistoryCreateManyInput[] = [
    {
      shipmentId,
      fromStatus: null,
      toStatus: ShipmentStatus.pendiente,
      note: "Solicitud demo (hoy)",
      changedById: adminId,
    },
    {
      shipmentId,
      fromStatus: ShipmentStatus.pendiente,
      toStatus: ShipmentStatus.confirmado,
      note: "Aprobada — prueba interacción hoy",
      changedById: adminId,
    },
  ];

  if (status === ShipmentStatus.confirmado) return base;

  const withPickup: Prisma.ShipmentStatusHistoryCreateManyInput[] = [
    ...base,
    {
      shipmentId,
      fromStatus: ShipmentStatus.confirmado,
      toStatus: ShipmentStatus.recogido,
      note: "Carga retirada",
      changedById: adminId,
    },
  ];

  if (status === ShipmentStatus.recogido) return withPickup;

  const withTransit: Prisma.ShipmentStatusHistoryCreateManyInput[] = [
    ...withPickup,
    {
      shipmentId,
      fromStatus: ShipmentStatus.recogido,
      toStatus: ShipmentStatus.en_transito,
      note: "En camino al destino",
      changedById: adminId,
    },
  ];

  if (status === ShipmentStatus.en_transito) return withTransit;

  if (status === ShipmentStatus.entregado) {
    return [
      ...withTransit,
      {
        shipmentId,
        fromStatus: ShipmentStatus.en_transito,
        toStatus: ShipmentStatus.entregado,
        note: "Entrega cerrada (demo)",
        changedById: adminId,
      },
    ];
  }

  return base;
}

async function main() {
  const admin = await prisma.user.findFirst({
    where: { email: "admin@demo.com" },
    select: { id: true, tenantId: true },
  });
  if (!admin) {
    throw new Error("No existe admin@demo.com — ejecutá: npm run db:seed");
  }

  const tenantId = admin.tenantId;

  const driver = await prisma.driver.findFirst({
    where: { tenantId, assignedVehicleId: { not: null } },
    include: { assignedVehicle: true },
  });
  if (!driver?.assignedVehicleId) {
    throw new Error("No hay conductor con vehículo asignado en el tenant demo");
  }

  const customer = await prisma.customer.findFirst({
    where: { tenantId },
    orderBy: { createdAt: "asc" },
  });
  if (!customer) throw new Error("No hay cliente en el tenant demo");

  const removed = await wipeTodayDemo(tenantId);

  const dayStart = startOfTodayLocal();
  const createdIds: string[] = [];

  for (let i = 0; i < SCENARIOS.length; i++) {
    const sc = SCENARIOS[i];
    const route = ROUTES[i % ROUTES.length];
    const pickup = todayAt(sc.pickupHour, sc.pickupMinute ?? 0);
    const delivery = todayAt(sc.deliveryHour);
    const total = 125000 + i * 18500;
    const desc = `${MARKER_PREFIX}${sc.suffix}`;

    const pickedUpAt =
      sc.status === ShipmentStatus.recogido ||
      sc.status === ShipmentStatus.en_transito ||
      sc.status === ShipmentStatus.entregado
        ? addHours(pickup, -0.5)
        : null;
    const enTransitoAt =
      sc.status === ShipmentStatus.en_transito || sc.status === ShipmentStatus.entregado
        ? addHours(pickup, 1)
        : null;
    const deliveredAt =
      sc.status === ShipmentStatus.entregado ? todayAt(Math.min(sc.deliveryHour, 11), 30) : null;

    const s = await prisma.shipment.create({
      data: {
        tenantId,
        customerId: customer.id,
        origin: route.origin,
        destination: route.destination,
        pickupAddress: `${route.origin} — bodega demo`,
        deliveryAddress: `${route.destination} — recepción`,
        originLat: new Prisma.Decimal(route.oLat),
        originLng: new Prisma.Decimal(route.oLng),
        destinationLat: new Prisma.Decimal(route.dLat),
        destinationLng: new Prisma.Decimal(route.dLng),
        cargoType: sc.cargoType,
        cargoQuantity: new Prisma.Decimal(1 + (i % 4)),
        cargoWeightKg: new Prisma.Decimal(sc.cargoWeightKg),
        cargoVolumeM3: new Prisma.Decimal(sc.cargoVolumeM3),
        cargoDescription: desc,
        amount: new Prisma.Decimal(total),
        baseAmount: new Prisma.Decimal(total),
        totalAmount: new Prisma.Decimal(total),
        helperSurcharge: new Prisma.Decimal(0),
        requiresHelper: false,
        status: sc.status,
        paymentStatus: sc.paymentStatus,
        paymentTerm: sc.paymentTerm,
        upfrontPercent: null,
        upfrontAmount: null,
        scheduledPickup: pickup,
        scheduledDelivery: delivery,
        pickupWindowStart: addHours(pickup, -1),
        pickupWindowEnd: addHours(pickup, 2),
        deliveryWindowStart: addHours(delivery, -1),
        deliveryWindowEnd: addHours(delivery, 2),
        pickupNotes: `Retiro hoy ${pickup.toLocaleString("es")} (demo).`,
        deliveryNotes: `Entrega prevista ${delivery.toLocaleString("es")}.`,
        loadSequence: sc.loadSequence,
        unloadAccess: "Muelle demo · ventana 08:00–17:00",
        approvedById: admin.id,
        approvedAt: addHours(dayStart, -2),
        decisionNote: "Pedido de prueba generado para el día actual.",
        driverId: driver.id,
        vehicleId: driver.assignedVehicleId,
        pickedUpAt,
        enTransitoAt,
        deliveredAt,
        deliveredToName: sc.status === ShipmentStatus.entregado ? "Recepción QA Demo" : null,
        deliveredToId: sc.status === ShipmentStatus.entregado ? "DEMO-REC-001" : null,
        deliveryEvidence:
          sc.status === ShipmentStatus.entregado ? "Entrega demo — firma en remito test" : null,
      },
    });

    createdIds.push(s.id);

    await prisma.shipmentStatusHistory.createMany({
      data: historyForStatus(s.id, sc.status, admin.id),
    });

    if (sc.paymentStatus === "pagado" || sc.paymentStatus === "parcial") {
      const payAmount =
        sc.paymentStatus === "pagado"
          ? total
          : Math.round(total * 0.35);
      await prisma.payment.create({
        data: {
          tenantId,
          shipmentId: s.id,
          amount: new Prisma.Decimal(payAmount),
          method: "transferencia",
          reference: `HOY-DEMO-PAGO-${sc.suffix}`,
          verificationStatus: "aprobado",
          verificationNote: "Pago demo aprobado (seed hoy)",
          verifiedById: admin.id,
          verifiedAt: new Date(),
          paidAt: addHours(dayStart, -1),
          recordedById: admin.id,
        },
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        fechaLocal: startOfTodayLocal().toISOString().slice(0, 10),
        tenantId,
        conductor: driver.fullName,
        vehiculo: driver.assignedVehicle?.plate ?? null,
        eliminadosPrevios: removed,
        creados: createdIds.length,
        envios: SCENARIOS.map((sc, i) => ({
          ref: `${MARKER_PREFIX}${sc.suffix}`,
          estado: sc.status,
          pago: sc.paymentStatus,
          retiroHoy: todayAt(sc.pickupHour, sc.pickupMinute ?? 0).toISOString(),
        })),
        loginConductor: "conductor@demo.com / Conductor123!",
        nota: "Pedidos con ventanas el día actual (hora local). Re-ejecutá el script para regenerar.",
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
