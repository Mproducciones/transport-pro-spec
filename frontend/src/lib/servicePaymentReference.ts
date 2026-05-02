export type ServicePaymentCompany = {
  legalName: string;
  taxId: string | null;
  address: string | null;
  phone: string | null;
};

export function buildDefaultPaymentReference(company: ServicePaymentCompany): string {
  return `Pago a ${company.legalName.trim()}${company.taxId ? ` · RUT ${company.taxId}` : ""}`.trim();
}

export function buildServicePaymentReference(
  company: ServicePaymentCompany,
  s: { id: string; origin: string; destination: string; customer: { name: string } },
): string {
  const short = s.id.slice(-6).toUpperCase();
  return `Cobro servicio: ${s.origin} → ${s.destination} · ${s.customer.name} · Ped. ${short} · A favor: ${company.legalName.trim()}${company.taxId ? ` · RUT ${company.taxId}` : ""}`.trim();
}
