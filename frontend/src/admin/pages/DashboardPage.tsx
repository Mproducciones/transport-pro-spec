import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Building2, Car, UsersRound, X } from "lucide-react";
import { apiGet } from "../../api/client.js";
import { RouteMap } from "../../components/common/RouteMap.js";
import { buildMapMarkersAndRoutesForRows, mapFocusTargetForShipment, num } from "../shipmentMapGeo.js";
import { AdminPrivacyToggle, maskSensitiveAmount, useAdminPrivacy } from "../AdminPrivacyContext.js";
import { ResponsiveShipmentDetail } from "../ResponsiveShipmentDetail.js";
import { DashboardKpiModal, type DashboardKpiModalKind } from "../DashboardKpiModal.js";
import { DashboardMapaOperativoFloat } from "../DashboardMapaOperativoFloat.js";
import {
  DashboardCajaModal,
  DashboardChoferesModal,
  DashboardComprobantesModal,
  DashboardFlotaModal,
  DashboardMensajesModal,
} from "../DashboardHomeOverlays.js";
import { RegistrarCobroServiceModal, type RegistrarCobroServiceTarget } from "../RegistrarCobroServiceModal.js";
type DashboardDeudor = {
  shipmentId: string;
  customer: string;
  route: string;
  balance: string;
  requestedAt: string;
  paymentStatus?: string;
  total?: string;
  paid?: string;
  /** Estado operativo del envío (p. ej. en tránsito, entregado con saldo). */
  status?: string;
};

type Dashboard = {
  shipmentsByStatus: Record<string, number>;
  cobrosPendientes: {
    cantidadEnvios: number;
    sumaMontosEnvios: string;
    deudores?: DashboardDeudor[];
  };
  comprobantesPendientes: {
    hoy: {
      total: number;
      rows?: Array<{
        id: string;
        amount: string;
        reference: string;
        paidAt: string;
        shipment: { id: string; route: string; customer: string } | null;
      }>;
    };
  };
  ingresosRegistradosMes: { total: string; movimientos?: number };
  egresosRegistradosMes?: { total: string; movimientos: number };
  utilidadOperativaMes?: string;
};

const DASHBOARD_KPI_HINTS = {
  solicitudes:
    "Solicitudes del cliente (pendiente de aprobar o cotizar). Clic: listado y ficha en ventana sin salir del tablero.",
  confirmados:
    "Confirmados: listos para ejecutar (conductor y vehículo asignados). Clic: listado y ficha en panel.",
  viajesEnCurso:
    "Clic en un viaje: ficha con mapa y detalle (panel flotante). No hace falta un segundo paso para abrir la ficha.",
  entregasHoy:
    "Entregas cerradas hoy: el listado muestra si el cobro está al día o hay saldo. Clic: ficha en panel.",
  entregasVencidas:
    "Fecha de entrega pasada y envío aún sin cerrar. Clic: listado y ficha en panel. Comprobantes: chip o tarjeta de inicio. La campana sigue avisando novedades.",
} as const;

type ShipmentRow = {
  id: string;
  origin: string;
  destination: string;
  status: string;
  rejectionPhase?: string | null;
  scheduledDelivery?: string | null;
  pickedUpAt?: string | null;
  deliveredAt?: string | null;
  createdAt?: string;
  originLat?: string | number | null;
  originLng?: string | number | null;
  destinationLat?: string | number | null;
  destinationLng?: string | number | null;
  lastLat?: string | number | null;
  lastLng?: string | number | null;
  customer: { name: string };
  driver?: { id: string; fullName: string } | null;
  vehicle?: { id: string; plate: string; kind?: string } | null;
  totalAmount?: unknown;
  amount?: unknown;
  paymentStatus?: string;
  paidAmount?: string;
  balanceAmount?: string;
  deliveredToName?: string | null;
};

