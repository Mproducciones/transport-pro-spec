/**
 * Utilidades de contacto para Chile (formato +56).
 * Maneja teléfonos con o sin prefijo, normaliza para tel:/wa.me.
 */

/** Limpia un teléfono dejando solo dígitos (descarta espacios, paréntesis, guiones). */
export function digits(phone?: string | null): string {
  if (!phone) return "";
  return phone.replace(/\D+/g, "");
}

/**
 * Normaliza al formato internacional E.164 sin "+".
 * Heurística para Chile: si el número empieza con 9 y tiene 9 dígitos, agrega 56.
 * Si tiene 11 dígitos y empieza con 56, lo respeta.
 */
export function toE164Chile(phone?: string | null): string {
  const d = digits(phone);
  if (!d) return "";
  if (d.startsWith("56") && d.length >= 11) return d;
  if (d.length === 9) return `56${d}`; // celular CL: 9XXXXXXXX
  if (d.length === 8) return `569${d}`; // sin el 9 inicial
  return d;
}

/** URL para abrir el discador del dispositivo. */
export function telHref(phone?: string | null): string | null {
  const d = digits(phone);
  if (!d) return null;
  // Mantenemos el "+" para móviles
  const e = toE164Chile(phone);
  return `tel:+${e}`;
}

/** URL de WhatsApp Web/App con mensaje opcional. */
export function whatsappHref(phone?: string | null, message?: string): string | null {
  const e = toE164Chile(phone);
  if (!e) return null;
  const text = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${e}${text}`;
}

/** URL para abrir el cliente de email. */
export function mailHref(email?: string | null, subject?: string, body?: string): string | null {
  if (!email) return null;
  const params: string[] = [];
  if (subject) params.push(`subject=${encodeURIComponent(subject)}`);
  if (body) params.push(`body=${encodeURIComponent(body)}`);
  const qs = params.length > 0 ? `?${params.join("&")}` : "";
  return `mailto:${email}${qs}`;
}

/** Validación simple para mostrar el botón "Llamar" / "WhatsApp" solo si parece un número real. */
export function isLikelyValidPhone(phone?: string | null): boolean {
  const d = digits(phone);
  return d.length >= 8 && d.length <= 15;
}

/** Formato visual estándar: +56 9 1234 5678 (chileno) */
export function formatPhoneCL(phone?: string | null): string {
  const e = toE164Chile(phone);
  if (!e) return "";
  if (e.startsWith("56") && e.length === 11) {
    // 56 9 1234 5678
    return `+${e.slice(0, 2)} ${e.slice(2, 3)} ${e.slice(3, 7)} ${e.slice(7)}`;
  }
  return `+${e}`;
}
