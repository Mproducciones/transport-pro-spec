import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Truck, X } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { apiGet } from "../../api/client.js";
import { RouteMap, type MapMarker, type MapRoute } from "../../components/common/RouteMap.js";

type ShipmentRow = {
  id: string;
  origin: string;
  destination: string;
  status: string;
  paymentStatus?: string;
  paymentTerm?: string;
  cargoType?: string;
  cargoQuantity?: unknown;
  cargoWeightKg?: unknown;
  cargoVolumeM3?: unknown;
  cargoDescription?: string | null;
  amount?: unknown;
  totalAmount?: unknown;
  paidAmount?: string;
  balanceAmount?: string;
  requiresHelper?: boolean;
  helperSurcharge?: unknown;
  scheduledPickup?: string | null;
  scheduledDelivery?: string | null;
  pickupAddress?: string | null;
  deliveryAddress?: string | null;
  pickupWindowStart?: string | null;
  pickupWindowEnd?: string | null;
  deliveryWindowStart?: string | null;
  deliveryWindowEnd?: string | null;
  pickupNotes?: string | null;
  deliveryNotes?: string | null;
  originLat?: string | number | null;
  originLng?: string | number | null;
  destinationLat?: string | number | null;
  destinationLng?: string | number | null;
  lastLat?: string | number | null;
  lastLng?: string | number | null;
  lastReportedAt?: string | null;
  pickedUpAt?: string | null;
  enTransitoAt?: string | null;
  deliveredAt?: string | null;
  deliveredToName?: string | null;
  deliveredToId?: string | null;
  loadSequence?: number | null;
  unloadAccess?: string | null;
  decisionNote?: string | null;
  createdAt?: string;
  customer: { name: string; email?: string | null; phone?: string | null };
  driver?: { id: string; fullName: string; phone?: string | null; avatarUrl?: string | null } | null;
  vehicle?: { id: string; plate: string; kind?: string | null } | null;
};

function num(x: unknown): number | null {
  if (x === null || x === undefined || x === "") return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

const EN_RUTA = new Set(["confirmado", "recogido", "en_transito"]);

function statusLabel(status: string): string {
  switch (status) {
    case "pendiente":
      return "Pendiente";
    case "confirmado":
      return "Confirmado";
    case "recogido":
      return "Recogido";
    case "en_transito":
      return "En tránsito";
    case "entregado":
      return "Entregado";
    case "rechazado":
      return "Rechazado";
    default:
      return status;
  }
}

function fmtTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" });
}

function fmtMoney(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(Math.round(n));
}

function paymentStatusLabel(s: string | undefined): string {
  switch (s) {
    case "pagado":
      return "Pagado";
    case "parcial":
      return "Pago parcial";
    case "pendiente":
      return "Pago pendiente";
    default:
      return s ?? "—";
  }
}

function cargoTypeLabel(t: string | undefined): string {
  switch (t) {
    case "pallet":
      return "Pallet";
    case "contenedor":
      return "Contenedor";
    case "granel":
      return "Granel";
    case "caja":
      return "Caja";
    case "otro":
      return "Otro";
    default:
      return t ?? "—";
  }
}

function initialsFromName(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "?";
  if (p.length === 1) return p[0]!.slice(0, 2).toUpperCase();
  return `${p[0]![0]!}${p[1]![0]!}`.toUpperCase();
}

function vehicleSubtitle(s: ShipmentRow, groupKey: string): string {
  if (!s.vehicle?.plate) {
    return groupKey === "__sin_chofer__" ? "Sin patente" : "Vehículo no indicado en el envío";
  }
  const k = s.vehicle.kind?.trim();
  return k ? `${k} · ${s.vehicle.plate}` : `Patente ${s.vehicle.plate}`;
}

