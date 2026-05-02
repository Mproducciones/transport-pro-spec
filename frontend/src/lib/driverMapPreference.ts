/**
 * Preferencia del chofer: cómo abrir «Ver en mapa» (solo este dispositivo, localStorage).
 */

export const DRIVER_MAP_OPEN_PREF_KEY = "tp_driver_map_open_pref_v1";

export type DriverMapOpenPreference = "app" | "google" | "waze" | "apple";

export function readDriverMapOpenPreference(): DriverMapOpenPreference | null {
  try {
    const raw = localStorage.getItem(DRIVER_MAP_OPEN_PREF_KEY);
    if (raw === "app" || raw === "google" || raw === "waze" || raw === "apple") return raw;
  } catch {
    /* ignore */
  }
  return null;
}

export function writeDriverMapOpenPreference(pref: DriverMapOpenPreference): void {
  try {
    localStorage.setItem(DRIVER_MAP_OPEN_PREF_KEY, pref);
  } catch {
    /* ignore */
  }
}

export function clearDriverMapOpenPreference(): void {
  try {
    localStorage.removeItem(DRIVER_MAP_OPEN_PREF_KEY);
  } catch {
    /* ignore */
  }
}

export function mapOpenPreferenceLabel(pref: DriverMapOpenPreference): string {
  switch (pref) {
    case "app":
      return "Mapa en Transport Pro";
    case "google":
      return "Google Maps";
    case "waze":
      return "Waze";
    case "apple":
      return "Apple Maps";
    default:
      return pref;
  }
}

export const DRIVER_MAP_PREF_CHOICES: ReadonlyArray<{
  value: DriverMapOpenPreference | "";
  label: string;
  hint?: string;
}> = [
  { value: "", label: "Preguntar cada vez", hint: "Abrís el selector al tocar Ver en mapa." },
  { value: "app", label: "Mapa en Transport Pro", hint: "Pantalla Mapa del panel." },
  { value: "google", label: "Google Maps", hint: "Se abre en otra pestaña o en la app." },
  { value: "waze", label: "Waze", hint: "Igual que Google, según tu dispositivo." },
  { value: "apple", label: "Apple Maps", hint: "Útil en iPhone / iPad." },
];
