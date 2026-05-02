import { Prisma, PrismaClient, Role, ShipmentStatus, SubscriptionStatus, VehicleStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function rutFromBody(body: number): string {
  const digits = String(body);
  let sum = 0;
  let m = 2;
  for (let i = digits.length - 1; i >= 0; i--) {
    sum += Number(digits[i]) * m;
    m = m === 7 ? 2 : m + 1;
  }
  const r = 11 - (sum % 11);
  const dv = r === 11 ? "0" : r === 10 ? "K" : String(r);
  return `${digits}-${dv}`;
}

async function createCompany(companyIndex: number) {
  const slug = companyIndex === 1 ? "transportes-andes" : "logistica-patagonia";
  const tenantName = companyIndex === 1 ? "Transportes Andes" : "Logística Patagonia";
  const legalName = `${tenantName} SpA`;
  const companyRut = rutFromBody(76000000 + companyIndex * 137);
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
          legalName,
          taxId: companyRut,
          address: `Sucursal ${companyIndex} - Santiago`,
          phone: `+56 9 7000 00${companyIndex}`,
        },
      },
    },
    include: { company: true },
  });

  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: adminEmail } },
    update: { passwordHash: adminHash, role: Role.admin },
    create: { tenantId: tenant.id, email: adminEmail, passwordHash: adminHash, role: Role.admin },
  });

  await prisma.subscription.upsert({
    where: { tenantId: tenant.id },
    update: {
      status: SubscriptionStatus.active,
      plan: "pro",
      billingCycle: companyIndex === 1 ? "monthly" : "annual",
      billingAmount: new Prisma.Decimal(companyIndex === 1 ? 49 : 490),
      currentPeriodEnd: new Date(Date.now() + (companyIndex === 1 ? 30 : 365) * 86400000),
    },
    create: {
      tenantId: tenant.id,
      status: SubscriptionStatus.active,
      plan: "pro",
      billingCycle: companyIndex === 1 ? "monthly" : "annual",
      billingAmount: new Prisma.Decimal(companyIndex === 1 ? 49 : 490),
      currentPeriodEnd: new Date(Date.now() + (companyIndex === 1 ? 30 : 365) * 86400000),
    },
  });

  const customers: Array<{ id: string; name: string; email: string }> = [];
  for (let i = 1; i <= 3; i++) {
    const email = `cliente${i}.${slug}@demo.com`;
    const passwordHash = await bcrypt.hash("Cliente123!", 10);
    const c = await prisma.customer.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email } },
      update: {},
      create: {
        tenantId: tenant.id,
        name: `Cliente ${i} ${tenantName}`,
        email,
        taxId: rutFromBody(76100000 + companyIndex * 500 + i * 73),
      },
    });
    await prisma.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email } },
      update: { role: Role.cliente, customerId: c.id, passwordHash },
      create: { tenantId: tenant.id, email, role: Role.cliente, customerId: c.id, passwordHash },
    });
    customers.push({ id: c.id, name: c.name, email });
  }

  const drivers: Array<{ id: string; fullName: string; vehicleId: string }> = [];
  for (let i = 1; i <= 5; i++) {
    const plate = `${companyIndex === 1 ? "AND" : "PAT"}-${100 + i}`;
    const vehicle = await prisma.vehicle.upsert({
      where: { tenantId_plate: { tenantId: tenant.id, plate } },
      update: { status: VehicleStatus.disponible },
      create: {
        tenantId: tenant.id,
        plate,
        kind: i % 2 === 0 ? "Camión 10t" : "Furgón",
        status: VehicleStatus.disponible,
      },
    });
    const driverEmail = `chofer${i}.${slug}@demo.com`;
    const driverPassHash = await bcrypt.hash("Conductor123!", 10);
    const driver = await prisma.driver.upsert({
      where: { tenantId_taxId: { tenantId: tenant.id, taxId: rutFromBody(76200000 + companyIndex * 500 + i * 59) } },
      update: { assignedVehicleId: vehicle.id },
      create: {
        tenantId: tenant.id,
        fullName: `Chofer ${i} ${tenantName}`,
        taxId: rutFromBody(76200000 + companyIndex * 500 + i * 59),
        licenseNumber: `LIC-${companyIndex}${i}23`,
        assignedVehicleId: vehicle.id,
      },
    });
    await prisma.vehicle.update({ where: { id: vehicle.id }, data: { status: VehicleStatus.asignado } });
    await prisma.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: driverEmail } },
      update: { role: Role.conductor, driverId: driver.id, passwordHash: driverPassHash },
      create: {
        tenantId: tenant.id,
        email: driverEmail,
        role: Role.conductor,
        driverId: driver.id,
        passwordHash: driverPassHash,
      },
    });
    drivers.push({ id: driver.id, fullName: driver.fullName, vehicleId: vehicle.id });
  }

  for (let i = 1; i <= 8; i++) {
    const customer = customers[(i - 1) % customers.length];
    const driver = drivers[(i - 1) % drivers.length];
    const origin = i % 2 === 0 ? "Santiago" : "Valparaíso";
    const destination = i % 3 === 0 ? "Rancagua" : "Concepción";
    const amount = new Prisma.Decimal(220000 + i * 18000);
    const scheduledPickup = new Date(Date.now() + (i + 2) * 7200 * 1000);
    const scheduledDelivery = new Date(scheduledPickup.getTime() + 10 * 3600 * 1000);
    const existing = await prisma.shipment.findFirst({
      where: { tenantId: tenant.id, customerId: customer.id, origin, destination },
    });
    if (!existing) {
      await prisma.shipment.create({
        data: {
          tenantId: tenant.id,
          customerId: customer.id,
          driverId: driver.id,
          vehicleId: driver.vehicleId,
          origin,
          destination,
          pickupAddress: origin,
          deliveryAddress: destination,
          cargoType: i % 2 === 0 ? "pallet" : "contenedor",
          cargoQuantity: new Prisma.Decimal(i + 1),
          cargoWeightKg: new Prisma.Decimal(300 + i * 40),
          cargoVolumeM3: new Prisma.Decimal(2.5 + i * 0.2),
          cargoDescription: i % 2 === 0 ? "Retiro de pallets" : "Entrega de contenedor",
          amount,
          baseAmount: amount,
          requiresHelper: i % 3 === 0,
          helperSurcharge: new Prisma.Decimal(i % 3 === 0 ? 25000 : 0),
          totalAmount: amount.add(new Prisma.Decimal(i % 3 === 0 ? 25000 : 0)),
          scheduledPickup,
          scheduledDelivery,
          status: i % 4 === 0 ? ShipmentStatus.confirmado : ShipmentStatus.pendiente,
          paymentStatus: "pendiente",
        },
      });
    }
  }

  return { slug, tenantName, companyRut, adminEmail, adminPass };
}

async function main() {
  const c1 = await createCompany(1);
  const c2 = await createCompany(2);
  console.log("Empresas de prueba listas:");
  console.log(JSON.stringify([c1, c2], null, 2));
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

