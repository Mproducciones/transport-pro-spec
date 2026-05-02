import { Prisma, PrismaClient, Role, ShipmentStatus, SubscriptionStatus, VehicleStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

type CompanySeed = {
  slug: string;
  tenantName: string;
  legalName: string;
  taxId: string;
  adminEmail: string;
};

const COMPANIES: CompanySeed[] = [
  {
    slug: "andescargo",
    tenantName: "Andes Cargo",
    legalName: "Andes Cargo SPA",
    taxId: "76010101-1",
    adminEmail: "adminandescargo@demo.com",
  },
  {
    slug: "patagoniaruta",
    tenantName: "Patagonia Ruta",
    legalName: "Patagonia Ruta SPA",
    taxId: "76020202-2",
    adminEmail: "adminpatagoniaruta@demo.com",
  },
];

const ADMIN_PASS = "Admin123!";
const CLIENT_PASS = "Cliente123!";
const DRIVER_PASS = "Conductor123!";

const ROUTES = [
  { origin: "Santiago Centro", destination: "Valparaiso Puerto" },
  { origin: "Rancagua Centro", destination: "Concepcion Terminal" },
  { origin: "La Serena Centro", destination: "Santiago Centro" },
  { origin: "Valparaiso Puerto", destination: "Rancagua Centro" },
];

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 3600000);
}

