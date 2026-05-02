import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiBlob, apiGet, apiSend, downloadBlob } from "../api/client.js";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ChevronDown,
  FileText,
  History,
  LayoutDashboard,
  LifeBuoy,
  MapIcon,
  MapPin,
  Package,
} from "lucide-react";
import { RouteMap, type MapMarker, type MapRoute } from "../components/common/RouteMap.js";
import { googleMapsUrlForShipment } from "../admin/shipmentMapGeo.js";
import { paymentTermLabel } from "../lib/paymentTerms.js";
import { AddressAutocomplete } from "../components/common/AddressAutocomplete.js";
import { notify } from "../lib/notify.js";
import { shipmentStatusLabel as sharedShipmentStatusLabel } from "../lib/shipmentUi.js";

type ShipmentRow = {
  id: string;
  origin: string;
  destination: string;
  pickupAddress?: string | null;
  deliveryAddress?: string | null;
  status: string;
  createdAt: string;
  scheduledPickup?: string | null;
  scheduledDelivery?: string | null;
  pickupWindowStart?: string | null;
  pickupWindowEnd?: string | null;
  deliveryWindowStart?: string | null;
  deliveryWindowEnd?: string | null;
  pickupNotes?: string | null;
  deliveryNotes?: string | null;
  totalAmount?: string | number | null;
  amount?: string | number | null;
  paymentTerm?: "upfront_full" | "upfront_partial" | "delivery";
  upfrontPercent?: string | number | null;
  upfrontAmount?: string | number | null;
  decisionNote?: string | null;
  balanceAmount?: string;
  paidAmount?: string;
  paymentStatus?: string | null;
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
  deliveredToName?: string | null;
  deliveredAt?: string | null;
  deliveryEvidence?: string | null;
  attachments?: Array<{ id: string; kind: string; mimeType: string; sizeBytes: number; createdAt: string }>;
};

type InvoiceRow = {
  id: string;
  number: string;
  lines: Array<{ shipmentId?: string | null }>;
};

type ClientePaymentAlert = { id: string; verificationStatus?: string | null };

const HISTORY_PAGE_SIZE = 12;

type ClientePedidosVista = "inicio" | "envios" | "mapa" | "historial";

function viewFromLocation(pathname: string, search: string): ClientePedidosVista {
  const vista = new URLSearchParams(search).get("vista");
  if (vista === "envios") return "envios";
  if (pathname.endsWith("/solicitud")) return "inicio";
  if (pathname.endsWith("/seguimiento")) return "mapa";
  if (pathname.endsWith("/historial")) return "historial";
  return "inicio";
}

function urlForView(view: ClientePedidosVista): string {
  if (view === "envios") return "/cliente/pedidos?vista=envios";
  if (view === "mapa") return "/cliente/seguimiento";
  if (view === "historial") return "/cliente/historial";
  return "/cliente/pedidos";
}

function paymentPillLabel(st: string | null | undefined): string {
  switch (st) {
    case "pagado":
      return "Pagado";
    case "parcial":
      return "Pago parcial";
    default:
      return "Pago pendiente";
  }
}

function shipmentNextStep(status: string, paymentStatus?: string | null): string {
  if (status === "pendiente") return "En revisión";
  if (status === "confirmado" && paymentStatus !== "pagado") return "Pago pendiente";
  if (status === "confirmado") return "Listo para retiro";
  if (status === "recogido") return "Carga retirada";
  if (status === "en_transito") return "En ruta";
  if (status === "entregado") return "Entrega completada";
  if (status === "rechazado") return "Rechazado";
  return "Revisar detalle";
}

function clientPrimaryActionLabel(status: string, canPay: boolean): string {
  if (canPay) return "Resolver pago pendiente";
  if (status === "en_transito" || status === "recogido") return "Seguir envío en mapa";
  return "Ver seguimiento";
}

function paymentPillClass(st: string | null | undefined): string {
  switch (st) {
    case "pagado":
      return "bg-emerald-600 text-white ring-1 ring-emerald-700/40";
    case "parcial":
      return "bg-amber-500 text-white ring-1 ring-amber-600/40";
    default:
      return "bg-red-600 text-white ring-1 ring-red-800/40";
  }
}

function ts(value?: string | null): number | null {
  if (!value) return null;
  const n = new Date(value).getTime();
  return Number.isFinite(n) ? n : null;
}

