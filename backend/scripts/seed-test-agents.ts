import {
  PaymentStatus,
  PaymentTerm,
  Prisma,
  PrismaClient,
  Role,
  ShipmentStatus,
  SubscriptionStatus,
  VehicleStatus,
} from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const MARKER_PREFIX = "agent-demo-";
const ADMIN_PASS = "Admin123!";
const CLIENT_PASS = "Cliente123!";
const DRIVER_PASS = "Conductor123!";

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 3600000);
}

function money(value: number) {
  return new Prisma.Decimal(value);
}

async function ensureDemoTenant() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: "demo" },
    update: { name: "Transportes Demo" },
    create: {
      name: "Transportes Demo",
      slug: "demo",
      company: {
        create: {
          legalName: "Transportes Demo S.A.",
          taxId: "0999999999001",
          address: "Av. Libertador Bernardo O'Higgins 1234, Santiago",
          phone: "+56221234500",
        },
      },
    },
  });

  await prisma.company.upsert({
    where: { tenantId: tenant.id },
    update: {
      legalName: "Transportes Demo S.A.",
      taxId: "0999999999001",
      accountStatus: "activa",
      /** Visible en Precios / liquidaciones (no es el default 40 del schema). */
      driverCommissionPercent: new Prisma.Decimal(38),
      pricingBaseFee: new Prisma.Decimal(28000),
      pricingPerKg: new Prisma.Decimal(95),
      pricingPerM3: new Prisma.Decimal(4200),
      pricingMinimumCharge: new Prisma.Decimal(32000),
    },
    create: {
      tenantId: tenant.id,
      legalName: "Transportes Demo S.A.",
      taxId: "0999999999001",
      address: "Av. Libertador Bernardo O'Higgins 1234, Santiago",
      phone: "+56221234500",
      driverCommissionPercent: new Prisma.Decimal(38),
      pricingBaseFee: new Prisma.Decimal(28000),
      pricingPerKg: new Prisma.Decimal(95),
      pricingPerM3: new Prisma.Decimal(4200),
      pricingMinimumCharge: new Prisma.Decimal(32000),
    },
  });

  await prisma.subscription.upsert({
    where: { tenantId: tenant.id },
    update: {
      plan: "pro",
      status: SubscriptionStatus.active,
      currentPeriodEnd: addHours(new Date(), 24 * 30),
    },
    create: {
      tenantId: tenant.id,
      plan: "pro",
      status: SubscriptionStatus.active,
      currentPeriodEnd: addHours(new Date(), 24 * 30),
    },
  });

  return tenant;
}

async function wipeAgentDemoData(tenantId: string) {
  const shipments = await prisma.shipment.findMany({
    where: { tenantId, cargoDescription: { startsWith: MARKER_PREFIX } },
    select: { id: true },
  });
  const shipmentIds = shipments.map((s) => s.id);

  await prisma.$transaction(async (tx) => {
    if (shipmentIds.length > 0) {
      await tx.shipmentAttachment.deleteMany({ where: { shipmentId: { in: shipmentIds } } });
      await tx.supportMessage.deleteMany({ where: { shipmentId: { in: shipmentIds } } });
      await tx.payment.deleteMany({ where: { shipmentId: { in: shipmentIds } } });
      await tx.expense.deleteMany({ where: { shipmentId: { in: shipmentIds } } });
      await tx.alert.deleteMany({ where: { shipmentId: { in: shipmentIds } } });
      await tx.invoiceLine.deleteMany({ where: { shipmentId: { in: shipmentIds } } });
      await tx.shipmentStatusHistory.deleteMany({ where: { shipmentId: { in: shipmentIds } } });
      await tx.shipment.deleteMany({ where: { id: { in: shipmentIds } } });
    }

    const invoices = await tx.invoice.findMany({
      where: { tenantId, number: { startsWith: "AGENT-DEMO-" } },
      select: { id: true },
    });
    const invoiceIds = invoices.map((i) => i.id);
    if (invoiceIds.length > 0) {
      await tx.payment.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
      await tx.invoiceLine.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
      await tx.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
    }
  });

  return shipmentIds.length;
}

async function ensureAdmin(tenantId: string) {
  const passwordHash = await bcrypt.hash(ADMIN_PASS, 10);
  return prisma.user.upsert({
    where: { tenantId_email: { tenantId, email: "empresa.agente@demo.com" } },
    update: { role: Role.admin, passwordHash },
    create: {
      tenantId,
      email: "empresa.agente@demo.com",
      passwordHash,
      role: Role.admin,
    },
  });
}