async function seedCompany(cfg: CompanySeed) {
  const tenant = await prisma.tenant.upsert({
    where: { slug: cfg.slug },
    update: { name: cfg.tenantName },
    create: {
      name: cfg.tenantName,
      slug: cfg.slug,
      company: {
        create: {
          legalName: cfg.legalName,
          taxId: cfg.taxId,
          address: `${cfg.tenantName} Oficina Central`,
          phone: "+56911111111",
        },
      },
    },
  });

  await prisma.company.updateMany({
    where: { tenantId: tenant.id },
    data: {
      legalName: cfg.legalName,
      taxId: cfg.taxId,
      accountStatus: "activa",
    },
  });

  await prisma.subscription.upsert({
    where: { tenantId: tenant.id },
    update: {
      status: SubscriptionStatus.active,
      plan: "pro",
      billingCycle: "monthly",
      billingAmount: new Prisma.Decimal(49),
      currentPeriodEnd: addHours(new Date(), 24 * 30),
    },
    create: {
      tenantId: tenant.id,
      status: SubscriptionStatus.active,
      plan: "pro",
      billingCycle: "monthly",
      billingAmount: new Prisma.Decimal(49),
      currentPeriodEnd: addHours(new Date(), 24 * 30),
    },
  });

  const adminHash = await bcrypt.hash(ADMIN_PASS, 10);
  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: cfg.adminEmail } },
    update: { role: Role.admin, passwordHash: adminHash },
    create: {
      tenantId: tenant.id,
      email: cfg.adminEmail,
      passwordHash: adminHash,
      role: Role.admin,
    },
  });

  const clients: Array<{ id: string; email: string; name: string }> = [];
  for (let i = 1; i <= 4; i++) {
    const email = `cliente${i}${cfg.slug}@demo.com`;
    const customer = await prisma.customer.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email } },
      update: { name: `Cliente ${i} ${cfg.tenantName}` },
      create: {
        tenantId: tenant.id,
        name: `Cliente ${i} ${cfg.tenantName}`,
        email,
        taxId: `${cfg.taxId.split("-")[0]}${i}`,
        phone: `+5692000000${i}`,
      },
    });
    const clientHash = await bcrypt.hash(CLIENT_PASS, 10);
    await prisma.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email } },
      update: { role: Role.cliente, customerId: customer.id, passwordHash: clientHash },
      create: {
        tenantId: tenant.id,
        email,
        passwordHash: clientHash,
        role: Role.cliente,
        customerId: customer.id,
      },
    });
    clients.push({ id: customer.id, email, name: customer.name });
  }

  const drivers: Array<{ id: string; email: string; fullName: string; vehicleId: string }> = [];
  for (let i = 1; i <= 6; i++) {
    const plate = `${cfg.slug.slice(0, 3).toUpperCase()}${100 + i}`;
    const vehicle = await prisma.vehicle.upsert({
      where: { tenantId_plate: { tenantId: tenant.id, plate } },
      update: { status: VehicleStatus.asignado },
      create: {
        tenantId: tenant.id,
        plate,
        kind: i % 2 === 0 ? "Camion" : "Furgon",
        status: VehicleStatus.asignado,
      },
    });
    const taxId = `${cfg.taxId.split("-")[0]}9${i}`;
    const driver = await prisma.driver.upsert({
      where: { tenantId_taxId: { tenantId: tenant.id, taxId } },
      update: { fullName: `Chofer ${i} ${cfg.tenantName}`, assignedVehicleId: vehicle.id },
      create: {
        tenantId: tenant.id,
        fullName: `Chofer ${i} ${cfg.tenantName}`,
        taxId,
        assignedVehicleId: vehicle.id,
      },
    });
    const email = `chofer${i}${cfg.slug}@demo.com`;
    const driverHash = await bcrypt.hash(DRIVER_PASS, 10);
    await prisma.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email } },
      update: { role: Role.conductor, driverId: driver.id, passwordHash: driverHash },
      create: {
        tenantId: tenant.id,
        email,
        passwordHash: driverHash,
        role: Role.conductor,
        driverId: driver.id,
      },
    });
    drivers.push({ id: driver.id, email, fullName: driver.fullName, vehicleId: vehicle.id });
  }

  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const c = clients[i % clients.length];
    const d = drivers[i % drivers.length];
    const r = ROUTES[i % ROUTES.length];
    const marker = `seedclean-${cfg.slug}-${i}`;
    const exists = await prisma.shipment.findFirst({
      where: { tenantId: tenant.id, cargoDescription: marker },
      select: { id: true },
    });
    if (exists) continue;

    const pickup = addHours(now, 4 + i * 3);
    const delivery = addHours(pickup, 4 + (i % 5));
    const pWinStart = addHours(pickup, -1);
    const pWinEnd = addHours(pickup, 1);
    const dWinStart = addHours(delivery, -1);
    const dWinEnd = addHours(delivery, 1);
    const amount = new Prisma.Decimal(120000 + i * 7000);

    await prisma.shipment.create({
      data: {
        tenantId: tenant.id,
        customerId: c.id,
        driverId: d.id,
        vehicleId: d.vehicleId,
        origin: r.origin,
        destination: r.destination,
        pickupAddress: r.origin,
        deliveryAddress: r.destination,
        cargoType: i % 2 === 0 ? "pallet" : "caja",
        cargoDescription: marker,
        amount,
        baseAmount: amount,
        helperSurcharge: new Prisma.Decimal(0),
        totalAmount: amount,
        scheduledPickup: pickup,
        scheduledDelivery: delivery,
        pickupWindowStart: pWinStart,
        pickupWindowEnd: pWinEnd,
        deliveryWindowStart: dWinStart,
        deliveryWindowEnd: dWinEnd,
        pickupNotes: "Llamar 20 min antes",
        deliveryNotes: "Entrega en recepcion principal",
        status: i % 3 === 0 ? ShipmentStatus.pendiente : ShipmentStatus.confirmado,
        paymentStatus: "pendiente",
      },
    });
  }

  return {
    slug: cfg.slug,
    admin: { email: cfg.adminEmail, password: ADMIN_PASS },
    clients: clients.map((c) => c.email),
    drivers: drivers.map((d) => d.email),
    passwords: { client: CLIENT_PASS, driver: DRIVER_PASS },
    pedidosConFecha: 12,
  };
}

async function main() {
  const result = [];
  for (const c of COMPANIES) {
    result.push(await seedCompany(c));
  }
  console.log(JSON.stringify({ ok: true, empresas: result }, null, 2));
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