function DriverFace({
  name,
  avatarUrl,
  unassigned,
  className = "h-12 w-12 shrink-0 text-sm",
}: {
  name: string;
  avatarUrl?: string | null;
  unassigned?: boolean;
  className?: string;
}) {
  const [imgErr, setImgErr] = useState(false);
  if (unassigned) {
    return (
      <div
        className={`flex items-center justify-center rounded-full border border-slate-200 bg-slate-200 text-slate-600 ${className}`}
        aria-hidden
      >
        <Truck className="h-1/2 w-1/2" strokeWidth={2} />
      </div>
    );
  }
  if (avatarUrl && !imgErr) {
    return (
      <img
        src={avatarUrl}
        alt=""
        className={`rounded-full object-cover ${className}`}
        onError={() => setImgErr(true)}
      />
    );
  }
  return (
    <div
      className={`flex items-center justify-center rounded-full border border-slate-200 bg-slate-200 font-bold text-slate-700 ${className}`}
      aria-hidden
    >
      {initialsFromName(name)}
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-x-2 gap-y-0.5 text-[11px] sm:grid-cols-[9rem_1fr]">
      <dt className="font-medium text-slate-500">{label}</dt>
      <dd className="text-slate-900">{children}</dd>
    </div>
  );
}

function MapFocusedShipmentPanel({ s, onClear }: { s: ShipmentRow; onClear: () => void }) {
  const short = s.id.slice(-6).toUpperCase();
  const tieneGps = num(s.lastLat) !== null && num(s.lastLng) !== null;
  const lat = num(s.lastLat);
  const lng = num(s.lastLng);
  return (
    <div className="space-y-3 border-b border-slate-200 bg-slate-50/95 px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Envío en foco · {short}</h3>
          <p className="mt-0.5 text-[11px] text-slate-500">
            ID completo: <code className="rounded bg-white px-1 text-[10px] text-slate-700">{s.id}</code>
          </p>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
          onClick={onClear}
        >
          Quitar foco
        </button>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="rounded-lg border-2 border-blue-300/90 bg-gradient-to-br from-blue-50 to-sky-50/80 px-3 py-2.5 shadow-sm ring-1 ring-blue-200/60">
          <p className="text-[10px] font-bold uppercase tracking-wide text-blue-900">Estado</p>
          <p className="mt-0.5 text-base font-bold leading-tight text-slate-900">{statusLabel(s.status)}</p>
        </div>
        <div className="rounded-lg border-2 border-amber-300/90 bg-gradient-to-br from-amber-50 to-orange-50/70 px-3 py-2.5 shadow-sm ring-1 ring-amber-200/60">
          <p className="text-[10px] font-bold uppercase tracking-wide text-amber-950">Cobro</p>
          <p className="mt-0.5 text-base font-bold leading-tight text-slate-900">
            {paymentStatusLabel(s.paymentStatus)}
          </p>
        </div>
      </div>

      <dl className="space-y-1.5">
        <DetailRow label="Ruta">
          <span className="font-medium">
            {s.origin} → {s.destination}
          </span>
        </DetailRow>
        {(s.pickupAddress || s.deliveryAddress) && (
          <DetailRow label="Direcciones">
            <span>
              {s.pickupAddress ? (
                <>
                  <strong className="text-slate-700">Retiro:</strong> {s.pickupAddress}
                </>
              ) : null}
              {s.pickupAddress && s.deliveryAddress ? <br /> : null}
              {s.deliveryAddress ? (
                <>
                  <strong className="text-slate-700">Entrega:</strong> {s.deliveryAddress}
                </>
              ) : null}
            </span>
          </DetailRow>
        )}
        <DetailRow label="Cliente">
          {s.customer.name}
          {s.customer.phone ? ` · ${s.customer.phone}` : ""}
          {s.customer.email ? ` · ${s.customer.email}` : ""}
        </DetailRow>
        <DetailRow label="Programado">
          Retiro {fmtTime(s.scheduledPickup)} · Entrega {fmtTime(s.scheduledDelivery)}
        </DetailRow>
        {(s.pickupWindowStart || s.pickupWindowEnd || s.deliveryWindowStart || s.deliveryWindowEnd) && (
          <DetailRow label="Ventanas">
            {s.pickupWindowStart || s.pickupWindowEnd ? (
              <>
                Retiro: {fmtTime(s.pickupWindowStart)} – {fmtTime(s.pickupWindowEnd)}
              </>
            ) : null}
            {s.deliveryWindowStart || s.deliveryWindowEnd ? (
              <>
                {(s.pickupWindowStart || s.pickupWindowEnd) && <br />}
                Entrega: {fmtTime(s.deliveryWindowStart)} – {fmtTime(s.deliveryWindowEnd)}
              </>
            ) : null}
          </DetailRow>
        )}
        <DetailRow label="Equipo">
          <span className="inline-flex items-center gap-2">
            <DriverFace
              name={s.driver?.fullName ?? "Sin conductor"}
              avatarUrl={s.driver?.avatarUrl}
              unassigned={!s.driver}
              className="h-9 w-9 shrink-0 text-[10px]"
            />
            <span>
              {s.driver?.fullName ?? "Sin conductor"}
              {s.driver?.phone ? ` · ${s.driver.phone}` : ""}
              {s.vehicle?.plate || s.vehicle?.kind
                ? ` · ${vehicleSubtitle(s, s.driver ? "_" : "__sin_chofer__")}`
                : ""}
            </span>
          </span>
        </DetailRow>
        <DetailRow label="Carga">
          {cargoTypeLabel(s.cargoType)}
          {s.cargoWeightKg != null && Number(s.cargoWeightKg) > 0
            ? ` · ${Number(s.cargoWeightKg).toLocaleString("es-CL")} kg`
            : ""}
          {s.cargoVolumeM3 != null && Number(s.cargoVolumeM3) > 0
            ? ` · ${Number(s.cargoVolumeM3).toLocaleString("es-CL")} m³`
            : ""}
          {s.cargoQuantity != null && Number(s.cargoQuantity) > 0
            ? ` · Cant. ${Number(s.cargoQuantity).toLocaleString("es-CL")}`
            : ""}
          {s.requiresHelper ? " · Requiere ayudante" : ""}
        </DetailRow>
        {s.cargoDescription ? (
          <DetailRow label="Detalle carga">{s.cargoDescription}</DetailRow>
        ) : null}
        <DetailRow label="Montos">
          Total {fmtMoney(s.totalAmount ?? s.amount)}
          {s.paidAmount != null ? ` · Pagado ${fmtMoney(s.paidAmount)}` : ""}
          {s.balanceAmount != null ? ` · Saldo ${fmtMoney(s.balanceAmount)}` : ""}
        </DetailRow>
        <DetailRow label="GPS chofer">
          {tieneGps && lat !== null && lng !== null ? (
            <>
              {lat.toFixed(5)}, {lng.toFixed(5)} · Última señal {fmtTime(s.lastReportedAt)}
              {relativeAgo(s.lastReportedAt) ? ` (${relativeAgo(s.lastReportedAt)})` : ""}
            </>
          ) : (
            "Sin posición reportada"
          )}
        </DetailRow>
        {(s.pickedUpAt || s.enTransitoAt || s.deliveredAt) && (
          <DetailRow label="Hitos">
            {s.pickedUpAt ? <>Recogido {fmtTime(s.pickedUpAt)}</> : null}
            {s.enTransitoAt ? (
              <>
                {s.pickedUpAt ? <br /> : null}
                En tránsito {fmtTime(s.enTransitoAt)}
              </>
            ) : null}
            {s.deliveredAt ? (
              <>
                {(s.pickedUpAt || s.enTransitoAt) ? <br /> : null}
                Entregado {fmtTime(s.deliveredAt)}
                {s.deliveredToName ? ` · ${s.deliveredToName}` : ""}
              </>
            ) : null}
          </DetailRow>
        )}
        {(s.pickupNotes || s.deliveryNotes) && (
          <DetailRow label="Notas">
            {s.pickupNotes ? (
              <>
                <strong>Retiro:</strong> {s.pickupNotes}
              </>
            ) : null}
            {s.pickupNotes && s.deliveryNotes ? <br /> : null}
            {s.deliveryNotes ? (
              <>
                <strong>Entrega:</strong> {s.deliveryNotes}
              </>
            ) : null}
          </DetailRow>
        )}
        {(s.loadSequence != null || s.unloadAccess) && (
          <DetailRow label="Ruta / descarga">
            {s.loadSequence != null ? `Secuencia retiro: ${s.loadSequence}` : null}
            {s.loadSequence != null && s.unloadAccess ? " · " : null}
            {s.unloadAccess ? `Acceso descarga: ${s.unloadAccess}` : null}
          </DetailRow>
        )}
        {s.decisionNote ? <DetailRow label="Nota decisión">{s.decisionNote}</DetailRow> : null}
        {s.createdAt ? (
          <DetailRow label="Creado">{fmtTime(s.createdAt)}</DetailRow>
        ) : null}
      </dl>

      <div className="flex flex-wrap gap-2 pt-1">
        <Link
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500"
          to={`/admin/envios?envio=${encodeURIComponent(s.id)}`}
        >
          Abrir ficha completa en Envíos
        </Link>
        {tieneGps && lat !== null && lng !== null ? (
          <a
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            href={`https://www.google.com/maps?q=${lat},${lng}`}
            target="_blank"
            rel="noreferrer"
          >
            Última posición en Maps
          </a>
        ) : null}
      </div>

      <div className="border-t border-slate-200 pt-3">
        <h4 className="text-xs font-semibold text-slate-800">Seguimiento vs. navegación del chofer</h4>
        <p className="mt-1 text-[11px] leading-snug text-slate-600">
          En administración el foco es <strong className="font-medium">ver dónde está el camión</strong> (botón «Última posición en
          Maps» arriba cuando hay GPS). Las <strong className="font-medium">indicaciones turn-by-turn</strong> hasta retiro o entrega
          las abre el conductor desde su app; no se ofrecen acá para no confundir con el seguimiento.
        </p>
      </div>
    </div>
  );
}

