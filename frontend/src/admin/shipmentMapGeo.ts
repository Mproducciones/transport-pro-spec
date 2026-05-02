import type { MapFocusTarget, MapMarker, MapRoute } from "../components/common/RouteMap.js";

/** Mínimo para trazar origen, destino, última señal y polilínea en RouteMap. */
export type ShipmentMapGeoRow = {
  id: string;
  origin: string;
  destination: string;
  originLat?: string | number | null;
  originLng?: string | number | null;
  destinationLat?: string | number | null;
  destinationLng?: string | number | null;
  lastLat?: string | number | null;
  lastLng?: string | number | null;
  customer: { name: string };
};

export function num(x: unknown): number | null {
  if (x === null || x === undefined || x === "") return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

/** Prioriza última posición del chofer; si no hay, centro origen–destino o un extremo. */
export function mapFocusTargetForShipment(r: ShipmentMapGeoRow): MapFocusTarget | null {
  const lLat = num(r.lastLat);
  const lLng = num(r.lastLng);
  if (lLat !== null && lLng !== null) return { lat: lLat, lng: lLng, zoom: 14 };
  const oLat = num(r.originLat);
  const oLng = num(r.originLng);
  const dLat = num(r.destinationLat);
  const dLng = num(r.destinationLng);
  if (oLat !== null && oLng !== null && dLat !== null && dLng !== null) {
    return { lat: (oLat + dLat) / 2, lng: (oLng + dLng) / 2, zoom: 11 };
  }
  if (oLat !== null && oLng !== null) return { lat: oLat, lng: oLng, zoom: 12 };
  if (dLat !== null && dLng !== null) return { lat: dLat, lng: dLng, zoom: 12 };
  return null;
}

export function buildMapMarkersAndRoutesForRows(list: ShipmentMapGeoRow[]): { markers: MapMarker[]; routes: MapRoute[] } {
  const markers: MapMarker[] = [];
  const routes: MapRoute[] = [];
  for (const r of list) {
    const oLat = num(r.originLat);
    const oLng = num(r.originLng);
    const dLat = num(r.destinationLat);
    const dLng = num(r.destinationLng);
    const lLat = num(r.lastLat);
    const lLng = num(r.lastLng);
    if (oLat !== null && oLng !== null) {
      markers.push({ lat: oLat, lng: oLng, label: `Origen: ${r.origin}`, color: "blue" });
    }
    if (dLat !== null && dLng !== null) {
      markers.push({ lat: dLat, lng: dLng, label: `Destino: ${r.destination}`, color: "green" });
    }
    if (lLat !== null && lLng !== null) {
      markers.push({
        lat: lLat,
        lng: lLng,
        label: `Chofer (última señal): ${r.customer.name} · ${r.origin} → ${r.destination}`,
        color: "orange",
      });
    }
    if (oLat !== null && oLng !== null && dLat !== null && dLng !== null) {
      routes.push({ from: { lat: oLat, lng: oLng }, to: { lat: dLat, lng: dLng } });
    }
  }
  return { markers, routes };
}

/**
 * Google Maps en modo **seguimiento** (admin / cliente): abre el mapa en una ubicación, no una ruta origen→destino.
 * Prioridad: última señal del camión → origen → destino → dirección como texto.
 * El conductor sigue usando `googleMapsDirectionsTo` en su flujo de navegación.
 */
export function googleMapsUrlForShipment(r: ShipmentMapGeoRow): string {
  const oLat = num(r.originLat);
  const oLng = num(r.originLng);
  const dLat = num(r.destinationLat);
  const dLng = num(r.destinationLng);
  const lLat = num(r.lastLat);
  const lLng = num(r.lastLng);

  if (lLat != null && lLng != null) {
    return `https://www.google.com/maps/search/?api=1&query=${lLat},${lLng}`;
  }
  if (oLat != null && oLng != null) {
    return `https://www.google.com/maps/search/?api=1&query=${oLat},${oLng}`;
  }
  if (dLat != null && dLng != null) {
    return `https://www.google.com/maps/search/?api=1&query=${dLat},${dLng}`;
  }
  if (r.origin?.trim()) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.origin.trim())}`;
  }
  if (r.destination?.trim()) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.destination.trim())}`;
  }
  return "https://www.google.com/maps/";
}
