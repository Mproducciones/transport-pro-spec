import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

export async function nextInvoiceNumber(tenantId: string): Promise<string> {
  const start = new Date(new Date().getFullYear(), 0, 1);
  const end = new Date(new Date().getFullYear() + 1, 0, 1);
  const count = await prisma.invoice.count({
    where: { tenantId, issueDate: { gte: start, lt: end } },
  });
  return `F-${start.getFullYear()}-${String(count + 1).padStart(5, "0")}`;
}

export function computeTotals(
  lines: { quantity: number; unitPrice: number }[],
  taxRatePercent: number
): { subtotal: Prisma.Decimal; taxAmount: Prisma.Decimal; total: Prisma.Decimal } {
  let sub = 0;
  for (const l of lines) {
    sub += l.quantity * l.unitPrice;
  }
  const subtotal = new Prisma.Decimal(sub);
  const taxAmount = subtotal.mul(new Prisma.Decimal(taxRatePercent)).div(new Prisma.Decimal(100));
  const total = subtotal.add(taxAmount);
  return { subtotal, taxAmount, total };
}
