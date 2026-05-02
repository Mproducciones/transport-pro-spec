import { Prisma, PrismaClient, ShipmentStatus } from "@prisma/client";

const prisma = new PrismaClient();

function addHours(d: Date, h: number) {
  return new Date(d.getTime() + h * 3600000);
}

async function main() {
  const admin = await prisma.user.findFirst({
    where: { email: "admin@demo.com" },
    select: { id: true, tenantId: true },
  });
  if (!admin) throw new Error("No existe admin@demo.com");

  const tenantId = admin.tenantId;
  const customer = await prisma.customer.findFirst({
    where: { tenantId },
    select: { id: true },
  });
  if (!customer) throw new Error("No existe customer en tenant demo");
  const drivers = await prisma.driver.findMany({
    where: { tenantId, assignedVehicleId: { not: null } },
    include: { assignedVehicle: true },
    take: 6,
  });
  if (drivers.length === 0) throw new Error("No hay choferes con vehículo asignado en tenant demo");

  const existing = await prisma.shipment.findMany({
    where: { tenantId, cargoDescription: { startsWith: "demo-ui-" } },
    select: { id: true },
  });
  const ids = existing.map((x) => x.id);
  if (ids.length > 0) {
    await prisma.invoiceLine.updateMany({
      where: { shipmentId: { in: ids } },
      data: { shipmentId: null },
    });
    await prisma.payment.deleteMany({ where: { shipmentId: { in: ids } } });
    await prisma.shipmentStatusHistory.deleteMany({
      where: { shipmentId: { in: ids } },
    });
    await prisma.shipment.deleteMany({ where: { id: { in: ids } } });
  }

  const routes: Array<[string, string]> = [
    ["Santiago Centro", "Valparaíso Puerto"],
    ["Concepción Centro", "Temuco Centro"],
    ["La Serena Centro", "Copiapó Centro"],
    ["Antofagasta Norte", "Iquique Centro"],
  ];

  const now = new Date();
  for (let i = 0; i < 20; i++) {
    const status: ShipmentStatus =
      i < 6
        ? "pendiente"
        : i < 14
          ? "confirmado"
          : i < 17
            ? "recogido"
            : i < 19
              ? "en_transito"
              : "rechazado";
    const [origin, destination] = routes[i % routes.length];
    const pickup = i < 12 ? addHours(now, -3 + i) : addHours(now, 8 + i * 2);
    const delivery = addHours(pickup, 5 + (i % 3));
    const total = 120 + i * 15;
    const cargoQuantity = 1 + (i % 5);
    const cargoWeightKg = 350 + i * 45;
    const cargoVolumeM3 = Number((2.5 + i * 0.4).toFixed(2));
    const requiresHelper = i % 4 === 0;
    const helperSurcharge = requiresHelper ? 25 : 0;
    const assignee =
      status === "pendiente" || status === "rechazado" ? null : drivers[i % drivers.length];
    const paymentTerm =
      status === "pendiente"
        ? "delivery"
        : i % 3 === 0
          ? "upfront_full"
          : i % 3 === 1
            ? "upfront_partial"
            : "delivery";
    const upfront =
      paymentTerm === "upfront_full"
        ? total + helperSurcharge
        : paymentTerm === "upfront_partial"
          ? Math.round((total + helperSurcharge) * 0.5)
          : null;

    const s = await prisma.shipment.create({
      data: {
        tenantId,
        customerId: customer.id,
        origin,
        destination,
        pickupAddress: origin,
        deliveryAddress: destination,
        cargoType: "caja",
        cargoQuantity: new Prisma.Decimal(cargoQuantity),
        cargoWeightKg: new Prisma.Decimal(cargoWeightKg),
        cargoVolumeM3: new Prisma.Decimal(cargoVolumeM3),
        cargoDescription: `demo-ui-${i + 1}`,
        amount: status === "confirmado" ? new Prisma.Decimal(total) : null,
        baseAmount: status === "confirmado" ? new Prisma.Decimal(total) : null,
        requiresHelper,
        helperSurcharge: new Prisma.Decimal(helperSurcharge),
        totalAmount:
          status === "confirmado"
            ? new Prisma.Decimal(total + helperSurcharge)
            : null,
        status,
        paymentStatus: "pendiente",
        paymentTerm,
        upfrontPercent:
          paymentTerm === "upfront_partial" ? new Prisma.Decimal(50) : null,
        upfrontAmount: upfront !== null ? new Prisma.Decimal(upfront) : null,
        scheduledPickup: pickup,
        scheduledDelivery: delivery,
        pickupWindowStart: addHours(pickup, -1),
        pickupWindowEnd: addHours(pickup, 1),
        deliveryWindowStart: addHours(delivery, -1),
        deliveryWindowEnd: addHours(delivery, 1),
        pickupNotes: `Retiro con ${cargoQuantity} bultos, ${cargoWeightKg} kg, ${cargoVolumeM3} m3.`,
        deliveryNotes:
          status === "pendiente"
            ? "Solicitud en evaluacion de tarifa por admin."
            : "Cliente solicita entrega en puerta principal.",
        loadSequence:
          status === "confirmado" || status === "recogido" || status === "en_transito"
            ? (i % 4) + 1
            : null,
        unloadAccess:
          status === "confirmado" || status === "recogido" || status === "en_transito"
            ? i % 2 === 0
              ? "Muelle 2 · ventana 08:00–12:00"
              : "Puerta lateral · avisar conserjería"
            : null,
        approvedById: status !== "pendiente" ? admin.id : null,
        approvedAt: status !== "pendiente" ? addHours(now, -i) : null,
        driverId: assignee?.id ?? null,
        vehicleId: assignee?.assignedVehicleId ?? null,
        pickedUpAt:
          status === "recogido" || status === "en_transito"
            ? addHours(now, -1 - (i % 3))
            : null,
        enTransitoAt: status === "en_transito" ? addHours(now, -(i % 2)) : null,
        decisionNote:
          status === "confirmado"
            ? "Solicitud aprobada con monto y forma de pago."
            : status === "recogido"
              ? "Carga retirada por chofer asignado."
              : status === "en_transito"
                ? "Viaje en tránsito hacia destino."
            : status === "rechazado"
              ? "Solicitud rechazada por disponibilidad de flota."
              : null,
      },
    });

    await prisma.shipmentStatusHistory.create({
      data: {
        shipmentId: s.id,
        fromStatus: null,
        toStatus: "pendiente",
        note: "Solicitud demo creada",
        changedById: admin.id,
      },
    });
    if (status === "confirmado") {
      await prisma.shipmentStatusHistory.create({
        data: {
          shipmentId: s.id,
          fromStatus: "pendiente",
          toStatus: "confirmado",
          note: "Aprobada por admin (demo)",
          changedById: admin.id,
        },
      });
    }
    if (status === "recogido") {
      await prisma.shipmentStatusHistory.createMany({
        data: [
          {
            shipmentId: s.id,
            fromStatus: "pendiente",
            toStatus: "confirmado",
            note: "Aprobada por admin (demo)",
            changedById: admin.id,
          },
          {
            shipmentId: s.id,
            fromStatus: "confirmado",
            toStatus: "recogido",
            note: "Carga retirada por chofer",
            changedById: admin.id,
          },
        ],
      });
    }
    if (status === "en_transito") {
      await prisma.shipmentStatusHistory.createMany({
        data: [
          {
            shipmentId: s.id,
            fromStatus: "pendiente",
            toStatus: "confirmado",
            note: "Aprobada por admin (demo)",
            changedById: admin.id,
          },
          {
            shipmentId: s.id,
            fromStatus: "confirmado",
            toStatus: "recogido",
            note: "Carga retirada por chofer",
            changedById: admin.id,
          },
          {
            shipmentId: s.id,
            fromStatus: "recogido",
            toStatus: "en_transito",
            note: "En camino a destino",
            changedById: admin.id,
          },
        ],
      });
    }
    if (status === "rechazado") {
      await prisma.shipmentStatusHistory.create({
        data: {
          shipmentId: s.id,
          fromStatus: "pendiente",
          toStatus: "rechazado",
          note: "Rechazada por admin (demo)",
          changedById: admin.id,
        },
      });
    }
  }

  const confirmed = await prisma.shipment.findMany({
    where: {
      tenantId,
      cargoDescription: { startsWith: "demo-ui-" },
      status: "confirmado",
    },
    orderBy: { createdAt: "asc" },
    take: 6,
    select: { id: true, totalAmount: true, upfrontAmount: true },
  });

  for (let i = 0; i < confirmed.length; i++) {
    const sh = confirmed[i];
    let verificationStatus: "aprobado" | "pendiente" | "rechazado" = "pendiente";
    let verificationNote = "Comprobante en revision.";
    let paymentStatus: "pagado" | "parcial" | "pendiente" = "parcial";
    let amount = Number(sh.upfrontAmount ?? new Prisma.Decimal(50));
    let verifiedById: string | null = null;
    let verifiedAt: Date | null = null;

    if (i < 2) {
      verificationStatus = "aprobado";
      verificationNote = "Comprobante validado.";
      paymentStatus = "pagado";
      amount = Number(sh.upfrontAmount ?? sh.totalAmount ?? new Prisma.Decimal(50));
      verifiedById = admin.id;
      verifiedAt = new Date();
    } else if (i >= 4) {
      verificationStatus = "rechazado";
      verificationNote = "Comprobante no coincide con referencia.";
      paymentStatus = "pendiente";
      verifiedById = admin.id;
      verifiedAt = new Date();
    }

    await prisma.payment.create({
      data: {
        tenantId,
        shipmentId: sh.id,
        amount: new Prisma.Decimal(amount),
        method: "transferencia",
        reference: `DEMO-UI-PAGO-${i + 1}`,
        verificationStatus,
        verificationNote,
        verifiedById,
        verifiedAt,
        paidAt: new Date(),
        recordedById: admin.id,
      },
    });

    await prisma.shipment.update({
      where: { id: sh.id },
      data: { paymentStatus },
    });
  }

  const byStatus = await prisma.shipment.groupBy({
    by: ["status"],
    where: { tenantId, cargoDescription: { startsWith: "demo-ui-" } },
    _count: { _all: true },
  });
  const payments = await prisma.payment.groupBy({
    by: ["verificationStatus"],
    where: { tenantId, reference: { startsWith: "DEMO-UI-PAGO-" } },
    _count: { _all: true },
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        tenantId,
        demoShipments: 20,
        byStatus,
        payments,
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
