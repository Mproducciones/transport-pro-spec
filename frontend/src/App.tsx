import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

const LoginPage = lazy(() => import("./pages/LoginPage.js").then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import("./pages/RegisterPage.js").then((m) => ({ default: m.RegisterPage })));
const AdminLayout = lazy(() => import("./admin/AdminLayout.js").then((m) => ({ default: m.AdminLayout })));
const DashboardPage = lazy(() => import("./admin/pages/DashboardPage.js").then((m) => ({ default: m.DashboardPage })));
const EnviosAdminPage = lazy(() => import("./admin/pages/EnviosAdminPage.js").then((m) => ({ default: m.EnviosAdminPage })));
const MapaSeguimientoAdminPage = lazy(() =>
  import("./admin/pages/MapaSeguimientoAdminPage.js").then((m) => ({ default: m.MapaSeguimientoAdminPage }))
);
const ClientesAdminPage = lazy(() => import("./admin/pages/ClientesAdminPage.js").then((m) => ({ default: m.ClientesAdminPage })));
const ClientePerfilAdminPage = lazy(() => import("./admin/pages/ClientePerfilAdminPage.js").then((m) => ({ default: m.ClientePerfilAdminPage })));
const FlotaAdminPage = lazy(() => import("./admin/pages/FlotaAdminPage.js").then((m) => ({ default: m.FlotaAdminPage })));
const ChoferesAdminPage = lazy(() => import("./admin/pages/ChoferesAdminPage.js").then((m) => ({ default: m.ChoferesAdminPage })));
const FacturasAdminPage = lazy(() => import("./admin/pages/FacturasAdminPage.js").then((m) => ({ default: m.FacturasAdminPage })));
const PagosAdminPage = lazy(() => import("./admin/pages/PagosAdminPage.js").then((m) => ({ default: m.PagosAdminPage })));
const EgresosAdminPage = lazy(() => import("./admin/pages/EgresosAdminPage.js").then((m) => ({ default: m.EgresosAdminPage })));
const ReportesAdminPage = lazy(() => import("./admin/pages/ReportesAdminPage.js").then((m) => ({ default: m.ReportesAdminPage })));
const AjustesAdminPage = lazy(() => import("./admin/pages/AjustesAdminPage.js").then((m) => ({ default: m.AjustesAdminPage })));
const TarifasAdminPage = lazy(() => import("./admin/pages/TarifasAdminPage.js").then((m) => ({ default: m.TarifasAdminPage })));
const PreciosAdminPage = lazy(() => import("./admin/pages/PreciosAdminPage.js").then((m) => ({ default: m.PreciosAdminPage })));
const AuditoriaAdminPage = lazy(() => import("./admin/pages/AuditoriaAdminPage.js").then((m) => ({ default: m.AuditoriaAdminPage })));
const RentabilidadAdminPage = lazy(() => import("./admin/pages/RentabilidadAdminPage.js").then((m) => ({ default: m.RentabilidadAdminPage })));
const MarketplaceAdminPage = lazy(() => import("./admin/pages/MarketplaceAdminPage.js").then((m) => ({ default: m.MarketplaceAdminPage })));
const SoporteChoferAdminPage = lazy(() => import("./admin/pages/SoporteChoferAdminPage.js").then((m) => ({ default: m.SoporteChoferAdminPage })));
const LiquidacionesChoferesAdminPage = lazy(() => import("./admin/pages/LiquidacionesChoferesAdminPage.js").then((m) => ({ default: m.LiquidacionesChoferesAdminPage })));
const ClienteLayout = lazy(() => import("./cliente/ClienteLayout.js").then((m) => ({ default: m.ClienteLayout })));
const ClienteEnviosPage = lazy(() => import("./cliente/ClienteEnviosPage.js").then((m) => ({ default: m.ClienteEnviosPage })));
const ClienteFacturasPage = lazy(() => import("./cliente/ClienteFacturasPage.js").then((m) => ({ default: m.ClienteFacturasPage })));
const ClientePagosPage = lazy(() => import("./cliente/ClientePagosPage.js").then((m) => ({ default: m.ClientePagosPage })));
const ConductorHome = lazy(() => import("./pages/conductor/ConductorHome.js").then((m) => ({ default: m.ConductorHome })));
const ConductorCuentaPage = lazy(() =>
  import("./pages/conductor/ConductorCuentaPage.js").then((m) => ({ default: m.ConductorCuentaPage }))
);
const OwnerConsolePage = lazy(() => import("./pages/OwnerConsolePage.js").then((m) => ({ default: m.OwnerConsolePage })));

function getStoredRole(): string | null {
  return localStorage.getItem("tp_role");
}

function RequireAuth({
  role,
  children,
}: {
  role: "superadmin" | "admin" | "cliente" | "conductor";
  children: ReactNode;
}) {
  const r = getStoredRole();
  if (!r) return <Navigate to="/login" replace />;
  if (r !== role) return <Navigate to={`/login?reason=role&required=${role}`} replace />;
  return <>{children}</>;
}

