import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";

const STORAGE_KEY = "tp_admin_sensitive_hidden";

type AdminPrivacyContextValue = {
  /** Solo afecta los dos resúmenes «Cartera por cobrar» e «Ingresos aprobados del mes» en Inicio. */
  sensitiveHidden: boolean;
  toggleSensitiveHidden: () => void;
};

const AdminPrivacyContext = createContext<AdminPrivacyContextValue | null>(null);

export function AdminPrivacyProvider({ children }: { children: ReactNode }) {
  const [sensitiveHidden, setSensitiveHidden] = useState(
    () => typeof window !== "undefined" && localStorage.getItem(STORAGE_KEY) === "1"
  );

  const toggleSensitiveHidden = useCallback(() => {
    setSensitiveHidden((v) => {
      const next = !v;
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ sensitiveHidden, toggleSensitiveHidden }),
    [sensitiveHidden, toggleSensitiveHidden]
  );

  return <AdminPrivacyContext.Provider value={value}>{children}</AdminPrivacyContext.Provider>;
}

export function useAdminPrivacy(): AdminPrivacyContextValue {
  const ctx = useContext(AdminPrivacyContext);
  if (!ctx) {
    throw new Error("useAdminPrivacy debe usarse dentro de AdminPrivacyProvider");
  }
  return ctx;
}

/** Texto completo → asteriscos cuando está oculto. */
export function maskSensitiveText(hidden: boolean, text: string, stars = "••••"): string {
  return hidden ? stars : text;
}

/** Montos del resumen en Inicio (paneles Cartera / Ingresos). */
export function maskSensitiveAmount(hidden: boolean, formatted: string): string {
  return hidden ? "****" : formatted;
}

export function AdminPrivacyToggle() {
  const { sensitiveHidden, toggleSensitiveHidden } = useAdminPrivacy();
  return (
    <button
      type="button"
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-md transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      title={
        sensitiveHidden
          ? "Mostrar montos en el bloque «Cartera e ingresos del mes» (Inicio)"
          : "Ocultar montos de cartera e ingresos en Inicio (pantalla pública)"
      }
      aria-pressed={sensitiveHidden}
      onClick={toggleSensitiveHidden}
    >
      {sensitiveHidden ? <EyeOff size={20} strokeWidth={2} aria-hidden /> : <Eye size={20} strokeWidth={2} aria-hidden />}
    </button>
  );
}
