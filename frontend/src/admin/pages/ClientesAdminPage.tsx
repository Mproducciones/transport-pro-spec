import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Search, X, Trash2 } from "lucide-react";
import { ClientePerfilAdminContent } from "../ClientePerfilAdminContent.js";
import { apiGet, apiSend } from "../../api/client.js";
import { notify } from "../../lib/notify.js";
import { useAuthMeta } from "../../store/auth.js";
import { ContactButtons } from "../../components/common/ContactButtons.js";
import { formatPhoneCL } from "../../lib/contact.js";

const clientesModalShell =
  "fixed inset-0 z-[90] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4";

const perfilClienteModalShell =
  "fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4";

type CustomerRow = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  user?: { id: string; email: string; createdAt: string } | null;
};

type ShipmentForCustomerSummary = {
  id: string;
  status: string;
  customerId?: string | null;
  scheduledDelivery?: string | null;
  balanceAmount?: string;
  customer?: { id: string; name: string };
};

type CustomerOpsStats = { delayed: number; pendiente: number; open: number; balanceClp: number };

function parseBalClp(s?: string): number {
  const raw = String(s ?? "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function isShipmentDelayed(status: string, scheduled?: string | null): boolean {
  if (!scheduled) return false;
  if (status === "entregado" || status === "rechazado") return false;
  return Date.now() > new Date(scheduled).getTime();
}

function fmtClp(n: number): string {
  return n.toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
}

function toneForStats(s: CustomerOpsStats): "ok" | "amber" | "red" {
  if (s.delayed > 0) return "red";
  if (s.pendiente > 0 || s.balanceClp > 0) return "amber";
  return "ok";
}

function toneSortOrder(t: "ok" | "amber" | "red"): number {
  switch (t) {
    case "red":
      return 0;
    case "amber":
      return 1;
    default:
      return 2;
  }
}

export function ClientesAdminPage() {
  const qc = useQueryClient();
  const { tenantSlug } = useAuthMeta();
  const settingsQ = useQuery({
    queryKey: ["settings-mini"],
    queryFn: () => apiGet<{ company: { taxId: string | null } | null }>("/settings"),
  });
  const q = useQuery({ queryKey: ["customers"], queryFn: () => apiGet<CustomerRow[]>("/customers") });
  const shipmentsQ = useQuery({
    queryKey: ["shipments", "clientes-resumen"],
    queryFn: () => apiGet<ShipmentForCustomerSummary[]>("/shipments"),
    staleTime: 20_000,
  });
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [taxId, setTaxId] = useState("");
  const [portalPassword, setPortalPassword] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [perfilCustomerId, setPerfilCustomerId] = useState<string | null>(null);
  const [deleteCustomerId, setDeleteCustomerId] = useState<string | null>(null);

  const selfRegisterLink = settingsQ.data?.company?.taxId
    ? `${window.location.origin}/registro?rut=${encodeURIComponent(settingsQ.data.company.taxId)}`
    : tenantSlug
      ? `${window.location.origin}/registro?tenant=${encodeURIComponent(tenantSlug)}`
      : `${window.location.origin}/registro`;

  const create = useMutation({
    mutationFn: () =>
      apiSend("/customers", "POST", {
        name,
        email,
        taxId,
        portalPassword,
        phone: phone.trim() || undefined,
      }),
    onSuccess: () => {
      setName("");
      setEmail("");
      setPhone("");
      setTaxId("");
      setPortalPassword("");
      setError(null);
      setCreateModalOpen(false);
      void qc.invalidateQueries({ queryKey: ["customers"] });
      notify("success", "Cliente y acceso al portal creados en tu cuenta (listado de clientes).");
    },
    onError: (e: Error) => setError(e.message),
  });

  const deleteCustomer = useMutation({
    mutationFn: (id: string) => apiSend(`/customers/${id}`, "DELETE"),
    onSuccess: () => {
      setDeleteCustomerId(null);
      void qc.invalidateQueries({ queryKey: ["customers"] });
      notify("success", "Cliente eliminado correctamente.");
    },
    onError: (e: Error) => {
      setError(e.message);
      setDeleteCustomerId(null);
    },
  });

  const filtered = (q.data ?? []).filter((c) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(s) ||
      c.email.toLowerCase().includes(s) ||
      (c.phone ?? "").toLowerCase().includes(s)
    );
  });

  const statsByCustomerId = useMemo(() => {
    const byId = new Map<string, CustomerOpsStats>();
    for (const shipment of shipmentsQ.data ?? []) {
      const customerId = shipment.customerId ?? shipment.customer?.id;
      if (!customerId) continue;
      const current = byId.get(customerId) ?? { delayed: 0, pendiente: 0, open: 0, balanceClp: 0 };
      const isOpen = shipment.status !== "entregado" && shipment.status !== "rechazado";
      if (isOpen) {
        current.open += 1;
        if (shipment.status === "pendiente") current.pendiente += 1;
        if (isShipmentDelayed(shipment.status, shipment.scheduledDelivery)) current.delayed += 1;
      }
      current.balanceClp += parseBalClp(shipment.balanceAmount);
      byId.set(customerId, current);
    }
    return byId;
  }, [shipmentsQ.data]);

  const sortedFiltered = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const ta = toneSortOrder(toneForStats(statsByCustomerId.get(a.id) ?? { delayed: 0, pendiente: 0, open: 0, balanceClp: 0 }));
      const tb = toneSortOrder(toneForStats(statsByCustomerId.get(b.id) ?? { delayed: 0, pendiente: 0, open: 0, balanceClp: 0 }));
      if (ta !== tb) return ta - tb;
      return a.name.localeCompare(b.name, "es");
    });
  }, [filtered, statsByCustomerId]);

  return (
    <div className="page-stack">
      <header className="page-header">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-white shadow-sm">
              <Building2 className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <p className="page-eyebrow text-slate-300">Control por cuenta</p>
              <h1 className="text-xl font-semibold tracking-tight text-white">Clientes</h1>
              <p className="mt-1 max-w-3xl text-sm leading-relaxed text-blue-100/95">
                Semáforo por pedidos abiertos, plazos y saldo. Tocá una tarjeta para ver historial y pagos. Alta manual con{" "}
                <strong className="font-semibold">Nuevo cliente</strong> o enlace de registro abajo.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="shrink-0 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 shadow ring-1 ring-slate-900/5 hover:bg-slate-50"
            onClick={() => {
              setError(null);
              setCreateModalOpen(true);
            }}
          >
            Nuevo cliente
          </button>
        </div>
      </header>

      <div className="max-w-2xl">
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-800">Registro autónomo</h2>
          <p className="mt-1 text-sm text-slate-600">
            Enlace para que sus clientes se den de alta solos y aparezcan en el directorio.
          </p>
          <label className="mt-3 block text-xs font-medium text-slate-600">Enlace de registro</label>
          <input
            className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
            value={selfRegisterLink}
            readOnly
          />
          <button
            type="button"
            className="btn-secondary mt-3"
            onClick={() => {
              void navigator.clipboard.writeText(selfRegisterLink);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? "Enlace copiado" : "Copiar enlace"}
          </button>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200/90 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-base font-bold tracking-tight text-slate-900 sm:shrink-0">Listado de clientes</h2>
          <div className="relative w-full sm:max-w-sm sm:flex-1 sm:pl-4 md:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              type="search"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-200"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar nombre, correo o teléfono…"
              aria-label="Buscar clientes"
            />
          </div>
        </div>

        <div className="p-5 pt-4">
          {q.isLoading ? <p className="text-sm text-slate-500">Cargando directorio…</p> : null}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {sortedFiltered.map((c) => {
              const st = statsByCustomerId.get(c.id) ?? { delayed: 0, pendiente: 0, open: 0, balanceClp: 0 };
              const tone = toneForStats(st);
              const toneRing =
                tone === "red"
                  ? "ring-rose-200/90 border-rose-200/80"
                  : tone === "amber"
                    ? "ring-amber-200/90 border-amber-200/80"
                    : "ring-slate-100 border-slate-200";
              const toneBadge =
                tone === "red" ? (
                  <span className="shrink-0 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-900 ring-1 ring-rose-200">
                    Requiere acción
                  </span>
                ) : tone === "amber" ? (
                  <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-950 ring-1 ring-amber-200">
                    Seguimiento
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-900 ring-1 ring-emerald-100">
                    Al día
                  </span>
                );
              return (
              <article
                key={c.id}
                className={`group flex min-h-0 flex-col overflow-hidden rounded-xl border bg-gradient-to-b from-white to-slate-50/80 shadow-sm ring-1 transition hover:shadow-md ${toneRing}`}
              >
                <div
                  className="flex min-h-0 flex-1 cursor-pointer flex-col p-4 text-left outline-none transition hover:bg-slate-50/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500/30"
                  role="button"
                  tabIndex={0}
                  aria-label={`Abrir ficha y perfil de ${c.name}`}
                  onClick={() => setPerfilCustomerId(c.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setPerfilCustomerId(c.id);
                    }
                  }}
                >
                  <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
                    <h3 className="min-w-0 flex-1 text-base font-bold leading-snug text-slate-900">{c.name}</h3>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {toneBadge}
                      {c.user ? (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-700 ring-1 ring-slate-200/80">
                          Portal
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-600 ring-1 ring-slate-200/80">
                          Sin web
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="mt-3 text-sm font-medium text-slate-700">{c.email}</p>
                  <p className="mt-1 text-sm text-slate-600">{c.phone ? formatPhoneCL(c.phone) : "Sin teléfono"}</p>
                  <p className="mt-2 text-[11px] leading-snug text-slate-600">
                    {st.open > 0 ? (
                      <>
                        <span className="font-semibold text-slate-800">{st.open}</span> pedido{st.open === 1 ? "" : "s"} abierto
                        {st.open === 1 ? "" : "s"}
                        {st.delayed > 0 ? (
                          <span className="font-semibold text-rose-800"> · {st.delayed} con plazo vencido</span>
                        ) : null}
                        {st.pendiente > 0 ? <span className="text-violet-900"> · {st.pendiente} a aprobar</span> : null}
                      </>
                    ) : (
                      <>Sin pedidos abiertos.</>
                    )}{" "}
                    {st.balanceClp > 0 ? (
                      <span className="block font-medium text-amber-900">Saldo estimado {fmtClp(st.balanceClp)}</span>
                    ) : st.open === 0 ? (
                      <span className="block text-emerald-800/90">Sin saldo pendiente en envíos.</span>
                    ) : null}
                  </p>
                </div>
                <div className="mt-auto border-t border-slate-100 p-4 pt-3">
                  <div className="flex items-center justify-between gap-2">
                    <ContactButtons
                      phone={c.phone}
                      email={c.email}
                      whatsappMessage={`Hola ${c.name}, te escribimos desde el equipo de transporte.`}
                      emailSubject="Contacto desde Transport Pro"
                    />
                    <button
                      type="button"
                      className="btn-danger rounded-lg p-2"
                      onClick={() => setDeleteCustomerId(c.id)}
                      title="Eliminar cliente"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </article>
            );
            })}
          </div>
          {filtered.length === 0 && !q.isLoading ? (
            <p className="py-12 text-center text-sm text-slate-500">No hay clientes que coincidan con la búsqueda.</p>
          ) : null}
        </div>
      </section>

      {perfilCustomerId ? (
        <div
          className={perfilClienteModalShell}
          role="dialog"
          aria-modal="true"
          aria-labelledby="cliente-perfil-modal-title"
          onClick={() => setPerfilCustomerId(null)}
        >
          <div
            className="flex max-h-[min(94vh,760px)] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:max-h-[min(92vh,720px)] sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <ClientePerfilAdminContent
              customerId={perfilCustomerId}
              layout="modal"
              onClose={() => setPerfilCustomerId(null)}
            />
          </div>
        </div>
      ) : null}

      {deleteCustomerId ? (
        <div
          className={clientesModalShell}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-customer-modal-title"
          onClick={() => setDeleteCustomerId(null)}
        >
          <div
            className="flex max-h-[min(40vh,300px)] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
              <div>
                <h2 id="delete-customer-modal-title" className="text-base font-semibold text-slate-900">
                  Eliminar cliente
                </h2>
                <p className="text-xs text-slate-600">Esta acción no se puede deshacer</p>
              </div>
              <button
                type="button"
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                onClick={() => setDeleteCustomerId(null)}
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 px-4 py-4 text-slate-800">
              <p className="text-sm text-slate-700">
                ¿Estás seguro de que quieres eliminar este cliente? También se eliminarán todos sus datos asociados como envíos, facturas y pagos.
              </p>
              {error ? <p className="error mt-3">{error}</p> : null}
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  className="btn-secondary flex-1"
                  onClick={() => setDeleteCustomerId(null)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn-danger flex-1"
                  disabled={deleteCustomer.isPending}
                  onClick={() => deleteCustomer.mutate(deleteCustomerId)}
                >
                  {deleteCustomer.isPending ? "Eliminando…" : "Eliminar cliente"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {createModalOpen ? (
        <div
          className={clientesModalShell}
          role="dialog"
          aria-modal="true"
          aria-labelledby="clientes-modal-nuevo-title"
          onClick={() => {
            setCreateModalOpen(false);
            setError(null);
          }}
        >
          <div
            className="flex max-h-[min(92vh,680px)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
              <div>
                <h2 id="clientes-modal-nuevo-title" className="text-base font-semibold text-slate-900">
                  Alta manual
                </h2>
                <p className="text-xs text-slate-600">Cliente y usuario portal en un solo paso.</p>
              </div>
              <button
                type="button"
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                onClick={() => {
                  setCreateModalOpen(false);
                  setError(null);
                }}
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 text-slate-800 [&_label]:text-slate-700">
              <label className="block text-xs font-medium text-slate-600">Nombre / razón social</label>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="organization"
              />
              <label className="mt-3 block text-xs font-medium text-slate-600">Correo</label>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="cliente@empresa.cl"
                autoComplete="email"
              />
              <label className="mt-3 block text-xs font-medium text-slate-600">Teléfono (opcional)</label>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+56 9 1234 5678"
                inputMode="tel"
              />
              <label className="mt-3 block text-xs font-medium text-slate-600">RUT</label>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={taxId}
                onChange={(e) => setTaxId(e.target.value)}
                placeholder="12345678-9"
                autoComplete="off"
              />
              <label className="mt-3 block text-xs font-medium text-slate-600">Contraseña inicial del portal (mín. 8)</label>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                type="password"
                value={portalPassword}
                onChange={(e) => setPortalPassword(e.target.value)}
                minLength={8}
                autoComplete="new-password"
              />
              <p className="mt-2 text-xs leading-relaxed text-slate-500">
                Es la clave real de ingreso; comunicarla por un canal seguro. El sistema no la renueva solo.
              </p>
              {error ? <p className="error mt-3">{error}</p> : null}
              <button
                type="button"
                className="btn-primary mt-4 w-full"
                disabled={!name || !email || !taxId || portalPassword.length < 8 || create.isPending}
                onClick={() => create.mutate()}
              >
                {create.isPending ? "Creando…" : "Crear cliente"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
