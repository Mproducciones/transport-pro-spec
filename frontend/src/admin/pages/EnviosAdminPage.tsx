import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { apiGet, apiSend } from "../../api/client.js";
import { PAYMENT_TERM_OPTIONS, paymentTermLabel } from "../../lib/paymentTerms.js";
import { suggestDriverOptions } from "../../lib/suggestAssignment.js";
import { notify } from "../../lib/notify.js";
import { shipmentStatusLabel as sharedShipmentStatusLabel, shipmentStatusTone } from "../../lib/shipmentUi.js";
import { FloatingAlertModal } from "../FloatingAlertModal.js";
import { EnvioReadinessBlock } from "../EnvioReadinessBlock.js";
type ShipmentRow = {
  id: string;
  origin: string;
  destination: string;
  status: string;
  /**
   * Si status=rechazado: solicitud (admin), pre_entrega (en retiro: no cabe en camión, carga distinta a lo acordado, etc.;
   * siempre antes de marcar recogido), en_entrega (destino / en ruta con carga).
   */
  rejectionPhase?: string | null;
  paymentStatus: string;
  amount?: unknown | null;
  cargoType?: string | null;
  cargoQuantity?: unknown | null;
  cargoWeightKg?: unknown | null;
  cargoVolumeM3?: unknown | null;
  requiresHelper?: boolean;
  helperSurcharge?: unknown | null;
  totalAmount?: unknown | null;
  paymentTerm?: "upfront_full" | "upfront_partial" | "delivery";
  upfrontPercent?: unknown | null;
  upfrontAmount?: unknown | null;
  decisionNote?: string | null;
  customer: { name: string; email?: string | null; phone?: string | null };
  driver?: { id: string; fullName: string; phone?: string | null } | null;
  vehicle?: { id: string; plate: string } | null;
  deliveredToName?: string | null;
  deliveredToId?: string | null;
  createdAt: string;
  scheduledPickup?: string | null;
  scheduledDelivery?: string | null;
  deliveredAt?: string | null;
  loadSequence?: unknown | null;
  unloadAccess?: string | null;
};
type SettingsData = {
  company: {
    pricingBaseFee?: unknown;
    pricingPerKg?: unknown;
    pricingPerM3?: unknown;
    pricingMinimumCharge?: unknown;
  } | null;
};
type DriverRow = {
  id: string;
  fullName: string;
  assignedVehicle?: { id: string; plate: string; status: string } | null;
};
type AssignmentWizardState = {
  shipmentId: string;
  routeLabel: string;
  suggested: ReturnType<typeof suggestDriverOptions>;
  allDrivers: DriverRow[];
  selectedDriverId: string;
  selectedVehicleId: string;
};
type ShipmentActionModal =
  | { type: "reject"; shipment: ShipmentRow; note: string }
  | { type: "deliver"; shipment: ShipmentRow; deliveredToName: string; deliveredToId: string };

type Filter =
  | "todos"
  | "pendientes"
  | "activos"
  | "entregados"
  | "rechazados"
  | "rechazos_entrega"
  | "confirmados"
  | "entregas_hoy"
  | "entregas_hoy_revision"
  | "alertas"
  | "retrasos"
  | "cobro_pendiente";
type PendingStage =
  | "todos"
  | "sin-cotizacion"
  | "sin-equipo"
  | "listo-confirmar"
  | "falta-cotizacion-o-equipo";
type ProcessView = "cotizar" | "asignar" | "confirmar" | "ejecucion" | "cierre";

/** Filtros de lista permitidos según la tarea elegida en el paso 1 de la página Envíos. */
const FILTERS_BY_PROCESS: Record<ProcessView, readonly Filter[]> = {
  cotizar: ["pendientes", "rechazados", "todos"],
  asignar: ["pendientes", "todos"],
  confirmar: ["pendientes", "confirmados", "activos", "todos"],
  ejecucion: [
    "confirmados",
    "activos",
    "cobro_pendiente",
    "entregas_hoy",
    "entregas_hoy_revision",
    "retrasos",
    "alertas",
    "rechazos_entrega",
    "todos",
  ],
  cierre: [
    "entregas_hoy",
    "entregas_hoy_revision",
    "entregados",
    "cobro_pendiente",
    "retrasos",
    "alertas",
    "rechazados",
    "rechazos_entrega",
    "todos",
  ],
};

const DEFAULT_FILTER_BY_PROCESS: Record<ProcessView, Filter> = {
  cotizar: "pendientes",
  asignar: "pendientes",
  confirmar: "pendientes",
  ejecucion: "activos",
  cierre: "entregados",
};

/** Orden fijo para mostrar filtros en un solo bloque (paso 2), de lo más operativo a lo más amplio. */
const LIST_FILTER_ORDER: readonly Filter[] = [
  "pendientes",
  "confirmados",
  "activos",
  "cobro_pendiente",
  "entregas_hoy",
  "entregas_hoy_revision",
  "retrasos",
  "alertas",
  "rechazos_entrega",
  "entregados",
  "rechazados",
  "todos",
];

function sortFiltersForList(allowed: readonly Filter[]): Filter[] {
  return [...allowed].sort((a, b) => LIST_FILTER_ORDER.indexOf(a) - LIST_FILTER_ORDER.indexOf(b));
}

const PROCESS_LIST_INTRO: Record<ProcessView, string> = {
  cotizar:
    "Solicitudes nuevas y rechazos de oficina o pre-ruta: pendientes en el paso 1; lista «Rechazo por admin o pre-ruta» para incidencias ya cerradas operativamente.",
  asignar: "Pendientes y más: el detalle de pendientes va con la tarea en el paso 1.",
  confirmar: "Pendientes, confirmados y en curso; pendientes afinados desde el paso 1.",
  ejecucion:
    "Viajes en ruta: activos, entregas de hoy, retrasos, alertas y rechazo en destino. Cobro pendiente: filtro dedicado.",
  cierre:
    "Cierre: entregas del día, revisión, entregados, rechazos y alertas. Comprobantes y validación de transferencias: Pagos; los rechazos de entrega siguen gestionándose en las listas de Envíos.",
};

/** Deep link desde Inicio (KPIs del dashboard y checklist del turno). */
function mapDashboardVista(v: string): {
  filter: Filter;
  processView: ProcessView;
  pendingStage?: PendingStage;
} | null {
  switch (v) {
    case "confirmados":
      return { filter: "confirmados", processView: "ejecucion" };
    case "en_curso":
      return { filter: "activos", processView: "ejecucion" };
    case "entregas_hoy":
      return { filter: "entregas_hoy", processView: "cierre" };
    case "entregas_hoy_revision":
      return { filter: "entregas_hoy_revision", processView: "cierre" };
    case "alertas":
      return { filter: "retrasos", processView: "ejecucion", pendingStage: "todos" };
    case "retrasos":
      return { filter: "retrasos", processView: "ejecucion" };
    case "pendientes_sin_avanzar":
      return {
        filter: "pendientes",
        processView: "cotizar",
        pendingStage: "falta-cotizacion-o-equipo",
      };
    /** Deep link desde campana de alertas (todas las solicitudes pendientes). */
    case "pendientes":
      return { filter: "pendientes", processView: "cotizar", pendingStage: "todos" };
    /** Cartera / saldo por envío: ver cualquier estado en una sola lista. */
    case "todos":
      return { filter: "todos", processView: "cotizar", pendingStage: "todos" };
    case "rechazados":
      return { filter: "rechazados", processView: "cotizar", pendingStage: "todos" };
    case "rechazos_entrega":
      return { filter: "rechazos_entrega", processView: "ejecucion", pendingStage: "todos" };
    default:
      return null;
  }
}

/** Estado inicial desde el `search` de React Router (más fiable que `window` en el primer render). */
function readEnviosStateFromLocationSearch(search: string): {
  filter: Filter;
  pendingStage: PendingStage;
  processView: ProcessView;
} {
  const raw = new URLSearchParams(search).get("vista") ?? "";
  const mapped = mapDashboardVista(raw);
  if (!mapped) {
    return { filter: "activos", pendingStage: "todos", processView: "ejecucion" };
  }
  return {
    filter: mapped.filter,
    processView: mapped.processView,
    pendingStage: mapped.pendingStage ?? "todos",
  };
}

const ENV_FILTER_HINTS: Record<Filter, string> = {
  pendientes:
    "Solicitudes pendientes de aprobar. Podés acotar por sin cotización, sin equipo o listo para confirmar.",
  confirmados: "Confirmados: listos para ejecutar (conductor y vehículo asignados).",
  activos:
    "En curso operativo: confirmados listos para salir, más recogidos y en tránsito. Mismo criterio que el KPI «Viajes en curso» del inicio.",
  entregas_hoy: "Entregas cerradas hoy (fecha de entrega registrada hoy).",
  entregas_hoy_revision:
    "Entregas de hoy a completar: programadas para hoy sin cerrar, o marcadas entregadas hoy sin receptor registrado.",
  alertas:
    "Rechazos en destino (ruta) y envíos con entrega vencida (retraso). No incluye rechazo de solicitud por admin ni rechazo en el retiro (p. ej. no cabe en el camión) antes de salir.",
  retrasos: "Solo viajes con fecha de entrega vencida y aún no entregados (sin incluir rechazados).",
  cobro_pendiente:
    "Pago pendiente o parcial en envíos no rechazados (seguimiento rápido de cobranza; comprobantes en Pagos).",
  entregados: "Envíos ya entregados.",
  rechazados:
    "Rechazos fuera de destino: solicitud rechazada por admin; y rechazo en el retiro o antes de salir a ruta (p. ej. la carga no cabe en el camión o solo entra una parte, mercadería distinta a lo acordado) mientras el envío sigue confirmado y sin marcar recogido. No incluye incidencias en destino.",
  rechazos_entrega:
    "Solo rechazo en destino: ya en ruta o en descarga en el punto de entrega. Si el problema fue en el retiro (no cabe en el camión, etc.), usá «Rechazo por admin o pre-ruta».",
  todos: "Muestra todos los envíos sin filtrar por estado.",
};

function pendingStageLabel(s: PendingStage): string {
  const labels: Record<PendingStage, string> = {
    todos: "todos los pendientes",
    "sin-cotizacion": "solo falta cotización",
    "sin-equipo": "solo falta equipo",
    "listo-confirmar": "listos para confirmar al cliente",
    "falta-cotizacion-o-equipo": "falta cotización o equipo",
  };
  return labels[s];
}

function enviosFilterLabel(f: Filter): string {
  const labels: Record<Filter, string> = {
    pendientes: "Pendientes de aprobar",
    confirmados: "Confirmados",
    activos: "En curso",
    entregas_hoy: "Entregas hoy",
    entregas_hoy_revision: "Entregas hoy a revisar",
    alertas: "Rechazos y retrasos",
    retrasos: "Solo retrasos",
    cobro_pendiente: "Cobro pendiente / parcial",
    entregados: "Entregados",
    rechazados: "Rechazo por admin o pre-ruta",
    rechazos_entrega: "Rechazo en destino",
    todos: "Todos los envíos",
  };
  return labels[f];
}

function enviosFilterCount(
  f: Filter,
  c: {
    pendientes: number;
    confirmados: number;
    activos: number;
    entregados: number;
    entregasHoy: number;
    entregasHoyRevision: number;
    rechazados: number;
    rechazosEntrega: number;
    retrasos: number;
    alertas: number;
    cobroPendiente: number;
  },
  rowsLength: number
): number {
  switch (f) {
    case "pendientes":
      return c.pendientes;
    case "confirmados":
      return c.confirmados;
    case "activos":
      return c.activos;
    case "entregados":
      return c.entregados;
    case "entregas_hoy":
      return c.entregasHoy;
    case "entregas_hoy_revision":
      return c.entregasHoyRevision;
    case "rechazados":
      return c.rechazados;
    case "rechazos_entrega":
      return c.rechazosEntrega;
    case "retrasos":
      return c.retrasos;
    case "alertas":
      return c.alertas;
    case "cobro_pendiente":
      return c.cobroPendiente;
    case "todos":
      return rowsLength;
    default:
      return 0;
  }
}

function processViewBadgeLabel(v: ProcessView): string {
  const labels: Record<ProcessView, string> = {
    cotizar: "Cotizar",
    asignar: "Asignar equipo",
    confirmar: "Confirmar",
    ejecucion: "En ejecución",
    cierre: "Cierre",
  };
  return labels[v];
}

/** Solicitudes del cliente antes de salir a ruta vs pedidos ya operativos. */
function envioGrupoFromProcessView(p: ProcessView): "nuevos" | "listos" {
  return p === "cotizar" || p === "asignar" || p === "confirmar" ? "nuevos" : "listos";
}

function envioGrupoTitulo(g: "nuevos" | "listos"): string {
  return g === "nuevos" ? "Solicitudes nuevas" : "En operación";
}

function processStepBadgeClass(v: ProcessView): string {
  const m: Record<ProcessView, string> = {
    cotizar: "bg-amber-200 text-amber-950 ring-1 ring-amber-500/50",
    asignar: "bg-violet-200 text-violet-950 ring-1 ring-violet-500/50",
    confirmar: "bg-blue-200 text-blue-950 ring-1 ring-blue-500/50",
    ejecucion: "bg-cyan-200 text-cyan-950 ring-1 ring-cyan-500/50",
    cierre: "bg-emerald-200 text-emerald-950 ring-1 ring-emerald-500/50",
  };
  return m[v];
}

