export type ShipmentUiState =
  | "pendiente"
  | "confirmado"
  | "recogido"
  | "en_transito"
  | "entregado"
  | "rechazado";

const STATUS_LABELS: Record<ShipmentUiState, string> = {
  pendiente: "Pendiente de aprobación",
  confirmado: "Confirmado",
  recogido: "Carga recogida",
  en_transito: "En tránsito",
  entregado: "Entregado",
  rechazado: "Rechazado",
};

const STATUS_TONES: Record<ShipmentUiState, string> = {
  pendiente: "bg-amber-100 text-amber-800",
  confirmado: "bg-blue-100 text-blue-800",
  recogido: "bg-cyan-100 text-cyan-800",
  en_transito: "bg-cyan-100 text-cyan-800",
  entregado: "bg-emerald-100 text-emerald-800",
  rechazado: "bg-rose-100 text-rose-800",
};

const DRIVER_PILL_TONES: Record<ShipmentUiState, string> = {
  pendiente: "bg-amber-100 text-amber-900",
  confirmado: "bg-sky-100 text-sky-900",
  recogido: "bg-lime-100 text-lime-900",
  en_transito: "bg-green-100 text-green-900",
  entregado: "bg-slate-200 text-slate-700",
  rechazado: "bg-rose-100 text-rose-800",
};

function parseState(status: string): ShipmentUiState | null {
  if (status in STATUS_LABELS) return status as ShipmentUiState;
  return null;
}

export function shipmentStatusLabel(status: string): string {
  const state = parseState(status);
  return state ? STATUS_LABELS[state] : status;
}

export function shipmentStatusTone(status: string): string {
  const state = parseState(status);
  return state ? STATUS_TONES[state] : "bg-slate-100 text-slate-700";
}

export function shipmentDriverPillTone(status: string): string {
  const state = parseState(status);
  return state ? DRIVER_PILL_TONES[state] : "bg-slate-100 text-slate-700";
}
