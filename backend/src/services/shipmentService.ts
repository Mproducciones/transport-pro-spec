import type { PaymentTerm, Role, ShipmentRejectionPhase } from "@prisma/client";
import { ShipmentStatus } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../lib/apiError.js";

/** Exige comprobantes aprobados antes de pasar a confirmado si la modalidad no es pago contra entrega. */
export async function assertUpfrontSatisfiedForConfirmado(
  tx: Prisma.TransactionClient,
  row: {
    id: string;
    paymentTerm: PaymentTerm;
    totalAmount: Prisma.Decimal | null;
    amount: Prisma.Decimal | null;
    upfrontAmount: Prisma.Decimal | null;
  }
): Promise<void> {
  if (row.paymentTerm === "delivery") return;

  const target = row.totalAmount ?? row.amount ?? new Prisma.Decimal(0);
  const agg = await tx.payment.aggregate({
    where: { shipmentId: row.id, verificationStatus: "aprobado" },
    _sum: { amount: true },
  });
  const paid = agg._sum.amount ?? new Prisma.Decimal(0);

  if (row.paymentTerm === "upfront_full" && target.gt(0) && paid.lt(target)) {
    throw new ApiError(
      400,
      "Para confirmar el servicio el cliente debe tener el pago total aprobado (revise y apruebe comprobantes).",
      "CONFIRM_REQUIRES_FULL_PAYMENT"
    );
  }
  if (row.paymentTerm === "upfront_partial") {
    const upfrontRequired = row.upfrontAmount ?? new Prisma.Decimal(0);
    if (upfrontRequired.gt(0) && paid.lt(upfrontRequired)) {
      throw new ApiError(
        400,
        `Para confirmar el servicio el anticipo aprobado debe ser al menos ${upfrontRequired.toString()}.`,
        "CONFIRM_REQUIRES_UPFRONT"
      );
    }
  }
}

const conductorEdges: Record<ShipmentStatus, ShipmentStatus[]> = {
  pendiente: [],
  confirmado: ["recogido", "rechazado"],
  recogido: ["en_transito", "rechazado"],
  en_transito: ["entregado", "rechazado"],
  entregado: [],
  rechazado: [],
};

/**
 * Clasificación al pasar a `rechazado`.
 * `pre_entrega`: desde confirmado (chofer aún sin marcar recogido), p. ej. en el retiro la carga no cabe o no coincide.
 * Campana admin: solo alertas `en_entrega`.
 */
export function rejectionPhaseForTransition(from: ShipmentStatus): ShipmentRejectionPhase {
  if (from === ShipmentStatus.pendiente) return "solicitud";
  if (from === ShipmentStatus.confirmado) return "pre_entrega";
  if (from === ShipmentStatus.recogido || from === ShipmentStatus.en_transito) return "en_entrega";
  return "solicitud";
}

/** Flujo estricto (admin): sin saltos, salvo a `rechazado` desde estados abiertos. */
const adminForward: Record<ShipmentStatus, ShipmentStatus[]> = {
  pendiente: [ShipmentStatus.confirmado, ShipmentStatus.rechazado],
  confirmado: [ShipmentStatus.recogido, ShipmentStatus.rechazado],
  recogido: [ShipmentStatus.en_transito, ShipmentStatus.rechazado],
  en_transito: [ShipmentStatus.entregado, ShipmentStatus.rechazado],
  entregado: [],
  rechazado: [],
};

/**
 * Conductor: solo aristas de ruta. Admin: flujo de negocio secuencial + rechazos. Cliente: sin cambio de estado por acá.
 */
export function canTransition(
  role: Role,
  from: ShipmentStatus,
  to: ShipmentStatus
): boolean {
  if (from === to) return true;
  if (role === "cliente") return false;
  if (role === "admin") {
    if (to === ShipmentStatus.rechazado) {
      return from !== ShipmentStatus.entregado && from !== ShipmentStatus.rechazado;
    }
    return adminForward[from]?.includes(to) ?? false;
  }
  if (role !== "conductor") return false;
  return conductorEdges[from]?.includes(to) ?? false;
}

/** Antes de pasar un pedido de pendiente → confirmado: ventanas operativas y equipo asignado. */
export function assertShipmentReadyForConfirm(row: {
  scheduledPickup: Date | null;
  scheduledDelivery: Date | null;
  driverId: string | null;
  vehicleId: string | null;
}): void {
  if (!row.scheduledPickup || !row.scheduledDelivery) {
    throw new ApiError(
      400,
      "Programá fecha y hora de retiro y de entrega antes de confirmar el servicio al cliente.",
      "SCHEDULE_REQUIRED_CONFIRM"
    );
  }
  if (row.scheduledDelivery.getTime() < row.scheduledPickup.getTime()) {
    throw new ApiError(
      400,
      "La fecha de entrega debe ser posterior al retiro.",
      "DELIVERY_BEFORE_PICKUP_CONFIRM"
    );
  }
  if (!row.driverId || !row.vehicleId) {
    throw new ApiError(
      400,
      "Asigná conductor y patente antes de confirmar el servicio.",
      "TEAM_REQUIRED_CONFIRM"
    );
  }
}

export async function assertShipmentDriverVehicle(
  tenantId: string,
  driverId: string | null,
  vehicleId: string | null
): Promise<string | null> {
  if (!driverId) return vehicleId;

  const driver = await prisma.driver.findFirst({
    where: { id: driverId, tenantId },
    include: { assignedVehicle: true },
  });
  if (!driver) throw new ApiError(404, "Conductor no encontrado", "NOT_FOUND");

  if (!driver.assignedVehicleId) {
    throw new ApiError(
      400,
      "El conductor no tiene vehículo asignado; asigne un vehículo antes del envío",
      "DRIVER_NO_VEHICLE"
    );
  }

  if (vehicleId && vehicleId !== driver.assignedVehicleId) {
    throw new ApiError(
      400,
      "El vehículo del envío debe coincidir con el vehículo asignado al conductor",
      "VEHICLE_MISMATCH"
    );
  }

  return driver.assignedVehicleId;
}
