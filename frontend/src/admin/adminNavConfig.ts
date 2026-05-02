/**
 * Fuente única de verdad para el menú admin (escritorio y móvil "Más").
 * Evita duplicar rutas y permite filtrar / ampliar sin tocar cada página.
 */
export type AdminNavGroup = "operacion" | "cobranza" | "analisis" | "ajustes";

export type AdminNavIconKey =
  | "LayoutDashboard"
  | "Truck"
  | "Map"
  | "Car"
  | "UsersRound"
  | "MessageCircle"
  | "Building2"
  | "FileText"
  | "Wallet"
  | "ReceiptText"
  | "PiggyBank"
  | "BarChart3"
  | "ShieldCheck"
  | "TrendingUp"
  | "BadgeDollarSign"
  | "Settings";

export type AdminNavItem = {
  to: string;
  label: string;
  group: AdminNavGroup;
  /** Subtítulo en el menú (y referencia de producto). */
  description: string;
  iconKey: AdminNavIconKey;
  /** Enlace activo exacto solo en esta ruta (ej. /admin/dashboard). */
  end?: boolean;
  /** Badge de comprobantes pendientes (clave interna). */
  alertKey?: "pagos";
  /** Ya está en la barra inferior móvil; no repetir en el modal "Más". */
  mobileDockOnly?: boolean;
  /**
   * No listar en sidebar ni en «Más» móvil: el flujo principal está en Inicio (KPI, mapa, atajos).
   * La ruta sigue valiendo por URL, paleta Buscar (⌘K) y favoritos.
   */
  omitFromMainNav?: boolean;
};

export const ADMIN_NAV_GROUP_LABELS: Record<AdminNavGroup, string> = {
  operacion: "Control operativo",
  cobranza: "Cobranza y documentos",
  analisis: "Análisis",
  ajustes: "Ajustes",
};

/** Orden = orden en sidebar. */
export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  {
    to: "/admin/dashboard",
    label: "Inicio",
    group: "operacion",
    description: "Resumen, KPIs, mapa rápido y accesos",
    iconKey: "LayoutDashboard",
    end: true,
    mobileDockOnly: true,
  },
  {
    to: "/admin/clientes",
    label: "Clientes",
    group: "operacion",
    description: "Pedidos, plazos y cobros por cuenta (reemplaza el control mental y WhatsApp)",
    iconKey: "Building2",
    mobileDockOnly: true,
  },
  {
    to: "/admin/envios",
    label: "Envíos (tabla)",
    group: "operacion",
    description: "Lista con filtros y columnas; el resumen priorizado está en Inicio",
    iconKey: "Truck",
  },
  {
    to: "/admin/mapa",
    label: "Mapa operativo",
    group: "operacion",
    description: "Seguimiento en mapa y última posición del chofer",
    iconKey: "Map",
    mobileDockOnly: true,
    omitFromMainNav: true,
  },
  {
    to: "/admin/flota",
    label: "Flota (pantalla completa)",
    group: "operacion",
    description: "Vehículos y conductores: desde Inicio, botón flota junto a Choferes",
    iconKey: "Car",
    omitFromMainNav: true,
  },
  {
    to: "/admin/choferes",
    label: "Conductores",
    group: "operacion",
    description: "Nómina e historial: Inicio → Conductor → Gestionar choferes. La URL /admin/choferes sigue vigente (Buscar ⌘K, favoritos).",
    iconKey: "UsersRound",
    omitFromMainNav: true,
  },
  {
    to: "/admin/soporte-choferes",
    label: "Mensajes conductores",
    group: "operacion",
    description: "Bandeja: leer, responder y eliminar mensajes del portal del conductor",
    iconKey: "MessageCircle",
    omitFromMainNav: true,
  },
  {
    to: "/admin/facturas",
    label: "Facturas",
    group: "cobranza",
    description: "Emisión, IVA y cobranza documentada",
    iconKey: "FileText",
  },
  {
    to: "/admin/pagos",
    label: "Pagos",
    group: "cobranza",
    description: "Validar transferencias y comprobantes del cliente",
    iconKey: "Wallet",
    alertKey: "pagos",
    mobileDockOnly: true,
  },
  {
    to: "/admin/egresos",
    label: "Egresos",
    group: "cobranza",
    description: "Gastos operativos y categorías",
    iconKey: "ReceiptText",
  },
  {
    to: "/admin/liquidaciones-choferes",
    label: "Liquidaciones conductores",
    group: "cobranza",
    description: "Cierres y pagos a conductores",
    iconKey: "PiggyBank",
  },
  {
    to: "/admin/marketplace",
    label: "Marketplace (beta)",
    group: "analisis",
    description: "Nuevo canal tipo plataforma: cargas abiertas, comisión y métricas.",
    iconKey: "Wallet",
    omitFromMainNav: true,
  },
  {
    to: "/admin/reportes",
    label: "Exportaciones",
    group: "analisis",
    description: "Descargar CSV (envíos, facturas, egresos, pagos) para Excel",
    iconKey: "BarChart3",
  },
  {
    to: "/admin/auditoria",
    label: "Auditoría",
    group: "analisis",
    description: "Trazabilidad: envíos (aprobaciones/estados) y liquidaciones cerradas a conductores",
    iconKey: "ShieldCheck",
  },
  {
    to: "/admin/rentabilidad",
    label: "Rentabilidad",
    group: "analisis",
    description: "Margen por viaje y mes",
    iconKey: "TrendingUp",
  },
  {
    to: "/admin/precios",
    label: "Precios y tarifas",
    group: "ajustes",
    description: "Tarifas por ruta, parámetros globales de cotización y comisión chofer",
    iconKey: "BadgeDollarSign",
  },
  {
    to: "/admin/ajustes",
    label: "Configuración",
    group: "ajustes",
    description: "Nombre empresa, datos de facturación y preferencias",
    iconKey: "Settings",
  },
];
