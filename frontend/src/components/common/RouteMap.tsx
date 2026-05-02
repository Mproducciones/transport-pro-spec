import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L, { LatLngBoundsExpression, LatLngExpression } from "leaflet";
import "leaflet/dist/leaflet.css";

import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";

const DefaultIcon = L.icon({
  iconRetinaUrl,
  iconUrl,
  shadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

export type MapMarker = {
  lat: number;
  lng: number;
  label?: string;
  color?: "blue" | "green" | "orange" | "red";
};

export type MapRoute = {
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
  color?: string;
};

export type MapFocusTarget = { lat: number; lng: number; zoom?: number };

type RouteMapProps = {
  markers?: MapMarker[];
  routes?: MapRoute[];
  heightClass?: string;
  title?: string;
  /** Centra el mapa aquí (p. ej. última posición del chofer). Si es null, ajusta a todos los marcadores. */
  mapFocus?: MapFocusTarget | null;
  /**
   * Si true, ignora `mapFocus` y encuadra todos los marcadores (ruta y puntos se entienden juntos; útil en ficha de un envío).
   * Valor por defecto false: se respeta el foco (p. ej. «centrar en mapa» en el tablero con varios activos).
   */
  frameAllMarkers?: boolean;
};

/** Ajusta vista tras abrir en modal o cambiar layout (Leaflet a veces calcula mal el tamaño). */
function MapInvalidateSize() {
  const map = useMap();
  useEffect(() => {
    const run = () => {
      try {
        map.invalidateSize();
      } catch {
        // noop
      }
    };
    run();
    const t0 = window.setTimeout(run, 100);
    const t1 = window.setTimeout(run, 350);
    return () => {
      clearTimeout(t0);
      clearTimeout(t1);
    };
  }, [map]);
  useEffect(() => {
    const onResize = () => {
      try {
        map.invalidateSize();
      } catch {
        // noop
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [map]);
  return null;
}

function MapViewSync({
  markers,
  mapFocus,
  frameAllMarkers = false,
}: {
  markers: MapMarker[];
  mapFocus?: MapFocusTarget | null;
  frameAllMarkers?: boolean;
}) {
  const map = useMap();
  const positionsKey = useMemo(() => markers.map((m) => `${m.lat},${m.lng}`).join("|"), [markers]);
  useEffect(() => {
    if (frameAllMarkers) {
      if (markers.length === 0) return;
      if (markers.length > 1) {
        const bounds: LatLngBoundsExpression = markers.map((m) => [m.lat, m.lng] as [number, number]);
        map.fitBounds(bounds, { padding: [56, 56], maxZoom: 15, animate: true });
      } else {
        map.setView([markers[0].lat, markers[0].lng], 12);
      }
      map.invalidateSize();
      return;
    }
    if (mapFocus) {
      map.flyTo([mapFocus.lat, mapFocus.lng], mapFocus.zoom ?? 14, { duration: 0.5 });
      map.invalidateSize();
      return;
    }
    if (markers.length === 0) return;
    if (markers.length === 1) {
      map.setView([markers[0].lat, markers[0].lng], 13);
      map.invalidateSize();
      return;
    }
    const bounds: LatLngBoundsExpression = markers.map((m) => [m.lat, m.lng] as [number, number]);
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16, animate: true });
    map.invalidateSize();
  }, [map, frameAllMarkers, positionsKey, markers, mapFocus?.lat, mapFocus?.lng, mapFocus?.zoom]);
  return null;
}

const coloredIcon = (color: MapMarker["color"]) => {
  const fill =
    color === "green"
      ? "#10b981"
      : color === "orange"
      ? "#f97316"
      : color === "red"
      ? "#ef4444"
      : "#2563eb";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="40" viewBox="0 0 28 40">
      <path d="M14 0C6.3 0 0 6.3 0 14c0 10 14 26 14 26s14-16 14-26C28 6.3 21.7 0 14 0z" fill="${fill}"/>
      <circle cx="14" cy="14" r="5" fill="white"/>
    </svg>`;
  return L.divIcon({
    className: "",
    html: svg,
    iconSize: [28, 40],
    iconAnchor: [14, 40],
    popupAnchor: [0, -34],
  });
};

export function RouteMap({
  markers = [],
  routes = [],
  heightClass = "h-64",
  title,
  mapFocus = null,
  frameAllMarkers = false,
}: RouteMapProps) {
  const defaultCenter: LatLngExpression = [-33.45, -70.65]; // Santiago, Chile
  const hasMarkers = markers.length > 0;
  const initialCenter: LatLngExpression = hasMarkers
    ? [markers[0].lat, markers[0].lng]
    : defaultCenter;

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      {title ? (
        <div className="flex items-center justify-between px-4 py-2">
          <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
          <span className="text-[11px] text-slate-400">OpenStreetMap</span>
        </div>
      ) : null}
      {/*
        Leaflet usa z-index altos en los paneles (400+). Sin un contexto de apilamiento propio,
        el mapa gana al menú fijo (z-50). isolate + z-0 mantiene todo el mapa “debajo” del chrome UI.
      */}
      <div
        className={`relative z-0 isolate w-full overflow-hidden ${title ? "rounded-b-xl" : "rounded-xl"} ${heightClass}`}
      >
        <MapContainer
          center={initialCenter}
          zoom={hasMarkers ? 11 : 5}
          scrollWheelZoom={false}
          className="!relative z-0 h-full w-full"
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {markers.map((m, i) => (
            <Marker key={i} position={[m.lat, m.lng]} icon={coloredIcon(m.color)}>
              {m.label ? <Popup>{m.label}</Popup> : null}
            </Marker>
          ))}
          {routes.map((r, i) => (
            <Polyline
              key={`r-${i}`}
              positions={[
                [r.from.lat, r.from.lng],
                [r.to.lat, r.to.lng],
              ]}
              pathOptions={{ color: r.color ?? "#2563eb", weight: 3, opacity: 0.6, dashArray: "6 6" }}
            />
          ))}
          <MapInvalidateSize />
          <MapViewSync markers={markers} mapFocus={mapFocus} frameAllMarkers={frameAllMarkers} />
        </MapContainer>
      </div>
    </div>
  );
}
