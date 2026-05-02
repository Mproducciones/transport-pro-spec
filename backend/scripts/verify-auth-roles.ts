type ApiOk<T> = { success: true; data: T };
type ApiErr = { success: false; message: string; code?: string };

const API_BASE = process.env.AUTH_API_BASE ?? process.env.SMOKE_API_BASE ?? "http://localhost:4000/api/v1";

const ACCOUNTS = [
  { label: "admin", email: process.env.SMOKE_ADMIN_EMAIL ?? "admin@demo.com", password: process.env.SMOKE_ADMIN_PASSWORD ?? "Admin123!", role: "admin" },
  { label: "cliente", email: process.env.SMOKE_CLIENT_EMAIL ?? "cliente@demo.com", password: process.env.SMOKE_CLIENT_PASSWORD ?? "Cliente123!", role: "cliente" },
  { label: "chofer", email: process.env.SMOKE_DRIVER_EMAIL ?? "conductor@demo.com", password: process.env.SMOKE_DRIVER_PASSWORD ?? "Conductor123!", role: "conductor" },
] as const;

async function req<T>(path: string, init?: RequestInit): Promise<{ status: number; body: ApiOk<T> | ApiErr }> {
  const res = await fetch(`${API_BASE}${path}`, init);
  const body = (await res.json()) as ApiOk<T> | ApiErr;
  return { status: res.status, body };
}

async function login(account: (typeof ACCOUNTS)[number]) {
  const res = await req<{ token: string; user: { role: string; tenantId: string; email: string } }>("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: account.email, password: account.password }),
  });
  if (res.status >= 400 || !res.body.success) {
    const err = res.body as ApiErr;
    throw new Error(`${account.label}: login fallo (${res.status}) ${err.code ?? "ERROR"} ${err.message}`);
  }
  if (res.body.data.user.role !== account.role) {
    throw new Error(`${account.label}: rol esperado ${account.role}, recibido ${res.body.data.user.role}`);
  }
  if (!res.body.data.token || res.body.data.token.length < 20) {
    throw new Error(`${account.label}: token invalido`);
  }

  const me = await req<{ id: string; email: string; role: string; tenantId: string }>("/me", {
    headers: { Authorization: `Bearer ${res.body.data.token}` },
  });
  if (me.status >= 400 || !me.body.success) {
    const err = me.body as ApiErr;
    throw new Error(`${account.label}: /me fallo (${me.status}) ${err.code ?? "ERROR"} ${err.message}`);
  }
  if (me.body.data.role !== account.role || me.body.data.email !== account.email) {
    throw new Error(`${account.label}: /me no corresponde a la cuenta autenticada`);
  }

  return { label: account.label, email: account.email, role: account.role };
}

async function main() {
  const checked = [];
  for (const account of ACCOUNTS) {
    checked.push(await login(account));
  }
  console.log(JSON.stringify({ ok: true, apiBase: API_BASE, checked }, null, 2));
}

main().catch((error) => {
  console.error("Verify auth roles FAIL:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
