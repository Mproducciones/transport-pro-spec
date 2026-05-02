/**
 * Fuente única de verdad para el menú del portal cliente (escritorio, móvil, índice en Pedidos).
 */
export type ClienteNavGroup = "pedidos" | "cuenta";

export type ClienteNavIconKey =
  | "LayoutDashboard"
  | "Package"
  | "Map"
  | "History"
  | "Receipt"
  | "CreditCard"
  | "LifeBuoy";

export type ClienteNavItem = {
  to: string;
  label: string;
  group: ClienteNavGroup;
  /** Texto para buscador y auditorías de producto. */
  description: string;
  iconKey: ClienteNavIconKey;
  end?: boolean;
  /** Entrada principal en sidebar (Pedidos, Facturas, Pagos). */
  primary?: boolean;
  alertKey?: "pagos";
  /** Ya está en la barra inferior móvil; no repetir en el modal "Más". */
  mobileDockOnly?: boolean;
  /** mailto u otro destino fuera del router. */
  external?: boolean;
};

export const CLIENTE_NAV_GROUP_LABELS: Record<ClienteNavGroup, string> = {
  pedidos: "Mis pedidos y seguimiento",
  cuenta: "Facturación y pagos",
};

/** Rutas que comparten la misma sección "Pedidos" (resumen, mapa, historial, soporte). */
export function isClientePedidosSection(pathname: string): boolean {
  return (
    pathname === "/cliente/pedidos" ||
    pathname === "/cliente/solicitud" ||
    pathname === "/cliente/seguimiento" ||
    pathname === "/cliente/historial"
  );
}

/**
 * En móvil, el tablist de Pedidos ya enlaza a estas rutas; no repetirlas en el modal "Más".
 */
export const CLIENTE_MOBILE_PEDIDOS_TAB_DUPLICATES = new Set<string>([
  "/cliente/pedidos?vista=envios",
  "/cliente/seguimiento",
  "/cliente/historial",
]);

export function showInClienteMobileMore(pathname: string, item: ClienteNavItem): boolean {
  if (item.mobileDockOnly) return false;
  // En móvil, "Más" debe mostrar solo acciones secundarias (ej: soporte), no repetir navegación de pedidos.
  if (item.group === "pedidos" && !item.external) return false;
  if (isClientePedidosSection(pathname) && CLIENTE_MOBILE_PEDIDOS_TAB_DUPLICATES.has(item.to)) return false;
  return true;
}

/** Orden = orden en sidebar e índice. */
export const CLIENTE_NAV_ITEMS: ClienteNavItem[] = [
  {
    to: "/cliente/pedidos",
    label: "Pedidos",
    group: "pedidos",
    description: "Resumen operativo y estado de pedidos activos",
    iconKey: "LayoutDashboard",
    end: true,
    primary: true,
    mobileDockOnly: true,
  },
  {
    to: "/cliente/solicitud",
    label: "Nueva solicitud",
    group: "pedidos",
    description: "Formulario guiado para crear un envío nuevo",
    iconKey: "Package",
    primary: true,
    mobileDockOnly: true,
  },
  {
    to: "/cliente/pedidos?vista=envios",
    label: "En curso",
    group: "pedidos",
    description: "Listado de envíos activos (no entregados ni rechazados)",
    iconKey: "Package",
  },
  {
    to: "/cliente/seguimiento",
    label: "Mapa",
    group: "pedidos",
    description: "Seguimiento en mapa y detalle del envío",
    iconKey: "Map",
  },
  {
    to: "/cliente/historial",
    label: "Historial",
    group: "pedidos",
    description: "Todos los pedidos, incluidos entregados y cerrados",
    iconKey: "History",
  },
  {
    to: "mailto:soporte@transportpro.local?subject=Soporte%20cliente",
    label: "Escribir a soporte",
    group: "pedidos",
    description: "Contacto por correo ante dudas o incidencias",
    iconKey: "LifeBuoy",
    external: true,
  },
  {
    to: "/cliente/facturas",
    label: "Facturas",
    group: "cuenta",
    description: "Documentos emitidos, saldos y descarga",
    iconKey: "Receipt",
    primary: true,
    mobileDockOnly: true,
  },
  {
    to: "/cliente/pagos",
    label: "Pagos",
    group: "cuenta",
    description: "Comprobantes, estados de validación y reenvío",
    iconKey: "CreditCard",
    primary: true,
    alertKey: "pagos",
    mobileDockOnly: true,
  },
];
