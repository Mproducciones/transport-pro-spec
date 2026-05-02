/** Preferencia: alertas sonoras ante mensajes nuevos del chofer (admin). */
const STORAGE_KEY = "tp_driver_msg_sound_enabled";

/** Sin valor guardado: activado (misma idea que alertas de envíos en admin). */
export function isDriverMessageSoundEnabled(): boolean {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === null) return true;
    return v === "1";
  } catch {
    return true;
  }
}

export function setDriverMessageSoundEnabled(on: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event("tp-driver-msg-sound"));
}

let sharedCtx: AudioContext | null = null;

function getAudioContextClass(): typeof AudioContext | null {
  const w = window as unknown as { webkitAudioContext?: typeof AudioContext };
  return window.AudioContext ?? w.webkitAudioContext ?? null;
}

/**
 * Debe llamarse tras un gesto del usuario (click) para cumplir políticas del navegador.
 */
export async function unlockDriverMessageAudio(): Promise<AudioContext | null> {
  const Ctor = getAudioContextClass();
  if (!Ctor) return null;
  try {
    if (!sharedCtx) sharedCtx = new Ctor();
    if (sharedCtx.state === "suspended") await sharedCtx.resume();
    return sharedCtx;
  } catch {
    return null;
  }
}

/** Dos tonos cortos (urgencia). */
export async function playDriverMessageAlertDouble(): Promise<void> {
  const ctx = (await unlockDriverMessageAudio()) ?? sharedCtx;
  if (!ctx) return;
  const now = ctx.currentTime;
  const scheduleBeep = (start: number) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(880, start);
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(0.1, start + 0.02);
    g.gain.linearRampToValueAtTime(0, start + 0.13);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(start);
    o.stop(start + 0.14);
  };
  scheduleBeep(now);
  scheduleBeep(now + 0.2);
}
