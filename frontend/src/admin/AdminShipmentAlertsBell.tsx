import { Bell } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { apiGet } from "../api/client.js";
import { unlockDriverMessageAudio } from "../lib/driverMessageAlerts.js";
import { isShipmentAlertSoundEnabled, setShipmentAlertSoundEnabled } from "../lib/adminShipmentAlerts.js";
import { useAdminShipmentAlertSound } from "./useAdminShipmentAlertSound.js";

type Row = {
  id: string;
  origin: string;
  destination: string;
  status: string;
  rejectionPhase?: string | null;
  createdAt: string;
  scheduledDelivery?: string | null;
  customer: { name: string };
};

/** Misma regla que el KPI «Retrasos» en Inicio (entrega vencida y viaje aún activo). */
function isEntregaAtrasada(status: string, scheduledDelivery?: string | null): boolean {
  if (!scheduledDelivery) return false;
  if (status === "entregado" || status === "rechazado") return false;
  return Date.now() > new Date(scheduledDelivery).getTime();
}

/** Ids de alertas ya abiertas en el panel: viven en sessionStorage (por pestaña). No hay limpieza por tiempo: se pierden al cerrar la pestaña. */
const SEEN_STORAGE_KEY = "tp_admin_shipment_alerts_seen_v1";

function loadSeenIds(): Set<string> {
  try {
    const raw = sessionStorage.getItem(SEEN_STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    return new Set(Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

function saveSeenIds(ids: Set<string>) {
  try {
    const list = [...ids];
    const capped = list.length > 400 ? list.slice(-400) : list;
    sessionStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(capped));
  } catch {
    /* ignore */
  }
}

function alertCopy(
  status: string,
  rejectionPhase?: string | null,
  scheduledDelivery?: string | null
): { label: string; hint: string; tone: string } {
  if (isEntregaAtrasada(status, scheduledDelivery) && status !== "pendiente") {
    return {
      label: "Entrega atrasada",
      hint: "Fecha límite pasada; revisá con operaciones o el chofer. Abrís el envío en Inicio (ficha).",
      tone: "bg-orange-100 text-orange-900",
    };
  }
  if (status === "rechazado" && rejectionPhase === "en_entrega") {
    return {
      label: "Rechazo en destino",
      hint: "Incidencia en entrega. Al tocar se abre la ficha flotante en Inicio (sin ir a la tabla de Envíos).",
      tone: "bg-rose-100 text-rose-800",
    };
  }
  return {
    label: "Pendiente de aprobar",
    hint: "Cotización o aprobación pendiente. Al tocar se abre la misma ficha flotante que para aprobar.",
    tone: "bg-amber-100 text-amber-900",
  };
}

export function AdminShipmentAlertsBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(isShipmentAlertSoundEnabled);
  const [seenIds, setSeenIds] = useState<Set<string>>(loadSeenIds);
  const rootRef = useRef<HTMLDivElement>(null);

  /** Misma caché que Inicio (evita dato desactualizado o segundo fetch innecesario). */
  const q = useQuery({
    queryKey: ["shipments", "admin-dashboard"],
    queryFn: () => apiGet<Row[]>("/shipments"),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });

  const alerts = useMemo(() => {
    const rows = q.data ?? [];
    const out: Row[] = [];
    const seen = new Set<string>();
    for (const r of rows) {
      if (seen.has(r.id)) continue;
      if (r.status === "pendiente" || (r.status === "rechazado" && r.rejectionPhase === "en_entrega")) {
        seen.add(r.id);
        out.push(r);
      }
    }
    for (const r of rows) {
      if (seen.has(r.id)) continue;
      if (isEntregaAtrasada(r.status, r.scheduledDelivery)) {
        seen.add(r.id);
        out.push(r);
      }
    }
    out.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return out.slice(0, 12);
  }, [q.data]);

  const alertIdsKey = useMemo(() => alerts.map((a) => a.id).sort().join(","), [alerts]);
  useAdminShipmentAlertSound(alertIdsKey);

  const badgeCount = useMemo(
    () => alerts.filter((a) => !seenIds.has(a.id)).length,
    [alerts, seenIds]
  );

  /**
   * Al abrir el panel (o al terminar de cargar la lista mientras está abierto), esos ids se consideran vistos.
   * Mientras el panel esté cerrado, un id nuevo (no visto) sigue contando en el globo.
   */
  const lastAckedListKeyForOpen = useRef<string | null>(null);
  useEffect(() => {
    if (!open) {
      lastAckedListKeyForOpen.current = null;
      return;
    }
    if (q.isLoading) return;
    const idsFromKey = alertIdsKey.length > 0 ? alertIdsKey.split(",") : [];
    if (idsFromKey.length === 0) {
      lastAckedListKeyForOpen.current = null;
      return;
    }
    if (lastAckedListKeyForOpen.current === alertIdsKey) return;
    lastAckedListKeyForOpen.current = alertIdsKey;
    setSeenIds((prev) => {
      const next = new Set(prev);
      for (const id of idsFromKey) next.add(id);
      saveSeenIds(next);
      return next;
    });
  }, [open, alertIdsKey, q.isLoading]);

  useEffect(() => {
    const sync = () => setSoundOn(isShipmentAlertSoundEnabled());
    window.addEventListener("tp-shipment-alert-sound", sync);
    return () => window.removeEventListener("tp-shipment-alert-sound", sync);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const el = rootRef.current;
      if (el && !el.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={rootRef} className="pointer-events-auto relative">
      <button
        type="button"
        className="relative flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-md transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`Alertas de envíos${badgeCount > 0 ? `: ${badgeCount} sin revisar` : ""}`}
        onClick={() => {
          void unlockDriverMessageAudio();
          setOpen((v) => !v);
        }}
      >
        <Bell size={20} strokeWidth={2} />
        {badgeCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex min-w-[1.1rem] justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold leading-5 text-white">
            {badgeCount > 9 ? "9+" : badgeCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute bottom-[calc(100%+0.5rem)] right-0 z-[200] w-[min(calc(100vw-1.5rem),20rem)] rounded-xl border border-slate-200 bg-white py-2 shadow-xl">
          <div className="border-b border-slate-100 px-3 pb-2">
            <p className="text-xs font-semibold text-slate-800">Alertas de envíos</p>
            <p className="text-[11px] text-slate-500">
              Pendientes, rechazos en destino y entregas atrasadas: al tocar vas a <strong>Inicio</strong> y se abre la{" "}
              <strong>ficha flotante</strong> del envío (mismo panel que para aprobar o gestionar), sin abrir la tabla de Envíos.
            </p>
          </div>
          <div className="max-h-[min(60vh,22rem)] overflow-y-auto">
            {q.isLoading ? <p className="px-3 py-4 text-xs text-slate-500">Cargando…</p> : null}
            {q.isError ? (
              <p className="px-3 py-4 text-xs text-rose-600">{(q.error as Error).message}</p>
            ) : null}
            {!q.isLoading && !q.isError && alerts.length === 0 ? (
              <p className="px-3 py-4 text-xs text-slate-500">No hay alertas de este tipo ahora.</p>
            ) : null}
            {alerts.map((s) => {
              const { label, hint, tone } = alertCopy(s.status, s.rejectionPhase, s.scheduledDelivery);
              return (
                <button
                  key={s.id}
                  type="button"
                  className="block w-full border-b border-slate-50 px-3 py-2.5 text-left last:border-b-0 hover:bg-slate-50"
                  onClick={() => {
                    setOpen(false);
                    navigate(`/admin/dashboard?envio=${encodeURIComponent(s.id)}`);
                  }}
                >
                  <p className="text-xs font-semibold text-slate-900 line-clamp-2">
                    {s.origin} → {s.destination}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-600">Cliente: {s.customer.name}</p>
                  <p className="mt-1 text-[11px] text-slate-500">{hint}</p>
                  <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${tone}`}>{label}</span>
                </button>
              );
            })}
          </div>
          <label className="flex cursor-pointer items-center gap-2 border-t border-slate-100 px-3 py-2 text-[11px] text-slate-600">
            <input
              type="checkbox"
              checked={soundOn}
              onChange={(e) => {
                setShipmentAlertSoundEnabled(e.target.checked);
                setSoundOn(e.target.checked);
              }}
            />
            Sonido al detectar alertas nuevas
          </label>
        </div>
      ) : null}
    </div>
  );
}
