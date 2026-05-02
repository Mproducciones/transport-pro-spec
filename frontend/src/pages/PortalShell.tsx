import { AlertTriangle, Clock, Home, KeyRound, LogOut, Map } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { setToken } from "../api/client.js";
import { ToastHost } from "../components/common/ToastHost.js";

export function PortalShell({
  title,
  basePath,
  children,
}: {
  title: string;
  basePath: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const location = useLocation();

  function logout() {
    setToken(null);
    localStorage.removeItem("tp_role");
    localStorage.removeItem("tp_slug");
    window.location.href = "/login";
  }

  function goInicio() {
    const scrollMain = () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
      document.getElementById("viajes")?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    if (location.pathname !== basePath) {
      navigate(basePath, { replace: false, state: {} });
      window.setTimeout(scrollMain, 120);
    } else {
      scrollMain();
    }
  }

  const navLinks = [
    { to: "/driver/viaje-activo", label: "Viaje activo", icon: Home },
    { to: "/driver/mapa", label: "Mapa", icon: Map },
    { to: "/driver/historial", label: "Historial", icon: Clock },
    { to: "/driver/alertas", label: "Alertas", icon: AlertTriangle },
    { to: "/driver/cuenta", label: "Cuenta", icon: KeyRound },
  ];

  return (
    <div className="min-h-screen bg-green-50">
      <header className="flex items-center justify-between border-b border-green-700 bg-green-700 px-4 py-3 text-green-50">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded bg-green-900 font-bold">
            CH
          </span>
          <div>
            <div className="text-sm font-semibold">{title}</div>
            <div className="text-xs text-green-100/80">Transport Pro · Chofer</div>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded bg-green-800 px-2 py-1 text-xs hover:bg-green-900"
            onClick={goInicio}
          >
            <Home size={15} />
            <span className="hidden sm:inline">Inicio</span>
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded bg-green-800 px-2 py-1 text-xs hover:bg-green-900"
            onClick={logout}
          >
            <LogOut size={15} />
            <span className="hidden sm:inline">Salir</span>
          </button>
        </div>
      </header>

      <nav
        className="hidden border-b border-green-200 bg-white px-4 py-2 shadow-sm md:block"
        aria-label="Navegación principal chofer"
      >
        <div className="mx-auto flex max-w-6xl flex-wrap gap-2">
          {navLinks.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                location.pathname === to
                  ? "bg-green-700 text-white"
                  : "text-slate-700 hover:bg-green-50 hover:text-green-900"
              }`}
            >
              <Icon size={16} />
              {label}
            </Link>
          ))}
        </div>
      </nav>

      <div className="mx-auto max-w-6xl p-3 pb-24 md:p-6">{children}</div>

      <ToastHost />

      {/* Barra inferior móvil con íconos SVG (sin emojis) */}
      <nav
        className="fixed inset-x-0 bottom-0 z-50 flex border-t border-green-800 bg-green-700 text-green-50 md:hidden"
        aria-label="Navegación principal"
      >
        {navLinks.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] transition-colors hover:bg-green-800 ${
              location.pathname === to ? "bg-green-800 font-semibold" : ""
            }`}
          >
            <Icon size={16} />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
