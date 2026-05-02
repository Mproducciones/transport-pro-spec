import { BellRing, ChevronLeft, ChevronRight, CreditCard, LogOut, Menu, Package, Receipt } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiGet, setToken } from "../api/client.js";
import { ToastHost } from "../components/common/ToastHost.js";
import { notify } from "../lib/notify.js";
import {
  CLIENTE_NAV_GROUP_LABELS,
  CLIENTE_NAV_ITEMS,
  isClientePedidosSection,
  showInClienteMobileMore,
  type ClienteNavGroup,
} from "./clienteNavConfig.js";
import { CLIENTE_NAV_ICONS } from "./clienteNavIcons.js";

type PaymentRow = { id: string; verificationStatus?: string | null };
type ShipmentAlertRow = {
  id: string;
  status: string;
  origin: string;
  destination: string;
  paymentTerm?: "upfront_full" | "upfront_partial" | "delivery" | null;
  balanceAmount?: string | number | null;
};
type InvoiceAlertRow = { id: string; number: string; status: string; issueDate?: string | null };

const NAV_GROUPS: ClienteNavGroup[] = ["pedidos", "cuenta"];
const DOCS_SEEN_STORAGE_KEY = "tp_cliente_docs_seen_v1";

function loadSeenDocIds(): Set<string> {
  try {
    const raw = sessionStorage.getItem(DOCS_SEEN_STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    return new Set(Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

function saveSeenDocIds(ids: Set<string>) {
  try {
    sessionStorage.setItem(DOCS_SEEN_STORAGE_KEY, JSON.stringify([...ids].slice(-300)));
  } catch {
    /* ignore */
  }
}

export function ClienteLayout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("tp_cliente_sidebar") === "collapsed"
  );
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const alertsRef = useRef<HTMLDivElement | null>(null);
  const [seenDocIds, setSeenDocIds] = useState<Set<string>>(loadSeenDocIds);

  const { data: payments } = useQuery<PaymentRow[]>({
    queryKey: ["payments", "cliente"],
    queryFn: () => apiGet<PaymentRow[]>("/payments"),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const { data: shipmentAlerts } = useQuery<ShipmentAlertRow[]>({
    queryKey: ["cliente-shipments-alert"],
    queryFn: () => apiGet<ShipmentAlertRow[]>("/shipments"),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
  const { data: invoices } = useQuery<InvoiceAlertRow[]>({
    queryKey: ["invoices", "cliente"],
    queryFn: () => apiGet<InvoiceAlertRow[]>("/invoices"),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const pagosRechazados = (payments ?? []).filter((p) => p.verificationStatus === "rechazado").length;
  const pedidosRechazados = (shipmentAlerts ?? []).filter((s) => s.status === "rechazado").length;
  const pagosPorRealizar = (shipmentAlerts ?? []).filter((s) => {
    if (s.status !== "confirmado") return false;
    if (!s.paymentTerm || s.paymentTerm === "delivery") return false;
    const balance = Number(s.balanceAmount ?? 0);
    return Number.isFinite(balance) && balance > 0;
  }).length;
  const invoiceAlerts = (invoices ?? []).filter((inv) => inv.status !== "borrador" && inv.status !== "anulada");
  const documentosSinRevisar = invoiceAlerts.filter((inv) => !seenDocIds.has(inv.id)).length;
  const alertsCount = pagosRechazados + pedidosRechazados + pagosPorRealizar + documentosSinRevisar;
  const canUseBrowserNotifications = typeof window !== "undefined" && "Notification" in window;
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | "unsupported">(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
    return Notification.permission;
  });

  function shipmentStatusNotice(shipment: ShipmentAlertRow): string | null {
    if (shipment.status === "rechazado") return "Tu pedido fue rechazado por la empresa.";
    if (
      shipment.status === "confirmado" &&
      shipment.paymentTerm !== "delivery" &&
      Number(shipment.balanceAmount ?? 0) > 0
    ) {
      return "Tu solicitud fue aprobada y requiere pago para continuar.";
    }
    return null;
  }

  async function enableBrowserNotifications() {
    if (!canUseBrowserNotifications || notifPermission !== "default") return;
    const permission = await Notification.requestPermission();
    setNotifPermission(permission);
    if (permission === "granted") {
      notify("success", "Notificaciones activadas. Te avisaremos cuando cambie el estado de tus pedidos.");
    }
  }

  useEffect(() => {
    if (!shipmentAlerts?.length) return;
    const key = "tp_cliente_shipment_status_snapshot";
    const prevRaw = localStorage.getItem(key);
    const prev = prevRaw ? (JSON.parse(prevRaw) as Record<string, string>) : {};
    const next: Record<string, string> = {};
    for (const s of shipmentAlerts) {
      next[s.id] = s.status;
      const old = prev[s.id];
      if (!old || old === s.status) continue;
      const message = shipmentStatusNotice(s);
      if (!message) continue;
      const route = `${s.origin} → ${s.destination}`;
      notify("info", `${message} (${route})`);
      if (canUseBrowserNotifications && notifPermission === "granted") {
        new Notification("Transport Pro · Actualización de pedido", {
          body: `${message} ${route}`,
        });
      }
    }
    localStorage.setItem(key, JSON.stringify(next));
  }, [shipmentAlerts, canUseBrowserNotifications, notifPermission]);

  useEffect(() => {
    if (!invoiceAlerts.length) return;
    const key = "tp_cliente_invoice_alert_snapshot";
    const prevRaw = localStorage.getItem(key);
    const prev = prevRaw ? (JSON.parse(prevRaw) as Record<string, string>) : {};
    const next: Record<string, string> = {};
    for (const inv of invoiceAlerts) {
      next[inv.id] = inv.status;
      if (!prev[inv.id]) {
        const message = `Nuevo documento emitido: ${inv.number}.`;
        notify("info", message);
        if (canUseBrowserNotifications && notifPermission === "granted") {
          new Notification("Transport Pro · Documento disponible", { body: message });
        }
      }
    }
    localStorage.setItem(key, JSON.stringify(next));
  }, [invoiceAlerts, canUseBrowserNotifications, notifPermission]);

  useEffect(() => {
    if (!alertsOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (alertsRef.current && !alertsRef.current.contains(e.target as Node)) {
        setAlertsOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [alertsOpen]);

  useEffect(() => {
    if (!alertsOpen || invoiceAlerts.length === 0) return;
    setSeenDocIds((prev) => {
      const next = new Set(prev);
      for (const inv of invoiceAlerts) next.add(inv.id);
      saveSeenDocIds(next);
      return next;
    });
  }, [alertsOpen, invoiceAlerts]);

  /** Al cambiar de pestaña inferior (p. ej. de Más a Pedidos), colapsar el panel "Más" móvil. */
  useEffect(() => {
    setMobileMoreOpen(false);
  }, [pathname]);

  function toggleSidebar() {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    localStorage.setItem("tp_cliente_sidebar", next ? "collapsed" : "expanded");
  }

  function logout() {
    setToken(null);
    localStorage.removeItem("tp_role");
    localStorage.removeItem("tp_slug");
    window.location.href = "/login";
  }

  const pedidosNavActive = isClientePedidosSection(pathname);

  return (
    <div className="min-h-screen bg-orange-50 text-slate-900 md:flex">
      {/* Sidebar desktop */}
      <aside
        className={`hidden md:flex md:flex-col bg-[#1a0a00] text-orange-50 ${
          sidebarCollapsed ? "md:w-20" : "md:w-64"
        } transition-all duration-200`}
      >
        <button
          type="button"
          className="m-3 self-end rounded bg-orange-900/60 p-1 hover:bg-orange-800"
          onClick={toggleSidebar}
          title={sidebarCollapsed ? "Expandir menú" : "Colapsar menú"}
        >
          {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>

        <div className="px-4 pb-4">
          <p className="text-xs uppercase tracking-wider text-orange-300/70">Portal cliente</p>
          {!sidebarCollapsed && (
            <h1 className="mt-1 text-base font-semibold leading-tight">Transport Pro</h1>
          )}
        </div>

        <nav className="flex-1 space-y-3 overflow-y-auto px-3">
          {NAV_GROUPS.map((group) => {
            const items = CLIENTE_NAV_ITEMS.filter((l) => l.group === group && l.primary);
            if (items.length === 0) return null;
            return (
              <div key={group} className="space-y-1">
                {!sidebarCollapsed ? (
                  <p className="px-3 pt-1 text-[10px] font-semibold uppercase tracking-wider text-orange-300/60">
                    {CLIENTE_NAV_GROUP_LABELS[group]}
                  </p>
                ) : null}
                {items.map((l) => {
                  const Icon = CLIENTE_NAV_ICONS[l.iconKey];
                  const isPedidos = l.to === "/cliente/pedidos";
                  const badge =
                    l.alertKey === "pagos" && pagosRechazados > 0
                      ? pagosRechazados
                      : l.alertKey === "pagos" && pagosPorRealizar > 0
                        ? pagosPorRealizar
                        : 0;
                  const badgeIsUrgent = l.alertKey === "pagos" && pagosRechazados > 0;
                  return (
                    <NavLink
                      key={l.to}
                      to={l.to}
                      end={l.end}
                      className={({ isActive }) => {
                        const active = isPedidos ? isActive || pedidosNavActive : isActive;
                        return `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                          active ? "bg-orange-600 text-white" : "hover:bg-white/10"
                        }`;
                      }}
                    >
                      <Icon size={18} />
                      {!sidebarCollapsed && <span className="flex-1">{l.label}</span>}
                      {!sidebarCollapsed && badge > 0 && l.alertKey === "pagos" && (
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none text-white ${
                            badgeIsUrgent ? "bg-red-500" : "bg-amber-500"
                          }`}
                        >
                          {badge}
                        </span>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <button
          type="button"
          className="m-3 rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/20"
          onClick={logout}
        >
          <span className="inline-flex items-center gap-2">
            <LogOut size={16} />
            {!sidebarCollapsed && "Cerrar sesión"}
          </span>
        </button>
      </aside>

      {/* Contenido principal */}
      <div className="flex flex-1 flex-col">
        {canUseBrowserNotifications && notifPermission === "default" ? (
          <div className="flex items-center justify-between gap-3 bg-blue-600 px-4 py-2 text-sm text-white">
            <span>Activá notificaciones para enterarte cuando un pedido cambie de estado (confirmado, en tránsito, entregado o rechazado).</span>
            <button
              type="button"
              onClick={() => void enableBrowserNotifications()}
              className="shrink-0 rounded bg-white/20 px-3 py-1 text-xs font-semibold hover:bg-white/30"
            >
              Activar
            </button>
          </div>
        ) : null}
        {alertsCount > 0 ? (
          <div ref={alertsRef} className="fixed bottom-20 right-4 z-40 md:bottom-6 md:right-6">
            <button
              type="button"
              aria-label="Abrir alertas de pagos"
              onClick={() => setAlertsOpen((v) => !v)}
              className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-lg transition hover:bg-orange-50"
            >
              <span className="relative inline-flex">
                <BellRing size={16} className="text-orange-700" />
                <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold leading-none text-white">
                  {alertsCount}
                </span>
              </span>
              Alertas
            </button>
            {alertsOpen ? (
              <div className="mt-2 w-[min(92vw,20rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
                <div className="border-b border-slate-100 px-3 py-2">
                  <p className="text-xs font-semibold text-slate-900">Alertas</p>
                  <p className="text-[11px] text-slate-500">Tocá una alerta para abrir el control correspondiente.</p>
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {pagosRechazados > 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        setAlertsOpen(false);
                        navigate("/cliente/pagos?estado=rechazado");
                      }}
                      className="block w-full border-b border-slate-100 px-3 py-2.5 text-left hover:bg-slate-50"
                    >
                      <p className="text-xs font-semibold text-rose-700">{pagosRechazados} pago{pagosRechazados === 1 ? "" : "s"} rechazado{pagosRechazados === 1 ? "" : "s"}</p>
                      <p className="mt-0.5 text-[11px] text-slate-600">Requieren reenviar comprobante.</p>
                    </button>
                  ) : null}
                  {pedidosRechazados > 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        setAlertsOpen(false);
                        navigate("/cliente/historial?estado=rechazado");
                      }}
                      className="block w-full border-b border-slate-100 px-3 py-2.5 text-left hover:bg-slate-50"
                    >
                      <p className="text-xs font-semibold text-rose-700">
                        {pedidosRechazados} pedido{pedidosRechazados === 1 ? "" : "s"} rechazado{pedidosRechazados === 1 ? "" : "s"}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-600">Revisá el estado y la nota del rechazo.</p>
                    </button>
                  ) : null}
                  {pagosPorRealizar > 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        setAlertsOpen(false);
                        navigate("/cliente/pagos");
                      }}
                      className="block w-full border-b border-slate-100 px-3 py-2.5 text-left hover:bg-slate-50"
                    >
                      <p className="text-xs font-semibold text-blue-700">
                        {pagosPorRealizar} pedido{pagosPorRealizar === 1 ? "" : "s"} aprobado{pagosPorRealizar === 1 ? "" : "s"} para pagar
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-600">Pago parcial/total requerido. Contraentrega no genera alerta.</p>
                    </button>
                  ) : null}
                  {documentosSinRevisar > 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        setAlertsOpen(false);
                        navigate("/cliente/facturas");
                      }}
                      className="block w-full border-t border-slate-100 px-3 py-2.5 text-left hover:bg-slate-50"
                    >
                      <p className="text-xs font-semibold text-blue-700">
                        {documentosSinRevisar} documento{documentosSinRevisar === 1 ? "" : "s"} nuevo{documentosSinRevisar === 1 ? "" : "s"} (factura/guía)
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-600">Solicitud aprobada/documento emitido. Revisá en Facturas.</p>
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <main className="flex-1 p-3 pb-24 md:p-6">
          <Outlet />
        </main>
      </div>

      {mobileMoreOpen ? (
        <div className="fixed inset-x-3 bottom-16 z-50 max-h-[min(72vh,520px)] overflow-y-auto rounded-2xl border border-orange-900 bg-[#1a0a00] p-3 text-orange-50 shadow-2xl md:hidden">
          <p className="mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-orange-300/80">Más</p>
          {pedidosNavActive ? (
            <p className="mb-2 px-2 text-[11px] leading-snug text-orange-200/80">
              En curso, mapa e historial están en las pestañas de arriba. Acá: soporte y cerrar sesión.
            </p>
          ) : (
            <p className="mb-2 px-2 text-[11px] leading-snug text-orange-200/80">
              Seguimiento de pedidos, soporte y cerrar sesión.
            </p>
          )}
          <div className="space-y-3">
            {NAV_GROUPS.map((group) => {
              const items = CLIENTE_NAV_ITEMS.filter((l) => l.group === group && showInClienteMobileMore(pathname, l));
              if (items.length === 0) return null;
              return (
                <div key={group}>
                  <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-orange-400/70">
                    {CLIENTE_NAV_GROUP_LABELS[group]}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {items.map((l) =>
                      l.external ? (
                        <a
                          key={l.to}
                          href={l.to}
                          className="rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/15"
                          onClick={() => setMobileMoreOpen(false)}
                        >
                          {l.label}
                        </a>
                      ) : (
                        <Link
                          key={l.to}
                          to={l.to}
                          className="rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/15"
                          onClick={() => setMobileMoreOpen(false)}
                        >
                          {l.label}
                        </Link>
                      )
                    )}
                  </div>
                </div>
              );
            })}
            <button
              type="button"
              className="w-full rounded-lg bg-rose-600/90 px-3 py-2 text-left text-sm font-semibold text-white hover:bg-rose-600"
              onClick={() => {
                setMobileMoreOpen(false);
                logout();
              }}
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      ) : null}

      <nav className="fixed inset-x-0 bottom-0 z-50 flex border-t border-orange-700 bg-[#1a0a00] text-orange-50 md:hidden">
        <NavLink
          to="/cliente/pedidos"
          end
          onClick={() => setMobileMoreOpen(false)}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center py-2 text-[11px] hover:bg-orange-900/40 ${
              isActive || pedidosNavActive ? "bg-orange-600/35 text-white" : ""
            }`
          }
        >
          <Package size={16} />
          <span>Pedidos</span>
        </NavLink>
        <NavLink
          to="/cliente/facturas"
          onClick={() => setMobileMoreOpen(false)}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center py-2 text-[11px] hover:bg-orange-900/40 ${isActive ? "bg-orange-600/35 text-white" : ""}`
          }
        >
          <Receipt size={16} />
          <span>Facturas</span>
        </NavLink>
        <NavLink
          to="/cliente/pagos"
          onClick={() => setMobileMoreOpen(false)}
          className={({ isActive }) =>
            `relative flex flex-1 flex-col items-center py-2 text-[11px] hover:bg-orange-900/40 ${isActive ? "bg-orange-600/35 text-white" : ""}`
          }
        >
          <span className="relative">
            <CreditCard size={16} />
            {pagosRechazados > 0 && (
              <span className="absolute -right-1.5 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 text-[8px] font-bold leading-none text-white">
                {pagosRechazados}
              </span>
            )}
          </span>
          <span>Pagos</span>
        </NavLink>
        <button
          type="button"
          onClick={() => setMobileMoreOpen((open) => !open)}
          className={`flex flex-1 flex-col items-center py-2 text-[11px] hover:bg-orange-900/40 ${
            mobileMoreOpen ? "bg-orange-600/35 text-white" : ""
          }`}
        >
          <Menu size={16} />
          <span>Más</span>
        </button>
      </nav>

      <ToastHost />
    </div>
  );
}