function filterSelectionBadgeClass(f: Filter): string {
  if (f === "cobro_pendiente") return "bg-violet-200 text-violet-950 ring-1 ring-violet-500/50";
  if (f === "entregas_hoy" || f === "entregas_hoy_revision") return "bg-teal-200 text-teal-950 ring-1 ring-teal-500/50";
  if (f === "retrasos" || f === "alertas") return "bg-orange-200 text-orange-950 ring-1 ring-orange-500/50";
  if (f === "pendientes") return "bg-amber-200 text-amber-950 ring-1 ring-amber-500/50";
  if (f === "confirmados") return "bg-sky-200 text-sky-950 ring-1 ring-sky-500/50";
  if (f === "activos") return "bg-blue-200 text-blue-950 ring-1 ring-blue-500/50";
  if (f === "entregados") return "bg-emerald-200 text-emerald-950 ring-1 ring-emerald-500/50";
  if (f === "rechazados") return "bg-rose-200 text-rose-950 ring-1 ring-rose-500/50";
  if (f === "rechazos_entrega") return "bg-orange-200 text-orange-950 ring-1 ring-orange-600/50";
  return "bg-slate-200 text-slate-900 ring-1 ring-slate-400/60";
}

function enviosListBannerClass(f: Filter): string {
  if (f === "cobro_pendiente")
    return "border-l-[5px] border-l-violet-500 bg-gradient-to-r from-violet-50/90 via-violet-50/35 to-white";
  if (f === "entregas_hoy" || f === "entregas_hoy_revision")
    return "border-l-[5px] border-l-teal-500 bg-gradient-to-r from-teal-50/90 via-teal-50/40 to-white";
  if (f === "retrasos" || f === "alertas")
    return "border-l-[5px] border-l-orange-500 bg-gradient-to-r from-orange-50/90 via-orange-50/35 to-white";
  if (f === "pendientes" || f === "confirmados" || f === "activos")
    return "border-l-[5px] border-l-blue-500 bg-gradient-to-r from-blue-50/85 via-sky-50/30 to-white";
  if (f === "entregados") return "border-l-[5px] border-l-emerald-500 bg-gradient-to-r from-emerald-50/90 to-white";
  if (f === "rechazados" || f === "rechazos_entrega")
    return "border-l-[5px] border-l-rose-500 bg-gradient-to-r from-rose-50/80 via-orange-50/20 to-white";
  return "border-l-[5px] border-l-slate-400 bg-gradient-to-r from-slate-50 to-white";
}

const PROCESS_SECTION_TOP: Record<ProcessView, string> = {
  cotizar: "border-t-[3px] border-t-amber-400",
  asignar: "border-t-[3px] border-t-violet-500",
  confirmar: "border-t-[3px] border-t-blue-500",
  ejecucion: "border-t-[3px] border-t-cyan-500",
  cierre: "border-t-[3px] border-t-emerald-500",
};

const PROCESS_STEP_CARD: Record<
  ProcessView,
  { idle: string; active: string; stepMuted: string; stepActive: string; countIdle: string; countActive: string }
> = {
  cotizar: {
    idle: "border-amber-200/90 bg-amber-50/35 hover:border-amber-300 hover:bg-amber-50/70",
    active: "border-2 border-amber-500 bg-amber-100 shadow-md ring-2 ring-amber-400/55 ring-offset-2",
    stepMuted: "text-amber-800/70",
    stepActive: "text-amber-950 font-bold",
    countIdle: "text-amber-900/55",
    countActive: "text-amber-950 font-semibold",
  },
  asignar: {
    idle: "border-violet-200/90 bg-violet-50/35 hover:border-violet-300 hover:bg-violet-50/70",
    active: "border-2 border-violet-500 bg-violet-100 shadow-md ring-2 ring-violet-400/55 ring-offset-2",
    stepMuted: "text-violet-800/70",
    stepActive: "text-violet-950 font-bold",
    countIdle: "text-violet-900/55",
    countActive: "text-violet-950 font-semibold",
  },
  confirmar: {
    idle: "border-blue-200/90 bg-blue-50/35 hover:border-blue-300 hover:bg-blue-50/70",
    active: "border-2 border-blue-500 bg-blue-100 shadow-md ring-2 ring-blue-400/55 ring-offset-2",
    stepMuted: "text-blue-800/70",
    stepActive: "text-blue-950 font-bold",
    countIdle: "text-blue-900/55",
    countActive: "text-blue-950 font-semibold",
  },
  ejecucion: {
    idle: "border-cyan-200/90 bg-cyan-50/35 hover:border-cyan-300 hover:bg-cyan-50/70",
    active: "border-2 border-cyan-500 bg-cyan-100 shadow-md ring-2 ring-cyan-400/55 ring-offset-2",
    stepMuted: "text-cyan-800/70",
    stepActive: "text-cyan-950 font-bold",
    countIdle: "text-cyan-900/55",
    countActive: "text-cyan-950 font-semibold",
  },
  cierre: {
    idle: "border-emerald-200/90 bg-emerald-50/35 hover:border-emerald-300 hover:bg-emerald-50/70",
    active: "border-2 border-emerald-500 bg-emerald-100 shadow-md ring-2 ring-emerald-400/55 ring-offset-2",
    stepMuted: "text-emerald-800/70",
    stepActive: "text-emerald-950 font-bold",
    countIdle: "text-emerald-900/55",
    countActive: "text-emerald-950 font-semibold",
  },
};

const PROCESS_HINT_BAR: Record<ProcessView, string> = {
  cotizar: "border-amber-200 bg-amber-50/95",
  asignar: "border-violet-200 bg-violet-50/95",
  confirmar: "border-blue-200 bg-blue-50/95",
  ejecucion: "border-cyan-200 bg-cyan-50/95",
  cierre: "border-emerald-200 bg-emerald-50/95",
};

type FilterChipTone = "teal" | "sky" | "blue" | "amber" | "emerald" | "rose" | "slate" | "violet";

const FILTER_CHIP_TONE: Record<
  FilterChipTone,
  { idle: string; active: string; countIdle: string; countActive: string }
> = {
  teal: {
    idle: "border-teal-200/90 bg-teal-50/50 text-slate-800 hover:border-teal-400 hover:bg-teal-50",
    active: "border-2 border-teal-500 bg-teal-100 text-teal-950 shadow-md ring-2 ring-teal-400/50 ring-offset-2",
    countIdle: "text-teal-900/60",
    countActive: "text-teal-950 font-semibold",
  },
  sky: {
    idle: "border-sky-200/90 bg-sky-50/50 text-slate-800 hover:border-sky-400 hover:bg-sky-50",
    active: "border-2 border-sky-500 bg-sky-100 text-sky-950 shadow-md ring-2 ring-sky-400/50 ring-offset-2",
    countIdle: "text-sky-900/60",
    countActive: "text-sky-950 font-semibold",
  },
  blue: {
    idle: "border-blue-200/90 bg-blue-50/45 text-slate-800 hover:border-blue-400 hover:bg-blue-50/90",
    active: "border-2 border-blue-600 bg-blue-100 text-blue-950 shadow-md ring-2 ring-blue-400/50 ring-offset-2",
    countIdle: "text-blue-900/60",
    countActive: "text-blue-950 font-semibold",
  },
  amber: {
    idle: "border-amber-200/90 bg-amber-50/50 text-slate-800 hover:border-amber-400 hover:bg-amber-50",
    active: "border-2 border-amber-500 bg-amber-100 text-amber-950 shadow-md ring-2 ring-amber-400/50 ring-offset-2",
    countIdle: "text-amber-900/60",
    countActive: "text-amber-950 font-semibold",
  },
  emerald: {
    idle: "border-emerald-200/90 bg-emerald-50/50 text-slate-800 hover:border-emerald-400 hover:bg-emerald-50",
    active: "border-2 border-emerald-500 bg-emerald-100 text-emerald-950 shadow-md ring-2 ring-emerald-400/50 ring-offset-2",
    countIdle: "text-emerald-900/60",
    countActive: "text-emerald-950 font-semibold",
  },
  rose: {
    idle: "border-rose-200/90 bg-rose-50/45 text-slate-800 hover:border-rose-400 hover:bg-rose-50",
    active: "border-2 border-rose-500 bg-rose-100 text-rose-950 shadow-md ring-2 ring-rose-400/50 ring-offset-2",
    countIdle: "text-rose-900/60",
    countActive: "text-rose-950 font-semibold",
  },
  slate: {
    idle: "border-slate-200/90 bg-slate-50/80 text-slate-800 hover:border-slate-300 hover:bg-slate-100",
    active: "border-2 border-slate-600 bg-slate-200 text-slate-950 shadow-md ring-2 ring-slate-400/45 ring-offset-2",
    countIdle: "text-slate-600",
    countActive: "text-slate-900 font-semibold",
  },
  violet: {
    idle: "border-violet-200/90 bg-violet-50/50 text-slate-800 hover:border-violet-400 hover:bg-violet-50",
    active: "border-2 border-violet-600 bg-violet-100 text-violet-950 shadow-md ring-2 ring-violet-400/50 ring-offset-2",
    countIdle: "text-violet-900/60",
    countActive: "text-violet-950 font-semibold",
  },
};

const FILTER_CHIP_ORANGE: {
  idle: string;
  active: string;
  countIdle: string;
  countActive: string;
} = {
  idle: "border-orange-200/90 bg-orange-50/50 text-slate-800 hover:border-orange-400 hover:bg-orange-50/90",
  active: "border-2 border-orange-500 bg-orange-100 text-orange-950 shadow-md ring-2 ring-orange-400/50 ring-offset-2",
  countIdle: "text-orange-900/60",
  countActive: "text-orange-950 font-semibold",
};

const FILTER_CHIP_PROPS: Record<Filter, { tone?: FilterChipTone; accent?: "alert" }> = {
  pendientes: { tone: "amber" },
  confirmados: { tone: "sky" },
  activos: { tone: "blue" },
  cobro_pendiente: { tone: "violet" },
  entregas_hoy: { tone: "teal" },
  entregas_hoy_revision: { tone: "teal" },
  retrasos: { accent: "alert" },
  alertas: { accent: "alert" },
  entregados: { tone: "emerald" },
  rechazados: { tone: "rose" },
  rechazos_entrega: { accent: "alert" },
  todos: { tone: "slate" },
};

function isRechazoEnDestino(s: ShipmentRow): boolean {
  return s.status === "rechazado" && s.rejectionPhase === "en_entrega";
}

/** Rechazo que no es en destino: admin (solicitud), en retiro/pre-ruta (p. ej. no cabe en camión), o sin fase en datos viejos. */
function isRechazoFueraDeDestino(s: ShipmentRow): boolean {
  return s.status === "rechazado" && !isRechazoEnDestino(s);
}

function shipmentHasQuote(s: ShipmentRow): boolean {
  const n = Number(s.totalAmount ?? s.amount ?? 0);
  return Number.isFinite(n) && n > 0;
}

function shipmentHasTeam(s: ShipmentRow): boolean {
  return Boolean(s.driver?.id && s.vehicle?.id);
}

/** Cobro abierto en envíos que siguen en cartera operativa (vista dueño). */
function shipmentCobroPendiente(s: ShipmentRow): boolean {
  if (s.status === "rechazado") return false;
  return s.paymentStatus === "pendiente" || s.paymentStatus === "parcial";
}

/** Orden: retrasos primero, luego pipeline operativo, luego fecha comprometida más cercana. */
function compareShipmentsByUrgency(a: ShipmentRow, b: ShipmentRow): number {
  const da = isDelayed(a.status, a.scheduledDelivery);
  const db = isDelayed(b.status, b.scheduledDelivery);
  if (da !== db) return da ? -1 : 1;
  const rank: Record<string, number> = {
    en_transito: 0,
    recogido: 1,
    confirmado: 2,
    pendiente: 3,
    entregado: 4,
    rechazado: 5,
  };
  const ra = rank[a.status] ?? 9;
  const rb = rank[b.status] ?? 9;
  if (ra !== rb) return ra - rb;
  const ta = new Date(a.scheduledDelivery ?? a.scheduledPickup ?? a.createdAt).getTime();
  const tb = new Date(b.scheduledDelivery ?? b.scheduledPickup ?? b.createdAt).getTime();
  if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return ta - tb;
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}

type QuoteDraft = {
  amount: string;
  paymentTerm: "upfront_full" | "upfront_partial" | "delivery";
  upfrontPercent: string;
  decisionNote: string;
};

/** Valores ya persistidos en el envío (servidor / base de datos). */
function savedQuoteSnapshot(s: ShipmentRow) {
  return {
    amount: Math.round(Number(s.totalAmount ?? s.amount ?? 0)),
    paymentTerm: (s.paymentTerm ?? "delivery") as QuoteDraft["paymentTerm"],
    upfrontPercent:
      s.paymentTerm === "upfront_partial" ? Math.round(Number(s.upfrontPercent ?? 0)) : null,
  };
}

/** Lo que el formulario expresa ahora (borrador o datos del servidor si no tocó nada). */
function effectiveQuoteFromInputs(
  s: ShipmentRow,
  draft: QuoteDraft | undefined,
  company: SettingsData["company"] | null | undefined
) {
  const fallback = Math.round(suggestedAmount(s, company ?? undefined));
  const raw = draft?.amount?.trim();
  const fromDraft =
    raw && raw.length > 0 ? Math.round(Number(raw.replace(",", "."))) : NaN;
  const fromServer = Math.round(Number(s.totalAmount ?? s.amount ?? 0));
  const amount =
    Number.isFinite(fromDraft) && fromDraft > 0
      ? fromDraft
      : Number.isFinite(fromServer) && fromServer > 0
        ? fromServer
        : fallback;
  const paymentTerm = draft?.paymentTerm ?? (s.paymentTerm ?? "delivery");
  let upfrontPercent: number | null = null;
  if (paymentTerm === "upfront_partial") {
    const p = Number(draft?.upfrontPercent ?? s.upfrontPercent ?? 50);
    upfrontPercent = Math.round(Number.isFinite(p) ? p : 50);
  }
  return { amount, paymentTerm, upfrontPercent };
}

