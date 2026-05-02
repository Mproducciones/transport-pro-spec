import { Navigate } from "react-router-dom";

/** Ruta legada: todo el flujo vive en Precios y tarifas. */
export function TarifasAdminPage() {
  return <Navigate to="/admin/precios" replace />;
}
