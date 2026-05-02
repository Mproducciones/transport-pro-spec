/** Valores que envía/recibe la API (enum Prisma). */
export type PaymentTermCode = "upfront_full" | "upfront_partial" | "delivery";

export const PAYMENT_TERM_OPTIONS: ReadonlyArray<{
  value: PaymentTermCode;
  label: string;
  shortHint: string;
}> = [
  {
    value: "delivery",
    label: "Pago contra entrega",
    shortHint: "Sin anticipo obligatorio; cobro al entregar",
  },
  {
    value: "upfront_full",
    label: "Pago total anticipado",
    shortHint: "100% antes del servicio + comprobante",
  },
  {
    value: "upfront_partial",
    label: "Anticipo + saldo al entregar",
    shortHint: "Ej. 50% ahora, resto contra entrega",
  },
];

export function paymentTermLabel(term: string | undefined | null): string {
  const row = PAYMENT_TERM_OPTIONS.find((o) => o.value === term);
  return row?.label ?? "Pago contra entrega";
}

/** Sufijo corto para listas (ej. select de envíos en Pagos). */
export function paymentTermListSuffix(
  term: string | undefined | null,
  upfrontPercent?: string | null,
): string {
  const t = (term ?? "delivery") as PaymentTermCode;
  if (t === "delivery") return "C. entrega";
  if (t === "upfront_full") return "100% ant.";
  if (t === "upfront_partial") {
    const p = upfrontPercent != null && upfrontPercent !== "" ? Math.round(Number(upfrontPercent)) : null;
    if (p && p > 0 && p < 100) return `${p}% + saldo`;
    return "Antic. + saldo";
  }
  return "";
}

/** Datos de envío para explicar la modalidad en oficina (Pagos). */
export type ShipmentModalityInput = {
  paymentTerm?: string | null;
  upfrontPercent?: string | null;
  upfrontAmount?: string | null;
  totalAmount?: string | null;
  amount?: string | null;
  paidAmount?: string | null;
  balanceAmount?: string | null;
};

function moneyEsCl(value: string | null | undefined): string {
  const n = value != null && value !== "" ? Number(value) : NaN;
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
}

/**
 * Texto fijo al registrar cobro: conecta la modalidad acordada (anticipo, %, contra entrega) con totales y saldo.
 */
export function describeEnvioModalityInPagos(s: ShipmentModalityInput): { title: string; lines: string[] } {
  const term = (s.paymentTerm ?? "delivery") as PaymentTermCode;
  const totalRaw = s.totalAmount ?? s.amount;
  const totalN = totalRaw != null && totalRaw !== "" ? Number(totalRaw) : 0;
  const pct = s.upfrontPercent != null && s.upfrontPercent !== "" ? Math.round(Number(s.upfrontPercent)) : null;
  const upfrontSetN =
    s.upfrontAmount != null && s.upfrontAmount !== "" ? Number(s.upfrontAmount) : null;
  const upfrontFromPct =
    !(upfrontSetN && upfrontSetN > 0) && pct && totalN > 0 ? Math.round((totalN * pct) / 100) : null;
  const minUpfront = upfrontSetN && upfrontSetN > 0 ? upfrontSetN : upfrontFromPct;

  const moneyLine =
    totalN > 0
      ? `Total del servicio ${moneyEsCl(s.totalAmount ?? s.amount)} · Cobrado aprobado a la fecha ${moneyEsCl(
          s.paidAmount ?? "0",
        )} · Saldo pendiente ${moneyEsCl(s.balanceAmount)}.`
      : "Aún no figura monto total en el envío: completalo al aprobar o cotizar para alinear totales y anticipo.";

  if (term === "delivery") {
    return {
      title: "Modalidad pactada: pago contra entrega",
      lines: [
        "Acordaste cobro al recibir/entregar: no exige transferencia de anticipo por el flujo de cliente, pero el cliente (u otra empresa) puede adelantar parte igual — registrá acá lo que haya ingresado.",
        moneyLine,
      ],
    };
  }
  if (term === "upfront_full") {
    return {
      title: "Modalidad pactada: 100% antes del servicio",
      lines: [
        "El monto acordado va íntegro antes de concretar o iniciar. Cada pago aprobado reduce el saldo hasta cubrir el total.",
        moneyLine,
      ],
    };
  }
  const upBlock =
    minUpfront != null && minUpfront > 0
      ? pct
        ? `Anticipo mínimo: ~${moneyEsCl(String(minUpfront))} (${pct}% del total). El resto al finalizar/entregar según acuerdo.`
        : `Anticipo mínimo: ~${moneyEsCl(String(minUpfront))}. El resto al finalizar/entregar.`
      : "Anticipo parcial: definí/confirmá el mínimo antes de inicio (por % o monto) y el saldo al cierre en la ficha del envío; los cobros que registres bajan el saldo pendiente.";
  return {
    title: "Modalidad pactada: anticipo + saldo al entregar",
    lines: [upBlock, moneyLine],
  };
}
