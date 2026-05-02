import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Phone, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiSend } from "../api/client.js";
import { notify } from "../lib/notify.js";
import { FlotaAdminContent } from "./pages/FlotaAdminPage.js";
import { ChoferesAdminPanel } from "./pages/ChoferesAdminPage.js";

const shellZ = "fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4";
const shellGestionZ = "fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4";

type ComprobanteRow = {
  id: string;
  amount: string;
  reference: string;
  paidAt: string;
  shipment: { id: string; route: string; customer: string } | null;
};
type PaymentDashboardDetail = {
  id: string;
  amount: unknown;
  method?: string;
  reference?: string | null;
  paidAt: string;
  verificationStatus: "pendiente" | "aprobado" | "rechazado";
  shipment?: { id: string; origin: string; destination: string; customer?: { name: string } } | null;
};

type DriverRow = {
  id: string;
  fullName: string;
  phone?: string | null;
  taxId?: string | null;
  licenseNumber?: string | null;
  status?: string;
  assignedVehicle?: { plate: string; kind?: string | null } | null;
  user?: { id: string; email: string } | null;
};

/** Mínimo de envío para listar rutas asignadas al chofer (misma carga que el mapa de inicio). */
export type DashboardChoferShipment = {
  id: string;
  origin: string;
  destination: string;
  status: string;
  scheduledDelivery?: string | null;
  customer: { name: string };
  driver?: { id: string; fullName: string } | null;
  vehicle?: { id: string; plate: string; kind?: string } | null;
};

const ESTADO_OPERATIVO = new Set(["confirmado", "recogido", "en_transito"]);

function pedidoRef6(id: string): string {
  return id.slice(-6).toUpperCase();
}

