import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock,
  LocateFixed,
  MapPin,
  Package,
  Truck,
  X,
  XCircle,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { apiBlob, apiGet, apiSend, apiUpload, downloadBlob } from "../../api/client.js";
import { PortalShell } from "../PortalShell.js";
import { RouteMap, type MapMarker, type MapRoute } from "../../components/common/RouteMap.js";
import { NavigationExternalLinks } from "../../components/common/NavigationExternalLinks.js";
import { ContactButtons } from "../../components/common/ContactButtons.js";
import { notify } from "../../lib/notify.js";
import { sortDeliveriesByLifoUnload, sortPickupsByLoadSequence } from "../../lib/suggestRoute.js";
import { shipmentDriverPillTone, shipmentStatusLabel as sharedShipmentStatusLabel } from "../../lib/shipmentUi.js";
import {
  appleMapsDirectionsTo,
  googleMapsDirectionsTo,
  openInNewTab,
  toLatLng,
  wazeNavigateTo,
} from "../../lib/externalNavigation.js";
import {
  fromDateInputValue,
  historyRowTime,
  periodBounds,
  periodRangeDescription,
  toDateInputValue,
} from "../../lib/historyPeriod.js";
import {
  clearDriverMapOpenPreference,
  mapOpenPreferenceLabel,
  readDriverMapOpenPreference,
  type DriverMapOpenPreference,
  writeDriverMapOpenPreference,
} from "../../lib/driverMapPreference.js";

/** Modales del chofer: centrados en toda la pantalla (móvil y escritorio), por encima de la barra inferior. */
const CONDUCTOR_MODAL_OVERLAY =
  "fixed inset-0 z-[110] flex min-h-0 items-center justify-center overflow-y-auto bg-black/50 p-4";

/** Una clave por envío en sessionStorage: al menos un POST /location exitoso en esta pestaña desbloquea la app para ese viaje. */
function driverLocGateStorageKey(shipmentId: string) {
  return `tp_driver_loc_gate_ok_v1:${shipmentId}`;
}

/** El chofer cerró el bloqueo sin enviar (p. ej. navegador sin GPS). Solo esta pestaña; nuevo envío = nueva clave. */
function driverLocGateSkipStorageKey(shipmentId: string) {
  return `tp_driver_loc_gate_skip_v1:${shipmentId}`;
}

type ShipmentRow = {
  id: string;
  origin: string;
  destination: string;
  pickupAddress?: string | null;
  deliveryAddress?: string | null;
  status: string;
  createdAt?: string;
  scheduledPickup?: string | null;
  scheduledDelivery?: string | null;
  customer: { name: string; email?: string | null; phone?: string | null };
  paymentStatus?: string | null;
  paidAmount?: string | null;
  balanceAmount?: string | null;
  cargoQuantity?: string | number | null;
  originLat?: string | number | null;
  originLng?: string | number | null;
  destinationLat?: string | number | null;
  destinationLng?: string | number | null;
  lastLat?: string | number | null;
  lastLng?: string | number | null;
  cargoType?: string | null;
  cargoWeightKg?: string | number | null;
  cargoVolumeM3?: string | number | null;
  cargoDescription?: string | null;
  pickedUpAt?: string | null;
  enTransitoAt?: string | null;
  deliveredAt?: string | null;
  deliveredToName?: string | null;
  deliveredToId?: string | null;
  deliveryEvidence?: string | null;
  loadSequence?: string | number | null;
  unloadAccess?: string | null;
  attachments?: Array<{ id: string; kind: string; mimeType: string; sizeBytes: number; createdAt: string }>;
};

type SupportMessageRow = {
  id: string;
  body: string;
  createdAt: string;
  authorRole: string;
  shipment: { id: string; origin: string; destination: string } | null;
  author: { email: string; role: string };
};

type SettlementRow = {
  id: string;
  status: string;
  periodStart: string;
  periodEnd: string;
  entregasCount: number;
  grossAmount: string;
  netAmount: string;
  commissionPercent: string;
  createdAt: string;
};

type WebrtcConfig = {
  iceServers: Array<{ urls: string }>;
  signaling: string;
  hint: string;
};
type GeoSuggestion = { label: string; lat: number; lng: number };

