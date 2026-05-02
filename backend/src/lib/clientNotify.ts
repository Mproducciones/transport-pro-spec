/**
 * Avisos al cliente por correo (validación de pagos).
 * Configuración opcional: RESEND_API_KEY + RESEND_FROM (ej. "Transport Pro <mail@tudominio.com>").
 */
export async function notifyPaymentVerificationEmail(opts: {
  to: string;
  status: "aprobado" | "rechazado";
  amount: string;
  invoiceNumber?: string | null;
  shipmentRef?: string | null;
  note?: string | null;
  portalUrl: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.info("[clientNotify] RESEND_API_KEY no configurada; no se envía email.", opts.to, opts.status);
    return;
  }

  const from = process.env.RESEND_FROM?.trim() || "Transport Pro <onboarding@resend.dev>";
  const subject =
    opts.status === "aprobado"
      ? "Tu pago fue aprobado"
      : "Tu pago necesita atención (rechazado o revisión)";

  const lines = [
    opts.status === "aprobado"
      ? "La empresa aprobó tu comprobante de pago."
      : "Tu pago fue marcado como rechazado. Podés subir un nuevo comprobante desde el portal de cliente.",
    "",
    `Monto: ${opts.amount}`,
    opts.invoiceNumber ? `Factura: ${opts.invoiceNumber}` : "",
    opts.shipmentRef ? `Envío: ${opts.shipmentRef}` : "",
    opts.note ? `\nMensaje de la empresa:\n${opts.note}` : "",
    "",
    `Pagos: ${opts.portalUrl}/cliente/pagos`,
  ].filter((l) => l !== "");

  const text = lines.join("\n");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: opts.to,
      subject,
      text,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.warn("[clientNotify] Resend respondió error", res.status, body);
  }
}

/**
 * Aviso al cliente cuando cambia el estado de la factura (emitida / anulada / borrador).
 */
export async function notifyInvoiceStatusEmail(opts: {
  to: string;
  invoiceNumber: string;
  previousStatus: string;
  newStatus: string;
  portalUrl: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.info("[clientNotify] RESEND_API_KEY no configurada; no se envía email factura.", opts.invoiceNumber);
    return;
  }

  const from = process.env.RESEND_FROM?.trim() || "Transport Pro <onboarding@resend.dev>";
  const subject = `Actualización factura ${opts.invoiceNumber}`;
  const text = [
    `El estado de tu factura ${opts.invoiceNumber} cambió.`,
    ``,
    `Estado anterior: ${opts.previousStatus}`,
    `Estado actual: ${opts.newStatus}`,
    ``,
    `Facturación: ${opts.portalUrl}/cliente/facturas`,
  ].join("\n");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: opts.to,
      subject,
      text,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.warn("[clientNotify] Resend (factura) error", res.status, body);
  }
}
