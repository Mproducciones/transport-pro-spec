/** Datos mínimos para sugerir chofer/vehículo según ruta e historial. */

export type ShipmentForSuggest = {
  id: string;
  origin: string;
  destination: string;
  status: string;
  driver?: { id: string; fullName?: string } | null;
};

export type DriverForSuggest = {
  id: string;
  fullName: string;
  assignedVehicle?: { id: string; plate: string; status: string } | null;
};

export type DriverSuggestion = {
  driverId: string;
  driverName: string;
  vehicleId: string;
  vehiclePlate: string;
  experience: number;
  load: number;
  reason: string;
};

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Puntos de similitud entre dos textos de ruta (0–4). */
function routeOverlap(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 4;
  if (a.includes(b) || b.includes(a)) return 3;
  const wordsA = new Set(a.split(/[^a-z0-9]+/).filter((w) => w.length > 2));
  let n = 0;
  for (const w of b.split(/[^a-z0-9]+/).filter((w) => w.length > 2)) {
    if (wordsA.has(w)) n++;
  }
  return Math.min(n, 3);
}

function hashMod(seed: string, mod: number): number {
  if (mod <= 0) return 0;
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % mod;
}

const ACTIVE = new Set(["confirmado", "recogido", "en_transito"]);

/**
 * Elige chofer + su vehículo asignado:
 * 1) Más puntos por envíos previos del mismo chofer con origen/destino parecidos.
 * 2) Menos envíos activos actualmente.
 * 3) Si hay empate, rotación estable por id del envío (no siempre el primero de la lista).
 */
export function suggestDriverAndVehicle(
  shipment: ShipmentForSuggest,
  drivers: DriverForSuggest[],
  allShipments: ShipmentForSuggest[]
): { driverId: string; vehicleId: string; reason: string } | null {
  const ranked = rankAllDriverSuggestions(shipment, drivers, allShipments);
  if (ranked.length === 0) return null;
  const top = ranked[0];
  return { driverId: top.driverId, vehicleId: top.vehicleId, reason: top.reason };
}

/**
 * Todos los choferes operables ordenados por ruta/historial y carga (misma lógica que las sugerencias).
 */
export function rankAllDriverSuggestions(
  shipment: ShipmentForSuggest,
  drivers: DriverForSuggest[],
  allShipments: ShipmentForSuggest[]
): DriverSuggestion[] {
  const operable = drivers.filter(
    (d) => d.assignedVehicle && d.assignedVehicle.status !== "en_taller"
  );
  if (operable.length === 0) return [];

  const nOrigin = norm(shipment.origin);
  const nDest = norm(shipment.destination);

  const scored = operable.map((d) => {
    let experience = 0;
    for (const sh of allShipments) {
      if (sh.id === shipment.id) continue;
      if (!sh.driver || sh.driver.id !== d.id) continue;
      if (sh.status === "rechazado" || sh.status === "pendiente") continue;
      experience += routeOverlap(nOrigin, norm(sh.origin));
      experience += routeOverlap(nDest, norm(sh.destination));
    }

    const load = allShipments.filter(
      (sh) => sh.driver?.id === d.id && ACTIVE.has(sh.status)
    ).length;

    return { d, experience, load };
  });

  scored.sort((a, b) => {
    if (b.experience !== a.experience) return b.experience - a.experience;
    return a.load - b.load;
  });

  const best = scored[0];
  const tied = scored.filter((s) => s.experience === best.experience && s.load === best.load);
  const first = tied[hashMod(shipment.id, tied.length)] ?? best;
  const remaining = scored.filter((s) => s.d.id !== first.d.id);
  const ordered = [first, ...remaining];

  return ordered.map((pick) => {
    const veh = pick.d.assignedVehicle!;
    const reason =
      pick.experience > 0
        ? `Rutas similares (${pick.experience} pts) y ${pick.load} activo(s).`
        : `Sin historial claro; ${pick.load} activo(s).`;
    return {
      driverId: pick.d.id,
      driverName: pick.d.fullName,
      vehicleId: veh.id,
      vehiclePlate: veh.plate,
      experience: pick.experience,
      load: pick.load,
      reason,
    };
  });
}

export function suggestDriverOptions(
  shipment: ShipmentForSuggest,
  drivers: DriverForSuggest[],
  allShipments: ShipmentForSuggest[],
  limit = 3
): DriverSuggestion[] {
  const all = rankAllDriverSuggestions(shipment, drivers, allShipments);
  return all.slice(0, Math.max(1, limit));
}
