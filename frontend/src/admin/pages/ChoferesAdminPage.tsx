import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { LayoutDashboard, Search, Truck, UsersRound, Trash2, X } from "lucide-react";
import { apiGet, apiSend } from "../../api/client.js";
import { formatPhoneCL } from "../../lib/contact.js";
import { notify } from "../../lib/notify.js";

type DriverRow = {
  id: string;
  fullName: string;
  taxId?: string | null;
  phone?: string | null;
  licenseNumber?: string | null;
  status?: string | null;
  /** Incluye `status` (disponible | asignado | en_taller) según API. */
  assignedVehicle?: { id: string; plate: string; status: string } | null;
  user?: { email: string } | null;
};

/** Agrupa el estado operativo para colores en lista y ficha. */
function driverOperationalKind(d: DriverRow): "sin_unidad" | "con_unidad" | "unidad_taller" {
  const v = d.assignedVehicle;
  if (!v) return "sin_unidad";
  if (v.status === "en_taller") return "unidad_taller";
  return "con_unidad";
}

const listRowStyles: Record<
  "sin_unidad" | "con_unidad" | "unidad_taller",
  { bar: string; bgIdle: string; label: string; labelClass: string }
> = {
  sin_unidad: {
    bar: "border-l-4 border-l-amber-500",
    bgIdle: "bg-amber-50/80 hover:bg-amber-100/90",
    label: "Sin unidad",
    labelClass: "bg-amber-100/95 text-amber-950 ring-1 ring-amber-300/60",
  },
  con_unidad: {
    bar: "border-l-4 border-l-emerald-600",
    bgIdle: "bg-emerald-50/80 hover:bg-emerald-100/90",
    label: "Con unidad",
    labelClass: "bg-emerald-100/95 text-emerald-950 ring-1 ring-emerald-400/50",
  },
  unidad_taller: {
    bar: "border-l-4 border-l-rose-500",
    bgIdle: "bg-rose-50/80 hover:bg-rose-100/90",
    label: "Unidad en taller",
    labelClass: "bg-rose-100/95 text-rose-950 ring-1 ring-rose-300/60",
  },
};

type ShipmentRow = {
  id: string;
  status: string;
  createdAt: string;
  driver?: { id: string; fullName: string } | null;
  origin: string;
  destination: string;
  customer: { name: string };
  vehicle?: { plate: string } | null;
  scheduledDelivery?: string | null;
  deliveredAt?: string | null;
};

export type ChoferesAdminPanelProps = {
  /**
   * Dentro de un modal (p. ej. inicio) — altura flexible para scroll en el contenedor.
   * En página completa se mantiene el mínimo operativo habitual.
   */
  embedded?: boolean;
  deleteDriverId: string | null;
  setDeleteDriverId: (id: string | null) => void;
  deleteDriver?: any;
};

