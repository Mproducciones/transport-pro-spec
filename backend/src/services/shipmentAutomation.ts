import { AttachmentKind, Prisma, ShipmentStatus, type PaymentTerm } from "@prisma/client";
import { ApiError } from "../lib/apiError.js";

export type ReadinessItem = {
  id: string;
  label: string;
  ok: boolean;
  detail?: string;
};

/** Misma lógica que el chofer al marcar recogido: pago/anticipo según modalidad. */
export async function assertUpfrontSatisfiedForRecogido(
  tx: Prisma.TransactionClient,
  row: {
    id: string;
    paymentTerm: PaymentTerm;
    totalAmount: Prisma.Decimal | null;
    amount: Prisma.Decimal | null;
    upfrontAmount: Prisma.Decimal | null;
  }
): Promise<void> {
  const target = row.totalAmount ?? row.amount ?? new Prisma.Decimal(0);
  const agg = await tx.payment.aggregate({
    where: { shipmentId: row.id, verificationStatus: "aprobado" },
    _sum: { amount: true },
  });
  const paid = agg._sum.amount ?? new Prisma.Decimal(0);
  if (row.paymentTerm === "upfront_full" && target.gt(0) && paid.lt(target)) {
    throw new ApiError(400, "Este servicio requiere pago completo aprobado antes de iniciar el retiro.", "UPFRONT_FULL_REQUIRED");
  }
  if (row.paymentTerm === "upfront_partial") {
    const upfrontRequired = row.upfrontAmount ?? new Prisma.Decimal(0);
    if (upfrontRequired.gt(0) && paid.lt(upfrontRequired)) {
      throw new ApiError(
        400,
        `Anticipo mínimo aprobado: ${upfrontRequired.toString()} antes de marcar recogido.`,
        "UPFRONT_PARTIAL_REQUIRED"
      );
    }
  }
}

/**
 * Cierre: receptor obligatorio; constancia mínima (nota, URL o al menos un adjunto tipo entrega).
 */
export async function assertEntregadoPayload(
  tx: Prisma.TransactionClient,
  row: { id: string; deliveredToName: string | null; deliveryEvidence: string | null },
  body: { deliveredToName?: string; deliveryEvidence?: string }
): Promise<void> {
  const name = (body.deliveredToName?.trim() || row.deliveredToName?.trim() || "").trim();
  if (name.length < 2) {
    throw new ApiError(400, "Indique quién recibió la carga (nombre o responsable en destino).", "DELIVERY_RECEIVER_REQUIRED");
  }
  const ev = (body.deliveryEvidence?.trim() || row.deliveryEvidence?.trim() || "").trim();
  if (ev.length >= 3) return;
  const n = await tx.shipmentAttachment.count({
    where: { shipmentId: row.id, kind: { in: [AttachmentKind.delivery_photo, AttachmentKind.delivery_signature] } },
  });
  if (n < 1) {
    throw new ApiError(
      400,
      "Agregue referencia de entrega o suba al menos un comprobante (foto o firma) en el envío.",
      "DELIVERY_PROOF_REQUIRED"
    );
  }
}

export function assertConductorRecogidoPickupWindow(
  row: { scheduledPickup: Date | null },
  now: Date = new Date()
): void {
  if (row.scheduledPickup && now < row.scheduledPickup) {
    throw new ApiError(
      400,
      `Recogida habilitada desde ${row.scheduledPickup.toISOString()}`,
      "CHECKIN_NOT_IN_PICKUP_WINDOW"
    );
  }
}

type RowForReadiness = {
  id: string;
  status: ShipmentStatus;
  paymentTerm: PaymentTerm;
  totalAmount: Prisma.Decimal | null;
  amount: Prisma.Decimal | null;
  upfrontAmount: Prisma.Decimal | null;
  scheduledPickup: Date;
  scheduledDelivery: Date;
  driverId: string | null;
  vehicleId: string | null;
  deliveredToName: string | null;
  deliveryEvidence: string | null;
  pickedUpAt: Date | null;
  enTransitoAt: Date | null;
  deliveredAt: Date | null;
};

export function computeReadiness(
  s: RowForReadiness,
  params: { paidApproved: Prisma.Decimal; deliveryAttachmentCount: number }
): { items: ReadinessItem[]; canConfirm: boolean; canRecoger: boolean; canEntregado: boolean } {
  const target = s.totalAmount ?? s.amount ?? new Prisma.Decimal(0);
  const items: ReadinessItem[] = [];

  const schedOk = Boolean(s.scheduledPickup && s.scheduledDelivery) && s.scheduledDelivery.getTime() >= s.scheduledPickup.getTime();
  items.push({
    id: "schedule",
    label: "Fechas de retiro y entrega definidas y coherentes",
    ok: schedOk,
  });

  const teamOk = Boolean(s.driverId && s.vehicleId);
  items.push({ id: "team", label: "Conductor y vehículo asignados", ok: teamOk, detail: teamOk ? undefined : "Faltan asignaciones" });

  const amountOk = target.gt(0);
  items.push({ id: "amount", label: "Monto del servicio definido (precio a cobrar)", ok: amountOk });

  const agg = params.paidApproved;
  let upfrontForConfirmOk = true;
  if (s.paymentTerm === "upfront_full" && target.gt(0)) {
    upfrontForConfirmOk = agg.gte(target);
  } else if (s.paymentTerm === "upfront_partial") {
    const up = s.upfrontAmount ?? new Prisma.Decimal(0);
    upfrontForConfirmOk = up.lte(0) || agg.gte(up);
  }
  items.push({
    id: "upfront_confirm",
    label: "Modalidad de pago: listo para confirmar (anticipos aprobados si aplica)",
    ok: upfrontForConfirmOk,
    detail: s.paymentTerm === "delivery" ? "Pago contra entrega: sin anticipo exigido al confirmar" : undefined,
  });

  const upfrontForRecogerOk = (() => {
    if (s.paymentTerm === "upfront_full" && target.gt(0)) return agg.gte(target);
    if (s.paymentTerm === "upfront_partial") {
      const up = s.upfrontAmount ?? new Prisma.Decimal(0);
      return up.lte(0) || agg.gte(up);
    }
    return true;
  })();
  items.push({
    id: "upfront_recoger",
    label: "Misma regla: listo para marcar recogida (carga a bordo)",
    ok: upfrontForRecogerOk,
  });

  const podLike =
    Boolean((s.deliveryEvidence?.trim() || "").length >= 3) || params.deliveryAttachmentCount > 0;
  const hasReceiver = Boolean(s.deliveredToName && s.deliveredToName.trim().length >= 2);
  const podBundleOk = hasReceiver && podLike;
  items.push({
    id: "pod",
    label: "Entrega: receptor y constancia (texto, URL o adjunto de entrega)",
    ok: podBundleOk,
    detail:
      s.status === ShipmentStatus.entregado || s.deliveredAt
        ? "Servicio entregado"
        : s.status === ShipmentStatus.en_transito
          ? "Completar al cierre"
          : undefined,
  });

  const canConfirm = s.status === ShipmentStatus.pendiente && schedOk && teamOk && amountOk && upfrontForConfirmOk;
  const canRecoger = s.status === ShipmentStatus.confirmado && upfrontForRecogerOk;
  const canEntregado = s.status === ShipmentStatus.en_transito;

  return { items, canConfirm, canRecoger, canEntregado };
}
