import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { FileText, LayoutDashboard, Search, X } from "lucide-react";
import { apiBlob, apiGet, apiSend, downloadBlob } from "../../api/client.js";
import { notify } from "../../lib/notify.js";

const facturaModalShell = "fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4";

type CustomerRow = { id: string; name: string };
type ShipmentMini = { id: string; origin: string; destination: string; customer: { id: string } };
type InvoiceRow = {
  id: string;
  number: string;
  status: string;
  total: unknown;
  subtotal?: unknown;
  taxAmount?: unknown;
  notes?: string | null;
  issueDate: string;
  dueDate?: string | null;
  customer: { name: string };
  payments?: Array<{ id: string; amount: unknown; paidAt: string; verificationStatus?: string }>;
};

type LineForm = { description: string; quantity: string; unitPrice: string; shipmentId: string };

type InvoiceSortKey = "issueDate" | "number" | "customer" | "total";
type FacturasAdminVista = "inicio" | "documentos";

function invoiceStatusLabel(status: string): string {
  if (status === "emitida") return "Emitida";
  if (status === "anulada") return "Anulada";
  if (status === "pagada") return "Pagada";
  return status;
}

function approvedPaid(inv: InvoiceRow): number {
  return (inv.payments ?? [])
    .filter((p) => p.verificationStatus === "aprobado")
    .reduce((s, p) => s + Number(p.amount ?? 0), 0);
}

function invoiceBalance(inv: InvoiceRow): number {
  return Math.max(0, Number(inv.total ?? 0) - approvedPaid(inv));
}