function periodStartPreset(preset: "hoy" | "semana" | "mes"): number {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (preset === "hoy") return d.getTime();
  if (preset === "semana") {
    const day = d.getDay();
    const diff = day === 0 ? 6 : day - 1;
    d.setDate(d.getDate() - diff);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function num(x: unknown): number | null {
  if (x === null || x === undefined || x === "") return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function fmtCLP(x: unknown): string {
  const n = Number(x);
  return (Number.isFinite(n) ? n : 0).toLocaleString("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  });
}

export function ClienteEnviosPage() {
  const qc = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [pickupDateTime, setPickupDateTime] = useState("");
  const [deliveryDateTime, setDeliveryDateTime] = useState("");
  const [pickupWindowStart, setPickupWindowStart] = useState("");
  const [pickupWindowEnd, setPickupWindowEnd] = useState("");
  const [deliveryWindowStart, setDeliveryWindowStart] = useState("");
  const [deliveryWindowEnd, setDeliveryWindowEnd] = useState("");
  const [pickupNotes, setPickupNotes] = useState("");
  const [deliveryNotes, setDeliveryNotes] = useState("");
  const [pickupCoords, setPickupCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [deliveryCoords, setDeliveryCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payRef, setPayRef] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const [cargoType, setCargoType] = useState<string>("caja");
  const [cargoWeightKg, setCargoWeightKg] = useState("");
  const [cargoVolumeM3, setCargoVolumeM3] = useState("");
  const [cargoDescription, setCargoDescription] = useState("");
  const [historyStatus, setHistoryStatus] = useState<"all" | "pendiente" | "en_curso" | "entregado" | "rechazado">("all");
  const [historyDate, setHistoryDate] = useState<"all" | "hoy" | "semana" | "mes">("all");
  const [historyPage, setHistoryPage] = useState(1);
  const [showPaymentDetail, setShowPaymentDetail] = useState(false);
  /** Pedido cuyo seguimiento se muestra en mapa / panel lateral (desde historial o el activo por defecto). */
  const [mapFocusId, setMapFocusId] = useState<string | null>(null);
  const [mapDetailOpen, setMapDetailOpen] = useState(false);
  const [mainView, setMainView] = useState<ClientePedidosVista>(() =>
    viewFromLocation(location.pathname, location.search)
  );
  const isSolicitudRoute = location.pathname.endsWith("/solicitud");

  useEffect(() => {
    setMainView(viewFromLocation(location.pathname, location.search));
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!location.pathname.endsWith("/solicitud")) return;
    const block = document.getElementById("nueva-solicitud-envio");
    const details = document.getElementById("nueva-solicitud-panel") as HTMLDetailsElement | null;
    if (details) details.open = true;
    if (block) requestAnimationFrame(() => block.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [location.pathname]);

  const q = useQuery({ queryKey: ["shipments", "client"], queryFn: () => apiGet<ShipmentRow[]>("/shipments") });
  const invoicesQ = useQuery({ queryKey: ["invoices", "cliente"], queryFn: () => apiGet<InvoiceRow[]>("/invoices") });
  const paymentsAlertQ = useQuery<ClientePaymentAlert[]>({
    queryKey: ["cliente-payments-alert"],
    queryFn: () => apiGet<ClientePaymentAlert[]>("/payments"),
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
  const pagosRechazadosCount = (paymentsAlertQ.data ?? []).filter((p) => p.verificationStatus === "rechazado").length;
  const pagosPendientesValidacionCount = (paymentsAlertQ.data ?? []).filter(
    (p) => p.verificationStatus === "pendiente"
  ).length;
  const rows = q.data ?? [];
  const primaryActive = rows.find((r) => r.status === "en_transito" || r.status === "recogido") ?? rows[0];
  const createShipment = useMutation({
    mutationFn: () => {
      const w = Number(cargoWeightKg);
      const v = Number(cargoVolumeM3);
      if (!solicitudFormReady(origin, destination, pickupDateTime, deliveryDateTime, cargoWeightKg, cargoVolumeM3)) {
        throw new Error("Completá origen, destino, fechas de retiro/entrega y peso/volumen válidos.");
      }
      return apiSend("/shipments", "POST", {
        origin,
        destination,
        pickupAddress: origin,
        deliveryAddress: destination,
        scheduledPickup: toIso(pickupDateTime),
        scheduledDelivery: toIso(deliveryDateTime),
        pickupWindowStart: toIso(pickupWindowStart),
        pickupWindowEnd: toIso(pickupWindowEnd),
        deliveryWindowStart: toIso(deliveryWindowStart),
        deliveryWindowEnd: toIso(deliveryWindowEnd),
        pickupNotes: pickupNotes || undefined,
        deliveryNotes: deliveryNotes || undefined,
        cargoType,
        cargoWeightKg: w,
        cargoVolumeM3: v,
        ...(cargoDescription.trim() ? { cargoDescription: cargoDescription.trim() } : {}),
        ...(pickupCoords
          ? { originLat: pickupCoords.lat, originLng: pickupCoords.lng }
          : {}),
        ...(deliveryCoords
          ? { destinationLat: deliveryCoords.lat, destinationLng: deliveryCoords.lng }
          : {}),
      });
    },
    onSuccess: () => {
      setOrigin("");
      setDestination("");
      setPickupDateTime("");
      setDeliveryDateTime("");
      setPickupWindowStart("");
      setPickupWindowEnd("");
      setDeliveryWindowStart("");
      setDeliveryWindowEnd("");
      setPickupNotes("");
      setDeliveryNotes("");
      setPickupCoords(null);
      setDeliveryCoords(null);
      setCargoType("caja");
      setCargoWeightKg("");
      setCargoVolumeM3("");
      setCargoDescription("");
      setRequestError(null);
      void qc.invalidateQueries({ queryKey: ["shipments", "client"] });
      notify(
        "success",
        "Solicitud enviada: quedó como envío pendiente en tu empresa para que la cotice y asigne equipo."
      );
    },
    onError: (e: Error) => setRequestError(e.message),
  });
  const payment = useMutation({
    mutationFn: async () => {
      if (!primaryActive) throw new Error("No hay envío activo");
      const payload: Record<string, unknown> = {
        shipmentId: primaryActive.id,
        amount: Number(payAmount),
        method: "transferencia",
        reference: payRef || undefined,
      };
      if (proofFile) {
        const base64 = await fileToBase64(proofFile);
        payload.proofFileName = proofFile.name;
        payload.proofMimeType = proofFile.type || "application/pdf";
        payload.proofBase64 = base64;
      }
      return apiSend("/payments", "POST", payload);
    },
    onSuccess: () => {
      setPayAmount("");
      setPayRef("");
      setProofFile(null);
      setPayError(null);
      void qc.invalidateQueries({ queryKey: ["payments", "cliente"] });
      void qc.invalidateQueries({ queryKey: ["shipments", "client"] });
      notify(
        "success",
        "Registro de pago creado y vinculado al envío. Tu empresa lo revisará en validaciones."
      );
    },
    onError: (e: Error) => setPayError(e.message),
  });

  const invoiceByShipmentId = useMemo(() => {
    const m = new Map<string, { invoiceId: string; number: string }>();
    for (const inv of invoicesQ.data ?? []) {
      for (const line of inv.lines ?? []) {
        if (line.shipmentId) m.set(line.shipmentId, { invoiceId: inv.id, number: inv.number });
      }
    }
    return m;
  }, [invoicesQ.data]);

  const financials = useMemo(() => {
    let totalAcordado = 0;
    let totalPagadoRegistrado = 0;
    let saldo = 0;
    for (const r of rows) {
      const t = Number(r.totalAmount ?? r.amount ?? 0);
      if (Number.isFinite(t) && t > 0) totalAcordado += t;
      const p = Number(r.paidAmount ?? 0);
      if (Number.isFinite(p) && p > 0) totalPagadoRegistrado += p;
      const b = Number(r.balanceAmount ?? 0);
      if (Number.isFinite(b) && b > 0) saldo += b;
    }
    return {
      n: rows.length,
      totalAcordado,
      totalPagadoRegistrado,
      saldo,
    };
  }, [rows]);

  const activeOrders = useMemo(
    () => rows.filter((r) => r.status !== "entregado" && r.status !== "rechazado"),
    [rows]
  );

  const accountStats = useMemo(() => {
    const enCamino = rows.filter((r) => r.status !== "entregado" && r.status !== "rechazado").length;
    const entregados = rows.filter((r) => r.status === "entregado").length;
    const conSaldoAbierto = rows.filter((r) => {
      const b = Number(r.balanceAmount ?? 0);
      return Number.isFinite(b) && b > 0;
    }).length;
    const activosNoEntregados = rows.filter((r) => r.status !== "entregado" && r.status !== "rechazado").length;
    return { enCamino, entregados, conSaldoAbierto, activosNoEntregados, totalPedidos: rows.length };
  }, [rows]);

  const defaultMapId = useMemo(() => {
    const inRoute = rows.find((r) => r.status === "en_transito" || r.status === "recogido");
    if (inRoute) return inRoute.id;
    if (activeOrders[0]) return activeOrders[0].id;
    return rows[0]?.id ?? null;
  }, [rows, activeOrders]);

  const filteredHistory = useMemo(() => {
    const t0 =
      historyDate === "all"
        ? null
        : periodStartPreset(historyDate === "hoy" ? "hoy" : historyDate === "semana" ? "semana" : "mes");
    const now = Date.now();
    return rows.filter((r) => {
      if (historyStatus !== "all") {
        if (historyStatus === "pendiente" && r.status !== "pendiente") return false;
        if (historyStatus === "rechazado" && r.status !== "rechazado") return false;
        if (historyStatus === "entregado" && r.status !== "entregado") return false;
        if (
          historyStatus === "en_curso" &&
          !["confirmado", "recogido", "en_transito"].includes(r.status)
        ) {
          return false;
        }
      }
      if (t0 !== null) {
        const ref = ts(r.createdAt) ?? ts(r.scheduledPickup);
        if (ref === null || ref < t0 || ref > now) return false;
      }
      return true;
    });
  }, [rows, historyStatus, historyDate]);

  const historyTotalPages = Math.max(1, Math.ceil(filteredHistory.length / HISTORY_PAGE_SIZE));
  const historyPageSafe = Math.min(historyPage, historyTotalPages);
  const paginatedHistory = useMemo(() => {
    const start = (historyPageSafe - 1) * HISTORY_PAGE_SIZE;
    return filteredHistory.slice(start, start + HISTORY_PAGE_SIZE);
  }, [filteredHistory, historyPageSafe]);

  useEffect(() => {
    setHistoryPage(1);
  }, [historyStatus, historyDate]);

  useEffect(() => {
    if (mapFocusId && !rows.some((r) => r.id === mapFocusId)) setMapFocusId(null);
  }, [rows, mapFocusId]);

  if (q.isLoading) return <p className="p-4 text-sm text-slate-500">Cargando pedidos…</p>;
  if (q.isError) return <p className="p-4 text-sm text-rose-600">{(q.error as Error).message}</p>;

  const displayShipment =
    (mapFocusId ? rows.find((r) => r.id === mapFocusId) : undefined) ??
    (defaultMapId ? rows.find((r) => r.id === defaultMapId) : undefined) ??
    undefined;
  const showingHistoryFocus =
    mapFocusId !== null && defaultMapId !== null && mapFocusId !== defaultMapId;
  const displayAgreedAmount = Number(displayShipment?.totalAmount ?? displayShipment?.amount ?? 0);
  const displayHasApprovedPrice = Number.isFinite(displayAgreedAmount) && displayAgreedAmount > 0;

  const clienteSeguimientoGoogleUrl = displayShipment
    ? googleMapsUrlForShipment({
        id: displayShipment.id,
        origin: displayShipment.origin,
        destination: displayShipment.destination,
        customer: { name: "Cliente" },
        originLat: displayShipment.originLat,
        originLng: displayShipment.originLng,
        destinationLat: displayShipment.destinationLat,
        destinationLng: displayShipment.destinationLng,
        lastLat: displayShipment.lastLat,
        lastLng: displayShipment.lastLng,
      })
    : "";
  const clienteSeguimientoGoogleLabel =
    displayShipment && num(displayShipment.lastLat) != null && num(displayShipment.lastLng) != null
      ? "Ver última posición del camión en Google Maps"
      : "Ver ubicación en Google Maps (seguimiento)";

  const markers: MapMarker[] = [];
  const routes: MapRoute[] = [];
  const mapListShipments = activeOrders.length > 0 ? activeOrders : displayShipment ? [displayShipment] : [];
  const mapRenderShipments =
    mapFocusId && displayShipment && mapListShipments.some((s) => s.id === mapFocusId)
      ? [displayShipment]
      : mapListShipments;
  for (const s of mapRenderShipments) {
    const shortId = s.id.slice(-6).toUpperCase();
    const oLat = num(s.originLat);
    const oLng = num(s.originLng);
    const dLat = num(s.destinationLat);
    const dLng = num(s.destinationLng);
    const lLat = num(s.lastLat);
    const lLng = num(s.lastLng);
    if (oLat !== null && oLng !== null) markers.push({ lat: oLat, lng: oLng, label: `Origen ·${shortId}: ${s.origin}`, color: "blue" });
    if (dLat !== null && dLng !== null) markers.push({ lat: dLat, lng: dLng, label: `Destino ·${shortId}: ${s.destination}`, color: "green" });
    if (lLat !== null && lLng !== null) markers.push({ lat: lLat, lng: lLng, label: `Ubicación actual ·${shortId}`, color: "orange" });
    if (oLat !== null && oLng !== null && dLat !== null && dLng !== null) {
      routes.push({ from: { lat: oLat, lng: oLng }, to: { lat: dLat, lng: dLng }, color: "#f97316" });
    }
  }

  const agreedAmount = Number(primaryActive?.totalAmount ?? primaryActive?.amount ?? 0);
  const agreedUpfront = Number(primaryActive?.upfrontAmount ?? 0);
  const agreedUpfrontPercent = Number(primaryActive?.upfrontPercent ?? 0);
  const hasApprovedPrice = Number.isFinite(agreedAmount) && agreedAmount > 0;
  const paymentEnabled =
    !!primaryActive &&
    primaryActive.status !== "rechazado" &&
    hasApprovedPrice &&
    primaryActive.paymentTerm !== "delivery" &&
    (primaryActive.status === "pendiente" || primaryActive.status === "confirmado");

  function focusMapa(shipmentId?: string | null) {
    if (shipmentId) setMapFocusId(shipmentId);
    navigate(urlForView("mapa"));
    window.requestAnimationFrame(() =>
      document.getElementById("seguimiento-seccion")?.scrollIntoView({ behavior: "smooth", block: "start" })
    );
  }

  function focusPagosBloque() {
    navigate("/cliente/pagos");
  }

  return (
    <div className="mx-auto max-w-5xl space-y-3 px-2 pb-8 sm:px-0">
      <header className="rounded-xl border border-orange-400/25 bg-gradient-to-br from-orange-600 to-orange-700 p-3 text-white shadow-md sm:p-4">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-orange-200/90">Cliente</p>
        <h1 className="text-lg font-semibold tracking-tight sm:text-xl">{isSolicitudRoute ? "Nueva solicitud" : "Mis pedidos"}</h1>
        <p className="mt-1 max-w-2xl text-sm leading-snug text-orange-100/95">{isSolicitudRoute ? "Completá datos y enviá." : "Tocá un bloque para ver y actuar."}</p>
      </header>

      {!isSolicitudRoute ? (
        <nav
          className="rounded-xl border border-slate-200 bg-slate-100/95 p-1 shadow-sm"
          role="tablist"
          aria-label="Vistas de pedidos"
        >
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
            {(
              [
                ["inicio", "Resumen", LayoutDashboard, null] as const,
                ["envios", "En curso", Package, activeOrders.length] as const,
                ["mapa", "Mapa", MapIcon, null] as const,
                ["historial", "Historial", History, rows.length] as const,
              ] as const
            ).map(([tabId, label, Icon, badge]) => {
              const selected = mainView === tabId;
              return (
                <button
                  key={tabId}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  className={`flex min-h-[3rem] flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-2 text-center text-[11px] font-semibold transition sm:flex-row sm:gap-2 sm:text-xs ${
                    selected
                      ? "bg-white text-orange-800 shadow-sm ring-2 ring-orange-300/60"
                      : "text-slate-600 hover:bg-white/85 hover:text-slate-900"
                  }`}
                  onClick={() => navigate(urlForView(tabId as ClientePedidosVista))}
                >
                  <Icon className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
                  <span className="leading-tight">{label}</span>
                  {badge != null && Number(badge) > 0 ? (
                    <span className="rounded-full bg-orange-100 px-1.5 text-[10px] font-bold text-orange-800 tabular-nums">
                      {badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </nav>
      ) : null}

      {mainView === "inicio" && !isSolicitudRoute ? (
        <>
          <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <button
              type="button"
              onClick={() => navigate(urlForView("envios"))}
              className="rounded-xl border border-orange-200 bg-white p-3 text-left shadow-sm transition hover:bg-orange-50"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-orange-700">Activos</p>
              <p className="mt-1 text-2xl font-extrabold text-slate-900">{accountStats.activosNoEntregados}</p>
              <p className="text-[11px] text-slate-500">Ver pedidos</p>
            </button>
            <button
              type="button"
              onClick={() => navigate(urlForView("mapa"))}
              className="rounded-xl border border-cyan-200 bg-white p-3 text-left shadow-sm transition hover:bg-cyan-50"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-cyan-700">En camino</p>
              <p className="mt-1 text-2xl font-extrabold text-slate-900">{accountStats.enCamino}</p>
              <p className="text-[11px] text-slate-500">Abrir mapa</p>
            </button>
            <button
              type="button"
              onClick={() => navigate("/cliente/pagos")}
              className="rounded-xl border border-rose-200 bg-white p-3 text-left shadow-sm transition hover:bg-rose-50"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-700">Por pagar</p>
              <p className="mt-1 text-2xl font-extrabold text-slate-900">{accountStats.conSaldoAbierto}</p>
              <p className="text-[11px] text-slate-500">Ir a pagos</p>
            </button>
            <button
              type="button"
              onClick={() => navigate(urlForView("historial"))}
              className="rounded-xl border border-emerald-200 bg-white p-3 text-left shadow-sm transition hover:bg-emerald-50"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Entregados</p>
              <p className="mt-1 text-2xl font-extrabold text-slate-900">{accountStats.entregados}</p>
              <p className="text-[11px] text-slate-500">Ver historial</p>
            </button>
          </section>

          <section
            className="rounded-xl border-2 border-orange-400/40 bg-gradient-to-br from-white via-white to-orange-50/60 p-3 shadow-sm sm:p-4"
            aria-labelledby="cliente-prioridad-titulo"
          >
            <h2 id="cliente-prioridad-titulo" className="text-base font-semibold text-orange-900">
              Estado principal
            </h2>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              {activeOrders.length > 0 ? (
                <>
                  <p className="text-sm text-slate-800">
                    <strong>{activeOrders.length}</strong> pedido{activeOrders.length === 1 ? "" : "s"} activo
                    {activeOrders.length === 1 ? "" : "s"}
                    {accountStats.enCamino > 0 ? (
                      <span className="text-slate-600">
                        {" "}
                        · <strong>{accountStats.enCamino}</strong> en camino
                      </span>
                    ) : null}
                    .
                  </p>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-lg bg-orange-600 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-500"
                    onClick={() => navigate(urlForView("envios"))}
                  >
                    Ver listado
                  </button>
                  {primaryActive ? (
                    <button
                      type="button"
                      className="inline-flex items-center justify-center rounded-lg border border-orange-300 bg-white px-3 py-2 text-xs font-semibold text-orange-900 hover:bg-orange-50"
                      onClick={() => focusMapa(primaryActive.id)}
                    >
                      <MapPin size={14} className="me-1" aria-hidden /> Mapa
                    </button>
                  ) : null}
                </>
              ) : rows.length > 0 ? (
                <p className="text-sm text-slate-700">
                  No tenés pedidos activos en este momento.{" "}
                  <button
                    type="button"
                    className="font-semibold text-orange-700 underline decoration-orange-300 hover:text-orange-900"
                    onClick={() => navigate(urlForView("historial"))}
                  >
                    Ver historial
                  </button>
                  .
                </p>
              ) : (
                <p className="text-sm text-slate-700">Todavía no tenés pedidos. Podés crear el primero más abajo.</p>
              )}
            </div>
            {pagosRechazadosCount > 0 || pagosPendientesValidacionCount > 0 ? (
              <div className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                  <AlertTriangle size={14} className="shrink-0 text-amber-600" aria-hidden />
                  Comprobantes (misma info que la franja superior)
                </p>
                <ul className="mt-2 space-y-1.5 text-sm">
                  {pagosRechazadosCount > 0 ? (
                    <li className="text-rose-800">
                      <strong>{pagosRechazadosCount}</strong> pago{pagosRechazadosCount === 1 ? "" : "s"} rechazado
                      {pagosRechazadosCount === 1 ? "" : "s"} — subí un comprobante nuevo.
                    </li>
                  ) : null}
                  {pagosPendientesValidacionCount > 0 ? (
                    <li className="text-amber-900">
                      <strong>{pagosPendientesValidacionCount}</strong> comprobante{pagosPendientesValidacionCount === 1 ? "" : "s"}{" "}
                      pendiente{pagosPendientesValidacionCount === 1 ? "" : "s"} de validación por la empresa.
                    </li>
                  ) : null}
                </ul>
              </div>
            ) : null}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
            <h2 className="text-base font-semibold text-slate-900">Cuenta (lo esencial)</h2>
            <p className="mt-1 text-xs text-slate-600">
              Revisá pagos/deuda y documentos emitidos en las secciones dedicadas.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                to="/cliente/facturas"
                className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
              >
                Ver facturas emitidas
              </Link>
              <a
                id="cliente-soporte-contacto"
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                href="mailto:soporte@transportpro.local?subject=Soporte%20cliente"
              >
                <LifeBuoy size={14} /> Soporte
              </a>
            </div>
          </section>
        </>
      ) : null}

      {mainView === "envios" ? (
      <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
        <h2 className="text-base font-semibold text-slate-900">Envíos en curso</h2>
        <p className="text-xs text-slate-600">Tocá un pedido para actuar rápido.</p>
        <div className="mt-3 space-y-2.5">
          {activeOrders.length === 0 ? (
            <p className="text-sm text-slate-500">No tenés pedidos activos en este momento.</p>
          ) : (
            activeOrders.map((r) => {
              const inv = invoiceByShipmentId.get(r.id);
              const bal = Number(r.balanceAmount ?? 0);
              const canPayRow =
                r.status !== "rechazado" &&
                Number(r.totalAmount ?? r.amount ?? 0) > 0 &&
                r.paymentTerm !== "delivery" &&
                (r.status === "pendiente" || r.status === "confirmado") &&
                bal > 0;
              return (
                <div
                  key={r.id}
                  className={`rounded-xl border p-3 ${
                    displayShipment?.id === r.id ? "border-orange-500 bg-orange-50/80" : "border-orange-200 bg-orange-50/40"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {r.origin} → {r.destination}
                      </p>
                      <p className="font-mono text-[10px] text-slate-500">·{r.id.slice(-6).toUpperCase()}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ring-2 ${paymentPillClass(r.paymentStatus)}`}>
                        Pago: {paymentPillLabel(r.paymentStatus)}
                      </span>
                      <span className="rounded-full bg-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-800">
                        Pedido: {sharedShipmentStatusLabel(r.status)}
                      </span>
                    </div>
                  </div>
                  <p className="mt-2 rounded-lg bg-white/80 px-2 py-1.5 text-xs font-semibold text-slate-700">
                    {shipmentNextStep(r.status, r.paymentStatus)}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-lg bg-orange-600 px-3 py-2 text-xs font-bold text-white shadow hover:bg-orange-500"
                      onClick={() => (canPayRow ? focusPagosBloque() : focusMapa(r.id))}
                    >
                      <MapPin size={14} /> {clientPrimaryActionLabel(r.status, canPayRow)}
                    </button>
                    {canPayRow ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                        onClick={() => focusMapa(r.id)}
                      >
                        Ver en mapa
                      </button>
                    ) : null}
                    {inv ? (
                      <Link
                        to="/cliente/facturas"
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                      >
                        <FileText size={14} /> Factura {inv.number}
                      </Link>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
      ) : null}

      {mainView === "mapa" ? (
      <section
        id="seguimiento-seccion"
        className="scroll-mt-20 overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm"
      >
        <div className="border-b border-slate-100 bg-gradient-to-r from-orange-50/90 via-white to-slate-50/40 px-3 py-2.5 sm:px-4">
          <h2 className="text-base font-semibold tracking-tight text-slate-900">Seguimiento en mapa</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-600">Vista global de todos los pedidos en curso.</p>
        </div>
        <div className="p-3 sm:p-4">
        <div className="grid gap-3 lg:grid-cols-3">
          <div id="seguimiento-mapa" className="scroll-mt-4 rounded-lg border border-slate-200 bg-slate-50/60 p-3 lg:col-span-2">
          {showingHistoryFocus ? (
            <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-950">
              <span>
                Mapa y detalle: pedido ·{displayShipment?.id.slice(-6).toUpperCase()} (historial).
              </span>
              <button
                type="button"
                className="font-semibold text-orange-800 underline hover:text-orange-900"
                onClick={() => setMapFocusId(null)}
              >
                Volver al pedido destacado
              </button>
            </div>
          ) : null}
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-800">Vista del mapa</p>
          </div>
          <RouteMap
            title={`En curso: ${mapListShipments.length} · en mapa: ${mapRenderShipments.length}`}
            markers={markers}
            routes={routes}
            heightClass="h-56 md:h-72"
          />
          <p className="mt-2 text-xs font-semibold text-slate-700">
            Mostrando {mapRenderShipments.length} pedido{mapRenderShipments.length === 1 ? "" : "s"} en el mapa.
          </p>
          {displayShipment ? (
            <p className="mt-2 text-sm text-slate-600">
              {displayShipment.origin} → {displayShipment.destination} · <span className="font-medium">{sharedShipmentStatusLabel(displayShipment.status)}</span>
            </p>
          ) : null}
          {mapRenderShipments.length > 0 && markers.length === 0 ? (
            <p className="mt-1 text-xs text-slate-500">
              Los pedidos en curso aún no tienen ubicación georreferenciada.
            </p>
          ) : null}
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            {mapListShipments.length > 0 ? (
              <div className="mb-3 border-b border-slate-100 pb-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Pedidos en camino</p>
                <div className="mt-2 space-y-1.5">
                  {mapListShipments.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setMapFocusId(s.id);
                        setMapDetailOpen(true);
                      }}
                      className={`block w-full rounded-lg border px-2.5 py-2 text-left text-xs transition ${
                        displayShipment?.id === s.id
                          ? "border-orange-300 bg-orange-50 text-orange-900"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <p className="font-semibold">
                        ·{s.id.slice(-6).toUpperCase()} · {s.origin} → {s.destination}
                      </p>
                      <p className="mt-0.5 text-[11px]">{sharedShipmentStatusLabel(s.status)}</p>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Detalle</h3>
            <p className="text-xs text-slate-600">Seleccioná un pedido para ver su información en ventana flotante.</p>
          </div>
        </div>
        </div>
      </section>
      ) : null}
      {mainView === "mapa" && mapDetailOpen && displayShipment ? (
        <div
          className="fixed inset-0 z-[85] flex items-center justify-center bg-black/45 p-4"
          onClick={() => setMapDetailOpen(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-4 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label="Detalle de envío en mapa"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-slate-900">
              Pedido ·{displayShipment.id.slice(-6).toUpperCase()}
            </h3>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${paymentPillClass(displayShipment.paymentStatus)}`}>
                {paymentPillLabel(displayShipment.paymentStatus)}
              </span>
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-800">
                {sharedShipmentStatusLabel(displayShipment.status)}
              </span>
            </div>
            {displayHasApprovedPrice ? (
              <p className="mt-2 text-xs text-slate-700">
                Forma de pago: <strong>{paymentTermLabel(displayShipment.paymentTerm)}</strong>
                {displayAgreedAmount > 0 ? ` · Total ${fmtCLP(displayAgreedAmount)}` : ""}
              </p>
            ) : null}
            <p className="mt-2 text-sm text-slate-700">
              Retiro: {formatDate(displayShipment.scheduledPickup)} — {displayShipment.pickupAddress ?? displayShipment.origin}
            </p>
            <p className="text-sm text-slate-700">
              Entrega: {formatDate(displayShipment.scheduledDelivery)} — {displayShipment.deliveryAddress ?? displayShipment.destination}
            </p>
            <p className="mt-1 text-sm text-slate-700">
              Carga: {displayShipment.cargoType ?? "—"} · {displayShipment.cargoWeightKg != null ? `${displayShipment.cargoWeightKg} kg` : "—"} ·{" "}
              {displayShipment.cargoVolumeM3 != null ? `${displayShipment.cargoVolumeM3} m³` : "—"}
            </p>
            {displayShipment.cargoDescription ? <p className="mt-1 text-xs text-slate-600">Notas: {displayShipment.cargoDescription}</p> : null}
            {clienteSeguimientoGoogleUrl && clienteSeguimientoGoogleUrl !== "https://www.google.com/maps/" ? (
              <div className="mt-3">
                <a
                  href={clienteSeguimientoGoogleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50/90 py-2.5 text-xs font-semibold text-blue-950 shadow-sm hover:bg-blue-100/90"
                >
                  <MapPin size={16} className="shrink-0" aria-hidden />
                  {clienteSeguimientoGoogleLabel}
                </a>
                <p className="mt-1 text-[10px] text-slate-500">
                  Mapa en modo <strong className="font-medium">seguimiento</strong> (ubicación), no ruta de navegación.
                </p>
              </div>
            ) : null}
            {displayShipment.status === "entregado" ? (
              <div className="mt-2 rounded border border-emerald-200 bg-emerald-50/90 p-2 text-xs text-emerald-950">
                <p className="font-semibold">Entrega registrada</p>
                {displayShipment.deliveredAt ? <p>Fecha: {formatDate(displayShipment.deliveredAt)}</p> : null}
                {displayShipment.deliveredToName ? (
                  <p>
                    Recibió: <strong>{displayShipment.deliveredToName}</strong>
                  </p>
                ) : null}
                {displayShipment.deliveryEvidence ? <p className="mt-1">Evidencia / nota: {displayShipment.deliveryEvidence}</p> : null}
                {displayShipment.attachments && displayShipment.attachments.length > 0 ? (
                  <ul className="mt-1 space-y-1">
                    {displayShipment.attachments.map((a) => (
                      <li key={a.id}>
                        <button
                          type="button"
                          className="font-medium text-emerald-800 underline"
                          onClick={() =>
                            void apiBlob(`/attachments/${a.id}/file`).then((blob) =>
                              downloadBlob(blob, `${a.kind}-${a.id.slice(-6)}`)
                            )
                          }
                        >
                          {a.kind === "delivery_photo" ? "Foto" : "Firma"} · descargar ({a.mimeType})
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-emerald-800/80">Sin archivos adjuntos en el servidor para este envío.</p>
                )}
              </div>
            ) : null}
            <div className="mt-3">
              <button
                type="button"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                onClick={() => setMapDetailOpen(false)}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {mainView === "historial" ? (
      <section
        id="historial-pedidos"
        className="scroll-mt-20 overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm"
      >
        <div className="border-b border-slate-100 bg-gradient-to-r from-orange-50/90 via-white to-slate-50/40 px-3 py-2.5 sm:px-4">
          <h2 className="text-base font-semibold tracking-tight text-slate-900">Historial de pedidos</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-600">Filtrá y tocá para ver mapa.</p>
        </div>
        <div className="p-3 sm:p-4">
        <div className="mb-3 rounded-lg border border-slate-200 bg-slate-100/70 p-3">
          <p className="mb-2 text-[11px] font-semibold text-slate-600">Filtros</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
          <div>
            <label className="block text-[10px] font-medium text-slate-600">Estado</label>
            <select
              className="mt-0.5 w-full min-w-[10rem] rounded border border-slate-300 bg-white px-2 py-1.5 text-sm shadow-sm sm:w-auto"
              value={historyStatus}
              onChange={(e) => setHistoryStatus(e.target.value as typeof historyStatus)}
            >
              <option value="all">Todos</option>
              <option value="pendiente">Pendiente de aprobar</option>
              <option value="en_curso">En curso (confirmado / en ruta)</option>
              <option value="entregado">Entregado</option>
              <option value="rechazado">Rechazado</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-medium text-slate-600">Fecha</label>
            <select
              className="mt-0.5 w-full min-w-[10rem] rounded border border-slate-300 bg-white px-2 py-1.5 text-sm shadow-sm sm:w-auto"
              value={historyDate}
              onChange={(e) => setHistoryDate(e.target.value as typeof historyDate)}
            >
              <option value="all">Cualquiera</option>
              <option value="hoy">Hoy</option>
              <option value="semana">Esta semana</option>
              <option value="mes">Este mes</option>
            </select>
          </div>
          <p className="text-[11px] font-medium text-slate-600 sm:ml-auto sm:self-end">
            {filteredHistory.length} pedido{filteredHistory.length === 1 ? "" : "s"} · página {historyPageSafe} / {historyTotalPages}
          </p>
          </div>
        </div>
        <div className="space-y-2">
          {paginatedHistory.map((r) => {
            const inv = invoiceByShipmentId.get(r.id);
            return (
              <div key={r.id} className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {r.origin} → {r.destination}
                    </p>
                    <p className="font-mono text-[10px] text-slate-500">·{r.id.slice(-6).toUpperCase()}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${paymentPillClass(r.paymentStatus)}`}>
                      {paymentPillLabel(r.paymentStatus)}
                    </span>
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-800">
                      {sharedShipmentStatusLabel(r.status)}
                    </span>
                  </div>
                </div>
                <p className="mt-1 text-xs text-slate-600">Retiro: {formatDate(r.scheduledPickup)}</p>
                <p className="text-xs text-slate-600">Entrega: {formatDate(r.scheduledDelivery)}</p>
                {r.status === "entregado" && (r.deliveredToName || r.deliveryEvidence || (r.attachments && r.attachments.length > 0)) ? (
                  <p className="mt-1 text-[11px] text-emerald-800">
                    Entrega: {r.deliveredToName ? `recibió ${r.deliveredToName}` : "registrada"}
                    {r.attachments && r.attachments.length > 0 ? ` · ${r.attachments.length} archivo(s)` : ""}
                  </p>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md bg-orange-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-orange-500"
                    onClick={() => focusMapa(r.id)}
                  >
                    <MapPin size={14} />
                    Ver en mapa
                  </button>
                  {inv ? (
                    <Link
                      to="/cliente/facturas"
                      className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-800 hover:bg-slate-50"
                    >
                      <FileText size={14} />
                      Factura {inv.number}
                    </Link>
                  ) : null}
                </div>
              </div>
            );
          })}
          {filteredHistory.length === 0 ? (
            <p className="text-sm text-slate-500">No hay pedidos con estos filtros.</p>
          ) : null}
          {historyTotalPages > 1 ? (
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                className="rounded border border-slate-300 px-3 py-1 text-xs font-medium disabled:opacity-40"
                disabled={historyPageSafe <= 1}
                onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
              >
                Anterior
              </button>
              <button
                type="button"
                className="rounded border border-slate-300 px-3 py-1 text-xs font-medium disabled:opacity-40"
                disabled={historyPageSafe >= historyTotalPages}
                onClick={() => setHistoryPage((p) => Math.min(historyTotalPages, p + 1))}
              >
                Siguiente
              </button>
            </div>
          ) : null}
        </div>
        </div>
      </section>
      ) : null}

      {mainView === "inicio" && isSolicitudRoute ? (
      <section
        id="nueva-solicitud-envio"
        className="scroll-mt-20 overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm"
      >
        <div className="border-b border-slate-100 bg-gradient-to-r from-orange-50/90 via-white to-slate-50/40 px-3 py-2.5 sm:px-4">
          <h2 className="text-base font-semibold tracking-tight text-slate-900">Solicitar envío</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
            Ingresa origen y destino. La empresa revisa precio, fecha y disponibilidad.
          </p>
        </div>
        <div className="p-3 sm:p-4">
        <details id="nueva-solicitud-panel" className="rounded-lg border border-dashed border-orange-300 bg-orange-50/40">
          <summary className="cursor-pointer list-none px-3 py-3 text-sm font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
            <span className="text-orange-700">+</span> Completar solicitud
          </summary>
          <div className="space-y-3 border-t border-orange-200/60 px-3 pb-4 pt-3">
          <AddressAutocomplete
            label="Origen / retiro"
            value={origin}
            onChange={setOrigin}
            onResolvedCoords={setPickupCoords}
            placeholder="Mín. 3 letras; elegí una sugerencia de la lista"
          />
          <AddressAutocomplete
            label="Destino / entrega"
            value={destination}
            onChange={setDestination}
            onResolvedCoords={setDeliveryCoords}
            placeholder="Mín. 3 letras; elegí una sugerencia de la lista"
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-xs font-medium text-slate-600">
              Retiro (fecha y hora) <span className="text-rose-600">*</span>
              <input
                className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                type="datetime-local"
                required
                value={pickupDateTime}
                onChange={(e) => setPickupDateTime(e.target.value)}
              />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              Entrega (fecha y hora) <span className="text-rose-600">*</span>
              <input
                className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                type="datetime-local"
                required
                value={deliveryDateTime}
                onChange={(e) => setDeliveryDateTime(e.target.value)}
              />
            </label>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="block text-xs font-medium text-slate-600">
              Tipo de carga
              <select
                className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                value={cargoType}
                onChange={(e) => setCargoType(e.target.value)}
              >
                <option value="caja">Caja</option>
                <option value="pallet">Pallet</option>
                <option value="granel">Granel</option>
                <option value="contenedor">Contenedor</option>
                <option value="otro">Otro</option>
              </select>
            </label>
            <label className="block text-xs font-medium text-slate-600">
              Peso (kg) <span className="text-rose-600">*</span>
              <input
                className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                inputMode="decimal"
                required
                min="0.01"
                step="any"
                value={cargoWeightKg}
                onChange={(e) => setCargoWeightKg(e.target.value)}
              />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              Volumen (m³) <span className="text-rose-600">*</span>
              <input
                className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                inputMode="decimal"
                required
                min="0.01"
                step="any"
                value={cargoVolumeM3}
                onChange={(e) => setCargoVolumeM3(e.target.value)}
              />
            </label>
          </div>
          <label className="block text-xs font-medium text-slate-600">
            Notas (opcional)
            <textarea
              className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
              rows={2}
              value={cargoDescription}
              onChange={(e) => setCargoDescription(e.target.value)}
            />
          </label>
          {requestError ? <p className="text-xs text-rose-600">{requestError}</p> : null}
          <button
            type="button"
            className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500 disabled:opacity-50"
            disabled={
              !solicitudFormReady(
                origin,
                destination,
                pickupDateTime,
                deliveryDateTime,
                cargoWeightKg,
                cargoVolumeM3
              ) || createShipment.isPending
            }
            onClick={() => createShipment.mutate()}
          >
            {createShipment.isPending ? "Enviando…" : "Enviar solicitud"}
          </button>
          </div>
        </details>
        </div>
      </section>
      ) : null}

      {mainView === "inicio" && !isSolicitudRoute ? (
        <section className="rounded-xl border border-orange-200 bg-orange-50/60 p-4 shadow-sm">
          <h2 className="text-base font-semibold text-orange-900">Crear nueva solicitud</h2>
          <p className="mt-1 text-sm text-slate-700">
            La solicitud ahora está en una pantalla dedicada para completar el formulario sin distracciones.
          </p>
          <button
            type="button"
            className="mt-3 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500"
            onClick={() => navigate("/cliente/solicitud")}
          >
            Ir a Nueva solicitud
          </button>
        </section>
      ) : null}

    </div>
  );
}

function toIso(value: string) {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** Validación alineada con la API: retiro/entrega, peso y volumen obligatorios para nuevas solicitudes. */
function solicitudFormReady(
  origin: string,
  destination: string,
  pickupDateTime: string,
  deliveryDateTime: string,
  cargoWeightKg: string,
  cargoVolumeM3: string
): boolean {
  if (!origin.trim() || !destination.trim()) return false;
  if (!pickupDateTime || !deliveryDateTime) return false;
  const p = new Date(pickupDateTime).getTime();
  const d = new Date(deliveryDateTime).getTime();
  if (!Number.isFinite(p) || !Number.isFinite(d) || d < p) return false;
  const w = Number(cargoWeightKg);
  const v = Number(cargoVolumeM3);
  if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(v) || v <= 0) return false;
  return true;
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.readAsDataURL(file);
  });
}