function etapaRutaCorta(status: string): string {
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

function estadoChoferEnFlota(status: string): string {
  switch (status) {
    case "activo":
      return "Activo";
    case "inactivo":
      return "Inactivo";
    default:
      return status;
  }
}

type SupportMessage = {
  id: string;
  body: string;
  createdAt: string;
  driver?: { id: string; fullName: string; phone?: string | null } | null;
  author?: { id: string; email: string; role: string } | null;
  shipment?: { id: string; origin: string; destination: string } | null;
};

/** `tel:` para abrir el marcador del sistema sin salir de la app (PWA/escritorio). */
function telHrefFromPhone(phone: string | null | undefined): string | null {
  if (!phone?.trim()) return null;
  const cleaned = phone.replace(/[^\d+]/g, "");
  if (!cleaned) return null;
  let n = cleaned;
  if (!n.startsWith("+") && /^9\d{8}$/.test(n)) {
    n = `+56${n}`;
  }
  return `tel:${n}`;
}

function fmtClp(n: string | number): string {
  const v = Number(String(n).replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(v)) return String(n);
  return v.toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
}

function fmtShort(iso: string) {
  try {
    return new Date(iso).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

type CajaProps = { open: boolean; onClose: () => void; ingresos: string; egresos: string; utilidad: string; movIngresos: number; movEgresos: number };
export function DashboardCajaModal({ open, onClose, ingresos, egresos, utilidad, movIngresos, movEgresos }: CajaProps) {
  if (!open) return null;
  return (
    <div className={shellZ} role="dialog" aria-modal="true" aria-labelledby="modal-caja-title" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:max-h-[min(90vh,560px)] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 id="modal-caja-title" className="text-base font-semibold text-slate-900">
            Resultado del mes (caja aproximada)
          </h2>
          <button type="button" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" onClick={onClose} aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-3 px-4 py-3 text-sm text-slate-800">
          <p className="text-xs text-slate-600">
            Ingresos = pagos <strong>aprobados</strong> del mes. Egresos = gastos registrados. La pantalla de Rentabilidad
            desglosa más.
          </p>
          <ul className="space-y-2 rounded-lg border border-slate-100 bg-slate-50/90 p-3 text-xs">
            <li className="flex justify-between gap-2">
              <span>Ingresos aprobados</span>
              <span className="font-semibold tabular-nums text-emerald-800">{fmtClp(ingresos)}</span>
            </li>
            <li className="text-[10px] text-slate-500">{movIngresos} movimiento{movIngresos !== 1 ? "s" : ""}</li>
            <li className="flex justify-between gap-2">
              <span>Egresos del mes</span>
              <span className="font-semibold tabular-nums text-rose-800">{fmtClp(egresos)}</span>
            </li>
            <li className="text-[10px] text-slate-500">{movEgresos} movimiento{movEgresos !== 1 ? "s" : ""}</li>
            <li className="flex justify-between border-t border-slate-200 pt-2 text-sm font-bold text-slate-900">
              <span>Utilidad operativa (ingresos − egresos)</span>
              <span className="tabular-nums">{fmtClp(utilidad)}</span>
            </li>
          </ul>
        </div>
        <p className="border-t border-slate-200 bg-slate-50 px-4 py-2.5 text-center text-[10px] text-slate-500">
          Desglose y gráficos: usá <strong>Rentabilidad</strong> en el menú lateral.
        </p>
      </div>
    </div>
  );
}

type ComprobProps = { open: boolean; onClose: () => void; rows: ComprobanteRow[] };
export function DashboardComprobantesModal({ open, onClose, rows }: ComprobProps) {
  const qc = useQueryClient();
  const [reviewPaymentId, setReviewPaymentId] = useState<string | null>(null);
  const [decisionNote, setDecisionNote] = useState("");
  const paymentsQ = useQuery({
    queryKey: ["payments", "dashboard-comprobantes"],
    queryFn: () => apiGet<PaymentDashboardDetail[]>("/payments"),
    enabled: open,
  });
  const verifyMut = useMutation({
    mutationFn: (p: { id: string; status: "aprobado" | "rechazado"; note?: string }) =>
      apiSend(`/payments/${p.id}/verification`, "PATCH", p),
    onSuccess: async (_d, vars) => {
      notify("success", vars.status === "aprobado" ? "Comprobante aprobado." : "Comprobante rechazado.");
      setReviewPaymentId(null);
      setDecisionNote("");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["dashboard"] }),
        qc.invalidateQueries({ queryKey: ["payments"] }),
        qc.invalidateQueries({ queryKey: ["shipments"] }),
      ]);
    },
    onError: (e: Error) => notify("error", e.message || "No se pudo validar el comprobante."),
  });

  const selectedRow = useMemo(() => rows.find((r) => r.id === reviewPaymentId) ?? null, [rows, reviewPaymentId]);
  const selectedDetail = useMemo(
    () => (paymentsQ.data ?? []).find((p) => p.id === reviewPaymentId) ?? null,
    [paymentsQ.data, reviewPaymentId]
  );

  useEffect(() => {
    if (!open) {
      setReviewPaymentId(null);
      setDecisionNote("");
      return;
    }
    if (reviewPaymentId && !rows.some((r) => r.id === reviewPaymentId)) {
      setReviewPaymentId(null);
      setDecisionNote("");
    }
  }, [open, rows, reviewPaymentId]);

  if (!open) return null;
  return (
    <div className={shellZ} role="dialog" aria-modal="true" aria-labelledby="modal-comp-title" onClick={onClose}>
      <div
        className="flex max-h-[min(92vh,640px)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 id="modal-comp-title" className="text-base font-semibold text-slate-900">
            Comprobantes por validar hoy
          </h2>
          <button type="button" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" onClick={onClose} aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-950">
            Estos son <strong>clientes que ya enviaron su comprobante de pago</strong>. Ahora corresponde revisar en sistema si la
            transferencia/pago está efectivamente recibido y luego <strong>aprobar o rechazar</strong> el comprobante según el caso.
          </div>
          {rows.length === 0 ? (
            <p className="py-4 text-sm text-slate-600">No hay comprobantes pendientes en el corte de hoy.</p>
          ) : (
            <ul className="space-y-2">
              {rows.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="w-full rounded-lg border border-amber-200/80 bg-amber-50/60 px-3 py-2 text-left text-xs transition hover:bg-amber-100/50"
                    onClick={() => setReviewPaymentId(p.id)}
                  >
                    <p className="font-bold tabular-nums text-amber-950">{fmtClp(p.amount)}</p>
                    {p.shipment ? <p className="text-slate-800">{p.shipment.route}</p> : null}
                    {p.shipment ? <p className="text-slate-600">Cliente: {p.shipment.customer}</p> : null}
                    <p className="text-[10px] text-slate-500">
                      {fmtShort(p.paidAt)} — ref. {p.reference ? `${p.reference.slice(0, 40)}${p.reference.length > 40 ? "…" : ""}` : "—"}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-amber-50/80 px-4 py-2.5">
          <button
            type="button"
            className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
            onClick={onClose}
          >
            Cerrar
          </button>
        </div>
      </div>
      {selectedRow ? (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/55 p-4" onClick={() => setReviewPaymentId(null)}>
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label="Detalle de comprobante"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-slate-900">Detalle del comprobante seleccionado</h3>
            <p className="mt-2 text-xs text-slate-700">Cliente: {selectedRow.shipment?.customer ?? "—"}</p>
            <p className="text-xs text-slate-700">Ruta: {selectedRow.shipment?.route ?? "—"}</p>
            <p className="text-xs text-slate-700">
              Medio:{" "}
              {selectedDetail?.method === "efectivo"
                ? "Efectivo"
                : selectedDetail?.method === "transferencia"
                  ? "Transferencia"
                  : selectedDetail?.method ?? "—"}
            </p>
            <p className="text-xs text-slate-700 break-all">
              Referencia completa: {selectedDetail?.reference ?? selectedRow.reference ?? "—"}
            </p>
            <label className="mt-2 block text-[11px] font-medium text-slate-700">
              Nota para validación (opcional)
              <input
                className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs"
                value={decisionNote}
                onChange={(e) => setDecisionNote(e.target.value)}
                placeholder="Ej: transferencia confirmada en banco"
              />
            </label>
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
                disabled={verifyMut.isPending}
                onClick={() =>
                  verifyMut.mutate({
                    id: selectedRow.id,
                    status: "aprobado",
                    note: decisionNote.trim() || undefined,
                  })
                }
              >
                Aprobar
              </button>
              <button
                type="button"
                className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-900 hover:bg-rose-100 disabled:opacity-50"
                disabled={verifyMut.isPending}
                onClick={() =>
                  verifyMut.mutate({
                    id: selectedRow.id,
                    status: "rechazado",
                    note: decisionNote.trim() || undefined,
                  })
                }
              >
                Rechazar
              </button>
              <button
                type="button"
                className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
                onClick={() => setReviewPaymentId(null)}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

type ChoferesModalImplProps = {
  open: boolean;
  onClose: () => void;
  activosByDriverId: Map<string, number>;
  dashboardShipments: DashboardChoferShipment[];
  onOpenFicha: (shipmentId: string) => void;
};

export function DashboardChoferesModal({
  open,
  onClose,
  activosByDriverId,
  dashboardShipments,
  onOpenFicha,
}: ChoferesModalImplProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [gestionOpen, setGestionOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      setSelectedId(null);
      setGestionOpen(false);
    }
  }, [open]);

  const q = useQuery({
    queryKey: ["drivers", "dashboard-modal"],
    queryFn: () => apiGet<DriverRow[]>("/drivers"),
    enabled: open,
  });

  const rutasDelSeleccionado = useMemo(() => {
    if (!selectedId) return [];
    return dashboardShipments
      .filter((s) => s.driver?.id === selectedId && ESTADO_OPERATIVO.has(s.status))
      .sort((a, b) => {
        const ta = a.scheduledDelivery ? new Date(a.scheduledDelivery).getTime() : Number.POSITIVE_INFINITY;
        const tb = b.scheduledDelivery ? new Date(b.scheduledDelivery).getTime() : Number.POSITIVE_INFINITY;
        return ta - tb;
      });
  }, [selectedId, dashboardShipments]);

  const choferSeleccionado = useMemo(
    () => (selectedId && q.data ? q.data.find((d) => d.id === selectedId) : undefined),
    [selectedId, q.data]
  );

  const conductoresConRutaHoy = useMemo(
    () => (q.data ?? []).filter((d) => (activosByDriverId.get(d.id) ?? 0) > 0),
    [q.data, activosByDriverId]
  );

  if (!open) return null;
  return (
    <>
    <div className={shellZ} role="dialog" aria-modal="true" aria-labelledby="modal-conductores-ruta-title" onClick={onClose}>
      <div
        className="flex max-h-[min(92vh,640px)] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:max-h-[min(90vh,580px)] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <h2 id="modal-conductores-ruta-title" className="min-w-0 flex-1 text-base font-semibold text-slate-900">
            Conductores en ruta hoy
          </h2>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              className="whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 shadow-sm ring-1 ring-slate-900/5 hover:bg-slate-50"
              onClick={() => setGestionOpen(true)}
              title="Nómina completa, unidades e historial por chofer"
            >
              Gestionar choferes
            </button>
            <button type="button" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" onClick={onClose} aria-label="Cerrar">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        <p className="border-b border-slate-100 bg-slate-50/90 px-4 py-1.5 text-[11px] text-slate-600">
          Solo se listan quienes tienen al menos un viaje activo (confirmado, recogido o en tránsito). Elegí un conductor a
          la izquierda; luego <strong>tocá un pedido</strong> para abrir la ficha.
        </p>

        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <div className="max-h-[min(40vh,14rem)] min-h-0 shrink-0 overflow-y-auto border-b border-slate-200 px-2 py-2 sm:max-h-none sm:w-52 sm:shrink-0 sm:border-b-0 sm:border-r sm:px-0">
            {q.isLoading ? <p className="px-2 py-3 text-xs text-slate-500 sm:px-3">Cargando…</p> : null}
            {q.isError ? <p className="px-2 py-3 text-xs text-rose-700 sm:px-3">No se pudo cargar la nómina.</p> : null}
            {q.data && conductoresConRutaHoy.length > 0 ? (
              <ul className="space-y-1 sm:pr-0">
                {conductoresConRutaHoy.map((d) => {
                  const n = activosByDriverId.get(d.id) ?? 0;
                  const sel = selectedId === d.id;
                  return (
                    <li key={d.id} className="px-0.5 sm:px-0">
                      <button
                        type="button"
                        onClick={() => setSelectedId((prev) => (prev === d.id ? null : d.id))}
                        className={`flex w-full items-center gap-1 rounded-lg border px-2.5 py-2 text-left text-xs transition sm:rounded-none sm:border-0 sm:border-b sm:border-slate-100/90 sm:py-2.5 sm:pl-3 sm:pr-2 ${
                          sel
                            ? "border-blue-300 bg-blue-50/90 ring-1 ring-blue-400/40 sm:border-0 sm:border-b-blue-200 sm:bg-blue-50/80 sm:ring-0"
                            : "border-slate-200/90 bg-slate-50/80 hover:border-slate-300 hover:bg-slate-100/80 sm:border-0 sm:bg-transparent"
                        }`}
                        aria-pressed={sel}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold leading-tight text-slate-900">{d.fullName}</p>
                          <p className="mt-0.5 text-[10px] text-slate-500">
                            Activos: <span className="font-semibold text-slate-800">{n}</span>
                            {d.assignedVehicle ? ` · ${d.assignedVehicle.plate}` : ""}
                          </p>
                        </div>
                        <ChevronRight className={`h-4 w-4 shrink-0 sm:hidden ${sel ? "text-blue-700" : "text-slate-400"}`} aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
            {q.data && !q.isLoading && conductoresConRutaHoy.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-slate-600 sm:px-3">
                Ahora mismo nadie con viajes activos en el listado. El alta de conductores y unidades está en{" "}
                <strong>Flota</strong> (Inicio).
              </p>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/40 p-3 text-xs" aria-live="polite">
            {!selectedId ? (
              <p className="py-6 text-center text-slate-500 sm:py-10">
                Elegí un conductor a la izquierda para ver sus pedidos y datos.
              </p>
            ) : !choferSeleccionado ? (
              <p className="text-slate-500">Dato de conductor no disponible.</p>
            ) : (
              <div className="space-y-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">{choferSeleccionado.fullName}</h3>
                  <ul className="mt-1.5 space-y-0.5 text-[11px] text-slate-700">
                    {choferSeleccionado.status ? (
                      <li>
                        <span className="text-slate-500">Estado en flota:</span> {estadoChoferEnFlota(choferSeleccionado.status)}
                      </li>
                    ) : null}
                    {choferSeleccionado.phone ? (
                      <li>
                        <span className="text-slate-500">Tel.:</span> {choferSeleccionado.phone}
                      </li>
                    ) : (
                      <li className="text-slate-500">Sin teléfono registrado</li>
                    )}
                    {choferSeleccionado.taxId ? (
                      <li>
                        <span className="text-slate-500">RUT / ID:</span> {choferSeleccionado.taxId}
                      </li>
                    ) : null}
                    {choferSeleccionado.licenseNumber ? (
                      <li>
                        <span className="text-slate-500">Licencia:</span> {choferSeleccionado.licenseNumber}
                      </li>
                    ) : null}
                    {choferSeleccionado.user?.email ? (
                      <li>
                        <span className="text-slate-500">Portal (email):</span> {choferSeleccionado.user.email}
                      </li>
                    ) : null}
                    <li>
                      <span className="text-slate-500">Vehículo:</span>{" "}
                      {choferSeleccionado.assignedVehicle
                        ? `${choferSeleccionado.assignedVehicle.plate} · ${choferSeleccionado.assignedVehicle.kind ?? "unidad"}`
                        : "Sin vehículo asignado"}
                    </li>
                  </ul>
                </div>

                <div className="border-t border-slate-200/90 pt-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Rutas a realizar (activas)</p>
                  {rutasDelSeleccionado.length === 0 ? (
                    <p className="mt-1.5 text-[11px] text-slate-500">
                      No tiene envíos en estado confirmado, recogido o en tránsito, o aún no están sincronizados en el listado
                      de envíos.
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-2">
                      {rutasDelSeleccionado.map((r) => (
                        <li key={r.id} className="list-none">
                          <button
                            type="button"
                            onClick={() => onOpenFicha(r.id)}
                            className="w-full rounded-lg border border-slate-200/90 bg-white px-2.5 py-2.5 text-left shadow-sm transition hover:border-blue-200/80 hover:bg-blue-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                          >
                            <p className="font-semibold text-slate-900">
                              Ped. {pedidoRef6(r.id)} · {r.origin} → {r.destination}
                            </p>
                            <p className="mt-0.5 text-[11px] text-slate-600">Cliente: {r.customer.name}</p>
                            {r.scheduledDelivery ? (
                              <p className="text-[10px] text-slate-500">
                                Entrega prevista:{" "}
                                {new Date(r.scheduledDelivery).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" })}
                              </p>
                            ) : null}
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              <span className="inline-flex rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-800 ring-1 ring-slate-200/80">
                                {etapaRutaCorta(r.status)}
                              </span>
                              {r.vehicle?.plate ? (
                                <span className="text-[10px] text-slate-500">Unidad: {r.vehicle.plate}</span>
                              ) : null}
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <p className="border-t border-slate-200 bg-slate-50 px-4 py-2.5 text-center text-[10px] text-slate-500">
          Tocá un pedido para abrir su ficha. Unidades y altas: <strong>Flota</strong> (Inicio).{" "}
          <button
            type="button"
            className="font-semibold text-slate-700 underline decoration-slate-400 decoration-1 hover:text-slate-900"
            onClick={() => setGestionOpen(true)}
          >
            Nómina e historial por chofer
          </button>{" "}
          (mismo acceso que <span className="font-medium">Gestionar choferes</span> arriba).
        </p>
      </div>
    </div>
    {gestionOpen ? (
      <div
        className={shellGestionZ}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-choferes-gestion-title"
        onClick={() => setGestionOpen(false)}
      >
        <div
          className="flex max-h-[min(94vh,860px)] w-full max-w-5xl flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-slate-100 shadow-2xl sm:rounded-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3">
            <div>
              <h2 id="modal-choferes-gestion-title" className="text-base font-semibold text-slate-900">
                Choferes
              </h2>
              <p className="text-xs text-slate-600">Nómina, unidad asignada e historial por conductor</p>
            </div>
            <button
              type="button"
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
              onClick={() => setGestionOpen(false)}
              aria-label="Cerrar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
            <ChoferesAdminPanel embedded />
          </div>
        </div>
      </div>
    ) : null}
    </>
  );
}

type FlotaModalProps = { open: boolean; onClose: () => void };
export function DashboardFlotaModal({ open, onClose }: FlotaModalProps) {
  if (!open) return null;
  return (
    <div className={shellZ} role="dialog" aria-modal="true" aria-labelledby="modal-flota-title" onClick={onClose}>
      <div
        className="flex max-h-[min(92vh,760px)] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <h2 id="modal-flota-title" className="text-base font-semibold text-slate-900">
              Flota
            </h2>
            <p className="text-xs text-slate-600">Arriba: unidades y alta de vehículo. Abajo: botones que abren ventanas para crear conductor y asignar unidades</p>
          </div>
          <button type="button" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" onClick={onClose} aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4">
          <div className="space-y-4 text-slate-800 [&_label]:text-slate-700">
            <FlotaAdminContent />
          </div>
        </div>
      </div>
    </div>
  );
}

type MensajesProps = { open: boolean; onClose: () => void };
export function DashboardMensajesModal({ open, onClose }: MensajesProps) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  const q = useQuery({
    queryKey: ["support", "messages", "dashboard"],
    queryFn: () => apiGet<SupportMessage[]>("/support/messages"),
    enabled: open,
    staleTime: 20_000,
  });

  const list = (q.data ?? []).slice(0, 200);
  const selected = useMemo(() => (selectedId ? list.find((m) => m.id === selectedId) : null), [list, selectedId]);
  const driverIdForReply = selected?.driver?.id;

  useEffect(() => {
    if (!open) {
      setSelectedId(null);
      setReplyText("");
    }
  }, [open]);

  useEffect(() => {
    setReplyText("");
  }, [selectedId]);

  const replyMut = useMutation({
    mutationFn: async (vars: { body: string; driverId: string; shipmentId?: string | null }) => {
      return apiSend<SupportMessage>("/support/messages", "POST", {
        body: vars.body.trim(),
        driverId: vars.driverId,
        shipmentId: vars.shipmentId ?? undefined,
      });
    },
    onSuccess: () => {
      setReplyText("");
      void queryClient.invalidateQueries({ queryKey: ["support", "messages"] });
    },
  });

  if (!open) return null;

  return (
    <div className={shellZ} role="dialog" aria-modal="true" aria-labelledby="modal-msg-title" onClick={onClose}>
      <div
        className="flex max-h-[min(92vh,680px)] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:max-h-[min(90vh,640px)] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 id="modal-msg-title" className="text-base font-semibold text-slate-900">
            Mensajes con choferes
          </h2>
          <button type="button" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" onClick={onClose} aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="border-b border-slate-100 bg-cyan-50/40 px-4 py-1.5 text-[11px] text-slate-600">
          Tocá un mensaje para responder. <strong>Llamar</strong> abre el marcador del teléfono o la app de llamadas (no cerrás
          Transport Pro).
        </p>

        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <div className="max-h-[min(36vh,12rem)] min-h-0 shrink-0 overflow-y-auto border-b border-slate-200 px-2 py-2 sm:max-h-none sm:w-[min(100%,16rem)] sm:shrink-0 sm:border-b-0 sm:border-r sm:px-0">
            {q.isLoading ? <p className="px-2 py-3 text-xs text-slate-500 sm:px-3">Cargando…</p> : null}
            {q.isError ? <p className="px-2 py-3 text-xs text-rose-700 sm:px-3">No se pudieron cargar los mensajes.</p> : null}
            {!q.isLoading && !q.isError && list.length === 0 ? (
              <p className="px-2 py-3 text-xs text-slate-600 sm:px-3">No hay mensajes recientes.</p>
            ) : null}
            {list.length > 0 ? (
              <ul className="space-y-1">
                {list.map((m) => {
                  const sel = selectedId === m.id;
                  const preview = m.body.length > 72 ? `${m.body.slice(0, 70)}…` : m.body;
                  return (
                    <li key={m.id} className="px-0.5 sm:px-0">
                      <button
                        type="button"
                        onClick={() => setSelectedId(m.id === selectedId ? null : m.id)}
                        className={`w-full rounded-lg border px-2.5 py-2 text-left text-xs transition sm:rounded-none sm:border-0 sm:border-b sm:border-slate-100 sm:py-2.5 sm:pl-3 sm:pr-2 ${
                          sel
                            ? "border-cyan-300 bg-cyan-50/90 ring-1 ring-cyan-500/30 sm:ring-0"
                            : "border-slate-200/90 bg-slate-50/80 hover:border-slate-300 sm:border-0 sm:bg-transparent"
                        }`}
                        aria-pressed={sel}
                      >
                        <p className="text-[10px] text-slate-500">
                          {fmtShort(m.createdAt)} · {m.author?.role === "conductor" ? "Chofer" : "Oficina"} · {m.driver?.fullName ?? "—"}
                        </p>
                        <p className="mt-0.5 line-clamp-2 break-words text-slate-800">{preview}</p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/30 p-3 text-xs" aria-live="polite">
            {!selected ? (
              <p className="py-8 text-center text-slate-500 sm:py-12">Elegí un mensaje a la izquierda para leer y responder.</p>
            ) : !selected.driver ? (
              <p className="text-rose-700">Falta dato del chofer; no se puede responder.</p>
            ) : (
              <div className="space-y-3">
                <div>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">{selected.driver.fullName}</h3>
                      <p className="text-[10px] text-slate-500">
                        {fmtShort(selected.createdAt)} · {selected.author?.role === "conductor" ? "Chofer" : "Oficina"}
                        {selected.shipment ? (
                          <>
                            <br />
                            <span>
                              Pedido: {selected.shipment.origin} → {selected.shipment.destination}
                            </span>
                          </>
                        ) : null}
                      </p>
                    </div>
                    {(() => {
                      const href = telHrefFromPhone(selected.driver?.phone);
                      if (!href) {
                        return (
                          <span className="shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-500" title="Sin teléfono en ficha de chofer">
                            Sin teléfono
                          </span>
                        );
                      }
                      return (
                        <a
                          href={href}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-950 shadow-sm ring-1 ring-emerald-900/10 hover:bg-emerald-100/90"
                        >
                          <Phone className="h-4 w-4" aria-hidden />
                          Llamar
                        </a>
                      );
                    })()}
                  </div>
                  <p className="mt-2 whitespace-pre-wrap break-words rounded-lg border border-slate-200/90 bg-white px-2.5 py-2 text-slate-800">
                    {selected.body}
                  </p>
                </div>

                <div className="border-t border-slate-200/90 pt-2">
                  <label htmlFor="modal-msg-reply" className="text-[11px] font-semibold text-slate-700">
                    Respuesta a {selected.driver.fullName}
                  </label>
                  <textarea
                    id="modal-msg-reply"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    rows={4}
                    maxLength={8000}
                    placeholder="Escribí la respuesta… (se envía como oficina al mismo hilo de soporte.)"
                    className="mt-1 w-full resize-y rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-slate-800 shadow-inner outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30"
                    disabled={replyMut.isPending}
                  />
                  {replyMut.isError ? (
                    <p className="mt-1 text-[11px] text-rose-700">{(replyMut.error as Error).message}</p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (!driverIdForReply || !replyText.trim()) return;
                        replyMut.mutate({
                          body: replyText,
                          driverId: driverIdForReply,
                          shipmentId: selected.shipment?.id,
                        });
                      }}
                      disabled={!replyText.trim() || replyMut.isPending}
                      className="rounded-lg bg-cyan-800 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {replyMut.isPending ? "Enviando…" : "Enviar respuesta"}
                    </button>
                    <p className="text-[10px] text-slate-500">Incluye el mismo pedido si existía, para contexto al chofer.</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <p className="border-t border-slate-200 bg-cyan-50/50 px-4 py-2.5 text-center text-[10px] text-cyan-950/80">
          Historial completo y gestión: <strong>Soporte a choferes</strong> en el menú lateral.
        </p>
      </div>
    </div>
  );
}