/** True si hay que volver a guardar (no hay cotización aún o el borrador difiere del servidor). */
function isQuoteDirty(
  s: ShipmentRow,
  draft: QuoteDraft | undefined,
  company: SettingsData["company"] | null | undefined
): boolean {
  if (!shipmentHasQuote(s)) return true;
  const saved = savedQuoteSnapshot(s);
  const cur = effectiveQuoteFromInputs(s, draft, company);
  if (cur.amount !== saved.amount) return true;
  if (cur.paymentTerm !== saved.paymentTerm) return true;
  const su = saved.upfrontPercent;
  const cu = cur.upfrontPercent;
  if ((su ?? -1) !== (cu ?? -1)) return true;
  return false;
}

/** Texto para despacho antes de confirmar (reglas de negocio del backend). */
function confirmReadinessHint(s: ShipmentRow): { tone: "neutral" | "amber"; text: string } {
  const term = s.paymentTerm ?? "delivery";
  if (term === "delivery") {
    return {
      tone: "neutral",
      text: "Pago contra entrega: podés confirmar el servicio sin comprobante aprobado de anticipo.",
    };
  }
  if (term === "upfront_full") {
    return {
      tone: "amber",
      text: "Pago total anticipado: antes de confirmar, revisá y aprobá el monto completo en la sección Pagos.",
    };
  }
  return {
    tone: "amber",
    text: "Anticipo + saldo: antes de confirmar, revisá y aprobá el anticipo acordado en la sección Pagos.",
  };
}

function EnviosFilterChip({
  active,
  hint,
  onClick,
  accent,
  tone = "sky",
  label,
  count,
}: {
  active: boolean;
  hint: string;
  onClick: () => void;
  accent?: "alert";
  tone?: FilterChipTone;
  label: string;
  count: number;
}) {
  const base =
    "rounded-lg border px-3 py-2 text-left text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2";
  const pal = accent === "alert" ? FILTER_CHIP_ORANGE : FILTER_CHIP_TONE[tone];
  return (
    <button
      type="button"
      title={hint}
      onClick={onClick}
      aria-pressed={active}
      className={`${base} ${active ? pal.active : pal.idle}`}
    >
      <span className={`block leading-snug ${active ? "font-semibold" : ""}`}>
        {label}
        {active ? (
          <span className="ml-1.5 inline-block rounded bg-white/70 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-slate-700 ring-1 ring-black/5">
            Elegido
          </span>
        ) : null}
      </span>
      <span className={`mt-0.5 block text-xs tabular-nums ${active ? pal.countActive : pal.countIdle}`}>
        {count} envío{count === 1 ? "" : "s"}
      </span>
    </button>
  );
}

