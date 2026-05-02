type LoginResult = {
  success: true;
  data: {
    token: string;
    user: { role: "admin" | "cliente" | "conductor"; tenantId?: string };
  };
};

type ApiResult<T> = { success: true; data: T };
type ApiErrorResult = { success: false; message: string; code?: string };

type TenantProbe = {
  name: string;
  adminEmail: string;
  adminPassword: string;
  clientEmail: string;
  clientPassword: string;
};

type ShipmentRow = { id: string; customer?: { id: string } | null; customerId?: string | null };
type CustomerRow = { id: string; email: string };
type InvoiceRow = { id: string; number: string };

const API_BASE = process.env.ISOLATION_API_BASE ?? process.env.SMOKE_API_BASE ?? "http://localhost:4000/api/v1";

const TENANTS: [TenantProbe, TenantProbe] = [
  {
    name: "Andes Cargo",
    adminEmail: "adminandescargo@demo.com",
    adminPassword: "Admin123!",
    clientEmail: "cliente1andescargo@demo.com",
    clientPassword: "Cliente123!",
  },
  {
    name: "Patagonia Ruta",
    adminEmail: "adminpatagoniaruta@demo.com",
    adminPassword: "Admin123!",
    clientEmail: "cliente1patagoniaruta@demo.com",
    clientPassword: "Cliente123!",
  },
];

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

async function request<T>(
  path: string,
  init?: RequestInit
): Promise<{ status: number; body: ApiResult<T> | ApiErrorResult }> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, init);
  const text = await res.text();
  let body: ApiResult<T> | ApiErrorResult;
  try {
    body = JSON.parse(text) as ApiResult<T> | ApiErrorResult;
  } catch {
    throw new Error(`${url} returned non-JSON response (${res.status}): ${text.slice(0, 120)}`);
  }
  return { status: res.status, body };
}

async function ok<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await request<T>(path, init);
  if (res.status >= 400 || !res.body.success) {
    const err = res.body as ApiErrorResult;
    throw new Error(`${path} failed: ${res.status} ${err.code ?? "ERROR"} ${err.message}`);
  }
  return res.body.data;
}

async function expectDenied(path: string, init?: RequestInit): Promise<number> {
  const res = await request<unknown>(path, init);
  if (![403, 404].includes(res.status)) {
    throw new Error(`${path} expected 403/404, got ${res.status}`);
  }
  return res.status;
}

