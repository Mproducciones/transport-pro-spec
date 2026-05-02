import {
  Building2,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  Search,
  Settings,
  Wallet,
} from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiGet, setToken } from "../api/client.js";
import { ToastHost } from "../components/common/ToastHost.js";
import { AdminPrivacyProvider } from "./AdminPrivacyContext.js";
import { ADMIN_NAV_GROUP_LABELS, ADMIN_NAV_ITEMS, type AdminNavGroup } from "./adminNavConfig.js";
import { ADMIN_NAV_ICONS } from "./adminNavIcons.js";
import { AdminCommandPalette } from "./AdminCommandPalette.js";
import { AdminShipmentAlertsBell } from "./AdminShipmentAlertsBell.js";
import { useDriverMessageSoundAlerts } from "./useDriverMessageSoundAlerts.js";
import { unlockDriverMessageAudio } from "../lib/driverMessageAlerts.js";

type DashboardAlert = {
  comprobantesPendientes: { hoy: { total: number } };
};

const NAV_GROUPS: AdminNavGroup[] = ["operacion", "cobranza", "analisis", "ajustes"];

const MAIN_NAV_ITEMS = ADMIN_NAV_ITEMS.filter((l) => !l.omitFromMainNav);
const MINIMAL_SIDEBAR_ROUTES = new Set([
  "/admin/dashboard",
  "/admin/clientes",
  "/admin/envios",
  "/admin/pagos",
  "/admin/ajustes",
]);
const SIDEBAR_ITEMS = MAIN_NAV_ITEMS.filter((l) => MINIMAL_SIDEBAR_ROUTES.has(l.to));