/** Rutas del portal cliente compartidas entre /cliente y /client (alias). */
function ClienteRoutes() {
  return (
    <RequireAuth role="cliente">
      <ClienteLayout />
    </RequireAuth>
  );
}

export default function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/registro" element={<RegisterPage />} />

      {/* Consola owner — protegida con clave owner en la propia página */}
      <Route
        path="/owner"
        element={
          <RequireAuth role="superadmin">
            <OwnerConsolePage />
          </RequireAuth>
        }
      />

      {/* Superadmin / owner */}
      <Route path="/superadmin">
        <Route index element={<Navigate to="/superadmin/dashboard" replace />} />
        <Route
          path="dashboard"
          element={<RequireAuth role="superadmin"><OwnerConsolePage /></RequireAuth>}
        />
        <Route
          path="empresas"
          element={<RequireAuth role="superadmin"><OwnerConsolePage /></RequireAuth>}
        />
        <Route
          path="reportes"
          element={<RequireAuth role="superadmin"><OwnerConsolePage /></RequireAuth>}
        />
        <Route
          path="configuracion"
          element={<RequireAuth role="superadmin"><OwnerConsolePage /></RequireAuth>}
        />
      </Route>

      {/* Admin empresa */}
      <Route
        path="/admin"
        element={
          <RequireAuth role="admin">
            <AdminLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="mapa" element={<MapaSeguimientoAdminPage />} />
        <Route path="envios" element={<EnviosAdminPage />} />
        <Route path="viajes" element={<Navigate to="/admin/envios" replace />} />
        <Route path="clientes" element={<ClientesAdminPage />} />
        <Route path="clientes/:id" element={<ClientePerfilAdminPage />} />
        <Route path="flota" element={<FlotaAdminPage />} />
        <Route path="choferes" element={<ChoferesAdminPage />} />
        <Route path="facturas" element={<FacturasAdminPage />} />
        <Route path="pagos" element={<PagosAdminPage />} />
        <Route path="egresos" element={<EgresosAdminPage />} />
        <Route path="precios" element={<PreciosAdminPage />} />
        <Route path="tarifas" element={<TarifasAdminPage />} />
        <Route path="reportes" element={<ReportesAdminPage />} />
        <Route path="auditoria" element={<AuditoriaAdminPage />} />
        <Route path="rentabilidad" element={<RentabilidadAdminPage />} />
        <Route path="marketplace" element={<MarketplaceAdminPage />} />
        <Route path="soporte-choferes" element={<SoporteChoferAdminPage />} />
        <Route path="liquidaciones-choferes" element={<LiquidacionesChoferesAdminPage />} />
        <Route path="ajustes" element={<AjustesAdminPage />} />
        <Route path="configuracion" element={<Navigate to="/admin/ajustes" replace />} />
      </Route>

      {/* Portal cliente — /cliente (canónico) */}
      <Route path="/cliente" element={<ClienteRoutes />}>
        <Route index element={<Navigate to="/cliente/pedidos" replace />} />
        <Route path="pedidos" element={<ClienteEnviosPage />} />
        <Route path="solicitud" element={<ClienteEnviosPage />} />
        <Route path="seguimiento" element={<ClienteEnviosPage />} />
        <Route path="historial" element={<ClienteEnviosPage />} />
        <Route path="facturacion" element={<Navigate to="/cliente/facturas" replace />} />
        <Route path="facturas" element={<ClienteFacturasPage />} />
        <Route path="pagos" element={<ClientePagosPage />} />
      </Route>

      {/* Alias /client → redirige al canónico /cliente */}
      <Route path="/client" element={<Navigate to="/cliente" replace />} />
      <Route path="/client/*" element={<Navigate to="/cliente" replace />} />

      {/* Portal conductor — /driver (canónico) */}
      <Route path="/driver/mis-viajes" element={<Navigate to="/driver/viaje-activo" replace />} />
      <Route
        path="/driver/viaje-activo"
        element={<RequireAuth role="conductor"><ConductorHome /></RequireAuth>}
      />
      <Route
        path="/driver/mapa"
        element={<RequireAuth role="conductor"><ConductorHome /></RequireAuth>}
      />
      <Route
        path="/driver/historial"
        element={<RequireAuth role="conductor"><ConductorHome /></RequireAuth>}
      />
      <Route
        path="/driver/alertas"
        element={<RequireAuth role="conductor"><ConductorHome /></RequireAuth>}
      />
      <Route
        path="/driver/cuenta"
        element={<RequireAuth role="conductor"><ConductorCuentaPage /></RequireAuth>}
      />
      <Route
        path="/driver"
        element={<RequireAuth role="conductor"><Navigate to="/driver/viaje-activo" replace /></RequireAuth>}
      />
      {/* Alias /conductor → redirige al canónico /driver */}
      <Route
        path="/conductor/*"
        element={<RequireAuth role="conductor"><Navigate to="/driver/viaje-activo" replace /></RequireAuth>}
      />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Suspense>
  );
}

function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 text-sm text-slate-600">
      Cargando…
    </div>
  );
}
