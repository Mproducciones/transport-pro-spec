import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { apiGet, apiSend } from "../api/client.js";
import { notify } from "../lib/notify.js";
import { describeEnvioModalityInPagos } from "../lib/paymentTerms.js";
import { buildServicePaymentReference } from "../lib/servicePaymentReference.js";

type InvoiceMini = { id: string; number: string; total: unknown };

type ShipmentMini = {
  id: string;
  origin: string;
  destination: string;
  customer: { name: string };
  balanceAmount?: string;
  paidAmount?: string;
  paymentTerm?: "upfront_full" | "upfront_partial" | "delivery";
  upfrontPercent?: string | null;
  upfrontAmount?: string | null;
  totalAmount?: string | null;
  amount?: string | null;
};

type SettingsPayload = {
  company: { legalName: string; taxId: string | null; address: string | null; phone: string | null } | null;
};

export type RegistrarCobroServiceTarget = {
  shipmentId: string;
  /** Saldo desde cartera (respaldo si /shipments aún no trae balance). */
  balanceHint: string;
};

type Props = {
  open: boolean;
  target: RegistrarCobroServiceTarget | null;
  onClose: () => void;
};

function fmtCLP(value: unknown): string {
  return Number(value).toLocaleString("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  });
}

export function RegistrarCobroServiceModal({ open, target, onClose }: Props) {
  const qc = useQueryClient();
  const shipmentsQ = useQuery({
    queryKey: ["shipments"],
    queryFn: () => apiGet<ShipmentMini[]>("/shipments"),
    enabled: open && !!target,
  });
  const settingsQ = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiGet<SettingsPayload>("/settings"),
    enabled: open,
  });
  const invoicesQ = useQuery({
    queryKey: ["invoices"],
    queryFn: () => apiGet<InvoiceMini[]>("/invoices"),
    enabled: open,
  });

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("transferencia");
  const [reference, setReference] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const seededForId = useRef<string | null>(null);

  const shipment = target ? (shipmentsQ.data?.find((s) => s.id === target.shipmentId) ?? null) : null;
  const modality = shipment ? describeEnvioModalityInPagos(shipment) : null;

  const close = useCallback(() => {
    setError(null);
    setAmount("");
    setReference("");
    setInvoiceId("");
    setMethod("transferencia");
    seededForId.current = null;
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) {
      seededForId.current = null;
      return;
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  useEffect(() => {
    if (!open || !target) return;
    if (!shipment) return;
    const c = settingsQ.data?.company;

    if (seededForId.current !== shipment.id) {
      seededForId.current = shipment.id;
      setInvoiceId("");
      const bal = Number(shipment.balanceAmount ?? 0);
      if (Number.isFinite(bal) && bal > 0) setAmount(String(Math.round(bal)));
      else {
        const digits = String(target.balanceHint).replace(/\D/g, "");
        const n = digits ? Number(digits) : NaN;
        if (Number.isFinite(n) && n > 0) setAmount(String(Math.round(n)));
      }
      if (c) setReference(buildServicePaymentReference(c, shipment));
    } else if (c) {
      setReference((prev) => (prev.trim() ? prev : buildServicePaymentReference(c, shipment)));
    }
  }, [open, target, shipment, settingsQ.data]);

  const create = useMutation({
    mutationFn: () => {
      if (!target) throw new Error("Sin envío");
      return apiSend("/payments", "POST", {
        invoiceId: invoiceId || undefined,
        shipmentId: target.shipmentId,
        amount: Number(amount),
        method,
        reference: reference || undefined,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["payments"] });
      void qc.invalidateQueries({ queryKey: ["shipments"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: ["shipments", "admin-dashboard"] });
      notify("success", "Cobro del servicio registrado: el saldo del envío se actualiza en la lista.");
      close();
    },
    onError: (e: Error) => setError(e.message),
  });

  if (!open || !target) return null;

  const loading = shipmentsQ.isLoading;
  const missing = !loading && !shipment;

  return (
    <div
      className="fixed inset-0 z-[115] flex items-end justify-center bg-black/55 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="registrar-cobro-modal-title"
      onClick={close}
    >
      <div
        className="flex max-h-[min(92vh,560px)] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <div>
            <h2 id="registrar-cobro-modal-title" className="text-base font-semibold text-slate-800">
              Registrar cobro del servicio
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-500">Solo este envío. No salís del tablero.</p>
          </div>
          <button
            type="button"
            className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            onClick={close}
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {error ? <p className="error mb-2">{error}</p> : null}

          {settingsQ.data?.company ? (
            <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50/95 px-3 py-2.5 text-xs text-slate-800">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">A favor de</p>
              <p className="mt-1 font-semibold text-slate-900">{settingsQ.data.company.legalName}</p>
            </div>
          ) : null}

          {loading ? (
            <p className="text-sm text-slate-600">Cargando envío…</p>
          ) : missing ? (
            <p className="text-sm text-rose-800" role="alert">
              No encontramos ese envío. Probá de nuevo o registrá el cobro desde Pagos.
            </p>
          ) : shipment ? (
            <>
              <p className="text-xs text-slate-800">
                <span className="font-semibold">{shipment.origin}</span> →{" "}
                <span className="font-semibold">{shipment.destination}</span>
                <br />
                <span className="text-slate-600">Cliente: {shipment.customer.name}</span>
              </p>
              {modality ? (
                <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50/90 px-3 py-2 text-xs text-slate-800">
                  <p className="text-[10px] font-bold uppercase text-emerald-800">{modality.title}</p>
                  {modality.lines.map((line, i) => (
                    <p key={i} className="mt-1.5 leading-snug">
                      {line}
                    </p>
                  ))}
                </div>
              ) : null}
              <p className="mt-1 text-[11px] text-slate-500">Envío: {shipment.id.slice(0, 8)}…</p>
            </>
          ) : null}

          {!loading && !missing && shipment ? (
            <>
              <label className="mt-3 block">Importe del cobro</label>
              <input
                className="w-full"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
              />
              <label>Medio de pago</label>
              <select className="w-full" value={method} onChange={(e) => setMethod(e.target.value)}>
                <option value="transferencia">Transferencia bancaria</option>
                <option value="efectivo">Efectivo</option>
                <option value="cheque">Cheque</option>
                <option value="tarjeta">Tarjeta</option>
              </select>
              <label>Referencia</label>
              <input
                className="w-full"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Completado con el servicio y la empresa"
              />
              <label>Factura (opcional)</label>
              <select className="w-full" value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)}>
                <option value="">— Ninguna —</option>
                {(invoicesQ.data ?? []).map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.number} — {fmtCLP(i.total)}
                  </option>
                ))}
              </select>
              <p className="hint mt-1">Se registra en este envío; si elegís factura, queda vinculado el mismo movimiento.</p>
              <div className="form-actions mt-3">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={close}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={!amount || create.isPending}
                  onClick={() => {
                    setError(null);
                    create.mutate();
                  }}
                >
                  {create.isPending ? "Guardando…" : "Guardar cobro"}
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
