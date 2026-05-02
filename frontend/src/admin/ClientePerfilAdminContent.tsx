import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import { apiGet, apiSend } from "../api/client.js";
import { ContactButtons } from "../components/common/ContactButtons.js";
import { formatPhoneCL } from "../lib/contact.js";
import { notify } from "../lib/notify.js";

export type ClientePerfilLayout = "page" | "modal";

export type ProfileData = {
  customer: {
    id: string;
    name: string;
    email: string;
    taxId?: string | null;
    phone?: string | null;
    createdAt: string;
    user?: { id: string; email: string; createdAt: string } | null;
  };
  metrics: { shipments: number; invoices: number; payments: number };
  shipments: Array<{
    id: string;
    origin: string;
    destination: string;
    status: string;
    paymentStatus: string;
    createdAt: string;
  }>;
  invoices: Array<{
    id: string;
    number: string;
    issueDate: string;
    dueDate: string | null;
    total: string;
    status: string;
  }>;
  payments: Array<{
    id: string;
    amount: string;
    method: string;
    paidAt: string;
    reference: string | null;
    invoice?: { number: string } | null;
  }>;
};

type Props = {
  customerId: string;
  layout: ClientePerfilLayout;
  /** Cerrar panel flotante (solo layout modal). */
  onClose?: () => void;
};

