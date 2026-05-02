import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiSend } from "../../api/client.js";
import { notify } from "../../lib/notify.js";

type ShipmentRow = { id: string; origin: string; destination: string; customer: { name: string } };
type ExpenseRow = {
  id: string;
  category: string;
  amount: unknown;
  note?: string | null;
  recordedAt: string;
  shipment: { id: string; origin: string; destination: string; customer: { name: string } };
};

export function EgresosAdminPage() {
  const qc = useQueryClient();
  const shipmentsQ = useQuery({ queryKey: ["shipments"], queryFn: () => apiGet<ShipmentRow[]>("/shipments") });
  const expensesQ = useQuery({ queryKey: ["expenses"], queryFn: () => apiGet<ExpenseRow[]>("/expenses") });

  const [shipmentId, setShipmentId] = useState("");
  const [category, setCategory] = useState("combustible");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [registerModalOpen, setRegisterModalOpen] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [modalStack, setModalStack] = useState<string[]>([]);

  function pushModal(key: string) {
    setModalStack((prev) => (prev[prev.length - 1] === key ? prev : [...prev, key]));
  }

  function closeTopModal() {
    const top = modalStack[modalStack.length - 1];
    if (!top) return;
    if (top === "register") setRegisterModalOpen(false);
    if (top === "history") setHistoryModalOpen(false);
    setModalStack((prev) => prev.slice(0, -1));
  }

  const totals = useMemo(() => {
    const rows = expensesQ.data ?? [];
    let sum = 0;
    const byCat: Record<string, number> = {};
    for (const e of rows) {
      const n = Number(e.amount);
      if (!Number.isFinite(n)) continue;
      sum += n;
      byCat[e.category] = (byCat[e.category] ?? 0) + n;
    }
    return { sum, byCat, count: rows.length };
  }, [expensesQ.data]);

  const create = useMutation({
    mutationFn: () =>
      apiSend("/expenses", "POST", {
        shipmentId,
        category,
        amount: Number(amount),
        note: note || undefined,
      }),
    onSuccess: () => {
      setAmount("");
      setNote("");
      setError(null);
      void qc.invalidateQueries({ queryKey: ["expenses"] });
      notify("success", "Egreso registrado y vinculado al envío seleccionado.");
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="page-stack">
      <header className="page-header">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-wider text-blue-200">Finanzas</p>
            <h1 className="text-xl font-semibold">Egresos operativos</h1>
          </div>
          <button type="button" className="rounded bg-blue-500 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-400" onClick={() => document.getElementById("expense-amount")?.focus()}>
            Agregar egreso
          </button>
        </div>
      </header>
      {error ? <p className="error">{error}</p> : null}
      <div
        className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200/80 bg-slate-50/80 px-2 py-2"
        role="toolbar"
        aria-label="Atención rápida en egresos"
      >
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full border border-cyan-200 bg-cyan-50/90 px-3 py-1.5 text-xs font-semibold text-cyan-950 shadow-sm ring-1 ring-cyan-900/5 hover:bg-cyan-100/80"
          onClick={() => { setRegisterModalOpen(true); pushModal("register"); }}
        >
          Registrar egreso
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50/90 px-3 py-1.5 text-xs font-semibold text-emerald-950 shadow-sm ring-1 ring-emerald-900/5 hover:bg-emerald-100/80"
          onClick={() => { setHistoryModalOpen(true); pushModal("history"); }}
        >
          Ver historial
        </button>
      </div>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Movimientos</p>
          <p className="text-lg font-semibold text-slate-900">{totals.count}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:col-span-2">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Total registrado</p>
          <p className="text-lg font-semibold text-slate-900">{fmtCLP(totals.sum)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm lg:col-span-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Por categoría</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {Object.entries(totals.byCat)
              .sort((a, b) => b[1] - a[1])
              .map(([cat, amount]) => (
                <span key={cat} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-800">
                  {categoryLabel(cat)}: <strong>{fmtCLP(amount)}</strong>
                </span>
              ))}
            {Object.keys(totals.byCat).length === 0 ? <span className="text-xs text-slate-500">Sin egresos aún.</span> : null}
          </div>
        </div>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">Interacciones flotantes</h2>
        <p className="mt-1 text-xs text-slate-600">
          Para mantener esta página liviana, el alta y el historial se gestionan en ventanas flotantes.
        </p>
        <div className="mt-3 row">
          <button className="btn-primary" type="button" onClick={() => { setRegisterModalOpen(true); pushModal("register"); }}>
            Abrir alta de egreso
          </button>
          <button className="btn-secondary" type="button" onClick={() => { setHistoryModalOpen(true); pushModal("history"); }}>
            Abrir historial
          </button>
        </div>
      </section>

      {registerModalOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true" onClick={closeTopModal}>
          <div className="w-full max-w-lg rounded-t-2xl border border-slate-200 bg-white p-4 shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-slate-900">Registrar egreso</h3>
              <button type="button" className="btn-secondary btn-sm" onClick={closeTopModal}>{modalStack.length > 1 ? "Volver" : "Cerrar"}</button>
            </div>
            <label>Envío</label>
            <select value={shipmentId} onChange={(e) => setShipmentId(e.target.value)}>
              <option value="">—</option>
              {(shipmentsQ.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.origin} {"->"} {s.destination} ({s.customer.name})
                </option>
              ))}
            </select>
            <label>Categoría</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="combustible">Combustible</option>
              <option value="peajes">Peajes</option>
              <option value="peoneta">Peoneta</option>
              <option value="mantenimiento">Mantenimiento</option>
              <option value="otros">Otros</option>
            </select>
            <label>Monto</label>
            <input id="expense-amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <label>Nota</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} />
            <button
              type="button"
              className="btn-primary mt-3"
              disabled={!shipmentId || !amount || create.isPending}
              onClick={() => create.mutate()}
            >
              Registrar egreso
            </button>
          </div>
        </div>
      ) : null}

      {historyModalOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true" onClick={closeTopModal}>
          <div className="max-h-[92vh] w-full max-w-5xl overflow-auto rounded-t-2xl border border-slate-200 bg-white p-4 shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-slate-900">Historial de egresos</h3>
              <button type="button" className="btn-secondary btn-sm" onClick={closeTopModal}>{modalStack.length > 1 ? "Volver" : "Cerrar"}</button>
            </div>
            <div className="table-wrap">
              <table className="table-pro">
                <thead>
                  <tr>
                    <th>Envío</th>
                    <th>Categoría</th>
                    <th>Monto</th>
                    <th>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {(expensesQ.data ?? []).map((e) => (
                    <tr key={e.id}>
                      <td>
                        {e.shipment.origin} {"->"} {e.shipment.destination}
                      </td>
                      <td>{categoryLabel(e.category)}</td>
                      <td>{fmtCLP(e.amount)}</td>
                      <td>{new Date(e.recordedAt).toLocaleString("es-CL")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
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

function categoryLabel(value: string): string {
  if (value === "combustible") return "Combustible";
  if (value === "peajes") return "Peajes";
  if (value === "peoneta") return "Peoneta";
  if (value === "mantenimiento") return "Mantenimiento";
  if (value === "otros") return "Otros";
  return value;
}

