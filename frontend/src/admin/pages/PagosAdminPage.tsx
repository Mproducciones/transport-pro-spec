import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useSearchParams } from "react-router-dom";
import { apiBlob, apiGet, apiSend, downloadBlob } from "../../api/client.js";
import { fromDateInputValue, periodBounds, toDateInputValue } from "../../lib/historyPeriod.js";
import { notify } from "../../lib/notify.js";
import { describeEnvioModalityInPagos, paymentTermListSuffix } from "../../lib/paymentTerms.js";
import { buildDefaultPaymentReference, buildServicePaymentReference } from "../../lib/servicePaymentReference.js";
import { FloatingAlertModal } from "../FloatingAlertModal.js";

type InvoiceMini = { id: string; number: string; total: unknown };
type ShipmentMini = {
  id: string;
  origin: string;
  destination: string;
  customer: { name: string };
  /** Saldo pendiente (mismo criterio que el resto de la app). */
  balanceAmount?: string;
  paidAmount?: string;
  /** Modalidad acordada (enum envío) — alimenta el bloque informativo al registrar cobro. */
  paymentTerm?: "upfront_full" | "upfront_partial" | "delivery";
  upfrontPercent?: string | null;
  upfrontAmount?: string | null;
  totalAmount?: string | null;
  amount?: string | null;
  invoiceLines?: Array<{ invoice: { id: string; number: string } }>;
};
type PaymentRow = {
  id: string;
  amount: unknown;
  method: string;
  reference: string | null;
  paidAt: string;
  verificationStatus: "pendiente" | "aprobado" | "rechazado";
  verificationNote?: string | null;
  mockProof?: { fileName: string; mimeType: string; sizeBytes: number; hasInlineData?: boolean } | null;
  invoice?: { id?: string; number: string; total?: unknown; customer?: { name: string } } | null;
  shipment?: {
    id: string;
    origin: string;
    destination: string;
    totalAmount?: string | null;
    amount?: string | null;
    /** Estado de cobro del envío (parcial, pagado, etc.) */
    paymentStatus?: "pendiente" | "parcial" | "pagado";
    customer?: { name: string };
  } | null;
  recordedBy?: { email: string; role?: "admin" | "cliente" | "conductor" } | null;
  verifiedBy?: { email: string } | null;
};

type ProofPreview = { url: string; mimeType: string; fileName: string; paymentId: string };

type SettingsPayload = {
  company: { legalName: string; taxId: string | null; address: string | null; phone: string | null } | null;
};

