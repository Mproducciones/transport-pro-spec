/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SHOW_DEMO_INVOICES?: string;
  /** Origen público de la API (ej. https://xxx.onrender.com). Vacío = mismo origen que el frontend. */
  readonly VITE_API_ORIGIN?: string;
}
