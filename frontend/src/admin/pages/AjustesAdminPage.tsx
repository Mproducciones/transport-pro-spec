import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiGet, apiSend } from "../../api/client.js";
import { useAuthMeta } from "../../store/auth.js";
import { notify } from "../../lib/notify.js";

type SettingsData = {
  tenant: { id: string; name: string; slug: string; createdAt?: string };
  company: {
    legalName: string;
    taxId: string | null;
    address: string | null;
    phone: string | null;
    pricingBaseFee?: unknown;
    pricingPerKg?: unknown;
    pricingPerM3?: unknown;
    pricingMinimumCharge?: unknown;
  } | null;
  subscription: {
    plan: string;
    status: string;
    billingCycle: "monthly" | "annual";
    billingAmount: unknown;
    currentPeriodEnd: string | null;
  } | null;
  mpEnabled: boolean;
};

type AdminRow = { id: string; email: string; createdAt: string };

export function AjustesAdminPage() {
  const qc = useQueryClient();
  const { tenantSlug } = useAuthMeta();
  const q = useQuery({ queryKey: ["settings"], queryFn: () => apiGet<SettingsData>("/settings") });
  const adminsQ = useQuery({ queryKey: ["admins"], queryFn: () => apiGet<AdminRow[]>("/users/admins") });
  const [tenantName, setTenantName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [newAdminPassword, setNewAdminPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (q.data) {
      setTenantName(q.data.tenant.name);
      setLegalName(q.data.company?.legalName ?? "");
      setTaxId(q.data.company?.taxId ?? "");
      setAddress(q.data.company?.address ?? "");
      setPhone(q.data.company?.phone ?? "");
    }
  }, [q.data]);

  const settingsFormDirty = useMemo(() => {
    if (!q.data) return false;
    const t = q.data.tenant;
    const c = q.data.company;
    return (
      tenantName.trim() !== t.name ||
      legalName.trim() !== (c?.legalName ?? "").trim() ||
      (taxId.trim() || "") !== ((c?.taxId ?? "").trim() || "") ||
      (address.trim() || "") !== ((c?.address ?? "").trim() || "") ||
      (phone.trim() || "") !== ((c?.phone ?? "").trim() || "")
    );
  }, [q.data, tenantName, legalName, taxId, address, phone]);

  const save = useMutation({
    mutationFn: () =>
      apiSend("/settings", "PATCH", {
        tenantName,
        company: {
          legalName,
          taxId: taxId || null,
          address: address || null,
          phone: phone || null,
        },
      }),
    onSuccess: () => {
      setOk(`Datos de empresa actualizados (${new Date().toLocaleTimeString()}).`);
      setError(null);
      void qc.invalidateQueries({ queryKey: ["settings"] });
      notify("success", "Configuración de empresa guardada.");
    },
    onError: (e: Error) => {
      setOk(null);
      setError(`No se pudo guardar: ${e.message}`);
      notify("error", "No se pudo guardar configuracion.");
    },
  });

  function handleSave() {
    setError(null);
    setOk("Guardando cambios...");
    save.mutate();
  }

  const createAdmin = useMutation({
    mutationFn: () => apiSend("/users/admins", "POST", { email: newAdminEmail, password: newAdminPassword }),
    onSuccess: () => {
      setOk("Administrador creado correctamente.");
      setError(null);
      notify("success", "Administrador creado.");
      setNewAdminEmail("");
      setNewAdminPassword("");
      void qc.invalidateQueries({ queryKey: ["admins"] });
    },
    onError: (e: Error) => {
      setError(e.message);
      notify("error", "Error al crear administrador.");
    },
  });

  const changePassword = useMutation({
    mutationFn: () => apiSend("/users/me/password", "PATCH", { currentPassword, newPassword: nextPassword }),
    onSuccess: () => {
      setOk("Contraseña actualizada.");
      setError(null);
      notify("success", "Contrasena actualizada.");
      setCurrentPassword("");
      setNextPassword("");
    },
    onError: (e: Error) => {
      setError(e.message);
      notify("error", "Error al actualizar contrasena.");
    },
  });

  const activateDev = useMutation({
    mutationFn: () => apiSend("/subscriptions/activate-dev", "POST"),
    onSuccess: () => {
      setOk("Suscripción SaaS activada en modo desarrollo.");
      setError(null);
      notify("success", "Suscripcion activada.");
      void qc.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (e: Error) => {
      setError(e.message);
      notify("error", "No se pudo activar suscripcion.");
    },
  });

  const changePlan = useMutation({
    mutationFn: (billingCycle: "monthly" | "annual") => apiSend("/subscriptions/change-plan", "POST", { billingCycle }),
    onSuccess: () => {
      setOk("Plan actualizado.");
      setError(null);
      notify("success", "Plan actualizado.");
      void qc.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (e: Error) => {
      setError(e.message);
      notify("error", "No se pudo actualizar el plan.");
    },
  });

  if (q.isLoading) return <p className="muted">Cargando…</p>;
  const registerLink = q.data?.company?.taxId
    ? `${window.location.origin}/registro?rut=${encodeURIComponent(q.data.company.taxId)}`
    : `${window.location.origin}/registro?tenant=${encodeURIComponent(tenantSlug ?? q.data?.tenant.slug ?? "")}`;
  const created = q.data?.tenant.createdAt ? new Date(q.data.tenant.createdAt).toLocaleDateString() : "—";
  const subEnd = q.data?.subscription?.currentPeriodEnd ? new Date(q.data.subscription.currentPeriodEnd).toLocaleDateString() : "—";

  return (
    <div>
      <h1>Ajustes de empresa</h1>
      <p className="muted">Centro de administración: empresa, accesos, seguridad y suscripción.</p>
      {error ? <p className="error">{error}</p> : null}
      {ok ? <p className="hint ok">{ok}</p> : null}
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Empresa</h2>
        <p className="muted">
          Identificador para login principal: <code>{q.data?.company?.taxId ?? "No configurado"}</code>
        </p>
        <label>Fecha de alta</label>
        <input value={created} readOnly />
        <label>Nombre de la empresa en el sistema</label>
        <input value={tenantName} onChange={(e) => setTenantName(e.target.value)} />
        <h3>Datos fiscales</h3>
        <label>Razón social</label>
        <input value={legalName} onChange={(e) => setLegalName(e.target.value)} />
        <label>RUT / NIT</label>
        <input value={taxId} onChange={(e) => setTaxId(e.target.value)} />
        <label>Dirección</label>
        <input value={address} onChange={(e) => setAddress(e.target.value)} />
        <label>Teléfono</label>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} />
        <div className="form-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={handleSave}
            disabled={save.isPending || !settingsFormDirty}
            title={
              settingsFormDirty
                ? "Guardar en la configuración de tu empresa"
                : "No hay cambios respecto a lo ya guardado."
            }
          >
            {save.isPending ? "Guardando..." : settingsFormDirty ? "Guardar cambios" : "Sin cambios pendientes"}
          </button>
        </div>
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Precios, tarifas y comisión chofer</h2>
        <p className="muted">
          La cotización automática (base, kg, m³, mínimo), el catálogo por ruta y el porcentaje de liquidación se configuran en un solo lugar.
        </p>
        <Link className="btn-primary" to="/admin/precios">
          Abrir Precios y tarifas
        </Link>
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Registro de clientes</h2>
        <p className="muted">Comparta este enlace para que el cliente cree su cuenta y aparezca en su panel.</p>
        <label>Enlace de registro autónomo</label>
        <input value={registerLink} readOnly />
        <button
          type="button"
          className="btn-secondary btn-sm"
          onClick={() => {
            void navigator.clipboard.writeText(registerLink);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          }}
        >
          {copied ? "Enlace copiado" : "Copiar enlace de registro cliente"}
        </button>
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Administradores</h2>
        <p className="muted">Agregue cuentas admin para operación compartida y respaldo.</p>
        <div className="grid2">
          <div>
            <label>Correo administrador</label>
            <input type="email" value={newAdminEmail} onChange={(e) => setNewAdminEmail(e.target.value)} />
            <label>Contraseña inicial (mínimo 8)</label>
            <input type="password" value={newAdminPassword} onChange={(e) => setNewAdminPassword(e.target.value)} minLength={8} />
            <button
              type="button"
              className="btn-primary"
              disabled={!newAdminEmail || newAdminPassword.length < 8 || createAdmin.isPending}
              onClick={() => createAdmin.mutate()}
            >
              {createAdmin.isPending ? "Creando..." : "Crear administrador"}
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Correo</th>
                  <th>Alta</th>
                </tr>
              </thead>
              <tbody>
                {(adminsQ.data ?? []).map((a) => (
                  <tr key={a.id}>
                    <td>{a.email}</td>
                    <td>{new Date(a.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Seguridad de cuenta</h2>
        <p className="muted">Cambie la contraseña del administrador actual.</p>
        <label>Contraseña actual</label>
        <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} minLength={8} />
        <label>Nueva contraseña</label>
        <input type="password" value={nextPassword} onChange={(e) => setNextPassword(e.target.value)} minLength={8} />
        <button
          type="button"
          className="btn-secondary"
          disabled={currentPassword.length < 8 || nextPassword.length < 8 || changePassword.isPending}
          onClick={() => changePassword.mutate()}
        >
          {changePassword.isPending ? "Actualizando..." : "Actualizar contraseña"}
        </button>
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Suscripción SaaS (empresa)</h2>
        <p className="muted">Esta suscripción corresponde a su empresa como cliente del software, no a sus clientes finales.</p>
        <p>
          Estado: <span className="badge">{q.data?.subscription?.status ?? "—"}</span> · Plan: {q.data?.subscription?.plan ?? "—"}
        </p>
        <p className="muted">
          Ciclo: {q.data?.subscription?.billingCycle ?? "—"} · Monto: {String(q.data?.subscription?.billingAmount ?? "—")}
        </p>
        <p className="muted">Vigencia actual hasta: {subEnd}</p>
        <p className="muted">Mercado Pago habilitado: {q.data?.mpEnabled ? "sí" : "no (modo dev)"}</p>
        <button type="button" className="btn-secondary" onClick={() => activateDev.mutate()} disabled={activateDev.isPending}>
          {activateDev.isPending ? "Activando..." : "Activar suscripción (solo dev)"}
        </button>
        <div className="row" style={{ marginTop: "0.75rem" }}>
          <button
            type="button"
            className="btn-secondary btn-sm"
            disabled={changePlan.isPending}
            onClick={() => changePlan.mutate("monthly")}
          >
            Cambiar a mensual
          </button>
          <button
            type="button"
            className="btn-secondary btn-sm"
            disabled={changePlan.isPending}
            onClick={() => changePlan.mutate("annual")}
          >
            Cambiar a anual
          </button>
        </div>
      </div>
    </div>
  );
}
