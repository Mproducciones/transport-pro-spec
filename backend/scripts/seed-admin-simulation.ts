/**
 * Simulación de carga para probar el panel admin: envíos pasados, hoy y futuros (Chile).
 * Marca datos con cargoDescription "sim-chile-*" y facturas "SIM-CHILE-*".
 *
 * Prerrequisito: tenant demo con cuentas agente (ej. npm run seed:test-agents una vez).
 *
 * Uso: npm run seed:admin-simulation
 */
import {
  PaymentStatus,
  PaymentTerm,
  Prisma,
  PrismaClient,
  Role,
  SettlementStatus,
  ShipmentStatus,
} from "@prisma/client";

const prisma = new PrismaClient();

const MARKER_PREFIX = "sim-chile-";

function money(n: number) {
  return new Prisma.Decimal(n);
}

/** Coordenadas + metadatos de descarga para que mapas, rentabilidad y liquidaciones tengan datos completos. */
function routeGeo(originLat: number, originLng: number, destLat: number, destLng: number, seq = 1) {
  return {
    originLat: new Prisma.Decimal(originLat),
    originLng: new Prisma.Decimal(originLng),
    destinationLat: new Prisma.Decimal(destLat),
    destinationLng: new Prisma.Decimal(destLng),
    loadSequence: seq,
    unloadAccess: "Sim: coordinar andén / ventana (datos de demo).",
  };
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d.getTime());
  x.setDate(x.getDate() + days);
  return x;
}

function addHours(d: Date, hours: number): Date {
  return new Date(d.getTime() + hours * 3600000);
}

function atHour(base: Date, hour: number, minute = 0): Date {
  const d = new Date(base.getTime());
  d.setHours(hour, minute, 0, 0);
  return d;
}

async function wipeSimulation(tenantId: string) {
  const shipments = await prisma.shipment.findMany({
    where: { tenantId, cargoDescription: { startsWith: MARKER_PREFIX } },
    select: { id: true },
  });
  const ids = shipments.map((s) => s.id);

  await prisma.$transaction(async (tx) => {
    if (ids.length > 0) {
      await tx.shipmentAttachment.deleteMany({ where: { shipmentId: { in: ids } } });
      await tx.supportMessage.deleteMany({ where: { shipmentId: { in: ids } } });
      await tx.payment.deleteMany({ where: { shipmentId: { in: ids } } });
      await tx.expense.deleteMany({ where: { shipmentId: { in: ids } } });
      await tx.alert.deleteMany({ where: { shipmentId: { in: ids } } });
      await tx.invoiceLine.deleteMany({ where: { shipmentId: { in: ids } } });
      await tx.shipmentStatusHistory.deleteMany({ where: { shipmentId: { in: ids } } });
      await tx.shipment.deleteMany({ where: { id: { in: ids } } });
    }

    const invoices = await tx.invoice.findMany({
      where: { tenantId, number: { startsWith: "SIM-CHILE-" } },
      select: { id: true },
    });
    const invIds = invoices.map((i) => i.id);
    if (invIds.length > 0) {
      await tx.payment.deleteMany({ where: { invoiceId: { in: invIds } } });
      await tx.invoiceLine.deleteMany({ where: { invoiceId: { in: invIds } } });
      await tx.invoice.deleteMany({ where: { id: { in: invIds } } });
    }
  });
}

