import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Map as MapIcon, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiGet, apiSend } from "../api/client.js";
import { rankAllDriverSuggestions } from "../lib/suggestAssignment.js";
import { RouteMap } from "../components/common/RouteMap.js";
import { EnvioReadinessBlock } from "./EnvioReadinessBlock.js";
import { FloatingAlertModal } from "./FloatingAlertModal.js";
import type { RegistrarCobroServiceTarget } from "./RegistrarCobroServiceModal.js";
import {
  buildMapMarkersAndRoutesForRows,
  googleMapsUrlForShipment,
  num,
  type ShipmentMapGeoRow,
} from "./shipmentMapGeo.js";
import { notify } from "../lib/notify.js";

type ShipmentDetail = {
  id: string;
  origin: string;
  destination: string;
  status: string;
  rejectionPhase?: string | null;
  scheduledDelivery?: string | null;
  scheduledPickup?: string | null;
  pickedUpAt?: string | null;
  deliveredAt?: string | null;
  deliveredToName?: string | null;
  lastLat?: string | number | null;
  lastLng?: string | number | null;
  originLat?: string | number | null;
  originLng?: string | number | null;
  destinationLat?: string | number | null;
  destinationLng?: string | number | null;
  amount?: unknown;
  totalAmount?: unknown;
  paymentStatus?: string;
  decisionNote?: string | null;
  customer: { name: string; email?: string | null; phone?: string | null };
  driver?: { id: string; fullName: string; phone?: string | null } | null;
  vehicle?: { id: string; plate: string; kind?: string | null } | null;
};
type DriverMini = {
  id: string;
  fullName: string;
  assignedVehicle?: { id: string; plate: string; status: string } | null;
};

type ShipmentListRowLite = {
  id: string;
  origin: string;
  destination: string;
  status: string;
  driver?: { id: string; fullName?: string } | null;
};

type ListBalanceHint = { balanceAmount?: string; paidAmount?: string } | null;

const shell = "fixed inset-0 z-[110] flex items-center justify-center bg-black/55 p-4";

function fmtClp(n: unknown): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return v.toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
}

function statusLabel(s: string): string {
  switch (s) {
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
      return s;
  }
}

type Props = {
  open: boolean;
  shipmentId: string | null;
  listHint: ListBalanceHint;
  onClose: () => void;
  onRegistrarCobro: (t: RegistrarCobroServiceTarget) => void;
};

