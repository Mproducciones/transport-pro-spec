export type RouteOrderMode = "lifo" | "flexible";

export type RouteTrip = {
  id: string;
  origin: string;
  destination: string;
  status: string;
  scheduledPickup?: string | null;
  scheduledDelivery?: string | null;
  pickupAddress?: string | null;
  deliveryAddress?: string | null;
  originLat?: string | number | null;
  originLng?: string | number | null;
  destinationLat?: string | number | null;
  destinationLng?: string | number | null;
  loadSequence?: string | number | null;
  unloadAccess?: string | null;
};

export type SuggestedRouteStop = {
  shipmentId: string;
  trip: RouteTrip;
  kind: "pickup" | "delivery";
  placeLabel: string;
  reason: string;
  kmFromRef: number | null;
};

function num(x: unknown): number | null {
  if (x === null || x === undefined || x === "") return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function ts(value?: string | null): number | null {
  if (!value) return null;
  const n = new Date(value).getTime();
  return Number.isFinite(n) ? n : null;
}

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function seqPickup(t: RouteTrip): number {
  const n = num(t.loadSequence);
  return n !== null ? n : 9999;
}

function seqDelivery(t: RouteTrip): number {
  const n = num(t.loadSequence);
  return n !== null ? n : -1;
}

/** Retiros pendientes: menor número de secuencia primero (orden en que subís al camión). */
export function sortPickupsByLoadSequence<T extends RouteTrip>(trips: T[]): T[] {
  if (!Array.isArray(trips)) {
    if (import.meta.env.DEV) {
      console.warn(
        "[sortPickupsByLoadSequence] Se esperaba un array. Usá sortPickupsByLoadSequence(rows.filter(...)), no .sort(sortPickupsByLoadSequence)."
      );
    }
    return [];
  }
  return [...trips].sort(
    (a, b) =>
      seqPickup(a) - seqPickup(b) ||
      (ts(a.scheduledPickup) ?? 0) - (ts(b.scheduledPickup) ?? 0) ||
      a.id.localeCompare(b.id)
  );
}

/**
 * Entregas con carga a bordo: LIFO físico. Primero en la lista = primero que debés bajar
 * (lo último que se cargó, más accesible). Lo primero cargado queda al fondo y se entrega al final.
 */
export function sortDeliveriesByLifoUnload<T extends RouteTrip>(trips: T[]): T[] {
  if (!Array.isArray(trips)) {
    if (import.meta.env.DEV) {
      console.warn(
        "[sortDeliveriesByLifoUnload] Se esperaba un array. Usá sortDeliveriesByLifoUnload(rows.filter(...)), no .sort(sortDeliveriesByLifoUnload)."
      );
    }
    return [];
  }
  return [...trips].sort(
    (a, b) =>
      seqDelivery(b) - seqDelivery(a) ||
      (ts(a.scheduledDelivery) ?? 0) - (ts(b.scheduledDelivery) ?? 0) ||
      a.id.localeCompare(b.id)
  );
}

function fmtSeq(t: RouteTrip): string {
  const n = num(t.loadSequence);
  return n !== null ? String(n) : "—";
}

function pickupReasonLifo(t: RouteTrip): string {
  const n = num(t.loadSequence);
  if (n !== null) {
    return `Prioridad de carga según despacho: número ${n} (menor número = retirar antes al cargar el camión).`;
  }
  return "Aún no hay número de secuencia cargado. Aunque la ruta se repita con otro envío, son pedidos distintos — revisá el código de envío arriba.";
}

function deliveryReasonLifo(t: RouteTrip): string {
  const acc = t.unloadAccess?.trim();
  const seq = fmtSeq(t);
  const base =
    seq !== "—"
      ? `LIFO: número de carga ${seq}. Número mayor = se subió después → bajar primero. Número menor = se subió primero (fondo) → entregar después.`
      : "Sin número de secuencia: confirmá orden de descarga con despacho.";
  return acc ? `${base} Acceso / muelle: ${acc}.` : base;
}

function flexibleReason(
  t: RouteTrip,
  kind: "pickup" | "delivery",
  kmFromPrev: number | null,
  kmFromRef: number | null
): string {
  const acc = kind === "delivery" && t.unloadAccess?.trim() ? ` Acceso: ${t.unloadAccess.trim()}.` : "";
  const leg =
    kmFromPrev !== null && Number.isFinite(kmFromPrev)
      ? ` Siguiente salto: ~${kmFromPrev.toFixed(1)} km desde la parada anterior.`
      : "";
  const ref =
    kmFromRef !== null && Number.isFinite(kmFromRef)
      ? ` ~${kmFromRef.toFixed(1)} km desde tu referencia (última posición o viaje activo).`
      : "";
  return `Modo flexible: parada más cercana en la cadena.${ref}${leg}${acc}`;
}

type Pending = {
  t: RouteTrip;
  kind: "pickup" | "delivery";
  lat: number | null;
  lng: number | null;
};

export function buildSuggestedRoute(
  pickupTrips: RouteTrip[],
  deliverTrips: RouteTrip[],
  mode: RouteOrderMode,
  refLat: number | null,
  refLng: number | null
): SuggestedRouteStop[] {
  const kmToRef = (lat: number | null, lng: number | null): number | null => {
    if (refLat === null || refLng === null || lat === null || lng === null) return null;
    return haversineKm(refLat, refLng, lat, lng);
  };

  if (mode === "lifo") {
    const sortedPickups = sortPickupsByLoadSequence(pickupTrips);
    const sortedDelivers = sortDeliveriesByLifoUnload(deliverTrips);
    const out: SuggestedRouteStop[] = [];
    for (const t of sortedPickups) {
      const lat = num(t.originLat);
      const lng = num(t.originLng);
      out.push({
        shipmentId: t.id,
        trip: t,
        kind: "pickup",
        placeLabel: t.pickupAddress?.trim() || t.origin,
        reason: pickupReasonLifo(t),
        kmFromRef: kmToRef(lat, lng),
      });
    }
    for (const t of sortedDelivers) {
      const lat = num(t.destinationLat);
      const lng = num(t.destinationLng);
      out.push({
        shipmentId: t.id,
        trip: t,
        kind: "delivery",
        placeLabel: t.deliveryAddress?.trim() || t.destination,
        reason: deliveryReasonLifo(t),
        kmFromRef: kmToRef(lat, lng),
      });
    }
    return out;
  }

  const pending: Pending[] = [
    ...pickupTrips.map((t) => ({
      t,
      kind: "pickup" as const,
      lat: num(t.originLat),
      lng: num(t.originLng),
    })),
    ...deliverTrips.map((t) => ({
      t,
      kind: "delivery" as const,
      lat: num(t.destinationLat),
      lng: num(t.destinationLng),
    })),
  ];

  const out: SuggestedRouteStop[] = [];
  let curLat = refLat;
  let curLng = refLng;

  while (pending.length > 0) {
    let bestI = 0;
    let bestD = Number.POSITIVE_INFINITY;
    for (let i = 0; i < pending.length; i++) {
      const p = pending[i]!;
      let d = Number.POSITIVE_INFINITY;
      if (curLat !== null && curLng !== null && p.lat !== null && p.lng !== null) {
        d = haversineKm(curLat, curLng, p.lat, p.lng);
      }
      if (d < bestD) {
        bestD = d;
        bestI = i;
      }
    }
    const next = pending.splice(bestI, 1)[0]!;
    const kmFromPrev =
      curLat !== null && curLng !== null && next.lat !== null && next.lng !== null && Number.isFinite(bestD)
        ? bestD
        : null;
    const kRef = kmToRef(next.lat, next.lng);
    out.push({
      shipmentId: next.t.id,
      trip: next.t,
      kind: next.kind,
      placeLabel:
        next.kind === "pickup"
          ? next.t.pickupAddress?.trim() || next.t.origin
          : next.t.deliveryAddress?.trim() || next.t.destination,
      reason: flexibleReason(next.t, next.kind, kmFromPrev, kRef),
      kmFromRef: kRef,
    });
    if (next.lat !== null && next.lng !== null) {
      curLat = next.lat;
      curLng = next.lng;
    }
  }

  return out;
}