async function addHistory(
  shipmentId: string,
  steps: Array<{ from: ShipmentStatus | null; to: ShipmentStatus; note: string; userId: string }>
) {
  await prisma.shipmentStatusHistory.createMany({
    data: steps.map((s) => ({
      shipmentId,
      fromStatus: s.from,
      toStatus: s.to,
      note: s.note,
      changedById: s.userId,
    })),
  });
}

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: "demo" } });
  if (!tenant) {
    console.error(JSON.stringify({ ok: false, message: "No existe tenant slug=demo. Ejecutá: npm run db:seed o seed:test-agents" }));
    process.exit(1);
  }

  const admin = await prisma.user.findFirst({
    where: { tenantId: tenant.id, email: "empresa.agente@demo.com", role: Role.admin },
  });
  const c1 = await prisma.user.findFirst({
    where: { tenantId: tenant.id, email: "cliente.agente1@demo.com", role: Role.cliente },
    select: { id: true, customerId: true },
  });
  const c2 = await prisma.user.findFirst({
    where: { tenantId: tenant.id, email: "cliente.agente2@demo.com", role: Role.cliente },
    select: { id: true, customerId: true },
  });
  const d1 = await prisma.user.findFirst({
    where: { tenantId: tenant.id, email: "chofer.agente1@demo.com", role: Role.conductor },
    include: { driver: { include: { assignedVehicle: true } } },
  });
  const d2 = await prisma.user.findFirst({
    where: { tenantId: tenant.id, email: "chofer.agente2@demo.com", role: Role.conductor },
    include: { driver: { include: { assignedVehicle: true } } },
  });

  if (!admin || !c1?.customerId || !c2?.customerId || !d1?.driver || !d2?.driver) {
    console.error(
      JSON.stringify({
        ok: false,
        message: "Faltan usuarios agente. Ejecutá primero: npm run seed:test-agents",
        found: { admin: !!admin, cliente1: !!c1?.customerId, cliente2: !!c2?.customerId, chofer1: !!d1?.driver, chofer2: !!d2?.driver },
      })
    );
    process.exit(1);
  }

  const customer1Id = c1.customerId;
  const customer2Id = c2.customerId;
  const driver1 = d1.driver;
  const driver2 = d2.driver;
  const v1 = driver1.assignedVehicleId;
  const v2 = driver2.assignedVehicleId;

  await wipeSimulation(tenant.id);

  await prisma.company.updateMany({
    where: { tenantId: tenant.id },
    data: {
      driverCommissionPercent: new Prisma.Decimal(40),
      pricingBaseFee: new Prisma.Decimal(30000),
      pricingPerKg: new Prisma.Decimal(100),
      pricingPerM3: new Prisma.Decimal(4100),
      pricingMinimumCharge: new Prisma.Decimal(36000),
    },
  });

  await prisma.driverSettlement.deleteMany({
    where: { tenantId: tenant.id, notes: "sim-chile-liquidacion-cerrada" },
  });

  const now = new Date();
  const today0 = atHour(now, 0, 0);

  /** Pasado: entregado, pagado, con egreso (peaje) — rentabilidad / egresos */
  const pastPickup = addDays(now, -18);
  const pastDelivery = addHours(pastPickup, 8);
  const pastDelivered = await prisma.shipment.create({
    data: {
      tenantId: tenant.id,
      customerId: customer1Id,
      driverId: driver1.id,
      vehicleId: v1 ?? undefined,
      origin: "Santiago, Estación Central",
      destination: "Valparaíso, Cerro Alegre",
      pickupAddress: "Av. General Velásquez 1300",
      deliveryAddress: "Templeman 123, Cerro Alegre",
      ...routeGeo(-33.452, -70.678, -33.041, -71.632, 1),
      cargoType: "pallet",
      cargoDescription: `${MARKER_PREFIX}pasado-entregado-pagado`,
      cargoWeightKg: money(1200),
      cargoVolumeM3: money(8),
      amount: money(385000),
      baseAmount: money(385000),
      helperSurcharge: money(0),
      totalAmount: money(385000),
      status: ShipmentStatus.entregado,
      paymentStatus: PaymentStatus.pagado,
      paymentTerm: PaymentTerm.delivery,
      scheduledPickup: pastPickup,
      scheduledDelivery: pastDelivery,
      pickupWindowStart: addHours(pastPickup, -1),
      pickupWindowEnd: addHours(pastPickup, 2),
      deliveryWindowStart: addHours(pastDelivery, -1),
      deliveryWindowEnd: addHours(pastDelivery, 2),
      approvedById: admin.id,
      approvedAt: addHours(pastPickup, -2),
      decisionNote: "Simulación: aprobado para prueba de auditoría.",
      pickedUpAt: pastPickup,
      enTransitoAt: addHours(pastPickup, 3),
      deliveredAt: pastDelivery,
      deliveredToName: "Bodega Recepción",
      deliveredToId: "12.345.678-9",
    },
  });
  await addHistory(pastDelivered.id, [
    { from: null, to: ShipmentStatus.pendiente, note: "Sim: cliente solicitó", userId: c1.id },
    { from: ShipmentStatus.pendiente, to: ShipmentStatus.confirmado, note: "Sim: empresa aprobó", userId: admin.id },
    { from: ShipmentStatus.confirmado, to: ShipmentStatus.recogido, note: "Sim: retiro", userId: d1.id },
    { from: ShipmentStatus.recogido, to: ShipmentStatus.en_transito, note: "Sim: en ruta", userId: d1.id },
    { from: ShipmentStatus.en_transito, to: ShipmentStatus.entregado, note: "Sim: entrega OK", userId: d1.id },
  ]);
  await prisma.expense.create({
    data: {
      tenantId: tenant.id,
      shipmentId: pastDelivered.id,
      category: "Peaje",
      amount: money(18500),
      note: "Simulación TAG ruta 68",
      recordedById: admin.id,
      recordedAt: addHours(pastPickup, 1),
    },
  });
  await prisma.payment.create({
    data: {
      tenantId: tenant.id,
      shipmentId: pastDelivered.id,
      amount: money(385000),
      method: "transferencia",
      reference: "SIM-CHILE-TRF-ENTREGADO",
      verificationStatus: "aprobado",
      verifiedById: admin.id,
      verifiedAt: addDays(now, -16),
      paidAt: addDays(now, -16),
      recordedById: c1.id,
    },
  });

  /** Pasado: rechazado */
  const rejPickup = addDays(now, -9);
  const rejDel = addHours(rejPickup, 6);
  const rejected = await prisma.shipment.create({
    data: {
      tenantId: tenant.id,
      customerId: customer2Id,
      origin: "La Serena, Centro",
      destination: "Copiapó, Centro",
      pickupAddress: "Calle Prat 400",
      deliveryAddress: "Rodríguez 200",
      ...routeGeo(-29.903, -71.252, -27.367, -70.331, 1),
      cargoType: "caja",
      cargoDescription: `${MARKER_PREFIX}pasado-rechazado`,
      cargoWeightKg: money(400),
      cargoVolumeM3: money(2.5),
      status: ShipmentStatus.rechazado,
      paymentStatus: PaymentStatus.pendiente,
      paymentTerm: PaymentTerm.delivery,
      scheduledPickup: rejPickup,
      scheduledDelivery: rejDel,
      pickupWindowStart: addHours(rejPickup, -1),
      pickupWindowEnd: addHours(rejPickup, 1),
      deliveryWindowStart: addHours(rejDel, -1),
      deliveryWindowEnd: addHours(rejDel, 1),
      approvedById: admin.id,
      approvedAt: addHours(rejPickup, -4),
      decisionNote: "Simulación: rechazado por capacidad en fecha solicitada.",
    },
  });
  await addHistory(rejected.id, [
    { from: null, to: ShipmentStatus.pendiente, note: "Sim: solicitud", userId: c2.id },
    { from: ShipmentStatus.pendiente, to: ShipmentStatus.rechazado, note: "Sim: sin cupo", userId: admin.id },
  ]);

  /** Pasado: entregado con factura SIM-CHILE */
  const invPickup = addDays(now, -22);
  const invDel = addHours(invPickup, 10);
  const forInvoice = await prisma.shipment.create({
    data: {
      tenantId: tenant.id,
      customerId: customer2Id,
      driverId: driver2.id,
      vehicleId: v2 ?? undefined,
      origin: "Temuco, Centro",
      destination: "Valdivia, Centro",
      pickupAddress: "Portales 100",
      deliveryAddress: "Yerbas Buenas 50",
      ...routeGeo(-38.736, -72.591, -39.814, -73.246, 2),
      cargoType: "contenedor",
      cargoDescription: `${MARKER_PREFIX}pasado-con-factura`,
      cargoWeightKg: money(8000),
      cargoVolumeM3: money(32),
      amount: money(890000),
      baseAmount: money(890000),
      helperSurcharge: money(0),
      totalAmount: money(890000),
      status: ShipmentStatus.entregado,
      paymentStatus: PaymentStatus.pagado,
      paymentTerm: PaymentTerm.delivery,
      scheduledPickup: invPickup,
      scheduledDelivery: invDel,
      pickupWindowStart: addHours(invPickup, -1),
      pickupWindowEnd: addHours(invPickup, 2),
      deliveryWindowStart: addHours(invDel, -1),
      deliveryWindowEnd: addHours(invDel, 2),
      approvedById: admin.id,
      approvedAt: addHours(invPickup, -3),
      pickedUpAt: invPickup,
      enTransitoAt: addHours(invPickup, 4),
      deliveredAt: invDel,
      deliveredToName: "Centro distribución",
      deliveredToId: "76.543.210-K",
    },
  });
  await addHistory(forInvoice.id, [
    { from: null, to: ShipmentStatus.pendiente, note: "Sim: pedido", userId: c2.id },
    { from: ShipmentStatus.pendiente, to: ShipmentStatus.confirmado, note: "Sim: OK", userId: admin.id },
    { from: ShipmentStatus.confirmado, to: ShipmentStatus.recogido, note: "Sim", userId: d2.id },
    { from: ShipmentStatus.recogido, to: ShipmentStatus.en_transito, note: "Sim", userId: d2.id },
    { from: ShipmentStatus.en_transito, to: ShipmentStatus.entregado, note: "Sim", userId: d2.id },
  ]);
  const subtotal = money(890000);
  const taxRate = money(19);
  const taxAmount = subtotal.mul(taxRate).div(money(100));
  const invTotal = subtotal.add(taxAmount);
  const invoice = await prisma.invoice.create({
    data: {
      tenantId: tenant.id,
      customerId: customer2Id,
      number: "SIM-CHILE-FAC-001",
      taxRate,
      subtotal,
      taxAmount,
      total: invTotal,
      notes: "Simulación cobranza Chile (IVA 19%).",
      lines: {
        create: [
          {
            description: "Flete Temuco – Valdivia",
            quantity: money(1),
            unitPrice: subtotal,
            lineTotal: subtotal,
            shipmentId: forInvoice.id,
          },
        ],
      },
    },
  });
  await prisma.payment.create({
    data: {
      tenantId: tenant.id,
      shipmentId: forInvoice.id,
      invoiceId: invoice.id,
      amount: invTotal,
      method: "transferencia",
      reference: "SIM-CHILE-FAC-PAGADA",
      verificationStatus: "aprobado",
      verifiedById: admin.id,
      verifiedAt: addDays(now, -20),
      paidAt: addDays(now, -20),
      recordedById: c2.id,
    },
  });

  /** Hoy: en tránsito + última posición (mapa) */
  const tPickup = addHours(today0, 8);
  const tDel = addHours(today0, 18);
  const enRuta = await prisma.shipment.create({
    data: {
      tenantId: tenant.id,
      customerId: customer1Id,
      driverId: driver1.id,
      vehicleId: v1 ?? undefined,
      origin: "Rancagua, Centro",
      destination: "Santiago, Maipú",
      pickupAddress: "Estado 300",
      deliveryAddress: "Av. Pajaritos 2200",
      ...routeGeo(-34.17, -70.744, -33.51, -70.76, 1),
      cargoType: "granel",
      cargoDescription: `${MARKER_PREFIX}hoy-en-transito`,
      cargoWeightKg: money(24000),
      cargoVolumeM3: money(18),
      amount: money(520000),
      baseAmount: money(520000),
      helperSurcharge: money(0),
      totalAmount: money(520000),
      status: ShipmentStatus.en_transito,
      paymentStatus: PaymentStatus.parcial,
      paymentTerm: PaymentTerm.upfront_partial,
      upfrontPercent: money(40),
      upfrontAmount: money(208000),
      scheduledPickup: tPickup,
      scheduledDelivery: tDel,
      pickupWindowStart: addHours(tPickup, -1),
      pickupWindowEnd: addHours(tPickup, 2),
      deliveryWindowStart: addHours(tDel, -2),
      deliveryWindowEnd: addHours(tDel, 2),
      approvedById: admin.id,
      approvedAt: addHours(today0, 6),
      pickedUpAt: addHours(today0, 9),
      enTransitoAt: addHours(today0, 10),
      lastLat: new Prisma.Decimal(-33.52),
      lastLng: new Prisma.Decimal(-70.78),
      lastReportedAt: addHours(now, -1),
    },
  });
  await addHistory(enRuta.id, [
    { from: null, to: ShipmentStatus.pendiente, note: "Sim: hoy", userId: c1.id },
    { from: ShipmentStatus.pendiente, to: ShipmentStatus.confirmado, note: "Sim", userId: admin.id },
    { from: ShipmentStatus.confirmado, to: ShipmentStatus.recogido, note: "Sim", userId: d1.id },
    { from: ShipmentStatus.recogido, to: ShipmentStatus.en_transito, note: "Sim: ruta 5 Sur", userId: d1.id },
  ]);
  await prisma.payment.create({
    data: {
      tenantId: tenant.id,
      shipmentId: enRuta.id,
      amount: money(208000),
      method: "transferencia",
      reference: "SIM-CHILE-ANTICIPO",
      verificationStatus: "aprobado",
      verifiedById: admin.id,
      verifiedAt: addHours(today0, 7),
      paidAt: addHours(today0, 7),
      recordedById: c1.id,
    },
  });
  await prisma.payment.create({
    data: {
      tenantId: tenant.id,
      shipmentId: enRuta.id,
      amount: money(312000),
      method: "transferencia",
      reference: "SIM-CHILE-SALDO-PENDIENTE",
      verificationStatus: "pendiente",
      paidAt: addHours(now, -2),
      recordedById: c1.id,
    },
  });
  await prisma.supportMessage.create({
    data: {
      tenantId: tenant.id,
      driverId: driver1.id,
      shipmentId: enRuta.id,
      authorRole: Role.conductor,
      authorUserId: d1.id,
      body: "Simulación: tránsito normal por Rancagua, ETA Maipú ~18:00.",
    },
  });

  /** Hoy: recogido */
  const rPickup = addHours(today0, 11);
  const rDel = addHours(today0, 20);
  const recogido = await prisma.shipment.create({
    data: {
      tenantId: tenant.id,
      customerId: customer1Id,
      driverId: driver2.id,
      vehicleId: v2 ?? undefined,
      origin: "Antofagasta, Sur",
      destination: "Calama, Centro",
      pickupAddress: "Balmaceda 1500",
      deliveryAddress: "Granaderos 400",
      ...routeGeo(-23.65, -70.4, -22.454, -68.929, 1),
      requiresHelper: true,
      helperSurcharge: money(25000),
      cargoType: "pallet",
      cargoDescription: `${MARKER_PREFIX}hoy-recogido`,
      cargoWeightKg: money(900),
      cargoVolumeM3: money(4),
      amount: money(435000),
      baseAmount: money(410000),
      totalAmount: money(435000),
      status: ShipmentStatus.recogido,
      paymentStatus: PaymentStatus.pendiente,
      paymentTerm: PaymentTerm.delivery,
      scheduledPickup: rPickup,
      scheduledDelivery: rDel,
      pickupWindowStart: addHours(rPickup, -1),
      pickupWindowEnd: addHours(rPickup, 2),
      deliveryWindowStart: addHours(rDel, -1),
      deliveryWindowEnd: addHours(rDel, 2),
      approvedById: admin.id,
      approvedAt: addHours(today0, 8),
      pickedUpAt: addHours(today0, 12),
    },
  });
  await addHistory(recogido.id, [
    { from: null, to: ShipmentStatus.pendiente, note: "Sim", userId: c1.id },
    { from: ShipmentStatus.pendiente, to: ShipmentStatus.confirmado, note: "Sim", userId: admin.id },
    { from: ShipmentStatus.confirmado, to: ShipmentStatus.recogido, note: "Sim: carga OK", userId: d2.id },
  ]);

  /** Hoy: confirmado (entrega más tarde) */
  const cPickup = addHours(today0, 15);
  const cDel = addHours(today0, 22);
  const confirmHoy = await prisma.shipment.create({
    data: {
      tenantId: tenant.id,
      customerId: customer2Id,
      driverId: driver1.id,
      vehicleId: v1 ?? undefined,
      origin: "Puerto Montt, Centro",
      destination: "Osorno, Centro",
      pickupAddress: "O'Higgins 500",
      deliveryAddress: "Eleuterio Ramírez 800",
      ...routeGeo(-41.47, -72.936, -40.574, -73.135, 1),
      cargoType: "caja",
      cargoDescription: `${MARKER_PREFIX}hoy-confirmado`,
      cargoWeightKg: money(600),
      cargoVolumeM3: money(3.2),
      amount: money(275000),
      baseAmount: money(275000),
      helperSurcharge: money(0),
      totalAmount: money(275000),
      status: ShipmentStatus.confirmado,
      paymentStatus: PaymentStatus.pendiente,
      paymentTerm: PaymentTerm.delivery,
      scheduledPickup: cPickup,
      scheduledDelivery: cDel,
      pickupWindowStart: addHours(cPickup, -1),
      pickupWindowEnd: addHours(cPickup, 2),
      deliveryWindowStart: addHours(cDel, -1),
      deliveryWindowEnd: addHours(cDel, 2),
      approvedById: admin.id,
      approvedAt: addHours(today0, 7),
      decisionNote: "Simulación: confirmado para ventana tarde.",
    },
  });
  await addHistory(confirmHoy.id, [
    { from: null, to: ShipmentStatus.pendiente, note: "Sim", userId: c2.id },
    { from: ShipmentStatus.pendiente, to: ShipmentStatus.confirmado, note: "Sim: asignado CH1", userId: admin.id },
  ]);

  /** Futuro: pendiente sin equipo */
  const f1Pickup = addDays(atHour(today0, 9), 5);
  const f1Del = addHours(f1Pickup, 8);
  const futPend = await prisma.shipment.create({
    data: {
      tenantId: tenant.id,
      customerId: customer1Id,
      origin: "Iquique, Zofri",
      destination: "Arica, Centro",
      pickupAddress: "Zona Franca acceso norte",
      deliveryAddress: "Sotomayor 300",
      ...routeGeo(-20.214, -70.151, -18.478, -70.321, 1),
      cargoType: "otro",
      cargoDescription: `${MARKER_PREFIX}futuro-pendiente`,
      cargoWeightKg: money(1500),
      cargoVolumeM3: money(6),
      status: ShipmentStatus.pendiente,
      paymentStatus: PaymentStatus.pendiente,
      paymentTerm: PaymentTerm.delivery,
      scheduledPickup: f1Pickup,
      scheduledDelivery: f1Del,
      pickupWindowStart: addHours(f1Pickup, -1),
      pickupWindowEnd: addHours(f1Pickup, 2),
      deliveryWindowStart: addHours(f1Del, -1),
      deliveryWindowEnd: addHours(f1Del, 2),
    },
  });
  await addHistory(futPend.id, [
    { from: null, to: ShipmentStatus.pendiente, note: "Sim: solicitud futura", userId: c1.id },
  ]);

  /** Futuro: confirmado con chofer */
  const f2Pickup = addDays(atHour(today0, 10), 3);
  const f2Del = addHours(f2Pickup, 7);
  const futConf = await prisma.shipment.create({
    data: {
      tenantId: tenant.id,
      customerId: customer2Id,
      driverId: driver2.id,
      vehicleId: v2 ?? undefined,
      origin: "Concepción, Collao",
      destination: "Chillán, Centro",
      pickupAddress: "Collao 2100",
      deliveryAddress: "Arauco 450",
      ...routeGeo(-36.827, -73.051, -36.607, -72.103, 2),
      cargoType: "pallet",
      cargoDescription: `${MARKER_PREFIX}futuro-confirmado`,
      cargoWeightKg: money(1100),
      cargoVolumeM3: money(5),
      amount: money(310000),
      baseAmount: money(310000),
      helperSurcharge: money(0),
      totalAmount: money(310000),
      status: ShipmentStatus.confirmado,
      paymentStatus: PaymentStatus.pendiente,
      paymentTerm: PaymentTerm.delivery,
      scheduledPickup: f2Pickup,
      scheduledDelivery: f2Del,
      pickupWindowStart: addHours(f2Pickup, -1),
      pickupWindowEnd: addHours(f2Pickup, 2),
      deliveryWindowStart: addHours(f2Del, -1),
      deliveryWindowEnd: addHours(f2Del, 2),
      approvedById: admin.id,
      approvedAt: addDays(now, -1),
    },
  });
  await addHistory(futConf.id, [
    { from: null, to: ShipmentStatus.pendiente, note: "Sim", userId: c2.id },
    { from: ShipmentStatus.pendiente, to: ShipmentStatus.confirmado, note: "Sim: programado +3d", userId: admin.id },
  ]);

  /** Alerta operativa ligada a un envío activo */
  await prisma.alert.create({
    data: {
      tenantId: tenant.id,
      shipmentId: enRuta.id,
      type: "retraso",
      message: "Simulación: revisar ETA Maipú (demo).",
    },
  });

  const comPct = new Prisma.Decimal(40);
  const liqBase = money(385000);
  const liqGross = liqBase.mul(comPct).div(money(100));
  const bonus = money(12000);
  const ded = money(4000);
  await prisma.driverSettlement.create({
    data: {
      tenantId: tenant.id,
      driverId: driver1.id,
      periodStart: addDays(now, -40),
      periodEnd: addDays(now, -12),
      entregasCount: 1,
      baseAmount: liqBase,
      commissionPercent: comPct,
      grossAmount: liqGross,
      bonusAmount: bonus,
      deductionAmount: ded,
      netAmount: liqGross.add(bonus).sub(ded),
      notes: "sim-chile-liquidacion-cerrada",
      status: SettlementStatus.cerrado,
      closedAt: addDays(now, -11),
      closedById: admin.id,
    },
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        marker: MARKER_PREFIX,
        cuentaAdmin: "empresa.agente@demo.com",
        enviosSimulacion: [
          pastDelivered.id,
          rejected.id,
          forInvoice.id,
          enRuta.id,
          recogido.id,
          confirmHoy.id,
          futPend.id,
          futConf.id,
        ],
        factura: invoice.number,
        notas: [
          "Filtrá envíos por descripción que empiece con sim-chile- en listados si querés aislar esta corrida.",
          "Cliente1/Chofer1: revisar pedido en tránsito y mensaje soporte.",
          "Pagos: un comprobante pendiente de validación (SIM-CHILE-SALDO-PENDIENTE).",
        ],
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