export function DashboardPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const envioParam = searchParams.get("envio");
  const [mapFocusShipmentId, setMapFocusShipmentId] = useState<string | null>(null);
  const [carteraModalOpen, setCarteraModalOpen] = useState(false);
  const [carteraPagoTarget, setCarteraPagoTarget] = useState<{ shipmentId: string; balanceHint: string } | null>(null);
  const [kpiModalKind, setKpiModalKind] = useState<DashboardKpiModalKind | null>(null);
  const [cajaModalOpen, setCajaModalOpen] = useState(false);
  const [comprobantesModalOpen, setComprobantesModalOpen] = useState(false);
  const [choferesModalOpen, setChoferesModalOpen] = useState(false);
  const [flotaModalOpen, setFlotaModalOpen] = useState(false);
  const [mensajesModalOpen, setMensajesModalOpen] = useState(false);
  const [fichaEnvioId, setFichaEnvioId] = useState<string | null>(null);
  const [fichaListHint, setFichaListHint] = useState<{
    balanceAmount?: string;
    paidAmount?: string;
  } | null>(null);
  const [mapaFloatOpen, setMapaFloatOpen] = useState(false);
  const { sensitiveHidden } = useAdminPrivacy();
  const q = useQuery({ queryKey: ["dashboard"], queryFn: () => apiGet<Dashboard>("/reports/dashboard") });
  const supportBadgeQ = useQuery({
    queryKey: ["support", "messages", "dashboard"],
    queryFn: () =>
      apiGet<Array<{ id: string; createdAt: string; author?: { role?: string } | null }>>("/support/messages"),
    staleTime: 20_000,
  });
  const shipmentsQ = useQuery({
    queryKey: ["shipments", "admin-dashboard"],
    queryFn: () => apiGet<ShipmentRow[]>("/shipments"),
    refetchInterval: 30_000,
  });

  const rows = shipmentsQ.data ?? [];
  const durationBars = useMemo(() => buildDurationByDaySeries(rows), [rows]);
  const durationBarsShipmentCount = useMemo(() => durationBars.reduce((s, x) => s + x.n, 0), [durationBars]);

  useEffect(() => {
    if (location.hash === "#cartera-por-cobrar-detalle" && q.data) {
      setCarteraModalOpen(true);
    }
  }, [location.hash, q.data]);

  const closeCarteraModal = useCallback(() => {
    setCarteraModalOpen(false);
    if (location.hash === "#cartera-por-cobrar-detalle") {
      navigate({ pathname: location.pathname, search: location.search }, { replace: true });
    }
  }, [location.hash, location.pathname, location.search, navigate]);

  useEffect(() => {
    if (!carteraModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeCarteraModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [carteraModalOpen, closeCarteraModal]);

  const closeKpiModal = useCallback(() => setKpiModalKind(null), []);

  const openFichaEnvio = useCallback((id: string, hint: { balanceAmount?: string; paidAmount?: string } | null = null) => {
    setFichaEnvioId(id);
    if (hint) {
      setFichaListHint(hint);
    } else {
      const r = rows.find((x) => x.id === id);
      if (r && (r.balanceAmount != null || r.paidAmount != null)) {
        setFichaListHint({ balanceAmount: r.balanceAmount, paidAmount: r.paidAmount });
      } else {
        setFichaListHint(null);
      }
    }
  }, [rows]);

  /** Campana de alertas u otros deep links: ?envio= abre la ficha en Inicio. */
  useEffect(() => {
    if (!envioParam?.trim()) return;
    const id = envioParam.trim();
    openFichaEnvio(id);
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        n.delete("envio");
        return n;
      },
      { replace: true }
    );
  }, [envioParam, openFichaEnvio, setSearchParams]);

  const dash = q.data;

  const activeTrips = useMemo(() => {
    const s = dash?.shipmentsByStatus;
    if (!s) return 0;
    return (s.confirmado ?? 0) + (s.recogido ?? 0) + (s.en_transito ?? 0);
  }, [dash]);

  const deliveredToday = useMemo(
    () => rows.filter((r) => r.status === "entregado" && isToday(r.deliveredAt)).length,
    [rows],
  );
  const delayedCount = useMemo(
    () => rows.filter((r) => isDelayed(r.status, r.scheduledDelivery)).length,
    [rows]
  );

  const driverMsgCount48h = useMemo(() => {
    const data = supportBadgeQ.data;
    if (!data) return 0;
    const since = Date.now() - 48 * 3600 * 1000;
    return data.filter(
      (m) => m.author?.role === "conductor" && new Date(m.createdAt).getTime() >= since
    ).length;
  }, [supportBadgeQ.data]);

  const activosByDriverId = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      if (r.status !== "confirmado" && r.status !== "recogido" && r.status !== "en_transito") continue;
      const id = r.driver?.id;
      if (!id) continue;
      m.set(id, (m.get(id) ?? 0) + 1);
    }
    return m;
  }, [rows]);
  const pendingCount = useMemo(() => {
    const cp = dash?.cobrosPendientes as
      | (Dashboard["cobrosPendientes"] & { cantidadEnvíos?: number })
      | undefined;
    return cp?.cantidadEnvios ?? cp?.cantidadEnvíos ?? 0;
  }, [dash]);

  const pendingAmount = useMemo(() => {
    const cp = dash?.cobrosPendientes as
      | (Dashboard["cobrosPendientes"] & { sumaMontosEnvíos?: string })
      | undefined;
    return cp?.sumaMontosEnvios ?? cp?.sumaMontosEnvíos ?? "0";
  }, [dash]);

  const carteraDeudores = useMemo(() => (dash?.cobrosPendientes?.deudores ?? []), [dash]);

  const solicitudesPendientesCount = useMemo(() => {
    return rows.filter((r) => r.status === "pendiente").length;
  }, [rows]);

  /** Compromisos de entrega: hoy y próximos días (sin reemplazar KPIs ni la campana). */
  const dueTodayRows = useMemo(() => {
    return rows
      .filter((r) => {
        if (r.status === "entregado" || r.status === "rechazado") return false;
        if (!r.scheduledDelivery) return false;
        return isToday(r.scheduledDelivery);
      })
      .sort((a, b) => {
        const ta = a.scheduledDelivery ? new Date(a.scheduledDelivery).getTime() : 0;
        const tb = b.scheduledDelivery ? new Date(b.scheduledDelivery).getTime() : 0;
        return ta - tb;
      });
  }, [rows]);

  const dueUpcomingWeekRows = useMemo(() => {
    const startTomorrow = new Date();
    startTomorrow.setDate(startTomorrow.getDate() + 1);
    startTomorrow.setHours(0, 0, 0, 0);
    const endWindow = new Date();
    endWindow.setDate(endWindow.getDate() + 8);
    endWindow.setHours(23, 59, 59, 999);
    return rows
      .filter((r) => {
        if (r.status === "entregado" || r.status === "rechazado") return false;
        if (!r.scheduledDelivery) return false;
        if (isToday(r.scheduledDelivery)) return false;
        const t = new Date(r.scheduledDelivery).getTime();
        return t >= startTomorrow.getTime() && t <= endWindow.getTime();
      })
      .sort((a, b) => {
        const ta = a.scheduledDelivery ? new Date(a.scheduledDelivery).getTime() : 0;
        const tb = b.scheduledDelivery ? new Date(b.scheduledDelivery).getTime() : 0;
        return ta - tb;
      });
  }, [rows]);

  const activeRows = useMemo(() => {
    const f = rows.filter(
      (r) => r.status === "confirmado" || r.status === "recogido" || r.status === "en_transito"
    );
    return [...f].sort((a, b) => {
      const ta = a.scheduledDelivery ? new Date(a.scheduledDelivery).getTime() : Number.POSITIVE_INFINITY;
      const tb = b.scheduledDelivery ? new Date(b.scheduledDelivery).getTime() : Number.POSITIVE_INFINITY;
      return ta - tb;
    });
  }, [rows]);

  const { markers, routes } = useMemo(() => buildMapMarkersAndRoutesForRows(activeRows), [activeRows]);

  const mapaFloatSourceRows = activeRows;

  const { markers: mapaFloatMarkers, routes: mapaFloatRoutes } = useMemo(
    () => buildMapMarkersAndRoutesForRows(mapaFloatSourceRows),
    [mapaFloatSourceRows]
  );

  const mapFocusTarget = useMemo(() => {
    if (!mapFocusShipmentId) return null;
    const r = rows.find((x) => x.id === mapFocusShipmentId);
    return r ? mapFocusTargetForShipment(r) : null;
  }, [mapFocusShipmentId, rows]);

  const focusedRow = mapFocusShipmentId ? rows.find((x) => x.id === mapFocusShipmentId) : undefined;
  const focusedHasDriverGps = Boolean(focusedRow && num(focusedRow.lastLat) !== null && num(focusedRow.lastLng) !== null);

  function toggleMapFocusForRow(id: string) {
    setMapFocusShipmentId((prev) => (prev === id ? null : id));
  }

  useEffect(() => {
    if (!mapFocusShipmentId) return;
    if (!rows.some((r) => r.id === mapFocusShipmentId)) {
      setMapFocusShipmentId(null);
    }
  }, [rows, mapFocusShipmentId]);

  const openMapaTodasLasRutas = useCallback(() => {
    setMapFocusShipmentId(null);
    setMapaFloatOpen(true);
  }, []);

  if (q.isLoading) {
    return <p className="p-4 text-sm text-slate-500">Cargando métricas…</p>;
  }
  if (q.isError) {
    return <p className="p-4 text-sm text-rose-600">{(q.error as Error).message}</p>;
  }
  if (!dash) {
    return null;
  }

  const d = dash;

  return (
    <div className="space-y-4">
      <header className="page-header">
        <h1 className="text-xl font-semibold">Control del día</h1>
        <p className="text-sm text-blue-100">
          Pedidos, plazos y cobros en un solo lugar (menos Excel y menos WhatsApp). El mapa y la lista se actualizan solos cada ~30
          s.{" "}
          <button
            type="button"
            className="font-semibold text-white underline decoration-white/80 underline-offset-2 hover:decoration-white"
            onClick={openMapaTodasLasRutas}
          >
            Abrir mapa en panel
          </button>
          .
        </p>
      </header>

      {shipmentsQ.isError ? (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
          No pudimos cargar los envíos para el mapa y las tablas. Reintentá en unos segundos o contactá soporte si el problema continúa.
        </p>
      ) : null}

      <div
        className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200/80 bg-slate-50/80 px-2 py-2"
        role="toolbar"
        aria-label="Alertas y equipo: comprobantes, conductores, flota, clientes"
      >
        {d.comprobantesPendientes.hoy.total > 0 ? (
          <button
            type="button"
            onClick={() => setComprobantesModalOpen(true)}
            className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-950 shadow-sm ring-1 ring-amber-900/5 hover:bg-amber-100/90"
          >
            Comprobantes <span className="tabular-nums">({d.comprobantesPendientes.hoy.total})</span>
          </button>
        ) : null}
        <div className="inline-flex items-center gap-0.5 rounded-full border border-slate-200 bg-white p-0.5 shadow-sm ring-1 ring-slate-900/5">
          <button
            type="button"
            onClick={() => setChoferesModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100"
            title="Conductores en ruta hoy y pedidos asignados"
            aria-label="Abrir conductores en ruta hoy"
          >
            <UsersRound className="h-4 w-4 shrink-0" aria-hidden />
            Conductor
          </button>
          <button
            type="button"
            onClick={() => setFlotaModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100"
            title="Flota: vehículos, patentes y asignación"
            aria-label="Abrir flota: vehículos, patentes y asignación a conductores"
          >
            <Car className="h-4 w-4 shrink-0" aria-hidden />
            Flota
          </button>
          <Link
            to="/admin/clientes"
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100"
            title="Pedidos y cobros por cliente"
            aria-label="Ir a clientes"
          >
            <Building2 className="h-4 w-4 shrink-0" aria-hidden />
            Clientes
          </Link>
          <Link
            to="/admin/envios"
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100"
            title="Tabla completa de envíos"
            aria-label="Ir a envíos en tabla"
          >
            <Car className="h-4 w-4 shrink-0" aria-hidden />
            Tabla envíos
          </Link>
        </div>
        <button
          type="button"
          onClick={() => setMensajesModalOpen(true)}
          className="inline-flex items-center gap-1 rounded-full border border-cyan-200 bg-cyan-50/90 px-3 py-1.5 text-xs font-semibold text-cyan-950 shadow-sm ring-1 ring-cyan-900/5 hover:bg-cyan-100/80"
        >
          Mensajes
          {driverMsgCount48h > 0 ? (
            <span className="rounded-full bg-cyan-800 px-1.5 py-0.5 text-[10px] text-white" title="Mensajes de chofer, últimas 48 h">
              {driverMsgCount48h}
            </span>
          ) : null}
        </button>
      </div>

      <section className="space-y-4" aria-labelledby="dash-pedidos-plazos">
        <h2 id="dash-pedidos-plazos" className="text-base font-semibold text-slate-900">
          Pedidos y plazos
        </h2>
        <p className="-mt-2 text-xs text-slate-600">
          Lo que antes controlabas en la cabeza o por chat: pedidos abiertos, fechas comprometidas y retrasos.
        </p>

        {!shipmentsQ.isError && solicitudesPendientesCount > 0 ? (
          <div
            className="flex flex-col gap-2 rounded-xl border-2 border-violet-300/90 bg-violet-50/95 p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between"
            role="status"
          >
            <p className="text-sm font-medium text-violet-950">
              <strong className="tabular-nums">{solicitudesPendientesCount}</strong>{" "}
              {solicitudesPendientesCount === 1
                ? "solicitud sin aprobar o cotizar."
                : "solicitudes sin aprobar o cotizar."}
            </p>
            <button
              type="button"
              className="shrink-0 rounded-lg bg-violet-800 px-4 py-2 text-center text-xs font-semibold text-white shadow hover:bg-violet-700"
              onClick={() => setKpiModalKind("solicitudes")}
            >
              Ver listado
            </button>
          </div>
        ) : null}

        {!shipmentsQ.isError && (dueTodayRows.length > 0 || dueUpcomingWeekRows.length > 0 || delayedCount > 0) ? (
          <div className="rounded-xl border border-sky-200/90 bg-sky-50/50 p-3 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-sky-950">Hoy y los próximos días</h3>
              {delayedCount > 0 ? (
                <button
                  type="button"
                  className="rounded-full bg-orange-100 px-2.5 py-1 text-[11px] font-semibold text-orange-950 ring-1 ring-orange-300/60 hover:bg-orange-200/80"
                  onClick={() => setKpiModalKind("retrasos")}
                >
                  {delayedCount} vencida{delayedCount === 1 ? "" : "s"}
                </button>
              ) : null}
            </div>
            {dueTodayRows.length > 0 ? (
              <div className="mt-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-sky-900/90">Entrega comprometida hoy</p>
                <ul className="mt-1 divide-y divide-sky-100 rounded-lg border border-sky-100 bg-white/90">
                  {dueTodayRows.slice(0, 6).map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        className="flex w-full flex-col gap-0.5 px-3 py-2 text-left text-xs hover:bg-sky-50/80"
                        onClick={() => openFichaEnvio(r.id)}
                      >
                        <span className="font-medium text-slate-900">
                          {r.origin} → {r.destination}
                        </span>
                        <span className="text-[11px] text-slate-600">
                          {r.customer.name}
                          {isDelayed(r.status, r.scheduledDelivery) ? (
                            <span className="ml-1 font-semibold text-orange-800"> · Hora pasada</span>
                          ) : null}
                          {r.scheduledDelivery ? (
                            <span className="tabular-nums">
                              {" "}
                              · {new Date(r.scheduledDelivery).toLocaleString("es-CL", { timeStyle: "short" })}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-2 text-[11px] text-sky-900/80">Nada con entrega <strong>hoy</strong> en agenda.</p>
            )}
            {dueUpcomingWeekRows.length > 0 ? (
              <div className="mt-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-sky-900/90">Próximos 7 días</p>
                <ul className="mt-1 divide-y divide-sky-100 rounded-lg border border-sky-100 bg-white/90">
                  {dueUpcomingWeekRows.slice(0, 6).map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        className="flex w-full flex-col gap-0.5 px-3 py-2 text-left text-xs hover:bg-sky-50/80"
                        onClick={() => openFichaEnvio(r.id)}
                      >
                        <span className="font-medium text-slate-900">
                          {r.origin} → {r.destination}
                        </span>
                        <span className="text-[11px] text-slate-600">
                          {r.customer.name}
                          {r.scheduledDelivery ? (
                            <span className="tabular-nums">
                              {" "}
                              · {new Date(r.scheduledDelivery).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" })}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <p className="mt-2 text-[10px] text-sky-800/80">
              Tip: el detalle completo de cada cliente está en <strong>Clientes</strong> (menú o barra de arriba).
            </p>
          </div>
        ) : null}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <KpiButton
          title="Solicitudes"
          shortTitle="A aprobar"
          hint={DASHBOARD_KPI_HINTS.solicitudes}
          value={String(solicitudesPendientesCount)}
          tone="violet"
          onOpen={() => setKpiModalKind("solicitudes")}
        />
        <KpiButton
          title="Confirmados"
          shortTitle="Confirm."
          hint={DASHBOARD_KPI_HINTS.confirmados}
          value={String(d.shipmentsByStatus.confirmado ?? 0)}
          tone="blue"
          onOpen={() => setKpiModalKind("confirmados")}
        />
        <KpiButton
          title="Viajes en curso"
          shortTitle="En curso"
          hint={DASHBOARD_KPI_HINTS.viajesEnCurso}
          value={String(activeTrips)}
          tone="cyan"
          onOpen={() => setKpiModalKind("en_curso")}
        />
        <KpiButton
          title="Entregas hoy"
          shortTitle="Hoy"
          hint={DASHBOARD_KPI_HINTS.entregasHoy}
          value={String(deliveredToday)}
          tone="green"
          onOpen={() => setKpiModalKind("entregas_hoy")}
        />
        <KpiButton
          title="Entregas vencidas"
          shortTitle="Vencidas"
          hint={DASHBOARD_KPI_HINTS.entregasVencidas}
          value={String(delayedCount)}
          tone="orange"
          onOpen={() => setKpiModalKind("retrasos")}
        />
      </div>

      <section>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <h2 className="text-sm font-semibold text-amber-900">Entregas de hoy a completar</h2>
          <p className="mt-1 text-xs leading-snug text-amber-950/95">
            Programadas para hoy aún abiertas, o entregadas <strong>sin nombre de receptor</strong>. El resto (solicitudes, comprobantes,
            retrasos) se accede con los recuadros e iconos de arriba.
          </p>
          <button
            type="button"
            onClick={() => setKpiModalKind("entregas_hoy_revision")}
            className="mt-3 w-full rounded-lg bg-amber-900 px-3 py-1.5 text-center text-xs font-semibold text-amber-50 shadow-sm ring-1 ring-amber-950/20 hover:bg-amber-800 sm:w-auto"
          >
            Ver listado
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <RouteMap
          title={`Rutas activas (${activeRows.length})`}
          markers={markers}
          routes={routes}
          heightClass="h-72"
          mapFocus={mapFocusTarget}
        />
        {mapFocusShipmentId && focusedRow ? (
          <p className="mt-2 text-[11px] text-slate-600">
            {mapFocusTarget ? (
              focusedHasDriverGps ? (
                <>Mapa centrado en la <strong>última posición del chofer</strong> de este envío.</>
              ) : (
                <>
                  Aún <strong>sin GPS del chofer</strong>: el mapa se centra entre origen y destino (o en el punto disponible).
                </>
              )
            ) : (
              <>Este envío no tiene coordenadas para centrar el mapa.</>
            )}
          </p>
        ) : null}
        {activeRows.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500">
            No hay envíos en curso (confirmado, recogido o en tránsito). Cuando haya, aparecerán en el mapa y en la lista de abajo.
          </p>
        ) : markers.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500">
            Hay envíos activos pero sin puntos en el mapa todavía. Las coordenadas se calculan al geocodificar origen/destino; podés
            abrir la ficha de un envío para forzar el trazado.
          </p>
        ) : null}
        {activeRows.length > 0 ? (
          <div className="mt-3 border-t border-slate-100 pt-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Rutas activas (lista)</h3>
            <p className="mt-1 text-[11px] text-slate-500">
              Tocá ruta o cliente para <strong>ficha de envío</strong>. <strong>Centrar en mapa</strong> ajusta el mapa a la señal del
              chofer; tocá de nuevo para el visto general.
            </p>
            <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-slate-50/50">
              {activeRows.map((r) => {
                const selected = mapFocusShipmentId === r.id;
                const hasGps = num(r.lastLat) !== null && num(r.lastLng) !== null;
                return (
                  <li
                    key={r.id}
                    className={`flex flex-col gap-1.5 px-3 py-2.5 text-sm sm:flex-row sm:items-start sm:justify-between sm:gap-2 ${
                      selected ? "bg-blue-50/90 ring-1 ring-inset ring-blue-200" : ""
                    }`}
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 rounded-lg text-left hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                      onClick={() => openFichaEnvio(r.id)}
                    >
                      <p className="font-medium text-slate-900">
                        {r.origin} → {r.destination}
                      </p>
                      <p className="text-xs text-slate-600">
                        {r.customer.name}
                        {r.scheduledDelivery ? (
                          <>
                            {" "}
                            · Entrega:{" "}
                            <span className="tabular-nums">
                              {new Date(r.scheduledDelivery).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" })}
                            </span>
                          </>
                        ) : null}
                        {hasGps ? (
                          <span className="ml-1 text-emerald-700">· Con señal GPS</span>
                        ) : (
                          <span className="ml-1 text-amber-800">· Sin señal GPS aún</span>
                        )}
                      </p>
                    </button>
                    <div className="flex shrink-0 flex-col items-stretch gap-1.5 sm:items-end">
                      <span className="self-start rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200 sm:self-end">
                        {activeRouteStatusLabel(r.status)}
                      </span>
                      <button
                        type="button"
                        className="whitespace-nowrap rounded-lg border border-blue-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-blue-900 hover:bg-blue-50"
                        onClick={() => toggleMapFocusForRow(r.id)}
                      >
                        Centrar en mapa
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </section>

      </section>

      <section className="space-y-3" aria-labelledby="dash-cobros">
        <h2 id="dash-cobros" className="text-base font-semibold text-slate-900">
          Cobros al día
        </h2>
        <p className="-mt-2 text-xs text-slate-600">Saldos pendientes e ingresos del mes (lo que antes anotabas aparte).</p>
        <div className="rounded-xl border border-slate-200/80 bg-gradient-to-br from-amber-50/90 via-white to-emerald-50/60 p-3 shadow-sm ring-1 ring-slate-200/40">
          <div className="mb-2 flex items-start justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-800">Cartera e ingresos del mes</h3>
            <AdminPrivacyToggle />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="h-full min-h-0 min-w-0">
              <InfoCard
                variant="cartera"
                onClick={() => setCarteraModalOpen(true)}
                title="Cartera por cobrar"
                linkLabel="Cartera por cobrar: abrir listado de saldos en ventana"
                value={maskSensitiveAmount(sensitiveHidden, String(pendingAmount))}
                note={
                  sensitiveHidden
                    ? "* envíos con saldo real pendiente"
                    : `${pendingCount} envíos con saldo real pendiente`
                }
              />
            </div>
            <div className="h-full min-h-0 min-w-0">
              <InfoCard
                variant="ingresos"
                onClick={() => setCajaModalOpen(true)}
                title="Ingresos aprobados del mes"
                linkLabel="Ingresos y caja del mes: abrir resumen (ingresos, egresos, utilidad) en panel"
                value={maskSensitiveAmount(sensitiveHidden, String(d.ingresosRegistradosMes.total))}
                note={
                  sensitiveHidden
                    ? "Comprobantes por validar: *"
                    : `Comprobantes por validar: ${d.comprobantesPendientes.hoy.total} (tocá arriba o chip Comprobantes)`
                }
              />
            </div>
          </div>
        </div>
      </section>

      <details className="group rounded-xl border border-indigo-200 bg-white p-4 shadow-sm open:ring-1 open:ring-indigo-100">
        <summary className="cursor-pointer list-none text-sm font-semibold text-slate-800 marker:content-none [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center gap-2">
            Análisis opcional: duración retiro → entrega
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 group-open:hidden">
              Mostrar
            </span>
          </span>
        </summary>
        <p className="mt-2 text-xs text-slate-500">
          Solo envíos <strong>entregados</strong> con <strong>retiro y entrega</strong> registrados. Eje: día de la entrega (promedio en
          horas).
        </p>
        {durationBars.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500">
            No hay datos: necesitás envíos en estado <strong>entregado</strong> con <strong>fecha de retiro</strong> y{" "}
            <strong>fecha de entrega</strong> cargadas (el flujo normal al pasar por recogido y cerrar entrega).
          </p>
        ) : (
          <>
            <p className="mt-2 text-[11px] text-slate-600">
              {durationBarsShipmentCount} envío{durationBarsShipmentCount === 1 ? "" : "s"} en {durationBars.length} día
              {durationBars.length === 1 ? "" : "s"} (promedio de horas sobre cada barra).
            </p>
            <div className="mt-2 flex min-h-[132px] items-end gap-1.5 border-b border-l border-slate-200 pl-1 pb-0.5">
              {durationBars.map((p) => {
                const maxH = durationBars.reduce((m, x) => Math.max(m, x.avgHours), 0.01);
                const barPx = Math.max(6, Math.round((p.avgHours / maxH) * 104));
                return (
                  <div key={p.key} className="flex min-w-0 flex-1 flex-col items-center gap-0.5">
                    <span className="text-[10px] font-semibold tabular-nums text-slate-700" title={`${p.label}: ${p.n} envío(s)`}>
                      {p.avgHours.toFixed(1)} h
                    </span>
                    <div
                      className="w-full max-w-[22px] rounded-t bg-indigo-500"
                      style={{ height: barPx }}
                      title={`${p.label}: promedio ${p.avgHours.toFixed(1)} h · ${p.n} envío(s)`}
                    />
                    <span className="max-w-full truncate text-center text-[9px] leading-tight text-slate-500">{p.shortLabel}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </details>

      {carteraModalOpen ? (
        <div
          className="fixed inset-0 z-[86] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="dashboard-cartera-modal-title"
          onClick={closeCarteraModal}
        >
          <div
            className="flex min-h-0 max-h-[min(90vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:max-h-[min(85vh,640px)] sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2 border-b border-slate-200 px-4 py-3">
              <h2 id="dashboard-cartera-modal-title" className="text-base font-semibold text-slate-800">
                Cartera por cobrar
              </h2>
              <button
                type="button"
                className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                onClick={closeCarteraModal}
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              <p className="mb-3 text-[11px] text-slate-500">
                Saldo abierto por envío (total menos pagos <strong>aprobados</strong>). Tocá un envío para abrir su ficha; la{" "}
                <strong>campana</strong> (junto a búsqueda) avisa novedades. En Inicio, el <strong>ojo</strong> al lado de «Cartera e
                ingresos del mes» oculta los montos de esos resúmenes.
              </p>
              <div className="space-y-2">
                {carteraDeudores.map((row) => (
                  <div
                    key={row.shipmentId}
                    className="flex flex-col gap-2 rounded border border-slate-200 px-3 py-2 text-xs sm:flex-row sm:items-stretch sm:justify-between sm:gap-2"
                  >
                    <button
                      type="button"
                      onClick={() => openFichaEnvio(row.shipmentId, { balanceAmount: row.balance, paidAmount: row.paid })}
                      className="min-w-0 flex-1 rounded-lg text-left transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                    >
                      <p className="font-semibold text-slate-800">
                        {row.customer} ·{" "}
                        <span className="tabular-nums text-slate-900">{fmtDashboardClp(row.balance)}</span> pendiente
                      </p>
                      <p className="text-slate-600">{row.route}</p>
                      <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                        <span className="inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 font-semibold text-indigo-950">
                          Etapa: {shipmentEtapaLabel(row.status)}
                        </span>
                      </p>
                      {row.paymentStatus ? (
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          Cobro:{" "}
                          <span className="font-medium text-slate-700">{paymentStatusLabel(row.paymentStatus)}</span>
                        </p>
                      ) : null}
                    </button>
                    <div className="flex shrink-0 flex-col justify-center gap-2 sm:items-end">
                      <button
                        type="button"
                        className="inline-flex w-full min-w-[10rem] items-center justify-center rounded-lg border border-amber-300/90 bg-amber-50/80 px-3 py-1.5 text-center text-xs font-semibold text-amber-950 hover:bg-amber-100/80 sm:w-auto"
                        title="Registrar el cobro de este envío en un panel flotante"
                        onClick={() => setCarteraPagoTarget({ shipmentId: row.shipmentId, balanceHint: row.balance })}
                      >
                        Registrar pago
                      </button>
                    </div>
                  </div>
                ))}
                {carteraDeudores.length === 0 ? (
                  <p className="text-xs text-slate-500">Sin saldos pendientes por envío.</p>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <DashboardKpiModal
        kind={kpiModalKind}
        onClose={closeKpiModal}
        rows={rows}
        onOpenFicha={(id) => {
          openFichaEnvio(id);
          closeKpiModal();
        }}
      />
      <ResponsiveShipmentDetail
        open={!!fichaEnvioId}
        shipmentId={fichaEnvioId}
        listHint={fichaListHint}
        onClose={() => {
          setFichaEnvioId(null);
          setFichaListHint(null);
        }}
        onRegistrarCobro={(t: RegistrarCobroServiceTarget) => {
          setCarteraPagoTarget(t);
          setFichaEnvioId(null);
          setFichaListHint(null);
        }}
      />
      <DashboardMapaOperativoFloat
        open={mapaFloatOpen}
        onClose={() => {
          setMapaFloatOpen(false);
          setMapFocusShipmentId(null);
        }}
        title={`Rutas activas en mapa (${activeRows.length})`}
        singleServiceMode={false}
        markers={mapaFloatMarkers}
        routes={mapaFloatRoutes}
        mapFocus={mapFocusTarget}
        mapFocusShipmentId={mapFocusShipmentId}
        activeRows={mapaFloatSourceRows}
        focusedHasDriverGps={focusedHasDriverGps}
        onToggleMapFocus={toggleMapFocusForRow}
        onOpenFicha={(id) => openFichaEnvio(id)}
        statusLabel={activeRouteStatusLabel}
      />
      <DashboardCajaModal
        open={cajaModalOpen}
        onClose={() => setCajaModalOpen(false)}
        ingresos={d.ingresosRegistradosMes.total}
        egresos={d.egresosRegistradosMes?.total ?? "0"}
        utilidad={d.utilidadOperativaMes ?? "0"}
        movIngresos={d.ingresosRegistradosMes.movimientos ?? 0}
        movEgresos={d.egresosRegistradosMes?.movimientos ?? 0}
      />
      <DashboardComprobantesModal
        open={comprobantesModalOpen}
        onClose={() => setComprobantesModalOpen(false)}
        rows={d.comprobantesPendientes.hoy.rows ?? []}
      />
      <DashboardChoferesModal
        open={choferesModalOpen}
        onClose={() => setChoferesModalOpen(false)}
        activosByDriverId={activosByDriverId}
        dashboardShipments={rows}
        onOpenFicha={(id) => {
          openFichaEnvio(id);
          setChoferesModalOpen(false);
        }}
      />
      <DashboardFlotaModal open={flotaModalOpen} onClose={() => setFlotaModalOpen(false)} />
      <DashboardMensajesModal open={mensajesModalOpen} onClose={() => setMensajesModalOpen(false)} />
      <RegistrarCobroServiceModal
        open={!!carteraPagoTarget}
        target={carteraPagoTarget}
        onClose={() => setCarteraPagoTarget(null)}
      />
    </div>
  );
}

function KpiButton({
  title,
  shortTitle,
  hint,
  value,
  tone,
  onOpen,
}: {
  title: string;
  /** Texto en pantallas angostas (evita 2 líneas en el recuadro). */
  shortTitle: string;
  hint: string;
  value: string;
  tone: "violet" | "blue" | "cyan" | "green" | "orange";
  onOpen: () => void;
}) {
  const tones = {
    violet: "bg-violet-700",
    blue: "bg-blue-700",
    cyan: "bg-cyan-700",
    green: "bg-emerald-700",
    orange: "bg-orange-600",
  };
  return (
    <button
      type="button"
      title={hint}
      onClick={onOpen}
      className={`w-full min-h-[4.5rem] rounded-xl ${tones[tone]} p-2.5 text-left text-white shadow transition hover:brightness-110 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 sm:min-h-[5.25rem] sm:p-3`}
    >
      <p className="text-[10px] leading-tight text-white/90 sm:text-xs">
        <span className="sm:hidden">{shortTitle}</span>
        <span className="hidden sm:inline">{title}</span>
      </p>
      <p className="mt-0.5 text-xl font-bold tabular-nums sm:text-2xl">{value}</p>
      <p className="mt-1 line-clamp-2 text-[9px] text-white/70 sm:line-clamp-none sm:text-[10px]">Clic: panel detalle</p>
    </button>
  );
}

const INFO_CARD_VARIANT = {
  /** Pendiente de cobro: tono alerta / atención. */
  cartera: {
    shell:
      "border-amber-300/90 bg-gradient-to-br from-amber-50 via-orange-50/95 to-amber-100/40 shadow-amber-900/5 hover:border-amber-400 hover:shadow-md hover:shadow-amber-900/10 focus-visible:ring-amber-500",
    title: "text-amber-950",
    value: "text-amber-950",
    note: "text-amber-900/80",
    cta: "text-amber-900 font-semibold",
  },
  /** Dinero ya reconocido: tono “en cuenta” / positivo. */
  ingresos: {
    shell:
      "border-emerald-300/90 bg-gradient-to-br from-emerald-50 via-teal-50/90 to-emerald-100/35 shadow-emerald-900/5 hover:border-emerald-400 hover:shadow-md hover:shadow-emerald-900/10 focus-visible:ring-emerald-600",
    title: "text-emerald-950",
    value: "text-emerald-950",
    note: "text-emerald-900/80",
    cta: "text-emerald-800 font-semibold",
  },
} as const;

function InfoCard({
  variant,
  to,
  onClick,
  title,
  value,
  note,
  linkLabel,
}:
  | {
      variant: keyof typeof INFO_CARD_VARIANT;
      to: string;
      onClick?: undefined;
      title: string;
      value: string;
      note: string;
      linkLabel: string;
    }
  | {
      variant: keyof typeof INFO_CARD_VARIANT;
      to?: undefined;
      onClick: () => void;
      title: string;
      value: string;
      note: string;
      linkLabel: string;
    }) {
  const v = INFO_CARD_VARIANT[variant];
  const className = `w-full min-h-0 min-w-0 text-left ${INFO_CARD_BASE} ${v.shell}`;
  const inner = (
    <>
      <h3 className={`text-[11px] font-semibold leading-tight sm:text-sm ${v.title}`}>{title}</h3>
      <p className={`mt-1 break-words text-lg font-bold tabular-nums sm:text-2xl ${v.value}`}>{value}</p>
      <p className={`mt-auto pt-2 text-[10px] leading-snug sm:text-xs ${v.note}`}>{note}</p>
      <span className={`mt-1.5 text-[10px] sm:text-[11px] ${v.cta}`}>Ver detalle →</span>
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className} aria-label={linkLabel}>
        {inner}
      </button>
    );
  }
  return (
    <Link to={to} className={className} aria-label={linkLabel}>
      {inner}
    </Link>
  );
}

const INFO_CARD_BASE =
  "flex h-full min-h-[7.5rem] min-w-0 flex-col rounded-xl border p-2.5 shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-offset-2 sm:p-3";

function fmtDashboardClp(value: string | number): string {
  const n = typeof value === "string" ? Number(value.replace(/\s/g, "").replace(",", ".")) : value;
  if (!Number.isFinite(n)) return String(value);
  return n.toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
}

function activeRouteStatusLabel(status: string): string {
  switch (status) {
    case "confirmado":
      return "Confirmado";
    case "recogido":
      return "Recogido";
    case "en_transito":
      return "En tránsito";
    default:
      return status;
  }
}

function paymentStatusLabel(status: string): string {
  const s = status.toLowerCase();
  if (s === "pendiente") return "Pendiente";
  if (s === "parcial") return "Pago parcial";
  if (s === "pagado") return "Pagado";
  return status;
}

function shipmentEtapaLabel(status: string | undefined): string {
  if (!status) return "—";
  switch (status) {
    case "pendiente":
      return "Pendiente aprobación";
    case "confirmado":
      return "Confirmado / listo para operar";
    case "recogido":
      return "Carga recogida";
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

function isDelayed(status: string, scheduledDelivery?: string | null) {
  if (!scheduledDelivery) return false;
  if (status === "entregado" || status === "rechazado") return false;
  return Date.now() > new Date(scheduledDelivery).getTime();
}

function isToday(value?: string | null) {
  if (!value) return false;
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function buildDurationByDaySeries(rows: ShipmentRow[]): Array<{
  key: string;
  label: string;
  shortLabel: string;
  avgHours: number;
  n: number;
}> {
  const map = new Map<string, { sumH: number; n: number; sample: Date }>();
  for (const r of rows) {
    const picked = r.pickedUpAt ?? (r as unknown as { picked_up_at?: string | null }).picked_up_at;
    const delivered = r.deliveredAt ?? (r as unknown as { delivered_at?: string | null }).delivered_at;
    if (r.status !== "entregado" || !delivered || !picked) continue;
    const t0 = new Date(picked as string).getTime();
    const t1 = new Date(delivered as string).getTime();
    if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 <= t0) continue;
    const hours = (t1 - t0) / 3600000;
    const d = new Date(r.deliveredAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const cur = map.get(key) ?? { sumH: 0, n: 0, sample: d };
    cur.sumH += hours;
    cur.n += 1;
    map.set(key, cur);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-14)
    .map(([key, v]) => {
      const d = v.sample;
      return {
        key,
        label: d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }),
        shortLabel: d.toLocaleDateString("es-CL", { day: "numeric", month: "short" }),
        avgHours: v.sumH / v.n,
        n: v.n,
      };
    });
}
