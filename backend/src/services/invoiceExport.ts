import type { Response } from "express";
import PDFDocument from "pdfkit";
import type { Prisma } from "@prisma/client";

type ExportLine = {
  description: string;
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
};

export type InvoiceExportRow = {
  number: string;
  issueDate: Date;
  dueDate: Date | null;
  status: string;
  subtotal: Prisma.Decimal;
  taxRate: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  total: Prisma.Decimal;
  notes: string | null;
  customer: { name: string; email: string | null };
  lines: ExportLine[];
};

function escXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function invoiceToXml(inv: InvoiceExportRow): string {
  const lines = inv.lines
    .map(
      (l) =>
        `    <linea><descripcion>${escXml(l.description)}</descripcion><cantidad>${l.quantity}</cantidad><pUnit>${l.unitPrice}</pUnit><total>${l.lineTotal}</total></linea>`
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<factura>
  <numero>${escXml(inv.number)}</numero>
  <fechaEmision>${inv.issueDate.toISOString()}</fechaEmision>
  <vencimiento>${inv.dueDate?.toISOString() ?? ""}</vencimiento>
  <estado>${escXml(inv.status)}</estado>
  <cliente nombre="${escXml(inv.customer.name)}" email="${escXml(inv.customer.email ?? "")}"/>
  <totales subtotal="${inv.subtotal}" ivaPct="${inv.taxRate}" iva="${inv.taxAmount}" total="${inv.total}"/>
  <lineas>
${lines}
  </lineas>
  ${inv.notes ? `<notas>${escXml(inv.notes)}</notas>` : ""}
</factura>`;
}

export function streamInvoicePdf(inv: InvoiceExportRow, res: Response): void {
  const safeName = inv.number.replace(/[^\w.-]+/g, "_");
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="factura-${safeName}.pdf"`);

  const doc = new PDFDocument({ size: "A4", margin: 50 });
  doc.pipe(res);

  doc.fontSize(18).text(`Factura ${inv.number}`, { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(10).fillColor("#333333");
  doc.text(`Cliente: ${inv.customer.name}`);
  if (inv.customer.email) doc.text(`Email: ${inv.customer.email}`);
  doc.text(`Emisión: ${inv.issueDate.toLocaleDateString()}`);
  if (inv.dueDate) doc.text(`Vencimiento: ${inv.dueDate.toLocaleDateString()}`);
  doc.text(`Estado: ${inv.status}`);
  doc.moveDown();

  doc.fillColor("#000000").fontSize(11).text("Líneas", { underline: true });
  inv.lines.forEach((l, i) => {
    doc.fontSize(10).text(`${i + 1}. ${l.description}`);
    doc.text(`   Cant. ${l.quantity} × ${l.unitPrice} = ${l.lineTotal}`);
  });
  doc.moveDown();
  doc.fontSize(10).text(`Subtotal: ${inv.subtotal}`);
  doc.text(`IVA (${inv.taxRate}%): ${inv.taxAmount}`);
  doc.fontSize(12).text(`Total: ${inv.total}`);
  if (inv.notes) {
    doc.moveDown();
    doc.fontSize(9).fillColor("#666666").text(`Notas: ${inv.notes}`);
  }
  doc.end();
}