/** Para lectura humana en listado. */
function relativeAgo(iso?: string | null): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec < 45) return "hace instantes";
  if (sec < 3600) return `hace ${Math.floor(sec / 60)} min`;
  if (sec < 86400) return `hace ${Math.floor(sec / 3600)} h`;
  return `hace ${Math.floor(sec / 86400)} d`;
}

type GpsFreshness = "none" | "fresh" | "aging" | "stale";

function gpsFreshness(iso?: string | null): GpsFreshness {
  if (!iso) return "none";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "none";
  const min = (Date.now() - t) / 60_000;
  if (min <= 12) return "fresh";
  if (min <= 40) return "aging";
  return "stale";
}

/** Menor = más urgente para despacho (sin señal o señal vieja primero). */
function gpsSortRank(s: ShipmentRow): number {
  if (num(s.lastLat) === null || num(s.lastLng) === null) return 0;
  const f = gpsFreshness(s.lastReportedAt);
  if (f === "stale") return 1;
  if (f === "aging") return 2;
  return 3;
}

function ShipmentListRowButton({
  s,
  showVehicleInSubtitle,
  focusId,
  onRowClick,
}: {
  s: ShipmentRow;
  showVehicleInSubtitle: boolean;
  focusId: string | null;
  onRowClick: (id: string) => void;
}) {
  const active = focusId === s.id;
  const tieneGps = num(s.lastLat) !== null && num(s.lastLng) !== null;
  const fresh = gpsFreshness(s.lastReportedAt);
  const badge =
    !tieneGps || fresh === "none"
      ? { className: "bg-rose-100 text-rose-800", text: "Sin GPS" }
      : fresh === "stale"
        ? { className: "bg-amber-100 text-amber-900", text: "Señal antigua" }
        : fresh === "aging"
          ? { className: "bg-sky-100 text-sky-900", text: "Señal regular" }
          : { className: "bg-emerald-100 text-emerald-900", text: "Señal reciente" };
  const ago = relativeAgo(s.lastReportedAt);
  return (
    <li>
      <button
        type="button"
        className={`w-full px-3 py-2.5 text-left text-sm transition-colors hover:bg-slate-50 ${
          active ? "bg-blue-50" : ""
        }`}
        onClick={() => onRowClick(s.id)}
      >
        <p className="flex flex-wrap items-center gap-2 font-medium text-slate-900">
          <span>
            {s.origin} → {s.destination}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge.className}`}>{badge.text}</span>
        </p>
        <p className="text-xs text-slate-600">
          {s.customer.name}
          {showVehicleInSubtitle && s.vehicle?.plate ? ` · ${s.vehicle.plate}` : null}
        </p>
        <p className="mt-0.5 text-[11px] text-slate-500">
          <span className="font-semibold text-slate-700">{statusLabel(s.status)}</span>
          {" · "}
          {tieneGps ? (
            <>
              Última señal: {fmtTime(s.lastReportedAt)}
              {ago ? ` (${ago})` : ""}
            </>
          ) : (
            "Sin posición reportada"
          )}
        </p>
      </button>
    </li>
  );
}

const ROUTE_PALETTE = ["#2563eb", "#0891b2", "#7c3aed", "#c026d3", "#ea580c", "#16a34a"];

export function MapaSeguimientoAdminPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  /** Solo envíos en ruta (confirmado / recogido / en tránsito), como el antiguo filtro por defecto. */
  const [focusId, setFocusId] = useState<string | null>(null);
  /** Modal con envíos de un chofer (clave de grupo de `listadoPorChofer`). */
  const [choferModalKey, setChoferModalKey] = useState<string | null>(null);

  const shipmentsQ = useQuery({
    queryKey: ["shipments", "admin-mapa-seguimiento"],
    queryFn: () => apiGet<ShipmentRow[]>("/shipments"),
    refetchInterval: 20_000,
  });

  const rows = shipmentsQ.data ?? [];

  const envioFromUrl = searchParams.get("envio");

  const applyMapFocus = useCallback(
    (id: string | null) => {
      setFocusId(id);
      setSearchParams(
        (prev) => {
          const n = new URLSearchParams(prev);
          if (id) n.set("envio", id);
          else n.delete("envio");
          return n;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  useEffect(() => {
    if (!rows.length) return;
    if (envioFromUrl) {
      if (rows.some((s) => s.id === envioFromUrl)) setFocusId(envioFromUrl);
      else setFocusId(null);
    } else {
      setFocusId(null);
    }
  }, [envioFromUrl, rows]);

  const filtrados = useMemo(() => {
    if (focusId) {
      const one = rows.find((s) => s.id === focusId);
      if (!one || one.status === "rechazado") return [];
      return [one];
    }
    return rows.filter((s) => s.status !== "entregado" && s.status !== "rechazado" && EN_RUTA.has(s.status));
  }, [rows, focusId]);

  const { markers, routes, focused } = useMemo(() => {
    const markers: MapMarker[] = [];
    const routes: MapRoute[] = [];
    let idx = 0;
    for (const r of filtrados) {
      const oLat = num(r.originLat);
      const oLng = num(r.originLng);
      const dLat = num(r.destinationLat);
      const dLng = num(r.destinationLng);
      const lLat = num(r.lastLat);
      const lLng = num(r.lastLng);
      const short = r.id.slice(-6).toUpperCase();
      const driverBit = r.driver?.fullName ? ` · ${r.driver.fullName}` : "";
      const plateBit = r.vehicle?.plate ? ` · ${r.vehicle.plate}` : "";
      const color = ROUTE_PALETTE[idx % ROUTE_PALETTE.length];
      idx += 1;

      if (oLat !== null && oLng !== null) {
        markers.push({
          lat: oLat,
          lng: oLng,
          label: `Origen · ${short}${driverBit}\n${r.origin}`,
          color: "blue",
        });
      }
      if (dLat !== null && dLng !== null) {
        markers.push({
          lat: dLat,
          lng: dLng,
          label: `Destino · ${short}\n${r.destination}`,
          color: "green",
        });
      }
      if (lLat !== null && lLng !== null) {
        const ago = relativeAgo(r.lastReportedAt);
        markers.push({
          lat: lLat,
          lng: lLng,
          label: `Última posición · ${short}${plateBit}\n${statusLabel(r.status)} · ${fmtTime(r.lastReportedAt)}${ago ? ` (${ago})` : ""}`,
          color: "orange",
        });
      }
      if (oLat !== null && oLng !== null && dLat !== null && dLng !== null) {
        routes.push({
          from: { lat: oLat, lng: oLng },
          to: { lat: dLat, lng: dLng },
          color,
        });
      }
    }
    const focused = focusId ? rows.find((s) => s.id === focusId) ?? null : null;
    return { markers, routes, focused };
  }, [filtrados, focusId, rows]);

  const filtradosOrdenados = useMemo(() => {
    const arr = [...filtrados];
    arr.sort((a, b) => {
      const ra = gpsSortRank(a);
      const rb = gpsSortRank(b);
      if (ra !== rb) return ra - rb;
      const da = a.scheduledDelivery ? new Date(a.scheduledDelivery).getTime() : 0;
      const db = b.scheduledDelivery ? new Date(b.scheduledDelivery).getTime() : 0;
      return da - db;
    });
    return arr;
  }, [filtrados]);

  /** Misma prioridad de orden global, pero en bloques por chofer para despacho. */
  const listadoPorChofer = useMemo(() => {
    const byKey = new Map<string, ShipmentRow[]>();
    for (const s of filtradosOrdenados) {
      const key = s.driver?.id ?? "__sin_chofer__";
      const cur = byKey.get(key) ?? [];
      cur.push(s);
      byKey.set(key, cur);
    }
    const groups: { key: string; title: string; items: ShipmentRow[] }[] = [];
    for (const [key, items] of byKey) {
      const first = items[0];
      const title =
        key === "__sin_chofer__"
          ? "Sin chofer asignado"
          : first.driver?.fullName
            ? `${first.driver.fullName}${first.vehicle?.plate ? ` · ${first.vehicle.plate}` : ""}`
            : "Equipo (sin nombre)";
      groups.push({ key, title, items });
    }
    groups.sort((a, b) => {
      if (a.key === "__sin_chofer__") return 1;
      if (b.key === "__sin_chofer__") return -1;
      return a.title.localeCompare(b.title, "es", { sensitivity: "base" });
    });
    return groups;
  }, [filtradosOrdenados]);

  const modalGrupo = useMemo(
    () => (choferModalKey ? listadoPorChofer.find((g) => g.key === choferModalKey) ?? null : null),
    [choferModalKey, listadoPorChofer],
  );
  useEffect(() => {
    if (choferModalKey && !listadoPorChofer.some((g) => g.key === choferModalKey)) {
      setChoferModalKey(null);
    }
  }, [choferModalKey, listadoPorChofer]);
  useEffect(() => {
    if (!choferModalKey) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setChoferModalKey(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [choferModalKey]);

  const alertasGps = useMemo(() => {
    let sinSenal = 0;
    let senalVieja = 0;
    for (const s of filtrados) {
      if (num(s.lastLat) === null) sinSenal += 1;
      else if (gpsFreshness(s.lastReportedAt) === "stale") senalVieja += 1;
    }
    return { sinSenal, senalVieja };
  }, [filtrados]);

  /** Texto según por qué no hay filas (no implica que se hayan borrado datos). */
  const mensajeListaVacia = useMemo(() => {
    if (shipmentsQ.isLoading) return "";
    if (rows.length === 0) {
      return "No llegaron envíos desde el servidor (lista vacía). No es un borrado automático: revisá conexión, API o si la base tiene datos de prueba.";
    }
    const abiertos = rows.filter((s) => s.status !== "entregado" && s.status !== "rechazado");
    if (abiertos.length === 0) {
      return "Todos los envíos están entregados o rechazados. No queda operación abierta para este mapa.";
    }
    if (focusId) {
      return "El envío enfocado no está en ruta o no aplica a este listado. Usá «Volver» o tocá de nuevo la fila.";
    }
    const baseRuta = abiertos.filter((s) => EN_RUTA.has(s.status));
    if (baseRuta.length === 0) {
      return "No hay envíos en ruta (confirmado, recogido o en tránsito). Los que siguen pendientes de aprobación no se listan acá.";
    }
    return "";
  }, [rows, shipmentsQ.isLoading, focusId]);

  return (
    <div className="space-y-4">
      <header className="page-header">
        <div>
          <p className="text-xs uppercase tracking-wider text-blue-200">Operaciones</p>
          <h1 className="text-xl font-semibold">Mapa operativo y seguimiento</h1>
          <p className="mt-1 max-w-2xl text-sm text-blue-100">
            Rutas planificadas (línea recta origen–destino) y última posición del chofer. En el portal del conductor puede
            activarse envío automático cada ~1,5 min mientras el viaje está activo. Actualización cada 20 s.
          </p>
        </div>
      </header>

      {shipmentsQ.isError ? (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
          <span className="font-medium">No se pudieron cargar los envíos.</span> Reintentá en unos segundos o revisá
          conexión y que el API esté en marcha.
          {shipmentsQ.error instanceof Error && shipmentsQ.error.message ? (
            <span className="mt-1 block text-xs text-rose-900/90">Detalle: {shipmentsQ.error.message}</span>
          ) : null}
        </p>
      ) : null}

      {alertasGps.sinSenal > 0 || alertasGps.senalVieja > 0 ? (
        <div
          className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950"
          role="status"
        >
          <strong>Atención despacho:</strong>{" "}
          {alertasGps.sinSenal > 0 ? (
            <span>
              {alertasGps.sinSenal} envío{alertasGps.sinSenal !== 1 ? "s" : ""} en ruta sin señal GPS (pedir al chofer
              que envíe ubicación o active el envío automático).
            </span>
          ) : null}
          {alertasGps.sinSenal > 0 && alertasGps.senalVieja > 0 ? " " : null}
          {alertasGps.senalVieja > 0 ? (
            <span>
              {alertasGps.senalVieja} con señal de hace más de ~40 min (confirmar que siga en ruta).
            </span>
          ) : null}
        </div>
      ) : null}

      {focusId ? (
        <div className="flex justify-end md:justify-start">
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            onClick={() => applyMapFocus(null)}
            title="Ver todos los envíos en el mapa"
          >
            <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden />
            Volver
          </button>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-2 lg:col-span-3">
          <RouteMap
            title={`Mapa (${filtrados.length} envío${filtrados.length !== 1 ? "s" : ""})`}
            markers={markers}
            routes={routes}
            heightClass="h-[min(520px,70vh)] min-h-[280px]"
          />
          <div className="flex flex-wrap gap-3 text-[11px] text-slate-600">
            <span>
              <span className="mr-1 inline-block h-2 w-2 rounded-full bg-blue-600" /> Origen
            </span>
            <span>
              <span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-600" /> Destino
            </span>
            <span>
              <span className="mr-1 inline-block h-2 w-2 rounded-full bg-orange-500" /> Última posición chofer
            </span>
            <span className="text-slate-500">Solo envíos en ruta. La línea no es navegación por calles.</span>
          </div>
        </div>

        <div className="flex max-h-[min(520px,70vh)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:col-span-2">
          {focused ? (
            <div className="shrink-0 border-b border-slate-100 px-3 py-2">
              <h2 className="text-sm font-semibold text-slate-800">Envío en foco</h2>
              <p className="text-xs text-slate-500">
                El listado de choferes está oculto. Usá <strong>Quitar foco</strong> o <strong>Volver</strong> arriba para
                volver a verlo.
              </p>
            </div>
          ) : (
            <div className="shrink-0 border-b border-slate-100 px-3 py-2">
              <h2 className="text-sm font-semibold text-slate-800">Choferes en ruta</h2>
              <p className="text-xs text-slate-500">
                Choferes con envío activo (confirmado, recogido o en tránsito). Tocá uno → lista; tocá un envío → mapa.
                GPS: &lt;12 min, regular o &gt;40 min.
              </p>
            </div>
          )}
          {focused ? (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <MapFocusedShipmentPanel s={focused} onClear={() => applyMapFocus(null)} />
            </div>
          ) : null}
          {!focused ? (
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {shipmentsQ.isLoading ? (
                <p className="text-sm text-slate-500">Cargando…</p>
              ) : filtradosOrdenados.length === 0 ? (
                <p className="text-sm text-slate-500">{mensajeListaVacia}</p>
              ) : (
                <ul className="space-y-2">
                  {listadoPorChofer.map((g) => {
                    const first = g.items[0]!;
                    const isUn = g.key === "__sin_chofer__";
                    const displayName = isUn ? g.title : first.driver?.fullName ?? g.title;
                    return (
                      <li key={g.key}>
                        <button
                          type="button"
                          onClick={() => setChoferModalKey(g.key)}
                          className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-left shadow-sm transition hover:border-blue-300 hover:bg-blue-50/80"
                          title={g.title}
                        >
                          <DriverFace
                            name={displayName}
                            avatarUrl={first.driver?.avatarUrl}
                            unassigned={isUn}
                            className="h-12 w-12 text-sm"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-slate-900">{displayName}</p>
                            <p className="truncate text-xs text-slate-600">{vehicleSubtitle(first, g.key)}</p>
                          </div>
                          <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-700">
                            {g.items.length}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {choferModalKey && modalGrupo ? (
        <div
          className="fixed inset-0 z-[86] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mapa-chofer-modal-title"
          onClick={() => setChoferModalKey(null)}
        >
          <div
            className="flex min-h-0 max-h-[min(85vh,640px)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:max-h-[min(80vh,560px)] sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
              {(() => {
                const hFirst = modalGrupo.items[0]!;
                const hUn = modalGrupo.key === "__sin_chofer__";
                const hName = hUn ? modalGrupo.title : hFirst.driver?.fullName ?? modalGrupo.title;
                return (
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <DriverFace
                      name={hName}
                      avatarUrl={hFirst.driver?.avatarUrl}
                      unassigned={hUn}
                      className="h-14 w-14 text-base"
                    />
                    <div className="min-w-0">
                      <h3 id="mapa-chofer-modal-title" className="text-base font-semibold text-slate-900">
                        {hName}
                      </h3>
                      <p className="text-xs text-slate-600">{vehicleSubtitle(hFirst, modalGrupo.key)}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {modalGrupo.items.length} envío{modalGrupo.items.length !== 1 ? "s" : ""} en ruta
                      </p>
                    </div>
                  </div>
                );
              })()}
              <button
                type="button"
                className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                onClick={() => setChoferModalKey(null)}
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="border-b border-slate-100 bg-slate-50/80 px-4 py-2 text-xs text-slate-600">
              Tocá un envío → mapa y ficha (se cierra la ventana).
            </p>
            <ul className="min-h-0 flex-1 divide-y divide-slate-200 overflow-y-auto">
              {modalGrupo.items.map((s) => (
                <ShipmentListRowButton
                  key={s.id}
                  s={s}
                  showVehicleInSubtitle={modalGrupo.key === "__sin_chofer__"}
                  focusId={focusId}
                  onRowClick={(id) => {
                    applyMapFocus(focusId === id ? null : id);
                    setChoferModalKey(null);
                  }}
                />
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}