export function AdminShipmentDetailFloat({ open, shipmentId, listHint, onClose, onRegistrarCobro }: Props) {
  const qc = useQueryClient();
  const [mapOpen, setMapOpen] = useState(true);
  const [selectedDriverId, setSelectedDriverId] = useState("");
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [serviceAmountInput, setServiceAmountInput] = useState("");
  const [rejectNoteInput, setRejectNoteInput] = useState("");
  const [guardAlert, setGuardAlert] = useState<string | null>(null);
  const suggestAppliedForShipmentRef = useRef<string | null>(null);

  const q = useQuery({
    queryKey: ["shipments", "detail", shipmentId],
    queryFn: () => apiGet<ShipmentDetail>(`/shipments/${shipmentId as string}`),
    enabled: open && !!shipmentId,
  });
  const driversQ = useQuery({
    queryKey: ["drivers", "admin-shipment-float"],
    queryFn: () => apiGet<DriverMini[]>("/drivers"),
    enabled: open && !!shipmentId,
    staleTime: 30_000,
  });
  const shipmentsListQ = useQuery({
    queryKey: ["shipments"],
    queryFn: () => apiGet<ShipmentListRowLite[]>("/shipments"),
    enabled: open && !!shipmentId,
    staleTime: 15_000,
  });
  const assignMut = useMutation({
    mutationFn: (payload: { driverId: string; vehicleId: string; amount: number }) =>
      apiSend(`/shipments/${shipmentId as string}`, "PATCH", payload),
    onSuccess: async () => {
      notify("success", "Chofer y vehículo asignados.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["shipments"] }),
        qc.invalidateQueries({ queryKey: ["shipments", "detail", shipmentId] }),
      ]);
    },
    onError: (e: Error) => notify("error", e.message || "No se pudo asignar chofer/vehículo."),
  });
  const approveMut = useMutation({
    mutationFn: () => apiSend(`/shipments/${shipmentId as string}`, "PATCH", { status: "confirmado" }),
    onSuccess: async () => {
      notify("success", "Solicitud aprobada. Ya queda en operación y con cobro pendiente.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["shipments"] }),
        qc.invalidateQueries({ queryKey: ["shipments", "detail", shipmentId] }),
        qc.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
    },
    onError: (e: Error) => notify("error", e.message || "No se pudo aprobar la solicitud."),
  });
  const rejectMut = useMutation({
    mutationFn: (decisionNote: string) =>
      apiSend(`/shipments/${shipmentId as string}`, "PATCH", {
        status: "rechazado",
        decisionNote,
      }),
    onSuccess: async () => {
      notify("success", "Solicitud rechazada y notificada en el sistema.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["shipments"] }),
        qc.invalidateQueries({ queryKey: ["shipments", "detail", shipmentId] }),
        qc.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
    },
    onError: (e: Error) => notify("error", e.message || "No se pudo rechazar la solicitud."),
  });

  async function assignAndApproveFromFloat() {
    if (!selectedDriverId || !selectedVehicleId) {
      setGuardAlert("Antes de aprobar, seleccioná chofer y vehículo para esta solicitud.");
      return;
    }
    const rawAmount = serviceAmountInput.trim().replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
    const totalNum = Number(rawAmount);
    if (!Number.isFinite(totalNum) || totalNum <= 0) {
      setGuardAlert("Monto del servicio definido (precio a cobrar): cargá el monto antes de aprobar.");
      return;
    }
    try {
      await assignMut.mutateAsync({ driverId: selectedDriverId, vehicleId: selectedVehicleId, amount: totalNum });
      await approveMut.mutateAsync();
      notify("success", "Solicitud aprobada con equipo asignado en un solo paso.");
    } catch {
      // handled by mutations
    }
  }

  async function rejectFromFloat() {
    const note = rejectNoteInput.trim();
    if (note.length < 6) {
      setGuardAlert("Indicá un motivo breve (mínimo 6 caracteres) para rechazar la solicitud.");
      return;
    }
    try {
      await rejectMut.mutateAsync(note);
    } catch {
      // handled by mutation
    }
  }

  useEffect(() => {
    setMapOpen(true);
  }, [shipmentId]);
  useEffect(() => {
    suggestAppliedForShipmentRef.current = null;
  }, [shipmentId]);
  const rankedDriversForSelect = useMemo(() => {
    const s = q.data;
    if (!s || s.status !== "pendiente") return [];
    return rankAllDriverSuggestions(
      {
        id: s.id,
        origin: s.origin,
        destination: s.destination,
        status: s.status,
        driver: s.driver ? { id: s.driver.id, fullName: s.driver.fullName } : null,
      },
      driversQ.data ?? [],
      shipmentsListQ.data ?? []
    );
  }, [q.data, driversQ.data, shipmentsListQ.data]);

  useEffect(() => {
    if (!q.data) return;
    setSelectedDriverId(q.data.driver?.id ?? "");
    setSelectedVehicleId(q.data.vehicle?.id ?? "");
    const initialAmount = Number(q.data.totalAmount ?? q.data.amount);
    setServiceAmountInput(Number.isFinite(initialAmount) && initialAmount > 0 ? String(initialAmount) : "");
    setRejectNoteInput((q.data.decisionNote ?? "").trim() || "Solicitud rechazada por validación operativa.");
  }, [q.data?.id, q.data?.driver?.id, q.data?.vehicle?.id]);

  useEffect(() => {
    const s = q.data;
    if (!s || s.status !== "pendiente") return;
    if (s.driver?.id || s.vehicle?.id) return;
    if (suggestAppliedForShipmentRef.current === s.id) return;
    const first = rankedDriversForSelect[0];
    if (!first) return;
    suggestAppliedForShipmentRef.current = s.id;
    setSelectedDriverId(first.driverId);
    setSelectedVehicleId(first.vehicleId);
  }, [q.data, rankedDriversForSelect]);

  const balance = useMemo(() => {
    if (listHint?.balanceAmount != null) return listHint.balanceAmount;
    return null;
  }, [listHint]);

  const saldoNum = useMemo(() => {
    if (balance == null) return 0;
    const raw = String(balance).replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }, [balance]);

  const mapGeo = useMemo((): ShipmentMapGeoRow | null => {
    const s = q.data;
    if (!s) return null;
    return {
      id: s.id,
      origin: s.origin,
      destination: s.destination,
      customer: { name: s.customer.name },
      originLat: s.originLat,
      originLng: s.originLng,
      destinationLat: s.destinationLat,
      destinationLng: s.destinationLng,
      lastLat: s.lastLat,
      lastLng: s.lastLng,
    };
  }, [q.data]);

  const { markers: mapMarkers, routes: mapRoutes } = useMemo(
    () => (mapGeo ? buildMapMarkersAndRoutesForRows([mapGeo]) : { markers: [], routes: [] }),
    [mapGeo]
  );
  const googleMapsUrl = useMemo(() => (mapGeo ? googleMapsUrlForShipment(mapGeo) : ""), [mapGeo]);
  const googleMapsLinkContext = useMemo(() => {
    if (!mapGeo) return "location";
    const lastLat = num(mapGeo.lastLat);
    const lastLng = num(mapGeo.lastLng);
    return lastLat !== null && lastLng !== null ? "truck" : "location";
  }, [mapGeo]);

  if (!open || !shipmentId) return null;

  const s = q.data;
  const shortId = shipmentId.slice(-6).toUpperCase();

  const mapBlock =
    s && mapGeo ? (
      <div className="border-t border-slate-200 bg-slate-50/90">
        <button
          type="button"
          onClick={() => setMapOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2 px-4 py-2 text-left text-[11px] font-medium text-slate-700 hover:bg-slate-100/80 sm:py-1.5"
          aria-expanded={mapOpen}
        >
          <span className="inline-flex items-center gap-1.5">
            <MapIcon className="h-3.5 w-3.5 text-slate-500" aria-hidden />
            Mapa del envío
          </span>
          <span className="text-[10px] font-normal text-slate-500">{mapOpen ? "Ocultar" : "Mostrar"}</span>
        </button>
        {mapOpen ? (
          <div className="border-t border-slate-100 px-3 pb-3 pt-1 sm:px-4">
            {mapMarkers.length > 0 ? (
              <>
                <p className="mb-1.5 text-[10px] text-slate-600">
                  <span className="text-blue-700">●</span> Origen · <span className="text-emerald-700">●</span> Destino ·{" "}
                  <span className="text-orange-600">●</span> Chofer — el botón de Google Maps abre la{" "}
                  <strong className="font-medium">ubicación para seguimiento</strong>, no una ruta de navegación.
                </p>
                <div className="w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  <RouteMap
                    title=""
                    markers={mapMarkers}
                    routes={mapRoutes}
                    mapFocus={null}
                    frameAllMarkers
                    heightClass="h-44 w-full min-h-[10rem] max-h-[min(42vh,300px)] sm:h-56"
                  />
                </div>
                <a
                  href={googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50/90 py-2.5 text-xs font-semibold text-blue-900 shadow-sm hover:bg-blue-100/90"
                >
                  <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
                  {googleMapsLinkContext === "truck"
                    ? "Ver última posición del camión en Google Maps"
                    : "Ver ubicación en Google Maps (seguimiento)"}
                </a>
              </>
            ) : (
              <>
                <p className="rounded-lg border border-dashed border-slate-300 bg-white/80 px-2 py-2 text-center text-[11px] leading-snug text-slate-600">
                  Sin puntos aún. Intentamos geocodificar al abrir; si no hay, revisá direcciones o esperá GPS del chofer.
                </p>
                <a
                  href={googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50/90 py-2 text-xs font-semibold text-blue-900 hover:bg-blue-100/90"
                >
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {googleMapsLinkContext === "truck"
                    ? "Ver última posición en Google Maps"
                    : "Ver ubicación en Google Maps (seguimiento)"}
                </a>
              </>
            )}
          </div>
        ) : null}
      </div>
    ) : null;

  return (
    <>
      <div className={shell} role="dialog" aria-modal="true" aria-labelledby="ficha-envio-title" onClick={onClose}>
        <div
          className="flex max-h-[min(96vh,940px)] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:max-h-[min(94vh,900px)] sm:rounded-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-2 border-b border-slate-200 px-4 py-3">
            <div className="min-w-0">
              <h2 id="ficha-envio-title" className="text-base font-semibold text-slate-900">
                Ped. {shortId}
              </h2>
              {s ? (
                <p className="mt-0.5 text-sm text-slate-700">
                  {s.origin} → {s.destination}
                </p>
              ) : q.isError ? (
                <p className="mt-0.5 text-sm text-rose-700">No se pudo cargar el detalle del envío.</p>
              ) : (
                <p className="mt-0.5 text-sm text-slate-500">Cargando…</p>
              )}
            </div>
            <button
              type="button"
              className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
              onClick={onClose}
              aria-label="Cerrar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto text-xs text-slate-800">
            {s ? (
              <div className="space-y-3 px-4 py-3">
                <p>
                  <span className="font-semibold">Cliente</span> · {s.customer.name}
                </p>
                {s.customer.phone ? <p className="text-slate-600">Tel. cliente: {s.customer.phone}</p> : null}
                <p>
                  <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-800 ring-1 ring-slate-200/80">
                    {statusLabel(s.status)}
                  </span>
                </p>
                <p>
                  <span className="font-semibold">Conductor</span> · {s.driver?.fullName ?? "—"}
                  {s.driver?.phone ? ` · ${s.driver.phone}` : ""}
                </p>
                <p>
                  <span className="font-semibold">Vehículo</span> ·{" "}
                  {s.vehicle ? `${s.vehicle.plate}${s.vehicle.kind ? ` (${s.vehicle.kind})` : ""}` : "—"}
                </p>
                <p className="text-slate-600">
                  Entrega prevista:{" "}
                  {s.scheduledDelivery
                    ? new Date(s.scheduledDelivery).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" })
                    : "—"}
                </p>
                <div className="rounded-lg border border-slate-200 bg-slate-50/90 p-2">
                  <p>
                    <span className="font-semibold">Cobro</span> · {s.paymentStatus ?? "—"}
                  </p>
                  <p className="mt-0.5 tabular-nums">
                    Total: {fmtClp(s.totalAmount ?? s.amount)} · Pagado (lista):{" "}
                    {listHint?.paidAmount != null ? fmtClp(listHint.paidAmount) : "—"}
                  </p>
                  <p className="mt-0.5 font-medium tabular-nums text-amber-900">
                    Saldo lista: {balance != null && balance !== undefined ? fmtClp(balance) : "—"}
                  </p>
                </div>
                <EnvioReadinessBlock shipmentId={s.id} />
              </div>
            ) : !q.isError ? (
              <p className="px-4 py-3 text-slate-500">Cargando ficha operativa…</p>
            ) : null}
            {mapBlock}
          </div>

          {s && saldoNum > 0 ? (
            <div className="space-y-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
              <button
                type="button"
                className="w-full rounded-lg border border-amber-300/90 bg-amber-50/90 py-2 text-xs font-semibold text-amber-950 hover:bg-amber-100"
                onClick={() => onRegistrarCobro({ shipmentId: s.id, balanceHint: String(balance) })}
              >
                Registrar pago
              </button>
            </div>
          ) : null}
        </div>
      </div>
      <FloatingAlertModal
        open={guardAlert !== null}
        title="Faltan datos para continuar"
        message={guardAlert ?? ""}
        onClose={() => setGuardAlert(null)}
      />
    </>
  );
}
