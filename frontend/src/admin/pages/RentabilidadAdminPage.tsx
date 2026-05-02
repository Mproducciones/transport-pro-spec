import { useLayoutEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "react-router-dom";
import { apiGet } from "../../api/client.js";

type ProfitTrip = {
  shipmentId: string;
  customer: string;
  route: string;
  status: string;
  ingresoObjetivo: string;
  ingresoCobrado: string;
  egreso: string;
  utilidadObjetivo: string;
  utilidadReal: string;
  createdAt: string;
};

type ProfitMonth = {
  month: string;
  ingresos: string;
  egresos: string;
  utilidad: string;
};

type ProfitResponse = { byTrip: ProfitTrip[]; byMonth: ProfitMonth[] };

function fmtCLP(n: number): string {
  return n.toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
}

function parseNum(s: string): number {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  return new Date(y, m - 1, 1).toLocaleDateString("es-CL", { month: "short", year: "numeric" });
}

function MonthlyBars({ months }: { months: ProfitMonth[] }) {
  const parsed = useMemo(
    () =>
      months.map((m) => ({
        key: m.month,
        label: monthLabel(m.month),
        ingresos: parseNum(m.ingresos),
        egresos: parseNum(m.egresos),
        utilidad: parseNum(m.utilidad),
      })),
    [months]
  );
  const maxVal = useMemo(() => Math.max(1, ...parsed.flatMap((p) => [p.ingresos, p.egresos, Math.abs(p.utilidad)])), [parsed]);
  if (parsed.length === 0) {
    return <p className="text-sm text-slate-500">No hay datos mensuales en el año en curso.</p>;
  }
  return (
    <div className="mt-3 space-y-4">
      <p className="text-xs text-slate-500">
        Barras proporcionales al mayor valor del período (ingresos aprobados vs egresos registrados por mes; utilidad en verde/rojo).
      </p>
      <div className="flex flex-wrap items-end gap-4 border-b border-l border-slate-200 pb-1 pl-1">
        {parsed.map((p) => (
          <div key={p.key} className="flex flex-col items-center gap-1">
            <div className="flex items-end gap-0.5" style={{ height: 120 }}>
              <Bar h={p.ingresos} max={maxVal} className="w-2.5 rounded-t bg-sky-500" title={`Ingresos ${fmtCLP(p.ingresos)}`} />
              <Bar h={p.egresos} max={maxVal} className="w-2.5 rounded-t bg-amber-500" title={`Egresos ${fmtCLP(p.egresos)}`} />
              <Bar
                h={Math.abs(p.utilidad)}
                max={maxVal}
                className={`w-2.5 rounded-t ${p.utilidad >= 0 ? "bg-emerald-500" : "bg-rose-500"}`}
                title={`Utilidad ${fmtCLP(p.utilidad)}`}
              />
            </div>
            <span className="max-w-[4.5rem] text-center text-[10px] leading-tight text-slate-600">{p.label}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-4 text-[11px] text-slate-600">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-sky-500" /> Ingresos (pagos aprobados)
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-amber-500" /> Egresos
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-emerald-500" /> Utilidad ≥ 0
        </span>
      </div>
    </div>
  );
}

function Bar({ h, max, className, title }: { h: number; max: number; className: string; title: string }) {
  const pct = max > 0 ? Math.max(4, (h / max) * 100) : 0;
  return <div className={className} style={{ height: `${pct}%`, minHeight: h > 0 ? 4 : 0 }} title={title} />;
}

export function RentabilidadAdminPage() {
  const location = useLocation();
  const q = useQuery({ queryKey: ["profitability"], queryFn: () => apiGet<ProfitResponse>("/reports/profitability") });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [trendModalOpen, setTrendModalOpen] = useState(false);
  const [tripModalOpen, setTripModalOpen] = useState(false);
  const [modalStack, setModalStack] = useState<string[]>([]);

  function pushModal(key: string) {
    setModalStack((prev) => (prev[prev.length - 1] === key ? prev : [...prev, key]));
  }

  function closeTopModal() {
    const top = modalStack[modalStack.length - 1];
    if (!top) return;
    if (top === "trend") setTrendModalOpen(false);
    if (top === "trip") setTripModalOpen(false);
    setModalStack((prev) => prev.slice(0, -1));
  }

  useLayoutEffect(() => {
    if (location.hash !== "#ingresos-mensual") return;
    const scroll = () => document.getElementById("ingresos-mensual")?.scrollIntoView({ block: "start", behavior: "instant" });
    scroll();
    requestAnimationFrame(() => scroll());
  }, [location.pathname, location.hash]);

  const data = q.data ?? { byTrip: [], byMonth: [] };

  const filteredTrips = useMemo(() => {
    const s = search.trim().toLowerCase();
    return data.byTrip.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false;
      if (!s) return true;
      return (
        r.customer.toLowerCase().includes(s) ||
        r.route.toLowerCase().includes(s) ||
        r.shipmentId.toLowerCase().includes(s)
      );
    });
  }, [data.byTrip, search, statusFilter]);

  const tripTotals = useMemo(() => {
    let cobrado = 0;
    let egreso = 0;
    for (const r of filteredTrips) {
      cobrado += parseNum(r.ingresoCobrado);
      egreso += parseNum(r.egreso);
    }
    return { cobrado, egreso, utilidad: cobrado - egreso };
  }, [filteredTrips]);

  const statusOptions = useMemo(() => {
    const set = new Set(data.byTrip.map((t) => t.status));
    return [...set].sort();
  }, [data.byTrip]);

  if (q.isLoading) return <p className="p-4 text-sm text-slate-500">Cargando rentabilidad…</p>;
  if (q.isError) return <p className="p-4 text-sm text-rose-600">{(q.error as Error).message}</p>;

  return (
    <div className="page-stack">
      <header className="page-header">
        <h1 className="text-xl font-semibold">Rentabilidad</h1>
        <p className="text-sm text-blue-100">
          Ingresos = pagos <strong>aprobados</strong> vinculados al envío. Egresos = gastos registrados en el envío. Utilidad real = cobrado −
          egreso (por fila y en el resumen filtrado).
        </p>
      </header>
      <div
        className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200/80 bg-slate-50/80 px-2 py-2"
        role="toolbar"
        aria-label="Atención rápida en rentabilidad"
      >
        <a
          href="#ingresos-mensual"
          className="inline-flex items-center gap-1 rounded-full border border-cyan-200 bg-cyan-50/90 px-3 py-1.5 text-xs font-semibold text-cyan-950 shadow-sm ring-1 ring-cyan-900/5 hover:bg-cyan-100/80"
          onClick={(e) => {
            e.preventDefault();
            setTrendModalOpen(true);
            pushModal("trend");
          }}
        >
          Tendencia mensual
        </a>
        <a
          href="#utilidad-por-viaje"
          className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50/90 px-3 py-1.5 text-xs font-semibold text-emerald-950 shadow-sm ring-1 ring-emerald-900/5 hover:bg-emerald-100/80"
          onClick={(e) => {
            e.preventDefault();
            setTripModalOpen(true);
            pushModal("trip");
          }}
        >
          Utilidad por viaje
        </a>
        <div className="inline-flex items-center gap-0.5 rounded-full border border-slate-200 bg-white p-0.5 shadow-sm ring-1 ring-slate-900/5">
          <Link
            to="/admin/pagos"
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100"
          >
            Pagos
          </Link>
          <Link
            to="/admin/reportes"
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100"
          >
            Reportes
          </Link>
        </div>
      </div>

      <section className="grid gap-3 md:grid-cols-3">
        {data.byMonth.slice(-3).map((m) => (
          <div key={m.month} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <p className="text-xs text-slate-500">{monthLabel(m.month)}</p>
            <p className="text-sm">
              Ingresos: <strong>{fmtCLP(parseNum(m.ingresos))}</strong>
            </p>
            <p className="text-sm">
              Egresos: <strong>{fmtCLP(parseNum(m.egresos))}</strong>
            </p>
            <p className="text-sm">
              Utilidad:{" "}
              <strong className={parseNum(m.utilidad) < 0 ? "text-rose-600" : "text-emerald-700"}>{fmtCLP(parseNum(m.utilidad))}</strong>
            </p>
          </div>
        ))}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">Interacciones flotantes</h2>
        <p className="mt-1 text-xs text-slate-600">
          Para mantener esta vista limpia, la tendencia mensual y el detalle por viaje se abren en ventanas flotantes.
        </p>
        <div className="mt-3 row">
          <button className="btn-primary" type="button" onClick={() => { setTrendModalOpen(true); pushModal("trend"); }}>
            Abrir tendencia mensual
          </button>
          <button className="btn-secondary" type="button" onClick={() => { setTripModalOpen(true); pushModal("trip"); }}>
            Abrir utilidad por viaje
          </button>
        </div>
      </section>

      {trendModalOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true" onClick={closeTopModal}>
          <div className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-t-2xl border border-slate-200 bg-white p-4 shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 id="ingresos-mensual" className="text-base font-semibold text-slate-900">Tendencia mensual (año en curso)</h3>
              <button className="btn-secondary btn-sm" type="button" onClick={closeTopModal}>{modalStack.length > 1 ? "Volver" : "Cerrar"}</button>
            </div>
            <MonthlyBars months={data.byMonth} />
          </div>
        </div>
      ) : null}

      {tripModalOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true" onClick={closeTopModal}>
          <div className="max-h-[92vh] w-full max-w-6xl overflow-auto rounded-t-2xl border border-slate-200 bg-white p-4 shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 id="utilidad-por-viaje" className="text-base font-semibold text-slate-900">Utilidad por viaje</h3>
              <button className="btn-secondary btn-sm" type="button" onClick={closeTopModal}>{modalStack.length > 1 ? "Volver" : "Cerrar"}</button>
            </div>
            <div className="mb-3 flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600">Buscar</label>
                <input
                  className="mt-1 rounded border border-slate-300 px-2 py-1 text-sm"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cliente, ruta o ID…"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600">Estado envío</label>
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
            </div>
            <div className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <span className="mr-4">
                Viajes en vista: <strong>{filteredTrips.length}</strong>
              </span>
              <span className="mr-4">
                Cobrado: <strong>{fmtCLP(tripTotals.cobrado)}</strong>
              </span>
              <span className="mr-4">
                Egresos: <strong>{fmtCLP(tripTotals.egreso)}</strong>
              </span>
              <span>
                Utilidad:{" "}
                <strong className={tripTotals.utilidad < 0 ? "text-rose-600" : "text-emerald-700"}>{fmtCLP(tripTotals.utilidad)}</strong>
              </span>
            </div>
            <div className="table-wrap">
              <table className="table-pro">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Ruta</th>
                    <th>Cliente</th>
                    <th>Estado</th>
                    <th>Cobrado</th>
                    <th>Egreso</th>
                    <th>Utilidad real</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTrips.map((r) => (
                    <tr key={r.shipmentId}>
                      <td>{new Date(r.createdAt).toLocaleDateString()}</td>
                      <td>{r.route}</td>
                      <td>{r.customer}</td>
                      <td className="text-xs">{r.status}</td>
                      <td>{fmtCLP(parseNum(r.ingresoCobrado))}</td>
                      <td>{fmtCLP(parseNum(r.egreso))}</td>
                      <td className={parseNum(r.utilidadReal) < 0 ? "text-rose-600" : "text-emerald-700"}>
                        {fmtCLP(parseNum(r.utilidadReal))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredTrips.length === 0 ? <p className="mt-2 text-sm text-slate-500">Sin filas con los filtros actuales.</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
