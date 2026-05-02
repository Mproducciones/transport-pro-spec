type ApiOk<T> = { success: true; data: T };
type ApiErr = { success: false; message: string; code?: string };
type LoginData = { token: string; user: { role: string; tenantId: string } };
type MeData = { id: string; customerId?: string | null };
type Invoice = {
  id: string;
  number: string;
  subtotal: string;
  taxAmount: string;
  total: string;
  status: string;
  payments?: Array<{ id: string; amount: string; verificationStatus: string }>;
};
type Payment = { id: string; amount: string; verificationStatus: string };

const API_BASE = process.env.BILLING_API_BASE ?? process.env.SMOKE_API_BASE ?? "http://localhost:4000/api/v1";
const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL ?? "admin@demo.com";
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD ?? "Admin123!";
const CLIENT_EMAIL = process.env.SMOKE_CLIENT_EMAIL ?? "cliente@demo.com";
const CLIENT_PASSWORD = process.env.SMOKE_CLIENT_PASSWORD ?? "Cliente123!";

function headers(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

function jsonHeaders(token: string): Record<string, string> {
  return { ...headers(token), "Content-Type": "application/json" };
}

async function req<T>(path: string, init?: RequestInit): Promise<{ status: number; body: ApiOk<T> | ApiErr }> {
  const res = await fetch(`${API_BASE}${path}`, init);
  const body = (await res.json()) as ApiOk<T> | ApiErr;
  return { status: res.status, body };
}

async function ok<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await req<T>(path, init);
  if (res.status >= 400 || !res.body.success) {
    const err = res.body as ApiErr;
    throw new Error(`${path} failed: ${res.status} ${err.code ?? "ERROR"} ${err.message}`);
  }
  return res.body.data;
}

async function expectCode(path: string, expectedCode: string, init?: RequestInit) {
  const res = await req<unknown>(path, init);
  if (res.status < 400 || res.body.success) {
    throw new Error(`${path} expected ${expectedCode}, got success`);
  }
  const err = res.body as ApiErr;
  if (err.code !== expectedCode) {
    throw new Error(`${path} expected ${expectedCode}, got ${res.status} ${err.code ?? "NO_CODE"} ${err.message}`);
  }
}

