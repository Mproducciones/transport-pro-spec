export type GeoPoint = { lat: number; lng: number };

export type AddressSuggestion = {
  label: string;
  lat: number;
  lng: number;
};

const USER_AGENT = "TransportPro/1.0 (contact: admin@transportpro.local)";

type NominatimHit = {
  lat: string;
  lon: string;
  display_name: string;
};

export async function geocodeAddress(
  address: string,
  countryHint = "cl"
): Promise<GeoPoint | null> {
  if (!address?.trim()) return null;
  try {
    const url =
      `https://nominatim.openstreetmap.org/search?format=json&limit=1` +
      `&countrycodes=${encodeURIComponent(countryHint)}` +
      `&q=${encodeURIComponent(address)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "es" },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (Array.isArray(json) && json.length > 0) {
      const lat = Number(json[0].lat);
      const lng = Number(json[0].lon);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    }
  } catch {
    // best-effort: silencioso
  }
  return null;
}

/**
 * Autocompletado de direcciones (Nominatim / OpenStreetMap).
 * Uso razonable: límite en la ruta HTTP; en producción conviene cache o proveedor dedicado.
 */
export async function searchAddresses(
  query: string,
  opts?: { limit?: number; countryCode?: string }
): Promise<AddressSuggestion[]> {
  const q = query?.trim();
  if (!q || q.length < 2) return [];
  const limit = Math.min(Math.max(opts?.limit ?? 6, 1), 10);
  const country = opts?.countryCode ?? "cl";
  try {
    const url =
      `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1` +
      `&limit=${limit}&countrycodes=${encodeURIComponent(country)}` +
      `&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "es,en" },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as NominatimHit[];
    if (!Array.isArray(json)) return [];
    const out: AddressSuggestion[] = [];
    for (const row of json) {
      const lat = Number(row.lat);
      const lng = Number(row.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      out.push({ label: row.display_name, lat, lng });
    }
    return out;
  } catch {
    return [];
  }
}