async function ensureCustomerAgent(tenantId: string, index: 1 | 2) {
  const email = `cliente.agente${index}@demo.com`;
  const customer = await prisma.customer.upsert({
    where: { tenantId_email: { tenantId, email } },
    update: {
      name: `Cliente Agente ${index}`,
      taxId: `AG-CLIENTE-${index}`,
      phone: `+5692000100${index}`,
    },
    create: {
      tenantId,
      email,
      name: `Cliente Agente ${index}`,
      taxId: `AG-CLIENTE-${index}`,
      phone: `+5692000100${index}`,
    },
  });

  const passwordHash = await bcrypt.hash(CLIENT_PASS, 10);
  const user = await prisma.user.upsert({
    where: { tenantId_email: { tenantId, email } },
    update: { role: Role.cliente, customerId: customer.id, passwordHash },
    create: {
      tenantId,
      email,
      passwordHash,
      role: Role.cliente,
      customerId: customer.id,
    },
  });

  return { customer, user, email, password: CLIENT_PASS };
}

async function ensureDriverAgent(tenantId: string, index: 1 | 2) {
  const vehicle = await prisma.vehicle.upsert({
    where: { tenantId_plate: { tenantId, plate: `AGT-${100 + index}` } },
    update: { kind: index === 1 ? "Camión 5t" : "Furgón urbano", status: VehicleStatus.asignado },
    create: {
      tenantId,
      plate: `AGT-${100 + index}`,
      kind: index === 1 ? "Camión 5t" : "Furgón urbano",
      status: VehicleStatus.asignado,
    },
  });

  const email = `chofer.agente${index}@demo.com`;
  const demoAvatar =
    index === 1
      ? "https://i.pravatar.cc/128?img=12"
      : "https://i.pravatar.cc/128?img=33";
  const driver = await prisma.driver.upsert({
    where: { tenantId_taxId: { tenantId, taxId: `AG-CHOFER-${index}` } },
    update: {
      fullName: `Chofer Agente ${index}`,
      phone: `+5692000200${index}`,
      licenseNumber: `LIC-AG-${index}`,
      status: "activo",
      assignedVehicleId: vehicle.id,
      avatarUrl: demoAvatar,
    },
    create: {
      tenantId,
      fullName: `Chofer Agente ${index}`,
      taxId: `AG-CHOFER-${index}`,
      phone: `+5692000200${index}`,
      licenseNumber: `LIC-AG-${index}`,
      assignedVehicleId: vehicle.id,
      avatarUrl: demoAvatar,
    },
  });

  const passwordHash = await bcrypt.hash(DRIVER_PASS, 10);
  const user = await prisma.user.upsert({
    where: { tenantId_email: { tenantId, email } },
    update: { role: Role.conductor, driverId: driver.id, passwordHash },
    create: {
      tenantId,
      email,
      passwordHash,
      role: Role.conductor,
      driverId: driver.id,
    },
  });

  return { driver, user, vehicle, email, password: DRIVER_PASS };
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

async function createShipmentScenario(args: {
  tenantId: string;
  customerId: string;
  customerUserId: string;
  driverId?: string;
  driverUserId?: string;
  vehicleId?: string;
  adminId: string;
  marker: string;
  origin: string;
  destination: string;
  status: ShipmentStatus;
  amount: number;
  paymentStatus: PaymentStatus;
  paymentTerm: PaymentTerm;
  pickupInHours: number;
}) {
  const scheduledPickup = addHours(new Date(), args.pickupInHours);
  const scheduledDelivery = addHours(scheduledPickup, 5);
  const isApproved = args.status !== ShipmentStatus.pendiente && args.status !== ShipmentStatus.rechazado;

  const shipment = await prisma.shipment.create({
    data: {
      tenantId: args.tenantId,
      customerId: args.customerId,
      driverId: args.driverId,
      vehicleId: args.vehicleId,
      origin: args.origin,
      destination: args.destination,
      pickupAddress: `${args.origin} - bodega agente`,
      deliveryAddress: `${args.destination} - recepción agente`,
      cargoType: "caja",
      cargoQuantity: money(3),
      cargoWeightKg: money(280),
      cargoVolumeM3: money(1.8),
      cargoDescription: `${MARKER_PREFIX}${args.marker}`,
      amount: isApproved ? money(args.amount) : null,
      baseAmount: isApproved ? money(args.amount) : null,
      helperSurcharge: money(0),
      totalAmount: isApproved ? money(args.amount) : null,
      status: args.status,
      paymentStatus: args.paymentStatus,
      paymentTerm: args.paymentTerm,
      scheduledPickup,
      scheduledDelivery,
      pickupWindowStart: addHours(scheduledPickup, -1),
      pickupWindowEnd: addHours(scheduledPickup, 1),
      deliveryWindowStart: addHours(scheduledDelivery, -1),
      deliveryWindowEnd: addHours(scheduledDelivery, 1),
      pickupNotes: "Prueba Chile: retirar con guía de despacho.",
      deliveryNotes: "Prueba Chile: confirmar RUT y nombre de quien recibe.",
      approvedById: isApproved ? args.adminId : null,
      approvedAt: isApproved ? new Date() : null,
      pickedUpAt:
        args.status === ShipmentStatus.recogido ||
        args.status === ShipmentStatus.en_transito ||
        args.status === ShipmentStatus.entregado
          ? addHours(new Date(), -2)
          : null,
      enTransitoAt:
        args.status === ShipmentStatus.en_transito || args.status === ShipmentStatus.entregado
          ? addHours(new Date(), -1)
          : null,
      deliveredAt: args.status === ShipmentStatus.entregado ? new Date() : null,
      deliveredToName: args.status === ShipmentStatus.entregado ? "Receptor Demo" : null,
      deliveredToId: args.status === ShipmentStatus.entregado ? "ID-DEMO-001" : null,
      decisionNote: isApproved ? "Aprobado por agente empresa para pruebas." : "Pendiente de revisión por empresa.",
    },
  });

  const steps: Array<{ from: ShipmentStatus | null; to: ShipmentStatus; note: string; userId: string }> = [
    { from: null, to: ShipmentStatus.pendiente, note: "Cliente agente creó solicitud", userId: args.customerUserId },
  ];

  if (isApproved) {
    steps.push({
      from: ShipmentStatus.pendiente,
      to: ShipmentStatus.confirmado,
      note: "Empresa agente aprobó y asignó chofer",
      userId: args.adminId,
    });
  }
  if (
    args.status === ShipmentStatus.recogido ||
    args.status === ShipmentStatus.en_transito ||
    args.status === ShipmentStatus.entregado
  ) {
    steps.push({
      from: ShipmentStatus.confirmado,
      to: ShipmentStatus.recogido,
      note: "Chofer agente retiró carga",
      userId: args.driverUserId ?? args.adminId,
    });
  }
  if (args.status === ShipmentStatus.en_transito || args.status === ShipmentStatus.entregado) {
    steps.push({
      from: ShipmentStatus.recogido,
      to: ShipmentStatus.en_transito,
      note: "Chofer agente inició ruta",
      userId: args.driverUserId ?? args.adminId,
    });
  }
  if (args.status === ShipmentStatus.entregado) {
    steps.push({
      from: ShipmentStatus.en_transito,
      to: ShipmentStatus.entregado,
      note: "Chofer agente cerró entrega",
      userId: args.driverUserId ?? args.adminId,
    });
  }

  await addHistory(shipment.id, steps);
  return shipment;
}

async function main() {
  const tenant = await ensureDemoTenant();
  const removed = await wipeAgentDemoData(tenant.id);

  const admin = await ensureAdmin(tenant.id);
  const client1 = await ensureCustomerAgent(tenant.id, 1);
  const client2 = await ensureCustomerAgent(tenant.id, 2);
  const driver1 = await ensureDriverAgent(tenant.id, 1);
  const driver2 = await ensureDriverAgent(tenant.id, 2);

  const shipmentA = await createShipmentScenario({
    tenantId: tenant.id,
    customerId: client1.customer.id,
    customerUserId: client1.user.id,
    adminId: admin.id,
    marker: "cliente-1-pendiente",
    origin: "Santiago, Providencia",
    destination: "Viña del Mar, Centro",
    status: ShipmentStatus.pendiente,
    amount: 145000,
    paymentStatus: PaymentStatus.pendiente,
    paymentTerm: PaymentTerm.delivery,
    pickupInHours: 4,
  });

  const shipmentB = await createShipmentScenario({
    tenantId: tenant.id,
    customerId: client1.customer.id,
    customerUserId: client1.user.id,
    driverId: driver1.driver.id,
    driverUserId: driver1.user.id,
    vehicleId: driver1.vehicle.id,
    adminId: admin.id,
    marker: "chofer-1-en-ruta",
    origin: "Concepción, Centro",
    destination: "Chillán, Centro",
    status: ShipmentStatus.en_transito,
    amount: 198000,
    paymentStatus: PaymentStatus.parcial,
    paymentTerm: PaymentTerm.upfront_partial,
    pickupInHours: -3,
  });

  const shipmentC = await createShipmentScenario({
    tenantId: tenant.id,
    customerId: client2.customer.id,
    customerUserId: client2.user.id,
    driverId: driver2.driver.id,
    driverUserId: driver2.user.id,
    vehicleId: driver2.vehicle.id,
    adminId: admin.id,
    marker: "chofer-2-confirmado",
    origin: "Antofagasta, Sur",
    destination: "Calama, Centro",
    status: ShipmentStatus.confirmado,
    amount: 172000,
    paymentStatus: PaymentStatus.pendiente,
    paymentTerm: PaymentTerm.delivery,
    pickupInHours: 2,
  });

  const shipmentD = await createShipmentScenario({
    tenantId: tenant.id,
    customerId: client2.customer.id,
    customerUserId: client2.user.id,
    driverId: driver2.driver.id,
    driverUserId: driver2.user.id,
    vehicleId: driver2.vehicle.id,
    adminId: admin.id,
    marker: "cliente-2-entregado",
    origin: "Rancagua, Centro",
    destination: "Talca, Centro",
    status: ShipmentStatus.entregado,
    amount: 121000,
    paymentStatus: PaymentStatus.pagado,
    paymentTerm: PaymentTerm.delivery,
    pickupInHours: -7,
  });

  const invoiceTotal = money(121000).mul(1.12);
  const invoice = await prisma.invoice.create({
    data: {
      tenantId: tenant.id,
      customerId: client2.customer.id,
      number: "AGENT-DEMO-0001",
      taxRate: money(12),
      subtotal: money(121000),
      taxAmount: money(14520),
      total: invoiceTotal,
      notes: "Factura demo para validar flujo cliente -> empresa.",
      lines: {
        create: [
          {
            description: "Servicio agente entregado",
            quantity: money(1),
            unitPrice: money(121000),
            lineTotal: money(121000),
            shipmentId: shipmentD.id,
          },
        ],
      },
    },
  });

  await prisma.payment.createMany({
    data: [
      {
        tenantId: tenant.id,
        shipmentId: shipmentB.id,
        amount: money(99000),
        method: "transferencia",
        reference: "AGENT-DEMO-PAGO-PENDIENTE",
        verificationStatus: "pendiente",
        verificationNote: "Cliente agente 1 subió comprobante para validar.",
        paidAt: new Date(),
        recordedById: client1.user.id,
      },
      {
        tenantId: tenant.id,
        shipmentId: shipmentD.id,
        invoiceId: invoice.id,
        amount: invoiceTotal,
        method: "transferencia",
        reference: "AGENT-DEMO-PAGO-APROBADO",
        verificationStatus: "aprobado",
        verificationNote: "Empresa agente aprobó el pago.",
        verifiedById: admin.id,
        verifiedAt: new Date(),
        paidAt: new Date(),
        recordedById: client2.user.id,
      },
    ],
  });

  await prisma.supportMessage.createMany({
    data: [
      {
        tenantId: tenant.id,
        driverId: driver1.driver.id,
        shipmentId: shipmentB.id,
        authorRole: Role.conductor,
        authorUserId: driver1.user.id,
        body: "Agente chofer 1: tráfico en ruta, mantengo ETA actualizada.",
      },
      {
        tenantId: tenant.id,
        driverId: driver2.driver.id,
        shipmentId: shipmentC.id,
        authorRole: Role.conductor,
        authorUserId: driver2.user.id,
        body: "Agente chofer 2: listo para retirar la carga asignada.",
      },
    ],
  });

  const accounts = [
    {
      agente: "Empresa de transporte",
      email: "empresa.agente@demo.com",
      password: ADMIN_PASS,
      entrada: "/admin/dashboard",
      tarea: "Revisar solicitud pendiente, validar pago pendiente y monitorear choferes.",
    },
    {
      agente: "Cliente 1",
      email: client1.email,
      password: client1.password,
      entrada: "/cliente/pedidos",
      tarea: "Ver pedido pendiente y pago parcial pendiente de validación.",
    },
    {
      agente: "Chofer 1",
      email: driver1.email,
      password: driver1.password,
      entrada: "/driver/mis-viajes",
      tarea: "Continuar viaje en ruta y enviar actualizaciones.",
    },
    {
      agente: "Cliente 2",
      email: client2.email,
      password: client2.password,
      entrada: "/cliente/pedidos",
      tarea: "Revisar viaje confirmado y factura/pago aprobado.",
    },
    {
      agente: "Chofer 2",
      email: driver2.email,
      password: driver2.password,
      entrada: "/driver/mis-viajes",
      tarea: "Tomar viaje confirmado y probar flujo de retiro.",
    },
  ];

  console.log(
    JSON.stringify(
      {
        ok: true,
        removedPreviousAgentShipments: removed,
        tenant: "demo",
        accounts,
        interactions: {
          shipments: [shipmentA.id, shipmentB.id, shipmentC.id, shipmentD.id],
          invoice: invoice.number,
          payments: ["AGENT-DEMO-PAGO-PENDIENTE", "AGENT-DEMO-PAGO-APROBADO"],
          supportMessages: 2,
        },
      },
      null,
      2
    )
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
