import { X } from "lucide-react";
import { RouteMap, type MapFocusTarget, type MapMarker, type MapRoute } from "../components/common/RouteMap.js";

const shellZ =
  "fixed inset-0 z-[110] flex flex-col items-stretch justify-stretch bg-black/55 p-0 sm:bg-black/50";

type Row = {
  id: string;
  origin: string;
  destination: string;
  status: string;
  scheduledDelivery?: string | null;
  lastLat?: string | number | null;
  lastLng?: string | number | null;
  customer: { name: string };
};

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  /** true al abrir «Ver en mapa» desde un solo servicio: lista y trazas reducidas a ese envío. */
  singleServiceMode: boolean;
  markers: MapMarker[];
  routes: MapRoute[];
  mapFocus: MapFocusTarget | null;
  mapFocusShipmentId: string | null;
  activeRows: Row[];
  focusedHasDriverGps: boolean;
  onToggleMapFocus: (id: string) => void;
  onOpenFicha: (id: string) => void;
  statusLabel: (status: string) => string;
};

export function DashboardMapaOperativoFloat({
  open,
  onClose,
  title,
  singleServiceMode,
  markers,
  routes,
  mapFocus,
  mapFocusShipmentId,
  activeRows,
  focusedHasDriverGps,
  onToggleMapFocus,
  onOpenFicha,
  statusLabel,
}: Props) {
  if (!open) return null;
  const listTitle = singleServiceMode ? "Servicio" : "Rutas activas";
  return (
    <div className={shellZ} role="dialog" aria-modal="true" aria-labelledby="mapa-op-title" onClick={onClose}>
      <div
        className="flex h-[100dvh] max-h-[100dvh] w-full min-w-0 max-w-none flex-col overflow-hidden border-0 border-slate-200 bg-white shadow-none sm:mx-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-3 py-2.5 sm:px-4 sm:py-3">
          <h2 id="mapa-op-title" className="pr-2 text-sm font-semibold text-slate-900 sm:text-base">
            {title}
          </h2>
          <button
            type="button"
            className="z-[120] shrink-0 rounded-lg p-2 text-slate-600 hover:bg-slate-100"
            onClick={onClose}
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div className="shrink-0 px-2 pt-2 sm:px-3">
            <RouteMap
              title=""
              markers={markers}
              routes={routes}
              heightClass="h-[min(58dvh,560px)] min-h-[220px] sm:min-h-[280px] sm:h-[min(62dvh,600px)]"
              mapFocus={mapFocus}
            />
          </div>
          {mapFocusShipmentId && activeRows.find((x) => x.id === mapFocusShipmentId) ? (
            <p className="mt-1 px-3 text-[11px] text-slate-600 sm:px-4">
              {mapFocus ? (
                focusedHasDriverGps ? (
                  <>Centrado en la <strong>última señal del chofer</strong>.</>
                ) : (
                  <>Sin GPS del chofer: centro entre <strong>origen y destino</strong> (o el punto disponible).</>
                )
              ) : (
                <>Sin coordenadas para centrar el mapa.</>
              )}
            </p>
          ) : null}
          {activeRows.length === 0 ? (
            <p className="mt-1 px-3 text-xs text-slate-500 sm:px-4">
              {singleServiceMode
                ? "No hay datos de este envío para el mapa (aún se cargan o faltan coordenadas)."
                : "No hay rutas en curso para mostrar."}
            </p>
          ) : markers.length === 0 ? (
            <p className="mt-1 px-3 text-xs text-slate-500 sm:px-4">
              {singleServiceMode
                ? "Este envío aún no tiene puntos en el mapa (geocodificación o señal pendiente)."
                : "Hay envíos activos aún sin puntos (geocodificación pendiente en origen/destino)."}
            </p>
          ) : null}
          {activeRows.length > 0 ? (
            <div className="mt-2 border-t border-slate-100 px-2 pb-3 pt-2 sm:px-3 sm:pb-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">{listTitle}</h3>
              {singleServiceMode ? (
                <p className="mt-0.5 text-[10px] text-slate-500">Solo este servicio. Clic en la ficha o «Cerrar» para volver al tablero.</p>
              ) : (
                <p className="mt-0.5 text-[10px] text-slate-500 sm:text-[11px]">
                  Tocá ruta o cliente para la ficha. «Centrar en mapa» ajusta la vista a la señal del chofer.
                </p>
              )}
              <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-slate-50/50">
                {activeRows.map((r) => {
                  const selected = mapFocusShipmentId === r.id;
                  const hasGps = r.lastLat != null && r.lastLng != null;
                  return (
                    <li
                      key={r.id}
                      className={`flex flex-col gap-1.5 px-3 py-2.5 text-sm sm:flex-row sm:items-start sm:justify-between sm:gap-2 ${
                        selected ? "bg-blue-50/90 ring-1 ring-inset ring-blue-200" : ""
                      }`}
                    >
                      <button
                        type="button"
                        className="min-w-0 flex-1 rounded-lg text-left hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                        onClick={() => onOpenFicha(r.id)}
                      >
                        <p className="font-medium text-slate-900">
                          {r.origin} → {r.destination}
                        </p>
                        <p className="text-xs text-slate-600">
                          {r.customer.name}
                          {r.scheduledDelivery ? (
                            <>
                              {" "}
                              · Entrega:{" "}
                              <span className="tabular-nums">
                                {new Date(r.scheduledDelivery).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" })}
                              </span>
                            </>
                          ) : null}
                          {hasGps ? <span className="ml-1 text-emerald-700">· GPS</span> : <span className="ml-1 text-amber-800">· Sin GPS</span>}
                        </p>
                      </button>
                      <div className="flex shrink-0 flex-col items-stretch gap-1.5 sm:items-end">
                        <span className="self-start rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200 sm:self-end">
                          {statusLabel(r.status)}
                        </span>
                        <button
                          type="button"
                          className="whitespace-nowrap rounded-lg border border-blue-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-blue-900 hover:bg-blue-50"
                          onClick={() => onToggleMapFocus(r.id)}
                        >
                          Centrar en mapa
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </div>
        <p className="shrink-0 border-t border-slate-200 bg-slate-50 px-3 py-2 text-center text-[10px] text-slate-500 sm:px-4">
          Cerrá con la <strong className="font-semibold">X</strong> o tocá fuera del mapa. El mapa de Inicio se actualiza con la lista de abajo.
        </p>
      </div>
    </div>
  );
}