async function login(email: string, password: string): Promise<LoginData> {
  return ok<LoginData>("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

function assertMoney(label: string, actual: string | number, expected: number) {
  const value = Number(actual);
  if (!Number.isFinite(value) || Math.abs(value - expected) > 0.0001) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function approvedTotal(invoice: Invoice): number {
  return (invoice.payments ?? [])
    .filter((p) => p.verificationStatus === "aprobado")
    .reduce((sum, p) => sum + Number(p.amount), 0);
}

async function createInvoice(adminToken: string, customerId: string, status: "emitida" | "borrador" | "anulada" = "emitida") {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  return ok<Invoice>("/invoices", {
    method: "POST",
    headers: jsonHeaders(adminToken),
    body: JSON.stringify({
      customerId,
      number: `BILL-${status.toUpperCase()}-${stamp}`,
      taxRate: 12,
      status,
      lines: [
        { description: "Transporte carga general", quantity: 2, unitPrice: 10000 },
        { description: "Servicio adicional de ruta", quantity: 1.5, unitPrice: 20000 },
      ],
    }),
  });
}

async function clientPayment(clientToken: string, invoiceId: string, amount: number, fileName: string) {
  return ok<Payment>("/payments", {
    method: "POST",
    headers: jsonHeaders(clientToken),
    body: JSON.stringify({
      invoiceId,
      amount,
      method: "transferencia",
      proofFileName: fileName,
      proofMimeType: "application/pdf",
      proofBase64: "JVBERi0xLjQKJcTl8uXrp/Og0MTGCg==",
    }),
  });
}

async function verifyPayment(adminToken: string, paymentId: string, status: "aprobado" | "rechazado") {
  return ok<Payment>(`/payments/${paymentId}/verification`, {
    method: "PATCH",
    headers: jsonHeaders(adminToken),
    body: JSON.stringify({ status, note: `Smoke billing ${status}` }),
  });
}

async function assertProofFile(token: string, paymentId: string, expectedMime: string) {
  const res = await fetch(`${API_BASE}/payments/${paymentId}/proof-file`, {
    headers: headers(token),
  });
  if (!res.ok) {
    throw new Error(`proof-file failed: ${res.status} ${await res.text()}`);
  }
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes(expectedMime)) {
    throw new Error(`proof-file content-type expected ${expectedMime}, got ${contentType}`);
  }
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength < 8) {
    throw new Error(`proof-file too small: ${bytes.byteLength} bytes`);
  }
}

async function main() {
  const [admin, cliente] = await Promise.all([
    login(ADMIN_EMAIL, ADMIN_PASSWORD),
    login(CLIENT_EMAIL, CLIENT_PASSWORD),
  ]);
  const me = await ok<MeData>("/me", { headers: headers(cliente.token) });
  if (!me.customerId) throw new Error("Cliente smoke sin customerId");

  const invoice = await createInvoice(admin.token, me.customerId);
  assertMoney("subtotal", invoice.subtotal, 50000);
  assertMoney("taxAmount", invoice.taxAmount, 6000);
  assertMoney("total", invoice.total, 56000);

  await expectCode("/payments", "PAYMENT_EXCEEDS_BALANCE", {
    method: "POST",
    headers: jsonHeaders(cliente.token),
    body: JSON.stringify({
      invoiceId: invoice.id,
      amount: 56001,
      method: "transferencia",
      proofFileName: "overpay.pdf",
      proofMimeType: "application/pdf",
      proofBase64: "JVBERi0xLjQKJcTl8uXrp/Og0MTGCg==",
    }),
  });

  const rejected = await clientPayment(cliente.token, invoice.id, 10000, "rechazado.pdf");
  await assertProofFile(admin.token, rejected.id, "application/pdf");
  await verifyPayment(admin.token, rejected.id, "rechazado");
  let current = await ok<Invoice>(`/invoices/${invoice.id}`, { headers: headers(admin.token) });
  assertMoney("approved after rejected", approvedTotal(current), 0);

  const first = await clientPayment(cliente.token, invoice.id, 28000, "parcial-1.pdf");
  await verifyPayment(admin.token, first.id, "aprobado");
  current = await ok<Invoice>(`/invoices/${invoice.id}`, { headers: headers(admin.token) });
  assertMoney("approved after first", approvedTotal(current), 28000);

  const second = await clientPayment(cliente.token, invoice.id, 28000, "parcial-2.pdf");
  await verifyPayment(admin.token, second.id, "aprobado");
  current = await ok<Invoice>(`/invoices/${invoice.id}`, { headers: headers(admin.token) });
  assertMoney("approved after second", approvedTotal(current), 56000);

  await expectCode("/payments", "INVOICE_PAID", {
    method: "POST",
    headers: jsonHeaders(cliente.token),
    body: JSON.stringify({
      invoiceId: invoice.id,
      amount: 1,
      method: "transferencia",
      proofFileName: "extra.pdf",
      proofMimeType: "application/pdf",
      proofBase64: "JVBERi0xLjQKJcTl8uXrp/Og0MTGCg==",
    }),
  });

  await expectCode("/payments", "INVOICE_PAID", {
    method: "POST",
    headers: jsonHeaders(admin.token),
    body: JSON.stringify({ invoiceId: invoice.id, amount: 1, method: "transferencia", reference: "admin-overpay" }),
  });

  await expectCode(`/invoices/${invoice.id}`, "INVOICE_HAS_APPROVED_PAYMENTS", {
    method: "PATCH",
    headers: jsonHeaders(admin.token),
    body: JSON.stringify({ status: "anulada" }),
  });

  const draft = await createInvoice(admin.token, me.customerId, "borrador");
  await expectCode("/payments", "INVOICE_DRAFT", {
    method: "POST",
    headers: jsonHeaders(cliente.token),
    body: JSON.stringify({
      invoiceId: draft.id,
      amount: 100,
      method: "transferencia",
      proofFileName: "draft.pdf",
      proofMimeType: "application/pdf",
      proofBase64: "JVBERi0xLjQKJcTl8uXrp/Og0MTGCg==",
    }),
  });

  const voided = await createInvoice(admin.token, me.customerId, "anulada");
  await expectCode("/payments", "INVOICE_VOID", {
    method: "POST",
    headers: jsonHeaders(cliente.token),
    body: JSON.stringify({
      invoiceId: voided.id,
      amount: 100,
      method: "transferencia",
      proofFileName: "void.pdf",
      proofMimeType: "application/pdf",
      proofBase64: "JVBERi0xLjQKJcTl8uXrp/Og0MTGCg==",
    }),
  });

  console.log("Smoke billing OK: IVA, subtotal, total, pagos parciales, rechazo y saldo final.");
}

main().catch((error) => {
  console.error("Smoke billing FAIL:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
