import { Router } from "express";
import { PaymentStatus, Prisma, ShipmentStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireRole.js";
import { asyncHandler } from "../lib/asyncHandler.js";

function csvEscape(s: string): string {
  const trimmed = s.trimStart();
  const formulaRisk = /^[=+\-@]/.test(trimmed);
  const safe = formulaRisk ? `'${s}` : s;
  if (/[",;\n]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`;
  return safe;
}

export const reportsRouter = Router();

reportsRouter.use(authenticate, requireRole("admin"));

reportsRouter.get(
  "/dashboard",
  asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;

    const startToday = new Date();
    startToday.setHours(0, 0, 0, 0);
    const startWeek = new Date();
    const weekday = startWeek.getDay();
    const diffToMonday = weekday === 0 ? 6 : weekday - 1;
    startWeek.setDate(startWeek.getDate() - diffToMonday);
    startWeek.setHours(0, 0, 0, 0);

    const [byStatus, ingresosMes, egresosMes, facturasVencer, rentabilidad, pendientesHoy, pendientesSemana, carteraRows] = await Promise.all([
      prisma.shipment.groupBy({
        by: ["status"],
        where: { tenantId },
        _count: { id: true },
      }),
      prisma.payment.aggregate({
        where: {
          tenantId,
          verificationStatus: "aprobado",
          paidAt: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        },
        _sum: { amount: true },
        _count: { id: true },
      }),
      prisma.expense.aggregate({
        where: {
          tenantId,
          recordedAt: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        },
        _sum: { amount: true },
        _count: { id: true },
      }),
      prisma.invoice.findMany({
        where: {
          tenantId,
          status: "emitida",
          dueDate: { lte: new Date(Date.now() + 7 * 86400000), gte: new Date() },
        },
        select: { id: true, number: true, dueDate: true, total: true, customer: { select: { name: true } } },
        take: 20,
      }),
      prisma.shipment.findMany({
        where: { tenantId },
        include: {
          customer: { select: { name: true } },
          expenses: { select: { amount: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
      prisma.payment.findMany({
        where: {
          tenantId,
          verificationStatus: "pendiente",
          paidAt: { gte: startToday },
        },
        include: {
          shipment: { select: { id: true, origin: true, destination: true, customer: { select: { name: true } } } },
        },
        orderBy: { paidAt: "desc" },
      }),
      prisma.payment.findMany({
        where: {
          tenantId,
          verificationStatus: "pendiente",
          paidAt: { gte: startWeek },
        },
        include: {
          shipment: { select: { id: true, origin: true, destination: true, customer: { select: { name: true } } } },
        },
        orderBy: { paidAt: "desc" },
      }),
      prisma.shipment.findMany({
        where: {
          tenantId,
          paymentStatus: { in: [PaymentStatus.pendiente, PaymentStatus.parcial] },
        },
        include: {
          customer: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    const carteraAgg =
      carteraRows.length > 0
        ? await prisma.payment.groupBy({
            by: ["shipmentId"],
            where: {
              tenantId,
              shipmentId: { in: carteraRows.map((s) => s.id) },
              verificationStatus: "aprobado",
            },
            _sum: { amount: true },
          })
        : [];
    const paidByShipment = new Map(
      carteraAgg
        .filter((x) => x.shipmentId)
        .map((x) => [x.shipmentId!, new Prisma.Decimal(x._sum.amount ?? 0)])
    );


    const statusMap = Object.fromEntries(
      Object.values(ShipmentStatus).map((s) => [s, 0])
    ) as Record<ShipmentStatus, number>;
    for (const row of byStatus) {
      statusMap[row.status] = row._count.id;
    }

    const deudores = carteraRows
      .map((s) => {
        const total = s.totalAmount ?? s.amount ?? new Prisma.Decimal(0);
        const paid = paidByShipment.get(s.id) ?? new Prisma.Decimal(0);
        const balance = total.sub(paid);
        return {
          shipmentId: s.id,
          customer: s.customer.name,
          route: `${s.origin} -> ${s.destination}`,
          requestedAt: s.createdAt,
          total: total.toString(),
          paid: paid.toString(),
          balance: (balance.gt(0) ? balance : new Prisma.Decimal(0)).toString(),
          paymentStatus: s.paymentStatus,
          /** Estado operativo del envío (etapa en terreno) para Inicio / cartera. */
          status: s.status,
        };
      })
      .filter((s) => Number(s.balance) > 0)
      .sort((a, b) => Number(b.balance) - Number(a.balance));
    const saldoPendiente = deudores.reduce((sum, s) => sum.add(new Prisma.Decimal(s.balance)), new Prisma.Decimal(0));

    res.json({
      success: true,
      data: {
        shipmentsByStatus: statusMap,
        cobrosPendientes: {
          sumaMontosEnvíos: saldoPendiente.toString(),
          sumaMontosEnvios: saldoPendiente.toString(),
          saldoPendiente: saldoPendiente.toString(),
          cantidadEnvíos: deudores.length,
          cantidadEnvios: deudores.length,
          deudores,
        },
        ingresosRegistradosMes: {
          total: ingresosMes._sum.amount?.toString() ?? "0",
          movimientos: ingresosMes._count.id,
          criterio: "pagos_aprobados",
        },
        egresosRegistradosMes: {
          total: egresosMes._sum.amount?.toString() ?? "0",
          movimientos: egresosMes._count.id,
        },
        utilidadOperativaMes: new Prisma.Decimal(ingresosMes._sum.amount ?? 0)
          .sub(new Prisma.Decimal(egresosMes._sum.amount ?? 0))
          .toString(),
        rentabilidadPorViaje: rentabilidad.map((s) => {
          const ingresos = s.totalAmount ?? s.amount ?? new Prisma.Decimal(0);
          const egresos = s.expenses.reduce((acc, e) => acc.add(e.amount), new Prisma.Decimal(0));
          return {
            shipmentId: s.id,
            customer: s.customer.name,
            route: `${s.origin} -> ${s.destination}`,
            ingresos: ingresos.toString(),
            egresos: egresos.toString(),
            utilidad: ingresos.sub(egresos).toString(),
            status: s.status,
          };
        }),
        comprobantesPendientes: {
          hoy: {
            total: pendientesHoy.length,
            rows: pendientesHoy.map((p) => ({
              id: p.id,
              amount: p.amount.toString(),
              reference: p.reference ?? "",
              paidAt: p.paidAt,
              shipment: p.shipment
                ? {
                    id: p.shipment.id,
                    route: `${p.shipment.origin} -> ${p.shipment.destination}`,
                    customer: p.shipment.customer.name,
                  }
                : null,
            })),
          },
          semana: {
            total: pendientesSemana.length,
            rows: pendientesSemana.map((p) => ({
              id: p.id,
              amount: p.amount.toString(),
              reference: p.reference ?? "",
              paidAt: p.paidAt,
              shipment: p.shipment
                ? {
                    id: p.shipment.id,
                    route: `${p.shipment.origin} -> ${p.shipment.destination}`,
                    customer: p.shipment.customer.name,
                  }
                : null,
            })),
          },
        },
        facturasProximasVencer: facturasVencer,
      },
    });
  })
);

reportsRouter.get(
  "/shipments.csv",
  asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;
    const rows = await prisma.shipment.findMany({
      where: { tenantId },
      include: {
        customer: { select: { name: true } },
        driver: { select: { fullName: true } },
        vehicle: { select: { plate: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const header = [
      "id",
      "cliente",
      "origen",
      "destino",
      "estado",
      "cobro_envio",
      "monto_base",
      "recargo_peoneta",
      "monto_total",
      "tipo_carga",
      "requiere_peoneta",
      "quien_recibe",
      "conductor",
      "vehiculo",
      "creado",
    ];
    const lines = [
      header.join(";"),
      ...rows.map((r) =>
        [
          r.id,
          r.customer.name,
          r.origin,
          r.destination,
          r.status,
          r.paymentStatus,
          r.baseAmount?.toString() ?? r.amount?.toString() ?? "",
          r.helperSurcharge?.toString() ?? "",
          r.totalAmount?.toString() ?? r.amount?.toString() ?? "",
          r.cargoType ?? "",
          r.requiresHelper ? "si" : "no",
          r.deliveredToName ?? "",
          r.driver?.fullName ?? "",
          r.vehicle?.plate ?? "",
          r.createdAt.toISOString(),
        ].map((c) => csvEscape(String(c))).join(";")
      ),
    ];
    const csv = lines.join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="envios.csv"');
    res.send("\uFEFF" + csv);
  })
);

reportsRouter.get(
  "/invoices.csv",
  asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;
    const rows = await prisma.invoice.findMany({
      where: { tenantId },
      include: { customer: { select: { name: true } } },
      orderBy: { issueDate: "desc" },
    });

    const header = ["numero", "cliente", "estado", "subtotal", "iva", "total", "emision", "vencimiento"];
    const lines = [
      header.join(";"),
      ...rows.map((r) =>
        [
          r.number,
          r.customer.name,
          r.status,
          r.subtotal.toString(),
          r.taxAmount.toString(),
          r.total.toString(),
          r.issueDate.toISOString(),
          r.dueDate?.toISOString() ?? "",
        ].join(";")
      ),
    ];
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="facturas.csv"');
    res.send("\uFEFF" + lines.join("\n"));
  })
);

reportsRouter.get(
  "/expenses.csv",
  asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;
    const rows = await prisma.expense.findMany({
      where: { tenantId },
      include: {
        shipment: { select: { origin: true, destination: true, customer: { select: { name: true } } } },
      },
      orderBy: { recordedAt: "desc" },
    });

    const header = ["id", "cliente", "ruta", "categoria", "monto", "nota", "fecha"];
    const lines = [
      header.join(";"),
      ...rows.map((r) =>
        [
          r.id,
          r.shipment.customer.name,
          `${r.shipment.origin} -> ${r.shipment.destination}`,
          r.category,
          r.amount.toString(),
          r.note ?? "",
          r.recordedAt.toISOString(),
        ].map((c) => csvEscape(String(c))).join(";")
      ),
    ];
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="egresos.csv"');
    res.send("\uFEFF" + lines.join("\n"));
  })
);

reportsRouter.get(
  "/payments.csv",
  asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;
    const rows = await prisma.payment.findMany({
      where: { tenantId },
      include: {
        invoice: { select: { number: true, customer: { select: { name: true } } } },
        shipment: { select: { origin: true, destination: true, customer: { select: { name: true } } } },
        recordedBy: { select: { email: true } },
        verifiedBy: { select: { email: true } },
      },
      orderBy: { paidAt: "desc" },
    });

    const header = [
      "id",
      "fecha_pago",
      "monto",
      "metodo",
      "estado_validacion",
      "cliente",
      "factura",
      "envio",
      "referencia",
      "registrado_por",
      "validado_por",
      "validado_en",
    ];
    const lines = [
      header.join(";"),
      ...rows.map((r) => {
        const customer = r.invoice?.customer.name ?? r.shipment?.customer.name ?? "";
        const route = r.shipment ? `${r.shipment.origin} -> ${r.shipment.destination}` : "";
        return [
          r.id,
          r.paidAt.toISOString(),
          r.amount.toString(),
          r.method,
          r.verificationStatus,
          customer,
          r.invoice?.number ?? "",
          route,
          r.reference ?? "",
          r.recordedBy.email,
          r.verifiedBy?.email ?? "",
          r.verifiedAt?.toISOString() ?? "",
        ].map((c) => csvEscape(String(c))).join(";");
      }),
    ];

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="pagos.csv"');
    res.send("\uFEFF" + lines.join("\n"));
  })
);

reportsRouter.get(
  "/audit-decisions",
  asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;
    const rows = await prisma.shipment.findMany({
      where: {
        tenantId,
        OR: [{ status: "confirmado" }, { status: "rechazado" }, { approvedById: { not: null } }],
      },
      include: {
        customer: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, email: true, role: true } },
        statusHistory: {
          orderBy: { createdAt: "asc" },
          include: { changedBy: { select: { id: true, email: true, role: true } } },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    });

    res.json({
      success: true,
      data: rows.map((s) => ({
        shipmentId: s.id,
        route: `${s.origin} -> ${s.destination}`,
        customer: s.customer.name,
        status: s.status,
        approvedAt: s.approvedAt,
        decisionNote: s.decisionNote,
        approvedBy: s.approvedBy,
        history: s.statusHistory.map((h) => ({
          id: h.id,
          from: h.fromStatus,
          to: h.toStatus,
          note: h.note,
          at: h.createdAt,
          by: h.changedBy,
        })),
      })),
    });
  })
);

reportsRouter.get(
  "/profitability",
  asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;
    const startOfYear = new Date(new Date().getFullYear(), 0, 1);

    const [shipments, paymentsByShipment, monthlyIncome, monthlyExpense] = await Promise.all([
      prisma.shipment.findMany({
        where: { tenantId },
        include: { customer: { select: { name: true } }, expenses: { select: { amount: true } } },
        orderBy: { createdAt: "desc" },
        take: 250,
      }),
      prisma.payment.groupBy({
        by: ["shipmentId"],
        where: { tenantId, shipmentId: { not: null }, verificationStatus: "aprobado" },
        _sum: { amount: true },
      }),
      prisma.payment.findMany({
        where: { tenantId, verificationStatus: "aprobado", paidAt: { gte: startOfYear } },
        select: { amount: true, paidAt: true },
      }),
      prisma.expense.findMany({
        where: { tenantId, recordedAt: { gte: startOfYear } },
        select: { amount: true, recordedAt: true },
      }),
    ]);

    const paidMap = new Map(
      paymentsByShipment.filter((x) => x.shipmentId).map((x) => [x.shipmentId!, new Prisma.Decimal(x._sum.amount ?? 0)])
    );
    const byTrip = shipments.map((s) => {
      const ingresoObjetivo = s.totalAmount ?? s.amount ?? new Prisma.Decimal(0);
      const ingresoCobrado = paidMap.get(s.id) ?? new Prisma.Decimal(0);
      const egreso = s.expenses.reduce((acc, e) => acc.add(e.amount), new Prisma.Decimal(0));
      return {
        shipmentId: s.id,
        customer: s.customer.name,
        route: `${s.origin} -> ${s.destination}`,
        status: s.status,
        ingresoObjetivo: ingresoObjetivo.toString(),
        ingresoCobrado: ingresoCobrado.toString(),
        egreso: egreso.toString(),
        utilidadObjetivo: ingresoObjetivo.sub(egreso).toString(),
        utilidadReal: ingresoCobrado.sub(egreso).toString(),
        createdAt: s.createdAt,
      };
    });

    const monthKeys = new Set<string>();
    for (const p of monthlyIncome) monthKeys.add(`${p.paidAt.getFullYear()}-${String(p.paidAt.getMonth() + 1).padStart(2, "0")}`);
    for (const e of monthlyExpense) monthKeys.add(`${e.recordedAt.getFullYear()}-${String(e.recordedAt.getMonth() + 1).padStart(2, "0")}`);
    const sortedMonths = [...monthKeys].sort();
    const byMonth = sortedMonths.map((key) => {
      const [year, month] = key.split("-").map(Number);
      const income = monthlyIncome
        .filter((p) => p.paidAt.getFullYear() === year && p.paidAt.getMonth() + 1 === month)
        .reduce((acc, p) => acc.add(p.amount), new Prisma.Decimal(0));
      const expense = monthlyExpense
        .filter((e) => e.recordedAt.getFullYear() === year && e.recordedAt.getMonth() + 1 === month)
        .reduce((acc, e) => acc.add(e.amount), new Prisma.Decimal(0));
      return {
        month: key,
        ingresos: income.toString(),
        egresos: expense.toString(),
        utilidad: income.sub(expense).toString(),
      };
    });

    res.json({ success: true, data: { byTrip, byMonth } });
  })
);
