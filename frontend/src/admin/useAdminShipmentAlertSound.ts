import { useEffect, useRef, useState } from "react";
import { isShipmentAlertSoundEnabled, playShipmentAlertBeep } from "../lib/adminShipmentAlerts.js";

/**
 * Reproduce un beep cuando aparece un id de envío alertable (pendiente/rechazado) que no estaba en el sondeo anterior.
 */
export function useAdminShipmentAlertSound(alertIdsKey: string) {
  const [soundOn, setSoundOn] = useState(isShipmentAlertSoundEnabled);

  useEffect(() => {
    const sync = () => setSoundOn(isShipmentAlertSoundEnabled());
    window.addEventListener("tp-shipment-alert-sound", sync);
    return () => window.removeEventListener("tp-shipment-alert-sound", sync);
  }, []);

  const initialized = useRef(false);
  const prev = useRef<Set<string>>(new Set());

  useEffect(() => {
    const alertIds = alertIdsKey.length > 0 ? alertIdsKey.split(",") : [];
    const next = new Set(alertIds);
    if (!initialized.current) {
      initialized.current = true;
      prev.current = next;
      return;
    }
    if (!soundOn) {
      prev.current = next;
      return;
    }
    let hasNew = false;
    for (const id of next) {
      if (!prev.current.has(id)) {
        hasNew = true;
        break;
      }
    }
    prev.current = next;
    if (hasNew) {
      void playShipmentAlertBeep();
    }
  }, [alertIdsKey, soundOn]);
}