export function EnviosAdminPage() {
  const qc = useQueryClient();
  const { search: locationSearch } = useLocation();
  const shipmentsQ = useQuery({
    queryKey: ["shipments"],
    queryFn: () => apiGet<ShipmentRow[]>("/shipments"),
    refetchInterval: 12000,
  });
  const driversQ = useQuery({ queryKey: ["drivers"], queryFn: () => apiGet<DriverRow[]>("/drivers") });
  const settingsQ = useQuery({ queryKey: ["settings"], queryFn: () => apiGet<SettingsData>("/settings") });
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedEnvioId = searchParams.get("envio");
  /** Solo el valor de `vista` importa para sincronizar con Inicio; `envio` u otros query no deben re-disparar esos efectos. */
  const dashboardVistaParam = searchParams.get("vista");
  const detailPanelRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>(() => readEnviosStateFromLocationSearch(locationSearch).filter);
  const [pendingStage, setPendingStage] = useState<PendingStage>(() =>
    readEnviosStateFromLocationSearch(locationSearch).pendingStage
  );
  const [processView, setProcessView] = useState<ProcessView>(() =>
    readEnviosStateFromLocationSearch(locationSearch).processView
  );
  const [approvalDrafts, setApprovalDrafts] = useState<Record<string, QuoteDraft>>({});
  const [assignmentWizard, setAssignmentWizard] = useState<AssignmentWizardState | null>(null);
  const [actionModal, setActionModal] = useState<ShipmentActionModal | null>(null);
  const [guardAlert, setGuardAlert] = useState<string | null>(null);
  const [taskFlowOpen, setTaskFlowOpen] = useState(false);
  const [listQueryOpen, setListQueryOpen] = useState(false);
  const taskFlowTitleId = useId();
  const listQueryTitleId = useId();
  const taskFlowPanelId = useId();
  const listQueryPanelId = useId();

  useEffect(() => {
    if (filter !== "pendientes" && pendingStage !== "todos") {
      setPendingStage("todos");
    }
  }, [filter, pendingStage]);

  function stripDashboardVistaFromUrl() {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (!next.has("vista")) return prev;
        next.delete("vista");
        return next;
      },
      { replace: true }
    );
  }

  /**
   * Aplica filtro / pestaña desde Inicio (?vista=…).
   * No borramos el query al aplicar (Strict Mode / deep links); sí se quita `vista` al tocar otra pestaña o filtro.
   */
  useLayoutEffect(() => {
    if (!dashboardVistaParam) return;
    const mapped = mapDashboardVista(dashboardVistaParam);
    if (!mapped) return;
    setProcessView(mapped.processView);
    setFilter(mapped.filter);
    setPendingStage(mapped.pendingStage ?? "todos");
  }, [dashboardVistaParam]);

  /**
   * Alinea filtro con la pestaña de proceso. Mientras exista ?vista= válido, no corre: si no, el efecto
   * pasivo con processView=cotizar del 1.er render pisaba el deep link (p. ej. Confirmados → quedaba En curso).
   * Depende solo de `processView` y del valor de `vista`, no de todo `searchParams`: si no, al abrir un envío
   * (?envio=) se re-ejecutaba y forzaba «Falta cotización» aunque hubieras elegido «Falta equipo».
   */
  useLayoutEffect(() => {
    if (dashboardVistaParam && mapDashboardVista(dashboardVistaParam)) return;

    const allowed = FILTERS_BY_PROCESS[processView];
    setFilter((prev) => (allowed.includes(prev) ? prev : DEFAULT_FILTER_BY_PROCESS[processView]));

    if (processView === "cotizar") {
      setPendingStage((prev) =>
        prev === "falta-cotizacion-o-equipo" || prev === "todos" ? prev : "sin-cotizacion"
      );
    } else if (processView === "asignar") {
      setPendingStage("sin-equipo");
    } else if (processView === "confirmar") {
      setPendingStage("listo-confirmar");
    }
  }, [processView, dashboardVistaParam]);

  const advance = useMutation({
    mutationFn: (p: {
      id: string;
      status: string;
      deliveredToName?: string;
      deliveredToId?: string;
      note?: string;
    }) => {
      const { id, ...body } = p;
      return apiSend(`/shipments/${id}`, "PATCH", body);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["shipments"] });
      notify("success", "Estado del envío actualizado.");
      notify("info", "Siguiente paso: validá cobranza y cierre de entrega.");
    },
    onError: (e: Error) => {
      setError(e.message);
      notify("error", "No se pudo actualizar estado.");
    },
  });

  const decideRequest = useMutation({
    mutationFn: (payload: {
      id: string;
      status: "confirmado" | "rechazado";
      amount?: number;
      paymentTerm?: "upfront_full" | "upfront_partial" | "delivery";
      upfrontPercent?: number;
      decisionNote?: string;
    }) => apiSend(`/shipments/${payload.id}`, "PATCH", payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["shipments"] });
      notify("success", "Solicitud actualizada.");
      notify("info", "Siguiente paso: revisá equipo asignado y confirmación al cliente.");
    },
    onError: (e: Error) => {
      setError(e.message);
      notify("error", "No se pudo actualizar la solicitud.");
    },
  });

  const savePricing = useMutation({
    mutationFn: (p: {
      id: string;
      amount: number;
      paymentTerm: "upfront_full" | "upfront_partial" | "delivery";
      upfrontPercent?: number;
      decisionNote?: string;
    }) =>
      apiSend(`/shipments/${p.id}`, "PATCH", {
        amount: p.amount,
        paymentTerm: p.paymentTerm,
        ...(p.paymentTerm === "upfront_partial" && p.upfrontPercent !== undefined
          ? { upfrontPercent: p.upfrontPercent }
          : {}),
        ...(p.decisionNote ? { decisionNote: p.decisionNote } : {}),
      }),
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({ queryKey: ["shipments"] });
      setApprovalDrafts((prev) => {
        const next = { ...prev };
        delete next[variables.id];
        return next;
      });
      notify(
        "success",
        "Cotización guardada en el pedido (servidor). El cliente ve el monto en su solicitud. Continuá con conductor y patente."
      );
    },
    onError: (e: Error) => {
      setError(e.message);
      notify("error", "No se pudo guardar cotizacion.");
    },
  });

  const confirmService = useMutation({
    mutationFn: (id: string) => apiSend(`/shipments/${id}`, "PATCH", { status: "confirmado" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["shipments"] });
      setFilter("activos");
      notify("success", "Servicio confirmado: el pedido quedó confirmado en el envío y pasa a operación.");
      notify("info", "Seguilo en «En ejecución» → «En curso». Comprobantes y cobranza en Pagos.");
    },
    onError: (e: Error) => {
      setError(e.message);
      notify("error", "No se pudo confirmar servicio.");
    },
  });

  const assign = useMutation({
    mutationFn: (p: { id: string; driverId?: string; vehicleId?: string }) =>
      apiSend(`/shipments/${p.id}`, "PATCH", { driverId: p.driverId ?? null, vehicleId: p.vehicleId ?? null }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["shipments"] });
      notify("success", "Conductor y vehículo guardados en este envío (pedido).");
    },
    onError: (e: Error) => {
      setError(e.message);
      notify("error", "No se pudo asignar conductor/vehiculo.");
    },
  });

  const saveRoutePlanning = useMutation({
    mutationFn: (p: { id: string; loadSequence: number | null; unloadAccess: string | null }) =>
      apiSend(`/shipments/${p.id}`, "PATCH", {
        loadSequence: p.loadSequence,
        unloadAccess: p.unloadAccess,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["shipments"] });
      notify("success", "Plan de ruta guardado en el envío (secuencia de retiro y acceso a descarga).");
    },
    onError: (e: Error) => {
      setError(e.message);
      notify("error", "No se pudo guardar el plan de ruta.");
    },
  });

  const nextStatus = (s: string) => {
    if (s === "entregado" || s === "rechazado") return "";
    const m: Record<string, string> = {
      confirmado: "recogido",
      recogido: "en_transito",
      en_transito: "entregado",
    };
    return m[s] ?? "";
  };

  const rows = shipmentsQ.data ?? [];
  const filtered = rows.filter((s) => {
    if (filter === "pendientes") {
      if (s.status !== "pendiente") return false;
      const hasQ = shipmentHasQuote(s);
      const hasT = shipmentHasTeam(s);
      if (pendingStage === "falta-cotizacion-o-equipo") return !hasQ || (hasQ && !hasT);
      if (pendingStage === "sin-cotizacion") return !hasQ;
      if (pendingStage === "sin-equipo") return hasQ && !hasT;
      if (pendingStage === "listo-confirmar") return hasQ && hasT;
      return true;
    }
    if (filter === "activos") return ["confirmado", "recogido", "en_transito"].includes(s.status);
    if (filter === "confirmados") return s.status === "confirmado";
    if (filter === "entregas_hoy") return s.status === "entregado" && isTodayDelivered(s.deliveredAt);
    if (filter === "entregas_hoy_revision") {
      const sinReceptor =
        s.status === "entregado" &&
        isTodayDelivered(s.deliveredAt) &&
        !(s.deliveredToName && String(s.deliveredToName).trim());
      const venceHoyAbierto =
        isScheduledDeliveryToday(s.scheduledDelivery) &&
        s.status !== "entregado" &&
        s.status !== "rechazado";
      return sinReceptor || venceHoyAbierto;
    }
    if (filter === "retrasos") return isDelayed(s.status, s.scheduledDelivery);
    if (filter === "alertas") return isRechazoEnDestino(s) || isDelayed(s.status, s.scheduledDelivery);
    if (filter === "entregados") return s.status === "entregado";
    if (filter === "rechazados") return isRechazoFueraDeDestino(s);
    if (filter === "rechazos_entrega") return isRechazoEnDestino(s);
    if (filter === "cobro_pendiente") return shipmentCobroPendiente(s);
    return true;
  });

  const filteredSorted = useMemo(() => [...filtered].sort(compareShipmentsByUrgency), [filtered]);

  const filteredIdsKey = filteredSorted.map((s) => s.id).join("|");
  const selectedEnvioSummary = selectedEnvioId
    ? filteredSorted.find((s) => s.id === selectedEnvioId)
    : undefined;

  /** Si el envío dejó de estar en el filtro actual, cerramos el detalle (filteredIdsKey acota re-ejecuciones). */
  useEffect(() => {
    if (!selectedEnvioId || shipmentsQ.isLoading) return;
    if (!filteredSorted.some((s) => s.id === selectedEnvioId)) {
      setSearchParams((sp) => {
        const n = new URLSearchParams(sp);
        n.delete("envio");
        return n;
      }, { replace: true });
    }
  }, [selectedEnvioId, filteredIdsKey, shipmentsQ.isLoading, setSearchParams, filteredSorted]);

  function toggleEnvioRow(id: string) {
    setSearchParams((sp) => {
      const n = new URLSearchParams(sp);
      const cur = n.get("envio");
      if (cur === id) n.delete("envio");
      else n.set("envio", id);
      return n;
    }, { replace: true });
  }

  function volverAlListado() {
    setSearchParams((sp) => {
      const n = new URLSearchParams(sp);
      n.delete("envio");
      return n;
    }, { replace: true });
  }

  useEffect(() => {
    if (!selectedEnvioId || !detailPanelRef.current) return;
    const el = detailPanelRef.current;
    // En escritorio el detalle va en columna fija; el scroll automático solo en vista estrecha.
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) {
      el.classList.add("ring-2", "ring-blue-300", "ring-offset-2", "rounded-lg", "transition-shadow");
      const t = window.setTimeout(() => {
        el.classList.remove("ring-2", "ring-blue-300", "ring-offset-2", "rounded-lg");
      }, 1600);
      return () => window.clearTimeout(t);
    }
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.classList.add("ring-2", "ring-amber-400", "ring-offset-2", "rounded-xl", "transition-shadow");
    const t = window.setTimeout(() => {
      el.classList.remove("ring-2", "ring-amber-400", "ring-offset-2", "rounded-xl");
    }, 2800);
    return () => window.clearTimeout(t);
  }, [selectedEnvioId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (taskFlowOpen) {
        e.preventDefault();
        setTaskFlowOpen(false);
        return;
      }
      if (listQueryOpen) {
        e.preventDefault();
        setListQueryOpen(false);
        return;
      }
      if (!selectedEnvioId) return;
      e.preventDefault();
      setSearchParams((sp) => {
        const n = new URLSearchParams(sp);
        n.delete("envio");
        return n;
      }, { replace: true });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [taskFlowOpen, listQueryOpen, selectedEnvioId, setSearchParams]);

  const { counts, pendingStageCounts, processCounts } = useMemo(() => {
    let pendientes = 0;
    let confirmados = 0;
    let activos = 0;
    let entregados = 0;
    let entregasHoy = 0;
    let entregasHoyRevision = 0;
    let rechazados = 0;
    let rechazosEntrega = 0;
    let retrasos = 0;
    let alertas = 0;
    let cobroPendiente = 0;
    let sinCotizacion = 0;
    let sinEquipo = 0;
    let listoConfirmar = 0;
    let faltaCotizacionOEquipo = 0;

    for (const s of rows) {
      if (s.status === "pendiente") pendientes += 1;
      if (s.status === "confirmado") confirmados += 1;
      if (["confirmado", "recogido", "en_transito"].includes(s.status)) activos += 1;
      if (s.status === "entregado") entregados += 1;
      if (s.status === "entregado" && isTodayDelivered(s.deliveredAt)) entregasHoy += 1;
      const sinReceptor =
        s.status === "entregado" &&
        isTodayDelivered(s.deliveredAt) &&
        !(s.deliveredToName && String(s.deliveredToName).trim());
      const venceHoyAbierto =
        isScheduledDeliveryToday(s.scheduledDelivery) &&
        s.status !== "entregado" &&
        s.status !== "rechazado";
      if (sinReceptor || venceHoyAbierto) entregasHoyRevision += 1;
      if (isRechazoFueraDeDestino(s)) rechazados += 1;
      if (isRechazoEnDestino(s)) rechazosEntrega += 1;
      if (isDelayed(s.status, s.scheduledDelivery)) retrasos += 1;
      if (isRechazoEnDestino(s) || isDelayed(s.status, s.scheduledDelivery)) alertas += 1;

      if (s.status === "pendiente") {
        const hasQ = shipmentHasQuote(s);
        const hasT = shipmentHasTeam(s);
        if (!hasQ) sinCotizacion += 1;
        if (hasQ && !hasT) sinEquipo += 1;
        if (hasQ && hasT) listoConfirmar += 1;
        if (!hasQ || (hasQ && !hasT)) faltaCotizacionOEquipo += 1;
      }
    }

    const countsObj = {
      pendientes,
      confirmados,
      activos,
      entregados,
      entregasHoy,
      entregasHoyRevision,
      rechazados,
      rechazosEntrega,
      retrasos,
      alertas,
      cobroPendiente,
    };
    const pendingStageCountsObj = {
      sinCotizacion,
      sinEquipo,
      listoConfirmar,
      faltaCotizacionOEquipo,
    };
    const processCountsObj = {
      cotizar: pendingStageCountsObj.sinCotizacion,
      asignar: pendingStageCountsObj.sinEquipo,
      confirmar: pendingStageCountsObj.listoConfirmar,
      ejecucion: countsObj.activos,
      cierre: countsObj.entregados,
    };
    return {
      counts: countsObj,
      pendingStageCounts: pendingStageCountsObj,
      processCounts: processCountsObj,
    };
  }, [rows]);

  function openAssignmentWizard(s: ShipmentRow) {
    const allDrivers = driversQ.data ?? [];
    const suggested = suggestDriverOptions(s, allDrivers, rows, 3);
    const fallback = allDrivers.find((d) => d.assignedVehicle && d.assignedVehicle.status !== "en_taller");
    setAssignmentWizard({
      shipmentId: s.id,
      routeLabel: `${s.origin} → ${s.destination}`,
      suggested,
      allDrivers,
      selectedDriverId: s.driver?.id ?? suggested[0]?.driverId ?? fallback?.id ?? "",
      selectedVehicleId: s.vehicle?.id ?? suggested[0]?.vehicleId ?? fallback?.assignedVehicle?.id ?? "",
    });
  }

  async function applyAssignment(alsoConfirm: boolean) {
    const current = assignmentWizard;
    if (!current) return;
    if (!current.selectedDriverId || !current.selectedVehicleId) {
      setGuardAlert("Seleccioná chofer y vehículo para poder guardar o confirmar la asignación.");
      return;
    }
    try {
      await assign.mutateAsync({
        id: current.shipmentId,
        driverId: current.selectedDriverId,
        vehicleId: current.selectedVehicleId,
      });
      if (alsoConfirm) {
        await confirmService.mutateAsync(current.shipmentId);
        notify("success", "Equipo asignado y servicio confirmado para el cliente.");
      } else {
        notify("success", "Equipo guardado. Cuando esté listo, confirmá el servicio en el paso 3.");
      }
      setAssignmentWizard(null);
    } catch (e: unknown) {
      if (import.meta.env.DEV) console.error("[applyAssignment]", e);
    }
  }

  const taskStepCount = processCounts[processView];
  const envioGrupoActual = envioGrupoFromProcessView(processView);

  const fleetSnapshot = useMemo(() => {
    const list = driversQ.data ?? [];
    const withUnit = list.filter((d) => d.assignedVehicle && d.assignedVehicle.status !== "en_taller");
    const activeDriverIds = new Set(
      rows
        .filter((s) => ["confirmado", "recogido", "en_transito"].includes(s.status) && s.driver?.id)
        .map((s) => s.driver!.id)
    );
    const enRuta = withUnit.filter((d) => activeDriverIds.has(d.id)).length;
    return { choferesConUnidad: withUnit.length, enRuta, disponibles: Math.max(0, withUnit.length - enRuta) };
  }, [rows, driversQ.data]);

  const ventanas48h = useMemo(() => {
    const now = Date.now();
    const limit = now + 48 * 60 * 60 * 1000;
    const acc: { s: ShipmentRow; cuando: number; tipo: "retiro" | "entrega" }[] = [];
    for (const s of rows) {
      if (s.status === "entregado" || s.status === "rechazado") continue;
      if (s.scheduledPickup) {
        const t = new Date(s.scheduledPickup).getTime();
        if (Number.isFinite(t) && t >= now && t <= limit) acc.push({ s, cuando: t, tipo: "retiro" });
      }
      if (s.scheduledDelivery) {
        const t = new Date(s.scheduledDelivery).getTime();
        if (Number.isFinite(t) && t >= now && t <= limit) acc.push({ s, cuando: t, tipo: "entrega" });
      }
    }
    acc.sort((a, b) => a.cuando - b.cuando);
    return acc.slice(0, 14);
  }, [rows]);

  const cierresRecientes = useMemo(
    () =>
      [...rows]
        .filter((s) => s.status === "entregado" && s.deliveredAt)
        .sort((a, b) => new Date(b.deliveredAt!).getTime() - new Date(a.deliveredAt!).getTime())
        .slice(0, 6),
    [rows]
  );

  const listQuerySummary =
    filter === "pendientes" && pendingStage !== "todos"
      ? `${enviosFilterLabel(filter)} · ${pendingStageLabel(pendingStage)}`
      : enviosFilterLabel(filter);

  return (
    <div className="space-y-4">
      <header className="page-header">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-blue-200">Operaciones</p>
            <h1 className="text-xl font-semibold">Envíos</h1>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-blue-100">
              <strong className="font-semibold text-white">Dos familias:</strong>{" "}
              <strong className="font-semibold text-white">solicitudes nuevas</strong> (el cliente cotiza y vos aprobás) y{" "}
              <strong className="font-semibold text-white">envíos listos</strong> (ya en operación: ruta y cierre). Elegilo en el botón{" "}
              «Tipo de envíos». Los <strong className="font-semibold text-white">rechazados</strong> (oficina, pre-ruta o en
              destino) se filtran acá; <strong className="font-semibold text-white">Pagos</strong> sigue siendo para comprobantes y
              cobranzas.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded bg-white px-3 py-2 text-sm font-semibold text-blue-900 hover:bg-blue-50"
              aria-label={`Ver viajes en curso (${processCounts.ejecucion})`}
              onClick={() => {
                stripDashboardVistaFromUrl();
                setProcessView("ejecucion");
                setFilter("activos");
                setPendingStage("todos");
              }}
            >
              Viajes en curso ({processCounts.ejecucion})
            </button>
            <button
              type="button"
              className="rounded bg-blue-500 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-400"
              aria-label={`Aprobar solicitudes pendientes (${counts.pendientes})`}
              onClick={() => {
                stripDashboardVistaFromUrl();
                setProcessView("cotizar");
                setFilter("pendientes");
                setPendingStage("todos");
              }}
            >
              Aprobar solicitudes ({counts.pendientes})
            </button>
            <Link
              className="rounded bg-white px-3 py-2 text-sm font-semibold text-blue-900 hover:bg-blue-50"
              to="/admin/mapa"
            >
              Mapa en ruta
            </Link>
            <Link
              className="rounded border border-white/40 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10"
              to="/admin/pagos"
            >
              Validar pagos
            </Link>
          </div>
        </div>
      </header>

      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded bg-rose-100 px-3 py-2 text-sm text-rose-700"
        >
          <p className="min-w-0 flex-1">{error}</p>
          <button
            type="button"
            aria-label="Cerrar mensaje de error"
            className="shrink-0 rounded border border-rose-300 bg-white px-2 py-0.5 text-xs font-semibold text-rose-800 hover:bg-rose-50"
            onClick={() => setError(null)}
          >
            Cerrar
          </button>
        </div>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-3">
        <button
          type="button"
          className={`flex min-h-[3.25rem] flex-1 items-center justify-between gap-3 rounded-xl border-2 border-white/30 bg-white/95 px-4 py-3 text-left shadow-md ring-1 ring-black/5 transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 ${processStepBadgeClass(processView)}`}
          aria-expanded={taskFlowOpen}
          aria-haspopup="dialog"
          aria-controls={taskFlowPanelId}
          onClick={() => {
            setListQueryOpen(false);
            setTaskFlowOpen(true);
          }}
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-600">
              1 · {envioGrupoTitulo(envioGrupoActual)}
            </span>
            <span className="mt-0.5 block truncate text-sm font-semibold text-slate-900">
              {processViewBadgeLabel(processView)}
              <span className="ml-1.5 tabular-nums text-xs font-medium text-slate-600">
                ({taskStepCount} envío{taskStepCount === 1 ? "" : "s"})
              </span>
            </span>
          </span>
          <ChevronDown className="h-5 w-5 shrink-0 text-slate-500" aria-hidden />
        </button>
        <button
          type="button"
          className={`flex min-h-[3.25rem] flex-1 items-center justify-between gap-3 rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-left shadow-md transition hover:border-slate-300 hover:bg-slate-50/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${filterSelectionBadgeClass(filter)}`}
          aria-expanded={listQueryOpen}
          aria-haspopup="dialog"
          aria-controls={listQueryPanelId}
          onClick={() => {
            setTaskFlowOpen(false);
            setListQueryOpen(true);
          }}
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-600">2 · Consulta en tabla</span>
            <span className="mt-0.5 block truncate text-sm font-semibold text-slate-900">{listQuerySummary}</span>
            <span className="mt-0.5 block text-xs tabular-nums text-slate-600">
              {filtered.length} resultado{filtered.length !== 1 ? "s" : ""}
            </span>
          </span>
          <ChevronDown className="h-5 w-5 shrink-0 text-slate-500" aria-hidden />
        </button>
      </div>

      {taskFlowOpen ? (
        <div
          className="fixed inset-0 z-[85] flex items-center justify-center bg-black/45 p-4"
          role="presentation"
          onClick={() => setTaskFlowOpen(false)}
        >
          <div
            id={taskFlowPanelId}
            role="dialog"
            aria-modal="true"
            aria-labelledby={taskFlowTitleId}
            className="flex max-h-[min(92vh,56rem)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[85vh] sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
              <h2 id={taskFlowTitleId} className="text-base font-semibold text-slate-900">
                Tipo de envíos
              </h2>
              <button
                type="button"
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                onClick={() => setTaskFlowOpen(false)}
              >
                Cerrar
              </button>
            </div>
            <div className="min-h-0 overflow-y-auto p-4">
              <section className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${PROCESS_SECTION_TOP[processView]}`}>
                <div className="border-b border-slate-100 pb-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Paso 1 de 2</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">
                    Primero elegí si trabajás <strong className="font-semibold text-slate-800">pedidos nuevos del cliente</strong>{" "}
                    (cotización y aprobación) o <strong className="font-semibold text-slate-800">envíos ya listos</strong> (en ruta y
                    cierre). Después afiná la etapa con los botones de cada bloque.
                  </p>
                </div>
                <div className="mt-4 space-y-5">
                  <div className="rounded-xl border border-amber-200/80 bg-gradient-to-br from-amber-50/90 to-white p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-amber-900">1 · Solicitudes nuevas</p>
                    <p className="mt-1 text-[11px] leading-snug text-amber-950/90">
                      El cliente pidió transporte: falta precio, equipo o avisar que salís. Nada de esto está todavía &quot;en
                      camino&quot; en serio.
                    </p>
                    <p className="mt-1 text-[11px] tabular-nums font-medium text-amber-950/85">
                      {counts.pendientes} solicitud{counts.pendientes !== 1 ? "es" : ""} pendiente
                      {counts.pendientes !== 1 ? "s" : ""} de aprobar (total)
                    </p>
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                      {([
                        ["cotizar", "Cotizar precio", processCounts.cotizar],
                        ["asignar", "Asignar equipo", processCounts.asignar],
                        ["confirmar", "Confirmar al cliente", processCounts.confirmar],
                      ] as const).map(([key, label, n], i) => {
                        const st = PROCESS_STEP_CARD[key];
                        const on = processView === key;
                        return (
                          <button
                            key={key}
                            type="button"
                            aria-pressed={on}
                            onClick={() => {
                              stripDashboardVistaFromUrl();
                              setProcessView(key);
                              if (key === "cotizar") {
                                setFilter("pendientes");
                                setPendingStage("sin-cotizacion");
                              } else if (key === "asignar") {
                                setFilter("pendientes");
                                setPendingStage("sin-equipo");
                              } else {
                                setFilter("pendientes");
                                setPendingStage("listo-confirmar");
                              }
                              setTaskFlowOpen(false);
                            }}
                            className={`flex flex-col rounded-lg border px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 ${
                              on ? st.active : st.idle
                            }`}
                          >
                            <span
                              className={`text-[10px] font-semibold uppercase tracking-wide ${on ? st.stepActive : st.stepMuted}`}
                            >
                              Nuevo · paso {i + 1} de 3
                              {on ? " · elegido" : ""}
                            </span>
                            <span className={`mt-0.5 text-sm font-semibold ${on ? "text-slate-950" : "text-slate-800"}`}>{label}</span>
                            <span className={`mt-1 text-[11px] tabular-nums ${on ? st.countActive : st.countIdle}`}>
                              {n} envío{n === 1 ? "" : "s"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="rounded-xl border border-cyan-200/80 bg-gradient-to-br from-cyan-50/80 to-white p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-cyan-900">2 · En operación (listos)</p>
                    <p className="mt-1 text-[11px] leading-snug text-cyan-950/90">
                      Ya aprobados: salida, retiro, ruta y entrega. Acá seguís lo que está circulando o cerrás el día.
                    </p>
                    <p className="mt-1 text-[11px] tabular-nums font-medium text-cyan-950/85">
                      {counts.activos} en curso · {counts.entregados} entregado{counts.entregados !== 1 ? "s" : ""} (histórico)
                    </p>
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {([
                        ["ejecucion", "En ejecución (ruta)", processCounts.ejecucion],
                        ["cierre", "Cierre y entregas", processCounts.cierre],
                      ] as const).map(([key, label, n], i) => {
                        const st = PROCESS_STEP_CARD[key];
                        const on = processView === key;
                        return (
                          <button
                            key={key}
                            type="button"
                            aria-pressed={on}
                            onClick={() => {
                              stripDashboardVistaFromUrl();
                              setProcessView(key);
                              if (key === "ejecucion") {
                                setFilter("activos");
                                setPendingStage("todos");
                              } else {
                                setFilter("entregados");
                                setPendingStage("todos");
                              }
                              setTaskFlowOpen(false);
                            }}
                            className={`flex flex-col rounded-lg border px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 focus-visible:ring-offset-2 ${
                              on ? st.active : st.idle
                            }`}
                          >
                            <span
                              className={`text-[10px] font-semibold uppercase tracking-wide ${on ? st.stepActive : st.stepMuted}`}
                            >
                              Listo · {i === 0 ? "viajes activos" : "cierre"}
                              {on ? " · elegido" : ""}
                            </span>
                            <span className={`mt-0.5 text-sm font-semibold ${on ? "text-slate-950" : "text-slate-800"}`}>{label}</span>
                            <span className={`mt-1 text-[11px] tabular-nums ${on ? st.countActive : st.countIdle}`}>
                              {n} envío{n === 1 ? "" : "s"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <p
                  className={`mt-3 rounded-lg border px-3 py-2 text-[11px] leading-relaxed text-slate-800 ${PROCESS_HINT_BAR[processView]}`}
                >
                  <span className="font-semibold text-slate-900">Qué hacer en esta etapa: </span>
                  {processView === "cotizar" && "Definí y guardá la cotización de cada solicitud pendiente."}
                  {processView === "asignar" && "Asigná conductor y vehículo a envíos ya cotizados."}
                  {processView === "confirmar" && "Confirmá el servicio al cliente cuando el equipo esté listo."}
                  {processView === "ejecucion" && "Avanzá el estado operativo hasta completar la entrega."}
                  {processView === "cierre" && "Revisá entregas cerradas y la trazabilidad final."}
                </p>

                {processView === "cotizar" || processView === "asignar" || processView === "confirmar" ? (
                  <div className="mt-4 rounded-lg border border-amber-200/80 bg-amber-50/50 p-3">
                    <p className="text-[11px] font-semibold text-amber-950">Pendientes en la tabla</p>
                    <p className="mt-0.5 text-[10px] leading-snug text-amber-950/90">
                      Misma idea que la tarea de arriba: elegí qué cola de pendientes ves. «Todos» muestra todos los pendientes sin
                      filtrar por paso.
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                      {([
                        ["todos", "Todos", counts.pendientes, null] as const,
                        ["sin-cotizacion", "Falta cotización", pendingStageCounts.sinCotizacion, "cotizar"] as const,
                        ["sin-equipo", "Falta equipo", pendingStageCounts.sinEquipo, "asignar"] as const,
                        ["listo-confirmar", "Listo para confirmar", pendingStageCounts.listoConfirmar, "confirmar"] as const,
                        [
                          "falta-cotizacion-o-equipo",
                          "Sin cotiz. o sin equipo",
                          pendingStageCounts.faltaCotizacionOEquipo,
                          "cotizar",
                        ] as const,
                      ]).map(([stageKey, stageLabel, stageCount, syncProcess]) => {
                        const on = pendingStage === stageKey;
                        return (
                          <button
                            key={stageKey}
                            type="button"
                            aria-pressed={on}
                            onClick={() => {
                              stripDashboardVistaFromUrl();
                              setFilter("pendientes");
                              setPendingStage(stageKey);
                              if (syncProcess) setProcessView(syncProcess);
                              setTaskFlowOpen(false);
                            }}
                            className={`rounded-lg border px-2.5 py-2 text-left text-[11px] font-semibold leading-tight transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 sm:px-3 sm:py-1.5 ${
                              on
                                ? "border-2 border-amber-500 bg-amber-100 text-amber-950 shadow-sm ring-1 ring-amber-400/40"
                                : "border-amber-200/80 bg-white/90 text-amber-950 hover:border-amber-300 hover:bg-amber-50/60"
                            }`}
                          >
                            <span className="block">{stageLabel}</span>
                            <span className="mt-0.5 block tabular-nums text-[10px] font-medium opacity-90">
                              {stageCount} envío{stageCount === 1 ? "" : "s"}
                              {on ? " · activo" : ""}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {pendingStage === "falta-cotizacion-o-equipo" ? (
                      <p className="mt-2 text-[10px] leading-snug text-slate-600">
                        Incluye sin cotización o sin equipo (excluye listos para confirmar).
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </section>
            </div>
          </div>
        </div>
      ) : null}

      {listQueryOpen ? (
        <div
          className="fixed inset-0 z-[85] flex items-center justify-center bg-black/45 p-4"
          role="presentation"
          onClick={() => setListQueryOpen(false)}
        >
          <div
            id={listQueryPanelId}
            role="dialog"
            aria-modal="true"
            aria-labelledby={listQueryTitleId}
            className="flex max-h-[min(92vh,56rem)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[85vh] sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
              <h2 id={listQueryTitleId} className="text-base font-semibold text-slate-900">
                Elegir consulta (lista)
              </h2>
              <button
                type="button"
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                onClick={() => setListQueryOpen(false)}
              >
                Cerrar
              </button>
            </div>
            <div className="min-h-0 overflow-y-auto p-4">
              <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Consulta en tabla</p>
                <h3 className="mt-0.5 text-base font-semibold text-slate-900">Elegí la lista</h3>
                <p className="mt-1 text-xs leading-snug text-slate-600">{PROCESS_LIST_INTRO[processView]}</p>
                <p className="sr-only">
                  El filtro activo es el que aparece resaltado. Cada botón tiene una descripción al pasar el mouse o al enfocarlo.
                </p>

                <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50/80 p-3">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-600">Vistas disponibles</p>
                  <p className="mb-2 text-[10px] text-slate-500">
                    Sugerido para esta tarea:{" "}
                    <strong className="font-semibold text-slate-700">
                      {enviosFilterLabel(DEFAULT_FILTER_BY_PROCESS[processView])}
                    </strong>
                    .
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {sortFiltersForList(FILTERS_BY_PROCESS[processView]).map((f) => {
                      const p = FILTER_CHIP_PROPS[f];
                      return (
                        <EnviosFilterChip
                          key={f}
                          tone={p.tone}
                          accent={p.accent}
                          active={filter === f}
                          hint={ENV_FILTER_HINTS[f]}
                          onClick={() => {
                            stripDashboardVistaFromUrl();
                            setFilter(f);
                            setListQueryOpen(false);
                          }}
                          label={enviosFilterLabel(f)}
                          count={enviosFilterCount(f, counts, rows.length)}
                        />
                      );
                    })}
                  </div>
                </div>

                {filter === "pendientes" &&
                (processView === "cotizar" || processView === "asignar" || processView === "confirmar") ? (
                  <p className="mt-3 rounded-lg border border-amber-100 bg-amber-50/40 px-3 py-2 text-[11px] leading-snug text-amber-950">
                    <strong className="font-semibold">Pendientes:</strong> el corte (cotización, equipo, confirmar…) lo cambiás en{" "}
                    <strong className="font-semibold">Elegir tarea</strong>, bloque «Pendientes en la tabla», para no repetir la misma
                    decisión acá.
                  </p>
                ) : null}

                <details className="mt-4 rounded-lg border border-slate-100 bg-slate-50/90 px-3 py-2 text-slate-800">
                  <summary className="cursor-pointer text-xs font-semibold text-slate-700">
                    Glosario: qué incluye cada lista
                  </summary>
                  <ul className="mt-2 list-inside list-disc space-y-1.5 text-[11px] leading-snug text-slate-600">
                    <li>
                      <strong>Rechazos de envío (operación):</strong> se listan y resuelven acá con los filtros de abajo (p. ej. «Rechazo
                      por admin o pre-ruta», «Rechazo en destino», «Rechazos y retrasos»). <strong>Pagos</strong> es solo para
                      comprobantes y cobranza de transferencias; no sustituye Envíos para incidencias de entrega.
                    </li>
                    <li>
                      <strong>Botones que ves:</strong> cambian según la tarea del paso 1. Si cambiás de tarea y el filtro ya no sirve,
                      la pantalla elige uno válido solo.
                    </li>
                    <li>
                      <strong>Pendientes de aprobar:</strong> estado <code className="rounded bg-white px-0.5">pendiente</code>. Las
                      sub-pestañas acotan por cotización / equipo / listo para confirmar.
                    </li>
                    <li>
                      <strong>Confirmados:</strong> solo <code className="rounded bg-white px-0.5">confirmado</code> (aprobado con
                      equipo; aún sin recoger). Es parte de lo que cuenta &quot;En curso&quot;, pero acá ves solo esa etapa.
                    </li>
                    <li>
                      <strong>En curso:</strong> <code className="rounded bg-white px-0.5">confirmado</code> +{" "}
                      <code className="rounded bg-white px-0.5">recogido</code> +{" "}
                      <code className="rounded bg-white px-0.5">en_transito</code>: todo lo operativo antes de cerrar entrega.
                    </li>
                    <li>
                      <strong>Entregas hoy:</strong> ya marcados como <code className="rounded bg-white px-0.5">entregado</code> con
                      fecha de cierre <strong>hoy</strong> (lista de cierres del día).
                    </li>
                    <li>
                      <strong>Entregas hoy a revisar:</strong> acción pendiente vinculada a hoy: entrega{" "}
                      <strong>programada para hoy</strong> y el envío sigue abierto, o bien entregado hoy pero{" "}
                      <strong>sin receptor</strong> registrado.
                    </li>
                    <li>
                      <strong>Retrasos:</strong> fecha de entrega comprometida ya vencida y el envío sigue sin entregar ni rechazar.{" "}
                      <strong>No</strong> incluye rechazados.
                    </li>
                    <li>
                      <strong>Cobro pendiente / parcial:</strong> envíos no rechazados con pago{" "}
                      <code className="rounded bg-white px-0.5">pendiente</code> o{" "}
                      <code className="rounded bg-white px-0.5">parcial</code>. Para comprobantes y validación usá{" "}
                      <strong>Pagos</strong>.
                    </li>
                    <li>
                      <strong>Rechazos y retrasos:</strong> solo <strong>rechazos en destino</strong> (incidencia con recepción o
                      carga) + <strong>retrasos</strong>. Los rechazos de solicitud por admin o en el retiro (sin llegar a destino) no
                      entran acá.
                    </li>
                    <li>
                      <strong>Rechazo por admin o pre-ruta:</strong> envíos <code className="rounded bg-white px-0.5">rechazado</code>{" "}
                      que <strong>no</strong> son incidencia en destino: solicitud rechazada desde oficina; y rechazo cuando el chofer ya
                      está en el retiro o antes de salir (por ejemplo la carga no cabe en el camión o solo entra una parte, o no coincide
                      con lo acordado), con envío aún confirmado y sin marcar como recogido. Datos antiguos sin fase también aparecen
                      acá.
                    </li>
                    <li>
                      <strong>Rechazo en destino:</strong> solo rechazo en ruta o en descarga (fase{" "}
                      <code className="rounded bg-white px-0.5">en_entrega</code>).
                    </li>
                    <li>
                      <strong>Entregados:</strong> envíos ya entregados.
                    </li>
                    <li>
                      <strong>Todos:</strong> sin filtro por estado (auditoría rápida).
                    </li>
                  </ul>
                  <p className="mt-2 text-[10px] text-slate-500">
                    Si querés menos botones: lo más redundante suele ser <strong>Retrasos</strong> frente a{" "}
                    <strong>Rechazos y retrasos</strong> (los retrasos ya están incluidos ahí). <strong>Confirmados</strong> frente a{" "}
                    <strong>En curso</strong> se solapa en parte; mantenelos si operás primero &quot;solo confirmados&quot; y después el
                    resto del pipeline.
                  </p>
                </details>
              </section>
            </div>
          </div>
        </div>
      ) : null}

        <div className="min-w-0">
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className={`border-b px-4 py-3 ${enviosListBannerClass(filter)}`}>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">Tabla de envíos</p>
          <p className="mt-1 text-[11px] text-slate-600">
            Estás viendo la combinación: <strong className="text-slate-800">tarea «{processViewBadgeLabel(processView)}»</strong>{" "}
            + lista <strong className="text-slate-800">«{enviosFilterLabel(filter)}»</strong>
            {filter === "pendientes" && pendingStage !== "todos"
              ? ` · pendientes: ${pendingStageLabel(pendingStage)}`
              : ""}
            .
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold shadow-sm ${processStepBadgeClass(processView)}`}
            >
              Tarea: {processViewBadgeLabel(processView)}
            </span>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold shadow-sm ${filterSelectionBadgeClass(filter)}`}
            >
              Lista: {enviosFilterLabel(filter)}
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-700">
            <span className="tabular-nums font-bold text-slate-900">{filtered.length}</span> envío
            {filtered.length !== 1 ? "s" : ""} que coinciden.
            {selectedEnvioId
              ? " En pantalla ancha el detalle queda al lado; en el celular, debajo con la tabla más corta. Tocá de nuevo la fila o «Volver»."
              : " Tocá una fila para ver datos y acciones al instante."}
          </p>
        </div>
        {shipmentsQ.isLoading ? <p className="p-4 text-sm text-slate-500">Cargando solicitudes…</p> : null}
        {!shipmentsQ.isLoading ? (
          <div
            className={
              selectedEnvioId
                ? "lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(300px,42%)] lg:items-start lg:border-b lg:border-slate-100"
                : "border-b border-slate-100"
            }
          >
            <div className="min-w-0 lg:border-r lg:border-slate-100">
              <p className="px-4 pt-2 text-[11px] text-slate-500">
                {selectedEnvioId
                  ? "Tabla más compacta mientras tenés un envío abierto; el detalle está al lado (o abajo en móvil)."
                  : "Desplazate en la tabla para ver todas las filas."}
              </p>
              <div
                className={`table-wrap overflow-y-auto ${
                  selectedEnvioId
                    ? "max-h-[min(40vh,360px)] sm:max-h-[min(48vh,440px)] lg:max-h-[min(78vh,820px)]"
                    : "max-h-[min(70vh,720px)]"
                }`}
              >
                <table className="table-pro">
                  <caption className="sr-only">
                    Tarea «{processViewBadgeLabel(processView)}», lista «{enviosFilterLabel(filter)}
                    {filter === "pendientes" && pendingStage !== "todos"
                      ? ` · ${pendingStageLabel(pendingStage)}`
                      : ""}
                    ». {filteredSorted.length} envío{filteredSorted.length !== 1 ? "s" : ""} en la tabla.
                  </caption>
                  <thead className="sticky top-0 z-10 bg-slate-50 shadow-sm">
                    <tr>
                      <th scope="col" className="w-8">
                        <span className="sr-only">Expandir o contraer detalle</span>
                      </th>
                      <th scope="col">Ruta</th>
                      <th scope="col">Fecha Retiro</th>
                      <th scope="col">Fecha Entrega</th>
                      <th scope="col">Duración estimada</th>
                      <th scope="col">Riesgo / situación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSorted.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-600">
                          No hay envíos con el filtro «{enviosFilterLabel(filter)}
                          {filter === "pendientes" && pendingStage !== "todos"
                            ? ` · ${pendingStageLabel(pendingStage)}`
                            : ""}
                          ».
                        </td>
                      </tr>
                    ) : (
                      filteredSorted.map((s) => {
                        const duration = getDurationText(s.scheduledPickup, s.scheduledDelivery);
                        const delayed = isDelayed(s.status, s.scheduledDelivery);
                        const sinCot = s.status === "pendiente" && !shipmentHasQuote(s);
                        const sinEq = s.status === "pendiente" && shipmentHasQuote(s) && !shipmentHasTeam(s);
                        const cobro = shipmentCobroPendiente(s);
                        const rechDest = isRechazoEnDestino(s);
                        const active = selectedEnvioId === s.id;
                        return (
                          <tr
                            key={`summary-${s.id}`}
                            className={`border-l-[3px] border-l-transparent hover:bg-slate-100/80 ${
                              active
                                ? "border-l-blue-600 bg-blue-100/90 shadow-[inset_0_0_0_1px_rgba(37,99,235,0.25)]"
                                : ""
                            }`}
                          >
                            <td className="w-8 p-0 align-middle">
                              <button
                                type="button"
                                aria-expanded={active}
                                aria-controls={`admin-envio-${s.id}`}
                                className="flex h-full w-full items-center justify-center p-2 text-slate-600 hover:bg-slate-200/80 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset"
                                onClick={() => toggleEnvioRow(s.id)}
                              >
                                {active ? (
                                  <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
                                ) : (
                                  <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
                                )}
                                <span className="sr-only">
                                  {active ? "Contraer detalle del envío" : "Expandir detalle del envío"}
                                </span>
                              </button>
                            </td>
                            <td className="cursor-pointer" onClick={() => toggleEnvioRow(s.id)}>
                              {s.origin} → {s.destination}
                            </td>
                            <td className="cursor-pointer" onClick={() => toggleEnvioRow(s.id)}>
                              {fmt(s.scheduledPickup)}
                            </td>
                            <td className="cursor-pointer" onClick={() => toggleEnvioRow(s.id)}>
                              {fmt(s.scheduledDelivery)}
                            </td>
                            <td className="cursor-pointer" onClick={() => toggleEnvioRow(s.id)}>
                              {duration}
                            </td>
                            <td className="cursor-pointer" onClick={() => toggleEnvioRow(s.id)}>
                              <div className="flex max-w-[14rem] flex-wrap gap-1">
                                {delayed ? (
                                  <span className="badge badge-bad">Retraso</span>
                                ) : null}
                                {sinCot ? (
                                  <span className="rounded bg-amber-100 px-1.5 py-px text-[10px] font-semibold text-amber-900 ring-1 ring-amber-200">
                                    Sin cotizar
                                  </span>
                                ) : null}
                                {sinEq ? (
                                  <span className="rounded bg-violet-100 px-1.5 py-px text-[10px] font-semibold text-violet-900 ring-1 ring-violet-200">
                                    Sin equipo
                                  </span>
                                ) : null}
                                {cobro ? (
                                  <span className="rounded bg-violet-50 px-1.5 py-px text-[10px] font-semibold text-violet-950 ring-1 ring-violet-300">
                                    Cobro
                                  </span>
                                ) : null}
                                {rechDest ? (
                                  <span className="rounded bg-orange-100 px-1.5 py-px text-[10px] font-semibold text-orange-950 ring-1 ring-orange-200">
                                    Rechazo destino
                                  </span>
                                ) : null}
                                {!delayed && !sinCot && !sinEq && !cobro && !rechDest ? (
                                  <span className="badge badge-ok">Al día</span>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {selectedEnvioId ? (
              <aside
                aria-label="Detalle del envío seleccionado"
                className="min-w-0 max-h-[70vh] overflow-y-auto border-t border-slate-200 bg-slate-50/50 lg:sticky lg:top-4 lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto lg:border-t-0 lg:border-l lg:bg-white lg:shadow-sm"
              >
                <div className="sticky top-0 z-10 flex items-start justify-between gap-2 border-b border-slate-200 bg-white/95 px-3 py-2 backdrop-blur-sm">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Detalle del envío</p>
                    {selectedEnvioSummary ? (
                      <p
                        className="mt-0.5 truncate text-xs font-medium text-slate-800"
                        title={`${selectedEnvioSummary.origin} → ${selectedEnvioSummary.destination}`}
                      >
                        {selectedEnvioSummary.origin} → {selectedEnvioSummary.destination}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-800 hover:bg-slate-50"
                    onClick={volverAlListado}
                    aria-label="Volver al listado de envíos"
                  >
                    <ChevronLeft className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    Volver
                  </button>
                </div>
                <div ref={detailPanelRef} className="divide-y divide-slate-100">
            {filteredSorted
              .filter((s) => s.id === selectedEnvioId)
              .map((s) => (
            <article
              key={s.id}
              id={`admin-envio-${s.id}`}
              className="flex flex-col gap-3 p-4 md:flex-row md:items-start md:justify-between"
            >
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold text-slate-900">
                  {s.origin} → {s.destination}
                </h3>
                <div className="mt-2 rounded-lg border border-slate-100 bg-slate-50/90 p-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">Línea de tiempo (resumen)</p>
                  <ol className="mt-1 list-inside list-decimal space-y-0.5 text-[11px] leading-snug text-slate-700">
                    <li>Solicitud: {fmt(s.createdAt)}</li>
                    <li>Estado: {statusLabel(s.status)}</li>
                    {nextStatus(s.status) ? <li>Próximo paso interno: {nextStatusLabel(s.status)}</li> : null}
                    <li>
                      Retiro: {fmt(s.scheduledPickup)} · Entrega: {fmt(s.scheduledDelivery)}
                    </li>
                    <li>
                      Pago: {paymentLabel(s.paymentStatus)} · Total: {fmtClp(s.totalAmount)}
                    </li>
                  </ol>
                </div>
                <EnvioReadinessBlock shipmentId={s.id} />
                <p className="text-sm text-slate-600">Cliente: {s.customer.name}</p>
                <p className="text-xs text-slate-500">
                  Conductor: {s.driver?.fullName ?? "—"} · Patente: {s.vehicle?.plate ?? "—"}
                </p>
                <p className="text-xs text-slate-500">
                  Carga: {s.cargoType ?? "—"} {s.requiresHelper ? "· Con peoneta" : ""}
                </p>
                <p className="text-xs text-slate-500">
                  Bultos: {fmtMetric(s.cargoQuantity)} · Peso: {fmtMetric(s.cargoWeightKg)} kg · Volumen: {fmtMetric(s.cargoVolumeM3)} m³ · Ayudante: {s.requiresHelper ? "Sí" : "No"}
                </p>
                {["confirmado", "recogido", "en_transito"].includes(s.status) ? (
                  <RoutePlanningInline
                    shipment={s}
                    saving={saveRoutePlanning.isPending}
                    onSave={(loadSequence, unloadAccess) =>
                      saveRoutePlanning.mutate({ id: s.id, loadSequence, unloadAccess })
                    }
                  />
                ) : null}
                {s.deliveredToName ? (
                  <p className="text-xs text-slate-500">
                    Entrega a: {s.deliveredToName}
                    {s.deliveredToId ? ` (${s.deliveredToId})` : ""}
                  </p>
                ) : null}
                <p className="mt-1 text-[11px] text-slate-400">
                  Solicitado: {new Date(s.createdAt).toLocaleString("es-CL")}
                </p>
                {s.decisionNote ? (
                  <p className="mt-1 rounded bg-slate-50 px-2 py-1 text-xs italic text-slate-600">“{s.decisionNote}”</p>
                ) : null}
              </div>
              <div className="flex flex-col items-start gap-2 md:w-72 md:items-end">
                <div className="flex flex-wrap gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusTone(s.status)}`}>
                    {statusLabel(s.status)}
                  </span>
                  {s.status === "rechazado" && rejectionPhaseLabel(s.rejectionPhase) ? (
                    <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-900 ring-1 ring-rose-200">
                      {rejectionPhaseLabel(s.rejectionPhase)}
                    </span>
                  ) : null}
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${paymentTone(s.paymentStatus)}`}>
                    {paymentLabel(s.paymentStatus)}
                  </span>
                </div>
                <div className="text-xs text-slate-600">
                  <div>Total: <strong>{fmtClp(s.totalAmount)}</strong></div>
                  <div>Modalidad: {paymentTermLabel(s.paymentTerm)}</div>
                  {s.upfrontAmount ? <div>Anticipo: {fmtClp(s.upfrontAmount)}</div> : null}
                </div>

                <div className="grid w-full grid-cols-1 gap-2 md:grid-cols-2">
                  {s.status === "pendiente" ? (
                    <>
                      {(() => {
                        const hasQ = shipmentHasQuote(s);
                        const hasT = shipmentHasTeam(s);
                        const readyHint = confirmReadinessHint(s);
                        const company = settingsQ.data?.company ?? null;
                        const draft = approvalDrafts[s.id];
                        const quoteDirty = isQuoteDirty(s, draft, company);
                        const saveQuoteDisabled =
                          savePricing.isPending ||
                          confirmService.isPending ||
                          (hasQ && !quoteDirty);
                        return (
                          <div className="col-span-full space-y-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                            <div className="space-y-2 border-b border-slate-100 pb-2">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                  Flujo de aprobación
                                </span>
                                <button
                                  type="button"
                                  className="text-[11px] font-semibold text-rose-700 underline decoration-rose-300 hover:text-rose-900 disabled:opacity-50"
                                  disabled={decideRequest.isPending}
                                  onClick={() =>
                                    setActionModal({
                                      type: "reject",
                                      shipment: s,
                                      note: s.decisionNote ?? "Solicitud rechazada",
                                    })
                                  }
                                >
                                  No procede — rechazar
                                </button>
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                                <span
                                  className={`rounded-full px-2 py-0.5 ${
                                    hasQ ? "bg-emerald-100 font-medium text-emerald-900" : "bg-amber-100 text-amber-900"
                                  }`}
                                >
                                  {hasQ ? "✓ Paso 1" : "1"} · Cotización
                                </span>
                                <span className="text-slate-300">→</span>
                                <span
                                  className={`rounded-full px-2 py-0.5 ${
                                    hasT ? "bg-emerald-100 font-medium text-emerald-900" : hasQ ? "bg-blue-100 text-blue-900" : "bg-slate-100 text-slate-500"
                                  }`}
                                >
                                  {hasT ? "✓ Paso 2" : "2"} · Equipo
                                </span>
                                <span className="text-slate-300">→</span>
                                <span
                                  className={`rounded-full px-2 py-0.5 ${
                                    hasQ && hasT ? "bg-blue-100 font-medium text-blue-900" : "bg-slate-100 text-slate-500"
                                  }`}
                                >
                                  3 · Confirmar
                                </span>
                              </div>
                            </div>

                            <div className="rounded border border-emerald-100 bg-emerald-50/50 p-2">
                              <p className="mb-2 text-xs font-semibold text-emerald-900">Paso 1 — Monto y forma de pago</p>
                              <div className="grid gap-2 md:grid-cols-2">
                                <input
                                  className="rounded border border-slate-300 px-2 py-1 text-sm"
                                  placeholder="Monto final (obligatorio)"
                                  value={
                                    approvalDrafts[s.id]?.amount ??
                                    String(
                                      s.totalAmount ?? s.amount ?? suggestedAmount(s, settingsQ.data?.company)
                                    )
                                  }
                                  onChange={(e) =>
                                    setApprovalDrafts((prev) => ({
                                      ...prev,
                                      [s.id]: {
                                        amount: e.target.value,
                                        paymentTerm: prev[s.id]?.paymentTerm ?? "delivery",
                                        upfrontPercent: prev[s.id]?.upfrontPercent ?? "50",
                                        decisionNote: prev[s.id]?.decisionNote ?? "Solicitud aprobada",
                                      },
                                    }))
                                  }
                                />
                                <select
                                  className="rounded border border-slate-300 px-2 py-1 text-sm"
                                  value={approvalDrafts[s.id]?.paymentTerm ?? "delivery"}
                                  onChange={(e) =>
                                    setApprovalDrafts((prev) => ({
                                      ...prev,
                                      [s.id]: {
                                        amount: prev[s.id]?.amount ?? "",
                                        paymentTerm: e.target.value as "upfront_full" | "upfront_partial" | "delivery",
                                        upfrontPercent: prev[s.id]?.upfrontPercent ?? "50",
                                        decisionNote: prev[s.id]?.decisionNote ?? "Solicitud aprobada",
                                      },
                                    }))
                                  }
                                  title="Cómo se acuerda el cobro con el cliente"
                                >
                                  {PAYMENT_TERM_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value} title={opt.shortHint}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                                {(approvalDrafts[s.id]?.paymentTerm ?? "delivery") === "upfront_partial" ? (
                                  <input
                                    className="rounded border border-slate-300 px-2 py-1 text-sm"
                                    placeholder="% anticipo (1-100)"
                                    value={approvalDrafts[s.id]?.upfrontPercent ?? "50"}
                                    onChange={(e) =>
                                      setApprovalDrafts((prev) => ({
                                        ...prev,
                                        [s.id]: {
                                          amount: prev[s.id]?.amount ?? "",
                                          paymentTerm: prev[s.id]?.paymentTerm ?? "upfront_partial",
                                          upfrontPercent: e.target.value,
                                          decisionNote: prev[s.id]?.decisionNote ?? "Solicitud aprobada",
                                        },
                                      }))
                                    }
                                  />
                                ) : null}
                                <input
                                  className="rounded border border-slate-300 px-2 py-1 text-sm md:col-span-2"
                                  placeholder="Mensaje para el cliente (opcional)"
                                  value={approvalDrafts[s.id]?.decisionNote ?? ""}
                                  onChange={(e) =>
                                    setApprovalDrafts((prev) => ({
                                      ...prev,
                                      [s.id]: {
                                        amount: prev[s.id]?.amount ?? "",
                                        paymentTerm: prev[s.id]?.paymentTerm ?? "delivery",
                                        upfrontPercent: prev[s.id]?.upfrontPercent ?? "50",
                                        decisionNote: e.target.value,
                                      },
                                    }))
                                  }
                                />
                              </div>
                              <button
                                type="button"
                                className={`mt-2 rounded px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed ${
                                  hasQ && !quoteDirty
                                    ? "border border-emerald-200 bg-emerald-50 text-emerald-900"
                                    : "bg-slate-800 text-white hover:bg-slate-700"
                                } disabled:opacity-50`}
                                title={
                                  hasQ && !quoteDirty
                                    ? "Esta cotización ya está guardada en el pedido. Cambiá monto o modalidad para actualizar, o pasá al paso 2."
                                    : "Guarda monto y forma de pago en el servidor (visible para el cliente)."
                                }
                                disabled={saveQuoteDisabled}
                                onClick={async () => {
                                  const draft = approvalDrafts[s.id];
                                  const fallbackAmount = Number(
                                    s.totalAmount ?? s.amount ?? suggestedAmount(s, settingsQ.data?.company)
                                  );
                                  const rawDraftAmount = draft?.amount?.trim();
                                  const amountValue =
                                    rawDraftAmount && rawDraftAmount.length > 0
                                      ? Number(rawDraftAmount.replace(",", "."))
                                      : fallbackAmount;
                                  if (!Number.isFinite(amountValue) || amountValue <= 0) {
                                    setError("Asigná un precio válido antes de guardar.");
                                    setGuardAlert("Asigná un precio válido antes de guardar la cotización.");
                                    return;
                                  }
                                  const paymentTerm = draft?.paymentTerm ?? "delivery";
                                  const upfrontPercent =
                                    paymentTerm === "upfront_partial"
                                      ? Number(draft?.upfrontPercent ?? "50")
                                      : undefined;
                                  if (
                                    paymentTerm === "upfront_partial" &&
                                    (!Number.isFinite(upfrontPercent) ||
                                      upfrontPercent! <= 0 ||
                                      upfrontPercent! > 100)
                                  ) {
                                    setError("Para anticipo parcial define un porcentaje entre 1 y 100.");
                                    setGuardAlert("Para anticipo parcial definí un porcentaje entre 1 y 100.");
                                    return;
                                  }
                                  const autoDecisionNote = buildApprovalMessage(
                                    amountValue,
                                    paymentTerm,
                                    paymentTerm === "upfront_partial" ? upfrontPercent : undefined
                                  );
                                  try {
                                    await savePricing.mutateAsync({
                                      id: s.id,
                                      amount: amountValue,
                                      paymentTerm,
                                      upfrontPercent,
                                      decisionNote: draft?.decisionNote?.trim() || autoDecisionNote,
                                    });
                                  } catch {
                                    /* mutation */
                                  }
                                }}
                              >
                                {hasQ && !quoteDirty
                                  ? "Cotización guardada"
                                  : hasQ && quoteDirty
                                    ? "Actualizar cotización"
                                    : "Guardar cotización"}
                              </button>
                              <p className="mt-2 text-[11px] leading-snug text-slate-600">
                                <strong className="text-slate-700">Dónde queda:</strong> al guardar, el monto y la
                                modalidad se graban en <strong>este envío</strong> (base de datos). El cliente los ve en
                                su pedido; no es un archivo aparte.
                              </p>
                              {hasQ && !hasT ? (
                                <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-2 text-[11px] text-amber-950">
                                  <strong>Pendiente:</strong> asigná conductor y patente (paso 2). Sin equipo no podés
                                  confirmar el servicio; no hace falta volver a guardar la cotización si no la cambiás.
                                </div>
                              ) : null}
                              <p className="mt-2 text-[11px] text-slate-600">
                                Referencia automática: {formatCLP(suggestedAmount(s, settingsQ.data?.company))} ·{" "}
                                {pricingBreakdownText(s, settingsQ.data?.company)}
                              </p>
                            </div>

                            {hasQ ? (
                              <div className="rounded border border-indigo-100 bg-indigo-50/40 p-2">
                                <p className="mb-1 text-xs font-semibold text-indigo-900">Paso 2 — Quién ejecuta el viaje</p>
                                {hasT ? (
                                  <p className="text-sm text-slate-800">
                                    <strong>{s.driver?.fullName}</strong> · patente{" "}
                                    <strong>{s.vehicle?.plate}</strong>
                                  </p>
                                ) : (
                                  <p className="text-sm text-slate-600">
                                    Todavía no hay conductor ni camión asignado a esta solicitud.
                                  </p>
                                )}
                                <button
                                  type="button"
                                  className="mt-2 rounded bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                                  disabled={assign.isPending}
                                  onClick={() => openAssignmentWizard(s)}
                                >
                                  {hasT ? "Cambiar conductor o vehículo" : "Elegir conductor y patente"}
                                </button>
                              </div>
                            ) : null}

                            {hasQ && hasT ? (
                              <div className="space-y-2 rounded border border-slate-200 bg-slate-50 p-2">
                                <p className="text-xs font-semibold text-slate-800">Paso 3 — Confirmación al cliente</p>
                                <p
                                  className={`text-sm ${
                                    readyHint.tone === "amber" ? "text-amber-900" : "text-slate-700"
                                  }`}
                                >
                                  {readyHint.text}{" "}
                                  {readyHint.tone === "amber" ? (
                                    <Link className="font-semibold underline" to="/admin/pagos">
                                      Ir a Pagos
                                    </Link>
                                  ) : null}
                                </p>
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    className="rounded bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                                    disabled={savePricing.isPending || confirmService.isPending}
                                    title="El sistema valida comprobantes si la modalidad lo exige."
                                    onClick={() => confirmService.mutate(s.id)}
                                  >
                                    Confirmar servicio
                                  </button>
                                  <button
                                    type="button"
                                    className="rounded border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                                    disabled={decideRequest.isPending}
                                    onClick={() =>
                                      setActionModal({
                                        type: "reject",
                                        shipment: s,
                                        note: s.decisionNote ?? "Solicitud rechazada",
                                      })
                                    }
                                  >
                                    Rechazar solicitud
                                  </button>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        );
                      })()}
                    </>
                  ) : null}
                  {nextStatus(s.status) ? (
                    <div className="col-span-full rounded border border-blue-100 bg-blue-50/50 p-2">
                      <p className="mb-1 text-[11px] font-semibold uppercase text-blue-900">Despacho (seguimiento interno)</p>
                      <button
                        type="button"
                        className="rounded bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
                        disabled={advance.isPending}
                        onClick={() => {
                          const next = nextStatus(s.status);
                          if (next === "entregado") {
                            setActionModal({
                              type: "deliver",
                              shipment: s,
                              deliveredToName: s.deliveredToName ?? "",
                              deliveredToId: s.deliveredToId ?? "",
                            });
                            return;
                          }
                          advance.mutate({ id: s.id, status: next });
                        }}
                      >
                        {nextStatusLabel(s.status)}
                      </button>
                    </div>
                  ) : null}
                  {s.status !== "pendiente" && s.status !== "entregado" && s.status !== "rechazado" ? (
                    <button
                      type="button"
                      className="rounded bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                      disabled={assign.isPending}
                      onClick={() => openAssignmentWizard(s)}
                    >
                      Cambiar conductor o vehículo
                    </button>
                  ) : null}
                  {s.paymentStatus !== "pagado" && s.status !== "pendiente" && s.status !== "rechazado" ? (
                    <div className="col-span-full mt-1 rounded-lg border border-amber-200/90 bg-amber-50/80 px-3 py-2">
                      <p className="text-xs text-amber-950">
                        <strong className="font-semibold">Cobranza y comprobantes</strong> se gestionan en{" "}
                        <Link className="font-bold underline" to={`/admin/pagos?envio=${encodeURIComponent(s.id)}`}>
                          Pagos
                        </Link>{" "}
                        (validar transferencias, saldo y registro).
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
            </article>
              ))}
                </div>
              </aside>
            ) : null}
          </div>
        ) : null}
      </section>
        </div>

      {actionModal ? (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-4 shadow-2xl">
            <h3 className="text-base font-semibold text-slate-900">
              {actionModal.type === "reject" ? "Rechazar solicitud" : "Cerrar entrega"}
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              {actionModal.shipment.origin} → {actionModal.shipment.destination}
            </p>
            {actionModal.type === "reject" ? (
              <label className="mt-3 block text-sm font-medium text-slate-700">
                Motivo para el cliente
                <textarea
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                  rows={3}
                  value={actionModal.note}
                  onChange={(e) =>
                    setActionModal((prev) =>
                      prev && prev.type === "reject" ? { ...prev, note: e.target.value } : prev
                    )
                  }
                />
              </label>
            ) : actionModal.type === "deliver" ? (
              <div className="mt-3 space-y-3">
                <label className="block text-sm font-medium text-slate-700">
                  Quién recibe la carga
                  <input
                    className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                    value={actionModal.deliveredToName}
                    onChange={(e) =>
                      setActionModal((prev) =>
                        prev && prev.type === "deliver" ? { ...prev, deliveredToName: e.target.value } : prev
                      )
                    }
                  />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  RUT o identificación (opcional)
                  <input
                    className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                    value={actionModal.deliveredToId}
                    onChange={(e) =>
                      setActionModal((prev) =>
                        prev && prev.type === "deliver" ? { ...prev, deliveredToId: e.target.value } : prev
                      )
                    }
                  />
                </label>
              </div>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded border border-slate-300 px-3 py-2 text-sm"
                onClick={() => setActionModal(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={`rounded px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 ${
                  actionModal.type === "reject" ? "bg-rose-600 hover:bg-rose-500" : "bg-blue-600 hover:bg-blue-500"
                }`}
                disabled={decideRequest.isPending || advance.isPending}
                onClick={() => {
                  if (actionModal.type === "reject") {
                    decideRequest.mutate({
                      id: actionModal.shipment.id,
                      status: "rechazado",
                      decisionNote: actionModal.note.trim() || "Solicitud rechazada",
                    });
                    setActionModal(null);
                    return;
                  }
                  const name = actionModal.deliveredToName.trim();
                  if (name.length < 2) {
                    setGuardAlert("Debes indicar el nombre de quien recibe la carga antes de cerrar la entrega.");
                    return;
                  }
                  const doc = actionModal.deliveredToId.trim();
                  advance.mutate({
                    id: actionModal.shipment.id,
                    status: "entregado",
                    deliveredToName: name,
                    ...(doc.length >= 3 ? { deliveredToId: doc } : {}),
                    note: "Entrega registrada desde panel admin",
                  });
                  setActionModal(null);
                }}
              >
                {actionModal.type === "reject" ? "Rechazar solicitud" : "Cerrar entrega"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {assignmentWizard ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-4 shadow-2xl">
            <h3 className="text-base font-semibold text-slate-900">Elegir conductor y patente</h3>
            <p className="text-sm text-slate-600">{assignmentWizard.routeLabel}</p>
            <p className="mt-2 text-xs text-slate-500">
              Sugerencias según historial y viajes activos. Elegí un equipo y luego decidí si solo guardás la asignación
              o si también confirmás el servicio al cliente (paso 3).
            </p>

            <div className="mt-3 space-y-2">
              <p className="text-xs font-semibold uppercase text-slate-500">Sugeridos</p>
              {assignmentWizard.suggested.length === 0 ? (
                <p className="text-sm text-slate-500">No hay sugerencias automáticas disponibles.</p>
              ) : (
                assignmentWizard.suggested.map((opt) => (
                  <label
                    key={`sug-${opt.driverId}`}
                    className={`block cursor-pointer rounded border p-2 ${
                      assignmentWizard.selectedDriverId === opt.driverId
                        ? "border-blue-500 bg-blue-50"
                        : "border-slate-200"
                    }`}
                  >
                    <input
                      type="radio"
                      className="mr-2"
                      checked={assignmentWizard.selectedDriverId === opt.driverId}
                      onChange={() =>
                        setAssignmentWizard((prev) =>
                          prev
                            ? {
                                ...prev,
                                selectedDriverId: opt.driverId,
                                selectedVehicleId: opt.vehicleId,
                              }
                            : prev
                        )
                      }
                    />
                    <span className="text-sm font-medium">{opt.driverName}</span>
                    <span className="text-xs text-slate-600"> · {opt.vehiclePlate} · {opt.reason}</span>
                  </label>
                ))
              )}
            </div>

            <div className="mt-3 space-y-2">
              <p className="text-xs font-semibold uppercase text-slate-500">Resto de conductores</p>
              {assignmentWizard.allDrivers
                .filter((d) => d.assignedVehicle && d.assignedVehicle.status !== "en_taller")
                .filter((d) => !assignmentWizard.suggested.some((s) => s.driverId === d.id))
                .map((d) => (
                  <label
                    key={`all-${d.id}`}
                    className={`block cursor-pointer rounded border p-2 ${
                      assignmentWizard.selectedDriverId === d.id
                        ? "border-blue-500 bg-blue-50"
                        : "border-slate-200"
                    }`}
                  >
                    <input
                      type="radio"
                      className="mr-2"
                      checked={assignmentWizard.selectedDriverId === d.id}
                      onChange={() =>
                        setAssignmentWizard((prev) =>
                          prev
                            ? {
                                ...prev,
                                selectedDriverId: d.id,
                                selectedVehicleId: d.assignedVehicle?.id ?? "",
                              }
                            : prev
                        )
                      }
                    />
                    <span className="text-sm font-medium">{d.fullName}</span>
                    <span className="text-xs text-slate-600">
                      {" "}
                      · {d.assignedVehicle?.plate ?? "sin vehículo"} ({d.assignedVehicle?.status ?? "—"})
                    </span>
                  </label>
                ))}
            </div>

            <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:flex-wrap sm:justify-end">
              <button
                type="button"
                className="rounded border border-slate-300 px-3 py-2 text-sm"
                onClick={() => setAssignmentWizard(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="rounded border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-900 disabled:opacity-50"
                disabled={assign.isPending}
                onClick={() => void applyAssignment(false)}
              >
                Solo guardar equipo
              </button>
              <button
                type="button"
                className="rounded bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                disabled={assign.isPending || confirmService.isPending}
                onClick={() => void applyAssignment(true)}
              >
                Guardar equipo y confirmar servicio
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <FloatingAlertModal
        open={guardAlert !== null}
        title="Faltan datos para continuar"
        message={guardAlert ?? ""}
        onClose={() => setGuardAlert(null)}
      />
    </div>
  );
}

function fmt(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

function getDurationText(start?: string | null, end?: string | null) {
  if (!start || !end) return "—";
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return "—";
  const mins = Math.round((e - s) / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

function isScheduledDeliveryToday(scheduledDelivery?: string | null): boolean {
  if (!scheduledDelivery) return false;
  const d = new Date(scheduledDelivery);
  if (!Number.isFinite(d.getTime())) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function isDelayed(status: string, scheduledDelivery?: string | null) {
  if (!scheduledDelivery) return false;
  if (status === "entregado" || status === "rechazado") return false;
  return Date.now() > new Date(scheduledDelivery).getTime();
}

function isTodayDelivered(value?: string | null) {
  if (!value) return false;
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function statusLabel(status: string): string {
  return sharedShipmentStatusLabel(status);
}

function rejectionPhaseLabel(phase: string | null | undefined): string | null {
  if (!phase) return "Rechazo (sin fase registrada)";
  switch (phase) {
    case "solicitud":
      return "Rechazo por admin (solicitud)";
    case "pre_entrega":
      return "Rechazo en retiro / no cabe (pre-ruta)";
    case "en_entrega":
      return "Rechazo en destino";
    default:
      return null;
  }
}

function nextStatusLabel(status: string): string {
  switch (status) {
    case "confirmado": return "Acción principal: marcar recogido";
    case "recogido": return "Acción principal: marcar en tránsito";
    case "en_transito": return "Acción principal: cerrar entrega";
    default: return "Avanzar estado";
  }
}

function paymentLabel(status: string): string {
  switch (status) {
    case "pagado": return "Pagado";
    case "parcial": return "Pago parcial";
    case "pendiente": return "Pago pendiente";
    default: return status ?? "Sin datos";
  }
}

function statusTone(status: string) {
  return shipmentStatusTone(status);
}

function paymentTone(status: string) {
  switch (status) {
    case "pagado":
      return "bg-emerald-100 text-emerald-800";
    case "parcial":
      return "bg-amber-100 text-amber-800";
    case "pendiente":
      return "bg-rose-100 text-rose-800";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function buildApprovalMessage(
  amount: number,
  paymentTerm: "upfront_full" | "upfront_partial" | "delivery",
  upfrontPercent?: number
) {
  const total = formatCLP(amount);
  if (paymentTerm === "upfront_full") {
    return `Solicitud aprobada. Monto acordado: ${total}. Debes pagar el 100% ahora y subir comprobante para validación.`;
  }
  if (paymentTerm === "upfront_partial") {
    const percent = Math.round(upfrontPercent ?? 50);
    const upfront = formatCLP(Math.round((amount * percent) / 100));
    return `Solicitud aprobada. Monto total: ${total}. Debes pagar ${percent}% ahora (${upfront}) y el saldo contra entrega.`;
  }
  return `Solicitud aprobada. Monto acordado: ${total}. Modalidad pactada: pago contra entrega.`;
}

function fmtMetric(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2).replace(/\.00$/, "");
}

function formatCLP(value: number) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

function RoutePlanningInline({
  shipment,
  saving,
  onSave,
}: {
  shipment: ShipmentRow;
  saving: boolean;
  onSave: (loadSequence: number | null, unloadAccess: string | null) => void;
}) {
  const [seq, setSeq] = useState("");
  const [access, setAccess] = useState("");

  useEffect(() => {
    const raw = shipment.loadSequence;
    setSeq(
      raw !== null && raw !== undefined && String(raw).trim() !== "" ? String(raw) : ""
    );
    setAccess(shipment.unloadAccess ?? "");
  }, [shipment.id, shipment.loadSequence, shipment.unloadAccess]);

  const savedSeqStr =
    shipment.loadSequence !== null && shipment.loadSequence !== undefined && String(shipment.loadSequence).trim() !== ""
      ? String(shipment.loadSequence).trim()
      : "";
  const savedAccessStr = (shipment.unloadAccess ?? "").trim();
  const planDirty = seq.trim() !== savedSeqStr || access.trim() !== savedAccessStr;

  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50/90 p-2">
      <p className="text-[11px] font-semibold text-slate-700">Plan de ruta (chofer · LIFO)</p>
      <p className="text-[10px] text-slate-500">
        Secuencia de retiro (1 = primero). Acceso descarga: muelle, ventana horaria, etc. Queda guardado en{" "}
        <strong>este envío</strong>.
      </p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="block text-[11px] text-slate-600">
          Secuencia
          <input
            type="number"
            min={1}
            max={999}
            className="ml-1 w-16 rounded border border-slate-300 px-1 py-0.5 text-xs"
            value={seq}
            onChange={(e) => setSeq(e.target.value)}
            placeholder="—"
          />
        </label>
        <label className="block min-w-[10rem] flex-1 text-[11px] text-slate-600">
          Acceso descarga
          <input
            type="text"
            className="mt-0.5 w-full rounded border border-slate-300 px-2 py-0.5 text-xs"
            value={access}
            onChange={(e) => setAccess(e.target.value)}
            placeholder="Ej. Muelle 2, solo AM"
          />
        </label>
        <button
          type="button"
          disabled={saving || !planDirty}
          title={
            planDirty
              ? "Guardar secuencia y acceso en el pedido"
              : "No hay cambios respecto al plan ya guardado en este envío."
          }
          className={`rounded-md px-2 py-1 text-[11px] font-semibold disabled:cursor-not-allowed ${
            planDirty
              ? "bg-slate-800 text-white hover:bg-slate-700"
              : "border border-emerald-200 bg-emerald-50 text-emerald-900"
          } disabled:opacity-50`}
          onClick={() => {
            const n = seq.trim() === "" ? null : Number(seq);
            if (n !== null && (!Number.isInteger(n) || n < 1 || n > 999)) {
              notify("error", "Secuencia debe ser un entero entre 1 y 999 o vacío.");
              return;
            }
            const acc = access.trim() === "" ? null : access.trim();
            onSave(n, acc);
          }}
        >
          {saving ? "Guardando…" : planDirty ? "Guardar plan" : "Plan guardado"}
        </button>
      </div>
    </div>
  );
}

function fmtClp(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "—";
  return formatCLP(n);
}

function toNum(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function suggestedAmount(
  shipment: Pick<
    ShipmentRow,
    "cargoWeightKg" | "cargoVolumeM3" | "requiresHelper" | "helperSurcharge"
  >,
  pricing?: SettingsData["company"]
) {
  let base = toNum(pricing?.pricingBaseFee);
  let perKg = toNum(pricing?.pricingPerKg);
  let perM3 = toNum(pricing?.pricingPerM3);
  let minCharge = toNum(pricing?.pricingMinimumCharge);
  if (base === 0 && perKg === 0 && perM3 === 0 && minCharge === 0) {
    // Fallback values in CLP close to SME market references.
    base = 50000;
    perKg = 120;
    perM3 = 18000;
    minCharge = 90000;
  }
  const weight = toNum(shipment.cargoWeightKg);
  const volume = toNum(shipment.cargoVolumeM3);
  const helper = shipment.requiresHelper ? toNum(shipment.helperSurcharge) : 0;
  const calc = base + weight * perKg + volume * perM3 + helper;
  return Math.max(calc, minCharge, 0);
}

function pricingBreakdownText(
  shipment: Pick<
    ShipmentRow,
    "cargoWeightKg" | "cargoVolumeM3" | "requiresHelper" | "helperSurcharge"
  >,
  pricing?: SettingsData["company"]
) {
  const base = toNum(pricing?.pricingBaseFee);
  const perKg = toNum(pricing?.pricingPerKg);
  const perM3 = toNum(pricing?.pricingPerM3);
  const minCharge = toNum(pricing?.pricingMinimumCharge);
  const weight = toNum(shipment.cargoWeightKg);
  const volume = toNum(shipment.cargoVolumeM3);
  const helper = shipment.requiresHelper ? toNum(shipment.helperSurcharge) : 0;
  return `Base ${formatCLP(base)} + (${weight.toLocaleString()} kg x ${formatCLP(perKg)}) + (${volume.toLocaleString()} m3 x ${formatCLP(perM3)}) + ayudante ${formatCLP(helper)} · minimo ${formatCLP(minCharge)}`;
}
