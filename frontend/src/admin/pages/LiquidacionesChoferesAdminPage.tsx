import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet, apiSend } from "../../api/client.js";
import { notify } from "../../lib/notify.js";

type SettlementRow = {
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
  createdAt: string;
  driver: { id: string; fullName: string };
};

export function LiquidacionesChoferesAdminPage() {
  const qc = useQueryClient();
  const [bonus, setBonus] = useState("");
  const [deduction, setDeduction] = useState("");
  const [notes, setNotes] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["settlements", "admin"],
    queryFn: () => apiGet<SettlementRow[]>("/settlements"),
  });
  const settingsQ = useQuery({
    queryKey: ["settings", "liquidaciones-hint"],
    queryFn: () => apiGet<{ company: { driverCommissionPercent?: unknown } | null }>("/settings"),
  });
  const commissionPct = settingsQ.data?.company?.driverCommissionPercent;
  const commissionLabel =
    commissionPct !== undefined && commissionPct !== null ? `${Number(commissionPct)}%` : "40% (predeterminado si no configuraste otra)";

  const updateRow = useMutation({
    mutationFn: (p: { id: string; close?: boolean }) =>
      apiSend(`/settlements/${p.id}`, "PATCH", {
        ...(p.close ? { status: "cerrado" } : {}),
        ...(bonus.trim() !== "" ? { bonusAmount: Number(bonus) } : {}),
        ...(deduction.trim() !== "" ? { deductionAmount: Number(deduction) } : {}),
        notes: notes.trim() || undefined,
      }),
    onSuccess: (_data, variables) => {
      if (variables.close) {
        notify("success", "Liquidación cerrada: quedó registrada para el chofer y en el historial.");
      } else {
        notify("success", "Bonos, descuentos y notas guardados en esta liquidación.");
      }
      setLocalError(null);
      void qc.invalidateQueries({ queryKey: ["settlements"] });
    },
    onError: (e: Error) => notify("error", e.message),
  });

  const selectedSettlement = (q.data ?? []).find((s) => s.id === selectedId) ?? null;

  // Sync del formulario cuando cambia la fila seleccionada.
  useEffect(() => {
    if (!selectedSettlement) {
      setBonus("");
      setDeduction("");
      setNotes("");
      setLocalError(null);
      return;
    }
    setBonus(String(selectedSettlement.bonusAmount ?? "0"));
    setDeduction(String(selectedSettlement.deductionAmount ?? "0"));
    setNotes(selectedSettlement.notes ?? "");
    setLocalError(null);
  }, [selectedSettlement?.id]);

  const gross = Number(selectedSettlement?.grossAmount ?? 0);
  const currentBonus = Number(bonus || 0);
  const currentDeduction = Number(deduction || 0);
  const projectedNet = gross + currentBonus - currentDeduction;

  const settlementDirty = useMemo(() => {
    if (!selectedSettlement) return false;
    const b = Number(selectedSettlement.bonusAmount);
    const d = Number(selectedSettlement.deductionAmount);
    const n = (selectedSettlement.notes ?? "").trim();
    return (
      currentBonus !== b || currentDeduction !== d || notes.trim() !== n
    );
  }, [selectedSettlement, currentBonus, currentDeduction, notes]);

  function validateAmounts(): boolean {
    if (!Number.isFinite(currentBonus) || currentBonus < 0) {
      setLocalError("El bono debe ser un número mayor o igual a 0.");
      return false;
    }
    if (!Number.isFinite(currentDeduction) || currentDeduction < 0) {
      setLocalError("El descuento debe ser un número mayor o igual a 0.");
      return false;
    }
    if (!Number.isFinite(projectedNet) || projectedNet < 0) {
      setLocalError("El neto proyectado no puede ser negativo.");
      return false;
    }
    setLocalError(null);
    return true;
  }

  return (
    <div className="page-stack">
      <header className="page-header">
        <h1 className="text-xl font-semibold">Liquidaciones de choferes</h1>
        <p className="text-sm text-blue-100">
          Revisa el cálculo, aplica bonos o descuentos y confirma el cierre antes de pagar.
        </p>
      </header>
      <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">Cómo funciona</h2>
        <p className="mt-2 text-xs text-slate-600">
          El chofer arma una <strong>pre-liquidación</strong> en su app (día/semana/mes); solo entran envíos <strong>entregados</strong> en ese rango. Acá ves{" "}
          <strong>borradores y cierres</strong>: bruto = base × comisión ({commissionLabel}); el <strong>neto</strong> suma bono y resta descuento. La comisión global se edita en{" "}
          <Link className="font-semibold text-blue-700 underline" to="/admin/precios?tab=global">
            Precios y tarifas → Parámetros globales
          </Link>
          .
        </p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        {q.isLoading ? <p className="text-sm text-slate-500">Cargando…</p> : null}
        {q.isError ? <p className="text-sm text-rose-600">{(q.error as Error).message}</p> : null}
        <div className="table-wrap">
          <table className="table-pro text-sm">
            <thead>
              <tr>
                <th>Chofer</th>
                <th>Período</th>
                <th>Entregas</th>
                <th>Bruto</th>
                <th>Neto</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(q.data ?? []).map((s) => (
                <tr key={s.id}>
                  <td>{s.driver.fullName}</td>
                  <td className="text-xs">
                    {new Date(s.periodStart).toLocaleDateString()} – {new Date(s.periodEnd).toLocaleDateString()}
                  </td>
                  <td>{s.entregasCount}</td>
                  <td>{fmtCLP(s.grossAmount)}</td>
                  <td>{fmtCLP(s.netAmount)}</td>
                  <td>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        s.status === "cerrado" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"
                      }`}
                    >
                      {s.status === "cerrado" ? "Cerrado" : "Borrador"}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="text-xs font-semibold text-blue-700 hover:underline"
                      onClick={() => setSelectedId(s.id)}
                    >
                      {selectedId === s.id ? "Seleccionado" : "Editar"}
                    </button>
                    {s.status === "borrador" ? (
                      <button
                        type="button"
                        className="ml-2 text-xs font-semibold text-amber-800 hover:underline"
                        onClick={() => setSelectedId(s.id)}
                      >
                        Cerrar
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!q.isLoading && !q.isError && (q.data?.length ?? 0) === 0 ? (
          <p className="mt-3 text-sm text-slate-600">
            No hay liquidaciones. El chofer puede crear una desde su app; en <strong>demo</strong>, desde la carpeta{" "}
            <code className="rounded bg-slate-100 px-1 text-xs">backend</code> ejecutá{" "}
            <code className="rounded bg-slate-100 px-1 text-xs">npm run db:seed</code> (incluye dos filas de ejemplo) y recargá. Usá un admin del mismo tenant (p. ej.{" "}
            <code className="rounded bg-slate-100 px-1 text-xs">admin@demo.com</code>).
          </p>
        ) : null}
      </section>

      {selectedSettlement ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-amber-950">Editar liquidación</h2>
          <p className="text-xs text-amber-900">
            Conductor: <strong>{selectedSettlement.driver.fullName}</strong> · Período:{" "}
            {new Date(selectedSettlement.periodStart).toLocaleDateString()} –{" "}
            {new Date(selectedSettlement.periodEnd).toLocaleDateString()}
          </p>
          <div className="mt-2 grid gap-2 text-xs sm:grid-cols-3">
            <p className="rounded bg-white/80 px-2 py-1">Bruto: <strong>{fmtCLP(selectedSettlement.grossAmount)}</strong></p>
            <p className="rounded bg-white/80 px-2 py-1">Bono: <strong>{fmtCLP(currentBonus)}</strong></p>
            <p className="rounded bg-white/80 px-2 py-1">Descuento: <strong>{fmtCLP(currentDeduction)}</strong></p>
          </div>
          <p className="mt-2 rounded bg-amber-100 px-2 py-1 text-sm font-semibold text-amber-950">
            Neto proyectado: {fmtCLP(projectedNet)}
          </p>
          <input
            className="mt-2 w-full max-w-xs rounded border border-slate-300 px-2 py-1 text-sm"
            placeholder="Bono"
            value={bonus}
            onChange={(e) => setBonus(e.target.value)}
          />
          <input
            className="mt-2 w-full max-w-xs rounded border border-slate-300 px-2 py-1 text-sm"
            placeholder="Descuento"
            value={deduction}
            onChange={(e) => setDeduction(e.target.value)}
          />
          <textarea
            className="mt-2 w-full max-w-xl rounded border border-slate-300 px-2 py-1 text-sm"
            placeholder="Notas de cierre (opcional)"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          {localError ? <p className="mt-2 text-xs text-rose-700">{localError}</p> : null}
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className={`rounded-lg px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed ${
                settlementDirty
                  ? "bg-slate-800 text-white hover:bg-slate-700"
                  : "border border-emerald-200 bg-emerald-50 text-emerald-900"
              } disabled:opacity-50`}
              title={
                settlementDirty
                  ? "Persistir bono, descuento y notas en esta liquidación"
                  : "Sin cambios respecto a lo ya guardado."
              }
              disabled={updateRow.isPending || !settlementDirty}
              onClick={() => {
                if (!selectedSettlement || !validateAmounts()) return;
                updateRow.mutate({ id: selectedSettlement.id });
              }}
            >
              {settlementDirty ? "Guardar cambios" : "Cambios guardados"}
            </button>
            <button
              type="button"
              className="rounded-lg bg-amber-800 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
              disabled={updateRow.isPending || selectedSettlement.status === "cerrado"}
              onClick={() => {
                if (!selectedSettlement || !validateAmounts()) return;
                updateRow.mutate({ id: selectedSettlement.id, close: true });
              }}
            >
              Confirmar cierre
            </button>
            <button type="button" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" onClick={() => setSelectedId(null)}>
              Cancelar
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function fmtCLP(value: unknown): string {
  return Number(value).toLocaleString("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  });
}