function AdminLayoutShell() {
  useDriverMessageSoundAlerts();
  /** Primer clic en el admin desbloquea el audio del navegador (política autoplay) para el beep de mensajes. */
  useEffect(() => {
    const once = () => {
      void unlockDriverMessageAudio();
      document.removeEventListener("pointerdown", once, true);
    };
    document.addEventListener("pointerdown", once, { capture: true });
    return () => document.removeEventListener("pointerdown", once, { capture: true });
  }, []);
  const navigate = useNavigate();
  const { pathname: adminPathname } = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("tp_admin_sidebar") === "collapsed"
  );
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCommandPaletteOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /** Al ir a otra sección (p. ej. Envíos) desde la barra inferior, cerrar el panel "Más" móvil. */
  useEffect(() => {
    setMobileMoreOpen(false);
  }, [adminPathname]);

  const { data: dashData } = useQuery<DashboardAlert>({
    queryKey: ["admin-dashboard-alert"],
    queryFn: () => apiGet<DashboardAlert>("/reports/dashboard"),
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  const comprobantesPendientes = dashData?.comprobantesPendientes?.hoy?.total ?? 0;

  function toggleSidebar() {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    localStorage.setItem("tp_admin_sidebar", next ? "collapsed" : "expanded");
  }

  function logout() {
    setToken(null);
    localStorage.removeItem("tp_role");
    localStorage.removeItem("tp_slug");
    window.location.href = "/login";
  }

  return (
    <div className="admin-app relative min-h-screen bg-[var(--tp-surface)] text-slate-900 md:flex">
      <aside
        className={`admin-sidebar hidden md:flex md:flex-col text-slate-200 ${
          sidebarCollapsed ? "md:w-20" : "md:w-72"
        } transition-all duration-200`}
      >
        <button
          type="button"
          className="m-3 self-end rounded bg-slate-700/50 p-1 hover:bg-slate-600"
          onClick={toggleSidebar}
          title={sidebarCollapsed ? "Expandir menú" : "Colapsar menú"}
        >
          {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
        <div className="px-4 pb-4">
          {!sidebarCollapsed && (
            <>
              <p className="text-xs uppercase tracking-wider text-slate-400">Administrador</p>
              <h1 className="mt-1 text-lg font-semibold">Transport Pro</h1>
            </>
          )}
          {sidebarCollapsed && (
            <h1 className="text-lg font-semibold text-center">TP</h1>
          )}
        </div>

        {!sidebarCollapsed && comprobantesPendientes > 0 && (
          <button
            type="button"
            onClick={() => navigate("/admin/pagos")}
            className="mx-3 mb-3 flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-xs font-medium text-white hover:bg-amber-400"
          >
            <Wallet size={14} className="shrink-0" />
            <span>
              {comprobantesPendientes} comprobante{comprobantesPendientes > 1 ? "s" : ""} por revisar
            </span>
          </button>
        )}

        <nav className="flex-1 space-y-3 overflow-y-auto px-3">
          {NAV_GROUPS.map((group) => {
            const groupLinks = SIDEBAR_ITEMS.filter((l) => l.group === group);
            if (groupLinks.length === 0) return null;
            return (
            <div key={group} className="space-y-1">
              {!sidebarCollapsed ? (
                <p className="px-3 pt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {ADMIN_NAV_GROUP_LABELS[group]}
                </p>
              ) : null}
              {groupLinks.map((l) => {
                const Icon = ADMIN_NAV_ICONS[l.iconKey];
                const badge =
                  l.alertKey === "pagos" && comprobantesPendientes > 0 ? comprobantesPendientes : 0;
                return (
                  <NavLink
                    key={l.to}
                    to={l.to}
                    end={l.end}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                        isActive ? "bg-blue-600 text-white shadow" : "hover:bg-white/10"
                      }`
                    }
                  >
                    <Icon size={17} />
                    {!sidebarCollapsed && <span className="flex-1">{l.label}</span>}
                    {!sidebarCollapsed && badge > 0 && (
                      <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                        {badge > 9 ? "9+" : badge}
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
          className="m-3 rounded-lg bg-slate-700 px-3 py-2 text-sm hover:bg-slate-600"
          onClick={logout}
        >
          <span className="inline-flex items-center gap-2">
            <LogOut size={15} />
            {!sidebarCollapsed && "Cerrar sesión"}
          </span>
        </button>
      </aside>

      <main className="flex-1 mobile-spacing pb-24 pt-3 md:p-6 md:pt-6 md:pb-6 md:pb-6">
        <Outlet />
      </main>

      <div
        className="pointer-events-auto fixed right-3 z-[100] flex items-center gap-2 max-md:bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] md:bottom-6"
        aria-label="Atajos: búsqueda y alertas"
      >
        <button
          type="button"
          onClick={() => setCommandPaletteOpen(true)}
          className="btn-mobile flex items-center gap-2 rounded-lg border border-slate-600/80 bg-slate-800/90 px-3 py-2.5 text-xs font-medium text-slate-100 shadow-sm hover:bg-slate-700 active:scale-95 transition-all duration-150 md:px-3 md:py-1.5"
          title="Buscar o decir qué necesitás; te llevamos a la pantalla (Ctrl o ⌘ + K)"
        >
          <Search size={16} className="shrink-0 opacity-90 sm:size-15" aria-hidden />
          <span className="hidden sm:inline">Buscar</span>
          <kbd className="hidden rounded border border-slate-500/80 bg-slate-900/80 px-1.5 py-0.5 font-mono text-[10px] text-slate-300 md:inline md:px-1">
            {typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.userAgent) ? "⌘K" : "Ctrl+K"}
          </kbd>
        </button>
        <AdminShipmentAlertsBell />
      </div>

      <AdminCommandPalette open={commandPaletteOpen} onRequestClose={() => setCommandPaletteOpen(false)} />

      <ToastHost />

      {mobileMoreOpen ? (
        <div className="fixed inset-x-3 bottom-16 z-50 max-h-[min(72vh,520px)] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-950 p-3 text-slate-100 shadow-2xl md:hidden">
          <p className="mb-2 px-2 text-xs font-medium text-slate-300">Accesos esenciales</p>
          <div className="space-y-3">
            {NAV_GROUPS.map((group) => {
              const items = SIDEBAR_ITEMS.filter(
                (l) => l.group === group && !l.mobileDockOnly
              );
              if (items.length === 0) return null;
              return (
                <div key={group}>
                  <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    {ADMIN_NAV_GROUP_LABELS[group]}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {items.map((l) => (
                      <Link
                        key={l.to}
                        to={l.to}
                        className="rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/15"
                        onClick={() => setMobileMoreOpen(false)}
                      >
                        {l.label}
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
            <button
              type="button"
              className="w-full rounded-lg bg-rose-500/90 px-3 py-2 text-left text-sm font-semibold text-white hover:bg-rose-500"
              onClick={logout}
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      ) : null}

      <nav className="fixed inset-x-0 bottom-0 z-50 flex border-t border-slate-700 bg-[#0b1c3a] text-slate-200 md:hidden">
        <NavLink
          to="/admin/dashboard"
          end
          onClick={() => setMobileMoreOpen(false)}
          className={({ isActive }) =>
            `nav-item flex flex-1 flex-col items-center text-xs hover:bg-slate-700/50 ${isActive ? "bg-blue-600/40 text-white" : ""}`
          }
        >
          <LayoutDashboard size={18} />
          <span className="mt-1">Inicio</span>
        </NavLink>
        <NavLink
          to="/admin/clientes"
          onClick={() => setMobileMoreOpen(false)}
          className={({ isActive }) =>
            `nav-item flex flex-1 flex-col items-center text-xs hover:bg-slate-700/50 ${isActive ? "bg-blue-600/40 text-white" : ""}`
          }
        >
          <Building2 size={18} />
          <span className="mt-1">Clientes</span>
        </NavLink>
        <NavLink
          to="/admin/pagos"
          onClick={() => setMobileMoreOpen(false)}
          className={({ isActive }) =>
            `relative nav-item flex flex-1 flex-col items-center text-xs hover:bg-slate-700/50 ${isActive ? "bg-blue-600/40 text-white" : ""}`
          }
        >
          <span className="relative">
            <Wallet size={18} />
            {comprobantesPendientes > 0 && (
              <span className="absolute -right-2 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold leading-none text-white">
                {comprobantesPendientes > 9 ? "9+" : comprobantesPendientes}
              </span>
            )}
          </span>
          <span className="mt-1">Pagos</span>
        </NavLink>
        <button
          type="button"
          onClick={() => setMobileMoreOpen((open) => !open)}
          className={`nav-item flex flex-1 flex-col items-center text-xs hover:bg-slate-700/50 ${
            mobileMoreOpen ? "bg-blue-600/40 text-white" : ""
          }`}
        >
          <Settings size={18} />
          <span className="mt-1">Más</span>
        </button>
      </nav>
    </div>
  );
}

export function AdminLayout() {
  return (
    <AdminPrivacyProvider>
      <AdminLayoutShell />
    </AdminPrivacyProvider>
  );
}