export function ChoferesAdminPanel({ embedded = false, deleteDriverId: externalDeleteId, setDeleteDriverId: externalSetDeleteId }: ChoferesAdminPanelProps) {
  const qc = useQueryClient();
  const driversQ = useQuery({ queryKey: ["drivers"], queryFn: () => apiGet<DriverRow[]>("/drivers") });
  const drivers = driversQ.data ?? [];
  const [selectedDriverId, setSelectedDriverId] = useState<string>("");
  const [listQuery, setListQuery] = useState("");
  const [panelView, setPanelView] = useState<"resumen" | "nomina">("nomina");
  const [profileDriverId, setProfileDriverId] = useState<string | null>(null);
  const [shipmentFilter, setShipmentFilter] = useState<string>("todos");
  const deleteDriverId = externalDeleteId ?? null;
  const setDeleteDriverId = externalSetDeleteId ?? (() => {});

  const filteredDrivers = useMemo(() => {
    const q = listQuery.trim().toLowerCase();
    if (!q) return drivers;
    return drivers.filter((d) => {
      const name = d.fullName.toLowerCase();
      const plate = d.assignedVehicle?.plate?.toLowerCase() ?? "";
      const tax = d.taxId?.toLowerCase() ?? "";
      const phone = (d.phone ?? "").toLowerCase();
      return name.includes(q) || plate.includes(q) || tax.includes(q) || phone.includes(q);
    });
  }, [drivers, listQuery]);

  /** Si el filtro deja afuera al chofer elegido, pasar al primero de la grilla. */
  useEffect(() => {
    if (filteredDrivers.length === 0) return;
    if (selectedDriverId && filteredDrivers.some((d) => d.id === selectedDriverId)) return;
    setSelectedDriverId(filteredDrivers[0]!.id);
  }, [filteredDrivers, selectedDriverId]);

  const effectiveDriverId = selectedDriverId || filteredDrivers[0]?.id || "";

  const shipmentsQ = useQuery({
    queryKey: ["shipments", "driver", effectiveDriverId, shipmentFilter],
    queryFn: () => {
      const baseUrl = `/shipments?driverId=${encodeURIComponent(effectiveDriverId)}&take=400`;
      if (shipmentFilter === "todos") return apiGet<ShipmentRow[]>(baseUrl);
      return apiGet<ShipmentRow[]>(`${baseUrl}&status=${encodeURIComponent(shipmentFilter)}`);
    },
    enabled: !!effectiveDriverId,
  });

  const selected = drivers.find((d) => d.id === profileDriverId);
  const selectedShipments = shipmentsQ.data ?? [];

  const deleteDriver = useMutation({
    mutationFn: (id: string) => apiSend(`/drivers/${id}`, "DELETE"),
    onSuccess: () => {
      setDeleteDriverId(null);
      void qc.invalidateQueries({ queryKey: ["drivers"] });
      notify("success", "Conductor eliminado correctamente.");
    },
    onError: (e: Error) => {
      setError(e.message);
      setDeleteDriverId(null);
    },
  });

  const delivered = selectedShipments.filter((s) => s.status === "entregado").length;
  const active = selectedShipments.filter((s) =>
    ["confirmado", "recogido", "en_transito"].includes(s.status)
  ).length;
  const rejected = selectedShipments.filter((s) => s.status === "rechazado").length;
  const total = selectedShipments.length;
  const availability = selected?.assignedVehicle ? selected.assignedVehicle.plate : "Sin vehículo";
  const selectedKind = selected ? driverOperationalKind(selected) : null;
  const profileStripClass =
    selectedKind === "sin_unidad"
      ? "bg-gradient-to-r from-amber-200/90 to-amber-50"
      : selectedKind === "unidad_taller"
        ? "bg-gradient-to-r from-rose-200/90 to-rose-50"
        : selectedKind === "con_unidad"
          ? "bg-gradient-to-r from-emerald-200/90 to-emerald-50"
          : "";

  const sectionWrap =
    embedded === true
      ? "flex w-full min-w-0 min-h-0 flex-1 flex-col gap-4"
      : "flex min-h-[min(75vh,720px)] flex-col gap-4";
  const globalStats = useMemo(() => {
    const sinUnidad = drivers.filter((d) => driverOperationalKind(d) === "sin_unidad").length;
    const enTaller = drivers.filter((d) => driverOperationalKind(d) === "unidad_taller").length;
    const conPortal = drivers.filter((d) => Boolean(d.user?.email)).length;
    return { total: drivers.length, sinUnidad, enTaller, conPortal };
  }, [drivers]);

  return (
    <section className={sectionWrap}>
      <div className="shrink-0 space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <h2 className="text-sm font-bold tracking-tight text-slate-800">Nómina de choferes</h2>
          <div className="relative w-full sm:max-w-sm">
            <label className="sr-only" htmlFor="choferes-buscar">
              Buscar por nombre, patente o RUT
            </label>
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <input
              id="choferes-buscar"
              type="search"
              value={listQuery}
              onChange={(e) => setListQuery(e.target.value)}
              placeholder="Buscar nombre, patente, RUT…"
              autoComplete="off"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-200"
            />
          </div>
        </div>
              </div>

      <nav
        className="sticky top-2 z-20 rounded-xl border border-slate-200 bg-slate-100/95 p-1 shadow-sm backdrop-blur-md"
        role="tablist"
        aria-label="Vistas de gestión de choferes"
      >
        <div className="grid grid-cols-2 gap-1">
          {(
            [
              ["resumen", "Resumen", LayoutDashboard, globalStats.total] as const,
              ["nomina", "Nómina", UsersRound, filteredDrivers.length] as const,
            ] as const
          ).map(([tabId, label, Icon, badge]) => {
            const selectedTab = panelView === tabId;
            return (
              <button
                key={tabId}
                type="button"
                role="tab"
                aria-selected={selectedTab}
                className={`flex min-h-[3rem] flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-2 text-center text-[11px] font-semibold transition sm:flex-row sm:gap-2 sm:text-xs ${
                  selectedTab
                    ? "bg-white text-blue-800 shadow-sm ring-2 ring-blue-300/60"
                    : "text-slate-600 hover:bg-white/85 hover:text-slate-900"
                }`}
                onClick={() => setPanelView(tabId)}
              >
                <Icon className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
                <span className="leading-tight">{label}</span>
                <span className="rounded-full bg-blue-100 px-1.5 text-[10px] font-bold text-blue-900 tabular-nums">
                  {badge}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {panelView === "resumen" ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <button
              type="button"
              className="card border-l-4 border-blue-500 hover:bg-blue-50 transition-colors text-left"
              onClick={() => alert(`Choferes totales: ${globalStats.total}\n\nDetalle:\n• Total de conductores registrados en el sistema\n• Incluye conductores activos e inactivos`)}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Choferes totales</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{globalStats.total}</p>
            </button>
            <button
              type="button"
              className="card border-l-4 border-amber-500 hover:bg-amber-50 transition-colors text-left"
              onClick={() => alert(`Sin unidad: ${globalStats.sinUnidad}\n\nDetalle:\n• Conductores sin vehículo asignado\n• Disponibles para asignar a rutas\n• Requieren asignación en Flota`)}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Sin unidad</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{globalStats.sinUnidad}</p>
            </button>
            <button
              type="button"
              className="card border-l-4 border-rose-500 hover:bg-rose-50 transition-colors text-left"
              onClick={() => alert(`Unidad en taller: ${globalStats.enTaller}\n\nDetalle:\n• Conductores cuyo vehículo está en mantenimiento\n• No pueden realizar entregas\n• Requieren reparación del vehículo`)}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Unidad en taller</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{globalStats.enTaller}</p>
            </button>
            <button
              type="button"
              className="card border-l-4 border-emerald-500 hover:bg-emerald-50 transition-colors text-left"
              onClick={() => alert(`Con app activa: ${globalStats.conPortal}\n\nDetalle:\n• Conductores con acceso a la app móvil\n• Pueden recibir notificaciones\n• Tienen acceso al portal web`)}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Con app activa</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{globalStats.conPortal}</p>
            </button>
          </section>
          <section className="rounded-xl border border-slate-200/90 bg-slate-50/80 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="text-sm text-slate-700">
                Usá <strong>Nómina</strong> para abrir la ficha de cada chofer con KPIs, datos operativos y su historial.
              </p>
              <button type="button" className="btn-secondary btn-sm" onClick={() => setPanelView("nomina")}>
                Ir a nómina
              </button>
            </div>
          </section>
        </>
      ) : driversQ.isLoading ? (
        <p className="text-sm text-slate-500">Cargando nómina…</p>
      ) : driversQ.isError ? (
        <p className="text-sm text-rose-800">No se pudo cargar la lista de choferes.</p>
      ) : drivers.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          Todavía no hay choferes. Creálos y asigná unidades desde <strong>Flota</strong> en Inicio.
        </p>
      ) : (
        <div className="grid min-h-0 w-full min-w-0 flex-1 grid-cols-1 gap-2 lg:grid-cols-12 lg:items-stretch">
          <div className="min-h-0 lg:col-span-4">
            {filteredDrivers.length === 0 ? (
              <p className="py-4 text-sm text-slate-500">Ningún chofer coincide con la búsqueda.</p>
            ) : (
              <ul className="grid max-h-[min(50vh,420px)] gap-3 overflow-y-auto overscroll-contain pr-0.5 sm:grid-cols-2 sm:max-h-[min(56vh,480px)] lg:max-h-none lg:grid-cols-1">
                {filteredDrivers.map((d) => {
                  const kind = driverOperationalKind(d);
                  const st = listRowStyles[kind];
                  const portalOk = !!d.user?.email;
                  return (
                    <li key={d.id} className="min-w-0">
                      <button
                        type="button"
                        onClick={() => setProfileDriverId(d.id)}
                        className={[
                          "w-full rounded-xl border bg-gradient-to-b from-white to-slate-50/90 p-3.5 text-left shadow-sm ring-1 ring-slate-100 transition",
                          st.bar,
                        ].join(" ")}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex items-start gap-2">
                            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                              <Truck className="h-4 w-4" aria-hidden />
                            </span>
                            <div className="min-w-0">
                              <p className="line-clamp-2 text-sm font-bold leading-tight text-slate-900">{d.fullName}</p>
                              <p className="mt-0.5 text-xs text-slate-600">
                                {d.assignedVehicle?.plate ?? "Sin patente"}
                              </p>
                            </div>
                          </div>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${st.labelClass}`}
                            title={st.label}
                          >
                            {kind === "sin_unidad" ? "Sin unidad" : kind === "unidad_taller" ? "Taller" : "Con unidad"}
                          </span>
                        </div>
                        {d.phone ? (
                          <p className="mt-2 text-xs text-slate-600">Tel. {formatPhoneCL(d.phone)}</p>
                        ) : null}
                        <p className="mt-1.5 text-[10px] text-slate-500">
                          {portalOk ? (
                            <span className="text-emerald-800">Portal: {d.user?.email}</span>
                          ) : (
                            <span className="font-medium text-violet-800">Sin acceso a la app de chofer</span>
                          )}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {filteredDrivers.length > 0 ? (
              <p className="mt-2 text-center text-[10px] text-slate-500">
                {filteredDrivers.length} de {drivers.length} en pantalla
              </p>
            ) : null}
          </div>

          {profileDriverId ? (
            <div
              className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-0 sm:items-center sm:p-4"
              role="dialog"
              aria-modal="true"
              aria-labelledby="driver-profile-modal-title"
              onClick={() => setProfileDriverId(null)}
            >
              <div
                className="flex max-h-[min(85vh,600px)] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
                  <div>
                    <h2 id="driver-profile-modal-title" className="text-base font-semibold text-slate-900">
                      Ficha del conductor
                    </h2>
                    <h3 className="mt-0.5 text-lg font-bold leading-tight text-slate-900">{selected?.fullName}</h3>
                  </div>
                  <button
                    type="button"
                    className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                    onClick={() => setProfileDriverId(null)}
                    aria-label="Cerrar"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  {selected ? (() => {
                    const selectedKind = driverOperationalKind(selected);
                    return selectedKind ? (
                      <div
                        className={`mt-2 flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium ${profileStripClass} text-slate-900 ring-1 ring-slate-200/60`}
                        role="status"
                      >
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full ${
                            selectedKind === "sin_unidad"
                              ? "bg-amber-500"
                              : selectedKind === "unidad_taller"
                                ? "bg-rose-500"
                                : "bg-emerald-600"
                          }`}
                          aria-hidden
                        />
                        {selectedKind === "sin_unidad"
                          ? "Sin vehículo asignado: asigná unidad en Flota para ponerlo en ruta."
                          : selectedKind === "unidad_taller"
                            ? "La unidad figura en taller: coordiná en Flota antes de nuevas salidas."
                            : "Con unidad asignada: listo para operar según envíos en curso."}
                      </div>
                    ) : null;
                  })() : null}
                  <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-4">
                    <button
                      type="button"
                      className={`w-full text-left ${shipmentFilter === "todos" ? "ring-2 ring-blue-300 bg-blue-50" : ""}`}
                      onClick={() => setShipmentFilter("todos")}
                    >
                      <Kpi title="Movimientos (historial)" value={String(total)} />
                    </button>
                    <button
                      type="button"
                      className={`w-full text-left ${shipmentFilter === "confirmado,recogido,en_transito" ? "ring-2 ring-blue-300 bg-blue-50" : ""}`}
                      onClick={() => setShipmentFilter("confirmado,recogido,en_transito")}
                    >
                      <Kpi
                        title="En curso ahora"
                        value={String(active)}
                        highlight={active > 0 ? "sky" : "neutral"}
                      />
                    </button>
                    <button
                      type="button"
                      className={`w-full text-left ${shipmentFilter === "entregado" ? "ring-2 ring-blue-300 bg-blue-50" : ""}`}
                      onClick={() => setShipmentFilter("entregado")}
                    >
                      <Kpi title="Entregadas" value={String(delivered)} highlight="positive" />
                    </button>
                    <button
                      type="button"
                      className={`w-full text-left ${shipmentFilter === "rechazado" ? "ring-2 ring-blue-300 bg-blue-50" : ""}`}
                      onClick={() => setShipmentFilter("rechazado")}
                    >
                      <Kpi title="Rechazos" value={String(rejected)} highlight={rejected > 0 ? "warning" : "neutral"} />
                    </button>
                  </div>

                  <div className="space-y-1.5 border-b border-slate-100 px-4 py-3 text-sm text-slate-800">
                    <p>
                      <span className="text-slate-500">RUT / NIT</span>{" "}
                      <span className="font-medium">{selected?.taxId ?? "—"}</span>
                    </p>
                    {selected?.phone ? (
                      <p>
                        <span className="text-slate-500">Teléfono</span>{" "}
                        <span className="font-medium">{formatPhoneCL(selected.phone)}</span>
                      </p>
                    ) : null}
                    {selected?.licenseNumber ? (
                      <p>
                        <span className="text-slate-500">Licencia</span> <span className="font-mono text-xs">{selected.licenseNumber}</span>
                      </p>
                    ) : null}
                    <p>
                      <span className="text-slate-500">App chofer (correo)</span>{" "}
                      {selected?.user?.email ? (
                        <span className="font-medium break-all text-slate-900">{selected.user.email}</span>
                      ) : (
                        <span className="font-medium text-violet-800">Sin acceso — configurar en Flota</span>
                      )}
                    </p>
                    <p>
                      <span className="text-slate-500">Unidad asignada</span> <span className="font-medium">{availability}</span>
                      {selected?.assignedVehicle?.status ? (
                        <span className="ml-1 text-xs text-slate-500">({selected.assignedVehicle.status})</span>
                      ) : null}
                    </p>
                  </div>

                  <div className="flex min-h-0 flex-1 flex-col px-4 pb-2 pt-2">
                    <h4 className="shrink-0 text-xs font-bold uppercase tracking-wide text-slate-600">
                      Recorridos y servicios (historial)
                    </h4>
                    <p className="shrink-0 text-[11px] text-slate-500">
                      Todos los envíos asignados a este chofer, más recientes arriba. Click en cualquier fila para ver el detalle completo.
                    </p>
                    {shipmentsQ.isLoading ? (
                      <p className="mt-2 text-sm text-slate-500">Cargando historial…</p>
                    ) : shipmentsQ.isError ? (
                      <p className="mt-2 text-sm text-rose-700">No se pudo cargar el historial de envíos.</p>
                    ) : selectedShipments.length === 0 ? (
                      <p className="mt-2 text-sm text-slate-500">Aún no tiene envíos asignados en el sistema.</p>
                    ) : (
                      <div className="mt-2 min-h-0 flex-1 overflow-auto rounded-lg border border-slate-200 bg-slate-50/30">
                        <table className="table-pro w-full min-w-0 text-xs">
                          <thead className="sticky top-0 z-[1] bg-slate-100/95 text-[11px] shadow-sm">
                            <tr>
                              <th className="whitespace-nowrap">Fecha</th>
                              <th>Cliente</th>
                              <th>Ruta</th>
                              <th className="whitespace-nowrap">Unidad</th>
                              <th className="whitespace-nowrap">Estado</th>
                              <th className="w-px" />
                            </tr>
                          </thead>
                          <tbody>
                            {selectedShipments.map((s) => {
                              const when = s.deliveredAt ?? s.scheduledDelivery ?? s.createdAt;
                              return (
                                <tr 
                                  key={s.id} 
                                  className="align-top cursor-pointer hover:bg-slate-50 transition-colors"
                                  onClick={() => window.open(`/admin/dashboard?envio=${encodeURIComponent(s.id)}`, '_blank')}
                                >
                                  <td className="whitespace-nowrap text-slate-600">
                                    {new Date(when).toLocaleString("es-CL", {
                                      dateStyle: "short",
                                      timeStyle: s.deliveredAt || s.scheduledDelivery ? "short" : undefined,
                                    })}
                                  </td>
                                  <td className="text-slate-800">{s.customer?.name ?? "—"}</td>
                                  <td>
                                    <span className="line-clamp-2" title={`${s.origin} → ${s.destination}`}>
                                      {s.origin} → {s.destination}
                                    </span>
                                  </td>
                                  <td className="whitespace-nowrap text-slate-600">{s.vehicle?.plate ?? "—"}</td>
                                  <td>
                                    <span className="badge bg-slate-100 text-slate-800 ring-1 ring-slate-200/80">
                                      {statusLabel(s.status)}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setProfileDriverId(null)}
                    >
                      Cerrar
                    </button>
                    <button
                      type="button"
                      className="btn-danger"
                      onClick={() => {
                        if (selected?.id) {
                          setDeleteDriverId(selected.id);
                          setProfileDriverId(null);
                        }
                      }}
                      disabled={!selected?.id}
                    >
                      Eliminar conductor
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex min-h-[min(30vh,150px)] flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:col-span-8">
              <div className="flex flex-1 items-center justify-center p-3 text-center text-xs text-slate-400">
                Seleccioná un conductor
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export function ChoferesAdminPage() {
  const qc = useQueryClient();
  const [deleteDriverId, setDeleteDriverId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const deleteDriver = useMutation({
    mutationFn: (id: string) => apiSend(`/drivers/${id}`, "DELETE"),
    onSuccess: () => {
      setDeleteDriverId(null);
      void qc.invalidateQueries({ queryKey: ["drivers"] });
      notify("success", "Conductor eliminado correctamente.");
    },
    onError: (e: Error) => {
      setError(e.message);
      setDeleteDriverId(null);
    },
  });

  return (
    <div className="page-stack">
      <header className="page-header">
        <h1 className="text-xl font-semibold">Choferes</h1>
        <p className="text-sm text-blue-100">
          Grilla de conductores (como clientes): tocá una tarjeta y a la derecha se abre la ficha con KPIs, datos de contacto
          y el historial de envíos asignados.
        </p>
      </header>
      <ChoferesAdminPanel deleteDriverId={deleteDriverId} setDeleteDriverId={setDeleteDriverId} deleteDriver={deleteDriver} />
      
      {deleteDriverId ? (
        <div
          className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-driver-modal-title"
          onClick={() => setDeleteDriverId(null)}
        >
          <div
            className="flex max-h-[min(40vh,300px)] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
              <div>
                <h2 id="delete-driver-modal-title" className="text-base font-semibold text-slate-900">
                  Eliminar conductor
                </h2>
                <p className="text-xs text-slate-600">Esta acción no se puede deshacer</p>
              </div>
              <button
                type="button"
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                onClick={() => setDeleteDriverId(null)}
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 px-4 py-4 text-slate-800">
              <p className="text-sm text-slate-700">
                ¿Estás seguro de que quieres eliminar este conductor? También se eliminarán todos sus datos asociados como envíos y historial.
              </p>
              {error ? <p className="error mt-3">{error}</p> : null}
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  className="btn-secondary flex-1"
                  onClick={() => setDeleteDriverId(null)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn-danger flex-1"
                  disabled={deleteDriver.isPending}
                  onClick={() => deleteDriver.mutate(deleteDriverId)}
                >
                  {deleteDriver.isPending ? "Eliminando…" : "Eliminar conductor"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function statusLabel(status: string): string {
  if (status === "pendiente") return "Pendiente";
  if (status === "confirmado") return "Confirmado";
  if (status === "recogido") return "Carga retirada";
  if (status === "en_transito") return "En tránsito";
  if (status === "entregado") return "Entregado";
  if (status === "rechazado") return "Rechazado";
  if (status === "pre_entrega") return "Rechazo en retiro";
  return status;
}

function Kpi({
  title,
  value,
  highlight = "neutral",
}: {
  title: string;
  value: string;
  highlight?: "neutral" | "sky" | "positive" | "warning";
}) {
  const box =
    highlight === "sky"
      ? "border-sky-200/90 bg-sky-50/90"
      : highlight === "positive"
        ? "border-emerald-200/80 bg-emerald-50/70"
        : highlight === "warning"
          ? "border-amber-200/80 bg-amber-50/70"
          : "border-slate-200/80 bg-white";
  const valueTone =
    highlight === "sky"
      ? "text-sky-900"
      : highlight === "positive"
        ? "text-emerald-900"
        : highlight === "warning"
          ? "text-amber-900"
          : "text-slate-900";
  return (
    <div className={`rounded-lg border px-2 py-1.5 ${box}`}>
      <p className="text-[10px] font-medium text-slate-500">{title}</p>
      <p className={`text-sm font-semibold tabular-nums ${valueTone}`}>{value}</p>
    </div>
  );
}