async function login(email: string, password: string): Promise<string> {
  const data = await ok<LoginResult["data"]>("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return data.token;
}

function assertNoOverlap(label: string, left: string[], right: string[]) {
  const rightSet = new Set(right);
  const overlap = left.filter((id) => rightSet.has(id));
  if (overlap.length > 0) {
    throw new Error(`${label} leaked across tenants: ${overlap.join(", ")}`);
  }
}

async function loadTenant(probe: TenantProbe) {
  const adminToken = await login(probe.adminEmail, probe.adminPassword);
  const clientToken = await login(probe.clientEmail, probe.clientPassword);
  const adminHeaders = authHeaders(adminToken);
  const clientHeaders = authHeaders(clientToken);

  const [shipments, customers, invoices] = await Promise.all([
    ok<ShipmentRow[]>("/shipments", { headers: adminHeaders }),
    ok<CustomerRow[]>("/customers", { headers: adminHeaders }),
    ok<InvoiceRow[]>("/invoices", { headers: adminHeaders }),
  ]);

  if (shipments.length === 0) throw new Error(`${probe.name}: no shipments found`);
  if (customers.length === 0) throw new Error(`${probe.name}: no customers found`);

  return {
    ...probe,
    adminToken,
    clientToken,
    adminHeaders,
    clientHeaders,
    shipments,
    customers,
    invoices,
  };
}

async function createTenantInvoice(input: {
  adminHeaders: Record<string, string>;
  customerId: string;
  shipmentId: string;
  number: string;
}) {
  return ok<InvoiceRow>("/invoices", {
    method: "POST",
    headers: { ...input.adminHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({
      customerId: input.customerId,
      number: input.number,
      taxRate: 12,
      lines: [
        {
          description: "Tenant isolation verification",
          quantity: 1,
          unitPrice: 1000,
          shipmentId: input.shipmentId,
        },
      ],
    }),
  });
}

async function main() {
  const [tenantA, tenantB] = await Promise.all(TENANTS.map(loadTenant));

  assertNoOverlap(
    "shipments",
    tenantA.shipments.map((s) => s.id),
    tenantB.shipments.map((s) => s.id)
  );
  assertNoOverlap(
    "customers",
    tenantA.customers.map((c) => c.id),
    tenantB.customers.map((c) => c.id)
  );

  const aShipment = tenantA.shipments[0];
  const bShipment = tenantB.shipments[0];
  const aCustomerId = aShipment.customer?.id ?? aShipment.customerId ?? tenantA.customers[0].id;
  const bCustomerId = bShipment.customer?.id ?? bShipment.customerId ?? tenantB.customers[0].id;

  await ok<ShipmentRow>(`/shipments/${aShipment.id}`, { headers: tenantA.adminHeaders });
  await expectDenied(`/shipments/${aShipment.id}`, { headers: tenantB.adminHeaders });
  await expectDenied(`/shipments/${aShipment.id}`, { headers: tenantB.clientHeaders });

  await expectDenied(`/customers/${aCustomerId}/profile`, { headers: tenantB.adminHeaders });

  await expectDenied(`/shipments/${aShipment.id}`, {
    method: "PATCH",
    headers: { ...tenantB.adminHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ amount: 1001 }),
  });

  await expectDenied("/invoices", {
    method: "POST",
    headers: { ...tenantB.adminHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({
      customerId: aCustomerId,
      number: `ISO-BAD-${Date.now()}`,
      taxRate: 12,
      lines: [{ description: "Cross tenant should fail", quantity: 1, unitPrice: 1000, shipmentId: aShipment.id }],
    }),
  });

  const invoiceA = await createTenantInvoice({
    adminHeaders: tenantA.adminHeaders,
    customerId: aCustomerId,
    shipmentId: aShipment.id,
    number: `ISO-A-${Date.now()}`,
  });
  const invoiceB = await createTenantInvoice({
    adminHeaders: tenantB.adminHeaders,
    customerId: bCustomerId,
    shipmentId: bShipment.id,
    number: `ISO-B-${Date.now()}`,
  });

  await ok<InvoiceRow>(`/invoices/${invoiceA.id}`, { headers: tenantA.adminHeaders });
  await ok<InvoiceRow>(`/invoices/${invoiceB.id}`, { headers: tenantB.adminHeaders });
  await expectDenied(`/invoices/${invoiceA.id}`, { headers: tenantB.adminHeaders });
  await expectDenied(`/invoices/${invoiceA.id}`, { headers: tenantB.clientHeaders });

  const clientAShipments = await ok<ShipmentRow[]>("/shipments", { headers: tenantA.clientHeaders });
  const clientBShipments = await ok<ShipmentRow[]>("/shipments", { headers: tenantB.clientHeaders });
  assertNoOverlap(
    "client shipments",
    clientAShipments.map((s) => s.id),
    clientBShipments.map((s) => s.id)
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        apiBase: API_BASE,
        checked: {
          tenants: TENANTS.map((t) => t.name),
          crossTenantShipmentReadDenied: true,
          crossTenantShipmentPatchDenied: true,
          crossTenantCustomerProfileDenied: true,
          crossTenantInvoiceCreateDenied: true,
          crossTenantInvoiceReadDenied: true,
          clientListOverlapDenied: true,
        },
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error("Tenant isolation FAIL:", error instanceof Error ? error.message : String(error));
  console.error("Hint: run `npm run seed:clean-accounts` before this check.");
  process.exit(1);
});
