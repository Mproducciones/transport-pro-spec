import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { LayoutDashboard, Wallet } from "lucide-react";
import { apiGet } from "../../api/client.js";

type ShipmentMini = {
  id: string;
  origin: string;
  destination: string;
  status: string;
  totalAmount?: string | null;
  amount?: string | null;
  customer: { name: string };
  driver?: { id: string; fullName: string } | null;
  createdAt: string;
};

type MarketplaceView = "resumen" | "cargas";

function fmtCLP(value: unknown): string {
  return Number(value).toLocaleString("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  });
}

const MARKETPLACE_BETA_ENABLED = (import.meta.env.VITE_MARKETPLACE_BETA ?? "true") === "true";

export function MarketplaceAdminPage() {
  const [view, setView] = useState<MarketplaceView>("resumen");
  const [commissionPct, setCommissionPct] = useState("8");
  const [avgTicket, setAvgTicket] = useState("350000");
  const [projectedTrips, setProjectedTrips] = useState("120");
  const shipmentsQ = useQuery({ queryKey: ["shipments", "marketplace"], queryFn: () => apiGet<ShipmentMini[]>("/shipments") });

  const rows = shipmentsQ.data ?? [];
  const cargasAbiertas = useMemo(
    () => rows.filter((s) => ["pendiente", "confirmado"].includes(s.status) && !s.driver?.id),
    [rows]
  );
  const viajesActivos = useMemo(
    () => rows.filter((s) => ["recogido", "en_transito"].includes(s.status)),
    [rows]
  );
  const gmvAproximado = useMemo(
    () => rows.reduce((sum, s) => sum + Number(s.totalAmount ?? s.amount ?? 0), 0),
    [rows]
  );
  const possibleCommissionNow = useMemo(() => gmvAproximado * (Number(commissionPct || 0) / 100), [gmvAproximado, commissionPct]);
  const projectedCommission = useMemo(
    () => Number(avgTicket || 0) * Number(projectedTrips || 0) * (Number(commissionPct || 0) / 100),
    [avgTicket, projectedTrips, commissionPct]
  );

  if (!MARKETPLACE_BETA_ENABLED) {
    return (
      <div className="page-stack">
        <header className="page-header">
          <h1 className="text-xl font-semibold">Marketplace (beta)</h1>
          <p className="text-sm text-blue-100">Módulo desactivado por configuración.</p>
        </header>
        <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
          Activá <code>VITE_MARKETPLACE_BETA=true</code> para habilitar este módulo.
        </section>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <header className="page-header">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Marketplace (beta)</h1>
            <p className="text-sm text-blue-100">
              Canal adicional tipo app de carga pesada: captar demanda externa y cobrar comisión por servicio.
            </p>
          </div>
          <Link to="/admin/dashboard" className="btn-secondary">
            Volver a Inicio
          </Link>
        </div>
      </header>

      <nav
        className="sticky top-2 z-20 rounded-xl border border-slate-200 bg-slate-100/95 p-1 shadow-sm backdrop-blur-md"
        role="tablist"
        aria-label="Vistas de marketplace"
      >
        <div className="grid grid-cols-2 gap-1">
          {(
            [
              ["resumen", "Resumen", LayoutDashboard, cargasAbiertas.length] as const,
              ["cargas", "Cargas", Wallet, viajesActivos.length] as const,
            ] as const
          ).map(([id, label, Icon, badge]) => {
            const selected = view === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setView(id)}
                className={`flex min-h-[3rem] flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-2 text-center text-[11px] font-semibold transition sm:flex-row sm:gap-2 sm:text-xs ${
                  selected
                    ? "bg-white text-blue-800 shadow-sm ring-2 ring-blue-300/60"
                    : "text-slate-600 hover:bg-white/85 hover:text-slate-900"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
                <span>{label}</span>
                <span className="rounded-full bg-blue-100 px-1.5 text-[10px] font-bold text-blue-900 tabular-nums">{badge}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {view === "resumen" ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="card border-l-4 border-amber-500">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Cargas abiertas</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{cargasAbiertas.length}</p>
            </div>
            <div className="card border-l-4 border-cyan-500">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Viajes activos</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{viajesActivos.length}</p>
            </div>
            <div className="card border-l-4 border-blue-500">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">GMV aprox. operativo</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{fmtCLP(gmvAproximado)}</p>
            </div>
            <div className="card border-l-4 border-emerald-500">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Comisión estimada</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{fmtCLP(possibleCommissionNow)}</p>
              <p className="text-xs text-slate-500">{commissionPct}% sobre GMV</p>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200/90 bg-slate-50/70 p-4">
            <h2 className="m-0 text-sm font-bold uppercase tracking-wide text-slate-700">Simulador de comisión</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-medium text-slate-600">Comisión %</label>
                <input className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" value={commissionPct} onChange={(e) => setCommissionPct(e.target.value)} inputMode="decimal" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600">Ticket promedio</label>
                <input className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" value={avgTicket} onChange={(e) => setAvgTicket(e.target.value)} inputMode="decimal" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600">Viajes proyectados/mes</label>
                <input className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" value={projectedTrips} onChange={(e) => setProjectedTrips(e.target.value)} inputMode="numeric" />
              </div>
            </div>
            <p className="mt-3 text-sm text-slate-700">
              Comisión mensual proyectada: <strong className="tabular-nums">{fmtCLP(projectedCommission)}</strong>
            </p>
          </section>

          <section className="rounded-xl border border-slate-200/90 bg-white p-4">
            <h2 className="m-0 text-sm font-bold uppercase tracking-wide text-slate-700">Checklist lanzamiento</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
              <li>Definir comisión base (ej. 8%) y excepción por cliente corporativo.</li>
              <li>Definir política de verificación de transportistas y documentos.</li>
              <li>Publicar términos de servicio y cobertura/seguro por tipo de carga.</li>
              <li>Activar piloto cerrado (clientes y transportistas invitados).</li>
            </ul>
          </section>
        </>
      ) : (
        <section className="rounded-xl border border-slate-200/90 bg-white p-4">
          <h2 className="m-0 text-sm font-bold uppercase tracking-wide text-slate-700">Cargas abiertas (simuladas con envíos sin conductor)</h2>
          <p className="mt-1 text-xs text-slate-600">
            Esta primera versión usa los envíos pendientes/confirmados sin chofer como bolsa de cargas. Luego podemos separar entidad
            propia de marketplace.
          </p>
          {cargasAbiertas.length === 0 ? (
            <p className="mt-3 text-sm text-slate-600">No hay cargas abiertas en este momento.</p>
          ) : (
            <div className="mt-3 table-wrap overflow-x-auto rounded-lg border border-slate-200">
              <table className="table-pro w-full text-sm">
                <caption className="sr-only">Cargas abiertas para marketplace</caption>
                <thead>
                  <tr>
                    <th>Servicio</th>
                    <th>Cliente</th>
                    <th>Estado</th>
                    <th>Tarifa</th>
                    <th>Creado</th>
                  </tr>
                </thead>
                <tbody>
                  {cargasAbiertas.map((s) => (
                    <tr key={s.id}>
                      <td>{s.origin} → {s.destination}</td>
                      <td>{s.customer.name}</td>
                      <td>{s.status}</td>
                      <td className="tabular-nums">{fmtCLP(s.totalAmount ?? s.amount ?? 0)}</td>
                      <td>{new Date(s.createdAt).toLocaleDateString("es-CL")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

