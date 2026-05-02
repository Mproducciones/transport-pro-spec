import {
  CargoType,
  PaymentStatus,
  PaymentTerm,
  Prisma,
  PrismaClient,
  Role,
  SettlementStatus,
  ShipmentStatus,
  SubscriptionStatus,
  VehicleStatus,
} from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEMO_CORE = "demo-core";

function addHours(d: Date, hours: number): Date {
  return new Date(d.getTime() + hours * 3600000);
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d.getTime());
  x.setDate(x.getDate() + days);
  return x;
}

function todayStart(): Date {
  const s = new Date();
  s.setHours(0, 0, 0, 0);
  return s;
}

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: "demo" },
    update: {},
    create: {
      name: "Transportes Demo",
      slug: "demo",
      company: {
        create: {
          legalName: "Transportes Demo S.A.",
          taxId: "0999999999001",
          driverCommissionPercent: new Prisma.Decimal(35),
          pricingBaseFee: new Prisma.Decimal(22000),
          pricingPerKg: new Prisma.Decimal(110),
          pricingPerM3: new Prisma.Decimal(4800),
          pricingMinimumCharge: new Prisma.Decimal(38000),
          address: "Av. Apoquindo 3841, Las Condes, Santiago",
          phone: "+56223377100",
        },
      },
    },
  });

  await prisma.company.updateMany({
    where: { tenantId: tenant.id },
    data: {
      driverCommissionPercent: new Prisma.Decimal(35),
      pricingBaseFee: new Prisma.Decimal(22000),
      pricingPerKg: new Prisma.Decimal(110),
      pricingPerM3: new Prisma.Decimal(4800),
      pricingMinimumCharge: new Prisma.Decimal(38000),
      legalName: "Transportes Demo S.A.",
      taxId: "0999999999001",
      address: "Av. Apoquindo 3841, Las Condes, Santiago",
      phone: "+56223377100",
    },
  });

  await prisma.subscription.upsert({
    where: { tenantId: tenant.id },
    update: {},
    create: {
      tenantId: tenant.id,
      plan: "standard",
      status: SubscriptionStatus.trialing,
      currentPeriodEnd: new Date(Date.now() + 14 * 86400000),
    },
  });

  const passwordHash = await bcrypt.hash("Admin123!", 10);
  const admin = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: "admin@demo.com" } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: "admin@demo.com",
      passwordHash,
      role: Role.admin,
    },
  });

  const customer = await prisma.customer.upsert({
    where: {
      tenantId_email: { tenantId: tenant.id, email: "cliente@demo.com" },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      name: "Cliente Demo S.A.",
      email: "cliente@demo.com",
      taxId: "1712345678001",
    },
  });

  const customerPass = await bcrypt.hash("Cliente123!", 10);
  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: "cliente@demo.com" } },
    update: { passwordHash: customerPass, customerId: customer.id, role: Role.cliente },
    create: {
      tenantId: tenant.id,
      email: "cliente@demo.com",
      passwordHash: customerPass,
      role: Role.cliente,
      customerId: customer.id,
    },
  });

  const v1 = await prisma.vehicle.upsert({
    where: { tenantId_plate: { tenantId: tenant.id, plate: "ABC-1234" } },
    update: {},
    create: {
      tenantId: tenant.id,
      plate: "ABC-1234",
      kind: "Camión 5t",
      status: VehicleStatus.disponible,
    },
  });

  await prisma.vehicle.upsert({
    where: { tenantId_plate: { tenantId: tenant.id, plate: "XYZ-9999" } },
    update: {},
    create: {
      tenantId: tenant.id,
      plate: "XYZ-9999",
      kind: "Furgón",
      status: VehicleStatus.en_taller,
    },
  });

  const driver = await prisma.driver.upsert({
    where: { id: "seed-driver-1" },
    update: {
      fullName: "Juan Conductor",
      phone: "+56987654321",
      licenseNumber: "B-123456",
      taxId: "18.765.432-1",
    },
    create: {
      id: "seed-driver-1",
      tenantId: tenant.id,
      fullName: "Juan Conductor",
      phone: "+56987654321",
      licenseNumber: "B-123456",
      taxId: "18.765.432-1",
      assignedVehicleId: v1.id,
    },
  });

  await prisma.vehicle.update({
    where: { id: v1.id },
    data: { status: VehicleStatus.asignado },
  });

  const driverPass = await bcrypt.hash("Conductor123!", 10);
  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: "conductor@demo.com" } },
    update: { passwordHash: driverPass, driverId: driver.id },
    create: {
      tenantId: tenant.id,
      email: "conductor@demo.com",
      passwordHash: driverPass,
      role: Role.conductor,
      driverId: driver.id,
    },
  });

  const existingShip = await prisma.shipment.findFirst({
    where: { tenantId: tenant.id, origin: "Santiago, Quinta Normal", destination: "Valparaíso (demo seed)" },
  });

  let shipment = existingShip;
  if (!shipment) {
    const scheduledPickup = new Date(Date.now() + 36 * 3600 * 1000);
    const scheduledDelivery = new Date(scheduledPickup.getTime() + 8 * 3600 * 1000);
    shipment = await prisma.shipment.create({
      data: {
        tenantId: tenant.id,
        customerId: customer.id,
        driverId: driver.id,
        vehicleId: v1.id,
        origin: "Santiago, Quinta Normal",
        destination: "Valparaíso (demo seed)",
        pickupAddress: "Av. Mapocho 4500, Quinta Normal, Santiago",
        deliveryAddress: "Muelle Prat, Valparaíso",
        originLat: new Prisma.Decimal(-33.425),
        originLng: new Prisma.Decimal(-70.697),
        destinationLat: new Prisma.Decimal(-33.045),
        destinationLng: new Prisma.Decimal(-71.62),
        cargoType: CargoType.caja,
        cargoWeightKg: new Prisma.Decimal(1200),
        cargoVolumeM3: new Prisma.Decimal(12),
        cargoDescription: "Carga general",
        amount: new Prisma.Decimal(450000),
        baseAmount: new Prisma.Decimal(420000),
        requiresHelper: true,
        helperSurcharge: new Prisma.Decimal(30000),
        totalAmount: new Prisma.Decimal(450000),
        paymentTerm: PaymentTerm.upfront_partial,
        upfrontPercent: new Prisma.Decimal(30),
        upfrontAmount: new Prisma.Decimal(135000),
        scheduledPickup,
        scheduledDelivery,
        pickupWindowStart: addHours(scheduledPickup, -1),
        pickupWindowEnd: addHours(scheduledPickup, 2),
        deliveryWindowStart: addHours(scheduledDelivery, -2),
        deliveryWindowEnd: addHours(scheduledDelivery, 2),
        pickupNotes: "Citofono 301 · carga lista desde 09:00",
        deliveryNotes: "Acceso camión por calle lateral",
        loadSequence: 1,
        unloadAccess: "Muelle 4, presentar OC 15 min antes",
        status: ShipmentStatus.confirmado,
        paymentStatus: PaymentStatus.parcial,
        approvedById: admin.id,
        approvedAt: addHours(new Date(), -2),
        decisionNote: "Demo: anticipo 30% acordado con cliente.",
      },
    });
    await prisma.shipmentStatusHistory.createMany({
      data: [
        {
          shipmentId: shipment.id,
          fromStatus: null,
          toStatus: ShipmentStatus.pendiente,
          note: "Envío demo creado",
          changedById: admin.id,
        },
        {
          shipmentId: shipment.id,
          fromStatus: ShipmentStatus.pendiente,
          toStatus: ShipmentStatus.confirmado,
          note: "Confirmado para conductor",
          changedById: admin.id,
        },
      ],
    });
  } else {
    await prisma.shipment.update({
      where: { id: existingShip.id },
      data: {
        originLat: new Prisma.Decimal(-33.425),
        originLng: new Prisma.Decimal(-70.697),
        destinationLat: new Prisma.Decimal(-33.045),
        destinationLng: new Prisma.Decimal(-71.62),
        pickupWindowStart: addHours(existingShip.scheduledPickup, -1),
        pickupWindowEnd: addHours(existingShip.scheduledPickup, 2),
        deliveryWindowStart: addHours(existingShip.scheduledDelivery, -2),
        deliveryWindowEnd: addHours(existingShip.scheduledDelivery, 2),
        pickupNotes: "Citofono 301 · carga lista desde 09:00",
        deliveryNotes: "Acceso camión por calle lateral",
        loadSequence: 1,
        unloadAccess: "Muelle 4, presentar OC 15 min antes",
        paymentTerm: PaymentTerm.upfront_partial,
        upfrontPercent: new Prisma.Decimal(30),
        requiresHelper: true,
        helperSurcharge: new Prisma.Decimal(30000),
        baseAmount: new Prisma.Decimal(420000),
        totalAmount: new Prisma.Decimal(450000),
        amount: new Prisma.Decimal(450000),
        upfrontAmount: new Prisma.Decimal(135000),
        approvedById: admin.id,
        approvedAt: addHours(new Date(), -2),
        decisionNote: "Demo: anticipo 30% acordado con cliente.",
      },
    });
    shipment = await prisma.shipment.findFirstOrThrow({ where: { id: existingShip.id } });
  }

  const now = new Date();

  async function ensureCore(desc: string, create: () => Promise<void>) {
    const exists = await prisma.shipment.findFirst({
      where: { tenantId: tenant.id, cargoDescription: desc },
    });
    if (!exists) await create();
  }

  /**
   * Empresas de prueba (solo datos seed) que solicitan envíos: aparecen en Envíos / admin con distintos nombres comerciales.
   * Emails @*.demo para no colisionar con usuarios reales.
   */
  const demoEmpresas = [
    {
      slug: "dist-austral",
      name: "Distribuidora Austral Ltda.",
      email: "logistica@distribuidora-austral.demo",
      taxId: "768889910001",
      phone: "+56228110001",
    },
    {
      slug: "import-pacifico",
      name: "Importadora Pacífico SpA",
      email: "operaciones@importadora-pacifico.demo",
      taxId: "768889920002",
      phone: "+56227220002",
    },
    {
      slug: "retail-sur",
      name: "Retail Sur Chile S.A.",
      email: "cd@retail-sur.demo",
      taxId: "768889930003",
      phone: "+56229330003",
    },
    {
      slug: "const-horizonte",
      name: "Constructora Horizonte Ltda.",
      email: "abastecimiento@constructora-horizonte.demo",
      taxId: "768889940004",
      phone: "+56226440004",
    },
  ] as const;

  const empresaCustomerBySlug: Record<string, string> = {};
  for (const e of demoEmpresas) {
    const cu = await prisma.customer.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: e.email } },
      update: { name: e.name, taxId: e.taxId, phone: e.phone },
      create: {
        tenantId: tenant.id,
        name: e.name,
        email: e.email,
        taxId: e.taxId,
        phone: e.phone,
      },
    });
    empresaCustomerBySlug[e.slug] = cu.id;
  }

  await ensureCore(`${DEMO_CORE}-pend-sin-cotizacion`, async () => {
    const p = addDays(now, 5);
    const d = addHours(p, 10);
    const row = await prisma.shipment.create({
      data: {
        tenantId: tenant.id,
        customerId: customer.id,
        origin: "Curicó, Centro",
        destination: "Talca, Centro",
        pickupAddress: "Yungay 200",
        deliveryAddress: "1 Sur 100",
        originLat: new Prisma.Decimal(-34.983),
        originLng: new Prisma.Decimal(-71.24),
        destinationLat: new Prisma.Decimal(-35.426),
        destinationLng: new Prisma.Decimal(-71.655),
        cargoType: CargoType.caja,
        cargoDescription: `${DEMO_CORE}-pend-sin-cotizacion`,
        cargoWeightKg: new Prisma.Decimal(400),
        scheduledPickup: p,
        scheduledDelivery: d,
        pickupWindowStart: addHours(p, -1),
        pickupWindowEnd: addHours(p, 2),
        deliveryWindowStart: addHours(d, -1),
        deliveryWindowEnd: addHours(d, 2),
        status: ShipmentStatus.pendiente,
        paymentStatus: PaymentStatus.pendiente,
        paymentTerm: PaymentTerm.delivery,
      },
    });
    await prisma.shipmentStatusHistory.create({
      data: {
        shipmentId: row.id,
        fromStatus: null,
        toStatus: ShipmentStatus.pendiente,
        note: "Seed: sin cotización aún",
        changedById: admin.id,
      },
    });
  });

  await ensureCore(`${DEMO_CORE}-pend-falta-equipo`, async () => {
    const p = addDays(now, 4);
    const d = addHours(p, 9);
    const total = new Prisma.Decimal(318000);
    const row = await prisma.shipment.create({
      data: {
        tenantId: tenant.id,
        customerId: customer.id,
        origin: "Los Andes, Centro",
        destination: "San Felipe, Centro",
        pickupAddress: "Independencia 50",
        deliveryAddress: "Maipú 400",
        originLat: new Prisma.Decimal(-32.834),
        originLng: new Prisma.Decimal(-70.598),
        destinationLat: new Prisma.Decimal(-32.75),
        destinationLng: new Prisma.Decimal(-70.725),
        cargoType: CargoType.pallet,
        cargoDescription: `${DEMO_CORE}-pend-falta-equipo`,
        cargoWeightKg: new Prisma.Decimal(800),
        cargoVolumeM3: new Prisma.Decimal(4),
        amount: total,
        baseAmount: total,
        totalAmount: total,
        scheduledPickup: p,
        scheduledDelivery: d,
        pickupWindowStart: addHours(p, -1),
        pickupWindowEnd: addHours(p, 2),
        deliveryWindowStart: addHours(d, -1),
        deliveryWindowEnd: addHours(d, 2),
        status: ShipmentStatus.pendiente,
        paymentStatus: PaymentStatus.pendiente,
        paymentTerm: PaymentTerm.delivery,
        decisionNote: "Seed: cotizado, falta chofer/patente",
      },
    });
    await prisma.shipmentStatusHistory.createMany({
      data: [
        { shipmentId: row.id, fromStatus: null, toStatus: ShipmentStatus.pendiente, note: "Seed", changedById: admin.id },
      ],
    });
  });

  await ensureCore(`${DEMO_CORE}-pend-listo-confirmar`, async () => {
    const p = addDays(now, 3);
    const d = addHours(p, 8);
    const total = new Prisma.Decimal(295000);
    const row = await prisma.shipment.create({
      data: {
        tenantId: tenant.id,
        customerId: customer.id,
        driverId: driver.id,
        vehicleId: v1.id,
        origin: "Viña del Mar, Centro",
        destination: "Quilpué, Centro",
        pickupAddress: "Valparaíso 300",
        deliveryAddress: "Freire 120",
        originLat: new Prisma.Decimal(-33.024),
        originLng: new Prisma.Decimal(-71.552),
        destinationLat: new Prisma.Decimal(-33.047),
        destinationLng: new Prisma.Decimal(-71.443),
        cargoType: CargoType.caja,
        cargoDescription: `${DEMO_CORE}-pend-listo-confirmar`,
        cargoWeightKg: new Prisma.Decimal(550),
        amount: total,
        baseAmount: total,
        totalAmount: total,
        scheduledPickup: p,
        scheduledDelivery: d,
        pickupWindowStart: addHours(p, -1),
        pickupWindowEnd: addHours(p, 2),
        deliveryWindowStart: addHours(d, -1),
        deliveryWindowEnd: addHours(d, 2),
        loadSequence: 2,
        unloadAccess: "Andén 1",
        status: ShipmentStatus.pendiente,
        paymentStatus: PaymentStatus.pendiente,
        paymentTerm: PaymentTerm.delivery,
      },
    });
    await prisma.shipmentStatusHistory.create({
      data: {
        shipmentId: row.id,
        fromStatus: null,
        toStatus: ShipmentStatus.pendiente,
        note: "Seed: listo para confirmar al cliente",
        changedById: admin.id,
      },
    });
  });

  await ensureCore(`${DEMO_CORE}-emp-austral-sin-cotizar`, async () => {
    const p = addDays(now, 6);
    const d = addHours(p, 11);
    const row = await prisma.shipment.create({
      data: {
        tenantId: tenant.id,
        customerId: empresaCustomerBySlug["dist-austral"]!,
        origin: "Puerto Montt, centro",
        destination: "Puerto Varas, centro",
        pickupAddress: "Antonio Varas 800, Puerto Montt",
        deliveryAddress: "San Francisco 200, Puerto Varas",
        originLat: new Prisma.Decimal(-41.47),
        originLng: new Prisma.Decimal(-72.94),
        destinationLat: new Prisma.Decimal(-41.32),
        destinationLng: new Prisma.Decimal(-72.98),
        cargoType: CargoType.pallet,
        cargoDescription: `${DEMO_CORE}-emp-austral-sin-cotizar`,
        cargoWeightKg: new Prisma.Decimal(620),
        cargoVolumeM3: new Prisma.Decimal(3.2),
        scheduledPickup: p,
        scheduledDelivery: d,
        pickupWindowStart: addHours(p, -1),
        pickupWindowEnd: addHours(p, 2),
        deliveryWindowStart: addHours(d, -1),
        deliveryWindowEnd: addHours(d, 3),
        pickupNotes: "Carga refrigerada · presentar ID en portería",
        status: ShipmentStatus.pendiente,
        paymentStatus: PaymentStatus.pendiente,
        paymentTerm: PaymentTerm.delivery,
      },
    });
    await prisma.shipmentStatusHistory.create({
      data: {
        shipmentId: row.id,
        fromStatus: null,
        toStatus: ShipmentStatus.pendiente,
        note: "Seed empresa: solicitud sin cotización (Distribuidora Austral)",
        changedById: admin.id,
      },
    });
  });

  await ensureCore(`${DEMO_CORE}-emp-pacifico-falta-equipo`, async () => {
    const p = addDays(now, 5);
    const d = addHours(p, 12);
    const total = new Prisma.Decimal(485000);
    const row = await prisma.shipment.create({
      data: {
        tenantId: tenant.id,
        customerId: empresaCustomerBySlug["import-pacifico"]!,
        origin: "Antofagasta, centro",
        destination: "Calama, centro",
        pickupAddress: "Balmaceda 2500, Antofagasta",
        deliveryAddress: "Granaderos 1200, Calama",
        originLat: new Prisma.Decimal(-23.65),
        originLng: new Prisma.Decimal(-70.4),
        destinationLat: new Prisma.Decimal(-22.45),
        destinationLng: new Prisma.Decimal(-68.92),
        cargoType: CargoType.contenedor,
        cargoDescription: `${DEMO_CORE}-emp-pacifico-falta-equipo`,
        cargoWeightKg: new Prisma.Decimal(14000),
        cargoVolumeM3: new Prisma.Decimal(28),
        amount: total,
        baseAmount: total,
        totalAmount: total,
        scheduledPickup: p,
        scheduledDelivery: d,
        pickupWindowStart: addHours(p, -2),
        pickupWindowEnd: addHours(p, 3),
        deliveryWindowStart: addHours(d, -2),
        deliveryWindowEnd: addHours(d, 3),
        deliveryNotes: "Descarga con grúa horario 08:00–13:00",
        status: ShipmentStatus.pendiente,
        paymentStatus: PaymentStatus.pendiente,
        paymentTerm: PaymentTerm.upfront_partial,
        upfrontPercent: new Prisma.Decimal(40),
        upfrontAmount: new Prisma.Decimal(194000),
        decisionNote: "Seed: cotizado; falta asignar equipo (Importadora Pacífico)",
      },
    });
    await prisma.shipmentStatusHistory.create({
      data: {
        shipmentId: row.id,
        fromStatus: null,
        toStatus: ShipmentStatus.pendiente,
        note: "Seed empresa: cotizado, pendiente chofer/patente",
        changedById: admin.id,
      },
    });
  });

  await ensureCore(`${DEMO_CORE}-emp-retail-listo-confirmar`, async () => {
    const p = addDays(now, 2);
    const d = addHours(p, 9);
    const total = new Prisma.Decimal(352000);
    const row = await prisma.shipment.create({
      data: {
        tenantId: tenant.id,
        customerId: empresaCustomerBySlug["retail-sur"]!,
        driverId: driver.id,
        vehicleId: v1.id,
        origin: "Santiago, Quilicura",
        destination: "Santiago, Maipú",
        pickupAddress: "Lo Echevers 500, Quilicura",
        deliveryAddress: "Américo Vespucio 1500, Maipú",
        originLat: new Prisma.Decimal(-33.36),
        originLng: new Prisma.Decimal(-70.75),
        destinationLat: new Prisma.Decimal(-33.51),
        destinationLng: new Prisma.Decimal(-70.76),
        cargoType: CargoType.caja,
        cargoDescription: `${DEMO_CORE}-emp-retail-listo-confirmar`,
        cargoWeightKg: new Prisma.Decimal(2100),
        cargoVolumeM3: new Prisma.Decimal(18),
        amount: total,
        baseAmount: total,
        totalAmount: total,
        scheduledPickup: p,
        scheduledDelivery: d,
        pickupWindowStart: addHours(p, -1),
        pickupWindowEnd: addHours(p, 2),
        deliveryWindowStart: addHours(d, -1),
        deliveryWindowEnd: addHours(d, 2),
        loadSequence: 1,
        unloadAccess: "Centro distribución retail · muelle 7",
        status: ShipmentStatus.pendiente,
        paymentStatus: PaymentStatus.pendiente,
        paymentTerm: PaymentTerm.delivery,
      },
    });
    await prisma.shipmentStatusHistory.create({
      data: {
        shipmentId: row.id,
        fromStatus: null,
        toStatus: ShipmentStatus.pendiente,
        note: "Seed empresa: equipo sugerido; listo para confirmar al cliente (Retail Sur)",
        changedById: admin.id,
      },
    });
  });

  await ensureCore(`${DEMO_CORE}-emp-horizonte-granel`, async () => {
    const p = addDays(now, 7);
    const d = addHours(p, 10);
    const row = await prisma.shipment.create({
      data: {
        tenantId: tenant.id,
        customerId: empresaCustomerBySlug["const-horizonte"]!,
        origin: "Rancagua, centro",
        destination: "San Fernando, centro",
        pickupAddress: "Estado 340, Rancagua",
        deliveryAddress: "Matta 500, San Fernando",
        originLat: new Prisma.Decimal(-34.17),
        originLng: new Prisma.Decimal(-70.74),
        destinationLat: new Prisma.Decimal(-34.59),
        destinationLng: new Prisma.Decimal(-70.99),
        cargoType: CargoType.granel,
        cargoDescription: `${DEMO_CORE}-emp-horizonte-granel`,
        cargoWeightKg: new Prisma.Decimal(22000),
        cargoVolumeM3: new Prisma.Decimal(22),
        scheduledPickup: p,
        scheduledDelivery: d,
        pickupWindowStart: addHours(p, -1),
        pickupWindowEnd: addHours(p, 2),
        deliveryWindowStart: addHours(d, -1),
        deliveryWindowEnd: addHours(d, 2),
        pickupNotes: "Obra cerrada · avisar 30 min antes",
        status: ShipmentStatus.pendiente,
        paymentStatus: PaymentStatus.pendiente,
        paymentTerm: PaymentTerm.delivery,
      },
    });
    await prisma.shipmentStatusHistory.create({
      data: {
        shipmentId: row.id,
        fromStatus: null,
        toStatus: ShipmentStatus.pendiente,
        note: "Seed empresa: solicitud materiales obra (Constructora Horizonte)",
        changedById: admin.id,
      },
    });
  });

  await ensureCore(`${DEMO_CORE}-entregado-hoy`, async () => {
    const t0 = todayStart();
    const p = addHours(t0, 7);
    const d = addHours(t0, 14);
    const delAt = addHours(t0, 15);
    const total = new Prisma.Decimal(512000);
    const row = await prisma.shipment.create({
      data: {
        tenantId: tenant.id,
        customerId: customer.id,
        driverId: driver.id,
        vehicleId: v1.id,
        origin: "Santiago, La Florida",
        destination: "Santiago, Puente Alto",
        pickupAddress: "Vicuña Mackenna 6100",
        deliveryAddress: "Av. Concha y Toro 1500",
        originLat: new Prisma.Decimal(-33.52),
        originLng: new Prisma.Decimal(-70.598),
        destinationLat: new Prisma.Decimal(-33.61),
        destinationLng: new Prisma.Decimal(-70.576),
        cargoType: CargoType.granel,
        cargoDescription: `${DEMO_CORE}-entregado-hoy`,
        cargoWeightKg: new Prisma.Decimal(18000),
        cargoVolumeM3: new Prisma.Decimal(14),
        amount: total,
        baseAmount: total,
        totalAmount: total,
        status: ShipmentStatus.entregado,
        paymentStatus: PaymentStatus.pagado,
        paymentTerm: PaymentTerm.delivery,
        scheduledPickup: p,
        scheduledDelivery: d,
        pickedUpAt: addHours(t0, 8),
        enTransitoAt: addHours(t0, 10),
        deliveredAt: delAt,
        deliveredToName: "Bodega Central Puente Alto",
        deliveredToId: "77.889.100-5",
        approvedById: admin.id,
        approvedAt: addHours(t0, 6),
      },
    });
    await prisma.shipmentStatusHistory.createMany({
      data: [
        { shipmentId: row.id, fromStatus: null, toStatus: ShipmentStatus.pendiente, note: "Seed", changedById: admin.id },
        { shipmentId: row.id, fromStatus: ShipmentStatus.pendiente, toStatus: ShipmentStatus.confirmado, note: "Seed", changedById: admin.id },
        { shipmentId: row.id, fromStatus: ShipmentStatus.confirmado, toStatus: ShipmentStatus.recogido, note: "Seed", changedById: admin.id },
        { shipmentId: row.id, fromStatus: ShipmentStatus.recogido, toStatus: ShipmentStatus.en_transito, note: "Seed", changedById: admin.id },
        { shipmentId: row.id, fromStatus: ShipmentStatus.en_transito, toStatus: ShipmentStatus.entregado, note: "Seed", changedById: admin.id },
      ],
    });
  });

  await ensureCore(`${DEMO_CORE}-retraso`, async () => {
    const p = addDays(now, -3);
    const d = addDays(now, -1);
    const total = new Prisma.Decimal(402000);
    const row = await prisma.shipment.create({
      data: {
        tenantId: tenant.id,
        customerId: customer.id,
        driverId: driver.id,
        vehicleId: v1.id,
        origin: "Santiago, Cerrillos",
        destination: "Melipilla, Centro",
        pickupAddress: "Camino Melipilla 5000",
        deliveryAddress: "Serrano 100",
        originLat: new Prisma.Decimal(-33.497),
        originLng: new Prisma.Decimal(-70.71),
        destinationLat: new Prisma.Decimal(-33.688),
        destinationLng: new Prisma.Decimal(-71.215),
        cargoType: CargoType.pallet,
        cargoDescription: `${DEMO_CORE}-retraso`,
        cargoWeightKg: new Prisma.Decimal(950),
        amount: total,
        baseAmount: total,
        totalAmount: total,
        status: ShipmentStatus.en_transito,
        paymentStatus: PaymentStatus.pendiente,
        paymentTerm: PaymentTerm.delivery,
        scheduledPickup: p,
        scheduledDelivery: d,
        pickedUpAt: addHours(p, 2),
        enTransitoAt: addHours(p, 5),
        lastLat: new Prisma.Decimal(-33.58),
        lastLng: new Prisma.Decimal(-71.05),
        lastReportedAt: addHours(now, -3),
        approvedById: admin.id,
        approvedAt: addHours(p, -1),
      },
    });
    await prisma.shipmentStatusHistory.createMany({
      data: [
        { shipmentId: row.id, fromStatus: null, toStatus: ShipmentStatus.pendiente, note: "Seed", changedById: admin.id },
        { shipmentId: row.id, fromStatus: ShipmentStatus.pendiente, toStatus: ShipmentStatus.confirmado, note: "Seed", changedById: admin.id },
        { shipmentId: row.id, fromStatus: ShipmentStatus.confirmado, toStatus: ShipmentStatus.recogido, note: "Seed", changedById: admin.id },
        { shipmentId: row.id, fromStatus: ShipmentStatus.recogido, toStatus: ShipmentStatus.en_transito, note: "Seed retraso: fecha compromiso vencida", changedById: admin.id },
      ],
    });
  });

  /**
   * Liquidaciones de demostración en /admin/liquidaciones-choferes.
   * Se reemplazan en cada seed (notes con prefijo demo-seed-liq-) para que siempre existan tras `npm run db:seed`.
   */
  const companyRow = await prisma.company.findUnique({
    where: { tenantId: tenant.id },
    select: { driverCommissionPercent: true },
  });
  const comPctLiq = companyRow?.driverCommissionPercent ?? new Prisma.Decimal(35);
  const pctNum = Number(comPctLiq);
  await prisma.driverSettlement.deleteMany({
    where: { tenantId: tenant.id, notes: { startsWith: "demo-seed-liq-" } },
  });
  const baseBorrador = new Prisma.Decimal(512000);
  const grossBorrador = baseBorrador.mul(comPctLiq).div(new Prisma.Decimal(100));
  await prisma.driverSettlement.create({
    data: {
      tenantId: tenant.id,
      driverId: driver.id,
      periodStart: addDays(now, -10),
      periodEnd: addDays(now, -4),
      entregasCount: 1,
      baseAmount: baseBorrador,
      commissionPercent: comPctLiq,
      grossAmount: grossBorrador,
      bonusAmount: new Prisma.Decimal(0),
      deductionAmount: new Prisma.Decimal(0),
      netAmount: grossBorrador,
      notes: "demo-seed-liq-borrador · período de ejemplo (re-creado en cada db:seed)",
      status: SettlementStatus.borrador,
    },
  });
  const baseCerrada = new Prisma.Decimal(280000);
  const grossCerrada = baseCerrada.mul(comPctLiq).div(new Prisma.Decimal(100));
  const bonoC = new Prisma.Decimal(10000);
  const dedC = new Prisma.Decimal(3000);
  const netCerrada = grossCerrada.add(bonoC).sub(dedC);
  await prisma.driverSettlement.create({
    data: {
      tenantId: tenant.id,
      driverId: driver.id,
      periodStart: addDays(now, -55),
      periodEnd: addDays(now, -28),
      entregasCount: 2,
      baseAmount: baseCerrada,
      commissionPercent: comPctLiq,
      grossAmount: grossCerrada,
      bonusAmount: bonoC,
      deductionAmount: dedC,
      netAmount: netCerrada,
      notes: "demo-seed-liq-cerrada · liquidación cerrada de ejemplo (re-creado en cada db:seed)",
      status: SettlementStatus.cerrado,
      closedAt: addDays(now, -27),
      closedById: admin.id,
    },
  });
  console.log(
    JSON.stringify({
      seed: "transport-pro",
      liquidacionesDemo: 2,
      comisionAplicadaEnFilas: `${pctNum}%`,
      demoEmpresasClientes: demoEmpresas.length,
      demoEmpresasEnviosPendientes: 4,
      hint: "Recargá el admin (F5). En Envíos verás solicitudes de Distribuidora Austral, Importadora Pacífico, Retail Sur y Constructora Horizonte.",
    })
  );

  const invCount = await prisma.invoice.count({ where: { tenantId: tenant.id, number: "DEMO-00001" } });
  if (invCount === 0) {
    const taxRate = new Prisma.Decimal(12);
    const subtotal = new Prisma.Decimal(450000);
    const taxAmount = subtotal.mul(taxRate).div(new Prisma.Decimal(100));
    const total = subtotal.add(taxAmount);
    await prisma.invoice.create({
      data: {
        tenantId: tenant.id,
        customerId: customer.id,
        number: "DEMO-00001",
        taxRate,
        subtotal,
        taxAmount,
        total,
        notes: "Factura de demostración vinculada al envío Santiago–Valparaíso (montos alineados al seed).",
        lines: {
          create: [
            {
              description: "Servicio de transporte Santiago – Valparaíso",
              quantity: new Prisma.Decimal(1),
              unitPrice: subtotal,
              lineTotal: subtotal,
              shipmentId: shipment!.id,
            },
          ],
        },
      },
    });
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
