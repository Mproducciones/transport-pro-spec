import { Fragment, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiBlob, apiGet, apiSend, downloadBlob } from "../api/client.js";
import { notify } from "../lib/notify.js";
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  DollarSign,
  Info,
  FileCode,
  FileDown,
  FileText,
  LayoutDashboard,
} from "lucide-react";
import { ClientePortalNavHint } from "./ClientePanelIndex.js";

// ─── Tipos ────────────────────────────────────────────────────────────────────

type FacturasClienteVista = "inicio" | "lista";

type InvPay = {
  id: string;
  amount: unknown;
  paidAt: string;
  method: string;
  verificationStatus: "pendiente" | "aprobado" | "rechazado";
};

type Inv = {
  id: string;
  number: string;
  status: string;
  total: unknown;
  taxAmount: unknown;
  subtotal: unknown;
  issueDate: string;
  dueDate: string | null;
  notes?: string | null;
  payments?: InvPay[];
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

function isDemoInvoice(n: string): boolean {
  return n.toUpperCase().startsWith("DEMO-");
}

function paidApproved(inv: Inv): number {
  return (inv.payments ?? [])
    .filter((p) => p.verificationStatus === "aprobado")
    .reduce((s, p) => s + num(p.amount), 0);
}

function balance(inv: Inv): number {
  return Math.max(0, num(inv.total) - paidApproved(inv));
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

function startOfDayInput(iso: string): number {
  return new Date(`${iso}T00:00:00`).getTime();
}

function endOfDayInput(iso: string): number {
  return new Date(`${iso}T23:59:59.999`).getTime();
}

/** Estilo de pill de estado (saldo) — alineado a mock (punto de color + fondo suave). */
function paymentStatusStyle(inv: Inv): { label: string; box: string; dot: string } {
  if (inv.status === "anulada") {
    return { label: "Anulada", box: "bg-slate-100 text-slate-600", dot: "bg-[#888780]" };
  }
  if (inv.status === "borrador") {
    return { label: "Borrador", box: "bg-[#FAEEDA] text-[#854F0B]", dot: "bg-[#BA7517]" };
  }
  const b = balance(inv);
  if (b <= 0.009) {
    return { label: "Pagada", box: "bg-[#EAF3DE] text-[#3B6D11]", dot: "bg-[#639922]" };
  }
  return { label: "Pendiente", box: "bg-[#FCEBEB] text-[#A32D2D]", dot: "bg-[#E24B4A]" };
}

function PaymentStatusPill({ inv }: { inv: Inv }) {
  const s = paymentStatusStyle(inv);
  return (
    <span
      className={`inline-flex w-fit max-w-full items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${s.box}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${s.dot}`} aria-hidden />
      {s.label}
    </span>
  );
}

/** Badge de tipo de documento (número de factura). */
function docBadge(inv: Inv) {
  if (inv.status === "anulada") {
    return (
      <span className="ms-1 inline-flex rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
        Anulada
      </span>
    );
  }
  if (inv.status === "borrador") {
    return (
      <span className="ms-1 inline-flex rounded-full bg-[#FAEEDA] px-1.5 py-0.5 text-[10px] font-medium text-[#854F0B]">
        Borrador
      </span>
    );
  }
  return (
    <span className="ms-1 inline-flex rounded-full bg-[#E6F1FB] px-1.5 py-0.5 text-[10px] font-medium text-[#185FA5]">
      Emitida
    </span>
  );
}

/** Mini-lista de pagos vinculados (mostrada en el expand). */
function PaymentsMiniList({ inv }: { inv: Inv }) {
  const list = inv.payments ?? [];
  if (!list.length) {
    return <span className="text-[11px] text-slate-400">Sin pagos registrados.</span>;
  }
  return (
    <ul className="mt-1 flex flex-col gap-1">
      {list.map((p) => (
        <li key={p.id} className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
          <span className="font-medium text-slate-900">{fmtCLP(p.amount)}</span>
          <span className="text-slate-500">{p.method}</span>
          <span className="text-slate-400">{fmtFecha(p.paidAt)}</span>
          <span
            className={
              p.verificationStatus === "aprobado"
                ? "rounded-full bg-[#EAF3DE] px-1.5 py-0.5 text-[10px] font-medium text-[#3B6D11]"
                : p.verificationStatus === "rechazado"
                  ? "rounded-full bg-[#FCEBEB] px-1.5 py-0.5 text-[10px] font-medium text-[#A32D2D]"
                  : "rounded-full bg-[#FAEEDA] px-1.5 py-0.5 text-[10px] font-medium text-[#854F0B]"
            }
          >
            {p.verificationStatus === "aprobado"
              ? "Aprobado"
              : p.verificationStatus === "rechazado"
                ? "Rechazado"
                : "En revisión"}
          </span>
        </li>
      ))}
    </ul>
  );
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

// ─── Componente principal ─────────────────────────────────────────────────────

export function ClienteFacturasPage() {
  const qc = useQueryClient();
  const showDemo = import.meta.env.VITE_SHOW_DEMO_INVOICES === "true";

  const q = useQuery({ queryKey: ["invoices", "cliente"], queryFn: () => apiGet<Inv[]>("/invoices") });

  // ── Filtros ──────────────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [payFilter, setPayFilter] = useState<"all" | "pendiente" | "pagada" | "anulada" | "borrador">("all");
  const [datePreset, setDatePreset] = useState<"all" | "mes" | "trimestre" | "anio">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  // ── Modal pago ───────────────────────────────────────────────────────────────
  const [payTarget, setPayTarget] = useState<Inv | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payFile, setPayFile] = useState<File | null>(null);
  const [payError, setPayError] = useState<string | null>(null);

  // ── Vista activa ─────────────────────────────────────────────────────────────
  const [mainView, setMainView] = useState<FacturasClienteVista>("inicio");

  // ── Datos procesados ─────────────────────────────────────────────────────────
  const rawRows = q.data ?? [];
  const rows = useMemo(
    () => (showDemo ? rawRows : rawRows.filter((r) => !isDemoInvoice(r.number))),
    [rawRows, showDemo]
  );

  const financials = useMemo(() => {
    let facturado = 0;
    let pagado = 0;
    for (const inv of rows) {
      if (inv.status === "anulada") continue;
      facturado += num(inv.total);
      pagado += paidApproved(inv);
    }
    const saldo = Math.max(0, facturado - pagado);
    return { facturado, pagado, saldo, n: rows.filter((r) => r.status !== "anulada").length };
  }, [rows]);

  /** Mapa de saldos precalculados para evitar recómputos en cada render. */
  const balanceMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const inv of rows) map.set(inv.id, balance(inv));
    return map;
  }, [rows]);

  const useCustomDateRange = Boolean(dateFrom.trim() || dateTo.trim());

  const filtered = useMemo(() => {
    const qn = search.trim().toLowerCase();
    const t0 = !useCustomDateRange && datePreset !== "all" ? periodStart(datePreset) : null;
    const now = Date.now();
    const minT = amountMin.trim() === "" ? null : Number(amountMin);
    const maxT = amountMax.trim() === "" ? null : Number(amountMax);

    return rows.filter((inv) => {
      if (qn && !inv.number.toLowerCase().includes(qn)) return false;

      if (payFilter === "borrador") {
        if (inv.status !== "borrador") return false;
      } else if (payFilter === "anulada") {
        if (inv.status !== "anulada") return false;
      } else if (payFilter === "pendiente") {
        if (inv.status === "anulada" || inv.status === "borrador") return false;
        if ((balanceMap.get(inv.id) ?? 0) <= 0.009) return false;
      } else if (payFilter === "pagada") {
        if (inv.status === "anulada" || inv.status === "borrador") return false;
        if ((balanceMap.get(inv.id) ?? 0) > 0.009) return false;
      }

      const issueT = new Date(inv.issueDate).getTime();
      if (useCustomDateRange) {
        if (dateFrom.trim() && issueT < startOfDayInput(dateFrom.trim())) return false;
        if (dateTo.trim() && issueT > endOfDayInput(dateTo.trim())) return false;
      } else if (t0 !== null) {
        if (issueT < t0 || issueT > now) return false;
      }

      const tot = num(inv.total);
      if (minT !== null && Number.isFinite(minT) && tot < minT) return false;
      if (maxT !== null && Number.isFinite(maxT) && tot > maxT) return false;

      return true;
    });
  }, [rows, search, payFilter, datePreset, dateFrom, dateTo, useCustomDateRange, amountMin, amountMax, balanceMap]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = useMemo(() => {
    const start = (pageSafe - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, pageSafe]);

  const pendientesCount = useMemo(
    () =>
      rows.filter(
        (inv) => inv.status !== "anulada" && inv.status !== "borrador" && (balanceMap.get(inv.id) ?? 0) > 0.009
      ).length,
    [rows, balanceMap]
  );

  useEffect(() => {
    setPage(1);
  }, [search, payFilter, datePreset, dateFrom, dateTo, amountMin, amountMax]);

  // ── Mutación pago ────────────────────────────────────────────────────────────
  const payMut = useMutation({
    mutationFn: async () => {
      if (!payTarget) throw new Error("Sin factura");
      const amount = Number(payAmount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("Monto inválido");
      if (!payFile) throw new Error("Adjuntá el comprobante");
      const base64 = await fileToBase64(payFile);
      return apiSend("/payments", "POST", {
        invoiceId: payTarget.id,
        amount,
        method: "transferencia",
        proofFileName: payFile.name,
        proofMimeType: payFile.type || "application/pdf",
        proofBase64: base64,
      });
    },
    onSuccess: () => {
      setPayTarget(null);
      setPayAmount("");
      setPayFile(null);
      setPayError(null);
      void qc.invalidateQueries({ queryKey: ["invoices", "cliente"] });
      void qc.invalidateQueries({ queryKey: ["payments", "cliente"] });
      notify(
        "success",
        "Comprobante enviado. La empresa lo revisará; el estado del pago aparecerá en Mis pagos cuando lo validen."
      );
    },
    onError: (e: Error) => setPayError(e.message),
  });

  // ── Handlers ─────────────────────────────────────────────────────────────────
  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearFilters() {
    setSearch("");
    setPayFilter("all");
    setDatePreset("all");
    setDateFrom("");
    setDateTo("");
    setAmountMin("");
    setAmountMax("");
  }

  async function downloadPdf(id: string, number: string) {
    const blob = await apiBlob(`/invoices/${id}/export.pdf`);
    downloadBlob(blob, `factura-${number.replace(/[^\w.-]+/g, "_")}.pdf`);
  }

  async function downloadXml(id: string, number: string) {
    const blob = await apiBlob(`/invoices/${id}/export.xml`);
    downloadBlob(blob, `factura-${number.replace(/[^\w.-]+/g, "_")}.xml`);
  }

  // ── Early return ─────────────────────────────────────────────────────────────
  if (q.isLoading) return <p className="muted">Cargando…</p>;
  if (q.isError) return <p className="error">{(q.error as Error).message}</p>;

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-[18px] pb-7 pt-1">
      <h2 className="sr-only">Vista de facturación del cliente</h2>
      {/* ── Encabezado (estilo mock: barra clara) ── */}
      <header className="border-b border-slate-200/80 pb-3.5">
        <div className="min-w-0 flex-1">
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-slate-500">Portal cliente</p>
          <h1 className="text-[22px] font-medium leading-tight text-slate-900">Facturación</h1>
          <p className="mt-0.5 text-[13px] text-slate-600">Resumen de tus facturas, pagos y descargas.</p>
          <p className="mt-1.5 text-[11px] text-slate-500">
            Recibirás un aviso por correo cuando cambie el estado de una factura.
          </p>
        </div>
      </header>

      {/* ── Tabs ── */}
      <nav
        className="sticky top-2 z-20 grid grid-cols-2 gap-1.5 rounded-[10px] border border-slate-200/80 bg-slate-100/90 p-1.5 shadow-sm backdrop-blur-sm"
        role="tablist"
        aria-label="Vistas de facturación"
      >
        {(
          [
            ["inicio", "Resumen", LayoutDashboard, null] as const,
            ["lista", "Mis facturas", FileText, filtered.length] as const,
          ] as const
        ).map(([tabId, label, Icon, badge]) => {
          const selected = mainView === tabId;
          return (
            <button
              key={tabId}
              type="button"
              role="tab"
              aria-selected={selected}
              className={`flex min-h-[2.75rem] items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-[13px] font-medium transition ${
                selected
                  ? "border border-slate-200/80 bg-white text-slate-900 shadow-sm"
                  : "border border-transparent text-slate-500 hover:bg-white/90 hover:text-slate-800"
              } `}
              onClick={() => setMainView(tabId as FacturasClienteVista)}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
              {label}
              {tabId === "lista" && badge != null ? (
                <span className="rounded-full bg-[#E6F1FB] px-1.5 py-0.5 text-[10px] font-medium text-[#185FA5] tabular-nums">
                  {badge}
                </span>
              ) : null}
              {tabId === "inicio" && pendientesCount > 0 ? (
                <span className="rounded-full bg-[#FCEBEB] px-1.5 py-0.5 text-[10px] font-medium text-[#A32D2D] tabular-nums">
                  {pendientesCount} con saldo
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>
      <div
        className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200/80 bg-gradient-to-br from-blue-50/70 via-white to-orange-50/70 px-3 py-2.5 shadow-sm ring-1 ring-slate-200/40"
        role="toolbar"
        aria-label="Atajos rápidos de facturación cliente"
      >
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-900 hover:bg-indigo-100"
          onClick={() => setMainView("inicio")}
        >
          Resumen
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-semibold text-cyan-900 hover:bg-cyan-100"
          onClick={() => setMainView("lista")}
        >
          Mis facturas
        </button>
        <Link
          to="/cliente/pagos"
          className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100"
        >
          Ir a pagos
        </Link>
      </div>

      {/* ══════════════════════════════════════════════════════════
          VISTA: INICIO (Resumen)
      ══════════════════════════════════════════════════════════ */}
      {mainView === "inicio" ? (
        <>
          <div className="grid gap-2.5 sm:grid-cols-3">
            <div className="rounded-lg bg-slate-100/80 p-3.5 sm:min-w-0">
              <div className="mb-2 flex h-[26px] w-[26px] items-center justify-center rounded-md bg-[#E6F1FB] text-[#185FA5]">
                <DollarSign className="h-3.5 w-3.5" strokeWidth={2.5} />
              </div>
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-slate-500">Total facturado</p>
              <p className="text-xl font-medium tabular-nums text-[#185FA5]">{fmtCLP(financials.facturado)}</p>
              <p className="mt-1 text-[11px] text-slate-500">
                {financials.n} documento{financials.n === 1 ? "" : "s"} vigente{financials.n === 1 ? "" : "s"}
              </p>
            </div>
            <div className="rounded-lg bg-slate-100/80 p-3.5 sm:min-w-0">
              <div className="mb-2 flex h-[26px] w-[26px] items-center justify-center rounded-md bg-[#EAF3DE] text-[#3B6D11]">
                <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
              </div>
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-slate-500">Pagado (validado)</p>
              <p className="text-xl font-medium tabular-nums text-[#3B6D11]">{fmtCLP(financials.pagado)}</p>
              <p className="mt-1 text-[11px] text-slate-500">Pagos aprobados por la empresa</p>
            </div>
            <div className="rounded-lg bg-slate-100/80 p-3.5 sm:min-w-0">
              <div className="mb-2 flex h-[26px] w-[26px] items-center justify-center rounded-md bg-[#FCEBEB] text-[#A32D2D]">
                <AlertCircle className="h-3.5 w-3.5" strokeWidth={2.5} />
              </div>
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-slate-500">Saldo pendiente</p>
              <p className="text-xl font-medium tabular-nums text-[#A32D2D]">{fmtCLP(financials.saldo)}</p>
              <p className="mt-1 text-[11px] text-slate-500">Lo facturado menos pagos aprobados</p>
            </div>
          </div>

          <div className="rounded-lg border border-[#FAC775] bg-[#FAEEDA] px-3.5 py-2.5">
            <h2 className="text-sm font-medium text-[#633806]">Cómo pagar lo pendiente</h2>
            {pendientesCount === 0 && financials.saldo <= 0.01 ? (
              <p className="mt-1 text-xs text-[#633806]/90">Hoy no tenés facturas con saldo pendiente.</p>
            ) : null}
            <ol className="mt-2 flex flex-col gap-2 text-xs text-slate-600">
              {[
                <>
                  Andá a la pestaña <strong className="text-slate-800">Mis facturas</strong> y filtrá por &quot;Pendiente
                  de pago&quot;.
                </>,
                <>
                  En la fila de la factura con saldo, hacé clic en <strong className="text-slate-800">Pagar</strong>.
                </>,
                <>Ingresá el monto y adjuntá el comprobante. La empresa lo valida.</>,
              ].map((node, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span
                    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[10px] font-medium text-white"
                    aria-hidden
                  >
                    {i + 1}
                  </span>
                  <span className="pt-0.5 leading-snug">{node}</span>
                </li>
              ))}
            </ol>
            <button
              type="button"
              className="mt-2.5 w-full rounded-md border-0 bg-slate-900 px-4 py-2 text-center text-xs font-medium text-white hover:opacity-90 sm:w-auto"
              onClick={() => setMainView("lista")}
            >
              Ver mis facturas
              <span className="ms-0.5" aria-hidden>
                →
              </span>
            </button>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
            <h2 className="text-[13px] font-medium text-slate-800">¿Qué es cada cifra?</h2>
            <div className="mt-2 divide-y divide-slate-200/90">
              <p className="flex flex-col gap-0.5 border-t-0 py-2 text-xs text-slate-600 first:pt-0 sm:flex-row sm:gap-2">
                <span className="min-w-[7.5rem] shrink-0 font-medium text-slate-800">Facturado</span>
                <span>Total de facturas emitidas, sin incluir anuladas.</span>
              </p>
              <p className="flex flex-col gap-0.5 py-2 text-xs text-slate-600 sm:flex-row sm:gap-2">
                <span className="min-w-[7.5rem] shrink-0 font-medium text-slate-800">Pagado</span>
                <span>Solo comprobantes aprobados por la empresa.</span>
              </p>
              <p className="flex flex-col gap-0.5 py-2 text-xs text-slate-600 sm:flex-row sm:gap-2">
                <span className="min-w-[7.5rem] shrink-0 font-medium text-slate-800">Saldo (facturas)</span>
                <span>
                  Lo facturado menos pagos aprobados. Puede diferir del saldo en <strong>Mis pedidos</strong>.
                </span>
              </p>
              <p className="flex flex-col gap-0.5 py-2 pb-0 text-xs text-slate-600 sm:flex-row sm:gap-2">
                <span className="min-w-[7.5rem] shrink-0 font-medium text-slate-800">Mis pedidos</span>
                <span>
                  El saldo ahí suma balances por envío, por eso puede ser más alto hasta que todo pase a factura.{" "}
                  <Link to="/cliente" className="text-[#185FA5] underline hover:text-[#0f4a7a]">
                    Abrir mis pedidos
                  </Link>
                </span>
              </p>
            </div>
          </div>
        </>
      ) : null}

      {/* ══════════════════════════════════════════════════════════
          VISTA: LISTA (Mis facturas)
      ══════════════════════════════════════════════════════════ */}
      {mainView === "lista" ? (
        <>
          {financials.saldo > 0.01 ? (
            <div className="flex items-start gap-2 rounded-lg border border-[#FAC775] bg-[#FAEEDA] px-3.5 py-2.5 text-xs text-[#633806]">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
              <p>
                Tenés facturas con saldo. Filtrá por &quot;Pendiente de pago&quot; y usá el botón{" "}
                <strong className="font-medium">Pagar</strong> en cada fila.
              </p>
            </div>
          ) : null}

          <div className="flex flex-col gap-2.5 rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-sm">
            <h2 className="sr-only">Filtros de facturas</h2>

            <div className="grid gap-2.5 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-500" htmlFor="inv-search">
                  Número
                </label>
                <input
                  id="inv-search"
                  placeholder="Ej: 2024-"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div>
                <label
                  className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-500"
                  htmlFor="inv-pay"
                >
                  Estado
                </label>
                <select
                  id="inv-pay"
                  value={payFilter}
                  onChange={(e) => setPayFilter(e.target.value as typeof payFilter)}
                >
                  <option value="all">Todos</option>
                  <option value="pendiente">Pendiente de pago</option>
                  <option value="pagada">Saldada</option>
                  <option value="anulada">Anulada</option>
                  <option value="borrador">Borrador</option>
                </select>
              </div>
              <div>
                <label
                  className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-500"
                  htmlFor="inv-date"
                >
                  Período
                </label>
                <select
                  id="inv-date"
                  value={datePreset}
                  onChange={(e) => setDatePreset(e.target.value as typeof datePreset)}
                  disabled={useCustomDateRange}
                >
                  <option value="all">Cualquiera</option>
                  <option value="mes">Este mes</option>
                  <option value="trimestre">Este trimestre</option>
                  <option value="anio">Este año</option>
                </select>
                {useCustomDateRange ? (
                  <p className="muted mt-0.5 text-[10px]">Desactivado: usá el rango de fechas</p>
                ) : null}
              </div>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-4">
              <div>
                <label
                  className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-500"
                  htmlFor="inv-from"
                >
                  Desde
                </label>
                <input id="inv-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </div>
              <div>
                <label
                  className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-500"
                  htmlFor="inv-to"
                >
                  Hasta
                </label>
                <input id="inv-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
              <div>
                <label
                  className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-500"
                  htmlFor="inv-amt-min"
                >
                  Total mín.
                </label>
                <input
                  id="inv-amt-min"
                  inputMode="decimal"
                  placeholder="Min"
                  value={amountMin}
                  onChange={(e) => setAmountMin(e.target.value)}
                />
              </div>
              <div>
                <label
                  className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-500"
                  htmlFor="inv-amt-max"
                >
                  Total máx.
                </label>
                <input
                  id="inv-amt-max"
                  inputMode="decimal"
                  placeholder="Max"
                  value={amountMax}
                  onChange={(e) => setAmountMax(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center gap-2.5 pt-0.5">
              <button type="button" className="fact-clear-btn" onClick={clearFilters}>
                Limpiar filtros
              </button>
              <p className="text-xs text-slate-500">
                {filtered.length} resultado{filtered.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">
            <div className="table-wrap desktop-only">
              <table className="w-full border-collapse text-[12.5px]">
                <thead>
                  <tr>
                    <th
                      className="w-8 border-b border-slate-200/80 bg-slate-50/90 px-2.5 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-slate-500"
                      aria-hidden
                    />
                    <th className="border-b border-slate-200/80 bg-slate-50/90 px-2.5 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-slate-500">
                      Número
                    </th>
                    <th className="border-b border-slate-200/80 bg-slate-50/90 px-2.5 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-slate-500">
                      Emisión
                    </th>
                    <th className="border-b border-slate-200/80 bg-slate-50/90 px-2.5 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-slate-500">
                      Total
                    </th>
                    <th className="border-b border-slate-200/80 bg-slate-50/90 px-2.5 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-slate-500">
                      Estado
                    </th>
                    <th className="border-b border-slate-200/80 bg-slate-50/90 px-2.5 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-slate-500">
                      Saldo
                    </th>
                    <th className="border-b border-slate-200/80 bg-slate-50/90 px-2.5 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-slate-500">
                      Descargas
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((inv) => {
                    const bal = balanceMap.get(inv.id) ?? 0;
                    const isOpen = expanded.has(inv.id);
                    const canPay = inv.status !== "anulada" && inv.status !== "borrador" && bal > 0.009;
                    return (
                      <Fragment key={inv.id}>
                        <tr className="group hover:bg-slate-50/90">
                          <td className="align-middle border-b border-slate-200/80">
                            <button
                              type="button"
                              className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-slate-600 transition hover:bg-slate-100"
                              aria-expanded={isOpen}
                              onClick={() => toggleExpand(inv.id)}
                              title={isOpen ? "Menos" : "Ver subtotal, IVA, notas y pagos"}
                            >
                              {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            </button>
                          </td>
                          <td className="border-b border-slate-200/80 px-2.5 py-2.5 font-medium text-slate-900">
                            {inv.number} {docBadge(inv)}
                          </td>
                          <td className="whitespace-nowrap border-b border-slate-200/80 px-2.5 py-2.5 text-slate-500">
                            {fmtFecha(inv.issueDate)}
                          </td>
                          <td className="border-b border-slate-200/80 px-2.5 py-2.5 font-medium text-slate-900">
                            {fmtCLP(inv.total)}
                          </td>
                          <td className="border-b border-slate-200/80 px-2.5 py-2.5">
                            <PaymentStatusPill inv={inv} />
                          </td>
                          <td className="border-b border-slate-200/80 px-2.5 py-2.5">
                            {inv.status !== "anulada" && inv.status !== "borrador" ? (
                              <div className="flex flex-col items-start gap-1.5">
                                <span className="text-[13px] font-medium tabular-nums text-slate-900">
                                  {fmtCLP(bal)}
                                </span>
                                {canPay ? (
                                  <button
                                    type="button"
                                    className="btn-pay"
                                    onClick={() => {
                                      setPayTarget(inv);
                                      setPayAmount(String(Math.round(bal * 100) / 100));
                                      setPayFile(null);
                                      setPayError(null);
                                    }}
                                  >
                                    Pagar
                                  </button>
                                ) : null}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">N/A</span>
                            )}
                          </td>
                          <td className="border-b border-slate-200/80 px-2.5 py-2.5 align-middle">
                            <div className="flex flex-row flex-wrap gap-1.5">
                              <button
                                type="button"
                                className="btn-primary btn-sm inline-flex items-center gap-1"
                                aria-label={`Descargar PDF de factura ${inv.number}`}
                                onClick={() => void downloadPdf(inv.id, inv.number)}
                              >
                                <FileDown size={14} /> PDF
                              </button>
                              <button
                                type="button"
                                className="btn-secondary btn-sm inline-flex items-center gap-1"
                                aria-label={`Descargar XML de factura ${inv.number}`}
                                onClick={() => void downloadXml(inv.id, inv.number)}
                              >
                                <FileCode size={14} /> XML
                              </button>
                            </div>
                          </td>
                        </tr>
                        {isOpen ? (
                          <tr className="bg-slate-100/70">
                            <td colSpan={7} className="border-b border-slate-200/80 !py-3">
                              <div className="flex max-w-3xl flex-col gap-1.5 px-1 text-xs text-slate-600 sm:pl-0">
                                <p>
                                  <span className="font-medium text-slate-900">Subtotal:</span> {fmtCLP(inv.subtotal)}{" "}
                                  <span className="ms-3 font-medium text-slate-900">IVA:</span> {fmtCLP(inv.taxAmount)}
                                </p>
                                {inv.dueDate ? (
                                  <p>
                                    <span className="font-medium text-slate-900">Vencimiento:</span> {fmtFecha(inv.dueDate)}
                                  </p>
                                ) : null}
                                {inv.notes ? (
                                  <p>
                                    <span className="font-medium text-slate-900">Notas:</span> {inv.notes}
                                  </p>
                                ) : null}
                                <div>
                                  <p className="font-medium text-slate-900">Pagos vinculados</p>
                                  <div className="mt-1">
                                    <PaymentsMiniList inv={inv} />
                                  </div>
                                  <Link
                                    className="mt-2 inline-block text-[#185FA5] underline hover:text-[#0f4a7a]"
                                    to="/cliente/pagos"
                                  >
                                    Ver historial completo de pagos →
                                  </Link>
                                </div>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile */}
            <div className="mobile-card-list mobile-only space-y-3 p-3 sm:p-0">
              {pageRows.map((inv) => {
                const bal = balanceMap.get(inv.id) ?? 0;
                const canPay = inv.status !== "anulada" && inv.status !== "borrador" && bal > 0.009;
                const isOpen = expanded.has(inv.id);
                return (
                  <article key={inv.id} className="mobile-data-card space-y-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <strong>
                        {inv.number} {docBadge(inv)}
                      </strong>
                      <PaymentStatusPill inv={inv} />
                    </div>
                    <div className="muted">Emitida: {fmtFecha(inv.issueDate)}</div>
                    <div className="text-sm">
                      Total {fmtCLP(inv.total)} · Saldo {fmtCLP(bal)}
                    </div>
                    <div className="flex flex-row flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn-primary btn-sm inline-flex items-center gap-1"
                        onClick={() => void downloadPdf(inv.id, inv.number)}
                      >
                        <FileDown size={14} /> PDF
                      </button>
                      <button
                        type="button"
                        className="btn-secondary btn-sm inline-flex items-center gap-1"
                        onClick={() => void downloadXml(inv.id, inv.number)}
                      >
                        <FileCode size={14} /> XML
                      </button>
                      {canPay ? (
                        <button
                          type="button"
                          className="btn-pay"
                          onClick={() => {
                            setPayTarget(inv);
                            setPayAmount(String(Math.round(bal * 100) / 100));
                            setPayFile(null);
                            setPayError(null);
                          }}
                        >
                          Pagar
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="btn-secondary btn-sm inline-flex items-center gap-1"
                        onClick={() => toggleExpand(inv.id)}
                      >
                        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        {isOpen ? "Menos" : "Notas y pagos"}
                      </button>
                    </div>
                    {isOpen ? (
                      <div className="border-t border-slate-200 pt-2 text-xs text-slate-700">
                        <p>
                          <span className="font-medium">Subtotal:</span> {fmtCLP(inv.subtotal)} ·{" "}
                          <span className="font-medium">IVA:</span> {fmtCLP(inv.taxAmount)}
                        </p>
                        {inv.dueDate ? <p>Vencimiento: {fmtFecha(inv.dueDate)}</p> : null}
                        {inv.notes ? <p>Notas: {inv.notes}</p> : null}
                        <p className="mt-1.5 font-medium">Pagos</p>
                        <PaymentsMiniList inv={inv} />
                        <Link className="mt-2 inline-block text-blue-700 underline" to="/cliente/pagos">
                          Historial de pagos →
                        </Link>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>

            {filtered.length === 0 ? (
              <p className="px-4 py-7 text-center text-sm text-slate-500">No hay facturas con estos filtros.</p>
            ) : null}

            {totalPages > 1 ? (
              <div className="flex items-center justify-center gap-2 border-t border-slate-200/80 px-3.5 py-2.5">
                <button
                  type="button"
                  className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600 transition hover:bg-slate-100 disabled:opacity-40"
                  disabled={pageSafe <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  ← Anterior
                </button>
                <span className="text-xs text-slate-500">
                  Página {pageSafe} / {totalPages}
                </span>
                <button
                  type="button"
                  className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600 transition hover:bg-slate-100 disabled:opacity-40"
                  disabled={pageSafe >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Siguiente →
                </button>
              </div>
            ) : null}
          </div>
        </>
      ) : null}

      <ClientePortalNavHint />

      {/* ── Modal: registrar pago ── */}
      {payTarget ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-4 shadow-xl">
            <h3 className="text-base font-semibold text-slate-900">Registrar pago · {payTarget.number}</h3>
            <p className="muted mt-1">
              Saldo pendiente: <strong className="tabular-nums">{fmtCLP(balanceMap.get(payTarget.id) ?? 0)}</strong>. La
              empresa validará el comprobante.
            </p>
            <label className="mt-3 block">Monto</label>
            <input inputMode="decimal" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
            <label className="mt-2 block">Comprobante (PDF o imagen)</label>
            <input
              type="file"
              accept=".pdf,image/png,image/jpeg,image/webp"
              className="!py-1 text-xs"
              onChange={(e) => setPayFile(e.target.files?.[0] ?? null)}
            />
            {payError ? <p className="error mt-2">{payError}</p> : null}
            <div className="form-actions">
              <button type="button" className="btn-primary" disabled={payMut.isPending} onClick={() => payMut.mutate()}>
                Enviar comprobante
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={payMut.isPending}
                onClick={() => {
                  setPayTarget(null);
                  setPayError(null);
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
