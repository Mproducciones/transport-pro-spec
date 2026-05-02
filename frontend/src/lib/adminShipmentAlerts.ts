import { unlockDriverMessageAudio } from "./driverMessageAlerts.js";

/** Alertas de envíos (pendiente / rechazado): sonido al aparecer un caso nuevo. */
const STORAGE_KEY = "tp_admin_shipment_alert_sound";

export function isShipmentAlertSoundEnabled(): boolean {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === null) return true;
    return v === "1";
  } catch {
    return true;
  }
}

export function setShipmentAlertSoundEnabled(on: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event("tp-shipment-alert-sound"));
}

/** Tono corto (menos intrusivo que el doble beep de mensajes chofer). */
export async function playShipmentAlertBeep(): Promise<void> {
  const ctx = await unlockDriverMessageAudio();
  if (!ctx) return;
  const start = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(720, start);
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(0.08, start + 0.02);
  g.gain.linearRampToValueAtTime(0, start + 0.12);
  o.connect(g);
  g.connect(ctx.destination);
  o.start(start);
  o.stop(start + 0.13);
}