export function ClientePerfilAdminContent({ customerId, layout, onClose }: Props) {
  const qc = useQueryClient();
  const [newPassword, setNewPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [phoneInput, setPhoneInput] = useState("");

  const q = useQuery({
    queryKey: ["customer-profile", customerId],
    queryFn: () => apiGet<ProfileData>(`/customers/${customerId}/profile`),
    enabled: Boolean(customerId),
  });

  useEffect(() => {
    if (q.data?.customer.phone !== undefined) {
      setPhoneInput(q.data.customer.phone ?? "");
    }
  }, [q.data?.customer.phone]);

  const resetPassword = useMutation({
    mutationFn: () => apiSend(`/customers/${customerId}/password`, "PATCH", { newPassword }),
    onSuccess: () => {
      notify("success", "Contraseña de cliente actualizada.");
      setErr(null);
      setNewPassword("");
    },
    onError: (e: Error) => setErr(e.message),
  });

  const updatePhone = useMutation({
    mutationFn: () => apiSend(`/customers/${customerId}`, "PATCH", { phone: phoneInput.trim() || null }),
    onSuccess: () => {
      notify("success", "Teléfono actualizado.");
      void qc.invalidateQueries({ queryKey: ["customer-profile", customerId] });
      void qc.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e: Error) => notify("error", e.message),
  });

  if (q.isLoading) {
    if (layout === "modal" && onClose) {
      return (
        <div className="text-slate-800">
          <div className="flex items-center justify-end border-b border-slate-200 bg-slate-50/80 px-2 py-2">
            <button
              type="button"
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200/80"
              onClick={onClose}
              aria-label="Cerrar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <p className="px-4 py-8 text-center text-sm text-slate-600">Cargando perfil de cliente…</p>
        </div>
      );
    }
    return <p className="muted px-1 py-4 text-sm">Cargando perfil de cliente…</p>;
  }
  if (q.isError) {
    if (layout === "modal" && onClose) {
      return (
        <div className="text-slate-800">
          <div className="flex items-center justify-end border-b border-slate-200 bg-slate-50/80 px-2 py-2">
            <button
              type="button"
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200/80"
              onClick={onClose}
              aria-label="Cerrar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <p className="error px-4 py-6">{(q.error as Error).message}</p>
        </div>
      );
    }
    return <p className="error px-1 py-2">{(q.error as Error).message}</p>;
  }

  const d = q.data!;
  const serverPhoneNorm = (d.customer.phone ?? "").trim();
  const phoneDirty = phoneInput.trim() !== serverPhoneNorm;
  const isModal = layout === "modal";

  const timelineEvents = useMemo(() => {
    const items: Array<{ t: number; kind: string; title: string; sub: string }> = [];
    for (const s of d.shipments) {
      items.push({
        t: new Date(s.createdAt).getTime(),
        kind: "envio",
        title: `${s.origin} → ${s.destination}`,
        sub: `Pedido · ${s.status} · Cobro ${s.paymentStatus}`,
      });
    }
    for (const inv of d.invoices) {
      items.push({
        t: new Date(inv.issueDate).getTime(),
        kind: "factura",
        title: `Factura ${inv.number}`,
        sub: `${inv.total} · ${inv.status}`,
      });
    }
    for (const p of d.payments) {
      items.push({
        t: new Date(p.paidAt).getTime(),
        kind: "pago",
        title: `Pago ${p.amount}`,
        sub: `${p.method} · ${p.reference ?? p.invoice?.number ?? "—"}`,
      });
    }
    return items.filter((x) => Number.isFinite(x.t)).sort((a, b) => b.t - a.t).slice(0, 50);
  }, [d.shipments, d.invoices, d.payments]);

  const mainBlocks = (
    <>
      <div className="card card-elevated">
        <h3 className="card-title">Línea de tiempo</h3>
        <p className="muted" style={{ marginTop: "0.35rem", fontSize: "0.8rem" }}>
          Pedidos, facturas y pagos en orden cronológico (reemplaza el rastro en WhatsApp).
        </p>
        {timelineEvents.length === 0 ? (
          <p className="muted mt-2 text-sm">Sin movimientos registrados.</p>
        ) : (
          <ol className="mt-3 max-h-[min(50vh,420px)] list-none space-y-3 overflow-y-auto overscroll-contain pl-0">
            {timelineEvents.map((ev, idx) => (
              <li
                key={`${ev.kind}-${ev.t}-${idx}`}
                className="border-l-2 border-blue-200 pl-3 text-sm"
              >
                <p className="text-[11px] text-slate-500">
                  {new Date(ev.t).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" })}
                </p>
                <p className="font-semibold text-slate-900">{ev.title}</p>
                <p className="text-xs text-slate-600">{ev.sub}</p>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="grid-cards">
          <div className="card card-elevated">
            <h3 className="card-title">Ingreso al portal web (cliente)</h3>
            <p className="muted" style={{ marginTop: "0.35rem", fontSize: "0.8rem" }}>
              Es el <strong>usuario y clave</strong> con el que el cliente entra a la web de su empresa: pedidos, seguimiento,
              facturas, etc. Es distinto del correo comercial de la ficha, aunque a veces coincidan.
            </p>
            {d.customer.user ? (
              <>
                <p className="stat-big" style={{ marginTop: "0.5rem" }}>
                  Cuenta activa
                </p>
                <p className="muted">Correo de ingreso: {d.customer.user.email}</p>
              </>
            ) : (
              <>
                <p className="stat-big" style={{ marginTop: "0.5rem" }}>
                  Sin cuenta de ingreso
                </p>
                <p className="muted">
                  Aún no hay un usuario vinculado. Se crea al dar de alta el cliente con contraseña, con el enlace de registro
                  autónomo, o cuando habilitás el acceso desde oficina.
                </p>
              </>
            )}
          </div>
          <div className="card card-elevated">
            <h3 className="card-title">Actividad</h3>
            <p className="muted">Envíos: {d.metrics.shipments}</p>
            <p className="muted">Facturas: {d.metrics.invoices}</p>
            <p className="muted">Pagos: {d.metrics.payments}</p>
          </div>
          <div className="card card-elevated">
            <h3 className="card-title">Datos comerciales</h3>
            <p className="muted">RUT: {d.customer.taxId ?? "—"}</p>
            <label style={{ marginTop: "0.5rem" }}>Teléfono</label>
            <div className="flex gap-2">
              <input
                type="tel"
                inputMode="tel"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                placeholder="+56 9 1234 5678"
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="btn-secondary btn-sm"
                title={phoneDirty ? "Guardar teléfono en la ficha del cliente" : "Sin cambios respecto al valor guardado."}
                disabled={updatePhone.isPending || !phoneDirty}
                onClick={() => updatePhone.mutate()}
              >
                {updatePhone.isPending ? "Guardando…" : "Guardar"}
              </button>
            </div>
            {d.customer.phone ? (
              <p className="muted" style={{ marginTop: "0.35rem", fontSize: "0.78rem" }}>
                Actual: {formatPhoneCL(d.customer.phone)}
              </p>
            ) : (
              <p className="muted" style={{ marginTop: "0.35rem", fontSize: "0.78rem" }}>
                Sin teléfono registrado.
              </p>
            )}
          </div>
          <div className="card card-elevated">
            <h3 className="card-title">Seguridad de acceso</h3>
            <label>Nueva contraseña portal</label>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={8} />
            {err ? <p className="error">{err}</p> : null}
            <button
              type="button"
              className="btn-secondary btn-sm"
              disabled={!d.customer.user || newPassword.length < 8 || resetPassword.isPending}
              onClick={() => resetPassword.mutate()}
            >
              {resetPassword.isPending ? "Actualizando…" : "Cambiar contraseña cliente"}
            </button>
            {!d.customer.user ? <p className="hint">El cliente aún no tiene usuario portal activo.</p> : null}
          </div>
        </div>

        <div className="card card-elevated">
          <h3 className="card-title">Envíos recientes</h3>
          <div className="table-wrap">
            <table className="table-pro">
              <thead>
                <tr>
                  <th>Origen</th>
                  <th>Destino</th>
                  <th>Estado</th>
                  <th>Pago</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {d.shipments.map((s) => (
                  <tr key={s.id}>
                    <td>{s.origin}</td>
                    <td>{s.destination}</td>
                    <td>{s.status}</td>
                    <td>{s.paymentStatus}</td>
                    <td>{new Date(s.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
                {d.shipments.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="muted">
                      Sin envíos registrados.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid2">
          <div className="card card-elevated">
            <h3 className="card-title">Facturas recientes</h3>
            <div className="table-wrap">
              <table className="table-pro">
                <thead>
                  <tr>
                    <th>Número</th>
                    <th>Total</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {d.invoices.map((i) => (
                    <tr key={i.id}>
                      <td>{i.number}</td>
                      <td>{i.total}</td>
                      <td>{i.status}</td>
                    </tr>
                  ))}
                  {d.invoices.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="muted">
                        Sin facturas registradas.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
          <div className="card card-elevated">
            <h3 className="card-title">Pagos recientes</h3>
            <div className="table-wrap">
              <table className="table-pro">
                <thead>
                  <tr>
                    <th>Monto</th>
                    <th>Método</th>
                    <th>Referencia</th>
                  </tr>
                </thead>
                <tbody>
                  {d.payments.map((p) => (
                    <tr key={p.id}>
                      <td>{p.amount}</td>
                      <td>{p.method}</td>
                      <td>{p.reference ?? p.invoice?.number ?? "—"}</td>
                    </tr>
                  ))}
                  {d.payments.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="muted">
                        Sin pagos registrados.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
    </>
  );

  if (isModal) {
    return (
      <div className="text-slate-800 [&_label]:text-slate-700">
        <div className="flex items-start justify-between gap-2 border-b border-slate-200 bg-slate-50/80 px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-base font-bold leading-snug text-slate-900" id="cliente-perfil-modal-title">
              {d.customer.name}
            </h2>
            <p className="mt-0.5 text-xs text-slate-600">
              Correo: {d.customer.email} · Alta: {new Date(d.customer.createdAt).toLocaleDateString("es-CL")}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <ContactButtons
              phone={d.customer.phone}
              email={d.customer.email}
              variant="compact"
              whatsappMessage={`Hola ${d.customer.name}, te escribimos desde el equipo de transporte.`}
              emailSubject="Contacto desde Transport Pro"
            />
            {onClose ? (
              <button
                type="button"
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200/80"
                onClick={onClose}
                aria-label="Cerrar perfil"
              >
                <X className="h-5 w-5" />
              </button>
            ) : null}
          </div>
        </div>
        <div className="min-h-0 max-h-[min(78vh,640px)] space-y-4 overflow-y-auto overscroll-contain px-4 py-4">{mainBlocks}</div>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <header className="page-header">
        <p className="page-eyebrow">Clientes</p>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1>{d.customer.name}</h1>
            <p className="page-subtitle">
              Correo: {d.customer.email} · Alta: {new Date(d.customer.createdAt).toLocaleDateString("es-CL")}
            </p>
            <Link
              to="/admin/clientes"
              className="btn-secondary btn-sm"
              style={{ display: "inline-block", marginTop: "0.35rem" }}
            >
              ← Volver al listado
            </Link>
          </div>
          <ContactButtons
            phone={d.customer.phone}
            email={d.customer.email}
            variant="full"
            whatsappMessage={`Hola ${d.customer.name}, te escribimos desde el equipo de transporte.`}
            emailSubject="Contacto desde Transport Pro"
          />
        </div>
      </header>
      {mainBlocks}
    </div>
  );
}
