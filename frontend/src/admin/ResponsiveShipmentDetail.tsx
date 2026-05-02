import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Map as MapIcon, X, ChevronUp } from "lucide-react";
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

// Componente Modal para Desktop - Rediseñado como página flotante
function ShipmentModal({ 
  children, 
  onClose 
}: { 
  children: React.ReactNode; 
  onClose: () => void; 
}) {
  return (
    <div 
      className="hidden md:flex fixed inset-0 z-[110] items-center justify-center bg-black/60 p-6"
      role="dialog" 
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(90vh,880px)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

// Componente Drawer para Móvil
function ShipmentDrawer({ 
  children, 
  onClose,
  isOpen 
}: { 
  children: React.ReactNode; 
  onClose: () => void;
  isOpen: boolean;
}) {
  return (
    <div className="md:hidden">
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[110] bg-black/55 transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-[110] transform transition-transform duration-300 ease-out ${
          isOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="bg-white rounded-t-3xl shadow-2xl border border-slate-200">
          {/* Handle */}
          <div className="flex justify-center py-2">
            <div className="w-12 h-1 bg-slate-300 rounded-full" />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

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

export function ResponsiveShipmentDetail({ open, shipmentId, listHint, onClose, onRegistrarCobro }: Props) {
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
      // handled by mutations
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

  // Mapa responsive
  const mapBlock = s && mapGeo ? (
    <div className="border-t border-slate-200 bg-slate-50/90">
      <button
        type="button"
        onClick={() => setMapOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium text-slate-700 hover:bg-slate-100/80 sm:py-2.5 sm:text-xs"
        aria-expanded={mapOpen}
      >
        <span className="inline-flex items-center gap-2">
          <MapIcon className="h-4 w-4 text-slate-500 sm:h-3.5 sm:w-3.5" aria-hidden />
          <span className="sm:hidden">Mapa del envío</span>
          <span className="hidden sm:inline">Mapa del envío</span>
        </span>
        <ChevronUp 
          className={`h-4 w-4 text-slate-500 transition-transform duration-200 ${
            mapOpen ? 'rotate-180' : ''
          }`}
        />
      </button>
      {mapOpen ? (
        <div className="border-t border-slate-100 px-4 pb-4 pt-2 sm:px-4 sm:pb-3 sm:pt-1">
          {mapMarkers.length > 0 ? (
            <>
              <p className="mb-2 text-xs text-slate-600 sm:text-[10px]">
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
                  heightClass="h-64 w-full min-h-[200px] max-h-[50vh] sm:h-80 sm:max-h-[60vh] lg:h-96 lg:max-h-[70vh]"
                />
              </div>
              <a
                href={googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50/90 py-3 text-sm font-semibold text-blue-900 shadow-sm hover:bg-blue-100/90 sm:py-2.5 sm:text-xs"
              >
                <ExternalLink className="h-4 w-4 shrink-0 sm:h-3.5 sm:w-3.5" aria-hidden />
                <span className="sm:hidden">Ver en Google Maps</span>
                <span className="hidden sm:inline">
                  {googleMapsLinkContext === "truck"
                    ? "Ver última posición del camión en Google Maps"
                    : "Ver ubicación en Google Maps (seguimiento)"}
                </span>
              </a>
            </>
          ) : (
            <>
              <p className="rounded-lg border border-dashed border-slate-300 bg-white/80 px-3 py-3 text-center text-xs leading-snug text-slate-600 sm:px-2 sm:py-2 sm:text-[11px]">
                Sin puntos aún. Intentamos geocodificar al abrir; si no hay, revisá direcciones o esperá GPS del chofer.
              </p>
              <a
                href={googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50/90 py-3 text-sm font-semibold text-blue-900 hover:bg-blue-100/90 sm:py-2.5 sm:text-xs"
              >
                <ExternalLink className="h-4 w-4 shrink-0 sm:h-3.5 sm:w-3.5" aria-hidden />
                <span className="sm:hidden">Ver en Google Maps</span>
                <span className="hidden sm:inline">
                  {googleMapsLinkContext === "truck"
                    ? "Ver última posición en Google Maps"
                    : "Ver ubicación en Google Maps (seguimiento)"}
                </span>
              </a>
            </>
          )}
        </div>
      ) : null}
    </div>
  ) : null;

  const content = (
    <>
      {/* Header Desktop - Rediseñado */}
      <div className="hidden md:flex">
        {/* Header Principal */}
        <div className="flex w-full items-center justify-between border-b border-slate-200 bg-gradient-to-r from-slate-50 to-slate-100 px-6 py-4">
          <div className="flex items-center gap-4">
            <button
              type="button"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 transition-colors"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
              Volver
            </button>
            <div className="h-6 w-px bg-slate-300" />
            <div>
              <h1 id="ficha-envio-title" className="text-xl font-semibold text-slate-900">
                Detalle del envío
              </h1>
              {s && (
                <p className="text-sm text-slate-600 mt-1">
                  {s.origin} → {s.destination}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {s && (
              <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase ring-1 ${
                s.status === 'pendiente' 
                  ? 'bg-amber-50 text-amber-800 ring-amber-200' 
                  : s.status === 'confirmado'
                  ? 'bg-blue-50 text-blue-800 ring-blue-200'
                  : s.status === 'entregado'
                  ? 'bg-green-50 text-green-800 ring-green-200'
                  : 'bg-slate-100 text-slate-800 ring-slate-200'
              }`}>
                {statusLabel(s.status)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Header Móvil - Mantener original */}
      <div className="md:hidden flex items-start justify-between gap-2 border-b border-slate-200 px-4 py-4 sm:py-3">
        <div className="min-w-0 flex-1">
          <h2 id="ficha-envio-title" className="text-lg font-semibold text-slate-900 sm:text-base">
            Ped. {shortId}
          </h2>
          {s ? (
            <p className="mt-1 text-sm text-slate-700 sm:mt-0.5">
              {s.origin} → {s.destination}
            </p>
          ) : q.isError ? (
            <p className="mt-1 text-sm text-rose-700 sm:mt-0.5">No se pudo cargar el detalle del envío.</p>
          ) : (
            <p className="mt-1 text-sm text-slate-500 sm:mt-0.5">Cargando…</p>
          )}
        </div>
        <button
          type="button"
          className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100 transition-colors sm:p-1.5"
          onClick={onClose}
          aria-label="Cerrar"
        >
          <X className="h-5 w-5 sm:h-4 sm:w-4" />
        </button>
      </div>

      {/* Content Desktop - Layout de empresa de transporte con línea de tiempo principal */}
      <div className="hidden md:flex flex-1 overflow-hidden">
        {s ? (
          <div className="flex w-full bg-slate-50">
            {/* Columna Principal - Línea de Tiempo Visual */}
            <div className="flex-1 overflow-y-auto bg-white">
              {/* Header del Envío */}
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-2xl font-bold">{statusLabel(s.status)}</h2>
                    <p className="text-blue-100 mt-1">{s.origin} → {s.destination}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-blue-100">Total del servicio</p>
                    <p className="text-2xl font-bold">{fmtClp(s.totalAmount ?? s.amount)}</p>
                  </div>
                </div>
              </div>

              {/* Línea de Tiempo Visual Principal */}
              <div className="p-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-6">Línea de tiempo del envío</h3>
                <div className="relative">
                  {/* Línea vertical */}
                  <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-blue-200"></div>
                  
                  {/* Estados de la línea de tiempo */}
                  <div className="space-y-6">
                    {/* Solicitud */}
                    <div className="flex items-start gap-4">
                      <div className="relative">
                        <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold">
                          1
                        </div>
                        <div className="absolute inset-0 w-12 h-12 bg-blue-600 rounded-full animate-ping opacity-25"></div>
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-slate-900">Solicitud creada</h4>
                        <p className="text-slate-600">
                          {s.createdAt ? new Date(s.createdAt).toLocaleString("es-CL", { 
                            dateStyle: "short", 
                            timeStyle: "short" 
                          }) : "—"}
                        </p>
                        <p className="text-sm text-slate-500 mt-1">Cliente solicitó el servicio de transporte</p>
                      </div>
                    </div>

                    {/* Aprobación */}
                    <div className="flex items-start gap-4">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold ${
                        ['confirmado', 'recogido', 'en_transito', 'entregado'].includes(s.status) 
                          ? 'bg-green-600' 
                          : 'bg-slate-300'
                      }`}>
                        2
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-slate-900">Aprobación</h4>
                        <p className="text-slate-600">
                          {['confirmado', 'recogido', 'en_transito', 'entregado'].includes(s.status) 
                            ? 'Aprobado y asignado' 
                            : 'Pendiente de aprobación'}
                        </p>
                        {s.driver && s.vehicle && (
                          <p className="text-sm text-slate-500 mt-1">
                            Conductor: {s.driver.fullName} · Vehículo: {s.vehicle.plate}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Retiro */}
                    <div className={`flex items-start gap-4 ${
                      s.pickedUpAt ? '' : 'opacity-50'
                    }`}>
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold ${
                        ['recogido', 'en_transito', 'entregado'].includes(s.status) 
                          ? 'bg-blue-600' 
                          : 'bg-slate-300'
                      }`}>
                        3
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-slate-900">Retiro de carga</h4>
                        <p className="text-slate-600">
                          {s.pickedUpAt 
                            ? new Date(s.pickedUpAt).toLocaleString("es-CL", { 
                                dateStyle: "short", 
                                timeStyle: "short" 
                              })
                            : s.scheduledPickup 
                              ? `Programado: ${new Date(s.scheduledPickup).toLocaleString("es-CL", { 
                                  dateStyle: "short", 
                                  timeStyle: "short" 
                                })}`
                              : 'Por programar'
                          }
                        </p>
                        <p className="text-sm text-slate-500 mt-1">
                          {s.pickedUpAt ? 'Carga recogida del origen' : 'Esperando retiro programado'}
                        </p>
                      </div>
                    </div>

                    {/* En Tránsito */}
                    <div className={`flex items-start gap-4 ${
                      s.status === 'en_transito' || s.status === 'entregado' ? '' : 'opacity-50'
                    }`}>
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold ${
                        s.status === 'en_transito' || s.status === 'entregado'
                          ? 'bg-orange-600' 
                          : 'bg-slate-300'
                      }`}>
                        4
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-slate-900">En tránsito</h4>
                        <p className="text-slate-600">
                          {s.status === 'en_transito' || s.status === 'entregado'
                            ? 'En ruta hacia destino'
                            : 'Por iniciar tránsito'
                          }
                        </p>
                        {s.status === 'en_transito' && (
                          <p className="text-sm text-slate-500 mt-1">
                            Última actualización: {new Date().toLocaleString("es-CL", { 
                              dateStyle: "short", 
                              timeStyle: "short" 
                            })}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Entrega */}
                    <div className={`flex items-start gap-4 ${
                      s.status === 'entregado' ? '' : 'opacity-50'
                    }`}>
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold ${
                        s.status === 'entregado'
                          ? 'bg-green-600' 
                          : 'bg-slate-300'
                      }`}>
                        5
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-slate-900">Entrega completada</h4>
                        <p className="text-slate-600">
                          {s.deliveredAt 
                            ? new Date(s.deliveredAt).toLocaleString("es-CL", { 
                                dateStyle: "short", 
                                timeStyle: "short" 
                              })
                            : s.scheduledDelivery
                              ? `Programada: ${new Date(s.scheduledDelivery).toLocaleString("es-CL", { 
                                  dateStyle: "short", 
                                  timeStyle: "short" 
                                })}`
                              : 'Por programar'
                          }
                        </p>
                        {s.deliveredToName && (
                          <p className="text-sm text-slate-500 mt-1">
                            Recibido por: {s.deliveredToName}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Información Esencial Simplificada */}
              <div className="border-t border-slate-200 p-6 bg-slate-50">
                <div className="grid grid-cols-3 gap-6">
                  {/* Cliente */}
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 mb-2">Cliente</h4>
                    <p className="font-medium text-slate-800">{s.customer.name}</p>
                    <p className="text-sm text-slate-600">{s.customer.phone}</p>
                    {s.customer.email && (
                      <p className="text-sm text-slate-600">{s.customer.email}</p>
                    )}
                  </div>

                  {/* Conductor y Vehículo */}
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 mb-2">Transporte</h4>
                    {s.driver && s.vehicle ? (
                      <>
                        <p className="font-medium text-slate-800">{s.driver.fullName}</p>
                        <p className="text-sm text-slate-600">{s.driver.phone}</p>
                        <p className="text-sm text-slate-600">{s.vehicle.plate} ({s.vehicle.kind || 'N/A'})</p>
                      </>
                    ) : (
                      <p className="text-slate-500">Sin asignar</p>
                    )}
                  </div>

                  {/* Carga */}
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 mb-2">Carga</h4>
                    <p className="font-medium text-slate-800">{s.cargoType || 'N/A'}</p>
                    <p className="text-sm text-slate-600">
                      {s.cargoQuantity || 0} bultos · {s.cargoWeightKg || 0} kg
                    </p>
                    <p className="text-sm text-slate-600">
                      {s.cargoVolumeM3 ? `${s.cargoVolumeM3} m³` : ''}
                      {s.requiresHelper ? ' · Con ayudante' : ''}
                    </p>
                  </div>
                </div>

                {/* Nota si existe */}
                {s.decisionNote && (
                  <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-sm text-amber-900 italic">"{s.decisionNote}"</p>
                  </div>
                )}
              </div>
            </div>

            {/* Columna Derecha - Mapa y Acciones */}
            <div className="w-96 flex flex-col bg-white border-l border-slate-200">
              {/* Mapa */}
              <div className="flex-1 min-h-0">
                {mapBlock}
              </div>

              {/* Checklist Simplificado */}
              <div className="border-t border-slate-200 p-4 bg-slate-50">
                <h4 className="text-sm font-semibold text-slate-900 mb-3">Estado del proceso</h4>
                <EnvioReadinessBlock shipmentId={s.id} />
              </div>
            </div>
          </div>
        ) : !q.isError ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-slate-500">Cargando ficha operativa…</p>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-rose-700">No se pudo cargar el detalle del envío.</p>
          </div>
        )}
      </div>

      {/* Content Móvil - Mantener original */}
      <div className="md:hidden min-h-0 flex-1 overflow-y-auto text-sm text-slate-800 sm:text-xs">
        {s ? (
          <div className="space-y-4 px-4 py-4 sm:space-y-3 sm:px-3 sm:py-3">
            <p>
              <span className="font-semibold">Cliente</span> · {s.customer.name}
            </p>
            {s.customer.phone ? <p className="text-slate-600">Tel. cliente: {s.customer.phone}</p> : null}
            <p>
              <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase text-slate-800 ring-1 ring-slate-200/80 sm:px-2 sm:py-0.5 sm:text-[10px]">
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
            <div className="rounded-lg border border-slate-200 bg-slate-50/90 p-3 sm:p-2">
              <p>
                <span className="font-semibold">Cobro</span> · {s.paymentStatus ?? "—"}
              </p>
              <p className="mt-1 tabular-nums sm:mt-0.5">
                Total: {fmtClp(s.totalAmount ?? s.amount)} · Pagado (lista):{" "}
                {listHint?.paidAmount != null ? fmtClp(listHint.paidAmount) : "—"}
              </p>
              <p className="mt-1 font-medium tabular-nums text-amber-900 sm:mt-0.5">
                Saldo lista: {balance != null && balance !== undefined ? fmtClp(balance) : "—"}
              </p>
            </div>
            <EnvioReadinessBlock shipmentId={s.id} />
          </div>
        ) : !q.isError ? (
          <p className="px-4 py-4 text-slate-500 sm:px-3 sm:py-3">Cargando ficha operativa…</p>
        ) : null}
        {mapBlock}
      </div>

      {/* Footer Actions */}
      {s && s.status === 'pendiente' && s.driver && s.vehicle && (s.amount || s.totalAmount) ? (
        <div className="space-y-3 border-t border-slate-200 bg-slate-50 px-4 py-4 sm:px-3 sm:py-3">
          <div className="space-y-2">
            <button
              type="button"
              className="w-full btn-primary bg-green-600 hover:bg-green-500 text-white font-semibold"
              onClick={assignAndApproveFromFloat}
              disabled={assignMut.isPending || approveMut.isPending}
            >
              {assignMut.isPending || approveMut.isPending ? (
                <span>Procesando...</span>
              ) : (
                <span>
                  <span className="sm:hidden">Aprobar</span>
                  <span className="hidden sm:inline">Aprobar solicitud</span>
                </span>
              )}
            </button>
            <button
              type="button"
              className="w-full btn-danger-outline"
              onClick={rejectFromFloat}
              disabled={rejectMut.isPending}
            >
              {rejectMut.isPending ? (
                <span>Procesando...</span>
              ) : (
                <span>
                  <span className="sm:hidden">Rechazar</span>
                  <span className="hidden sm:inline">Rechazar solicitud</span>
                </span>
              )}
            </button>
          </div>
          
          {/* Campos de asignación si faltan */}
          {(!s.driver || !s.vehicle || !(s.amount || s.totalAmount)) && (
            <div className="space-y-3 border-t border-slate-200 pt-3">
              <p className="text-xs font-medium text-slate-600">
                Completar datos antes de aprobar:
              </p>
              
              {!s.driver && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Conductor</label>
                  <select
                    value={selectedDriverId}
                    onChange={(e) => setSelectedDriverId(e.target.value)}
                    className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">Seleccionar conductor</option>
                    {rankedDriversForSelect.map((driver) => (
                      <option key={driver.driverId} value={driver.driverId}>
                        {driver.driverName}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              
              {!s.vehicle && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Vehículo</label>
                  <select
                    value={selectedVehicleId}
                    onChange={(e) => setSelectedVehicleId(e.target.value)}
                    className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">Seleccionar vehículo</option>
                    {driversQ.data?.find((d) => d.id === selectedDriverId)?.assignedVehicle ? (
                      <option value={driversQ.data?.find((d) => d.id === selectedDriverId)?.assignedVehicle?.id}>
                        {driversQ.data?.find((d) => d.id === selectedDriverId)?.assignedVehicle?.plate}
                      </option>
                    ) : (
                      driversQ.data?.map((driver) =>
                        driver.assignedVehicle ? (
                          <option key={driver.assignedVehicle.id} value={driver.assignedVehicle.id}>
                            {driver.assignedVehicle.plate} ({driver.fullName})
                          </option>
                        ) : null
                      )
                    )}
                  </select>
                </div>
              )}
              
              {(!s.amount && !s.totalAmount) && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Monto del servicio</label>
                  <input
                    type="text"
                    value={serviceAmountInput}
                    onChange={(e) => setServiceAmountInput(e.target.value)}
                    placeholder="Ej: 75000"
                    className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                  />
                </div>
              )}
              
              {/* Campo para motivo de rechazo */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Motivo de rechazo (si aplica)</label>
                <textarea
                  value={rejectNoteInput}
                  onChange={(e) => setRejectNoteInput(e.target.value)}
                  placeholder="Indicar motivo breve (mínimo 6 caracteres)"
                  rows={2}
                  className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm resize-none"
                />
              </div>
            </div>
          )}
        </div>
      ) : s && saldoNum > 0 ? (
        <div className="space-y-2 border-t border-slate-200 bg-slate-50 px-4 py-4 sm:px-3 sm:py-3">
          <button
            type="button"
            className="w-full rounded-lg border border-amber-300/90 bg-amber-50/90 py-3 text-sm font-semibold text-amber-950 hover:bg-amber-100 transition-colors sm:py-2.5 sm:text-xs"
            onClick={() => onRegistrarCobro({ shipmentId: s.id, balanceHint: String(balance) })}
          >
            <span className="sm:hidden">Registrar pago</span>
            <span className="hidden sm:inline">Registrar pago</span>
          </button>
        </div>
      ) : null}

      {/* Alert Modal */}
      <FloatingAlertModal
        open={guardAlert !== null}
        title="Faltan datos para continuar"
        message={guardAlert ?? ""}
        onClose={() => setGuardAlert(null)}
      />
    </>
  );

  return (
    <>
      {/* Desktop: Modal */}
      <ShipmentModal onClose={onClose}>
        {content}
      </ShipmentModal>

      {/* Móvil: Drawer */}
      <ShipmentDrawer isOpen={open} onClose={onClose}>
        {content}
      </ShipmentDrawer>
    </>
  );
}