function num(x: unknown): number | null {
  if (x === null || x === undefined || x === "") return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

/** Etiqueta y tonos consistentes con Admin y Cliente. */
function statusLabel(status: string): string {
  return sharedShipmentStatusLabel(status);
}

function statusPillClass(status: string): string {
  return shipmentDriverPillTone(status);
}

function ts(value?: string | null): number | null {
  if (!value) return null;
  const n = new Date(value).getTime();
  return Number.isFinite(n) ? n : null;
}

/** Retiro → entrega (solo envíos cerrados con marcas de tiempo coherentes). */
function tripDeliveredDurationMs(s: ShipmentRow): number | null {
  if (s.status !== "entregado" || !s.deliveredAt) return null;
  const end = ts(s.deliveredAt);
  if (end === null) return null;
  const start = ts(s.pickedUpAt) ?? ts(s.createdAt ?? null);
  if (start === null || end <= start) return null;
  return end - start;
}

function fmtDurationHours(ms: number): string {
  const totalMin = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

/** Tiempo desde el retiro (o inicio registrado) en viajes aún no entregados. */
function tripInProgressElapsedMs(s: ShipmentRow): number | null {
  if (s.status !== "recogido" && s.status !== "en_transito") return null;
  const start = ts(s.pickedUpAt) ?? ts(s.enTransitoAt) ?? ts(s.createdAt ?? null);
  if (start === null) return null;
  return Date.now() - start;
}

function paymentPillLabel(paymentStatus: string | null | undefined): string {
  switch (paymentStatus) {
    case "pagado":
      return "Pago OK";
    case "parcial":
      return "Pago parcial";
    default:
      return "Sin pago";
  }
}

function paymentPillClassName(paymentStatus: string | null | undefined): string {
  switch (paymentStatus) {
    case "pagado":
      return "bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-700/30";
    case "parcial":
      return "bg-amber-500 text-white shadow-sm ring-1 ring-amber-600/30";
    default:
      return "bg-red-600 text-white shadow-sm ring-1 ring-red-800/30";
  }
}

/** Una línea para listas: tipo, peso, volumen (evita abrir detalle). */
function cargoSummaryText(s: ShipmentRow): string | null {
  const parts: string[] = [];
  if (s.cargoType?.trim()) parts.push(s.cargoType.trim());
  if (s.cargoWeightKg != null && String(s.cargoWeightKg).trim() !== "") parts.push(`${s.cargoWeightKg} kg`);
  if (s.cargoVolumeM3 != null && String(s.cargoVolumeM3).trim() !== "") parts.push(`${s.cargoVolumeM3} m³`);
  if (s.cargoQuantity != null && String(s.cargoQuantity).trim() !== "") parts.push(`${s.cargoQuantity} u.`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

const VIAJES_ANCHORS = {
  porRetirar: "modulo-por-retirar",
  viaje: "viaje-seleccionado",
  acciones: "viaje-acciones",
} as const;

function scrollToViajesAnchor(elementId: string) {
  window.requestAnimationFrame(() => {
    document.getElementById(elementId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function openSelectedTrip(setSelectedId: (id: string) => void, id: string) {
  setSelectedId(id);
}

/** Estado de navegación: al cambiar de ruta se monta otro `ConductorHome`; el id viaja acá. */
type DriverLocationState = {
  focusShipmentId?: string;
  /** Dónde hacer scroll al abrir desde historial u otro flujo profundo. */
  focusAnchor?: typeof VIAJES_ANCHORS.viaje | typeof VIAJES_ANCHORS.acciones;
};

/** Desde Historial: ir a Mis viajes, seleccionar el envío y bajar a las acciones (botones de avance). */
function openInProgressFromHistorial(navigate: ReturnType<typeof useNavigate>, id: string) {
  navigate("/driver/viaje-activo", {
    state: { focusShipmentId: id, focusAnchor: VIAJES_ANCHORS.acciones } satisfies DriverLocationState,
  });
}

/** Últimos caracteres del id — para distinguir envíos con la misma ruta. */
function shipmentCode(id: string): string {
  return id.slice(-6).toUpperCase();
}

function fmtMoneyClp(n: number): string {
  return (Number.isFinite(n) ? n : 0).toLocaleString("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  });
}

type DriverNavStop = "pickup" | "delivery";

function defaultDriverNavStop(status: string): DriverNavStop {
  if (status === "confirmado") return "pickup";
  return "delivery";
}

function driverExternalNavStop(row: ShipmentRow, stop: DriverNavStop) {
  if (stop === "pickup") {
    return {
      label: "Retiro",
      coords: toLatLng(row.originLat, row.originLng),
      address: row.pickupAddress ?? row.origin,
    };
  }
  return {
    label: "Entrega",
    coords: toLatLng(row.destinationLat, row.destinationLng),
    address: row.deliveryAddress ?? row.destination,
  };
}

/** Devuelve false si conviene mostrar el modal (sin URL para app externa). */
function tryOpenMapWithPreference(
  pref: DriverMapOpenPreference,
  trip: ShipmentRow,
  stop: DriverNavStop,
  navigate: ReturnType<typeof useNavigate>
): boolean {
  if (pref === "app") {
    navigate("/driver/mapa", {
      state: { focusShipmentId: trip.id } satisfies DriverLocationState,
    });
    return true;
  }
  const stopMeta = driverExternalNavStop(trip, stop);
  const google = googleMapsDirectionsTo({ coords: stopMeta.coords, address: stopMeta.address });
  const waze = wazeNavigateTo({ coords: stopMeta.coords, address: stopMeta.address });
  const apple = appleMapsDirectionsTo({ coords: stopMeta.coords, address: stopMeta.address });
  if (pref === "google" && google) {
    openInNewTab(google);
    return true;
  }
  if (pref === "waze" && waze) {
    openInNewTab(waze);
    return true;
  }
  if (pref === "apple" && apple) {
    openInNewTab(apple);
    return true;
  }
  return false;
}

/** Carrusel táctil entre pedidos operativos (en ruta / por retirar). */
function DriverTripSwipeBar({
  trips,
  selectedId,
  onSelect,
}: {
  trips: ShipmentRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const touchRef = useRef<{ x: number } | null>(null);
  const idx = Math.max(0, trips.findIndex((t) => t.id === selectedId));
  const cur = trips[idx];

  function go(delta: number) {
    const n = trips.length;
    if (n <= 1) return;
    const next = (idx + delta + n) % n;
    onSelect(trips[next].id);
  }

  if (trips.length <= 1 || !cur) return null;

  return (
    <div
      className="mb-3 rounded-xl border border-green-200 bg-gradient-to-r from-green-50 to-white p-3 shadow-sm"
      onTouchStart={(e) => {
        touchRef.current = { x: e.touches[0].clientX };
      }}
      onTouchEnd={(e) => {
        const start = touchRef.current?.x;
        touchRef.current = null;
        if (start == null) return;
        const dx = e.changedTouches[0].clientX - start;
        if (dx > 56) go(-1);
        else if (dx < -56) go(1);
      }}
    >
      <p className="text-center text-[10px] font-semibold uppercase tracking-wide text-green-800">Tus pedidos hoy</p>
      <div className="mt-2 flex items-stretch gap-1">
        <button
          type="button"
          className="flex w-10 shrink-0 items-center justify-center rounded-lg border border-green-200 bg-white text-green-800 shadow-sm hover:bg-green-50"
          aria-label="Pedido anterior"
          onClick={() => go(-1)}
        >
          <ChevronLeft size={22} />
        </button>
        <div className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-2 text-center">
          <p className="text-[11px] font-bold tabular-nums text-green-900">
            {idx + 1} / {trips.length}
          </p>
          <p className="truncate text-xs font-semibold text-slate-900">
            {cur.origin} → {cur.destination}
          </p>
          <p className="font-mono text-[10px] text-slate-500">Envío ·{shipmentCode(cur.id)}</p>
        </div>
        <button
          type="button"
          className="flex w-10 shrink-0 items-center justify-center rounded-lg border border-green-200 bg-white text-green-800 shadow-sm hover:bg-green-50"
          aria-label="Pedido siguiente"
          onClick={() => go(1)}
        >
          <ChevronRight size={22} />
        </button>
      </div>
      <div className="mt-2 flex flex-wrap justify-center gap-1.5">
        {trips.map((t, i) => (
          <button
            key={t.id}
            type="button"
            aria-label={`Elegir pedido ${i + 1}`}
            title={`${t.origin} → ${t.destination}`}
            className={`h-2.5 w-2.5 rounded-full transition ${i === idx ? "scale-110 bg-green-600 ring-2 ring-green-300" : "bg-slate-300 hover:bg-slate-400"}`}
            onClick={() => onSelect(t.id)}
          />
        ))}
      </div>
      <p className="mt-2 text-center text-[10px] text-slate-500">Deslizá el dedo izquierda/derecha para cambiar de pedido</p>
    </div>
  );
}

/** Ayuda extendida (solo dentro del acordeón). */
const VIAJES_LIST_ORDER_HINT =
  "Por retirar: seguí el orden sugerido por la empresa. Con carga a bordo: entregá primero lo último que cargaste. Si falta número de secuencia, confirmá con despacho.";

const VIAJES_LIST_ORDER_SHORT = "Retiros: seguí el orden sugerido. Entregas: primero lo último cargado.";

export function ConductorHome() {
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const raw = (location.state as DriverLocationState | null)?.focusShipmentId;
    return typeof raw === "string" && raw.length > 0 ? raw : null;
  });
  const [historyFilter, setHistoryFilter] = useState<"all" | "done" | "inprogress">("all");
  /** Alcance del listado respecto a la fecha del calendario (sin botones “rápidos”). */
  const [historyPeriod, setHistoryPeriod] = useState<"day" | "week" | "month">("day");
  const [historyDateInput, setHistoryDateInput] = useState(() => toDateInputValue(new Date()));
  const [mapGroup, setMapGroup] = useState<"pickup" | "deliver">("deliver");
  const [alertComment, setAlertComment] = useState("");
  const [rejectDialog, setRejectDialog] = useState<{ shipmentId: string; mode: "pre_retiro" | "en_destino" } | null>(null);
  const [mapNavPicker, setMapNavPicker] = useState<{ shipmentId: string; stop: DriverNavStop } | null>(null);
  const [driverPickupListModalOpen, setDriverPickupListModalOpen] = useState(false);
  const [driverViajeAccionesModalOpen, setDriverViajeAccionesModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [receiverName, setReceiverName] = useState("");
  const [receiverDoc, setReceiverDoc] = useState("");
  const [deliveryEvidence, setDeliveryEvidence] = useState("");
  const [cashAmount, setCashAmount] = useState("");
  const [pickupChecklist, setPickupChecklist] = useState({
    typeOk: false,
    qtyOk: false,
    conditionOk: false,
  });
  const [supportDraft, setSupportDraft] = useState("");
  const [webrtcInfo, setWebrtcInfo] = useState<WebrtcConfig | null>(null);
  const [checkoutPeriod, setCheckoutPeriod] = useState<"day" | "week" | "month">("day");
  const [checkoutDate, setCheckoutDate] = useState(() => toDateInputValue(new Date()));
  const [checkoutNotes, setCheckoutNotes] = useState("");
  const [autoShareLocation, setAutoShareLocation] = useState(() => {
    try {
      return typeof localStorage !== "undefined" && localStorage.getItem("tp_driver_auto_gps_v1") === "1";
    } catch {
      return false;
    }
  });
  /** Solo para re-leer sessionStorage tras un envío de ubicación exitoso. */
  const [driverLocGateVersion, setDriverLocGateVersion] = useState(0);
  /** Mientras el navegador obtiene GPS (antes de que arranque el POST al servidor). */
  const [driverGeoRequestBusy, setDriverGeoRequestBusy] = useState(false);
  const locationQuietRef = useRef(false);

  const q = useQuery({ queryKey: ["shipments", "driver"], queryFn: () => apiGet<ShipmentRow[]>("/shipments") });
  const alertsQ = useQuery({
    queryKey: ["alerts", "driver"],
    queryFn: () => apiGet<Array<{ id: string; type: string; message: string; createdAt: string }>>("/alertas"),
  });
  const supportQ = useQuery({
    queryKey: ["support", "messages"],
    queryFn: () => apiGet<SupportMessageRow[]>("/support/messages"),
  });
  const settlementsQ = useQuery({
    queryKey: ["settlements", "driver"],
    queryFn: () => apiGet<SettlementRow[]>("/settlements"),
  });

  const rows = q.data ?? [];
  const active =
    rows.find((r) => r.id === selectedId) ??
    rows.find((r) => r.status === "en_transito" || r.status === "recogido") ??
    rows[0];

  const canCheckIn =
    !active?.scheduledPickup ||
    (() => {
      const t = new Date(active.scheduledPickup).getTime();
      return !Number.isFinite(t) || Date.now() >= t;
    })();

  const openMapForActiveTrip = useCallback(
    (opts?: { forceModal?: boolean }) => {
      if (!active) return;
      const stop = defaultDriverNavStop(active.status);
      if (opts?.forceModal) {
        setMapNavPicker({ shipmentId: active.id, stop });
        return;
      }
      const pref = readDriverMapOpenPreference();
      if (pref && tryOpenMapWithPreference(pref, active, stop, navigate)) return;
      setMapNavPicker({ shipmentId: active.id, stop });
    },
    [active, navigate]
  );

  useEffect(() => {
    if (!q.isSuccess || rows.length === 0) return;
    if (selectedId && rows.some((r) => r.id === selectedId)) return;
    const prefer = rows.find((r) => r.status !== "entregado" && r.status !== "rechazado");
    setSelectedId((prefer ?? rows[0]).id);
  }, [q.isSuccess, rows, selectedId]);

  useEffect(() => {
    setReceiverName("");
    setReceiverDoc("");
    setDeliveryEvidence("");
    setCashAmount("");
  }, [active?.id]);

  useEffect(() => {
    setPickupChecklist({ typeOk: false, qtyOk: false, conditionOk: false });
  }, [active?.id]);

  useEffect(() => {
    try {
      localStorage.setItem("tp_driver_auto_gps_v1", autoShareLocation ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [autoShareLocation]);

  /** Deep link / historial: foco de envío al entrar a la pantalla principal del chofer. */
  useEffect(() => {
    if (!location.pathname.toLowerCase().includes("/driver/viaje-activo")) return;
    const st = location.state as DriverLocationState | null;
    const id = st?.focusShipmentId;
    if (typeof id === "string" && id.length > 0 && rows.some((r) => r.id === id)) {
      setSelectedId(id);
    }
  }, [location.pathname, location.state, rows]);

  /** Abrir Mapa con un envío concreto: aplicar selección y limpiar state (si no, un refetch volvería a pisar la elección del chofer). */
  useEffect(() => {
    if (!location.pathname.toLowerCase().includes("/driver/mapa") || !q.isSuccess) return;
    const st = location.state as DriverLocationState | null;
    const id = st?.focusShipmentId;
    if (typeof id !== "string" || id.length === 0 || !rows.some((r) => r.id === id)) return;
    setSelectedId(id);
    navigate("/driver/mapa", { replace: true, state: {} });
  }, [location.pathname, location.state, rows, q.isSuccess, navigate]);

  const originGeoQ = useQuery({
    queryKey: ["geocode", "origin", active?.id, active?.pickupAddress ?? active?.origin],
    enabled:
      !!active &&
      num(active.originLat) === null &&
      num(active.originLng) === null &&
      !!(active.pickupAddress ?? active.origin),
    queryFn: () =>
      apiGet<GeoSuggestion[]>("/geocode/suggestions", {
        q: (active?.pickupAddress ?? active?.origin ?? "").trim(),
      }),
  });

  const destGeoQ = useQuery({
    queryKey: ["geocode", "dest", active?.id, active?.deliveryAddress ?? active?.destination],
    enabled:
      !!active &&
      num(active.destinationLat) === null &&
      num(active.destinationLng) === null &&
      !!(active.deliveryAddress ?? active.destination),
    queryFn: () =>
      apiGet<GeoSuggestion[]>("/geocode/suggestions", {
        q: (active?.deliveryAddress ?? active?.destination ?? "").trim(),
      }),
  });

  const attachmentsQ = useQuery({
    queryKey: ["attachments", active?.id],
    queryFn: () =>
      apiGet<
        Array<{ id: string; kind: string; mimeType: string; sizeBytes: number; createdAt: string; downloadPath: string }>
      >(`/shipments/${active!.id}/attachments`),
    enabled: !!active?.id,
  });

  const patch = useMutation({
    mutationFn: (payload: Record<string, unknown> & { id: string }) => {
      const { id, ...body } = payload;
      return apiSend(`/shipments/${id}`, "PATCH", body);
    },
    onMutate: () => {
      setError(null);
      setOkMsg(null);
    },
    onSuccess: (_data, variables) => {
      setReceiverName("");
      setReceiverDoc("");
      setDeliveryEvidence("");
      const st = variables.status;
      if (st === "recogido") setOkMsg("Carga retirada. Siguiente paso: marcá en tránsito cuando salgas del origen.");
      else if (st === "en_transito") setOkMsg("En tránsito confirmado. Siguiente paso: cerrar entrega con receptor.");
      else if (st === "entregado") setOkMsg("Entrega cerrada correctamente. Viaje completado.");
      else if (st === "rechazado") {
        const note = variables.note;
        const noteStr = typeof note === "string" ? note : "";
        setOkMsg(
          noteStr.includes("destino")
            ? "Rechazo en destino registrado. La empresa verá el motivo."
            : "Viaje rechazado. La empresa verá el motivo."
        );
      }
      window.setTimeout(() => setOkMsg(null), 6500);
      void qc.invalidateQueries({ queryKey: ["shipments", "driver"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const reportLocation = useMutation({
    mutationFn: (payload: { id: string; lat: number; lng: number }) =>
      apiSend(`/shipments/${payload.id}/location`, "POST", { lat: payload.lat, lng: payload.lng }),
    onMutate: () => {
      if (!locationQuietRef.current) {
        setError(null);
        setOkMsg("Enviando ubicación a la empresa...");
        notify("info", "Enviando ubicación a la empresa...");
      }
    },
    onSuccess: (_data, variables) => {
      try {
        sessionStorage.setItem(driverLocGateStorageKey(variables.id), "1");
      } catch {
        /* ignore */
      }
      setDriverLocGateVersion((v) => v + 1);
      if (!locationQuietRef.current) {
        setOkMsg(`Ubicación enviada correctamente (${new Date().toLocaleTimeString()}).`);
        notify("success", "Ubicación registrada en el envío para seguimiento de la empresa.");
        window.setTimeout(() => setOkMsg(null), 4500);
      }
      void qc.invalidateQueries({ queryKey: ["shipments", "driver"] });
    },
    onError: (e: Error) => {
      if (!locationQuietRef.current) {
        setOkMsg(null);
        setError(`No se pudo enviar ubicación: ${e.message}`);
        notify("error", "No se pudo enviar la ubicación.");
      }
    },
    onSettled: () => {
      locationQuietRef.current = false;
      setDriverGeoRequestBusy(false);
    },
  });

  const sendAlert = useMutation({
    mutationFn: (payload: { type: "retraso" | "mantenimiento"; message: string; shipmentId?: string }) =>
      apiSend("/alertas", "POST", {
        type: payload.type,
        message: payload.message,
        ...(payload.shipmentId ? { shipmentId: payload.shipmentId } : {}),
      }),
    onMutate: () => {
      setError(null);
      setOkMsg(null);
    },
    onSuccess: () => {
      setAlertComment("");
      setOkMsg("Alerta registrada en el sistema de tu empresa.");
      window.setTimeout(() => setOkMsg(null), 5000);
      void qc.invalidateQueries({ queryKey: ["alerts", "driver"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const cashCollect = useMutation({
    mutationFn: (payload: { shipmentId: string; amount: number }) =>
      apiSend("/payments", "POST", {
        shipmentId: payload.shipmentId,
        amount: payload.amount,
        method: "efectivo",
        reference: "Cobro en efectivo registrado por el chofer",
        paidAt: new Date().toISOString(),
      }),
    onSuccess: () => {
      setCashAmount("");
      notify(
        "success",
        "Cobro en efectivo registrado en el envío. La empresa lo valida en pagos."
      );
      void qc.invalidateQueries({ queryKey: ["shipments"] });
    },
    onError: (e: Error) => notify("error", e.message),
  });

  const postSupport = useMutation({
    mutationFn: (body: { body: string; shipmentId?: string }) => apiSend("/support/messages", "POST", body),
    onSuccess: () => {
      setSupportDraft("");
      void qc.invalidateQueries({ queryKey: ["support", "messages"] });
      notify("success", "Mensaje guardado en el hilo de soporte (tu empresa lo ve en despacho).");
    },
    onError: (e: Error) => setError(e.message),
  });

  const uploadAttachment = useMutation({
    mutationFn: async (p: { shipmentId: string; file: File; kind: "delivery_photo" | "delivery_signature" }) => {
      const fd = new FormData();
      fd.append("file", p.file);
      fd.append("kind", p.kind);
      return apiUpload<{ id: string }>(`/shipments/${p.shipmentId}/attachments`, fd);
    },
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ["shipments", "driver"] });
      void qc.invalidateQueries({ queryKey: ["attachments", vars.shipmentId] });
      notify("success", "Archivo adjunto guardado en este envío.");
    },
    onError: (e: Error) => setError(e.message),
  });

  const checkoutMut = useMutation({
    mutationFn: (p: { period: "day" | "week" | "month"; anchorDate: string; notes?: string }) =>
      apiSend("/settlements/checkout", "POST", p),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["settlements", "driver"] });
      setOkMsg("Pre-liquidación generada. Tu empresa la revisará en liquidaciones.");
      window.setTimeout(() => setOkMsg(null), 6000);
    },
    onError: (e: Error) => setError(e.message),
  });

  function shareLocation(id: string, opts?: { quiet?: boolean }) {
    const quiet = opts?.quiet ?? false;
    locationQuietRef.current = quiet;
    if (!("geolocation" in navigator)) {
      setError("Este dispositivo no soporta geolocalización");
      notify("error", "Este dispositivo no soporta geolocalización.");
      return;
    }
    setDriverGeoRequestBusy(true);
    setError(null);
    if (!quiet) {
      setOkMsg("Obteniendo ubicación del dispositivo...");
      notify("info", "Obteniendo ubicación del dispositivo...");
    }

    const onSuccess = (pos: GeolocationPosition) => {
      reportLocation.mutate({ id, lat: pos.coords.latitude, lng: pos.coords.longitude });
    };

    const onFinalError = (err: GeolocationPositionError) => {
      setDriverGeoRequestBusy(false);
      if (!quiet) {
        setOkMsg(null);
        const hint =
          err.code === GeolocationPositionError.PERMISSION_DENIED
            ? " Permití la ubicación para este sitio (ícono de candado o Ajustes del sitio)."
            : err.code === GeolocationPositionError.TIMEOUT
              ? " Tiempo agotado. Probá al aire libre o cerca de una ventana; en el celular usá Chrome o Safari."
              : " Si usás un navegador integrado del editor, probá la misma URL en Chrome o Edge (mejor con HTTPS).";
        setError(`No se pudo obtener ubicación: ${err.message}.${hint}`);
        notify("error", "No se pudo obtener ubicación del dispositivo.");
      }
      locationQuietRef.current = false;
    };

    /** Segundo intento: sin forzar GPS ni rechazar caché (evita fallos cuando el “proveedor de red” del navegador da error, p. ej. 403 a Google). */
    const tryLoosePosition = () => {
      if (!quiet) {
        setOkMsg("Reintentando con ubicación aproximada o última conocida…");
        notify("info", "Reintentando ubicación (modo compatible)…");
      }
      navigator.geolocation.getCurrentPosition(onSuccess, onFinalError, {
        enableHighAccuracy: false,
        timeout: 28_000,
        maximumAge: 300_000,
      });
    };

    navigator.geolocation.getCurrentPosition(
      onSuccess,
      (err) => {
        if (err.code === GeolocationPositionError.PERMISSION_DENIED) {
          onFinalError(err);
          return;
        }
        tryLoosePosition();
      },
      { enableHighAccuracy: true, timeout: 18_000, maximumAge: 0 }
    );
  }

  /**
   * Seguimiento por GPS: `watchPosition` sigue intentando mientras la pestaña existe (a veces también
   * con la app en segundo plano, según el navegador). Sin servicios de pago: solo la API del navegador.
   * Los envíos al servidor van limitados (mín. ~1 min) para no saturar la API.
   */
  useEffect(() => {
    if (!autoShareLocation || !active?.id) return;
    if (!["confirmado", "recogido", "en_transito"].includes(active.status)) return;
    if (!("geolocation" in navigator)) return;

    let cancelled = false;
    const shipmentId = active.id;
    let lastSentMs = 0;
    const minIntervalMs = 60_000;

    const sendQuiet = (lat: number, lng: number) => {
      if (cancelled) return;
      const now = Date.now();
      if (now - lastSentMs < minIntervalMs) return;
      lastSentMs = now;
      locationQuietRef.current = true;
      reportLocation.mutate({ id: shipmentId, lat, lng });
    };

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        sendQuiet(pos.coords.latitude, pos.coords.longitude);
      },
      () => {
        /* errores en modo automático: no spamear toasts */
      },
      { enableHighAccuracy: true, maximumAge: 45_000, timeout: 25_000 }
    );

    const kickoff = window.setTimeout(() => {
      shareLocation(shipmentId, { quiet: true });
    }, 6_000);

    return () => {
      cancelled = true;
      window.clearTimeout(kickoff);
      navigator.geolocation.clearWatch(watchId);
    };
  }, [autoShareLocation, active?.id, active?.status]);

  const markers: MapMarker[] = [];
  const routes: MapRoute[] = [];
  if (active) {
    const originFallback = originGeoQ.data?.[0];
    const destFallback = destGeoQ.data?.[0];
    const oLat = num(active.originLat) ?? originFallback?.lat ?? null;
    const oLng = num(active.originLng) ?? originFallback?.lng ?? null;
    const dLat = num(active.destinationLat) ?? destFallback?.lat ?? null;
    const dLng = num(active.destinationLng) ?? destFallback?.lng ?? null;
    const lLat = num(active.lastLat);
    const lLng = num(active.lastLng);
    if (oLat !== null && oLng !== null) markers.push({ lat: oLat, lng: oLng, label: `Retiro: ${active.origin}`, color: "blue" });
    if (dLat !== null && dLng !== null) markers.push({ lat: dLat, lng: dLng, label: `Entrega: ${active.destination}`, color: "green" });
    if (lLat !== null && lLng !== null) markers.push({ lat: lLat, lng: lLng, label: "Tu última posición", color: "orange" });
    if (oLat !== null && oLng !== null && dLat !== null && dLng !== null) {
      routes.push({ from: { lat: oLat, lng: oLng }, to: { lat: dLat, lng: dLng }, color: "#10b981" });
    }
  }

  /** Por retirar / por recoger: una sola lista para mapa y selección (mismo orden y mismo total). */
  const pickupTrips = sortPickupsByLoadSequence(rows.filter((r) => r.status === "confirmado"));
  const inProgressTrips = sortDeliveriesByLifoUnload(
    rows.filter((r) => r.status === "recogido" || r.status === "en_transito")
  );
  /** Pedidos en los que el chofer debe actuar ahora: primero los que ya van en camión, luego los que faltan retirar. */
  const driverSwipeTrips = useMemo(() => {
    const seen = new Set<string>();
    const out: ShipmentRow[] = [];
    for (const t of inProgressTrips) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      out.push(t);
    }
    for (const t of pickupTrips) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      out.push(t);
    }
    return out;
  }, [inProgressTrips, pickupTrips]);
  const allTripsByDate = [...rows].sort((a, b) => (ts(b.createdAt) ?? 0) - (ts(a.createdAt) ?? 0));
  const historyAnchorDate = (() => {
    const d = fromDateInputValue(historyDateInput);
    if (Number.isNaN(d.getTime())) {
      const t = new Date();
      t.setHours(12, 0, 0, 0);
      return t;
    }
    return d;
  })();
  const { start: periodStart, end: periodEnd } = periodBounds(historyPeriod, historyAnchorDate);
  const periodT0 = periodStart.getTime();
  const periodT1 = periodEnd.getTime();
  const rowsInPeriod = allTripsByDate.filter((t) => {
    const r = historyRowTime(t);
    return r !== null && r >= periodT0 && r <= periodT1;
  });
  const doneTripsInPeriod = rowsInPeriod.filter((r) => r.status === "entregado");
  const historyRows =
    historyFilter === "done"
      ? rowsInPeriod.filter((r) => r.status === "entregado")
      : historyFilter === "inprogress"
        ? inProgressTrips
        : rowsInPeriod;

  const doneDurationSamples = doneTripsInPeriod
    .map((s) => tripDeliveredDurationMs(s))
    .filter((ms): ms is number => ms !== null && ms > 0);
  const avgDeliveredDurationMs =
    doneDurationSamples.length > 0
      ? doneDurationSamples.reduce((a, b) => a + b, 0) / doneDurationSamples.length
      : null;

  const todayNoon = (() => {
    const t = new Date();
    t.setHours(12, 0, 0, 0);
    return t;
  })();
  const { start: hoyStart, end: hoyEnd } = periodBounds("day", todayNoon);
  const entregasHoyCount = rows.filter((r) => {
    if (r.status !== "entregado" || !r.deliveredAt) return false;
    const t = ts(r.deliveredAt);
    return t !== null && t >= hoyStart.getTime() && t <= hoyEnd.getTime();
  }).length;
  const deliverTrips = sortDeliveriesByLifoUnload(
    rows.filter((r) => r.status === "recogido" || r.status === "en_transito")
  );
  const path = location.pathname.toLowerCase();
  /** Una sola pantalla principal de viajes (`/driver/viaje-activo`); se muestran también cobro, contacto y despacho. */
  const showSecondaryBlocks = true;
  const currentView = path.includes("/driver/mapa")
    ? "mapa"
    : path.includes("/driver/alertas")
      ? "alertas"
      : path.includes("/driver/historial")
        ? "historial"
        : "viajes";
  /** Listas en ejecución / por retirar: mismo scroll que antes en «Mis viajes», ahora bajo el viaje principal. */
  const showPlanningLists = currentView === "viajes";

  /** El pedido elegido debe ser uno operativo (en ruta o por retirar) en la pantalla principal. */
  useEffect(() => {
    if (currentView !== "viajes" || !q.isSuccess) return;
    if (driverSwipeTrips.length === 0) return;
    if (selectedId && driverSwipeTrips.some((t) => t.id === selectedId)) return;
    setSelectedId(driverSwipeTrips[0].id);
  }, [currentView, q.isSuccess, driverSwipeTrips, selectedId]);

  /** Tras venir del historial (u otro deep link), abrir el panel flotante y hacer scroll al ancla pedida. */
  useEffect(() => {
    if (currentView !== "viajes" || !q.isSuccess) return;
    const st = location.state as DriverLocationState | null;
    const focusId = st?.focusShipmentId;
    const anchor = st?.focusAnchor ?? VIAJES_ANCHORS.viaje;
    if (!focusId || selectedId !== focusId) return;
    if (!rows.some((r) => r.id === focusId)) return;
    setDriverViajeAccionesModalOpen(true);
    const tid = window.setTimeout(() => {
      const primary = document.getElementById(anchor);
      const fallback = document.getElementById(VIAJES_ANCHORS.viaje);
      (primary ?? fallback)?.scrollIntoView({ behavior: "smooth", block: "start" });
      navigate(location.pathname, { replace: true, state: {} });
    }, 320);
    return () => clearTimeout(tid);
  }, [currentView, q.isSuccess, selectedId, rows, location.state, location.pathname, navigate]);

  const driverSavedMapPref = readDriverMapOpenPreference();

  const driverNeedsLocationShareGate =
    !!active && ["confirmado", "recogido", "en_transito"].includes(active.status);
  const showLocationBlockingGate = useMemo(() => {
    if (!active?.id || !driverNeedsLocationShareGate) return false;
    try {
      if (sessionStorage.getItem(driverLocGateSkipStorageKey(active.id)) === "1") return false;
      return sessionStorage.getItem(driverLocGateStorageKey(active.id)) !== "1";
    } catch {
      return true;
    }
  }, [active?.id, driverNeedsLocationShareGate, driverLocGateVersion]);

  useEffect(() => {
    if (!showLocationBlockingGate) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [showLocationBlockingGate]);

  useEffect(() => {
    if (showPlanningLists) return;
    setDriverPickupListModalOpen(false);
    setDriverViajeAccionesModalOpen(false);
  }, [showPlanningLists]);

  function renderDriverPickupTripsList(onDismiss?: () => void) {
    return (
      <>
        <div className="flex items-center gap-2 text-green-800">
          <Package className="shrink-0" size={20} />
          <h2 className="text-base font-semibold">Elegí el viaje asignado</h2>
        </div>
        <p className="mt-1 text-xs text-slate-600">
          Cada tarjeta es un <strong className="font-medium text-slate-800">pedido distinto</strong> aunque la ruta se
          repita. Usá el código <strong className="font-mono">·XXXXXX</strong> para no confundirlos. Tocá una tarjeta
          para trabajarla.
        </p>
        <p className="mt-1 text-[10px] leading-snug text-slate-500">{VIAJES_LIST_ORDER_SHORT}</p>
        <div className="mt-3 space-y-2">
          {pickupTrips.length === 0 && rows.length > 0 ? (
            <p className="text-sm text-slate-600">No hay viajes nuevos por retirar en este momento.</p>
          ) : null}
          {pickupTrips.map((s) => {
            const sel = selectedId === s.id;
            const cargoLine = cargoSummaryText(s);
            return (
              <div
                key={s.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  openSelectedTrip(setSelectedId, s.id);
                  onDismiss?.();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openSelectedTrip(setSelectedId, s.id);
                    onDismiss?.();
                  }
                }}
                className={`flex w-full items-start gap-3 rounded-xl border-2 p-3 text-left transition ${
                  sel ? "border-green-600 bg-green-50 ring-2 ring-green-200" : "border-slate-200 bg-slate-50 hover:border-green-300"
                }`}
              >
                <span
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${sel ? "bg-green-600 text-white" : "bg-white text-slate-400 ring-1 ring-slate-200"}`}
                >
                  {sel ? <Check size={18} /> : <Circle size={18} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusPillClass(s.status)}`}>
                      Falta retirar
                    </span>
                    <span className="font-mono text-[11px] font-semibold text-slate-700">Envío ·{shipmentCode(s.id)}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${paymentPillClassName(s.paymentStatus)}`}>
                      {paymentPillLabel(s.paymentStatus)}
                    </span>
                  </div>
                  <p className="mt-1 font-semibold text-slate-900">
                    {s.origin} → {s.destination}
                  </p>
                  <p className="text-xs text-slate-600">{s.customer.name}</p>
                  {cargoLine ? <p className="mt-0.5 text-[11px] font-medium text-slate-700">Carga: {cargoLine}</p> : null}
                  <p className="mt-0.5 text-[11px] text-slate-600">
                    <span className="text-slate-500">Ir a buscar:</span> {fmtDate(s.scheduledPickup)}
                  </p>
                  <p className="text-[11px] text-slate-600">
                    <span className="text-slate-500">Entregar antes de:</span> {fmtDate(s.scheduledDelivery)}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="rounded-md bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-500"
                      onClick={() => {
                        navigate("/driver/viaje-activo", {
                          state: {
                            focusShipmentId: s.id,
                            focusAnchor: VIAJES_ANCHORS.acciones,
                          } satisfies DriverLocationState,
                        });
                        onDismiss?.();
                      }}
                    >
                      Trabajar este viaje
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-red-300 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-800 hover:bg-red-100"
                      onClick={() => {
                        setRejectDialog({ shipmentId: s.id, mode: "pre_retiro" });
                        setRejectReason("");
                        onDismiss?.();
                      }}
                    >
                      Rechazar…
                    </button>
                  </div>
                </div>
                <ChevronRight className="mt-1 shrink-0 text-slate-400" size={18} />
              </div>
            );
          })}
          {rows.length === 0 ? <p className="text-sm text-slate-500">Todavía no tenés viajes asignados.</p> : null}
        </div>
      </>
    );
  }

  function renderViajeMainPanel() {
    if (!active) return null;
    return (
          <section
            id={VIAJES_ANCHORS.viaje}
            className="scroll-mt-4 rounded-2xl border-2 border-green-300 bg-white p-4 shadow-sm md:scroll-mt-6"
          >
            <DriverTripSwipeBar
              trips={driverSwipeTrips}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
            <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-green-700">Viaje seleccionado</p>
                <p className="text-base font-bold text-slate-900">
                  {active.origin} → {active.destination}
                </p>
                <p className="text-xs text-slate-600">Cliente: {active.customer.name}</p>
                <p className="font-mono text-[10px] text-slate-500">Envío ·{shipmentCode(active.id)}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${paymentPillClassName(active.paymentStatus)}`}
                    title="Estado de pago del pedido según la empresa"
                  >
                    {paymentPillLabel(active.paymentStatus)}
                  </span>
                  {active.balanceAmount != null && Number(active.balanceAmount) > 0 && active.paymentStatus !== "pagado" ? (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">
                      Falta cobrar según sistema: {fmtMoneyClp(Number(active.balanceAmount))}
                    </span>
                  ) : null}
                </div>

                {/* Botón "Cobré en efectivo" para envíos en curso con saldo pendiente */}
                {showSecondaryBlocks &&
                active.balanceAmount != null &&
                Number(active.balanceAmount) > 0 &&
                active.paymentStatus !== "pagado" &&
                ["confirmado", "recogido", "en_transito", "entregado"].includes(active.status) ? (
                  <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-2">
                    <p className="text-[11px] font-semibold text-emerald-900">Registrar cobro en efectivo</p>
                    <p className="text-[10px] text-emerald-800">
                      Sugerido: {fmtMoneyClp(Number(active.balanceAmount ?? 0))}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <input
                        className="min-w-0 flex-1 rounded-md border border-emerald-200 bg-white px-2 py-1.5 text-sm"
                        inputMode="numeric"
                        placeholder="Monto cobrado"
                        value={cashAmount}
                        onChange={(e) => setCashAmount(e.target.value)}
                      />
                      <button
                        type="button"
                        className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-60"
                        disabled={cashCollect.isPending}
                        onClick={() => {
                          const amount = Number(cashAmount.replace(/[^\d]/g, ""));
                          if (!Number.isFinite(amount) || amount <= 0) {
                            notify("error", "Ingresá el monto cobrado.");
                            return;
                          }
                          cashCollect.mutate({ shipmentId: active.id, amount });
                        }}
                      >
                        {cashCollect.isPending ? "Guardando…" : "Guardar"}
                      </button>
                    </div>
                  </div>
                ) : null}
                {showSecondaryBlocks ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <ContactButtons
                      phone={active.customer.phone}
                      email={active.customer.email}
                      whatsappMessage={`Hola ${active.customer.name}, soy el chofer del envío ${active.origin} → ${active.destination}.`}
                      emailSubject={`Envío ${shipmentCode(active.id)} · ${active.origin} → ${active.destination}`}
                    />
                    <Link
                      to="/driver/alertas"
                      className="inline-flex rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-800 hover:bg-slate-50"
                    >
                      Avisos a la empresa
                    </Link>
                  </div>
                ) : null}
                {showSecondaryBlocks ? (
                <details className="mt-3 rounded-lg border border-slate-200 bg-slate-50/90 p-2">
                  <summary className="cursor-pointer text-[11px] font-semibold text-slate-800 [&::-webkit-details-marker]:hidden">
                    Mensajes a despacho
                  </summary>
                  <div className="mt-2 space-y-2 border-t border-slate-200 pt-2">
                    <p className="text-[10px] leading-snug text-slate-600">
                      Escribí una novedad corta. La empresa la verá asociada a este viaje.
                    </p>
                    <div className="max-h-32 space-y-1 overflow-y-auto text-[10px] text-slate-700">
                      {(supportQ.data ?? []).slice(-12).map((m) => (
                        <div key={m.id} className="rounded border border-slate-100 bg-white px-2 py-1">
                          <span className="font-semibold text-slate-800">{m.authorRole}</span> ·{" "}
                          {new Date(m.createdAt).toLocaleString()}
                          <p className="whitespace-pre-wrap">{m.body}</p>
                        </div>
                      ))}
                    </div>
                    <textarea
                      className="w-full rounded border border-slate-300 p-2 text-[11px]"
                      rows={2}
                      value={supportDraft}
                      onChange={(e) => setSupportDraft(e.target.value)}
                      placeholder="Escribí a despacho (este viaje se adjunta si está seleccionado)"
                    />
                    <button
                      type="button"
                      className="w-full rounded-lg bg-slate-800 py-2 text-[11px] font-bold text-white hover:bg-slate-700 disabled:opacity-50"
                      disabled={postSupport.isPending || supportDraft.trim().length < 1}
                      onClick={() =>
                        postSupport.mutate({ body: supportDraft.trim(), shipmentId: active.id })
                      }
                    >
                      {postSupport.isPending ? "Enviando…" : "Enviar mensaje"}
                    </button>
                    <details className="rounded-md border border-dashed border-slate-300 bg-white px-2 py-1">
                      <summary className="cursor-pointer text-[10px] font-semibold text-slate-500 [&::-webkit-details-marker]:hidden">
                        Opciones técnicas de llamada demo
                      </summary>
                      <div className="mt-2 space-y-2 border-t border-slate-100 pt-2">
                        <button
                          type="button"
                          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[10px] font-semibold text-slate-800 hover:bg-slate-50"
                          onClick={async () => {
                            try {
                              const cfg = await apiGet<WebrtcConfig>("/communications/webrtc/config");
                              setWebrtcInfo(cfg);
                            } catch (e) {
                              setError((e as Error).message);
                            }
                          }}
                        >
                          Ver configuración técnica
                        </button>
                        {webrtcInfo ? (
                          <pre className="max-h-28 overflow-auto rounded bg-slate-900 p-2 text-[9px] text-emerald-100">
                            {JSON.stringify(webrtcInfo, null, 2)}
                          </pre>
                        ) : null}
                        <button
                          type="button"
                          className="rounded-md border border-violet-300 bg-violet-50 px-2 py-1 text-[10px] font-semibold text-violet-900 hover:bg-violet-100"
                          onClick={() =>
                            void apiSend("/communications/webrtc/session", "POST", { shipmentId: active.id }).then(
                              () => notify("info", "Sesión demo registrada."),
                              (e: Error) => setError(e.message)
                            )
                          }
                        >
                          Registrar intención de llamada
                        </button>
                      </div>
                    </details>
                  </div>
                </details>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
                  onClick={() => openMapForActiveTrip()}
                >
                  <MapPin size={15} className="text-green-700" aria-hidden />
                  Ver en mapa
                </button>
                {driverSavedMapPref ? (
                  <button
                    type="button"
                    className="max-w-[11rem] text-right text-[9px] font-medium text-slate-500 underline decoration-slate-300 underline-offset-2 hover:text-slate-700"
                    onClick={() => openMapForActiveTrip({ forceModal: true })}
                  >
                    Cambiar app ({mapOpenPreferenceLabel(driverSavedMapPref)})
                  </button>
                ) : null}
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusPillClass(active.status)}`}>
                  {statusLabel(active.status)}
                </span>
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-2 flex items-center gap-2 text-slate-800">
                <Truck size={18} />
                <h3 className="text-sm font-semibold">Marcá el avance del viaje</h3>
              </div>
              <ol className="relative space-y-0 border-l-2 border-slate-200 pl-6">
                <StepLine
                  n={1}
                  title="Retiro: carga en el camión"
                  desc="Cuando llegues al origen y la mercadería esté cargada (o retirada), confirmá acá. Es el paso «ya tengo la carga en el vehículo»."
                  done={["recogido", "en_transito", "entregado"].includes(active.status)}
                  current={active.status === "confirmado"}
                />
                <StepLine
                  n={2}
                  title="En camino al destino"
                  desc="Cuando salgas hacia la entrega, tocá acá. Así la empresa y el cliente ven que vas en ruta."
                  done={["en_transito", "entregado"].includes(active.status)}
                  current={active.status === "recogido"}
                />
                <StepLine
                  n={3}
                  title="Entrega y quién recibe"
                  desc="Al llegar, completá el nombre de quien recibe y cerrá el servicio."
                  done={active.status === "entregado"}
                  current={active.status === "en_transito"}
                />
              </ol>
            </div>

            <div className="mt-4 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
              <p className="font-semibold text-slate-800">Detalle de carga</p>
              <p className="mt-1">
                Tipo: <strong>{active.cargoType ?? "—"}</strong>
                {active.cargoQuantity != null && String(active.cargoQuantity).trim() !== ""
                  ? ` · Cant.: ${active.cargoQuantity}`
                  : ""}
                {active.cargoWeightKg != null ? ` · Peso: ${active.cargoWeightKg} kg` : ""}
                {active.cargoVolumeM3 != null ? ` · Vol.: ${active.cargoVolumeM3} m³` : ""}
              </p>
              {active.cargoDescription ? <p className="mt-1 text-slate-600">{active.cargoDescription}</p> : null}
              {(active.pickedUpAt || active.enTransitoAt) ? (
                <p className="mt-2 text-[11px] text-slate-500">
                  {active.pickedUpAt ? `Retiro registrado: ${fmtDate(active.pickedUpAt)} · ` : ""}
                  {active.enTransitoAt ? `En ruta: ${fmtDate(active.enTransitoAt)}` : ""}
                </p>
              ) : null}
            </div>

            <div
              id={VIAJES_ANCHORS.acciones}
              className="scroll-mt-4 mt-4 space-y-3 rounded-xl bg-slate-50 p-3 md:scroll-mt-6"
            >
              {active.status === "confirmado" ? (
                <div>
                  <div className="mb-2 rounded-lg border border-slate-200 bg-white p-2">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-slate-800">Checklist de retiro</p>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                        {[pickupChecklist.typeOk, pickupChecklist.qtyOk, pickupChecklist.conditionOk].filter(Boolean).length}/3
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600">Marcá los 3 pasos antes de confirmar recogido.</p>
                  </div>
                  <label className="flex cursor-pointer items-start gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[10px] leading-snug text-slate-800 sm:text-[11px]">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300"
                      checked={pickupChecklist.typeOk}
                      onChange={(e) => setPickupChecklist((c) => ({ ...c, typeOk: e.target.checked }))}
                    />
                    <span><strong>1.</strong> El <strong>tipo de carga</strong> coincide con el pedido (etiqueta/remito).</span>
                  </label>
                  <label className="mt-1.5 flex cursor-pointer items-start gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[10px] leading-snug text-slate-800 sm:text-[11px]">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300"
                      checked={pickupChecklist.qtyOk}
                      onChange={(e) => setPickupChecklist((c) => ({ ...c, qtyOk: e.target.checked }))}
                    />
                    <span>
                      <strong>2.</strong> La <strong>cantidad / bultos</strong> y peso-volumen coinciden (sin faltantes obvios).
                    </span>
                  </label>
                  <label className="mt-1.5 flex cursor-pointer items-start gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[10px] leading-snug text-slate-800 sm:text-[11px]">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300"
                      checked={pickupChecklist.conditionOk}
                      onChange={(e) => setPickupChecklist((c) => ({ ...c, conditionOk: e.target.checked }))}
                    />
                    <span><strong>3.</strong> La carga está en <strong>estado aceptable</strong> para transporte (sin daño grave visible).</span>
                  </label>
                  <p className="mb-2 mt-3 text-xs text-slate-600">
                    Cuando esté <strong>subida al camión</strong>, marcá recogido.
                  </p>
                  <button
                    type="button"
                    className="w-full rounded-xl bg-green-600 px-4 py-4 text-base font-bold text-white shadow hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-45"
                    title={
                      !canCheckIn && active.scheduledPickup
                        ? `Disponible desde ${fmtDate(active.scheduledPickup)}`
                        : !pickupChecklist.typeOk || !pickupChecklist.qtyOk || !pickupChecklist.conditionOk
                          ? "Marcá las tres casillas del checklist"
                          : undefined
                    }
                    disabled={
                      !canCheckIn ||
                      patch.isPending ||
                      !pickupChecklist.typeOk ||
                      !pickupChecklist.qtyOk ||
                      !pickupChecklist.conditionOk
                    }
                    onClick={() =>
                      patch.mutate({
                        id: active.id,
                        status: "recogido",
                        note: "Carga retirada / en vehículo (checklist conductor)",
                      })
                    }
                  >
                    {patch.isPending ? "Guardando…" : "Carga lista — ya está en mi camión"}
                  </button>
                  {!canCheckIn && active.scheduledPickup ? (
                    <p className="mt-2 text-xs text-amber-700">Retiro habilitado desde: {fmtDate(active.scheduledPickup)}</p>
                  ) : null}
                  {canCheckIn &&
                  (!pickupChecklist.typeOk || !pickupChecklist.qtyOk || !pickupChecklist.conditionOk) ? (
                    <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                      Para activar el botón, marcá las 3 casillas del checklist.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {active.status === "recogido" ? (
                <div>
                  <p className="mb-2 text-xs text-slate-600">Saliste del origen y vas hacia el cliente / bodega de destino.</p>
                  <button
                    type="button"
                    className="w-full rounded-xl bg-cyan-600 px-4 py-4 text-base font-bold text-white shadow hover:bg-cyan-500 disabled:opacity-50"
                    disabled={patch.isPending}
                    onClick={() => patch.mutate({ id: active.id, status: "en_transito", note: "En camino al destino" })}
                  >
                    {patch.isPending ? "Guardando…" : "Marcar en tránsito"}
                  </button>
                  <button
                    type="button"
                    className="mt-2 w-full rounded-lg border border-red-200 bg-red-50 py-2 text-sm font-semibold text-red-900 hover:bg-red-100"
                    onClick={() => {
                      setRejectDialog({ shipmentId: active.id, mode: "en_destino" });
                      setRejectReason("");
                    }}
                  >
                    Incidencia en destino (sin entrega)…
                  </button>
                </div>
              ) : null}

              {active.status === "en_transito" ? (
                <div className="rounded-xl border border-blue-200 bg-blue-50/90 p-3">
                  <p className="text-sm font-semibold text-blue-900">Cerrar entrega</p>
                  <p className="mt-0.5 text-xs text-blue-800">Obligatorio: quién recibió la carga.</p>
                  <p className="mt-1 text-[10px] leading-snug text-blue-900/90">
                    Podés subir <strong>foto</strong> o <strong>firma/PDF</strong> al servidor (JPG, PNG, WebP o PDF, máx. 8&nbsp;MB).
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-[10px] font-semibold text-slate-800 hover:bg-slate-50">
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = "";
                          if (f) uploadAttachment.mutate({ shipmentId: active.id, file: f, kind: "delivery_photo" });
                        }}
                      />
                      Subir foto
                    </label>
                    <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-[10px] font-semibold text-slate-800 hover:bg-slate-50">
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = "";
                          if (f) uploadAttachment.mutate({ shipmentId: active.id, file: f, kind: "delivery_signature" });
                        }}
                      />
                      Subir firma / PDF
                    </label>
                  </div>
                  {attachmentsQ.data && attachmentsQ.data.length > 0 ? (
                    <ul className="mt-2 space-y-1 text-[10px] text-slate-700">
                      {attachmentsQ.data.map((a) => (
                        <li key={a.id}>
                          <button
                            type="button"
                            className="font-medium text-blue-700 underline"
                            onClick={() =>
                              void apiBlob(`/attachments/${a.id}/file`).then((blob) =>
                                downloadBlob(blob, `${a.kind}-${a.id.slice(-6)}`)
                              )
                            }
                          >
                            {a.kind} · {a.mimeType} · {(a.sizeBytes / 1024).toFixed(0)} KB (descargar)
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <label className="mt-2 block text-xs font-medium text-slate-700">Nombre de quien recibe *</label>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    value={receiverName}
                    onChange={(e) => setReceiverName(e.target.value)}
                    placeholder="Ej: Ana López — Recepción"
                  />
                  <label className="mt-2 block text-xs font-medium text-slate-700">RUT o ID (opcional)</label>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    value={receiverDoc}
                    onChange={(e) => setReceiverDoc(e.target.value)}
                    placeholder="Ej: 12.345.678-9"
                  />
                  <label className="mt-2 block text-xs font-medium text-slate-700">Evidencia / nota (opcional)</label>
                  <textarea
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    rows={3}
                    value={deliveryEvidence}
                    onChange={(e) => setDeliveryEvidence(e.target.value)}
                    placeholder="Ej: Firma en remito 8841 · Foto enviada por WhatsApp al admin · URL de comprobante…"
                  />
                  <button
                    type="button"
                    className="mt-3 w-full rounded-xl bg-blue-700 px-4 py-3 text-base font-bold text-white hover:bg-blue-600 disabled:opacity-50"
                    disabled={receiverName.trim().length < 2 || patch.isPending}
                    onClick={() =>
                      patch.mutate({
                        id: active.id,
                        status: "entregado",
                        deliveredToName: receiverName.trim(),
                        ...(receiverDoc.trim().length >= 3 ? { deliveredToId: receiverDoc.trim() } : {}),
                        ...(deliveryEvidence.trim().length >= 3 ? { deliveryEvidence: deliveryEvidence.trim() } : {}),
                        note: "Entrega con receptor registrado",
                      })
                    }
                  >
                    {patch.isPending ? "Cerrando…" : "Marcar entregado y cerrar viaje"}
                  </button>
                  <button
                    type="button"
                    className="mt-2 w-full rounded-xl border-2 border-red-200 bg-red-50 py-2.5 text-sm font-bold text-red-900 hover:bg-red-100"
                    onClick={() => {
                      setRejectDialog({ shipmentId: active.id, mode: "en_destino" });
                      setRejectReason("");
                    }}
                  >
                    No se pudo entregar / rechazo en destino…
                  </button>
                </div>
              ) : null}

              {active.status === "entregado" ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-center text-sm font-medium text-emerald-900">
                  Este viaje ya está <strong>completado</strong>. Elegí otro en la lista si tenés más.
                </div>
              ) : null}

              {showSecondaryBlocks ? (
                <button
                  type="button"
                  className="w-full rounded-xl border-2 border-red-200 bg-red-50 py-3 text-sm font-bold text-red-800 hover:bg-red-100 disabled:opacity-60"
                  disabled={sendAlert.isPending}
                  onClick={() =>
                    sendAlert.mutate({
                      type: "retraso",
                      message: "Incidente / retraso: " + (alertComment || "Ver detalle con conductor."),
                      shipmentId: active.id,
                    })
                  }
                >
                  {sendAlert.isPending ? "Enviando…" : "Avisar problema o retraso a la empresa"}
                </button>
              ) : null}
            </div>
          </section>
    );
  }

  return (
    <PortalShell title="Panel Chofer" basePath="/driver/viaje-activo">
      <Fragment>
      <div className="mx-auto max-w-3xl space-y-4 pb-6" id="viajes">
        {currentView === "viajes" ? (
          <header className="rounded-2xl bg-gradient-to-br from-green-700 to-green-900 p-4 text-white shadow-md">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h1 className="text-lg font-bold md:text-xl">Viaje activo</h1>
                <p className="mt-1 text-sm text-green-100">
                  {driverSwipeTrips.length > 1
                    ? "Deslizá o usá las flechas para cambiar de pedido. «Ir a acciones» abre retiro, ruta y entrega."
                    : "Elegí un viaje y tocá «Ir a acciones» para retiro, ruta y entrega."}
                </p>
              </div>
              <button
                type="button"
                disabled={!active}
                className="rounded-full bg-emerald-500 px-4 py-2 text-xs font-bold text-white shadow-md ring-2 ring-emerald-300/60 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/40 disabled:ring-0"
                onClick={() => setDriverViajeAccionesModalOpen(true)}
              >
                Ir a acciones
              </button>
            </div>
            <div className="mt-3 border-t border-white/20 pt-3">
              <button
                type="button"
                className="w-full rounded-xl bg-amber-500 px-3 py-2.5 text-xs font-bold text-white shadow-md ring-2 ring-amber-300/60 transition hover:bg-amber-400 sm:w-auto"
                onClick={() => setDriverPickupListModalOpen(true)}
              >
                Ver lista de pedidos por retirar
              </button>
              <details className="mt-2 text-[11px] leading-snug text-green-100/95">
                <summary className="cursor-pointer list-none py-1 font-medium text-green-100/90 [&::-webkit-details-marker]:hidden">
                  <span className="underline decoration-green-300/70 decoration-dotted underline-offset-2">
                    ¿En qué orden retiro y entrego? (solo ayuda, no mueve la pantalla)
                  </span>
                </summary>
                <p className="mt-2 border-l-2 border-green-400/50 pl-2">{VIAJES_LIST_ORDER_HINT}</p>
              </details>
            </div>
          </header>
        ) : null}

        {error ? (
          <p className="rounded-xl bg-rose-100 px-3 py-2 text-sm text-rose-800" role="alert">
            {error}
          </p>
        ) : null}
        {okMsg ? (
          <p className="rounded-xl bg-emerald-100 px-3 py-2 text-sm text-emerald-900" role="status">
            {okMsg}
          </p>
        ) : null}

        {q.isLoading ? <p className="text-sm text-slate-500">Cargando tus viajes…</p> : null}

        {currentView === "mapa" ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-slate-800">
            <MapPin size={18} />
            <h2 className="text-sm font-semibold">Mapa y paradas</h2>
          </div>
          {active ? (
            <>
              <p className="mt-1 text-xs text-slate-600">
                Viaje activo: <strong>{active.origin} → {active.destination}</strong> · {statusLabel(active.status)}
              </p>
              <div className="mt-3">
                <RouteMap
                  title="Ruta del viaje activo"
                  markers={[
                    ...markers,
                    ...pickupTrips.flatMap((t) => {
                      const lat = num(t.originLat);
                      const lng = num(t.originLng);
                      if (lat === null || lng === null) return [];
                      const m: MapMarker = {
                        lat,
                        lng,
                        label: `Retiro pendiente: ${t.origin} → ${t.destination}`,
                        color: "blue",
                      };
                      return [m];
                    }),
                    ...deliverTrips.flatMap((t) => {
                      const lat = num(t.destinationLat);
                      const lng = num(t.destinationLng);
                      if (lat === null || lng === null) return [];
                      const m: MapMarker = {
                        lat,
                        lng,
                        label: `Entrega pendiente: ${t.origin} → ${t.destination}`,
                        color: "green",
                      };
                      return [m];
                    }),
                  ]}
                  routes={routes}
                  heightClass="h-56 md:h-64"
                />
              </div>
              <div className="mt-3">
                <p className="text-xs font-semibold text-slate-800">Tu lista en el mapa</p>
                <p className="text-[11px] leading-snug text-slate-600">
                  Elegí pestaña para filtrar la lista (mismo total que el número del botón). El mapa muestra todos los puntos activos. Los
                  entregados están en{" "}
                  <Link to="/driver/historial" className="font-semibold text-green-700 underline">
                    Historial
                  </Link>
                  .
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold shadow-sm transition ${
                      mapGroup === "deliver" ? "bg-blue-600 text-white ring-2 ring-blue-300" : "bg-blue-100 text-blue-900 hover:bg-blue-200"
                    }`}
                    onClick={() => setMapGroup("deliver")}
                  >
                    Cargados por entregar ({deliverTrips.length})
                  </button>
                  <button
                    type="button"
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold shadow-sm transition ${
                      mapGroup === "pickup" ? "bg-amber-600 text-white ring-2 ring-amber-300" : "bg-amber-100 text-amber-900 hover:bg-amber-200"
                    }`}
                    onClick={() => setMapGroup("pickup")}
                  >
                    Por recoger ({pickupTrips.length})
                  </button>
                </div>
                <div className="mt-2 max-h-[min(70vh,520px)] space-y-2 overflow-y-auto pr-1">
                  {(mapGroup === "pickup" ? pickupTrips : deliverTrips).map((t) => {
                    const cargoLine = cargoSummaryText(t);
                    return (
                      <div
                        key={`map-group-${t.id}`}
                        className={`overflow-hidden rounded-xl border-2 transition ${
                          selectedId === t.id
                            ? "border-green-500 bg-green-50 shadow-sm ring-2 ring-green-200/80"
                            : "border-slate-200 bg-slate-50 hover:border-green-300"
                        }`}
                      >
                        <button
                          type="button"
                          className="w-full px-3 py-2.5 text-left"
                          onClick={() => openSelectedTrip(setSelectedId, t.id)}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-xs font-semibold text-slate-800">
                              {t.origin} → {t.destination}
                            </p>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${paymentPillClassName(t.paymentStatus)}`}
                            >
                              {paymentPillLabel(t.paymentStatus)}
                            </span>
                          </div>
                          <p className="font-mono text-[10px] font-medium text-slate-500">Envío ·{shipmentCode(t.id)}</p>
                          {cargoLine ? (
                            <p className="mt-1 text-[11px] font-medium text-slate-700">Carga: {cargoLine}</p>
                          ) : (
                            <p className="mt-1 text-[10px] text-slate-400">Sin detalle de carga en la ficha</p>
                          )}
                          <p className="text-[11px] text-slate-600">
                            {mapGroup === "pickup"
                              ? "Falta retirar en origen."
                              : "Carga a bordo: ir a entregar en destino."}
                          </p>
                          <p className="text-[10px] text-slate-500">
                            Retiro: {fmtDate(t.scheduledPickup)} · Entrega: {fmtDate(t.scheduledDelivery)}
                          </p>
                        </button>
                        <div className="flex flex-wrap gap-1.5 border-t border-slate-200/90 bg-white/90 px-3 py-2">
                          {t.status === "confirmado" ? (
                            <>
                              <button
                                type="button"
                                className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-bold text-white shadow hover:bg-emerald-500"
                                onClick={() =>
                                  navigate("/driver/viaje-activo", {
                                    state: {
                                      focusShipmentId: t.id,
                                      focusAnchor: VIAJES_ANCHORS.acciones,
                                    } satisfies DriverLocationState,
                                  })
                                }
                              >
                                Ir a retirar carga
                              </button>
                              <button
                                type="button"
                                className="rounded-lg border border-red-300 bg-red-50 px-2.5 py-1.5 text-[11px] font-bold text-red-800 hover:bg-red-100"
                                onClick={() => {
                                  setRejectDialog({ shipmentId: t.id, mode: "pre_retiro" });
                                  setRejectReason("");
                                }}
                              >
                                Rechazar…
                              </button>
                            </>
                          ) : null}
                          {t.status === "recogido" ? (
                            <>
                              <button
                                type="button"
                                className="rounded-lg bg-cyan-600 px-2.5 py-1.5 text-[11px] font-bold text-white shadow hover:bg-cyan-500"
                                onClick={() =>
                                  navigate("/driver/viaje-activo", {
                                    state: {
                                      focusShipmentId: t.id,
                                      focusAnchor: VIAJES_ANCHORS.acciones,
                                    } satisfies DriverLocationState,
                                  })
                                }
                              >
                                Marcar en camino
                              </button>
                              <button
                                type="button"
                                className="rounded-lg border border-red-300 bg-red-50 px-2.5 py-1.5 text-[11px] font-bold text-red-800 hover:bg-red-100"
                                onClick={() => {
                                  setRejectDialog({ shipmentId: t.id, mode: "en_destino" });
                                  setRejectReason("");
                                }}
                              >
                                Problema en destino…
                              </button>
                            </>
                          ) : null}
                          {t.status === "en_transito" ? (
                            <>
                              <button
                                type="button"
                                className="rounded-lg bg-blue-700 px-2.5 py-1.5 text-[11px] font-bold text-white shadow hover:bg-blue-600"
                                onClick={() =>
                                  navigate("/driver/viaje-activo", {
                                    state: {
                                      focusShipmentId: t.id,
                                      focusAnchor: VIAJES_ANCHORS.acciones,
                                    } satisfies DriverLocationState,
                                  })
                                }
                              >
                                Finalizar entrega
                              </button>
                              <button
                                type="button"
                                className="rounded-lg border border-red-300 bg-red-50 px-2.5 py-1.5 text-[11px] font-bold text-red-800 hover:bg-red-100"
                                onClick={() => {
                                  setRejectDialog({ shipmentId: t.id, mode: "en_destino" });
                                  setRejectReason("");
                                }}
                              >
                                Rechazo en destino…
                              </button>
                            </>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                  {(mapGroup === "pickup" ? pickupTrips : deliverTrips).length === 0 ? (
                    <p className="text-xs text-slate-500">No hay viajes en esta categoría.</p>
                  ) : null}
                </div>
                <details className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-700">
                  <summary className="cursor-pointer font-semibold text-slate-800 [&::-webkit-details-marker]:hidden">
                    Cómo se ordena la lista
                  </summary>
                  <p className="mt-1.5 leading-snug">
                    {VIAJES_LIST_ORDER_SHORT} {VIAJES_LIST_ORDER_HINT}
                  </p>
                </details>
              </div>
              <div className="mt-3 rounded-xl border border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50 p-3 shadow-sm">
                <p className="flex items-center gap-1.5 text-xs font-bold text-orange-950">
                  <AlertTriangle size={14} className="shrink-0" />
                  Aviso rápido (viaje activo en mapa)
                </p>
                <input
                  className="mt-2 w-full rounded-lg border border-orange-200 bg-white px-2 py-1.5 text-[11px] text-slate-900"
                  value={alertComment}
                  onChange={(e) => setAlertComment(e.target.value)}
                  placeholder="Detalle opcional (ej. tráfico, ETA)"
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-2 text-[11px] font-bold text-white shadow hover:bg-amber-500 disabled:opacity-50"
                    disabled={sendAlert.isPending}
                    onClick={() =>
                      sendAlert.mutate({
                        type: "retraso",
                        message: `Retraso: ${alertComment.trim() || "Sin detalle."}`,
                        shipmentId: active.id,
                      })
                    }
                  >
                    <Clock size={14} />
                    Retraso
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-2 text-[11px] font-bold text-white shadow hover:bg-slate-700 disabled:opacity-50"
                    disabled={sendAlert.isPending}
                    onClick={() =>
                      sendAlert.mutate({
                        type: "mantenimiento",
                        message: `Problema mecánico: ${alertComment.trim() || "Ver con conductor."}`,
                        shipmentId: active.id,
                      })
                    }
                  >
                    <Truck size={14} />
                    Problema mecánico
                  </button>
                </div>
              </div>
              <div className="mt-3 space-y-2">
                {(originGeoQ.isFetching || destGeoQ.isFetching) &&
                num(active.originLat) === null &&
                num(active.destinationLat) === null ? (
                  <p className="text-xs text-slate-500">Buscando coordenadas de esta ruta para mostrar en mapa…</p>
                ) : null}
                <NavigationExternalLinks
                  menuStyle="unified"
                  pickup={{
                    title: "Retiro",
                    address: active.pickupAddress ?? active.origin,
                    lat: active.originLat,
                    lng: active.originLng,
                  }}
                  delivery={{
                    title: "Entrega",
                    address: active.deliveryAddress ?? active.destination,
                    lat: active.destinationLat,
                    lng: active.destinationLng,
                  }}
                />
                <p className="text-[11px] text-slate-600">
                  <strong className="text-slate-800">Ubicación:</strong> la opción principal está en{" "}
                  <Link to="/driver/viaje-activo" className="font-semibold text-green-700 underline">
                    Viaje activo
                  </Link>
                  . Acá podés enviar una vez o usar el mismo interruptor.
                </p>
                <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-orange-100 bg-orange-50/90 p-2 text-left">
                  <input
                    type="checkbox"
                    className="mt-0.5 rounded border-orange-300"
                    checked={autoShareLocation}
                    onChange={(e) => setAutoShareLocation(e.target.checked)}
                  />
                  <span className="text-[11px] leading-snug text-slate-800">
                    <strong>Mismo envío automático</strong> que en Viaje activo (GPS del navegador, sin costo).
                  </span>
                </label>
                <button
                  type="button"
                  className="w-full rounded-lg bg-orange-500 py-2.5 text-sm font-semibold text-white hover:bg-orange-400 disabled:opacity-60"
                  onClick={() => shareLocation(active.id)}
                  disabled={reportLocation.isPending}
                >
                  {reportLocation.isPending ? "Enviando posición…" : "Enviar mi ubicación ahora"}
                </button>
              </div>
            </>
          ) : (
            <p className="mt-3 text-xs text-slate-500">Aún no hay viaje activo para mostrar en mapa.</p>
          )}
        </section>
        ) : null}

        {currentView === "historial" ? (
        <section id="historial" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-800">Historial</h2>
          <p className="text-xs text-slate-500">
            Elegí la <strong className="text-slate-700">fecha</strong> y el{" "}
            <strong className="text-slate-700">alcance</strong>. Se listan viajes cuya fecha de referencia cae en{" "}
            <strong className="font-medium text-slate-700">{periodRangeDescription(historyPeriod, historyAnchorDate)}</strong>.
          </p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <label className="flex min-w-[11rem] flex-col gap-1 text-xs font-medium text-slate-600">
              Fecha
              <input
                type="date"
                className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 shadow-sm"
                value={historyDateInput}
                onChange={(e) => setHistoryDateInput(e.target.value)}
              />
            </label>
            <label className="flex min-w-[12rem] flex-col gap-1 text-xs font-medium text-slate-600">
              Alcance del listado
              <select
                className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 shadow-sm"
                value={historyPeriod}
                onChange={(e) => setHistoryPeriod(e.target.value as "day" | "week" | "month")}
              >
                <option value="day">Solo ese día</option>
                <option value="week">Semana (lun–dom) que incluye la fecha</option>
                <option value="month">Mes natural de esa fecha</option>
              </select>
            </label>
          </div>
          {avgDeliveredDurationMs !== null ? (
            <p className="mt-3 rounded-lg border border-indigo-100 bg-indigo-50/90 px-3 py-2 text-[11px] leading-snug text-indigo-950">
              <strong className="font-semibold">Duración en entregas del período:</strong> promedio retiro → entrega{" "}
              <strong>{fmtDurationHours(avgDeliveredDurationMs)}</strong>
              <span className="text-indigo-800/90"> ({doneDurationSamples.length} entregas con horas registradas)</span>
              . En cada fila ves el tiempo de ese viaje.
            </p>
          ) : doneTripsInPeriod.length > 0 ? (
            <p className="mt-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
              Hay entregas en el período, pero faltan horas de retiro/entrega registradas para calcular el promedio.
            </p>
          ) : null}
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div
              className={`rounded-lg px-3 py-2 transition ${
                historyFilter === "all"
                  ? "border-2 border-slate-800 bg-slate-100 shadow-sm ring-2 ring-slate-300/80"
                  : "border border-slate-200 bg-slate-50"
              }`}
            >
              <button
                type="button"
                aria-pressed={historyFilter === "all"}
                className={`w-full text-left ${historyFilter === "all" ? "text-slate-900" : "text-slate-600"}`}
                onClick={() => setHistoryFilter("all")}
              >
                <p className="text-[11px] font-medium text-slate-500">Viajes en el período</p>
                <p className="text-sm font-semibold">{rowsInPeriod.length}</p>
              </button>
            </div>
            <div
              className={`rounded-lg px-3 py-2 transition ${
                historyFilter === "done"
                  ? "border-2 border-emerald-700 bg-emerald-100 shadow-sm ring-2 ring-emerald-300/80"
                  : "border border-emerald-200 bg-emerald-50"
              }`}
            >
              <button
                type="button"
                aria-pressed={historyFilter === "done"}
                className={`w-full text-left ${historyFilter === "done" ? "text-emerald-950" : "text-emerald-800"}`}
                onClick={() => setHistoryFilter("done")}
              >
                <p className="text-[11px] font-medium text-emerald-800">Entregados</p>
                <p className="text-sm font-semibold">{doneTripsInPeriod.length}</p>
              </button>
            </div>
            <div
              className={`rounded-lg px-3 py-2 transition ${
                historyFilter === "inprogress"
                  ? "border-2 border-blue-700 bg-blue-100 shadow-sm ring-2 ring-blue-300/80"
                  : "border border-blue-200 bg-blue-50"
              }`}
            >
              <button
                type="button"
                aria-pressed={historyFilter === "inprogress"}
                className={`w-full text-left ${historyFilter === "inprogress" ? "text-blue-950" : "text-blue-800"}`}
                onClick={() => setHistoryFilter("inprogress")}
              >
                <p className="text-[11px] font-medium text-blue-800">En curso</p>
                <p className="text-sm font-semibold">{inProgressTrips.length}</p>
              </button>
            </div>
          </div>
          <div className="mt-2 space-y-2">
            {historyRows.slice(0, 40).map((s) => {
              const inProgress = s.status === "recogido" || s.status === "en_transito";
              const durDone = tripDeliveredDurationMs(s);
              const durLive = inProgress ? tripInProgressElapsedMs(s) : null;
              return (
                <div
                  key={s.id}
                  role={inProgress ? "button" : undefined}
                  tabIndex={inProgress ? 0 : undefined}
                  className={`flex justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs ${
                    inProgress
                      ? "cursor-pointer hover:border-green-400 hover:bg-green-50/80 focus:outline-none focus:ring-2 focus:ring-green-300"
                      : ""
                  }`}
                  onClick={inProgress ? () => openInProgressFromHistorial(navigate, s.id) : undefined}
                  onKeyDown={
                    inProgress
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openInProgressFromHistorial(navigate, s.id);
                          }
                        }
                      : undefined
                  }
                >
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800">
                      {s.origin} → {s.destination}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Retiro: {fmtDate(s.scheduledPickup)} · Entrega: {fmtDate(s.scheduledDelivery)}
                    </p>
                    {durDone !== null ? (
                      <p className="mt-0.5 text-[11px] font-medium text-indigo-900">
                        Duración (retiro → entrega): {fmtDurationHours(durDone)}
                      </p>
                    ) : null}
                    {durLive !== null ? (
                      <p className="mt-0.5 text-[11px] text-slate-700">
                        Transcurrido desde retiro / inicio: {fmtDurationHours(durLive)}
                      </p>
                    ) : null}
                    {inProgress ? (
                      <p className="mt-0.5 text-[10px] font-medium text-green-700">
                        Tocá para abrir <strong>Mis viajes</strong> con este envío y bajar a{" "}
                        <strong>Viaje seleccionado / acciones</strong>.
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className={`rounded-full px-2 py-0.5 ${statusPillClass(s.status)}`}>{statusLabel(s.status)}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${paymentPillClassName(s.paymentStatus)}`}>
                      {paymentPillLabel(s.paymentStatus)}
                    </span>
                  </div>
                </div>
              );
            })}
            {historyRows.length === 0 ? <p className="text-xs text-slate-500">No hay viajes para este filtro.</p> : null}
          </div>
        </section>
        ) : null}

        {currentView === "alertas" ? (
        <section id="alertas" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-800">Más avisos</h2>
          <p className="text-xs text-slate-500">Plantillas rápidas (se asocian al viaje seleccionado si hay uno).</p>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              className="rounded-lg bg-amber-500 py-3 text-sm font-semibold text-white hover:bg-amber-400 disabled:opacity-60"
              disabled={sendAlert.isPending}
              onClick={() =>
                sendAlert.mutate({
                  type: "retraso",
                  message: `Retraso${active ? ` · ${active.origin} → ${active.destination}` : ""}.`,
                  shipmentId: active?.id,
                })
              }
            >
              Retraso
            </button>
            <button
              type="button"
              className="rounded-lg bg-orange-600 py-3 text-sm font-semibold text-white hover:bg-orange-500 disabled:opacity-60"
              disabled={sendAlert.isPending}
              onClick={() =>
                sendAlert.mutate({
                  type: "mantenimiento",
                  message: `Mantenimiento / falla${active ? ` · ${active.origin} → ${active.destination}` : ""}.`,
                  shipmentId: active?.id,
                })
              }
            >
              Falla / mecánica
            </button>
          </div>
          <label className="mt-3 block text-xs font-medium text-slate-600">Comentario (opcional)</label>
          <textarea
            className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"
            rows={2}
            value={alertComment}
            onChange={(e) => setAlertComment(e.target.value)}
            placeholder="Se adjunta al aviso de problema"
          />
          <div className="mt-3">
            <p className="text-xs font-medium text-slate-600">Últimas alertas</p>
            <div className="mt-1 max-h-32 space-y-1 overflow-y-auto">
              {(alertsQ.data ?? []).slice(0, 6).map((a) => (
                <div key={a.id} className="rounded border border-slate-100 px-2 py-1 text-[11px] text-slate-600">
                  <strong>{a.type}</strong> · {a.message}
                </div>
              ))}
            </div>
          </div>
        </section>
        ) : null}

        {showPlanningLists ? (
        <details className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm open:shadow-md">
          <summary className="cursor-pointer list-none text-sm font-semibold text-slate-800 [&::-webkit-details-marker]:hidden">
            Resumen de hoy · tocá para ver
          </summary>
          <div className="mt-3 space-y-2 border-t border-slate-100 pt-3 text-xs text-slate-700">
            <p>
              Entregas completadas hoy: <strong className="text-slate-900">{entregasHoyCount}</strong>
            </p>
            <p>
              Viajes en curso ahora: <strong className="text-slate-900">{inProgressTrips.length}</strong>
            </p>
            <p>
              Avisos registrados (últimos en panel): <strong className="text-slate-900">{(alertsQ.data ?? []).length}</strong>
            </p>
            <p className="text-[10px] leading-snug text-slate-500">
              Generá una <strong>pre-liquidación</strong> con los viajes entregados en el período; tu empresa la confirma o ajusta en el panel admin.
            </p>
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-2">
              <p className="text-[11px] font-semibold text-slate-800">Check-out / liquidación (borrador)</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <label className="text-[10px] text-slate-600">
                  Fecha referencia
                  <input
                    type="date"
                    className="ml-1 rounded border border-slate-300 px-1 py-0.5 text-xs"
                    value={checkoutDate}
                    onChange={(e) => setCheckoutDate(e.target.value)}
                  />
                </label>
                <select
                  className="rounded border border-slate-300 px-1 py-0.5 text-xs"
                  value={checkoutPeriod}
                  onChange={(e) => setCheckoutPeriod(e.target.value as "day" | "week" | "month")}
                >
                  <option value="day">Día</option>
                  <option value="week">Semana</option>
                  <option value="month">Mes</option>
                </select>
              </div>
              <textarea
                className="mt-2 w-full rounded border border-slate-300 p-1 text-[10px]"
                rows={2}
                value={checkoutNotes}
                onChange={(e) => setCheckoutNotes(e.target.value)}
                placeholder="Nota opcional para despacho"
              />
              <button
                type="button"
                className="mt-2 w-full rounded-lg bg-slate-800 py-2 text-[11px] font-bold text-white hover:bg-slate-700 disabled:opacity-50"
                disabled={checkoutMut.isPending}
                onClick={() =>
                  checkoutMut.mutate({
                    period: checkoutPeriod,
                    anchorDate: checkoutDate,
                    ...(checkoutNotes.trim() ? { notes: checkoutNotes.trim() } : {}),
                  })
                }
              >
                {checkoutMut.isPending ? "Generando…" : "Generar pre-liquidación"}
              </button>
            </div>
            <div className="max-h-36 space-y-1 overflow-y-auto text-[10px] text-slate-600">
              {(settlementsQ.data ?? []).slice(0, 6).map((s) => (
                <div key={s.id} className="rounded border border-slate-100 px-2 py-1">
                  <strong>{s.status}</strong> · {new Date(s.periodStart).toLocaleDateString()} –{" "}
                  {new Date(s.periodEnd).toLocaleDateString()} · {s.entregasCount} entregas · neto {s.netAmount} (
                  {s.commissionPercent}% base)
                </div>
              ))}
            </div>
          </div>
        </details>
        ) : null}

        {showPlanningLists ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-slate-800">
            <MapPin size={18} />
            <h2 className="text-sm font-semibold">Mapa del viaje actual</h2>
          </div>
          {active ? (
            <>
              <p className="mt-1 text-xs text-slate-600">
                {active.origin} → {active.destination} · {statusLabel(active.status)}
              </p>
              <div className="mt-3">
                <RouteMap title="Ruta del viaje actual" markers={markers} routes={routes} heightClass="h-56 md:h-64" />
              </div>
              <div className="mt-3 space-y-2">
                {(originGeoQ.isFetching || destGeoQ.isFetching) &&
                num(active.originLat) === null &&
                num(active.destinationLat) === null ? (
                  <p className="text-xs text-slate-500">Buscando coordenadas de esta ruta para mostrar en mapa…</p>
                ) : null}
                <NavigationExternalLinks
                  menuStyle="unified"
                  pickup={{
                    title: "Retiro",
                    address: active.pickupAddress ?? active.origin,
                    lat: active.originLat,
                    lng: active.originLng,
                  }}
                  delivery={{
                    title: "Entrega",
                    address: active.deliveryAddress ?? active.destination,
                    lat: active.destinationLat,
                    lng: active.destinationLng,
                  }}
                />
                <p className="text-[11px] text-slate-600">
                  <Link to="/driver/viaje-activo" className="font-semibold text-green-700 underline">
                    Viaje activo
                  </Link>{" "}
                  tiene el panel grande de ubicación; acá podés repetir el interruptor o un envío puntual.
                </p>
                <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-orange-100 bg-orange-50/90 p-2 text-left">
                  <input
                    type="checkbox"
                    className="mt-0.5 rounded border-orange-300"
                    checked={autoShareLocation}
                    onChange={(e) => setAutoShareLocation(e.target.checked)}
                  />
                  <span className="text-[11px] leading-snug text-slate-800">
                    <strong>Envío automático</strong> (misma opción que en Viaje activo).
                  </span>
                </label>
                <button
                  type="button"
                  className="w-full rounded-lg bg-orange-500 py-2.5 text-sm font-semibold text-white hover:bg-orange-400 disabled:opacity-60"
                  onClick={() => shareLocation(active.id)}
                  disabled={reportLocation.isPending}
                >
                  {reportLocation.isPending ? "Enviando posición…" : "Enviar mi ubicación ahora"}
                </button>
              </div>
            </>
          ) : (
            <p className="mt-3 text-xs text-slate-500">Aún no hay viaje actual.</p>
          )}
        </section>
        ) : null}

        {driverPickupListModalOpen && showPlanningLists ? (
          <div
            className={CONDUCTOR_MODAL_OVERLAY}
            role="dialog"
            aria-modal="true"
            aria-labelledby="driver-pickup-list-title"
            onClick={() => setDriverPickupListModalOpen(false)}
          >
            <div
              className="my-auto w-full max-w-lg max-h-[min(92dvh,42rem)] overflow-y-auto rounded-2xl bg-white p-4 pt-3 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-3 flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
                <p id="driver-pickup-list-title" className="text-sm font-semibold text-green-800">
                  Pedidos por retirar
                </p>
                <button
                  type="button"
                  className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                  aria-label="Cerrar lista"
                  onClick={() => setDriverPickupListModalOpen(false)}
                >
                  <X size={22} strokeWidth={2} aria-hidden />
                </button>
              </div>
              <div id={VIAJES_ANCHORS.porRetirar}>{renderDriverPickupTripsList(() => setDriverPickupListModalOpen(false))}</div>
            </div>
          </div>
        ) : null}

        {driverViajeAccionesModalOpen && showPlanningLists && active ? (
          <div
            className={CONDUCTOR_MODAL_OVERLAY}
            role="dialog"
            aria-modal="true"
            aria-labelledby="driver-viaje-acciones-title"
            onClick={() => setDriverViajeAccionesModalOpen(false)}
          >
            <div
              className="my-auto w-full max-w-3xl max-h-[min(92dvh,48rem)] overflow-y-auto rounded-2xl bg-white p-4 pt-3 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-3 flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
                <p id="driver-viaje-acciones-title" className="text-sm font-semibold text-green-800">
                  Viaje y acciones
                </p>
                <button
                  type="button"
                  className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                  aria-label="Cerrar panel de viaje"
                  onClick={() => setDriverViajeAccionesModalOpen(false)}
                >
                  <X size={22} strokeWidth={2} aria-hidden />
                </button>
              </div>
              {renderViajeMainPanel()}
            </div>
          </div>
        ) : null}

        {mapNavPicker ? (
          <div
            className={CONDUCTOR_MODAL_OVERLAY}
            role="dialog"
            aria-modal="true"
            aria-labelledby="map-nav-picker-title"
            onClick={() => setMapNavPicker(null)}
          >
            <div
              className="my-auto w-full max-w-md max-h-[min(90dvh,36rem)] overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {(() => {
                const tripRow = rows.find((r) => r.id === mapNavPicker.shipmentId);
                if (!tripRow) {
                  return (
                    <p className="text-sm text-slate-600">
                      No encontramos ese envío.{" "}
                      <button type="button" className="font-semibold text-green-700 underline" onClick={() => setMapNavPicker(null)}>
                        Cerrar
                      </button>
                    </p>
                  );
                }
                const stopMeta = driverExternalNavStop(tripRow, mapNavPicker.stop);
                const google = googleMapsDirectionsTo({ coords: stopMeta.coords, address: stopMeta.address });
                const waze = wazeNavigateTo({ coords: stopMeta.coords, address: stopMeta.address });
                const apple = appleMapsDirectionsTo({ coords: stopMeta.coords, address: stopMeta.address });
                const hasExternal = !!(google || waze || apple);
                return (
                  <>
                    <div className="flex items-start gap-2">
                      <MapPin className="mt-0.5 shrink-0 text-green-600" size={22} aria-hidden />
                      <div className="min-w-0 flex-1">
                        <h3 id="map-nav-picker-title" className="text-sm font-bold text-slate-900">
                          ¿Cómo querés ver la ruta?
                        </h3>
                        <p className="mt-1 font-mono text-[10px] text-slate-500">Envío ·{shipmentCode(tripRow.id)}</p>
                        <p className="mt-0.5 text-xs font-semibold text-slate-800">
                          {tripRow.origin} → {tripRow.destination}
                        </p>
                        <p className="mt-2 text-[11px] leading-snug text-slate-600">
                          El <strong>mapa de la app</strong> muestra retiro y entrega. <strong>Waze, Google o Apple</strong> abren la
                          navegación en otra app o pestaña según el tramo que elijas.
                        </p>
                        <p className="mt-2 text-[10px] leading-snug text-slate-500">
                          La opción queda <strong className="font-medium text-slate-700">en este dispositivo</strong>. También podés
                          cambiarla en{" "}
                          <Link to="/driver/cuenta#mapa-chofer" className="font-semibold text-green-800 underline">
                            Cuenta → Mapa
                          </Link>
                          . <strong className="font-medium text-slate-700">Cambiar app</strong> junto a Ver en mapa abre este selector
                          sin ir a Cuenta.
                        </p>
                      </div>
                    </div>
                    <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Tramo para Waze / Maps</p>
                    <div className="mt-1.5 flex rounded-lg border border-slate-200 bg-slate-100 p-0.5">
                      {(["pickup", "delivery"] as const).map((s) => (
                        <button
                          key={s}
                          type="button"
                          className={`min-w-0 flex-1 rounded-md px-2 py-2 text-[11px] font-bold transition ${
                            mapNavPicker.stop === s
                              ? "bg-white text-green-900 shadow-sm ring-1 ring-slate-200/80"
                              : "text-slate-600 hover:text-slate-900"
                          }`}
                          onClick={() => setMapNavPicker((p) => (p ? { ...p, stop: s } : null))}
                        >
                          {s === "pickup" ? "Retiro (origen)" : "Entrega (destino)"}
                        </button>
                      ))}
                    </div>
                    <p className="mt-1 text-[10px] text-slate-500">
                      Ahora: <strong className="text-slate-700">{stopMeta.label}</strong>
                      {stopMeta.address ? (
                        <>
                          {" "}
                          · <span className="break-words">{stopMeta.address}</span>
                        </>
                      ) : null}
                    </p>
                    <div className="mt-4 space-y-2">
                      <button
                        type="button"
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white shadow-sm hover:bg-emerald-500"
                        onClick={() => {
                          writeDriverMapOpenPreference("app");
                          navigate("/driver/mapa", {
                            state: { focusShipmentId: tripRow.id } satisfies DriverLocationState,
                          });
                          setMapNavPicker(null);
                        }}
                      >
                        <MapPin size={18} aria-hidden />
                        Mapa en Transport Pro
                      </button>
                      <button
                        type="button"
                        disabled={!google}
                        title={!google ? "Falta dirección o coordenadas para este tramo" : undefined}
                        className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-green-600 bg-green-50 py-2.5 text-sm font-bold text-green-900 hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-45"
                        onClick={() => {
                          if (google) {
                            writeDriverMapOpenPreference("google");
                            openInNewTab(google);
                          }
                          setMapNavPicker(null);
                        }}
                      >
                        Google Maps
                      </button>
                      <button
                        type="button"
                        disabled={!waze}
                        title={!waze ? "Falta dirección o coordenadas para este tramo" : undefined}
                        className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-sky-600 bg-sky-50 py-2.5 text-sm font-bold text-sky-900 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-45"
                        onClick={() => {
                          if (waze) {
                            writeDriverMapOpenPreference("waze");
                            openInNewTab(waze);
                          }
                          setMapNavPicker(null);
                        }}
                      >
                        Waze
                      </button>
                      <button
                        type="button"
                        disabled={!apple}
                        title={!apple ? "Falta dirección o coordenadas para este tramo" : undefined}
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
                        onClick={() => {
                          if (apple) {
                            writeDriverMapOpenPreference("apple");
                            openInNewTab(apple);
                          }
                          setMapNavPicker(null);
                        }}
                      >
                        Apple Maps
                      </button>
                      {!hasExternal ? (
                        <p className="text-center text-[10px] text-amber-800">
                          No hay coordenadas ni dirección para abrir Waze o Maps en este tramo. Usá el mapa de la app o pedí el dato a
                          despacho.
                        </p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className="mt-3 w-full rounded-lg border border-slate-300 bg-white py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      onClick={() => setMapNavPicker(null)}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      className="mt-2 w-full py-1.5 text-[11px] font-semibold text-slate-500 underline decoration-slate-300 underline-offset-2 hover:text-slate-800"
                      onClick={() => {
                        clearDriverMapOpenPreference();
                        setMapNavPicker(null);
                      }}
                    >
                      Quitar mapa predeterminado
                    </button>
                  </>
                );
              })()}
            </div>
          </div>
        ) : null}

        {rejectDialog ? (
          <div
            className={CONDUCTOR_MODAL_OVERLAY}
            role="dialog"
            aria-modal="true"
            aria-labelledby="reject-trip-title"
          >
            <div className="my-auto w-full max-w-md max-h-[min(90dvh,36rem)] overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl">
              <div className="flex items-start gap-2">
                <XCircle className="mt-0.5 shrink-0 text-red-600" size={22} />
                <div className="min-w-0 flex-1">
                  <h3 id="reject-trip-title" className="text-sm font-bold text-slate-900">
                    {rejectDialog.mode === "en_destino" ? "Rechazo en destino" : "Rechazar antes de retirar"}
                  </h3>
                  <p className="mt-1 text-xs text-slate-600">
                    {rejectDialog.mode === "en_destino"
                      ? "Usá esto cuando quien debe recepcionar no está, rechaza la carga o hay otra incidencia en la entrega. La empresa lo verá como rechazo en destino."
                      : "Solo antes de retirar la carga (por ejemplo no podés cumplir la asignación). La empresa verá el motivo."}
                  </p>
                </div>
              </div>
              <textarea
                className="mt-3 w-full rounded-lg border border-slate-300 p-2 text-sm"
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder={
                  rejectDialog.mode === "en_destino"
                    ? "Ej: Nadie recepciona / rechazan el producto / dirección cerrada (mín. 8 caracteres)"
                    : "Ej: No llego al horario / falla del vehículo / carga incompatible (mín. 8 caracteres)"
                }
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                  onClick={() => {
                    setRejectDialog(null);
                    setRejectReason("");
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="rounded-lg bg-red-600 px-3 py-2 text-sm font-bold text-white hover:bg-red-500 disabled:opacity-50"
                  disabled={rejectReason.trim().length < 8 || patch.isPending}
                  onClick={() => {
                    const id = rejectDialog.shipmentId;
                    const mode = rejectDialog.mode;
                    const note =
                      mode === "en_destino"
                        ? `Rechazo en destino: ${rejectReason.trim()}`
                        : `Conductor rechaza asignación: ${rejectReason.trim()}`;
                    patch.mutate({
                      id,
                      status: "rechazado",
                      note,
                    });
                    setRejectDialog(null);
                    setRejectReason("");
                  }}
                >
                  {patch.isPending ? "Enviando…" : "Confirmar rechazo"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {showLocationBlockingGate && active
        ? createPortal(
            <div
              className="fixed inset-0 z-[200] flex min-h-0 items-center justify-center overflow-y-auto bg-black/65 p-4 backdrop-blur-[2px]"
              role="dialog"
              aria-modal="true"
              aria-labelledby="driver-loc-gate-title"
            >
              <div className="relative my-auto w-full max-w-lg rounded-2xl border-2 border-orange-400 bg-gradient-to-br from-orange-50 via-white to-amber-50 p-4 shadow-2xl ring-2 ring-orange-200/80">
                <button
                  type="button"
                  className="absolute right-1 top-1 z-10 rounded-lg p-2 text-slate-500 transition hover:bg-white/90 hover:text-slate-900"
                  aria-label="Cerrar sin enviar ubicación"
                  title="Cierra este aviso solo en esta pestaña (útil si el navegador no obtiene GPS). Para seguimiento real, abrí la app en Chrome o Safari y enviá la ubicación."
                  onClick={() => {
                    try {
                      sessionStorage.setItem(driverLocGateSkipStorageKey(active.id), "1");
                    } catch {
                      /* ignore */
                    }
                    setDriverLocGateVersion((v) => v + 1);
                    setError(null);
                    setOkMsg(null);
                    setDriverGeoRequestBusy(false);
                  }}
                >
                  <X size={22} strokeWidth={2.25} aria-hidden />
                </button>
                <div className="flex items-start gap-3">
                  <div
                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-orange-500 text-white shadow-md"
                    aria-hidden
                  >
                    <LocateFixed size={30} strokeWidth={2.25} />
                  </div>
                  <div className="min-w-0 flex-1 pr-8">
                    <p id="driver-loc-gate-title" className="text-base font-bold text-slate-900">
                      Ubicación para la empresa
                    </p>
                    <p className="mt-1 text-[12px] leading-snug text-slate-700">
                      Activá el envío automático: tu posición se actualiza con el GPS del teléfono (gratis, sin cuentas
                      extra). En muchos navegadores sigue funcionando aunque cambies de app, mientras esta pestaña siga
                      abierta en segundo plano; si no, tocá <strong className="font-semibold">Enviar ahora</strong>.
                    </p>
                    <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-xl border-2 border-orange-300 bg-white px-3 py-3 shadow-sm">
                      <input
                        type="checkbox"
                        className="h-5 w-5 shrink-0 rounded border-orange-400 text-orange-600 focus:ring-orange-500"
                        checked={autoShareLocation}
                        onChange={(e) => setAutoShareLocation(e.target.checked)}
                        disabled={driverGeoRequestBusy || reportLocation.isPending}
                      />
                      <span className="text-sm font-bold text-slate-900">Enviar mi ubicación automáticamente</span>
                    </label>
                    <button
                      type="button"
                      className="mt-3 w-full rounded-xl bg-orange-600 py-3 text-sm font-bold text-white shadow-md hover:bg-orange-500 disabled:opacity-60"
                      onClick={() => shareLocation(active.id)}
                      disabled={driverGeoRequestBusy || reportLocation.isPending}
                    >
                      {reportLocation.isPending
                        ? "Enviando al servidor…"
                        : driverGeoRequestBusy
                          ? "Obteniendo GPS…"
                          : "Enviar ubicación ahora"}
                    </button>
                    {error ? (
                      <p
                        className="mt-3 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-[13px] leading-snug text-rose-900"
                        role="alert"
                      >
                        {error}
                      </p>
                    ) : null}
                    {okMsg && !error ? (
                      <p
                        className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] leading-snug text-emerald-900"
                        role="status"
                      >
                        {okMsg}
                      </p>
                    ) : null}
                    <p className="mt-2 text-[10px] leading-snug text-slate-500">
                      Los datos van a tu empresa en Transport Pro. Si el sistema pausa el GPS con la pantalla apagada
                      mucho tiempo, abrí de nuevo el panel cuando puedas.
                    </p>
                    <p className="mt-2 text-[11px] leading-snug text-slate-600">
                      <strong className="text-slate-800">Configuración: mapa</strong> (Google, Waze, Apple…) — disponible
                      en Cuenta cuando esta pantalla se desbloquee, después de enviar tu posición.
                    </p>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
      </Fragment>
    </PortalShell>
  );
}

function StepLine({
  n,
  title,
  desc,
  done,
  current,
}: {
  n: number;
  title: string;
  desc: string;
  done: boolean;
  current: boolean;
}) {
  return (
    <li className="relative pb-6 pl-1 last:pb-0">
      <span
        className={`absolute -left-[1.4rem] top-0 flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
          done ? "bg-green-600 text-white" : current ? "bg-amber-500 text-white ring-2 ring-amber-200" : "bg-slate-200 text-slate-500"
        }`}
      >
        {done ? <Check size={14} /> : n}
      </span>
      <p className={`text-sm font-semibold ${current ? "text-amber-900" : done ? "text-green-800" : "text-slate-500"}`}>{title}</p>
      <p className="mt-0.5 text-xs text-slate-600">{desc}</p>
    </li>
  );
}

function fmtDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}
