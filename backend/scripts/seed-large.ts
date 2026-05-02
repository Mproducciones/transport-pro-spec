import { Prisma, PrismaClient, Role, ShipmentStatus, SubscriptionStatus, VehicleStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const TENANTS = 10;
const CUSTOMERS_PER_TENANT = 10;
const DRIVERS_PER_TENANT = 5;
const SHIPMENTS_PER_TENANT = 20;

const CITIES = [
  { name: "Santiago", lat: -33.4489, lng: -70.6693 },
  { name: "Valparaíso", lat: -33.0472, lng: -71.6127 },
  { name: "Rancagua", lat: -34.1708, lng: -70.7444 },
  { name: "Concepción", lat: -36.8201, lng: -73.0444 },
  { name: "La Serena", lat: -29.9045, lng: -71.2489 },
];

function pickCity(i: number) {
  return CITIES[i % CITIES.length];
}

async function seedTenant(t: number) {
  const slug = `empresa-${String(t).padStart(2, "0")}`;
  const tenantName = `Empresa Transporte ${t}`;
  const adminEmail = `admin.${slug}@demo.com`;
  const adminPass = "Admin123!";
  const adminHash = await bcrypt.hash(adminPass, 10);

  const tenant = await prisma.tenant.upsert({
    where: { slug },
    update: { name: tenantName },
    create: {
      name: tenantName,
      slug,
      company: {
        create: {
          legalName: `${tenantName} SpA`,
          taxId: `76000${String(t).padStart(4, "0")}-K`,
          address: `Sucursal ${t}, Santiago`,
        },
      },
    },
  });

  await prisma.subscription.upsert({
    where: { tenantId: tenant.id },
    update: { status: SubscriptionStatus.active, plan: "pro" },
    create: {
      tenantId: tenant.id,
      status: SubscriptionStatus.active,
      plan: "pro",
      billingCycle: t % 2 === 0 ? "annual" : "monthly",
      billingAmount: new Prisma.Decimal(t % 2 === 0 ? 490 : 49),
    },
  });

  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: adminEmail } },
    update: { role: Role.admin, passwordHash: adminHash },
    create: { tenantId: tenant.id, email: adminEmail, passwordHash: adminHash, role: Role.admin },
  });
  const adminUser = await prisma.user.findUniqueOrThrow({
    where: { tenantId_email: { tenantId: tenant.id, email: adminEmail } },
    select: { id: true },
  });

  const customers: string[] = [];
  for (let c = 1; c <= CUSTOMERS_PER_TENANT; c++) {
    const email = `cliente${c}.${slug}@demo.com`;
    const cust = await prisma.customer.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email } },
      update: { name: `Cliente ${c} ${tenantName}` },
      create: {
        tenantId: tenant.id,
        name: `Cliente ${c} ${tenantName}`,
        email,
        taxId: `77${String(t).padStart(2, "0")}${String(c).padStart(7, "0")}-K`,
      },
    });
    const pass = await bcrypt.hash("Cliente123!", 10);
    await prisma.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email } },
      update: { role: Role.cliente, customerId: cust.id, passwordHash: pass },
      create: { tenantId: tenant.id, email, role: Role.cliente, customerId: cust.id, passwordHash: pass },
    });
    customers.push(cust.id);
  }

  const drivers: Array<{ id: string; vehicleId: string }> = [];
  for (let d = 1; d <= DRIVERS_PER_TENANT; d++) {
    const plate = `${slug.substring(0, 3).toUpperCase()}-${t}${d}0${d}`;
    const vehicle = await prisma.vehicle.upsert({
      where: { tenantId_plate: { tenantId: tenant.id, plate } },
      update: { status: VehicleStatus.asignado },
      create: {
        tenantId: tenant.id,
        plate,
        kind: d % 2 === 0 ? "Camión" : "Furgón",
        status: VehicleStatus.asignado,
      },
    });
    const taxId = `18${String(t).padStart(2, "0")}${String(d).padStart(7, "0")}-K`;
    const driver = await prisma.driver.upsert({
      where: { tenantId_taxId: { tenantId: tenant.id, taxId } },
      update: { fullName: `Chofer ${d} ${tenantName}`, assignedVehicleId: vehicle.id },
      create: {
        tenantId: tenant.id,
        fullName: `Chofer ${d} ${tenantName}`,
        taxId,
        assignedVehicleId: vehicle.id,
      },
    });
    const email = `chofer${d}.${slug}@demo.com`;
    const pass = await bcrypt.hash("Conductor123!", 10);
    await prisma.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email } },
      update: { role: Role.conductor, driverId: driver.id, passwordHash: pass },
      create: { tenantId: tenant.id, email, role: Role.conductor, driverId: driver.id, passwordHash: pass },
    });
    drivers.push({ id: driver.id, vehicleId: vehicle.id });
  }

  for (let s = 1; s <= SHIPMENTS_PER_TENANT; s++) {
    const customerId = customers[s % customers.length];
    const assignee = drivers[s % drivers.length];
    const origin = pickCity(t + s);
    const destination = pickCity(t + s + 2);
    const marker = `seed-large-${slug}-s${s}`;
    const exists = await prisma.shipment.findFirst({
      where: { tenantId: tenant.id, cargoDescription: marker },
      select: { id: true },
    });
    if (exists) continue;

    const base = new Prisma.Decimal(150000 + s * 7000 + t * 2500);
    const helper = s % 3 === 0 ? new Prisma.Decimal(25000) : new Prisma.Decimal(0);
    const total = base.add(helper);
    const status: ShipmentStatus =
      s % 6 === 0 ? "entregado" : s % 5 === 0 ? "en_transito" : s % 4 === 0 ? "confirmado" : "pendiente";
    const scheduledPickup = new Date(Date.now() + (s + 1) * 3600 * 1000);
    const scheduledDelivery = new Date(scheduledPickup.getTime() + (6 + (s % 4)) * 3600 * 1000);

    const shipment = await prisma.shipment.create({
      data: {
        tenantId: tenant.id,
        customerId,
        driverId: assignee.id,
        vehicleId: assignee.vehicleId,
        origin: origin.name,
        originLat: new Prisma.Decimal(origin.lat),
        originLng: new Prisma.Decimal(origin.lng),
        destination: destination.name,
        destinationLat: new Prisma.Decimal(destination.lat),
        destinationLng: new Prisma.Decimal(destination.lng),
        cargoType: s % 2 === 0 ? "pallet" : "contenedor",
        cargoQuantity: new Prisma.Decimal(1 + (s % 5)),
        cargoWeightKg: new Prisma.Decimal(200 + s * 17),
        cargoVolumeM3: new Prisma.Decimal(2 + (s % 7) * 0.5),
        cargoDescription: marker,
        amount: base,
        baseAmount: base,
        requiresHelper: s % 3 === 0,
        helperSurcharge: helper,
        totalAmount: total,
        scheduledPickup,
        scheduledDelivery,
        status,
        paymentStatus: status === "entregado" ? "pagado" : s % 2 === 0 ? "parcial" : "pendiente",
      },
    });

    await prisma.shipmentStatusHistory.create({
      data: {
        shipmentId: shipment.id,
        fromStatus: null,
        toStatus: "pendiente",
        note: "Creado por seed masivo",
        changedById: adminUser.id,
      },
    });
  }

  return {
    slug,
    adminEmail,
    adminPass,
    customers: CUSTOMERS_PER_TENANT,
    drivers: DRIVERS_PER_TENANT,
    shipments: SHIPMENTS_PER_TENANT,
  };
}

async function main() {
  const out = [];
  for (let t = 1; t <= TENANTS; t++) {
    out.push(await seedTenant(t));
  }
  console.log(
    JSON.stringify(
      {
        ok: true,
        totals: {
          tenants: TENANTS,
          customers: TENANTS * CUSTOMERS_PER_TENANT,
          drivers: TENANTS * DRIVERS_PER_TENANT,
          shipments: TENANTS * SHIPMENTS_PER_TENANT,
        },
        accounts: out.slice(0, 3),
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
