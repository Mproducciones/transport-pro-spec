import { X } from "lucide-react";
import { useCallback, useEffect, useMemo } from "react";

export type DashboardKpiModalKind =
  | "solicitudes"
  | "confirmados"
  | "en_curso"
  | "entregas_hoy"
  | "retrasos"
  | "pendientes_sin_avanzar"
  | "entregas_hoy_revision";

export type DashboardShipmentListItem = {
  id: string;
  origin: string;
  destination: string;
  status: string;
  scheduledDelivery?: string | null;
  deliveredAt?: string | null;
  pickedUpAt?: string | null;
  lastLat?: string | number | null;
  lastLng?: string | number | null;
  createdAt?: string;
  customer: { name: string };
  driver?: { id?: string; fullName: string } | null;
  vehicle?: { id?: string; plate: string } | null;
  totalAmount?: unknown;
  amount?: unknown;
  paymentStatus?: string;
  /** Suma de pagos con comprobante aprobado (API /shipments). */
  paidAmount?: string;
  /** Saldo pendiente real (API /shipments). */
  balanceAmount?: string;
  deliveredToName?: string | null;
  originLat?: string | number | null;
  originLng?: string | number | null;
  destinationLat?: string | number | null;
  destinationLng?: string | number | null;
};

type Props = {
  kind: DashboardKpiModalKind | null;
  onClose: () => void;
  rows: DashboardShipmentListItem[];
  onOpenFicha: (shipmentId: string) => void;
};

