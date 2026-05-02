import type { Response } from "express";
import PDFDocument from "pdfkit";
import { parseMockProofReference } from "../lib/mockProof.js";

export function streamPaymentProofPdf(opts: {
  reference: string | null;
  res: Response;
  paymentId: string;
}): void {
  const safeName = `comprobante-pago-${opts.paymentId.slice(-8)}.pdf`;
  opts.res.setHeader("Content-Type", "application/pdf");
  opts.res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);

  const doc = new PDFDocument({ margin: 50 });
  doc.pipe(opts.res);

  const meta = parseMockProofReference(opts.reference);
  if (meta) {
    doc.fontSize(14).text("Comprobante de pago (referencia simulada)", { underline: true });
    doc.moveDown();
    doc
      .fontSize(10)
      .fillColor("#333333")
      .text(
        "En demostración el archivo no se guarda completo en el servidor; solo metadatos. En producción aquí descargarías el PDF o imagen original."
      );
    doc.moveDown();
    doc.text(`Archivo indicado: ${meta.fileName}`);
    doc.text(`Tipo: ${meta.mimeType}`);
    doc.text(`Tamaño aproximado: ${meta.sizeBytes} bytes`);
  } else if (opts.reference?.trim()) {
    doc.fontSize(14).text("Referencia / comprobante", { underline: true });
    doc.moveDown();
    doc.fontSize(10).fillColor("#333333").text(opts.reference.trim(), { width: 500 });
  } else {
    doc.fontSize(11).text("No hay comprobante ni referencia registrada para este pago.");
  }
  doc.end();
}
