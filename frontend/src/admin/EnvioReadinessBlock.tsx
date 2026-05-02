import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, CircleDashed } from "lucide-react";
import { apiGet } from "../api/client.js";

type ReadinessData = {
  items: { id: string; label: string; ok: boolean; detail?: string }[];
  canConfirm: boolean;
  canRecoger: boolean;
  canEntregado: boolean;
};

export function EnvioReadinessBlock({ shipmentId }: { shipmentId: string | null }) {
  const q = useQuery({
    queryKey: ["shipments", shipmentId, "readiness"],
    queryFn: () => apiGet<ReadinessData>(`/shipments/${shipmentId}/readiness`),
    enabled: Boolean(shipmentId),
    staleTime: 15_000,
  });
  if (!shipmentId) return null;
  if (q.isLoading) {
    return (
      <p className="mt-2 text-[10px] text-slate-500" aria-hidden>
        Reglas de negocio…
      </p>
    );
  }
  if (q.isError) {
    return (
      <p className="mt-2 text-[10px] text-rose-600" role="alert">
        No se pudo cargar el checklist automático.
      </p>
    );
  }
  const d = q.data;
  if (!d) return null;
  const total = d.items.length;
  const okCount = d.items.filter((it) => it.ok).length;
  const progressPct = total > 0 ? Math.round((okCount / total) * 100) : 0;
  const allReady = total > 0 && okCount === total;

  return (
    <div className="mt-2 rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-sky-50 p-3 shadow-sm" role="region" aria-label="Checklist de automatización">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-900">Checklist (reglas automáticas)</p>
          <p className="mt-0.5 text-[10px] text-indigo-800/90">
            El servidor exige esto antes de aprobar, recoger o cerrar.
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            allReady ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"
          }`}
        >
          {allReady ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
          {okCount}/{total}
        </span>
      </div>

      <div className="mt-2">
        <div className="h-2 overflow-hidden rounded-full bg-indigo-100">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              allReady ? "bg-emerald-500" : "bg-gradient-to-r from-indigo-500 to-sky-500"
            }`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <p className="mt-1 text-[10px] text-slate-600">
          Progreso de cumplimiento: <strong>{progressPct}%</strong>.
        </p>
      </div>

      <p className="mt-2 text-[10px] text-indigo-800/90">
        El servidor exige esto antes de aprobar, recoger o cerrar. Los cambios con error muestran el mismo criterio.
      </p>
      <ul className="mt-2 grid gap-1.5 text-[10px] text-indigo-950 sm:grid-cols-2">
        {d.items.map((it) => (
          <li
            key={it.id}
            className={`rounded-lg border px-2 py-1.5 transition-all ${
              it.ok
                ? "border-emerald-200 bg-emerald-50/80"
                : "border-amber-200 bg-amber-50/80"
            }`}
          >
            <div className="flex items-start gap-1.5">
              <span className="mt-0.5 shrink-0" aria-hidden>
                {it.ok ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />
                ) : (
                  <CircleDashed className="h-3.5 w-3.5 animate-pulse text-amber-700" />
                )}
              </span>
              <span>
                <span className={it.ok ? "font-medium text-emerald-800" : "font-medium text-amber-900"}>{it.label}</span>
                {it.detail ? <span className="ml-1 text-slate-700">· {it.detail}</span> : null}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