function isToday(value?: string | null) {
  if (!value) return false;
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function isTodayDelivered(value?: string | null) {
  if (!value) return false;
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return false;
  return isToday(value);
}

function isScheduledDeliveryToday(scheduledDelivery?: string | null): boolean {
  if (!scheduledDelivery) return false;
  return isToday(scheduledDelivery);
}

function isDelayed(status: string, scheduledDelivery?: string | null) {
  if (!scheduledDelivery) return false;
  if (status === "entregado" || status === "rechazado") return false;
  return Date.now() > new Date(scheduledDelivery).getTime();
}

function pedidoRef(id: string): string {
  return id.slice(-6).toUpperCase();
}

function parseClpString(s?: string | null): number {
  if (s == null || s === "") return 0;
  const raw = String(s).replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function fmtClp(n: number): string {
  return n.toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
}

/**
 * Resumen de cobro legible: pagos aprobados vs saldo.
 * Aplica a confirmados, en curso y entregas hoy (monto del envío vs pagos aprobados).
 */
function totalServicioClp(r: DashboardShipmentListItem): number {
  const v = r.totalAmount ?? r.amount;
  if (v == null) return 0;
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  if (typeof v === "string" || typeof v === "object") {
    const n = parseClpString(String(v));
    return n > 0 ? n : 0;
  }
  return 0;
}

function resumenCobroEnvio(r: DashboardShipmentListItem): { text: string; tone: "ok" | "partial" | "due" | "na" } {
  const total = totalServicioClp(r);
  const paid = parseClpString(r.paidAmount);
  const bal = parseClpString(r.balanceAmount);
  const ps = r.paymentStatus;

  if (total <= 0) {
    return {
      text: "Cobro: sin monto de servicio cargado aún o cotización pendiente.",
      tone: "na",
    };
  }

  if (bal <= 0) {
    return {
      text: "Cobro: al día (sin saldo pendiente según comprobantes aprobados).",
      tone: "ok",
    };
  }

  if (ps === "parcial" || (paid > 0 && bal > 0)) {
    return {
      text: `Cobro: falta recaudar ${fmtClp(bal)} · ya aprobado ${fmtClp(paid)} de ${fmtClp(total)}.`,
      tone: "partial",
    };
  }

  return {
    text: `Cobro: pendiente — saldo a cobrar ${fmtClp(bal)} (total servicio ${fmtClp(total)}; sin pagos aprobados aún).`,
    tone: "due",
  };
}

const TONE_COBRO = {
  ok: "text-emerald-900/95",
  partial: "text-sky-900/95",
  due: "text-amber-900/95",
  na: "text-slate-600",
} as const;

function CobroResumenListLine({ r }: { r: DashboardShipmentListItem }) {
  const c = resumenCobroEnvio(r);
  return (
    <p
      className={`mt-1.5 text-[11px] leading-snug ${TONE_COBRO[c.tone]}`}
      title="Según monto del envío y pagos con comprobante aprobado"
    >
      {c.text}
    </p>
  );
}

function KpiEnvioListRow({
  r,
  kind,
  onOpenFicha,
}: {
  r: DashboardShipmentListItem;
  kind: DashboardKpiModalKind;
  onOpenFicha: (id: string) => void;
}) {
  const details = (
    <>
      <p className="font-semibold text-slate-900">
        Ped. {pedidoRef(r.id)} · {r.origin} → {r.destination}
      </p>
      <p className="mt-0.5 text-slate-600">
        {r.customer.name}
        {r.driver?.fullName ? ` · Chofer: ${r.driver.fullName}` : ""}
        {r.vehicle?.plate ? ` · ${r.vehicle.plate}` : ""}
      </p>
      {r.createdAt && (kind === "solicitudes" || kind === "pendientes_sin_avanzar") ? (
        <p className="mt-0.5 text-[11px] text-slate-500">
          Solicitado: {new Date(r.createdAt).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" })}
        </p>
      ) : null}
      {r.scheduledDelivery ? (
        <p className="mt-0.5 text-[11px] text-slate-500">
          Entrega comprometida:{" "}
          {new Date(r.scheduledDelivery).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" })}
        </p>
      ) : null}
      {r.deliveredAt && (kind === "entregas_hoy" || kind === "retrasos" || kind === "entregas_hoy_revision") ? (
        <p className="mt-0.5 text-[11px] text-slate-500">
          Cierre: {new Date(r.deliveredAt).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" })}
        </p>
      ) : null}
      {kind === "confirmados" || kind === "en_curso" || kind === "entregas_hoy" ? <CobroResumenListLine r={r} /> : null}
      <p className="mt-2">
        <span className={statusBadgeClass(r.status)}>{statusLabel(r.status)}</span>
      </p>
    </>
  );

  return (
    <button
      type="button"
      onClick={() => onOpenFicha(r.id)}
      className="w-full rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-left text-xs text-slate-800 transition hover:border-slate-300 hover:bg-slate-100/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
    >
      {details}
    </button>
  );
}

function shipmentHasQuote(s: DashboardShipmentListItem): boolean {
  const n = Number(s.totalAmount ?? s.amount ?? 0);
  return Number.isFinite(n) && n > 0;
}

function shipmentHasTeam(s: DashboardShipmentListItem): boolean {
  return Boolean(s.driver && s.vehicle?.id);
}

const MODAL_CONFIG: Record<DashboardKpiModalKind, { title: string; description: string }> = {
  solicitudes: {
    title: "Solicitudes del cliente por aprobar",
    description:
      "Estado operativo `pendiente`: el cliente pidió el servicio; falta tu cotización, aprobación o asignación según el flujo de Envíos.",
  },
  confirmados: {
    title: "Envíos confirmados (listos para operar)",
    description:
      "Con equipo asignado. Abajo: situación de cobro (al día, falta cobrar o pago parcial) según pagos con comprobante aprobado.",
  },
  en_curso: {
    title: "Viajes en curso",
    description:
      "Tocá un viaje: se abre la ficha con mapa y datos. Para ver de nuevo el listado, abrí otra vez el KPI «En curso» en el tablero.",
  },
  entregas_hoy: {
    title: "Entregas cerradas hoy",
    description:
      "Envíos con cierre de entrega hoy. Incluye si el cobro está al día, es parcial o sigue pendiente (según comprobantes aprobados).",
  },
  retrasos: {
    title: "Entregas vencidas",
    description: "Fecha de entrega comprometida superada y envío aún no cerrado como entregado (excluye rechazados de planificación).",
  },
  pendientes_sin_avanzar: {
    title: "Pendientes sin avanzar",
    description: "Falta cotización, o tenés cotización pero aún no asignaste conductor y vehículo.",
  },
  entregas_hoy_revision: {
    title: "Entregas de hoy a completar o revisar",
    description: "Hoy: programado para hoy aún abiertos, o entregado hoy sin receptor registrado.",
  },
};

function sortRows(kind: DashboardKpiModalKind, list: DashboardShipmentListItem[]) {
  const copy = [...list];
  if (kind === "solicitudes" || kind === "pendientes_sin_avanzar") {
    return copy.sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta;
    });
  }
  if (kind === "retrasos" || kind === "en_curso" || kind === "confirmados" || kind === "entregas_hoy_revision") {
    return copy.sort((a, b) => {
      const ta = a.scheduledDelivery ? new Date(a.scheduledDelivery).getTime() : Number.POSITIVE_INFINITY;
      const tb = b.scheduledDelivery ? new Date(b.scheduledDelivery).getTime() : Number.POSITIVE_INFINITY;
      return ta - tb;
    });
  }
  if (kind === "entregas_hoy") {
    return copy.sort((a, b) => {
      const ta = a.deliveredAt ? new Date(a.deliveredAt).getTime() : 0;
      const tb = b.deliveredAt ? new Date(b.deliveredAt).getTime() : 0;
      return tb - ta;
    });
  }
  return copy;
}

function filterPendientesSinAvanzar(r: DashboardShipmentListItem): boolean {
  if (r.status !== "pendiente") return false;
  const hasQ = shipmentHasQuote(r);
  const hasT = shipmentHasTeam(r);
  return !hasQ || (hasQ && !hasT);
}

function filterEntregasHoyRevision(r: DashboardShipmentListItem): boolean {
  const sinReceptor =
    r.status === "entregado" && isTodayDelivered(r.deliveredAt) && !(r.deliveredToName && String(r.deliveredToName).trim());
  const venceHoyAbierto =
    isScheduledDeliveryToday(r.scheduledDelivery) && r.status !== "entregado" && r.status !== "rechazado";
  return sinReceptor || venceHoyAbierto;
}

function filterRows(kind: DashboardKpiModalKind, rows: DashboardShipmentListItem[]) {
  switch (kind) {
    case "solicitudes":
      return rows.filter((r) => r.status === "pendiente");
    case "pendientes_sin_avanzar":
      return rows.filter(filterPendientesSinAvanzar);
    case "confirmados":
      return rows.filter((r) => r.status === "confirmado");
    case "en_curso":
      return rows.filter((r) => r.status === "confirmado" || r.status === "recogido" || r.status === "en_transito");
    case "entregas_hoy":
      return rows.filter((r) => r.status === "entregado" && isToday(r.deliveredAt));
    case "entregas_hoy_revision":
      return rows.filter(filterEntregasHoyRevision);
    case "retrasos":
      return rows.filter((r) => isDelayed(r.status, r.scheduledDelivery));
    default:
      return [];
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "pendiente":
      return "Pendiente aprobación";
    case "confirmado":
      return "Confirmado";
    case "recogido":
      return "Recogido";
    case "en_transito":
      return "En tránsito";
    case "entregado":
      return "Entregado";
    case "rechazado":
      return "Rechazado";
    default:
      return status;
  }
}

/** Chip de estado con color fijo por etapa (p. ej. en «Viajes en curso»: cielo / ámbar / índigo). */
function statusBadgeClass(status: string): string {
  const base =
    "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ring-1";
  switch (status) {
    case "pendiente":
      return `${base} bg-violet-100 text-violet-900 ring-violet-400/60`;
    case "confirmado":
      return `${base} bg-sky-100 text-sky-950 ring-sky-400/70`;
    case "recogido":
      return `${base} bg-amber-100 text-amber-950 ring-amber-400/70`;
    case "en_transito":
      return `${base} bg-indigo-100 text-indigo-950 ring-indigo-400/70`;
    case "entregado":
      return `${base} bg-emerald-100 text-emerald-950 ring-emerald-400/70`;
    case "rechazado":
      return `${base} bg-rose-100 text-rose-950 ring-rose-400/70`;
    default:
      return `${base} bg-slate-100 text-slate-800 ring-slate-300`;
  }
}

export function DashboardKpiModal({ kind, onClose, rows, onOpenFicha }: Props) {
  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (!kind) return;
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [kind, onKey]);

  const list = useMemo(() => {
    if (!kind) return [];
    return sortRows(kind, filterRows(kind, rows));
  }, [kind, rows]);

  if (!kind) return null;

  const cfg = MODAL_CONFIG[kind];

  return (
    <div
      className="fixed inset-0 z-[88] flex items-center justify-center bg-black/55 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dashboard-kpi-modal-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(88vh,720px)] w-full min-h-0 max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <div className="min-w-0">
            <h2 id="dashboard-kpi-modal-title" className="text-base font-semibold text-slate-900">
              {cfg.title}
            </h2>
            <p className="mt-1 text-[11px] leading-snug text-slate-600">{cfg.description}</p>
            <p className="mt-1.5 text-[11px] font-medium text-slate-800">
              <span className="tabular-nums text-lg font-bold text-slate-900">{list.length}</span> envío
              {list.length !== 1 ? "s" : ""} en este listado
            </p>
          </div>
          <button
            type="button"
            className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            onClick={onClose}
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
          {list.length === 0 ? (
            <p className="py-4 text-sm text-slate-600">No hay envíos en esta categoría ahora.</p>
          ) : (
            <ul className="space-y-2">
              {list.map((r) => (
                <li key={r.id} className="list-none">
                  <KpiEnvioListRow r={r} kind={kind} onOpenFicha={onOpenFicha} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="shrink-0 border-t border-slate-200 bg-slate-50 px-4 py-2.5 text-center text-[10px] text-slate-500">
          Tocá un envío para abrir su ficha (mapa y detalle en panel). Para edición con columnas, <strong>Envíos</strong> en el menú.
        </p>
      </div>
    </div>
  );
}
