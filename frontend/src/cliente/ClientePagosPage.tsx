import { Fragment, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { apiBlob, apiGet, apiSend } from "../api/client.js";
import { notify } from "../lib/notify.js";
import { Eye, Link2 } from "lucide-react";
import { ClientePortalNavHint } from "./ClientePanelIndex.js";

// ─── Tipos ────────────────────────────────────────────────────────────────────

type InvPay = { verificationStatus: string; amount: unknown };

type InvRow = {
  id: string;
  number: string;
  status: string;
  total: unknown;
  payments?: InvPay[];
};

type Pay = {
  id: string;
  amount: unknown;
  method: string;
  reference: string | null;
  paidAt: string;
  verificationStatus: "pendiente" | "aprobado" | "rechazado";
  verificationNote?: string | null;
  mockProof?: { fileName: string; mimeType: string; sizeBytes: number } | null;
  invoice?: { id: string; number: string; total: unknown } | null;
  shipment?: {
    id: string;
    origin: string;
    destination: string;
    invoiceLines?: Array<{ invoice: { id: string; number: string } }>;
  } | null;
  verifiedBy?: { id: string; email: string } | null;
};

// ─── Constantes ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 12;

// ─── Helpers puros (fuera del componente) ─────────────────────────────────────

function num(x: unknown): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

/** Formatea un valor como moneda CLP. */
function fmtCLP(x: unknown): string {
  return num(x).toLocaleString("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  });
}

/** Fecha corta localizada en español chileno. */
function fmtFecha(iso: string): string {
  return new Date(iso).toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
}

function statusPill(st: Pay["verificationStatus"]): { label: string; className: string } {
  switch (st) {
    case "aprobado":
      return { label: "Aprobado", className: "bg-emerald-600 text-white ring-2 ring-emerald-700/50 shadow-sm" };
    case "rechazado":
      return { label: "Rechazado", className: "bg-rose-600 text-white ring-2 ring-rose-800/50 shadow-sm" };
    default:
      return {
        label: "En revisión por la empresa",
        className: "bg-amber-500 text-white ring-2 ring-amber-600/50 shadow-sm",
      };
  }
}

function periodStart(preset: "mes" | "trimestre" | "anio"): number {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (preset === "mes") {
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  if (preset === "trimestre") {
    const q = Math.floor(now.getMonth() / 3) * 3;
    d.setMonth(q, 1);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  d.setMonth(0, 1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function refDisplay(p: Pay): string {
  if (p.mockProof) return p.mockProof.fileName;
  const r = p.reference?.trim();
  if (!r) return "—";
  return r.length > 48 ? `${r.slice(0, 45)}…` : r;
}

function isDemoLinked(p: Pay): boolean {
  if (p.invoice?.number?.toUpperCase().startsWith("DEMO-")) return true;
  const lines = p.shipment?.invoiceLines ?? [];
  return lines.some((l) => l.invoice.number.toUpperCase().startsWith("DEMO-"));
}

function dedupeInvoiceLinks(p: Pay): { id: string; number: string }[] {
  const map = new Map<string, { id: string; number: string }>();
  if (p.invoice) map.set(p.invoice.id, { id: p.invoice.id, number: p.invoice.number });
  for (const line of p.shipment?.invoiceLines ?? []) {
    const inv = line.invoice;
    if (inv) map.set(inv.id, { id: inv.id, number: inv.number });
  }
  return [...map.values()];
}

function conceptoLine(p: Pay): string {
  const invs = dedupeInvoiceLinks(p);
  if (invs.length) return invs.map((i) => `Factura ${i.number}`).join(", ");
  if (p.shipment) return `Envío: ${p.shipment.origin} → ${p.shipment.destination}`;
  return "Aún no asociado";
}

function invPaidApproved(inv: InvRow): number {
  return (inv.payments ?? [])
    .filter((x) => x.verificationStatus === "aprobado")
    .reduce((s, x) => s + num(x.amount), 0);
}

function invBalance(inv: InvRow): number {
  if (inv.status === "anulada") return 0;
  return Math.max(0, num(inv.total) - invPaidApproved(inv));
}

function isDemoInvoiceNumber(n: string): boolean {
  return n.toUpperCase().startsWith("DEMO-");
}

/** Determina si el cliente puede reenviar el comprobante de un pago. */
function canResubmit(p: Pay): boolean {
  return p.verificationStatus === "rechazado" || p.verificationStatus === "pendiente";
}

/** Construye el href de mailto para soporte. */
function supportMail(subj: string): string {
  return `mailto:soporte@transportpro.local?subject=${encodeURIComponent(subj)}`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.readAsDataURL(file);
  });
}

// ─── Sub-componente: vínculos a facturas ──────────────────────────────────────

function VinculoFacturas({ p, showDemo }: { p: Pay; showDemo: boolean }) {
  const unlinked = !p.invoice && !p.shipment;
  const invs = dedupeInvoiceLinks(p).filter((i) => showDemo || !isDemoInvoiceNumber(i.number));

  return (
    <div className="flex flex-col gap-1.5 text-sm">
      {invs.length > 0 ? (
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Factura(s)</span>
          <ul className="mt-0.5 space-y-0.5">
            {invs.map((i) => (
              <li key={i.id}>
                <Link className="font-semibold text-blue-700 underline hover:text-blue-900" to="/cliente/facturas">
                  {i.number}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {p.shipment ? (
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            {invs.length === 0 ? "Envío" : "También envío"}
          </span>
          <div>
            <Link className="text-slate-800 underline hover:text-slate-950" to="/cliente">
              ·{p.shipment.id.slice(-6).toUpperCase()} · {p.shipment.origin} → {p.shipment.destination}
            </Link>
          </div>
        </div>
      ) : null}
      {unlinked ? <span className="text-amber-800">Aún no asociado a factura o envío</span> : null}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function ClientePagosPage() {
  const qc = useQueryClient();
  const showDemo = import.meta.env.VITE_SHOW_DEMO_INVOICES === "true";
  const [searchParams, setSearchParams] = useSearchParams();

  const q = useQuery({ queryKey: ["payments", "cliente"], queryFn: () => apiGet<Pay[]>("/payments") });
  const invQ = useQuery({ queryKey: ["invoices", "cliente"], queryFn: () => apiGet<InvRow[]>("/invoices") });

  // ── Filtros ──────────────────────────────────────────────────────────────────
  const [statusFilter, setStatusFilter] = useState<"all" | Pay["verificationStatus"]>(() => {
    const fromUrl = searchParams.get("estado");
    if (fromUrl === "pendiente" || fromUrl === "aprobado" || fromUrl === "rechazado") return fromUrl;
    return "all";
  });
  const [datePreset, setDatePreset] = useState<"all" | "mes" | "trimestre" | "anio">("all");
  const [refSearch, setRefSearch] = useState("");
  const [amountMin, setAmountMin] = useState("");
  const [page, setPage] = useState(1);
  const [detailTarget, setDetailTarget] = useState<Pay | null>(null);

  // ── Modal reenvío ────────────────────────────────────────────────────────────
  const [resubmitTarget, setResubmitTarget] = useState<Pay | null>(null);
  const [resubmitFile, setResubmitFile] = useState<File | null>(null);
  const [resubmitError, setResubmitError] = useState<string | null>(null);

  // ── Datos procesados ─────────────────────────────────────────────────────────
  const rawRows = q.data ?? [];
  const rows = useMemo(
    () => (showDemo ? rawRows : rawRows.filter((p) => !isDemoLinked(p))),
    [rawRows, showDemo]
  );
  const visibleInvoices = useMemo(() => {
    const list = invQ.data ?? [];
    return showDemo ? list : list.filter((i) => !isDemoInvoiceNumber(i.number));
  }, [invQ.data, showDemo]);

  const invoiceSaldo = useMemo(() => {
    return visibleInvoices.reduce((sum, inv) => sum + invBalance(inv), 0);
  }, [visibleInvoices]);

  const financials = useMemo(() => {
    let aprobado = 0;
    let pendiente = 0;
    let rechazado = 0;
    for (const p of rows) {
      const a = num(p.amount);
      if (p.verificationStatus === "aprobado") aprobado += a;
      else if (p.verificationStatus === "rechazado") rechazado += a;
      else pendiente += a;
    }
    return { aprobado, pendiente, rechazado, saldoFacturas: invoiceSaldo };
  }, [rows, invoiceSaldo]);
  const pendingByInvoiceId = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of rows) {
      if (p.verificationStatus !== "pendiente") continue;
      for (const inv of dedupeInvoiceLinks(p)) {
        m.set(inv.id, (m.get(inv.id) ?? 0) + 1);
      }
    }
    return m;
  }, [rows]);
  const invoicesToPayNow = useMemo(
    () =>
      visibleInvoices
        .map((inv) => ({ inv, balance: invBalance(inv), pendingProofs: pendingByInvoiceId.get(inv.id) ?? 0 }))
        .filter(({ inv, balance }) => inv.status !== "anulada" && inv.status !== "borrador" && balance > 0.009),
    [visibleInvoices, pendingByInvoiceId]
  );

  const filtered = useMemo(() => {
    const t0 = datePreset === "all" ? null : periodStart(datePreset);
    const now = Date.now();
    const qref = refSearch.trim().toLowerCase();
    const minA = amountMin.trim() === "" ? null : Number(amountMin);
    return rows.filter((p) => {
      if (statusFilter !== "all" && p.verificationStatus !== statusFilter) return false;
      if (t0 !== null) {
        const ref = new Date(p.paidAt).getTime();
        if (ref < t0 || ref > now) return false;
      }
      if (qref) {
        const blob = `${refDisplay(p)} ${p.reference ?? ""} ${conceptoLine(p)} ${p.method}`.toLowerCase();
        if (!blob.includes(qref)) return false;
      }
      if (minA !== null && Number.isFinite(minA) && num(p.amount) < minA) return false;
      return true;
    });
  }, [rows, statusFilter, datePreset, refSearch, amountMin]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = useMemo(() => {
    const start = (pageSafe - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, pageSafe]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, datePreset, refSearch, amountMin]);

  useEffect(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (statusFilter === "all") next.delete("estado");
      else next.set("estado", statusFilter);
      return next;
    }, { replace: true });
  }, [statusFilter, setSearchParams]);

  // ── Mutación reenvío ─────────────────────────────────────────────────────────
  const resubmitMut = useMutation({
    mutationFn: async () => {
      if (!resubmitTarget) throw new Error("Sin pago");
      if (!resubmitFile) throw new Error("Elegí un archivo");
      const base64 = await fileToBase64(resubmitFile);
      return apiSend(`/payments/${resubmitTarget.id}/resubmit`, "POST", {
        proofFileName: resubmitFile.name,
        proofMimeType: resubmitFile.type || "application/pdf",
        proofBase64: base64,
      });
    },
    onSuccess: () => {
      setResubmitTarget(null);
      setResubmitFile(null);
      setResubmitError(null);
      void qc.invalidateQueries({ queryKey: ["payments", "cliente"] });
      void qc.invalidateQueries({ queryKey: ["invoices", "cliente"] });
      notify("success", "Nuevo comprobante cargado. El pago queda otra vez en revisión hasta que la empresa lo valide.");
    },
    onError: (e: Error) => setResubmitError(e.message),
  });

  // ── Handlers ─────────────────────────────────────────────────────────────────
  function clearFilters() {
    setStatusFilter("all");
    setDatePreset("all");
    setRefSearch("");
    setAmountMin("");
  }

  async function viewProof(id: string) {
    const blob = await apiBlob(`/payments/${id}/proof-file`);
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
  }

  // ── Early returns ────────────────────────────────────────────────────────────
  if (q.isLoading || invQ.isLoading) return <p className="muted">Cargando…</p>;
  if (q.isError) return <p className="error">{(q.error as Error).message}</p>;
  if (invQ.isError) return <p className="error">{(invQ.error as Error).message}</p>;

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="page-stack">
      {/* ── Encabezado ── */}
      <header className="page-header">
        <p className="page-eyebrow">Portal cliente</p>
        <h1>Pagos registrados</h1>
        <p className="page-subtitle">Seguimiento de pagos enviados, pagos aprobados y pagos que requieren acción.</p>
        <p className="mt-1 text-[11px] text-blue-100/90">
          Si un comprobante aparece rechazado, subí uno nuevo o consultá a soporte desde esta pantalla.
        </p>
      </header>
      <div
        className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200/80 bg-gradient-to-br from-orange-50/80 via-white to-blue-50/60 px-3 py-2.5 shadow-sm ring-1 ring-slate-200/40"
        role="toolbar"
        aria-label="Atajos rápidos de pagos cliente"
      >
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
          onClick={() => setStatusFilter("pendiente")}
        >
          Ver en revisión
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-900 hover:bg-rose-100"
          onClick={() => setStatusFilter("rechazado")}
        >
          Ver rechazados
        </button>
        <Link
          to="/cliente/facturas"
          className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100"
        >
          Ver facturas
        </Link>
        <button type="button" className="btn-secondary btn-sm ml-auto" onClick={clearFilters}>
          Limpiar vista
        </button>
      </div>
      <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Qué te corresponde pagar ahora</h2>
        {invoicesToPayNow.length === 0 ? (
          <p className="mt-1 text-xs text-slate-600">No tenés facturas pendientes de pago ahora.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {invoicesToPayNow.slice(0, 5).map(({ inv, balance, pendingProofs }) => (
              <li key={inv.id} className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs">
                <p className="font-semibold text-slate-900">Factura {inv.number}</p>
                <p className="text-slate-700">
                  Saldo por pagar: <strong>{fmtCLP(balance)}</strong>
                </p>
                {pendingProofs > 0 ? (
                  <p className="text-amber-800">
                    Ya enviaste {pendingProofs} comprobante{pendingProofs === 1 ? "" : "s"} en revisión para esta factura.
                  </p>
                ) : (
                  <p className="text-rose-700">Sin comprobante pendiente para esta factura.</p>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[11px] text-slate-500">
          Regla rápida: si una factura tiene comprobante <strong>en revisión</strong>, esperá validación antes de volver a pagar.
        </p>
      </section>

      {/* ── KPIs (4 columnas, sin tarjeta de navegación) ── */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="card border-l-4 border-emerald-500">
          <div className="kpi-label">Pagos aprobados</div>
          <div className="stat-big">{fmtCLP(financials.aprobado)}</div>
          <p className="muted mt-1">Pagos validados</p>
        </div>
        <div className="card border-l-4 border-amber-500">
          <div className="kpi-label">Pagos en revisión</div>
          <div className="stat-big">{fmtCLP(financials.pendiente)}</div>
          <p className="muted mt-1">La empresa aún no los valida</p>
        </div>
        <div className="card border-l-4 border-rose-500">
          <div className="kpi-label">Pagos rechazados</div>
          <div className="stat-big">{fmtCLP(financials.rechazado)}</div>
          <p className="muted mt-1">Podés reenviar comprobante</p>
        </div>
        <div className="card border-l-4 border-indigo-500">
          <div className="kpi-label">Deuda en facturas</div>
          <div className="stat-big">{fmtCLP(financials.saldoFacturas)}</div>
          <p className="muted mt-1">Total por pagar en facturas emitidas</p>
        </div>
      </div>

      {/* ── Filtros ── */}
      <div id="cliente-pagos-filtros" className="card card-elevated scroll-mt-24">
        <details>
          <summary className="cursor-pointer list-none text-sm font-semibold text-slate-800">
            Filtros avanzados ({filtered.length} resultado{filtered.length === 1 ? "" : "s"})
          </summary>
          <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <label htmlFor="pay-status">Estado</label>
              <select
                id="pay-status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              >
                <option value="all">Todos</option>
                <option value="aprobado">Aprobado</option>
                <option value="pendiente">En revisión</option>
                <option value="rechazado">Rechazado</option>
              </select>
            </div>
            <div>
              <label htmlFor="pay-date">Fecha del pago</label>
              <select
                id="pay-date"
                value={datePreset}
                onChange={(e) => setDatePreset(e.target.value as typeof datePreset)}
              >
                <option value="all">Cualquiera</option>
                <option value="mes">Este mes</option>
                <option value="trimestre">Este trimestre</option>
                <option value="anio">Este año</option>
              </select>
            </div>
            <div>
              <label htmlFor="pay-ref">Referencia / concepto / método</label>
              <input
                id="pay-ref"
                placeholder="Buscar…"
                value={refSearch}
                onChange={(e) => setRefSearch(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="pay-min">Monto mínimo</label>
              <input
                id="pay-min"
                inputMode="decimal"
                placeholder="Ej: 100.000"
                value={amountMin}
                onChange={(e) => setAmountMin(e.target.value)}
              />
            </div>
          </div>
        </details>
      </div>

      {/* ── Tabla + cards ── */}
      <div id="cliente-pagos-listado" className="card card-elevated scroll-mt-24">
        {/* Desktop */}
        <div className="table-wrap desktop-only">
          <table className="table-pro">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Monto</th>
                <th>Método</th>
                <th>Referencia</th>
                <th>Vinculado a</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((p) => {
                const pill = statusPill(p.verificationStatus);
                const unlinked = !p.invoice && !p.shipment;
                const shortId = p.id.slice(-6).toUpperCase();
                return (
                  <Fragment key={p.id}>
                    <tr className="cursor-pointer hover:bg-slate-50/80" onClick={() => setDetailTarget(p)}>
                      <td className="whitespace-nowrap">{fmtFecha(p.paidAt)}</td>
                      <td className="font-medium">{fmtCLP(p.amount)}</td>
                      <td>{p.method}</td>
                      <td className="max-w-[200px] text-xs">{refDisplay(p)}</td>
                      <td>
                        <VinculoFacturas p={p} showDemo={showDemo} />
                      </td>
                      <td>
                        <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-bold ${pill.className}`}>
                          {pill.label}
                        </span>
                      </td>
                      <td>
                        <div className="flex flex-row flex-wrap gap-1.5">
                          <button
                            type="button"
                            className="btn-primary btn-sm inline-flex items-center gap-1"
                            aria-label={`Ver comprobante del pago ${shortId}`}
                            onClick={() => void viewProof(p.id)}
                          >
                            <Eye size={14} /> Ver comprobante
                          </button>
                          {unlinked ? (
                            <a
                              className="btn-secondary btn-sm inline-flex items-center gap-1"
                              href={supportMail(`Vincular pago ·${shortId}`)}
                              aria-label={`Asociar pago ${shortId} con soporte`}
                            >
                              <Link2 size={14} /> Asociar (soporte)
                            </a>
                          ) : null}
                          {canResubmit(p) ? (
                            <button
                              type="button"
                              className="btn-secondary btn-sm font-semibold"
                              onClick={() => {
                                setResubmitTarget(p);
                                setResubmitFile(null);
                                setResubmitError(null);
                              }}
                            >
                              Subir nuevo comprobante
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile */}
        <div className="mobile-card-list mobile-only space-y-3">
          {pageRows.map((p) => {
            const pill = statusPill(p.verificationStatus);
            const unlinked = !p.invoice && !p.shipment;
            const shortId = p.id.slice(-6).toUpperCase();
            return (
              <article key={p.id} className="mobile-data-card space-y-2 cursor-pointer" onClick={() => setDetailTarget(p)}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <strong>{fmtFecha(p.paidAt)}</strong>
                  <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${pill.className}`}>
                    {pill.label}
                  </span>
                </div>
                <div className="text-sm font-medium">{fmtCLP(p.amount)}</div>
                <VinculoFacturas p={p} showDemo={showDemo} />
                <div className="flex flex-row flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-primary btn-sm inline-flex items-center gap-1"
                    onClick={() => void viewProof(p.id)}
                  >
                    <Eye size={14} /> Ver comprobante
                  </button>
                  {unlinked ? (
                    <a className="btn-secondary btn-sm" href={supportMail(`Vincular pago ·${shortId}`)}>
                      Asociar
                    </a>
                  ) : null}
                  {canResubmit(p) ? (
                    <button
                      type="button"
                      className="btn-secondary btn-sm font-semibold"
                      onClick={(e) => {
                        e.stopPropagation();
                        setResubmitTarget(p);
                        setResubmitFile(null);
                        setResubmitError(null);
                      }}
                    >
                      Nuevo comprobante
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>

        {filtered.length === 0 ? <p className="muted p-4">No hay pagos con estos filtros.</p> : null}

        {/* Paginación */}
        {totalPages > 1 ? (
          <div className="mt-3 flex items-center justify-center gap-2">
            <button
              type="button"
              className="btn-secondary btn-sm"
              disabled={pageSafe <= 1}
              onClick={() => setPage((x) => Math.max(1, x - 1))}
            >
              Anterior
            </button>
            <span className="muted text-xs">
              Página {pageSafe} / {totalPages}
            </span>
            <button
              type="button"
              className="btn-secondary btn-sm"
              disabled={pageSafe >= totalPages}
              onClick={() => setPage((x) => Math.min(totalPages, x + 1))}
            >
              Siguiente
            </button>
          </div>
        ) : null}
      </div>

      <div className="mt-4">
        <ClientePortalNavHint />
      </div>

      {detailTarget ? (
        <div className="fixed inset-0 z-[79] flex items-center justify-center bg-black/40 p-4" onClick={() => setDetailTarget(null)}>
          <div
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-4 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-label="Detalle de pago"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-slate-900">Detalle del pago ·{detailTarget.id.slice(-6).toUpperCase()}</h3>
            <p className="mt-2 text-sm text-slate-700">
              {fmtFecha(detailTarget.paidAt)} · {fmtCLP(detailTarget.amount)} · {detailTarget.method}
            </p>
            <p className="mt-1 text-sm text-slate-700">Referencia: {refDisplay(detailTarget)}</p>
            <p className="mt-1 text-sm text-slate-700">Concepto: {conceptoLine(detailTarget)}</p>
            <p className="mt-2 text-xs text-slate-600">
              {detailTarget.verificationNote ? (
                <>
                  <span className="font-semibold text-slate-800">Nota de la empresa:</span> {detailTarget.verificationNote}
                </>
              ) : (
                "Sin nota de validación."
              )}
            </p>
            {detailTarget.verifiedBy?.email ? (
              <p className="mt-1 text-xs text-slate-500">Validado por: {detailTarget.verifiedBy.email}</p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="btn-primary btn-sm inline-flex items-center gap-1" onClick={() => void viewProof(detailTarget.id)}>
                <Eye size={14} /> Ver comprobante
              </button>
              {canResubmit(detailTarget) ? (
                <button
                  type="button"
                  className="btn-secondary btn-sm font-semibold"
                  onClick={() => {
                    setResubmitTarget(detailTarget);
                    setResubmitFile(null);
                    setResubmitError(null);
                    setDetailTarget(null);
                  }}
                >
                  Subir nuevo comprobante
                </button>
              ) : null}
              <button type="button" className="btn-secondary btn-sm" onClick={() => setDetailTarget(null)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Modal reenvío de comprobante ── */}
      {resubmitTarget ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-4 shadow-xl">
            <h3 className="text-base font-semibold text-slate-900">Subir nuevo comprobante</h3>
            <p className="muted mt-1">
              {resubmitTarget.verificationStatus === "rechazado"
                ? "Reemplazarás el comprobante rechazado. El pago vuelve a pendiente de validación."
                : "Reemplazarás el comprobante enviado. Seguirá pendiente hasta que la empresa lo revise."}{" "}
              Monto: <strong>{fmtCLP(resubmitTarget.amount)}</strong>.
            </p>
            <label className="mt-3 block">Comprobante</label>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex cursor-pointer items-center justify-center rounded border border-blue-300 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800 hover:bg-blue-100">
                Sacar foto
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  onChange={(e) => setResubmitFile(e.target.files?.[0] ?? null)}
                />
              </label>
              <label className="flex cursor-pointer items-center justify-center rounded border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                Subir PDF o imagen
                <input
                  type="file"
                  accept=".pdf,image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={(e) => setResubmitFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
            {resubmitFile ? <p className="mt-2 text-xs text-slate-600">Archivo listo: {resubmitFile.name}</p> : null}
            {resubmitError ? <p className="error mt-2">{resubmitError}</p> : null}
            <div className="form-actions">
              <button
                type="button"
                className="btn-primary"
                disabled={resubmitMut.isPending}
                onClick={() => resubmitMut.mutate()}
              >
                Enviar
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={resubmitMut.isPending}
                onClick={() => {
                  setResubmitTarget(null);
                  setResubmitError(null);
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
