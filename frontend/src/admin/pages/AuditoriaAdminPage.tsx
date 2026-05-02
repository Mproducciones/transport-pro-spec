import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiGet } from "../../api/client.js";

type DecisionHistory = {
  id: string;
  from: string | null;
  to: string;
  note: string | null;
  at: string;
  by: { email: string; role: string };
};

type DecisionRow = {
  shipmentId: string;
  route: string;
  customer: string;
  status: string;
  approvedAt: string | null;
  decisionNote: string | null;
  approvedBy: { email: string; role: string } | null;
  history: DecisionHistory[];
};

type SettlementAuditRow = {
  id: string;
  status: string;
  periodStart: string;
  periodEnd: string;
  entregasCount: number;
  baseAmount: string;
  commissionPercent: string;
  grossAmount: string;
  bonusAmount: string;
  deductionAmount: string;
  netAmount: string;
  notes: string | null;
  closedAt: string | null;
  closedBy: { email: string; role: string } | null;
  createdAt: string;
  driver: { id: string; fullName: string };
};

type AuditTab = "envios" | "liquidaciones";

function fmtCLP(value: string): string {
  return Number(value).toLocaleString("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  });
}

export function AuditoriaAdminPage() {
  const [section, setSection] = useState<AuditTab>("envios");
  const [enviosModalOpen, setEnviosModalOpen] = useState(false);
  const [liqModalOpen, setLiqModalOpen] = useState(false);
  const [modalStack, setModalStack] = useState<string[]>([]);
  const q = useQuery({ queryKey: ["audit-decisions"], queryFn: () => apiGet<DecisionRow[]>("/reports/audit-decisions") });
  const settlementsQ = useQuery({
    queryKey: ["settlements", "audit"],
    queryFn: () => apiGet<SettlementAuditRow[]>("/settlements"),
    enabled: section === "liquidaciones",
  });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  const rows = q.data ?? [];
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false;
      if (!s) return true;
      return (
        r.customer.toLowerCase().includes(s) ||
        r.route.toLowerCase().includes(s) ||
        (r.decisionNote ?? "").toLowerCase().includes(s) ||
        (r.approvedBy?.email ?? "").toLowerCase().includes(s)
      );
    });
  }, [rows, search, statusFilter]);

  const statusOptions = useMemo(() => {
    const set = new Set(rows.map((r) => r.status));
    return [...set].sort();
  }, [rows]);

  const [liqSearch, setLiqSearch] = useState("");
  const [liqStatus, setLiqStatus] = useState<string>("");
  const settlements = settlementsQ.data ?? [];
  const filteredLiq = useMemo(() => {
    const s = liqSearch.trim().toLowerCase();
    return settlements.filter((x) => {
      if (liqStatus && x.status !== liqStatus) return false;
      if (!s) return true;
      return (
        x.driver.fullName.toLowerCase().includes(s) ||
        (x.notes ?? "").toLowerCase().includes(s) ||
        (x.closedBy?.email ?? "").toLowerCase().includes(s)
      );
    });
  }, [settlements, liqSearch, liqStatus]);

  if (q.isLoading) return <p className="p-4 text-sm text-slate-500">Cargando auditoría…</p>;
  if (q.isError) return <p className="p-4 text-sm text-rose-600">{(q.error as Error).message}</p>;

  function pushModal(key: string) {
    setModalStack((prev) => (prev[prev.length - 1] === key ? prev : [...prev, key]));
  }

  function closeTopModal() {
    const top = modalStack[modalStack.length - 1];
    if (!top) return;
    if (top === "envios") setEnviosModalOpen(false);
    if (top === "liquidaciones") setLiqModalOpen(false);
    setModalStack((prev) => prev.slice(0, -1));
  }

  return (
    <div className="page-stack">
      <header className="page-header">
        <h1 className="text-xl font-semibold">Auditoría y trazabilidad</h1>
        <p className="text-sm text-blue-100">
          Un solo lugar para revisar <strong>quién hizo qué y cuándo</strong>: decisiones sobre pedidos y cierres de pago a conductores. Sirve
          para reclamos, control interno o cuando un contador pide respaldo de cambios.
        </p>
      </header>
      <div
        className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200/80 bg-slate-50/80 px-2 py-2"
        role="toolbar"
        aria-label="Atención rápida en auditoría"
      >
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full border border-cyan-200 bg-cyan-50/90 px-3 py-1.5 text-xs font-semibold text-cyan-950 shadow-sm ring-1 ring-cyan-900/5 hover:bg-cyan-100/80"
          onClick={() => {
            setSection("envios");
            setEnviosModalOpen(true);
            pushModal("envios");
          }}
        >
          Abrir auditoría de envíos
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50/90 px-3 py-1.5 text-xs font-semibold text-emerald-950 shadow-sm ring-1 ring-emerald-900/5 hover:bg-emerald-100/80"
          onClick={() => {
            setSection("liquidaciones");
            setLiqModalOpen(true);
            pushModal("liquidaciones");
          }}
        >
          Abrir auditoría de liquidaciones
        </button>
      </div>

      <section className="rounded-xl border border-indigo-200 bg-indigo-50/90 p-4 text-sm text-indigo-950 shadow-sm">
        <h2 className="text-base font-semibold text-indigo-950">¿Qué es la “auditoría de decisiones” en envíos?</h2>
        <p className="mt-2 leading-relaxed">
          Cada vez que un administrador <strong>aprueba o rechaza</strong> una solicitud de transporte, o el estado del envío cambia
          (pendiente → confirmado → recogido, etc.), el sistema guarda <strong>fecha, usuario y nota</strong>. Esta pantalla no reemplaza el
          listado de <Link className="font-semibold underline" to="/admin/envios">Envíos</Link> para operar el día a día: aquí solo ves el{" "}
          <strong>historial legal/operativo</strong> por si alguien pregunta “¿quién autorizó este viaje?” o “¿por qué quedó rechazado?”.
        </p>
        <p className="mt-2 leading-relaxed">
          Las <strong>liquidaciones de chofer</strong> son otro tipo de decisión: cuándo la empresa cerró un período y con qué montos. Están
          en la segunda pestaña; para <strong>editar o pagar</strong> liquidaciones seguí usando{" "}
          <Link className="font-semibold underline" to="/admin/liquidaciones-choferes">
            Liquidaciones conductores
          </Link>
          .
        </p>
      </section>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          className={`rounded-lg px-4 py-2 text-sm font-semibold ${
            section === "envios" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
          onClick={() => setSection("envios")}
        >
          Envíos — aprobaciones y estados
        </button>
        <button
          type="button"
          className={`rounded-lg px-4 py-2 text-sm font-semibold ${
            section === "liquidaciones" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
          onClick={() => setSection("liquidaciones")}
        >
          Liquidaciones — cierres a conductores
        </button>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">Interacciones flotantes</h2>
        <p className="mt-1 text-xs text-slate-600">
          Los listados detallados se abren en ventanas flotantes para mantener esta vista de auditoría más limpia.
        </p>
      </section>

      {section === "envios" ? (
        <>
          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div>
              <label className="block text-xs font-medium text-slate-600">Buscar</label>
              <input
                className="mt-1 rounded border border-slate-300 px-2 py-1 text-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cliente, ruta, nota, email…"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600">Estado actual del envío</label>
              <select
                className="mt-1 rounded border border-slate-300 px-2 py-1 text-sm"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">Todos</option>
                {statusOptions.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-xs text-slate-500">
              Mostrando <strong>{filtered.length}</strong> de {rows.length}
            </p>
          </div>
          <button className="btn-primary" type="button" onClick={() => { setEnviosModalOpen(true); pushModal("envios"); }}>
            Ver detalle en ventana flotante
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-slate-600">
            Solo aparecen liquidaciones que existen en el sistema (el chofer debe haber generado una pre-liquidación desde su app). Los{" "}
            <strong>cierres</strong> muestran quién en la empresa confirmó el neto a pagar.
          </p>
          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div>
              <label className="block text-xs font-medium text-slate-600">Buscar</label>
              <input
                className="mt-1 rounded border border-slate-300 px-2 py-1 text-sm"
                value={liqSearch}
                onChange={(e) => setLiqSearch(e.target.value)}
                placeholder="Chofer, nota, quien cerró…"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600">Estado</label>
              <select
                className="mt-1 rounded border border-slate-300 px-2 py-1 text-sm"
                value={liqStatus}
                onChange={(e) => setLiqStatus(e.target.value)}
              >
                <option value="">Todos</option>
                <option value="borrador">Borrador</option>
                <option value="cerrado">Cerrado</option>
              </select>
            </div>
            <p className="text-xs text-slate-500">
              Mostrando <strong>{filteredLiq.length}</strong> de {settlements.length}
            </p>
          </div>
          {settlementsQ.isLoading ? <p className="text-sm text-slate-500">Cargando liquidaciones…</p> : null}
          {settlementsQ.isError ? <p className="text-sm text-rose-600">{(settlementsQ.error as Error).message}</p> : null}
          <button className="btn-primary" type="button" onClick={() => { setLiqModalOpen(true); pushModal("liquidaciones"); }}>
            Ver detalle en ventana flotante
          </button>
        </>
      )}

      {enviosModalOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true" onClick={closeTopModal}>
          <div className="max-h-[92vh] w-full max-w-6xl overflow-auto rounded-t-2xl border border-slate-200 bg-white p-4 shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-slate-900">Auditoría de envíos</h3>
              <button className="btn-secondary btn-sm" type="button" onClick={closeTopModal}>{modalStack.length > 1 ? "Volver" : "Cerrar"}</button>
            </div>
            <div className="space-y-3">
              {filtered.map((r) => (
                <article key={r.shipmentId} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-base font-semibold text-slate-900">{r.route}</h2>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tone(r.status)}`}>{r.status}</span>
                  </div>
                  <p className="text-sm text-slate-600">Cliente: {r.customer}</p>
                  <p className="text-xs text-slate-500">
                    Quién resolvió la solicitud (aprobó/rechazó): {r.approvedBy?.email ?? "—"} ·{" "}
                    {r.approvedAt ? new Date(r.approvedAt).toLocaleString("es-CL") : "—"}
                  </p>
                  {r.decisionNote ? (
                    <p className="mt-1 rounded bg-slate-50 px-2 py-1 text-xs italic text-slate-600">Motivo o comentario: “{r.decisionNote}”</p>
                  ) : null}
                  <h3 className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Línea de tiempo de estados</h3>
                  <p className="text-xs text-slate-500">Cada fila: estado anterior → nuevo estado, fecha/hora y usuario que registró el cambio.</p>
                  <div className="mt-2 space-y-1">
                    {r.history.map((h) => (
                      <div key={h.id} className="rounded border border-slate-100 bg-slate-50 px-2 py-1.5 text-xs text-slate-700">
                        <span className="font-medium text-slate-800">{h.from ?? "(inicio)"}</span>
                        <span className="text-slate-400"> → </span>
                        <span className="font-medium text-slate-800">{h.to}</span>
                        <span className="text-slate-500"> · {new Date(h.at).toLocaleString("es-CL")}</span>
                        <span className="text-slate-500"> · {h.by.email}</span>
                        {h.note ? <span className="block text-slate-600">Nota: {h.note}</span> : null}
                      </div>
                    ))}
                  </div>
                </article>
              ))}
              {rows.length === 0 ? <p className="text-sm text-slate-500">Sin registros de envíos en auditoría.</p> : null}
              {rows.length > 0 && filtered.length === 0 ? (
                <p className="text-sm text-slate-500">Ningún envío coincide con los filtros.</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {liqModalOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true" onClick={closeTopModal}>
          <div className="max-h-[92vh] w-full max-w-6xl overflow-auto rounded-t-2xl border border-slate-200 bg-white p-4 shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-slate-900">Auditoría de liquidaciones</h3>
              <button className="btn-secondary btn-sm" type="button" onClick={closeTopModal}>{modalStack.length > 1 ? "Volver" : "Cerrar"}</button>
            </div>
            <div className="space-y-3">
              {filteredLiq.map((s) => (
                <article key={s.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-base font-semibold text-slate-900">{s.driver.fullName}</h2>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        s.status === "cerrado" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"
                      }`}
                    >
                      {s.status === "cerrado" ? "Cerrado" : "Borrador"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Período: {new Date(s.periodStart).toLocaleDateString("es-CL")} – {new Date(s.periodEnd).toLocaleDateString("es-CL")} ·
                    Entregas contadas: {s.entregasCount} · Comisión aplicada: {s.commissionPercent}%
                  </p>
                  <div className="mt-2 grid gap-1 text-sm text-slate-700 sm:grid-cols-2">
                    <p>
                      Base (suma montos entregas): <strong>{fmtCLP(s.baseAmount)}</strong>
                    </p>
                    <p>
                      Bruto comisión: <strong>{fmtCLP(s.grossAmount)}</strong>
                    </p>
                    <p>
                      Bono / descuento: <strong>{fmtCLP(s.bonusAmount)}</strong> / <strong>{fmtCLP(s.deductionAmount)}</strong>
                    </p>
                    <p>
                      <strong>Neto liquidación: {fmtCLP(s.netAmount)}</strong>
                    </p>
                  </div>
                  {s.notes ? <p className="mt-2 rounded bg-slate-50 px-2 py-1 text-xs text-slate-600">Notas: {s.notes}</p> : null}
                  <p className="mt-2 text-xs text-slate-500">
                    {s.status === "cerrado" && s.closedAt ? (
                      <>
                        Cerrado el {new Date(s.closedAt).toLocaleString("es-CL")}
                        {s.closedBy ? (
                          <>
                            {" "}
                            por <strong>{s.closedBy.email}</strong> ({s.closedBy.role})
                          </>
                        ) : null}
                      </>
                    ) : (
                      <>Aún no cerrada en administración — ver en Liquidaciones conductores.</>
                    )}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-400">ID interno: {s.id}</p>
                </article>
              ))}
              {!settlementsQ.isLoading && settlements.length === 0 ? (
                <p className="text-sm text-slate-500">No hay liquidaciones registradas. El conductor debe generar una desde su app.</p>
              ) : null}
              {settlements.length > 0 && filteredLiq.length === 0 ? (
                <p className="text-sm text-slate-500">Ninguna liquidación coincide con los filtros.</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function tone(status: string) {
  if (status === "confirmado") return "bg-emerald-100 text-emerald-800";
  if (status === "rechazado") return "bg-rose-100 text-rose-800";
  return "bg-slate-100 text-slate-700";
}