export function FacturasAdminPage() {
  const qc = useQueryClient();
  const customersQ = useQuery({ queryKey: ["customers"], queryFn: () => apiGet<CustomerRow[]>("/customers") });
  const shipmentsQ = useQuery({ queryKey: ["shipments"], queryFn: () => apiGet<ShipmentMini[]>("/shipments") });
  const invoicesQ = useQuery({ queryKey: ["invoices"], queryFn: () => apiGet<InvoiceRow[]>("/invoices") });

  const [formModalOpen, setFormModalOpen] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [taxRate, setTaxRate] = useState("19");
  const [lines, setLines] = useState<LineForm[]>([
    { description: "", quantity: "1", unitPrice: "0", shipmentId: "" },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState<InvoiceSortKey>("issueDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [mainView, setMainView] = useState<FacturasAdminVista>("documentos");

  function addLine() {
    setLines((prev) => [...prev, { description: "", quantity: "1", unitPrice: "0", shipmentId: "" }]);
  }

  function removeLine(index: number) {
    setLines((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  }

  async function downloadExport(inv: InvoiceRow, kind: "pdf" | "xml") {
    setExportMsg(null);
    try {
      const blob = await apiBlob(`/invoices/${inv.id}/export.${kind}`);
      const safe = inv.number.replace(/[^\w.-]+/g, "_");
      downloadBlob(blob, kind === "pdf" ? `factura-${safe}.pdf` : `factura-${safe}.xml`);
    } catch (e) {
      setExportMsg(e instanceof Error ? e.message : "Error al descargar");
    }
  }

  const create = useMutation({
    mutationFn: () =>
      apiSend("/invoices", "POST", {
        customerId,
        taxRate: Number(taxRate),
        lines: lines.map((l) => ({
          description: l.description,
          quantity: Number(l.quantity),
          unitPrice: Number(l.unitPrice),
          shipmentId: l.shipmentId || undefined,
        })),
      }),
    onSuccess: () => {
      setError(null);
      setFormModalOpen(false);
      setCustomerId("");
      setLines([{ description: "", quantity: "1", unitPrice: "0", shipmentId: "" }]);
      void qc.invalidateQueries({ queryKey: ["invoices"] });
      notify("success", "Documento registrado. Aparece en la tabla; podés bajar PDF o XML cuando esté emitida o pagada.");
    },
    onError: (e: Error) => setError(e.message),
  });

  const anular = useMutation({
    mutationFn: (id: string) => apiSend(`/invoices/${id}`, "PATCH", { status: "anulada" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["invoices"] });
      notify("success", "Factura anulada en el sistema.");
    },
    onError: (e: Error) => setError(e.message),
  });

  const shipmentsForCustomer = (shipmentsQ.data ?? []).filter(
    (s) => !customerId || s.customer.id === customerId
  );
  const dueSoon = (invoicesQ.data ?? [])
    .filter((i) => i.status === "emitida" && i.dueDate)
    .sort((a, b) => new Date(a.dueDate ?? "").getTime() - new Date(b.dueDate ?? "").getTime())
    .slice(0, 8);
  const overdueInvoices = (invoicesQ.data ?? [])
    .filter((i) => i.status === "emitida" && i.dueDate && invoiceBalance(i) > 0.009 && new Date(i.dueDate).getTime() < Date.now())
    .sort((a, b) => new Date(a.dueDate ?? "").getTime() - new Date(b.dueDate ?? "").getTime());

  const allInvoices = invoicesQ.data ?? [];
  const stats = useMemo(() => {
    const vigentes = allInvoices.filter((i) => i.status !== "anulada");
    const totalFacturado = vigentes.reduce((s, i) => s + Number(i.total ?? 0), 0);
    const pendienteCobro = vigentes.reduce((s, i) => s + invoiceBalance(i), 0);
    const month = new Date().getMonth();
    const year = new Date().getFullYear();
    const pagadoEsteMes = vigentes.reduce((sum, inv) => {
      const paid = (inv.payments ?? [])
        .filter((p) => p.verificationStatus === "aprobado")
        .filter((p) => {
          const d = new Date(p.paidAt);
          return d.getMonth() === month && d.getFullYear() === year;
        })
        .reduce((s, p) => s + Number(p.amount ?? 0), 0);
      return sum + paid;
    }, 0);
    return {
      totalDocs: allInvoices.length,
      totalFacturado,
      pendienteCobro,
      pagadoEsteMes,
      porVencer: dueSoon.length,
    };
  }, [allInvoices, dueSoon.length]);

  const displayedInvoices = useMemo(() => {
    const q = invoiceSearch.trim().toLowerCase();
    const fromT = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
    const toT = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : null;
    let rows = allInvoices.filter((inv) => {
      const t = new Date(inv.issueDate).getTime();
      if (fromT !== null && t < fromT) return false;
      if (toT !== null && t > toT) return false;
      if (!q) return true;
      const st = invoiceStatusLabel(inv.status).toLowerCase();
      return (
        inv.number.toLowerCase().includes(q) ||
        inv.customer.name.toLowerCase().includes(q) ||
        st.includes(q)
      );
    });
    const dir = sortDir === "asc" ? 1 : -1;
    rows = [...rows].sort((a, b) => {
      let c = 0;
      if (sortBy === "issueDate") {
        c = new Date(a.issueDate).getTime() - new Date(b.issueDate).getTime();
      } else if (sortBy === "total") {
        c = Number(a.total) - Number(b.total);
      } else if (sortBy === "number") {
        c = a.number.localeCompare(b.number, "es", { numeric: true });
      } else {
        c = a.customer.name.localeCompare(b.customer.name, "es", { sensitivity: "base" });
      }
      return c * dir;
    });
    return rows;
  }, [allInvoices, invoiceSearch, dateFrom, dateTo, sortBy, sortDir]);

  const canSubmit =
    Boolean(customerId) && !create.isPending && lines.length > 0 && lines.every((l) => l.description.trim().length > 0);

  return (
    <div className="page-stack max-w-6xl">
      <header className="page-header">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold">Facturas y documentos de cobro</h1>
            <p className="mt-1 text-sm text-blue-100/95">
              Registrá montos e IVA en el sistema; luego descargá PDF o XML para el cliente o la contabilidad.
            </p>
          </div>
          <button
            type="button"
            className="shrink-0 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 shadow ring-1 ring-slate-900/10 hover:bg-slate-50"
            onClick={() => {
              setError(null);
              setFormModalOpen(true);
            }}
          >
            Nuevo documento
          </button>
        </div>
      </header>

      <details className="rounded-xl border border-amber-200/90 bg-amber-50/60 text-sm text-amber-950 shadow-sm ring-1 ring-amber-900/5">
        <summary className="cursor-pointer list-none px-4 py-3 font-semibold text-amber-950 marker:content-none [&::-webkit-details-marker]:hidden">
          SII, DTE y contadores (Chile) — <span className="font-normal text-amber-900/85">ampliar</span>
        </summary>
        <div className="border-t border-amber-200/80 px-4 pb-4 pt-1">
          <ul className="list-disc space-y-2 pl-5 leading-relaxed">
            <li>
              <strong>Emitir aquí</strong> guarda un documento numerado en la plataforma (líneas, IVA, totales) en la tabla de abajo. No
              sustituye la <strong>factura electrónica (DTE)</strong> ante el SII: eso va por tu software certificado o flujo contable.
            </li>
            <li>
              <strong>PDF y XML</strong> en cada fila emitida sirven de respaldo o adjunto. Volcado masivo:{" "}
              <Link className="font-semibold underline" to="/admin/reportes">
                Exportaciones (CSV)
              </Link>
              .
            </li>
            <li>
              El <strong>portal del cliente</strong> puede listar facturas según permisos.
            </li>
          </ul>
        </div>
      </details>

      {exportMsg ? <p className="error">{exportMsg}</p> : null}
      {error && !formModalOpen ? <p className="error">{error}</p> : null}
      <div
        className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200/80 bg-slate-50/80 px-2 py-2"
        role="toolbar"
        aria-label="Atención rápida en facturación"
      >
        <button
          type="button"
          onClick={() => setMainView("inicio")}
          className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-950 shadow-sm ring-1 ring-violet-900/5 hover:bg-violet-100/90"
        >
          Resumen de facturación
        </button>
        <button
          type="button"
          onClick={() => {
            setMainView("documentos");
            document.getElementById("facturas-documentos")?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
          className="inline-flex items-center gap-1 rounded-full border border-cyan-200 bg-cyan-50/90 px-3 py-1.5 text-xs font-semibold text-cyan-950 shadow-sm ring-1 ring-cyan-900/5 hover:bg-cyan-100/80"
        >
          Lista de documentos
        </button>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setFormModalOpen(true);
          }}
          className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50/90 px-3 py-1.5 text-xs font-semibold text-emerald-950 shadow-sm ring-1 ring-emerald-900/5 hover:bg-emerald-100/80"
        >
          Nuevo documento
        </button>
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

      <nav
        className="sticky top-2 z-20 rounded-xl border border-slate-200 bg-slate-100/95 p-1 shadow-sm backdrop-blur-md"
        role="tablist"
        aria-label="Vistas de facturación admin"
      >
        <div className="grid grid-cols-2 gap-1">
          {(
            [
              ["inicio", "Resumen", LayoutDashboard, stats.porVencer] as const,
              ["documentos", "Documentos", FileText, displayedInvoices.length] as const,
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
                    ? "bg-white text-blue-800 shadow-sm ring-2 ring-blue-300/60"
                    : "text-slate-600 hover:bg-white/85 hover:text-slate-900"
                }`}
                onClick={() => setMainView(tabId as FacturasAdminVista)}
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

      {formModalOpen ? (
        <div
          className={facturaModalShell}
          role="dialog"
          aria-modal="true"
          aria-labelledby="factura-form-modal-title"
          onClick={() => setFormModalOpen(false)}
        >
          <div
            className="flex max-h-[min(94vh,800px)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:max-h-[min(90vh,760px)] sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2 border-b border-slate-200 px-4 py-3">
              <div>
                <h2 id="factura-form-modal-title" className="text-base font-semibold text-slate-900">
                  Nueva emisión
                </h2>
                <p className="text-xs text-slate-600">
                  Cliente, IVA y líneas. <strong>+ Agregar línea</strong> si llevá varios ítems; <strong>Quitar línea</strong> con cuidado
                  (mínimo una).
                </p>
              </div>
              <button
                type="button"
                className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                onClick={() => setFormModalOpen(false)}
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div
              className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3 text-slate-800 [&_label]:text-slate-700"
              onFocusCapture={() => {
                if (!error) return;
                setError(null);
              }}
            >
              {error ? <p className="error m-0">{error}</p> : null}
              <label>Cliente</label>
              <select
                id="invoice-customer"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                autoFocus
              >
                <option value="">Elegí un cliente…</option>
                {(customersQ.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <label>IVA %</label>
              <input value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
              <p className="hint m-0">En Chile lo habitual es 19% IVA. Ajustá solo si tu caso lo requiere.</p>

              {lines.map((line, i) => (
                <div key={i} className="line-block relative rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-600">Línea {i + 1}</span>
                    {lines.length > 1 ? (
                      <button
                        type="button"
                        className="text-xs font-semibold text-rose-700 underline hover:text-rose-900"
                        onClick={() => removeLine(i)}
                      >
                        Quitar línea
                      </button>
                    ) : null}
                  </div>
                  <label>Descripción del ítem o servicio</label>
                  <input
                    value={line.description}
                    onChange={(e) => {
                      const n = [...lines];
                      n[i] = { ...n[i], description: e.target.value };
                      setLines(n);
                    }}
                    placeholder="Ej. Flete Santiago–Valparaíso según OC 123"
                  />
                  <div className="row">
                    <div style={{ flex: 1 }}>
                      <label>Cantidad</label>
                      <input
                        value={line.quantity}
                        onChange={(e) => {
                          const n = [...lines];
                          n[i] = { ...n[i], quantity: e.target.value };
                          setLines(n);
                        }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label>Precio unitario (sin IVA según cómo cotices)</label>
                      <input
                        value={line.unitPrice}
                        onChange={(e) => {
                          const n = [...lines];
                          n[i] = { ...n[i], unitPrice: e.target.value };
                          setLines(n);
                        }}
                      />
                    </div>
                  </div>
                  <label>Vincular envío (opcional — trazabilidad)</label>
                  <select
                    value={line.shipmentId}
                    onChange={(e) => {
                      const n = [...lines];
                      n[i] = { ...n[i], shipmentId: e.target.value };
                      setLines(n);
                    }}
                  >
                    <option value="">Sin vincular</option>
                    {shipmentsForCustomer.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.origin} → {s.destination}
                      </option>
                    ))}
                  </select>
                </div>
              ))}

              <button type="button" className="btn-secondary" onClick={addLine}>
                + Agregar línea
              </button>
            </div>
            <div className="border-t border-slate-200 bg-slate-50/80 px-4 py-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="m-0 text-xs text-slate-600 sm:max-w-xs">
                  Al confirmar, el sistema asigna el correlativo; el PDF y el XML se habilitan en la tabla según el estado.
                </p>
                <button
                  type="button"
                  className="btn-primary shrink-0 font-semibold"
                  disabled={!canSubmit}
                  title={
                    !customerId
                      ? "Elegí un cliente"
                      : lines.some((l) => !l.description.trim())
                        ? "Completá la descripción de cada línea"
                        : "Guardar documento en el sistema"
                  }
                  onClick={() => create.mutate()}
                >
                  {create.isPending ? "Guardando…" : "Registrar y asignar número"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="space-y-8 scroll-mt-4">
        {mainView === "inicio" ? (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="card border-l-4 border-blue-500">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Total facturado</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{fmtCLP(stats.totalFacturado)}</p>
                <p className="text-xs text-slate-500">{stats.totalDocs} documentos emitidos</p>
              </div>
              <div className="card border-l-4 border-rose-500">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Pendiente de cobro</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{fmtCLP(stats.pendienteCobro)}</p>
                <p className="text-xs text-slate-500">Saldo vigente por cobrar</p>
              </div>
              <div className="card border-l-4 border-emerald-500">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Pagado este mes</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{fmtCLP(stats.pagadoEsteMes)}</p>
                <p className="text-xs text-slate-500">Pagos aprobados (mes actual)</p>
              </div>
              <div className="card border-l-4 border-amber-500">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Por vencer</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{stats.porVencer}</p>
                <p className="text-xs text-slate-500">Emitidas con fecha de vencimiento próxima</p>
              </div>
            </section>

            <section className="rounded-xl border border-slate-200/90 bg-slate-50/80 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="m-0 text-sm font-bold uppercase tracking-wide text-slate-700">Resumen rápido de gestión</h2>
                  <p className="mt-1 text-xs text-slate-600">
                    Revisá vencidas sin pago primero. Luego gestioná filtros y descargas en <strong>Documentos</strong>.
                  </p>
                </div>
                <button type="button" className="btn-secondary btn-sm" onClick={() => setMainView("documentos")}>
                  Ir a documentos
                </button>
              </div>
            </section>
            <section className="rounded-xl border border-rose-200/90 bg-rose-50/70 p-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="m-0 text-sm font-bold uppercase tracking-wide text-rose-900">Facturas vencidas sin pago</h2>
                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-900">{overdueInvoices.length}</span>
              </div>
              {overdueInvoices.length === 0 ? (
                <p className="mt-2 text-sm text-rose-900/80">No hay facturas vencidas con saldo pendiente.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {overdueInvoices.slice(0, 6).map((inv) => (
                    <li key={`ov-${inv.id}`} className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm">
                      <p className="font-semibold text-slate-900">{inv.number} · {inv.customer.name}</p>
                      <p className="text-xs text-slate-600">
                        Venció: {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString("es-CL") : "—"} · Saldo:{" "}
                        <strong>{fmtCLP(invoiceBalance(inv))}</strong>
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        ) : null}

        {mainView === "documentos" ? (
        <section id="facturas-documentos" className="card">
          <div className="mb-4 border-b border-slate-200 pb-3">
            <h2 className="card-title !mb-1 !mt-0">Documentos emitidos</h2>
            <p className="m-0 text-sm text-slate-600">
              Buscá, filtrá por rango de fechas (emisión) y ordená. Los archivos figuran con estado <strong>Emitida</strong> o{" "}
              <strong>Pagada</strong>.
            </p>
          </div>
          <div className="mb-4 rounded-xl border border-slate-200/90 bg-slate-50/70 p-2.5">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
              <div className="relative sm:col-span-2 lg:col-span-2">
                <label className="sr-only" htmlFor="invoice-search">
                  Buscar en el listado
                </label>
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
                <input
                  id="invoice-search"
                  type="search"
                  className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-sm text-slate-900 placeholder:text-slate-400"
                  value={invoiceSearch}
                  onChange={(e) => setInvoiceSearch(e.target.value)}
                  placeholder="Número, cliente o estado…"
                  autoComplete="off"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600">Desde</label>
                <input
                  type="date"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600">Hasta</label>
                <input
                  type="date"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600">Ordenar por</label>
                <select
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as InvoiceSortKey)}
                >
                  <option value="issueDate">Emisión</option>
                  <option value="number">Número</option>
                  <option value="customer">Cliente</option>
                  <option value="total">Monto</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600">Dirección</label>
                <select
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                  value={sortDir}
                  onChange={(e) => setSortDir(e.target.value as "asc" | "desc")}
                >
                  <option value="desc">Reciente</option>
                  <option value="asc">Antiguo</option>
                </select>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="m-0 text-xs text-slate-500">
                Mostrando <span className="font-semibold text-slate-700 tabular-nums">{displayedInvoices.length}</span> de{" "}
                <span className="tabular-nums">{allInvoices.length}</span> documentos
              </p>
              <button
                type="button"
                className="text-xs font-semibold text-blue-800 underline decoration-blue-300 underline-offset-2 hover:text-blue-900"
                onClick={() => {
                  setInvoiceSearch("");
                  setDateFrom("");
                  setDateTo("");
                  setSortBy("issueDate");
                  setSortDir("desc");
                }}
              >
                Limpiar
              </button>
            </div>
          </div>
          <div className="table-wrap -mx-1 max-h-[min(60vh,520px)] overflow-auto sm:mx-0">
            <table className="table-pro w-full min-w-[40rem] text-sm">
              <caption className="sr-only">Listado de facturas con saldo y acciones</caption>
              <thead className="sticky top-0 z-[1] bg-slate-100/95 text-left text-xs text-slate-600 shadow-sm">
                <tr>
                  <th className="whitespace-nowrap">Número</th>
                  <th className="whitespace-nowrap">Emisión</th>
                  <th>Cliente</th>
                  <th className="whitespace-nowrap">Total</th>
                  <th>Estado</th>
                  <th className="whitespace-nowrap">Saldo</th>
                  <th className="whitespace-nowrap">Archivos</th>
                  <th className="w-px" />
                </tr>
              </thead>
              <tbody>
                {displayedInvoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="align-top font-medium text-slate-900">{inv.number}</td>
                    <td className="whitespace-nowrap text-xs text-slate-600">
                      {inv.issueDate ? new Date(inv.issueDate).toLocaleDateString("es-CL") : "—"}
                    </td>
                    <td className="align-top">{inv.customer.name}</td>
                    <td className="whitespace-nowrap tabular-nums">{fmtCLP(inv.total)}</td>
                    <td>
                      <span className="badge">{invoiceStatusLabel(inv.status)}</span>
                    </td>
                    <td className="whitespace-nowrap tabular-nums">{fmtCLP(invoiceBalance(inv))}</td>
                    <td>
                      {inv.status === "emitida" || inv.status === "pagada" ? (
                        <div className="flex flex-wrap gap-1">
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            onClick={() => void downloadExport(inv, "pdf")}
                          >
                            PDF
                          </button>
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            onClick={() => void downloadExport(inv, "xml")}
                          >
                            XML
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="pr-0">
                      {inv.status === "emitida" ? (
                        <button type="button" className="btn-danger-outline btn-sm whitespace-nowrap" onClick={() => anular.mutate(inv.id)}>
                          Anular
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        ) : null}

        {mainView === "inicio" ? (
        <section className="rounded-xl border border-slate-200/90 bg-slate-50/80 p-4">
          <h2 className="m-0 text-sm font-bold uppercase tracking-wide text-slate-700">Próximas a vencer</h2>
          <p className="mb-3 mt-1 text-xs text-slate-500">Solo facturas con fecha de vencimiento cargada y aún en vigor.</p>
          {dueSoon.length === 0 ? (
            <p className="m-0 text-sm text-slate-600">No hay documentos con vencimiento a la vista.</p>
          ) : (
            <div className="table-wrap overflow-x-auto rounded-lg border border-slate-200/80 bg-white">
              <table className="table-pro w-full text-sm">
                <thead>
                  <tr>
                    <th>Número</th>
                    <th>Cliente</th>
                    <th>Total</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {dueSoon.map((inv) => (
                    <tr key={`due-${inv.id}`}>
                      <td className="font-medium">{inv.number}</td>
                      <td>{inv.customer.name}</td>
                      <td className="tabular-nums">{fmtCLP(inv.total)}</td>
                      <td>
                        <span className="badge badge-warn">por vencer</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        ) : null}
      </div>
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
