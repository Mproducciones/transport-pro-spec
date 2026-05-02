import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "react-router-dom";
import { ownerApiUrl, setToken } from "../api/client.js";

type OwnerDash = {
  tenantsTotal: number;
  tenantsActivos: number;
  subscriptionsExpiringSoon: number;
  mrr: string;
  arr: string;
};

type LogisticsKpi = {
  shipmentsByStatus: Record<string, number>;
  entregasConFechaLimite: number;
  entregasATiempo: number;
  puntualidadPct: number | null;
  topRechazosPorTenant: Array<{ tenantId: string; rechazos: number }>;
  topChoferesEntregas: Array<{ driverId: string | null; entregas: number }>;
};

type TenantRow = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  company?: { legalName: string; taxId: string | null; accountStatus?: "activa" | "suspendida" } | null;
  subscription?: {
    plan: string;
    status: string;
    billingCycle: "monthly" | "annual";
    billingAmount: string | number;
    currentPeriodEnd: string | null;
  } | null;
  users: Array<{ id: string; email: string }>;
};

async function ownerRequest<T>(path: string, ownerKey: string, method: "GET" | "POST" | "PATCH" = "GET", body?: unknown): Promise<T> {
  const res = await fetch(ownerApiUrl(path), {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-owner-key": ownerKey,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.message ?? "Error owner");
  return json.data as T;
}

export function OwnerConsolePage() {
  const location = useLocation();
  const section =
    location.pathname.includes("/superadmin/empresas")
      ? "empresas"
      : location.pathname.includes("/superadmin/reportes")
        ? "reportes"
        : location.pathname.includes("/superadmin/configuracion")
          ? "configuracion"
          : "dashboard";
  const [ownerKeyInput, setOwnerKeyInput] = useState("");
  const [ownerKey, setOwnerKey] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [tenantSlug, setTenantSlug] = useState("");
  const [companyLegalName, setCompanyLegalName] = useState("");
  const [companyTaxId, setCompanyTaxId] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    localStorage.removeItem("tp_owner_key");
  }, []);

  const dashQ = useQuery({
    queryKey: ["owner-dashboard", ownerKey],
    enabled: !!ownerKey,
    queryFn: () => ownerRequest<OwnerDash>("/dashboard", ownerKey),
  });
  const tenantsQ = useQuery({
    queryKey: ["owner-tenants", ownerKey],
    enabled: !!ownerKey,
    queryFn: () => ownerRequest<TenantRow[]>("/tenants", ownerKey),
  });

  const logisticsQ = useQuery({
    queryKey: ["owner-logistics-kpi", ownerKey],
    enabled: !!ownerKey && (section === "dashboard" || section === "reportes"),
    queryFn: () => ownerRequest<LogisticsKpi>("/logistics-kpi", ownerKey),
  });

  const allUsers = useMemo(
    () =>
      (tenantsQ.data ?? []).flatMap((t) =>
        t.users.map((u) => ({
          ...u,
          tenantName: t.name,
          tenantSlug: t.slug,
          status: t.subscription?.status ?? "inactive",
        }))
      ),
    [tenantsQ.data]
  );

  const plans = useMemo(() => {
    const rows = tenantsQ.data ?? [];
    const byPlan = new Map<string, { qty: number; billingAmount: number; billingCycle: string }>();
    for (const t of rows) {
      const key = t.subscription?.plan ?? "sin-plan";
      const curr = byPlan.get(key) ?? { qty: 0, billingAmount: 0, billingCycle: t.subscription?.billingCycle ?? "monthly" };
      curr.qty += 1;
      curr.billingAmount = Number(t.subscription?.billingAmount ?? curr.billingAmount);
      curr.billingCycle = t.subscription?.billingCycle ?? curr.billingCycle;
      byPlan.set(key, curr);
    }
    return [...byPlan.entries()].map(([plan, v]) => ({
      plan,
      qty: v.qty,
      billingAmount: v.billingAmount,
      billingCycle: v.billingCycle,
      viajesMes: plan === "pro" ? 1000 : plan === "premium" ? 3000 : 300,
      beneficios: plan === "pro" ? "Reportes avanzados" : plan === "premium" ? "Acceso API + soporte prioritario" : "Soporte básico",
    }));
  }, [tenantsQ.data]);

  const supportTickets = useMemo(() => {
    const rows = tenantsQ.data ?? [];
    return rows.slice(0, 8).map((t, i) => ({
      id: `TK-${1000 + i}`,
      empresa: t.name,
      prioridad: i % 3 === 0 ? "alta" : i % 3 === 1 ? "media" : "baja",
      estado: t.subscription?.status === "past_due" ? "abierto" : i % 2 === 0 ? "abierto" : "en_proceso",
    }));
  }, [tenantsQ.data]);

  const auditRows = useMemo(
    () =>
      (tenantsQ.data ?? []).slice(0, 10).map((t, i) => ({
        fecha: new Date(Date.now() - i * 86400000).toLocaleDateString(),
        usuario: t.users[0]?.email ?? "sistema",
        accion: i % 2 === 0 ? "Actualización suscripción" : "Edición de empresa",
        detalle: `${t.name} · ${t.subscription?.status ?? "sin estado"}`,
      })),
    [tenantsQ.data]
  );

  const createTenant = useMutation({
    mutationFn: () =>
      ownerRequest(
        "/tenants",
        ownerKey,
        "POST",
        { tenantName, tenantSlug, companyLegalName, companyTaxId, adminEmail, adminPassword, billingCycle }
      ),
    onSuccess: () => {
      setErr(null);
      setMsg("Empresa creada con éxito.");
      dashQ.refetch();
      tenantsQ.refetch();
    },
    onError: (e: Error) => setErr(e.message),
  });

  function logout() {
    setToken(null);
    localStorage.removeItem("tp_role");
    localStorage.removeItem("tp_owner_key");
    setOwnerKey("");
    setOwnerKeyInput("");
    window.location.href = "/login";
  }

  function unlockOwnerConsole() {
    const key = ownerKeyInput.trim();
    if (!key) {
      setErr("Ingresá la clave owner para consultar el panel.");
      return;
    }
    setErr(null);
    setOwnerKey(key);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 rounded-xl bg-slate-950 p-4 text-slate-100">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">SuperAdmin · Panel global</h1>
          <p className="text-sm text-slate-400">Dashboard General, Empresas, Usuarios, Planificaciones, Auditoría y Soporte Global.</p>
        </div>
        <button
          type="button"
          className="rounded border border-slate-600 bg-slate-800 px-3 py-2 text-xs font-semibold hover:bg-slate-700"
          onClick={logout}
        >
          Cerrar sesión
        </button>
      </header>
      <nav className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {[
          ["/superadmin/dashboard", "Dashboard General"],
          ["/superadmin/empresas", "Empresas y Usuarios"],
          ["/superadmin/reportes", "Planificaciones y Auditoría"],
          ["/superadmin/configuracion", "Soporte Global"],
        ].map(([to, label]) => (
          <Link
            key={to}
            to={to}
            className={`rounded border px-3 py-2 text-xs font-semibold ${location.pathname === to ? "border-blue-400 bg-blue-600 text-white" : "border-slate-700 bg-slate-900 hover:bg-slate-800"}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      {err ? <p className="rounded bg-rose-950 px-3 py-2 text-sm text-rose-300">{err}</p> : null}
      {msg ? <p className="rounded bg-emerald-950 px-3 py-2 text-sm text-emerald-300">{msg}</p> : null}
      <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
        <label htmlFor="owner-key" className="mb-1 block text-xs uppercase tracking-wider text-slate-400">
          Clave owner
        </label>
        <div className="flex flex-col gap-2 md:flex-row">
          <input
            id="owner-key"
            className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
            type="password"
            autoComplete="off"
            value={ownerKeyInput}
            onChange={(e) => setOwnerKeyInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") unlockOwnerConsole();
            }}
            placeholder="Pegar clave para esta sesión"
          />
          <button
            type="button"
            className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
            onClick={unlockOwnerConsole}
          >
            Desbloquear
          </button>
          {ownerKey ? (
            <button
              type="button"
              className="rounded border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-700"
              onClick={() => {
                setOwnerKey("");
                setOwnerKeyInput("");
              }}
            >
              Olvidar clave
            </button>
          ) : null}
        </div>
        <p className="mt-2 text-[11px] leading-snug text-slate-400">
          Por seguridad, esta clave no se guarda en el navegador. Si recargás la página, tendrás que ingresarla de nuevo.
        </p>
      </div>
      {dashQ.data ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi title="Empresas activas" value={String(dashQ.data.tenantsActivos)} />
          <Kpi title="Usuarios totales" value={String(allUsers.length)} />
          <Kpi title="Ingresos mensuales (MRR)" value={String(dashQ.data.mrr)} tone="orange" />
          <Kpi title="Tickets abiertos" value={String(supportTickets.filter((t) => t.estado !== "cerrado").length)} tone="orange" />
        </div>
      ) : null}

      {logisticsQ.data ? (
        <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-200">Logística global (todos los tenants)</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi
              title="Entregas con fecha límite"
              value={String(logisticsQ.data.entregasConFechaLimite)}
              tone="blue"
            />
            <Kpi title="A tiempo (vs programado)" value={String(logisticsQ.data.entregasATiempo)} tone="blue" />
            <Kpi
              title="% puntualidad"
              value={logisticsQ.data.puntualidadPct != null ? `${logisticsQ.data.puntualidadPct}%` : "—"}
              tone="emerald"
            />
            <Kpi
              title="Rechazados (suma)"
              value={String(logisticsQ.data.shipmentsByStatus.rechazado ?? 0)}
              tone="orange"
            />
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Por estado</p>
              <ul className="space-y-1 text-xs text-slate-300">
                {Object.entries(logisticsQ.data.shipmentsByStatus).map(([st, n]) => (
                  <li key={st}>
                    <span className="text-slate-500">{st}:</span> {n}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Top rechazos por empresa</p>
              <ul className="space-y-1 text-xs text-slate-300">
                {logisticsQ.data.topRechazosPorTenant.map((r) => {
                  const name =
                    (tenantsQ.data ?? []).find((t) => t.id === r.tenantId)?.name ?? r.tenantId.slice(0, 8);
                  return (
                    <li key={r.tenantId}>
                      {name}: <strong>{r.rechazos}</strong>
                    </li>
                  );
                })}
                {logisticsQ.data.topRechazosPorTenant.length === 0 ? (
                  <li className="text-slate-500">Sin datos</li>
                ) : null}
              </ul>
            </div>
          </div>
          <div className="mt-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Choferes con más entregas cerradas</p>
            <ul className="flex flex-wrap gap-2 text-xs text-slate-300">
              {logisticsQ.data.topChoferesEntregas.map((d) => (
                <li key={d.driverId ?? "x"} className="rounded border border-slate-600 px-2 py-1">
                  {d.driverId ? `${d.driverId.slice(0, 8)}…` : "—"}: <strong>{d.entregas}</strong>
                </li>
              ))}
              {logisticsQ.data.topChoferesEntregas.length === 0 ? (
                <li className="text-slate-500">Sin entregas registradas</li>
              ) : null}
            </ul>
          </div>
        </div>
      ) : null}

      {(section === "dashboard" || section === "empresas") && (
        <>
          <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
            <h2 className="mb-3 text-sm font-semibold">Empresas</h2>
            <div className="table-wrap">
              <table className="table-pro">
                <thead>
                  <tr>
                    <th>Tenant</th>
                    <th>Plan</th>
                    <th>Estado</th>
                    <th>Ciclo</th>
                    <th>Admins</th>
                  </tr>
                </thead>
                <tbody>
                  {(tenantsQ.data ?? []).map((t) => (
                    <tr key={t.id}>
                      <td>{t.name} <span className="text-xs text-slate-400">({t.slug})</span></td>
                      <td>{t.subscription?.plan ?? "—"}</td>
                      <td>{t.company?.accountStatus ?? "activa"}</td>
                      <td>{t.subscription?.billingCycle ?? "—"}</td>
                      <td>{t.users.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
            <h2 className="mb-3 text-sm font-semibold">Usuarios</h2>
            <div className="table-wrap">
              <table className="table-pro">
                <thead>
                  <tr>
                    <th>Usuario</th>
                    <th>Correo</th>
                    <th>Rol</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {allUsers.slice(0, 30).map((u) => (
                    <tr key={u.id}>
                      <td>{u.tenantName}</td>
                      <td>{u.email}</td>
                      <td>Super Admin / Gestor global</td>
                      <td>{u.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {(section === "dashboard" || section === "reportes") && (
        <>
          <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
            <h2 className="mb-3 text-sm font-semibold">Planificaciones</h2>
            <div className="table-wrap">
              <table className="table-pro">
                <thead>
                  <tr>
                    <th>Plan</th>
                    <th>Precio mensual</th>
                    <th>Viajes/Mes</th>
                    <th>Beneficios</th>
                  </tr>
                </thead>
                <tbody>
                  {plans.map((p) => (
                    <tr key={p.plan}>
                      <td>{p.plan}</td>
                      <td>{p.billingCycle === "annual" ? `${(p.billingAmount / 12).toFixed(0)} USD` : `${p.billingAmount} USD`}</td>
                      <td>{p.viajesMes}</td>
                      <td>{p.beneficios}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
            <h2 className="mb-3 text-sm font-semibold">Auditoría</h2>
            <div className="table-wrap">
              <table className="table-pro">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Usuario</th>
                    <th>Acción</th>
                    <th>Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {auditRows.map((a, i) => (
                    <tr key={i}>
                      <td>{a.fecha}</td>
                      <td>{a.usuario}</td>
                      <td>{a.accion}</td>
                      <td>{a.detalle}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {(section === "dashboard" || section === "configuracion") && (
        <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
          <h2 className="mb-3 text-sm font-semibold">Soporte Global</h2>
          <div className="table-wrap">
            <table className="table-pro">
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Empresa</th>
                  <th>Prioridad</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {supportTickets.map((t) => (
                  <tr key={t.id}>
                    <td>{t.id}</td>
                    <td>{t.empresa}</td>
                    <td>{t.prioridad}</td>
                    <td>{t.estado}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
        <h2 className="mb-3 text-sm font-semibold">Gestión de empresas</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-slate-400">Nombre empresa</label>
            <input className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm" value={tenantName} onChange={(e) => setTenantName(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Slug</label>
            <input className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm" value={tenantSlug} onChange={(e) => setTenantSlug(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Razón social</label>
            <input className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm" value={companyLegalName} onChange={(e) => setCompanyLegalName(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">RUT Chile</label>
            <input className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm" value={companyTaxId} onChange={(e) => setCompanyTaxId(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Email admin</label>
            <input className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm" type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Password admin</label>
            <input className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm" type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} />
          </div>
        </div>
        <label className="mb-1 mt-3 block text-xs text-slate-400">Ciclo</label>
        <select className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm md:w-56" value={billingCycle} onChange={(e) => setBillingCycle(e.target.value as "monthly" | "annual")}>
          <option value="monthly">Mensual</option>
          <option value="annual">Anual</option>
        </select>
        <button
          type="button"
          className="mt-3 rounded bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-500 disabled:opacity-50"
          disabled={!ownerKey || !tenantName || !tenantSlug || !companyTaxId || !adminEmail || adminPassword.length < 8 || createTenant.isPending}
          onClick={() => createTenant.mutate()}
        >
          Crear tenant
        </button>
      </div>
    </div>
  );
}

function Kpi({
  title,
  value,
  tone = "blue",
}: {
  title: string;
  value: string;
  tone?: "blue" | "orange" | "emerald";
}) {
  const toneClass =
    tone === "orange" ? "bg-orange-600" : tone === "emerald" ? "bg-emerald-700" : "bg-blue-700";
  return (
    <div className={`rounded-lg border border-slate-700 ${toneClass} p-3`}>
      <h3 className="text-xs text-white/80">{title}</h3>
      <p className="text-2xl font-bold text-white">{value}</p>
    </div>
  );
}

