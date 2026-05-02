import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../api/client.js";
import { isDriverMessageSoundEnabled, playDriverMessageAlertDouble } from "../lib/driverMessageAlerts.js";

type SupportMsgLite = { id: string; authorRole?: string; author?: { role?: string } | null };

function isFromConductor(m: SupportMsgLite): boolean {
  return m.authorRole === "conductor" || m.author?.role === "conductor";
}

/**
 * Sondeo ligero en todo el panel admin: si llega un mensaje nuevo del chofer y el usuario activó el sonido, reproduce alerta.
 * Query key alineada con la bandeja sin filtro para aprovechar caché de React Query.
 */
export function useDriverMessageSoundAlerts() {
  const [soundOn, setSoundOn] = useState(isDriverMessageSoundEnabled);

  useEffect(() => {
    const sync = () => setSoundOn(isDriverMessageSoundEnabled());
    window.addEventListener("tp-driver-msg-sound", sync);
    return () => window.removeEventListener("tp-driver-msg-sound", sync);
  }, []);

  const initialized = useRef(false);
  const prevConductorIds = useRef<Set<string>>(new Set());

  const q = useQuery({
    queryKey: ["support", "messages", "admin", ""],
    queryFn: () => apiGet<SupportMsgLite[]>("/support/messages"),
    refetchInterval: 12_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    staleTime: 8_000,
  });

  useEffect(() => {
    if (q.data === undefined) return;
    const rows = q.data;
    const conductorIds = new Set(rows.filter(isFromConductor).map((m) => m.id));

    if (!initialized.current) {
      if (rows.length === 0) {
        prevConductorIds.current = new Set();
        initialized.current = true;
        return;
      }
      prevConductorIds.current = conductorIds;
      initialized.current = true;
      return;
    }

    if (!soundOn) {
      prevConductorIds.current = conductorIds;
      return;
    }

    let hasNewFromDriver = false;
    for (const id of conductorIds) {
      if (!prevConductorIds.current.has(id)) {
        hasNewFromDriver = true;
        break;
      }
    }

    prevConductorIds.current = conductorIds;

    if (hasNewFromDriver) {
      void playDriverMessageAlertDouble();
    }
  }, [q.data, soundOn]);
}
