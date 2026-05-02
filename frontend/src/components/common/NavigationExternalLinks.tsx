import type { ReactNode } from "react";
import {
  appleMapsDirectionsTo,
  googleMapsDirectionsTo,
  openInNewTab,
  toLatLng,
  wazeNavigateTo,
} from "../../lib/externalNavigation.js";

type Stop = {
  title: string;
  address: string;
  lat?: unknown;
  lng?: unknown;
};

type Props = {
  pickup: Stop;
  delivery: Stop;
  /** Texto corto encima de los botones */
  intro?: string;
  className?: string;
  /** Un solo bloque colapsable "Navegar" en lugar de dos tarjetas repetidas */
  menuStyle?: "default" | "unified";
};

function linksForStop(stop: Stop): { google: string | null; waze: string | null; apple: string | null } {
  const coords = toLatLng(stop.lat, stop.lng);
  const google = googleMapsDirectionsTo({ coords, address: stop.address });
  const waze = wazeNavigateTo({ coords, address: stop.address });
  const apple = appleMapsDirectionsTo({ coords, address: stop.address });
  return { google, waze, apple };
}

function LinkBtn({
  children,
  onClick,
  tone,
}: {
  children: ReactNode;
  onClick: () => void;
  tone: "slate" | "green" | "blue";
}) {
  const tones = {
    slate: "border-slate-300 bg-white hover:bg-slate-50 text-slate-800",
    green: "border-green-600 bg-green-600 hover:bg-green-500 text-white",
    blue: "border-blue-600 bg-blue-600 hover:bg-blue-500 text-white",
  } as const;
  return (
    <button
      type="button"
      className={`rounded border px-2 py-1.5 text-[11px] font-semibold ${tones[tone]}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function NavigationExternalLinks({
  pickup,
  delivery,
  intro,
  className = "",
  menuStyle = "default",
}: Props) {
  const p = linksForStop(pickup);
  const d = linksForStop(delivery);

  const body = (
    <div className="mt-2 space-y-2">
      <StopRow title={pickup.title} google={p.google} waze={p.waze} apple={p.apple} />
      <StopRow title={delivery.title} google={d.google} waze={d.waze} apple={d.apple} />
    </div>
  );

  if (menuStyle === "unified") {
    return (
      <div className={`rounded-lg border border-slate-200 bg-slate-50 ${className}`}>
        <details className="group p-2" open>
          <summary className="cursor-pointer list-none text-sm font-semibold text-slate-800 [&::-webkit-details-marker]:hidden">
            <span className="mr-1 inline-block text-slate-500 transition group-open:rotate-90">▸</span>
            Navegar (Maps, Waze, Apple)
          </summary>
          <p className="mt-1 text-[10px] leading-snug text-slate-600">
            {intro ??
              "Se abre en otra app o pestaña; volvé acá para seguir el pedido."}
          </p>
          {body}
        </details>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border border-slate-200 bg-slate-50 p-2 ${className}`}>
      <p className="text-[10px] leading-snug text-slate-600">
        {intro ??
          "La navegación se abre en otra pestaña o app: esta ventana de Transport Pro queda abierta para seguir usando el panel."}
      </p>
      {body}
    </div>
  );
}

function StopRow({
  title,
  google,
  waze,
  apple,
}: {
  title: string;
  google: string | null;
  waze: string | null;
  apple: string | null;
}) {
  return (
    <div className="rounded border border-slate-200 bg-white p-1.5">
      <p className="mb-1 text-[10px] font-semibold text-slate-700">{title}</p>
      <div className="flex flex-wrap gap-1">
        {google ? (
          <LinkBtn tone="green" onClick={() => openInNewTab(google)}>
            Google Maps
          </LinkBtn>
        ) : null}
        {waze ? (
          <LinkBtn tone="blue" onClick={() => openInNewTab(waze)}>
            Waze
          </LinkBtn>
        ) : null}
        {apple ? (
          <LinkBtn tone="slate" onClick={() => openInNewTab(apple)}>
            Apple Maps
          </LinkBtn>
        ) : null}
        {!google && !waze && !apple ? (
          <span className="text-[10px] text-slate-400">Sin coordenadas ni dirección para navegar.</span>
        ) : null}
      </div>
    </div>
  );
}

/** Una sola parada (p. ej. solo destino). */
export function NavigationExternalSingle({
  title,
  address,
  lat,
  lng,
  className = "",
}: {
  title: string;
  address: string;
  lat?: unknown;
  lng?: unknown;
  className?: string;
}) {
  const coords = toLatLng(lat, lng);
  const google = googleMapsDirectionsTo({ coords, address });
  const waze = wazeNavigateTo({ coords, address });
  const apple = appleMapsDirectionsTo({ coords, address });
  return (
    <div className={`rounded-lg border border-slate-200 bg-slate-50 p-2 ${className}`}>
      <p className="text-[10px] text-slate-600">
        Abrí la navegación en otra pestaña y volvé acá para seguir el pedido en Transport Pro.
      </p>
      <p className="mt-1 text-[10px] font-semibold text-slate-700">{title}</p>
      <div className="mt-1 flex flex-wrap gap-1">
        {google ? (
          <LinkBtn tone="green" onClick={() => openInNewTab(google)}>
            Google Maps
          </LinkBtn>
        ) : null}
        {waze ? (
          <LinkBtn tone="blue" onClick={() => openInNewTab(waze)}>
            Waze
          </LinkBtn>
        ) : null}
        {apple ? (
          <LinkBtn tone="slate" onClick={() => openInNewTab(apple)}>
            Apple Maps
          </LinkBtn>
        ) : null}
      </div>
    </div>
  );
}