function fmtCLP(value: unknown): string {
  return Number(value).toLocaleString("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  });
}

function paymentCustomer(p: PaymentRow): string {
  return p.invoice?.customer?.name ?? p.shipment?.customer?.name ?? "—";
}

function conceptoLine(p: PaymentRow): string {
  if (p.shipment) return `Servicio: ${p.shipment.origin} -> ${p.shipment.destination}`;
  if (p.invoice?.number) return `Factura: ${p.invoice.number}`;
  return "Pago sin vínculo directo";
}

function pagoOrigenLabel(recordedBy: PaymentRow["recordedBy"]): string {
  const r = recordedBy?.role;
  if (r === "cliente") return "Portal cliente";
  if (r === "conductor") return "Chofer (ruta)";
  if (r === "admin") return "Oficina / admin";
  return "—";
}

function shipmentCobroHeadline(sh: NonNullable<PaymentRow["shipment"]>): string {
  const short = sh.id.slice(-6).toUpperCase();
  return `Ped. ${short} · ${sh.origin} → ${sh.destination}`;
}

function paymentStatusLabelEs(s: string | undefined): string {
  if (s === "pagado") return "Cobro servicio: al día";
  if (s === "parcial") return "Cobro servicio: parcial";
  return "Cobro servicio: pendiente";
}

/** `paidAt` dentro del rango inclusive en hora local; cadenas vacías = sin límite en ese extremo. */
function paymentInDateRange(paidAt: string, fromIso: string, toIso: string): boolean {
  if (!fromIso && !toIso) return true;
  const t = new Date(paidAt).getTime();
  if (!Number.isFinite(t)) return false;
  let from = fromIso;
  let to = toIso;
  if (from && to && from > to) {
    const s = from;
    from = to;
    to = s;
  }
  if (from) {
    const s = fromDateInputValue(from);
    s.setHours(0, 0, 0, 0);
    if (t < s.getTime()) return false;
  }
  if (to) {
    const e = fromDateInputValue(to);
    e.setHours(23, 59, 59, 999);
    if (t > e.getTime()) return false;
  }
  return true;
}

function formatHistoryRangeLabel(fromIso: string, toIso: string): string {
  if (fromIso && toIso) {
    return ` (${fromDateInputValue(fromIso).toLocaleDateString("es-CL")} — ${fromDateInputValue(toIso).toLocaleDateString("es-CL")})`;
  }
  if (fromIso) return ` (desde ${fromDateInputValue(fromIso).toLocaleDateString("es-CL")})`;
  if (toIso) return ` (hasta ${fromDateInputValue(toIso).toLocaleDateString("es-CL")})`;
  return "";
}

export function PagosAdminPage() {
  const qc = useQueryClient();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const paymentsQ = useQuery({ queryKey: ["payments"], queryFn: () => apiGet<PaymentRow[]>("/payments") });
  const invoicesQ = useQuery({ queryKey: ["invoices"], queryFn: () => apiGet<InvoiceMini[]>("/invoices") });
  const shipmentsQ = useQuery({ queryKey: ["shipments"], queryFn: () => apiGet<ShipmentMini[]>("/shipments") });
  const settingsQ = useQuery({ queryKey: ["settings"], queryFn: () => apiGet<SettingsPayload>("/settings") });

  const ver = searchParams.get("ver");
  const envioFromQuery = searchParams.get("envio");
  const montoFromQuery = searchParams.get("monto");
  const appliedCarteraRef = useRef<string>("");
  const enfasisComprobantesPendientes =
    ver === "comprobantes" ||
    ver === "pendientes" ||
    location.hash === "#comprobantes-pendientes";

  const [invoiceId, setInvoiceId] = useState("");
  const [shipmentId, setShipmentId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("transferencia");
  const [reference, setReference] = useState("");
  const [guardAlert, setGuardAlert] = useState<string | null>(null);
  const [verificationNotes, setVerificationNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  /** Comprobante pendiente abierto en modal (detalle + validar). */
  const [pendingDetail, setPendingDetail] = useState<PaymentRow | null>(null);
  const [pendingDetailProof, setPendingDetailProof] = useState<ProofPreview | null>(null);
  const [pendingDetailProofLoading, setPendingDetailProofLoading] = useState(false);
  const [showManualRegister, setShowManualRegister] = useState(false);
  const [carteraHighlight, setCarteraHighlight] = useState(false);
  /** Filtro de historial por fecha de movimiento (paidAt), formato YYYY-MM-DD */
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");
  const [historyCalendarOpen, setHistoryCalendarOpen] = useState(false);
  const [historyCalendarMonth, setHistoryCalendarMonth] = useState<Date>(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [historyRangeAnchor, setHistoryRangeAnchor] = useState<string | null>(null);
  /** Lista plana o agrupada por envío (pedido / servicio). */
  const [historyLayout, setHistoryLayout] = useState<"linea" | "servicio">("linea");
  const [historyTab, setHistoryTab] = useState<"all" | "pendiente" | "sin_cobrar" | "rechazado">("all");
  /** KPI: lista compacta en modal (pendientes / monto / rechazados) */
  const [kpiListModal, setKpiListModal] = useState<null | "pendientes" | "monto" | "rechazados">(null);
  /** Detalle solo lectura (p. ej. comprobante rechazado) encima de la lista KPI */
  const [readonlyPayment, setReadonlyPayment] = useState<PaymentRow | null>(null);
  const [readonlyProof, setReadonlyProof] = useState<ProofPreview | null>(null);
  const [readonlyProofLoading, setReadonlyProofLoading] = useState(false);
  const [floatingSection, setFloatingSection] = useState<null | "comprobantes" | "registro" | "historial">(null);
  const [modalStack, setModalStack] = useState<string[]>([]);
  /** Evita pisar el importe al refrescar /shipments si el usuario ya eligió envío. */
  const pagoAutofillEnvioIdRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (!enfasisComprobantesPendientes) return;
    const id = "comprobantes-pendientes";
    const scroll = () => document.getElementById(id)?.scrollIntoView({ block: "start", behavior: "instant" });
    scroll();
    requestAnimationFrame(() => scroll());
  }, [location.pathname, location.search, location.hash, enfasisComprobantesPendientes]);

  /** Deep link desde Inicio → Cartera: abre registro manual con envío (y monto sugerido). */
  useLayoutEffect(() => {
    if (!envioFromQuery) {
      appliedCarteraRef.current = "";
      return;
    }
    const rows = shipmentsQ.data;
    if (!rows?.length) return;
    if (!rows.some((s) => s.id === envioFromQuery)) return;
    const key = `${envioFromQuery}|${montoFromQuery ?? ""}`;
    if (appliedCarteraRef.current === key) return;
    appliedCarteraRef.current = key;
    setShipmentId(envioFromQuery);
    setInvoiceId("");
    setShowManualRegister(true);
    if (montoFromQuery) {
      const digits = String(montoFromQuery).replace(/\D/g, "");
      const n = digits ? Number(digits) : NaN;
      if (Number.isFinite(n) && n > 0) setAmount(String(Math.round(n)));
    }
  }, [envioFromQuery, montoFromQuery, shipmentsQ.data]);

  useEffect(() => {
    if (!envioFromQuery || !showManualRegister) return;
    const t = window.setTimeout(() => {
      document.getElementById("registro-manual-pago")?.scrollIntoView({ block: "start", behavior: "smooth" });
    }, 80);
    return () => window.clearTimeout(t);
  }, [envioFromQuery, showManualRegister]);

  useEffect(() => {
    if (!envioFromQuery || !showManualRegister) return;
    setCarteraHighlight(true);
    const t = window.setTimeout(() => setCarteraHighlight(false), 4000);
    return () => window.clearTimeout(t);
  }, [envioFromQuery, showManualRegister]);

  useEffect(() => {
    if (!showManualRegister) {
      pagoAutofillEnvioIdRef.current = null;
      return;
    }
    const c = settingsQ.data?.company;
    if (!shipmentId || !shipmentsQ.data) {
      pagoAutofillEnvioIdRef.current = null;
      if (c) setReference((prev) => (prev.trim() ? prev : buildDefaultPaymentReference(c)));
      return;
    }
    const s = shipmentsQ.data.find((x) => x.id === shipmentId);
    if (!s) return;
    if (pagoAutofillEnvioIdRef.current !== shipmentId) {
      pagoAutofillEnvioIdRef.current = shipmentId;
      const bal = Number(s.balanceAmount ?? 0);
      if (Number.isFinite(bal) && bal > 0) setAmount(String(Math.round(bal)));
      if (c) {
        setReference(buildServicePaymentReference(c, s));
      }
    } else if (c) {
      setReference((prev) => (prev.trim() ? prev : buildServicePaymentReference(c, s)));
    }
  }, [showManualRegister, shipmentId, shipmentsQ.data, settingsQ.data]);

  const create = useMutation({
    mutationFn: () =>
      apiSend("/payments", "POST", {
        invoiceId: invoiceId || undefined,
        shipmentId: shipmentId || undefined,
        amount: Number(amount),
        method,
        reference: reference || undefined,
      }),
    onSuccess: () => {
      setAmount("");
      setReference("");
      pagoAutofillEnvioIdRef.current = null;
      setError(null);
      void qc.invalidateQueries({ queryKey: ["payments"] });
      void qc.invalidateQueries({ queryKey: ["shipments"] });
      notify("success", "Cobro del servicio registrado: quedó en movimientos y actualiza el saldo del envío o factura.");
    },
    onError: (e: Error) => setError(e.message),
  });

  const verify = useMutation({
    mutationFn: (p: { id: string; status: "aprobado" | "rechazado"; note?: string }) =>
      apiSend(`/payments/${p.id}/verification`, "PATCH", p),
    onSuccess: (_d, variables) => {
      setError(null);
      setPendingDetail((cur) => (cur?.id === variables.id ? null : cur));
      setPendingDetailProof((pr) => {
        if (pr?.paymentId === variables.id) {
          URL.revokeObjectURL(pr.url);
          return null;
        }
        return pr;
      });
      void qc.invalidateQueries({ queryKey: ["payments"] });
      void qc.invalidateQueries({ queryKey: ["shipments"] });
      notify(
        "success",
        variables.status === "aprobado"
          ? "Pago aprobado: quedó aplicado al envío o factura asociada."
          : "Pago rechazado: el cliente puede corregir y reenviar comprobante."
      );
    },
    onError: (e: Error) => setError(e.message),
  });

  const closePendingDetailModal = useCallback(() => {
    setPendingDetailProof((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
    setPendingDetailProofLoading(false);
    setPendingDetail(null);
  }, []);

  const closeReadonlyModal = useCallback(() => {
    setReadonlyProof((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
    setReadonlyProofLoading(false);
    setReadonlyPayment(null);
  }, []);

  function pushModal(key: string) {
    setModalStack((prev) => (prev[prev.length - 1] === key ? prev : [...prev, key]));
  }

  function closeTopModal() {
    const top = modalStack[modalStack.length - 1];
    if (!top) return;
    if (top === "pending") closePendingDetailModal();
    if (top === "readonly") closeReadonlyModal();
    if (top === "kpi") setKpiListModal(null);
    if (top === "sec-comprobantes" || top === "sec-registro" || top === "sec-historial") setFloatingSection(null);
    setModalStack((prev) => prev.slice(0, -1));
  }

  async function openReadonlyPayment(p: PaymentRow) {
    setError(null);
    setReadonlyPayment(p);
    pushModal("readonly");
    setReadonlyProof((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
    if (!p.mockProof?.hasInlineData) {
      setReadonlyProofLoading(false);
      return;
    }
    setReadonlyProofLoading(true);
    try {
      const blob = await apiBlob(`/payments/${p.id}/proof-file`);
      setReadonlyProof({
        url: URL.createObjectURL(blob),
        mimeType: blob.type || p.mockProof?.mimeType || "application/pdf",
        fileName: p.mockProof?.fileName || `comprobante-${p.id.slice(-6)}.pdf`,
        paymentId: p.id,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos cargar el comprobante.");
    } finally {
      setReadonlyProofLoading(false);
    }
  }

  async function openPendingDetail(p: PaymentRow) {
    setError(null);
    setPendingDetail(p);
    pushModal("pending");
    setPendingDetailProof((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
    if (!p.mockProof?.hasInlineData) {
      setPendingDetailProofLoading(false);
      return;
    }
    setPendingDetailProofLoading(true);
    try {
      const blob = await apiBlob(`/payments/${p.id}/proof-file`);
      setPendingDetailProof({
        url: URL.createObjectURL(blob),
        mimeType: blob.type || p.mockProof?.mimeType || "application/pdf",
        fileName: p.mockProof?.fileName || `comprobante-${p.id.slice(-6)}.pdf`,
        paymentId: p.id,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos cargar el comprobante.");
    } finally {
      setPendingDetailProofLoading(false);
    }
  }

  async function downloadCsv(kind: "payments") {
    const blob = await apiBlob(`/reports/${kind}.csv`);
    downloadBlob(blob, "pagos.csv");
  }

  const pendingPayments = (paymentsQ.data ?? []).filter((p) => p.verificationStatus === "pendiente");
  const rejectedPayments = (paymentsQ.data ?? []).filter((p) => p.verificationStatus === "rechazado");
  const pendingAmount = pendingPayments.reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
  const cobradoEsteMes = (paymentsQ.data ?? [])
    .filter((p) => p.verificationStatus === "aprobado")
    .filter((p) => {
      const d = new Date(p.paidAt);
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
  const saldoPendienteRows = useMemo(
    () =>
      (shipmentsQ.data ?? [])
        .filter((s) => Number(s.balanceAmount ?? 0) > 0.009)
        .filter((s) => s.paymentStatus !== "pagado")
        .sort((a, b) => Number(b.balanceAmount ?? 0) - Number(a.balanceAmount ?? 0)),
    [shipmentsQ.data]
  );
  const porCobrar = saldoPendienteRows.reduce((sum, s) => sum + Number(s.balanceAmount ?? 0), 0);
  const rechazadosSinReenvio = rejectedPayments.filter((r) => {
    const newer = (paymentsQ.data ?? []).some((p) => {
      const sameInvoice = r.invoice?.id && p.invoice?.id && p.invoice.id === r.invoice.id;
      const sameShipment = r.shipment?.id && p.shipment?.id && p.shipment.id === r.shipment.id;
      if (!sameInvoice && !sameShipment) return false;
      return new Date(p.paidAt).getTime() > new Date(r.paidAt).getTime() && p.verificationStatus !== "rechazado";
    });
    return !newer;
  });

  const historyFiltered = useMemo(() => {
    const rows = paymentsQ.data ?? [];
    const base = rows
      .filter((p) => paymentInDateRange(p.paidAt, historyFrom, historyTo))
      .sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime());
    if (historyTab === "pendiente") return base.filter((p) => p.verificationStatus === "pendiente");
    if (historyTab === "rechazado") return base.filter((p) => p.verificationStatus === "rechazado");
    if (historyTab === "sin_cobrar") {
      return base.filter((p) => p.shipment?.paymentStatus !== "pagado" && p.verificationStatus !== "aprobado");
    }
    return base;
  }, [paymentsQ.data, historyFrom, historyTo, historyTab]);
  const historyFilterActive = Boolean(historyFrom || historyTo);
  const historyTotal = (paymentsQ.data ?? []).length;
  const historyCalendarCells = useMemo(() => {
    const first = new Date(historyCalendarMonth.getFullYear(), historyCalendarMonth.getMonth(), 1);
    const firstWeekday = (first.getDay() + 6) % 7;
    const start = new Date(first);
    start.setDate(first.getDate() - firstWeekday);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return {
        date: d,
        iso: toDateInputValue(d),
        inMonth: d.getMonth() === historyCalendarMonth.getMonth(),
      };
    });
  }, [historyCalendarMonth]);

  const servicioGroups = useMemo(() => {
    type G = { shipment: NonNullable<PaymentRow["shipment"]>; payments: PaymentRow[]; lastAt: number };
    const m = new Map<string, G>();
    for (const p of historyFiltered) {
      const sh = p.shipment;
      if (!sh?.id) continue;
      let g = m.get(sh.id);
      if (!g) {
        g = { shipment: sh, payments: [], lastAt: 0 };
        m.set(sh.id, g);
      }
      g.payments.push(p);
      const t = new Date(p.paidAt).getTime();
      if (Number.isFinite(t) && t > g.lastAt) g.lastAt = t;
    }
    for (const g of m.values()) {
      g.payments.sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime());
    }
    return [...m.values()].sort((a, b) => b.lastAt - a.lastAt);
  }, [historyFiltered]);

  const facturaSoloRows = useMemo(
    () => historyFiltered.filter((p) => p.invoice && !p.shipment?.id),
    [historyFiltered],
  );

  const sinVincularRows = useMemo(
    () => historyFiltered.filter((p) => !p.shipment?.id && !p.invoice),
    [historyFiltered],
  );

  const selectedShipmentPago = useMemo(() => {
    if (!shipmentId) return null;
    return (shipmentsQ.data ?? []).find((x) => x.id === shipmentId) ?? null;
  }, [shipmentId, shipmentsQ.data]);
  const selectedShipmentInvoices = useMemo(() => {
    if (!selectedShipmentPago?.invoiceLines?.length) return [];
    const map = new Map<string, { id: string; number: string }>();
    for (const line of selectedShipmentPago.invoiceLines) {
      if (line.invoice?.id) map.set(line.invoice.id, line.invoice);
    }
    return [...map.values()];
  }, [selectedShipmentPago]);
  const shipmentRequiresInvoice = Boolean(shipmentId && selectedShipmentInvoices.length > 0);
  const invoiceMatchesShipment = !shipmentRequiresInvoice || selectedShipmentInvoices.some((inv) => inv.id === invoiceId);
  const pagoModality = useMemo(
    () => (selectedShipmentPago ? describeEnvioModalityInPagos(selectedShipmentPago) : null),
    [selectedShipmentPago],
  );

  function handleCreatePayment() {
    if (!amount.trim()) {
      setGuardAlert("Ingresá el importe del cobro para registrar el movimiento.");
      return;
    }
    if (!shipmentId && !invoiceId) {
      setGuardAlert("Seleccioná un envío o una factura antes de guardar el registro.");
      return;
    }
    if (!invoiceMatchesShipment) {
      setGuardAlert("La factura elegida no corresponde al envío seleccionado. Elegí una factura vinculada.");
      return;
    }
    create.mutate();
  }

  function openPorCobrarView() {
    setHistoryLayout("servicio");
    setHistoryTab("sin_cobrar");
    setFloatingSection("historial");
    pushModal("sec-historial");
  }

  function selectHistoryCalendarDay(iso: string) {
    if (!historyRangeAnchor) {
      setHistoryFrom(iso);
      setHistoryTo("");
      setHistoryRangeAnchor(iso);
      return;
    }
    const start = historyRangeAnchor <= iso ? historyRangeAnchor : iso;
    const end = historyRangeAnchor <= iso ? iso : historyRangeAnchor;
    setHistoryFrom(start);
    setHistoryTo(end);
    setHistoryRangeAnchor(null);
  }

  useEffect(() => {
    if (!shipmentRequiresInvoice) return;
    if (selectedShipmentInvoices.length === 1 && !invoiceId) {
      setInvoiceId(selectedShipmentInvoices[0]!.id);
      return;
    }
    if (invoiceId && !selectedShipmentInvoices.some((inv) => inv.id === invoiceId)) {
      setInvoiceId("");
    }
  }, [shipmentRequiresInvoice, selectedShipmentInvoices, invoiceId]);

  const pendingDetailLive = useMemo(() => {
    if (!pendingDetail) return null;
    return (paymentsQ.data ?? []).find((x) => x.id === pendingDetail.id) ?? pendingDetail;
  }, [pendingDetail, paymentsQ.data]);

  const readonlyDetailLive = useMemo(() => {
    if (!readonlyPayment) return null;
    return (paymentsQ.data ?? []).find((x) => x.id === readonlyPayment.id) ?? readonlyPayment;
  }, [readonlyPayment, paymentsQ.data]);

  useEffect(() => {
    setModalStack((prev) =>
      prev.filter((key) => {
        if (key === "pending") return !!pendingDetailLive;
        if (key === "readonly") return !!readonlyDetailLive;
        if (key === "kpi") return !!kpiListModal;
        if (key === "sec-comprobantes") return floatingSection === "comprobantes";
        if (key === "sec-registro") return floatingSection === "registro";
        if (key === "sec-historial") return floatingSection === "historial";
        return true;
      })
    );
  }, [pendingDetailLive, readonlyDetailLive, kpiListModal, floatingSection]);

  useEffect(() => {
    if (!pendingDetail && !kpiListModal && !readonlyPayment && !floatingSection) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      closeTopModal();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingDetail, kpiListModal, readonlyPayment, floatingSection, modalStack, closePendingDetailModal, closeReadonlyModal]);

  return (
    <div className="page-stack">
      <header className="page-header">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 max-w-2xl">
            <h1>Pagos y anticipos</h1>
            <p className="mt-1 text-base font-medium leading-snug text-white">
              Revisá transferencias que suben los clientes, registrá cobros de caja u oficina, y consultá el historial de todo lo
              que entró.
            </p>
            <nav
              className="mt-4 flex flex-wrap gap-2"
              aria-label="Secciones de esta pantalla"
            >
              <button
                type="button"
                className="inline-flex items-center rounded-full border border-white/30 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
                onClick={() => {
                  setFloatingSection("comprobantes");
                  pushModal("sec-comprobantes");
                }}
              >
                1 · Comprobantes
              </button>
              <button
                type="button"
                className="inline-flex items-center rounded-full border border-white/30 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
                onClick={() => {
                  setFloatingSection("registro");
                  pushModal("sec-registro");
                }}
              >
                2 · Cobro oficina
              </button>
              <button
                type="button"
                className="inline-flex items-center rounded-full border border-white/30 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
                onClick={() => {
                  setFloatingSection("historial");
                  pushModal("sec-historial");
                }}
              >
                3 · Historial
              </button>
            </nav>
            <details className="mt-3 max-w-xl text-sm text-blue-100/95 [&_summary]:cursor-pointer [&_summary]:select-none [&_summary]:font-semibold [&_summary]:text-blue-50">
              <summary>Guía: qué hace cada bloque y qué significan los estados</summary>
              <div className="mt-2 space-y-2.5 rounded-lg border border-white/20 bg-slate-950/35 px-3 py-2.5 text-xs leading-relaxed text-blue-50/95">
                <p>
                  <span className="font-semibold text-white">Comprobantes por validar</span> — el cliente (o a veces un agente) cargó
                  comprobante o dejó un pago pendiente de revisión. Tocá un ítem: se abre el detalle y podés aprobar o rechazar.
                </p>
                <p>
                  <span className="font-semibold text-white">Registrar cobro del servicio</span> — usalo si cobraste en{" "}
                  <strong>efectivo</strong>, <strong>transferencia directa a caja</strong> o anotás un pago que{" "}
                  <em>no</em> figura arriba. Si el mismo dinero ya está en comprobantes, validá allá y no dupliques.
                </p>
                <p>
                  <span className="font-semibold text-white">Historial</span> — listado de todos los movimientos ya registrados;
                  filtrá por fechas o agrupá por pedido.
                </p>
                <p className="border-t border-white/10 pt-2.5 text-[11px] text-blue-100/85">
                  <strong>Estados:</strong> <strong>Pendiente</strong> = aún no validó oficina · <strong>Aprobado</strong> = ya quedó
                  aplicado al envío o factura · <strong>Rechazado</strong> = el cliente puede reenviar otro comprobante.
                </p>
              </div>
            </details>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setFloatingSection("comprobantes");
                pushModal("sec-comprobantes");
              }}
            >
              Validar comprobantes
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => void downloadCsv("payments")}
            >
              Exportar pagos CSV
            </button>
          </div>
        </div>
      </header>
      {error ? <p className="error">{error}</p> : null}
      <div
        className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200/80 bg-gradient-to-br from-amber-50/70 via-white to-cyan-50/60 px-3 py-2.5 shadow-sm ring-1 ring-slate-200/40"
        role="toolbar"
        aria-label="Atención rápida en pagos"
      >
        <button
          type="button"
          onClick={() => {
            setFloatingSection("comprobantes");
            pushModal("sec-comprobantes");
          }}
          className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-950 shadow-sm ring-1 ring-amber-900/5 hover:bg-amber-100/90"
        >
          Comprobantes por validar ({pendingPayments.length})
        </button>
        <button
          type="button"
          onClick={() => {
            setFloatingSection("registro");
            pushModal("sec-registro");
          }}
          className="inline-flex items-center gap-1 rounded-full border border-cyan-200 bg-cyan-50/90 px-3 py-1.5 text-xs font-semibold text-cyan-950 shadow-sm ring-1 ring-cyan-900/5 hover:bg-cyan-100/80"
        >
          Registrar cobro oficina
        </button>
        <button
          type="button"
          onClick={() => {
            setFloatingSection("historial");
            pushModal("sec-historial");
          }}
          className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50/90 px-3 py-1.5 text-xs font-semibold text-emerald-950 shadow-sm ring-1 ring-emerald-900/5 hover:bg-emerald-100/80"
        >
          Historial de movimientos
        </button>
        <div className="inline-flex items-center gap-0.5 rounded-full border border-slate-200 bg-white p-0.5 shadow-sm ring-1 ring-slate-900/5">
          <a
            href="/admin/facturas"
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100"
          >
            Facturas
          </a>
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-600">
        Panel operativo unificado: KPI accionable + validación de comprobantes + historial de movimientos.
      </p>

      <section className="rounded-xl border border-slate-200/80 bg-gradient-to-br from-amber-50/90 via-white to-emerald-50/60 p-2.5 shadow-sm ring-1 ring-slate-200/40">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <button
              type="button"
              className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-left shadow-sm transition hover:bg-rose-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
              onClick={openPorCobrarView}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Por cobrar</p>
              <p className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">{fmtCLP(porCobrar)}</p>
              <p className="mt-0.5 text-[10px] text-slate-600">Saldo pendiente</p>
            </button>
            <button
              type="button"
              className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-left shadow-sm transition hover:bg-amber-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
              onClick={() => {
                setFloatingSection("comprobantes");
                pushModal("sec-comprobantes");
              }}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Comprobantes</p>
              <p className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">{pendingPayments.length}</p>
              <p className="mt-0.5 text-[10px] text-slate-600">Por validar</p>
            </button>
            <button
              type="button"
              className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-left shadow-sm transition hover:bg-emerald-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              onClick={() => {
                setHistoryLayout("linea");
                setHistoryTab("all");
                setFloatingSection("historial");
                pushModal("sec-historial");
              }}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Cobrado mes</p>
              <p className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">{fmtCLP(cobradoEsteMes)}</p>
              <p className="mt-0.5 text-[10px] text-slate-600">Movimientos</p>
            </button>
            <button
              type="button"
              className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-left shadow-sm transition hover:bg-rose-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
              onClick={() => {
                setHistoryLayout("linea");
                setHistoryTab("rechazado");
                setFloatingSection("historial");
                pushModal("sec-historial");
              }}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Rechazados</p>
              <p className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">{rejectedPayments.length}</p>
              <p className="mt-0.5 text-[10px] text-slate-600">Seguimiento</p>
            </button>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="m-0 text-sm font-bold uppercase tracking-wide text-rose-900">Rechazados sin reenvío</h2>
            <p className="mt-1 text-xs text-rose-900/85">Comprobantes rechazados donde aún no hay un nuevo envío del cliente.</p>
            <p className="mt-2 text-sm text-rose-900">
              {rechazadosSinReenvio.length === 0
                ? "No hay casos pendientes por reenvío."
                : `${rechazadosSinReenvio.length} caso(s) pendiente(s) de reenvío del cliente.`}
            </p>
      </section>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="min-w-[5.5rem] flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-left shadow-sm transition hover:border-amber-400/80 hover:bg-amber-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          onClick={() => {
            setKpiListModal("pendientes");
            pushModal("kpi");
          }}
        >
          <p className="text-[10px] font-semibold uppercase leading-tight tracking-wide text-slate-500">Pend. validar</p>
          <p className="text-base font-bold tabular-nums leading-tight text-slate-900">{pendingPayments.length}</p>
        </button>
        <button
          type="button"
          className="min-w-[5.5rem] flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-left shadow-sm transition hover:border-cyan-400/80 hover:bg-cyan-50/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
          onClick={() => {
            setKpiListModal("monto");
            pushModal("kpi");
          }}
        >
          <p className="text-[10px] font-semibold uppercase leading-tight tracking-wide text-slate-500">Monto pend.</p>
          <p className="text-sm font-bold tabular-nums leading-tight text-slate-900">{fmtCLP(pendingAmount)}</p>
        </button>
        <button
          type="button"
          className="min-w-[5.5rem] flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-left shadow-sm transition hover:border-rose-300/90 hover:bg-rose-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
          onClick={() => {
            setKpiListModal("rechazados");
            pushModal("kpi");
          }}
        >
          <p className="text-[10px] font-semibold uppercase leading-tight tracking-wide text-slate-500">Rechazados</p>
          <p className="text-base font-bold tabular-nums leading-tight text-slate-900">{rejectedPayments.length}</p>
        </button>
      </div>
      <div
        id="comprobantes-pendientes"
        className={`hidden card card-elevated scroll-mt-20 ${enfasisComprobantesPendientes ? "ring-2 ring-amber-400 ring-offset-2" : ""}`}
      >
        <h2 className="card-title">Comprobantes por validar</h2>
        {enfasisComprobantesPendientes ? (
          <p className="mb-2 text-xs font-medium text-amber-900">
            Vista enfocada desde Inicio: solo comprobantes pendientes (el resto de la página sigue abajo).
          </p>
        ) : null}
        <p className="mb-3 text-xs text-slate-600">
          Tocá una fila para abrir el detalle y el archivo.
        </p>
        {pendingPayments.length === 0 ? (
          <p className="text-xs text-slate-500">No hay comprobantes pendientes por validar.</p>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200">
            {pendingPayments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold tabular-nums text-slate-900">{fmtCLP(p.amount)}</p>
                  <p className="truncate text-sm text-slate-800">{paymentCustomer(p)}</p>
                  <p className="text-[11px] text-slate-500">
                    {new Date(p.paidAt).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" })} ·{" "}
                    {p.method === "efectivo" ? "Efectivo" : "Transferencia"}
                  </p>
                </div>
                <div className="flex flex-row flex-wrap gap-1">
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    aria-label="Ver detalle y comprobante"
                    onClick={() => void openPendingDetail(p)}
                  >
                    Revisar
                  </button>
                  <button
                    type="button"
                    className="btn-primary btn-sm"
                    disabled={verify.isPending}
                    aria-label="Aprobar comprobante"
                    onClick={() => verify.mutate({ id: p.id, status: "aprobado", note: verificationNotes[p.id]?.trim() || undefined })}
                  >
                    Aprobar
                  </button>
                  <button
                    type="button"
                    className="btn-danger-outline btn-sm"
                    disabled={verify.isPending}
                    aria-label="Rechazar comprobante"
                    onClick={() => verify.mutate({ id: p.id, status: "rechazado", note: verificationNotes[p.id]?.trim() || undefined })}
                  >
                    Rechazar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div
        id="registro-manual-pago"
        className={`hidden card card-elevated scroll-mt-24 ${carteraHighlight ? "ring-2 ring-blue-500 ring-offset-2" : ""}`}
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="card-title">Registrar cobro del servicio</h2>
            <p className="mt-0.5 text-xs text-slate-600">
              Cobro en caja o anotación manual <strong>por envío</strong>. Al elegir servicio se muestra la modalidad y se
              sugiere saldo y referencia. Si el cliente ya subió comprobante, usá el bloque anterior.
            </p>
          </div>
          <button
            type="button"
            className="btn-secondary btn-sm shrink-0"
            onClick={() => setShowManualRegister((v) => !v)}
          >
            {showManualRegister ? "Ocultar" : "Mostrar formulario"}
          </button>
        </div>
        {showManualRegister ? (
          <>
            {envioFromQuery && shipmentId === envioFromQuery ? (
              <p className="mb-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-950">
                Llegaste desde <strong>Cartera</strong>: el <strong>envío y el monto (saldo)</strong> ya vienen cargados. Revisá
                y tocá <strong>Guardar registro</strong>. Comprobante en revisión: usá comprobantes arriba.
              </p>
            ) : null}
            {settingsQ.data?.company ? (
              <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50/95 px-3 py-2.5 text-xs text-slate-800">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Empresa que cobra (Ajustes)</p>
                <p className="mt-1 font-semibold text-slate-900">{settingsQ.data.company.legalName}</p>
                {settingsQ.data.company.taxId ? <p className="mt-0.5">RUT: {settingsQ.data.company.taxId}</p> : null}
                {settingsQ.data.company.phone ? <p className="text-slate-700">Tel: {settingsQ.data.company.phone}</p> : null}
                {settingsQ.data.company.address ? (
                  <p className="mt-0.5 text-[11px] text-slate-600">{settingsQ.data.company.address}</p>
                ) : null}
                <p className="mt-2 text-[10px] text-slate-500">
                  Al elegir un <strong>envío</strong> abajo, el texto de referencia se arma con el servicio, el cliente, el
                  pedido y estos datos; podés ajustar o agregar nº de transferencia.
                </p>
              </div>
            ) : null}
            <p className="hint">Si el mismo pago figura con archivo en comprobantes pendientes, aprobá allí, no registro duplicado acá.</p>
            <label>Envío (servicio)</label>
            <select
              value={shipmentId}
              onChange={(e) => {
                pagoAutofillEnvioIdRef.current = null;
                setShipmentId(e.target.value);
              }}
            >
              <option value="">— Seleccionar servicio (envío) —</option>
              {(shipmentsQ.data ?? []).map((s) => {
                const mod = paymentTermListSuffix(s.paymentTerm, s.upfrontPercent);
                return (
                  <option key={s.id} value={s.id}>
                    {s.origin} → {s.destination} ({s.customer.name}
                    {mod ? ` · ${mod}` : ""}
                    {s.balanceAmount != null && Number(s.balanceAmount) > 0
                      ? ` · saldo ${fmtCLP(s.balanceAmount)}`
                      : ""}
                    )
                  </option>
                );
              })}
            </select>
            {pagoModality && shipmentId ? (
              <div
                className="mb-3 rounded-lg border border-slate-200 bg-emerald-50/90 px-3 py-2.5 text-xs text-slate-900"
                role="status"
              >
                <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-800">{pagoModality.title}</p>
                {pagoModality.lines.map((line, i) => (
                  <p key={i} className="mt-1.5 leading-snug text-slate-800">
                    {line}
                  </p>
                ))}
              </div>
            ) : null}
            <p className="-mt-1 mb-2 text-[11px] text-slate-500">
              Al elegirlo, se sugiere el <strong>importe = saldo pendiente</strong> y la <strong>referencia</strong> con ruta, cliente, pedido y datos de la empresa.
            </p>
            <label>Importe del cobro</label>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
            <label>Medio de pago</label>
            <select value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="transferencia">Transferencia bancaria</option>
              <option value="efectivo">Efectivo</option>
              <option value="cheque">Cheque</option>
              <option value="tarjeta">Tarjeta</option>
            </select>
            <label>Referencia (transferencia, nota, etc.)</label>
            <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Se completa con el servicio y la empresa" />
            <label>Factura (opcional; si aplica a este cobro)</label>
            <select value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)}>
              <option value="">— Ninguna —</option>
              {(invoicesQ.data ?? []).map((i) => (
                <option key={i.id} value={i.id}>
                  {i.number} — {String(i.total)}
                </option>
              ))}
            </select>
            {shipmentRequiresInvoice ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900" role="alert">
                <p className="font-semibold">
                  Este envío ya está facturado: la cobranza oficial debe registrarse con factura.
                </p>
                <p className="mt-1">
                  Facturas vinculadas al servicio:{" "}
                  {selectedShipmentInvoices.map((inv) => inv.number).join(", ")}.
                </p>
                {!invoiceMatchesShipment ? (
                  <p className="mt-1 font-medium">Elegí una factura vinculada para habilitar “Guardar registro”.</p>
                ) : null}
              </div>
            ) : (
              <p className="hint">
                El registro aplica a la deuda del <strong>envío</strong> (y a la factura, si la elegís) y se ve en el historial abajo.
              </p>
            )}
            <div className="form-actions">
              <button
                type="button"
                className="btn-primary"
                disabled={create.isPending}
                onClick={handleCreatePayment}
              >
                Guardar registro
              </button>
            </div>
          </>
        ) : null}
      </div>
      <div id="historial-movimientos" className="hidden card card-elevated scroll-mt-20">
        <h2 className="card-title">Historial de movimientos</h2>
        <p className="mb-3 text-xs text-slate-600">
          Fecha = cuándo se registró el pago. Atajos de período o rango libre.
        </p>
        <div className="mb-3 flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label
                className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-500"
                htmlFor="hist-desde"
              >
                Desde
              </label>
              <input
                id="hist-desde"
                type="date"
                className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 shadow-sm"
                value={historyFrom}
                onChange={(e) => setHistoryFrom(e.target.value)}
              />
            </div>
            <div>
              <label
                className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-500"
                htmlFor="hist-hasta"
              >
                Hasta
              </label>
              <input
                id="hist-hasta"
                type="date"
                className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 shadow-sm"
                value={historyTo}
                onChange={(e) => setHistoryTo(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2 pt-0.5">
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => {
                  const t = toDateInputValue(new Date());
                  setHistoryFrom(t);
                  setHistoryTo(t);
                }}
              >
                Hoy
              </button>
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => {
                  const { start, end } = periodBounds("week", new Date());
                  setHistoryFrom(toDateInputValue(start));
                  setHistoryTo(toDateInputValue(end));
                }}
              >
                Esta semana
              </button>
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => {
                  const { start, end } = periodBounds("month", new Date());
                  setHistoryFrom(toDateInputValue(start));
                  setHistoryTo(toDateInputValue(end));
                }}
              >
                Este mes
              </button>
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => {
                  setHistoryFrom("");
                  setHistoryTo("");
                }}
                disabled={!historyFrom && !historyTo}
              >
                Limpiar
              </button>
            </div>
          </div>
          {historyFilterActive ? (
            <p className="text-[11px] text-slate-600">
              Mostrando <strong className="tabular-nums">{historyFiltered.length}</strong> de{" "}
              <span className="tabular-nums">{historyTotal}</span> movimientos
              <span className="text-slate-500">{formatHistoryRangeLabel(historyFrom, historyTo)}</span>
            </p>
          ) : (
            <p className="text-[11px] text-slate-500">{historyTotal} movimiento{historyTotal !== 1 ? "s" : ""} en total</p>
          )}
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-2" role="tablist" aria-label="Vista del historial">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Vista</span>
          <button
            type="button"
            role="tab"
            aria-selected={historyLayout === "linea"}
            className={historyLayout === "linea" ? "btn-primary btn-sm" : "btn-secondary btn-sm"}
            onClick={() => setHistoryLayout("linea")}
          >
            Lista cronológica
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={historyLayout === "servicio"}
            className={historyLayout === "servicio" ? "btn-primary btn-sm" : "btn-secondary btn-sm"}
            onClick={() => setHistoryLayout("servicio")}
          >
            Por servicio (pedido)
          </button>
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Historial</span>
          <button type="button" className={historyTab === "all" ? "btn-primary btn-sm" : "btn-secondary btn-sm"} onClick={() => setHistoryTab("all")}>
            Todos
          </button>
          <button type="button" className={historyTab === "pendiente" ? "btn-primary btn-sm" : "btn-secondary btn-sm"} onClick={() => setHistoryTab("pendiente")}>
            Por validar
          </button>
          <button type="button" className={historyTab === "sin_cobrar" ? "btn-primary btn-sm" : "btn-secondary btn-sm"} onClick={() => setHistoryTab("sin_cobrar")}>
            Sin cobrar
          </button>
          <button type="button" className={historyTab === "rechazado" ? "btn-primary btn-sm" : "btn-secondary btn-sm"} onClick={() => setHistoryTab("rechazado")}>
            Rechazados
          </button>
        </div>
        {historyLayout === "servicio" ? (
          <div className="space-y-3">
            <p className="text-xs text-slate-600">
              Cada <strong>pedido / envío</strong> reúne los cobros (transferencias del portal, oficina o chofer) con
              <strong> quién lo cargó</strong> y si quedó <strong>aprobado</strong> o pendiente de validar.
            </p>
            {servicioGroups.map((g) => {
              const target = Number(g.shipment.totalAmount ?? g.shipment.amount ?? 0);
              const aprobado = g.payments
                .filter((p) => p.verificationStatus === "aprobado")
                .reduce((s, p) => s + Number(p.amount ?? 0), 0);
              const nPend = g.payments.filter((p) => p.verificationStatus === "pendiente").length;
              return (
                <div
                  key={g.shipment.id}
                  className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50/40"
                >
                  <div className="border-b border-slate-200 bg-white/90 px-3 py-2.5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900">
                          {shipmentCobroHeadline(g.shipment)}
                        </p>
                        <p className="text-xs text-slate-600">
                          Cliente: {g.shipment.customer?.name ?? "—"} · ID:{" "}
                          <span className="font-mono text-[11px] text-slate-500">{g.shipment.id.slice(0, 10)}…</span>
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                          g.shipment.paymentStatus === "pagado"
                            ? "bg-emerald-100 text-emerald-900"
                            : g.shipment.paymentStatus === "parcial"
                              ? "bg-amber-100 text-amber-900"
                              : "bg-slate-200 text-slate-800"
                        }`}
                      >
                        {paymentStatusLabelEs(g.shipment.paymentStatus)}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-slate-700">
                      {target > 0 ? (
                        <>
                          Total acordado {fmtCLP(g.shipment.totalAmount ?? g.shipment.amount)} · Suma aprobada{" "}
                          {fmtCLP(String(aprobado))}
                          {nPend > 0 ? (
                            <>
                              {" "}
                              ·{" "}
                              <strong className="text-amber-800">
                                {nPend} comprob. por validar
                              </strong>
                            </>
                          ) : null}
                        </>
                      ) : (
                        <>
                          Suma aprobada {fmtCLP(String(aprobado))}
                          {nPend > 0 ? (
                            <>
                              {" "}
                              · <strong className="text-amber-800">{nPend} por validar</strong>
                            </>
                          ) : null}
                          {target <= 0 ? (
                            <span className="text-slate-500"> · Monto de servicio no definido en el envío</span>
                          ) : null}
                        </>
                      )}
                    </p>
                  </div>
                  <div className="table-wrap p-0">
                    <table className="table-pro text-xs">
                      <thead>
                        <tr>
                          <th>Fecha</th>
                          <th>Importe</th>
                          <th>Origen</th>
                          <th>Validación</th>
                          <th>Acción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.payments.map((p) => (
                          <tr key={p.id}>
                            <td className="whitespace-nowrap">
                              {new Date(p.paidAt).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" })}
                            </td>
                            <td className="font-medium tabular-nums">{fmtCLP(p.amount)}</td>
                            <td>
                              <span className="font-medium text-slate-800">{pagoOrigenLabel(p.recordedBy)}</span>
                              <p className="text-[10px] text-slate-500">{p.recordedBy?.email ?? "—"}</p>
                            </td>
                            <td>
                              <span
                                className={`badge ${p.verificationStatus === "aprobado" ? "badge-ok" : p.verificationStatus === "rechazado" ? "badge-bad" : "badge-warn"}`}
                              >
                                {p.verificationStatus === "aprobado"
                                  ? "Aprobado"
                                  : p.verificationStatus === "rechazado"
                                    ? "Rechazado"
                                    : "Pendiente"}
                              </span>
                              {p.verifiedBy?.email ? (
                                <p className="mt-0.5 text-[10px] text-slate-500">Val.: {p.verifiedBy.email}</p>
                              ) : null}
                            </td>
                            <td>
                              {p.verificationStatus === "pendiente" ? (
                                <button
                                  type="button"
                                  className="text-xs font-semibold text-blue-700 underline"
                                  onClick={() => void openPendingDetail(p)}
                                >
                                  Validar
                                </button>
                              ) : p.mockProof?.hasInlineData ? (
                                <button
                                  type="button"
                                  className="text-xs text-slate-600 underline"
                                  onClick={() => void openPendingDetail(p)}
                                >
                                  Ver
                                </button>
                              ) : (
                                "—"
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}

            {facturaSoloRows.length > 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                <h3 className="text-sm font-semibold text-slate-800">Movimientos solo asociados a factura (sin fila de envío)</h3>
                <p className="mb-2 text-xs text-slate-600">Siguen con el listado o facturación, no agrupan un pedido en mapa.</p>
                <ul className="list-inside list-disc text-xs text-slate-800">
                  {facturaSoloRows.map((p) => (
                    <li key={p.id}>
                      {fmtCLP(p.amount)} · {p.invoice ? `Factura ${p.invoice.number}` : ""} · {pagoOrigenLabel(p.recordedBy)} ·
                      {p.verificationStatus}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {sinVincularRows.length > 0 ? (
              <p className="text-xs text-amber-900">
                Hay {sinVincularRows.length} movimiento(s) sin servicio ni factura vinculada en el rango. Revisá carga
                histórica.
              </p>
            ) : null}

            {historyFiltered.length === 0 && historyTotal > 0 ? (
              <p className="text-xs text-amber-800">Ningún movimiento en el rango elegido.</p>
            ) : null}
            {historyTotal === 0 ? <p className="text-xs text-slate-500">Aún no hay movimientos registrados.</p> : null}
          </div>
        ) : (
          <>
            <div className="table-wrap">
              <table className="table-pro">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Importe</th>
                    <th>Medio</th>
                    <th>Documento / servicio</th>
                    <th>Estado validación</th>
                  </tr>
                </thead>
                <tbody>
                  {historyFiltered.map((p) => (
                    <tr key={p.id}>
                      <td>{new Date(p.paidAt).toLocaleString("es-CL")}</td>
                      <td>{fmtCLP(p.amount)}</td>
                      <td>{p.method}</td>
                      <td>
                        {p.invoice ? `Factura ${p.invoice.number}` : ""}
                        {p.shipment ? (
                          <>
                            {p.invoice ? " · " : ""}Ped. {p.shipment.id.slice(-6).toUpperCase()}: {p.shipment.origin} → {p.shipment.destination}
                          </>
                        ) : (
                          ""
                        )}
                        {p.mockProof ? ` · adjunto: ${p.mockProof.fileName}` : ""}
                      </td>
                      <td>
                        <span
                          className={`badge ${p.verificationStatus === "aprobado" ? "badge-ok" : p.verificationStatus === "rechazado" ? "badge-bad" : "badge-warn"}`}
                        >
                          {p.verificationStatus === "aprobado" ? "Aprobado" : p.verificationStatus === "rechazado" ? "Rechazado" : "Pendiente"}
                        </span>
                        <p className="mt-1 text-[11px] text-slate-500">
                          {pagoOrigenLabel(p.recordedBy)} · {p.recordedBy?.email ?? "—"}
                          {p.verifiedBy?.email ? ` · Val.: ${p.verifiedBy.email}` : ""}
                        </p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {historyFiltered.length === 0 && historyTotal > 0 ? (
              <p className="mt-2 text-xs text-amber-800">Ningún movimiento en el rango elegido. Probá otras fechas o limpiá el filtro.</p>
            ) : null}
            {historyTotal === 0 ? <p className="mt-2 text-xs text-slate-500">Aún no hay movimientos registrados.</p> : null}
          </>
        )}
      </div>
      {floatingSection ? (
        <div className="fixed inset-0 z-[84] flex items-center justify-center bg-black/45 p-3" onClick={closeTopModal}>
          <section
            role="dialog"
            aria-modal="true"
            className="max-h-[92vh] w-full max-w-5xl overflow-auto rounded-t-2xl border border-slate-200 bg-white p-4 shadow-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-slate-900">
                {floatingSection === "comprobantes"
                  ? "Comprobantes por validar"
                  : floatingSection === "registro"
                    ? "Registrar cobro del servicio"
                    : historyTab === "sin_cobrar"
                      ? "Servicios con saldo pendiente"
                      : "Historial de movimientos"}
              </h3>
              <button type="button" className="btn-secondary btn-sm" onClick={closeTopModal}>
                {modalStack.length > 1 ? "Volver" : "Cerrar"}
              </button>
            </div>

            {floatingSection === "comprobantes" ? (
              pendingPayments.length === 0 ? (
                <p className="text-sm text-slate-500">No hay comprobantes pendientes por validar.</p>
              ) : (
                <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200">
                  {pendingPayments.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-base font-semibold tabular-nums text-slate-900">{fmtCLP(p.amount)}</p>
                        <p className="truncate text-sm text-slate-800">{paymentCustomer(p)}</p>
                      </div>
                      <div className="flex flex-row flex-wrap gap-1">
                        <button type="button" className="btn-secondary btn-sm" onClick={() => void openPendingDetail(p)}>
                          Revisar
                        </button>
                        <button type="button" className="btn-primary btn-sm" disabled={verify.isPending} onClick={() => verify.mutate({ id: p.id, status: "aprobado", note: verificationNotes[p.id]?.trim() || undefined })}>
                          Aprobar
                        </button>
                        <button type="button" className="btn-danger-outline btn-sm" disabled={verify.isPending} onClick={() => verify.mutate({ id: p.id, status: "rechazado", note: verificationNotes[p.id]?.trim() || undefined })}>
                          Rechazar
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )
            ) : null}

            {floatingSection === "registro" ? (
              <div className="space-y-2">
                <label>Envío (servicio)</label>
                <select value={shipmentId} onChange={(e) => setShipmentId(e.target.value)}>
                  <option value="">— Seleccionar servicio (envío) —</option>
                  {(shipmentsQ.data ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.origin} → {s.destination} ({s.customer.name})
                    </option>
                  ))}
                </select>
                <label>Importe del cobro</label>
                <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
                <label>Medio de pago</label>
                <select value={method} onChange={(e) => setMethod(e.target.value)}>
                  <option value="transferencia">Transferencia bancaria</option>
                  <option value="efectivo">Efectivo</option>
                  <option value="cheque">Cheque</option>
                  <option value="tarjeta">Tarjeta</option>
                </select>
                <label>Referencia</label>
                <input value={reference} onChange={(e) => setReference(e.target.value)} />
                <label>Factura (opcional)</label>
                <select value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)}>
                  <option value="">— Ninguna —</option>
                  {(invoicesQ.data ?? []).map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.number}
                    </option>
                  ))}
                </select>
                <button type="button" className="btn-primary mt-2" disabled={create.isPending} onClick={handleCreatePayment}>
                  Guardar registro
                </button>
              </div>
            ) : null}

            {floatingSection === "historial" ? (
              <div className="space-y-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Calendario de movimientos</p>
                  <p className="mt-1 text-[11px] text-slate-600">
                    Elegi rango en el calendario: primer click = desde, segundo click = hasta.
                  </p>
                  <div className="mt-2 flex flex-wrap items-end gap-2">
                    <label className="text-[11px] font-medium text-slate-600">
                      Desde
                      <input
                        type="date"
                        className="mt-1 block rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                        value={historyFrom}
                        onChange={(e) => {
                          setHistoryFrom(e.target.value);
                          setHistoryRangeAnchor(null);
                        }}
                      />
                    </label>
                    <label className="text-[11px] font-medium text-slate-600">
                      Hasta
                      <input
                        type="date"
                        className="mt-1 block rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                        value={historyTo}
                        onChange={(e) => {
                          setHistoryTo(e.target.value);
                          setHistoryRangeAnchor(null);
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      onClick={() => {
                        const t = toDateInputValue(new Date());
                        setHistoryFrom(t);
                        setHistoryTo(t);
                        setHistoryRangeAnchor(null);
                      }}
                    >
                      Hoy
                    </button>
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      onClick={() => {
                        const { start, end } = periodBounds("week", new Date());
                        setHistoryFrom(toDateInputValue(start));
                        setHistoryTo(toDateInputValue(end));
                        setHistoryRangeAnchor(null);
                      }}
                    >
                      Semana
                    </button>
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      onClick={() => {
                        const { start, end } = periodBounds("month", new Date());
                        setHistoryFrom(toDateInputValue(start));
                        setHistoryTo(toDateInputValue(end));
                        setHistoryRangeAnchor(null);
                      }}
                    >
                      Mes
                    </button>
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      disabled={!historyFrom && !historyTo}
                      onClick={() => {
                        setHistoryFrom("");
                        setHistoryTo("");
                        setHistoryRangeAnchor(null);
                      }}
                    >
                      Limpiar
                    </button>
                  </div>
                  <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2">
                    <button
                      type="button"
                      className="w-full rounded border border-slate-300 bg-slate-50 px-2 py-1.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-100"
                      onClick={() => setHistoryCalendarOpen((v) => !v)}
                    >
                      {historyCalendarOpen ? "Ocultar calendario" : "Mostrar calendario"}
                    </button>
                    {historyCalendarOpen ? (
                      <>
                        <div className="mb-2 mt-2 flex items-center justify-between">
                          <button
                            type="button"
                            className="rounded border border-slate-300 px-2 py-1 text-xs"
                            onClick={() =>
                              setHistoryCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
                            }
                          >
                            Mes anterior
                          </button>
                          <p className="text-xs font-semibold text-slate-700">
                            {historyCalendarMonth.toLocaleDateString("es-CL", { month: "long", year: "numeric" })}
                          </p>
                          <button
                            type="button"
                            className="rounded border border-slate-300 px-2 py-1 text-xs"
                            onClick={() =>
                              setHistoryCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
                            }
                          >
                            Mes siguiente
                          </button>
                        </div>
                        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase text-slate-500">
                          {["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"].map((d) => (
                            <span key={d}>{d}</span>
                          ))}
                        </div>
                        <div className="mt-1 grid grid-cols-7 gap-1">
                          {historyCalendarCells.map((cell) => {
                            const inRange = historyFrom && historyTo && cell.iso >= historyFrom && cell.iso <= historyTo;
                            const isFrom = historyFrom === cell.iso;
                            const isTo = historyTo === cell.iso;
                            return (
                              <button
                                key={cell.iso}
                                type="button"
                                className={`rounded px-1 py-1.5 text-[11px] transition ${
                                  isFrom || isTo
                                    ? "bg-blue-600 font-semibold text-white"
                                    : inRange
                                      ? "bg-blue-100 text-blue-900"
                                      : cell.inMonth
                                        ? "text-slate-700 hover:bg-slate-100"
                                        : "text-slate-400 hover:bg-slate-50"
                                }`}
                                onClick={() => selectHistoryCalendarDay(cell.iso)}
                              >
                                {cell.date.getDate()}
                              </button>
                            );
                          })}
                        </div>
                      </>
                    ) : null}
                  </div>
                </div>
              <div className="table-wrap">
                {historyTab === "sin_cobrar" ? (
                  <>
                    <p className="mb-2 text-xs text-slate-600">
                      Esta vista usa el mismo criterio de <strong>Por cobrar</strong>: saldo pendiente real por envío.
                    </p>
                    <table className="table-pro">
                      <thead>
                        <tr>
                          <th>Servicio</th>
                          <th>Cliente</th>
                          <th>Saldo pendiente</th>
                          <th>Cobro</th>
                          <th>Acción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {saldoPendienteRows.map((s) => (
                          <tr key={s.id}>
                            <td>{s.origin} → {s.destination}</td>
                            <td>{s.customer.name}</td>
                            <td>{fmtCLP(s.balanceAmount ?? 0)}</td>
                            <td>{paymentStatusLabelEs(s.paymentStatus)}</td>
                            <td>
                              <button
                                type="button"
                                className="text-xs font-semibold text-blue-700 underline"
                                onClick={() => {
                                  setShipmentId(s.id);
                                  setShowManualRegister(true);
                                  setFloatingSection("registro");
                                  pushModal("sec-registro");
                                }}
                              >
                                Registrar cobro
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {saldoPendienteRows.length === 0 ? (
                      <p className="mt-2 text-sm text-slate-500">No hay servicios con saldo pendiente.</p>
                    ) : null}
                  </>
                ) : (
                  <>
                    <table className="table-pro">
                      <thead>
                        <tr>
                          <th>Fecha</th>
                          <th>Concepto</th>
                          <th>Importe</th>
                          <th>Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historyFiltered.map((p) => (
                          <tr key={p.id}>
                            <td>{new Date(p.paidAt).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" })}</td>
                            <td>{conceptoLine(p)}</td>
                            <td>{fmtCLP(p.amount)}</td>
                            <td>{p.verificationStatus}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {historyFiltered.length === 0 ? <p className="mt-2 text-sm text-slate-500">Sin movimientos en el rango actual.</p> : null}
                  </>
                )}
              </div>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      {kpiListModal ? (
        <div
          className="fixed inset-0 z-[86] flex items-center justify-center bg-black/45 p-3"
          role="presentation"
          onClick={closeTopModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="kpi-pagos-titulo"
            className="flex max-h-[min(80vh,28rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-3 py-2">
              <h3 id="kpi-pagos-titulo" className="text-sm font-semibold text-slate-900">
                {kpiListModal === "pendientes"
                  ? "Pendientes de validar"
                  : kpiListModal === "monto"
                    ? "Monto pendiente"
                    : "Comprobantes rechazados"}
              </h3>
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={closeTopModal}
              >
                {modalStack.length > 1 ? "Volver" : "Cerrar"}
              </button>
            </div>
            {kpiListModal === "monto" ? (
              <p className="shrink-0 border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                Total acumulado en comprobantes pendientes:{" "}
                <strong className="tabular-nums text-slate-900">{fmtCLP(pendingAmount)}</strong> (
                <span className="tabular-nums">{pendingPayments.length}</span> pago{pendingPayments.length !== 1 ? "s" : ""}).
                Tocá una fila para abrir y validar.
              </p>
            ) : kpiListModal === "pendientes" ? (
              <p className="shrink-0 border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Tocá una fila para ver el comprobante y aprobar o rechazar.
              </p>
            ) : (
              <p className="shrink-0 border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Comprobante rechazado: el cliente puede reenviar con correcciones. Tocá una fila para el detalle.
              </p>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {kpiListModal === "rechazados" ? (
                rejectedPayments.length === 0 ? (
                  <p className="p-2 text-center text-xs text-slate-500">No hay pagos rechazados.</p>
                ) : (
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        <th className="px-1 py-1.5">Fecha</th>
                        <th className="px-1 py-1.5">Importe</th>
                        <th className="px-1 py-1.5">Cliente</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rejectedPayments.map((p) => (
                        <tr key={p.id}>
                          <td colSpan={3} className="p-0">
                            <button
                              type="button"
                              className="w-full border-b border-slate-100 px-1 py-2 text-left transition hover:bg-slate-50"
                              onClick={() => void openReadonlyPayment(p)}
                            >
                              <div className="grid grid-cols-[1fr_auto] gap-x-2 gap-y-0.5 sm:grid-cols-3">
                                <span className="whitespace-nowrap text-slate-600">
                                  {new Date(p.paidAt).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" })}
                                </span>
                                <span className="text-right font-semibold tabular-nums text-slate-900 sm:text-left">
                                  {fmtCLP(p.amount)}
                                </span>
                                <span className="col-span-2 truncate text-slate-800 sm:col-span-1 sm:min-w-0 sm:text-right">
                                  {paymentCustomer(p)}
                                </span>
                              </div>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              ) : pendingPayments.length === 0 ? (
                <p className="p-2 text-center text-xs text-slate-500">No hay comprobantes pendientes de validar.</p>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-1 py-1.5">Fecha</th>
                      <th className="px-1 py-1.5">Importe</th>
                      <th className="px-1 py-1.5">Cliente</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingPayments.map((p) => (
                      <tr key={p.id}>
                        <td colSpan={3} className="p-0">
                          <button
                            type="button"
                            className="w-full border-b border-slate-100 px-1 py-2 text-left transition hover:bg-slate-50"
                              onClick={() => void openPendingDetail(p)}
                          >
                            <div className="grid grid-cols-[1fr_auto] gap-x-2 gap-y-0.5 sm:grid-cols-3">
                              <span className="whitespace-nowrap text-slate-600">
                                {new Date(p.paidAt).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" })}
                              </span>
                              <span className="text-right font-semibold tabular-nums text-slate-900 sm:text-left">
                                {fmtCLP(p.amount)}
                              </span>
                              <span className="col-span-2 truncate text-slate-800 sm:col-span-1 sm:min-w-0 sm:text-right">
                                {paymentCustomer(p)}
                              </span>
                            </div>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      ) : null}
      {readonlyDetailLive ? (
        <div
          className="fixed inset-0 z-[88] flex items-center justify-center bg-black/50 p-3"
          role="presentation"
          onClick={closeTopModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pago-readonly-titulo"
            className="flex max-h-[min(88dvh,44rem)] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 border-b border-slate-200 px-3 py-2.5">
              <h3 id="pago-readonly-titulo" className="text-sm font-semibold text-slate-900">
                Detalle del pago
              </h3>
              <p className="mt-0.5 text-base font-bold tabular-nums text-slate-900">{fmtCLP(readonlyDetailLive.amount)}</p>
              <p className="text-sm text-slate-700">{paymentCustomer(readonlyDetailLive)}</p>
              <p className="mt-1">
                <span className="badge badge-bad">Rechazado</span>
                {readonlyDetailLive.verifiedBy?.email ? (
                  <span className="ml-1.5 text-[11px] text-slate-500">Validó: {readonlyDetailLive.verifiedBy.email}</span>
                ) : null}
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 text-sm text-slate-800">
              {readonlyDetailLive.verificationNote ? (
                <p className="mb-2 rounded border border-rose-100 bg-rose-50/80 px-2 py-1.5 text-xs text-rose-950">
                  <span className="font-semibold">Nota: </span>
                  {readonlyDetailLive.verificationNote}
                </p>
              ) : null}
              <div className="space-y-2 text-xs">
                <div className="flex justify-between gap-2 border-b border-slate-100 pb-2">
                  <span className="text-slate-500">Fecha</span>
                  <span className="text-right text-slate-800">
                    {new Date(readonlyDetailLive.paidAt).toLocaleString("es-CL")}
                  </span>
                </div>
                <div className="flex justify-between gap-2 border-b border-slate-100 pb-2">
                  <span className="text-slate-500">Medio</span>
                  <span className="text-right">{readonlyDetailLive.method}</span>
                </div>
                {readonlyDetailLive.shipment ? (
                  <div className="border-b border-slate-100 pb-2">
                    <p className="text-slate-500">Servicio</p>
                    <p className="mt-0.5 text-slate-800">
                      {readonlyDetailLive.shipment.origin} → {readonlyDetailLive.shipment.destination}
                    </p>
                  </div>
                ) : null}
                {readonlyDetailLive.invoice ? (
                  <div className="border-b border-slate-100 pb-2">
                    <p className="text-slate-500">Factura</p>
                    <p className="mt-0.5 font-medium text-slate-800">{readonlyDetailLive.invoice.number}</p>
                  </div>
                ) : null}
                <div className="border-b border-slate-100 pb-2">
                  <p className="text-slate-500">Referencia / archivo</p>
                  <p className="mt-0.5 break-words text-slate-800">
                    {readonlyDetailLive.mockProof
                      ? `${readonlyDetailLive.mockProof.fileName} · ${Math.max(1, Math.round(readonlyDetailLive.mockProof.sizeBytes / 1024))} KB`
                      : readonlyDetailLive.reference ?? "—"}
                  </p>
                </div>
              </div>
              <div className="mt-2">
                {readonlyProofLoading ? (
                  <p className="text-xs text-slate-500">Cargando comprobante…</p>
                ) : readonlyProof ? (
                  <div className="max-h-48 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 sm:max-h-64">
                    {readonlyProof.mimeType.startsWith("image/") ? (
                      <img
                        src={readonlyProof.url}
                        alt="Comprobante"
                        className="max-h-48 w-full object-contain object-top sm:max-h-64"
                      />
                    ) : (
                      <iframe
                        title="Vista del comprobante"
                        src={readonlyProof.url}
                        className="h-48 w-full sm:h-64"
                      />
                    )}
                  </div>
                ) : readonlyDetailLive.mockProof && !readonlyDetailLive.mockProof.hasInlineData ? (
                  <p className="text-xs text-amber-800">Sin vista previa del archivo.</p>
                ) : !readonlyDetailLive.mockProof ? (
                  <p className="text-xs text-slate-500">Sin adjunto en el registro.</p>
                ) : null}
              </div>
            </div>
            <div className="shrink-0 border-t border-slate-200 bg-slate-50 px-3 py-2">
              <button type="button" className="btn-primary w-full" onClick={closeTopModal}>
                {modalStack.length > 1 ? "Volver" : "Cerrar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {pendingDetailLive ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4"
          role="presentation"
          onClick={closeTopModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pago-pendiente-titulo"
            className="flex max-h-[min(92dvh,48rem)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 border-b border-slate-200 px-4 py-3">
              <h3 id="pago-pendiente-titulo" className="text-base font-semibold text-slate-900">
                Validar comprobante
              </h3>
              <p className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">{fmtCLP(pendingDetailLive.amount)}</p>
              <p className="text-sm text-slate-700">{paymentCustomer(pendingDetailLive)}</p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 text-sm text-slate-800">
              <div className="space-y-2 text-xs">
                <div className="flex justify-between gap-2 border-b border-slate-100 pb-2">
                  <span className="text-slate-500">Fecha</span>
                  <span className="text-right text-slate-800">
                    {new Date(pendingDetailLive.paidAt).toLocaleString("es-CL")}
                  </span>
                </div>
                <div className="flex justify-between gap-2 border-b border-slate-100 pb-2">
                  <span className="text-slate-500">Medio</span>
                  <span className="text-right">
                    {pendingDetailLive.method === "efectivo" ? (
                      <span className="badge badge-warn">Efectivo (chofer / caja)</span>
                    ) : (
                      <span className="badge">Transferencia</span>
                    )}
                  </span>
                </div>
                {pendingDetailLive.shipment ? (
                  <div className="border-b border-slate-100 pb-2">
                    <p className="text-slate-500">Servicio</p>
                    <p className="mt-0.5 text-slate-800">
                      {pendingDetailLive.shipment.origin} → {pendingDetailLive.shipment.destination}
                    </p>
                  </div>
                ) : null}
                {pendingDetailLive.invoice ? (
                  <div className="border-b border-slate-100 pb-2">
                    <p className="text-slate-500">Factura</p>
                    <p className="mt-0.5 font-medium text-slate-800">{pendingDetailLive.invoice.number}</p>
                  </div>
                ) : null}
                <div className="border-b border-slate-100 pb-2">
                  <p className="text-slate-500">Referencia / archivo</p>
                  <p className="mt-0.5 break-words text-slate-800">
                    {pendingDetailLive.mockProof
                      ? `${pendingDetailLive.mockProof.fileName} · ${Math.max(1, Math.round(pendingDetailLive.mockProof.sizeBytes / 1024))} KB`
                      : pendingDetailLive.reference ?? "—"}
                  </p>
                </div>
              </div>
              <div className="mt-3">
                {pendingDetailProofLoading ? (
                  <p className="text-xs text-slate-500">Cargando comprobante…</p>
                ) : pendingDetailProof ? (
                  <div className="max-h-56 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 sm:max-h-72">
                    {pendingDetailProof.mimeType.startsWith("image/") ? (
                      <img
                        src={pendingDetailProof.url}
                        alt="Comprobante"
                        className="max-h-56 w-full object-contain object-top sm:max-h-72"
                      />
                    ) : (
                      <iframe
                        title="Vista del comprobante"
                        src={pendingDetailProof.url}
                        className="h-56 w-full sm:h-72"
                      />
                    )}
                  </div>
                ) : pendingDetailLive.mockProof && !pendingDetailLive.mockProof.hasInlineData ? (
                  <p className="text-xs text-amber-800">Sin archivo visual adjunto. Validá con referencia o datos del listado.</p>
                ) : !pendingDetailLive.mockProof ? (
                  <p className="text-xs text-slate-500">No hay archivo; validá con referencia o monto acordado.</p>
                ) : null}
              </div>
              <label className="mt-3 block text-xs font-medium text-slate-700" htmlFor="nota-validacion-pago">
                Nota al aprobar o rechazar (opcional)
              </label>
              <input
                id="nota-validacion-pago"
                className="input-inline mt-1 w-full max-w-md"
                placeholder="Ej. coincide con banco, falta códigos, etc."
                value={verificationNotes[pendingDetailLive.id] ?? ""}
                onChange={(e) =>
                  setVerificationNotes((prev) => ({ ...prev, [pendingDetailLive.id]: e.target.value }))
                }
              />
            </div>
            <div className="shrink-0 border-t border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                <button
                  type="button"
                  className="btn-secondary order-3 w-full sm:order-1 sm:w-auto"
                  onClick={closeTopModal}
                >
                  {modalStack.length > 1 ? "Volver" : "Cerrar"}
                </button>
                <button
                  type="button"
                  className="btn-danger-outline order-2 w-full sm:order-2 sm:w-auto"
                  disabled={verify.isPending}
                  onClick={() =>
                    verify.mutate({
                      id: pendingDetailLive.id,
                      status: "rechazado",
                      note: verificationNotes[pendingDetailLive.id],
                    })
                  }
                >
                  Rechazar
                </button>
                <button
                  type="button"
                  className="btn-primary order-1 w-full sm:order-3 sm:w-auto"
                  disabled={verify.isPending}
                  onClick={() =>
                    verify.mutate({
                      id: pendingDetailLive.id,
                      status: "aprobado",
                      note: verificationNotes[pendingDetailLive.id],
                    })
                  }
                >
                  {verify.isPending ? "Guardando…" : "Aprobar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <FloatingAlertModal
        open={guardAlert !== null}
        title="Faltan datos para registrar"
        message={guardAlert ?? ""}
        onClose={() => setGuardAlert(null)}
      />
    </div>
  );
}
