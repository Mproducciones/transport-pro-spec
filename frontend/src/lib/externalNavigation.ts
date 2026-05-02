/**
 * Enlaces a apps de navegación. Siempre deben abrirse con target _blank
 * para que la pestaña de Transport Pro siga activa.
 */

export type LatLng = { lat: number; lng: number };

function num(x: unknown): number | null {
  if (x === null || x === undefined || x === "") return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

export function toLatLng(lat: unknown, lng: unknown): LatLng | null {
  const la = num(lat);
  const ln = num(lng);
  if (la === null || ln === null) return null;
  return { lat: la, lng: ln };
}

/** Google Maps: ruta hasta punto (conduce). */
export function googleMapsDirectionsTo(opts: { coords?: LatLng | null; address?: string | null }): string | null {
  if (opts.coords) {
    const { lat, lng } = opts.coords;
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
  }
  const a = opts.address?.trim();
  if (a) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(a)}&travelmode=driving`;
  }
  return null;
}

/** Waze: navegar a coordenadas o dirección textual. */
export function wazeNavigateTo(opts: { coords?: LatLng | null; address?: string | null }): string | null {
  if (opts.coords) {
    return `https://waze.com/ul?ll=${opts.coords.lat},${opts.coords.lng}&navigate=yes`;
  }
  const a = opts.address?.trim();
  if (a) {
    return `https://waze.com/ul?q=${encodeURIComponent(a)}&navigate=yes`;
  }
  return null;
}

/** Apple Maps (útil en iOS), soporta coordenadas o dirección. */
export function appleMapsDirectionsTo(opts: { coords?: LatLng | null; address?: string | null }): string | null {
  if (opts.coords) {
    return `https://maps.apple.com/?daddr=${opts.coords.lat},${opts.coords.lng}&dirflg=d`;
  }
  const a = opts.address?.trim();
  if (a) {
    return `https://maps.apple.com/?daddr=${encodeURIComponent(a)}&dirflg=d`;
  }
  return null;
}

export function openInNewTab(url: string): void {
  const win = window.open(url, "_blank", "noopener,noreferrer");
  if (win) win.opener = null;
}
