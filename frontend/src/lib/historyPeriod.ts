export type HistoryPeriod = "day" | "week" | "month" | "year";

/**
 * Rango inclusivo en hora local según la fecha elegida en calendario.
 * `anchor` debe ser un instante dentro del día de referencia (p. ej. mediodía local).
 */
export function periodBounds(period: HistoryPeriod, anchor: Date): { start: Date; end: Date } {
  const a = new Date(anchor);
  if (Number.isNaN(a.getTime())) {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    return periodBounds(period, today);
  }
  a.setHours(12, 0, 0, 0);

  switch (period) {
    case "day": {
      const start = new Date(a.getFullYear(), a.getMonth(), a.getDate(), 0, 0, 0, 0);
      const end = new Date(a.getFullYear(), a.getMonth(), a.getDate(), 23, 59, 59, 999);
      return { start, end };
    }
    case "week": {
      const start = new Date(a.getFullYear(), a.getMonth(), a.getDate(), 0, 0, 0, 0);
      const mondayOffset = (start.getDay() + 6) % 7;
      start.setDate(start.getDate() - mondayOffset);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
    case "month": {
      const start = new Date(a.getFullYear(), a.getMonth(), 1, 0, 0, 0, 0);
      const end = new Date(a.getFullYear(), a.getMonth() + 1, 0, 23, 59, 59, 999);
      return { start, end };
    }
    case "year": {
      const start = new Date(a.getFullYear(), 0, 1, 0, 0, 0, 0);
      const end = new Date(a.getFullYear(), 11, 31, 23, 59, 59, 999);
      return { start, end };
    }
  }
}

export function periodShortLabel(period: HistoryPeriod): string {
  switch (period) {
    case "day":
      return "Día";
    case "week":
      return "Semana";
    case "month":
      return "Mes";
    case "year":
      return "Año";
  }
}

/** Valor para `<input type="date" />` en zona local. */
export function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Interpreta YYYY-MM-DD como fecha local (mediodía para evitar bordes DST). */
export function fromDateInputValue(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return new Date(NaN);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  return new Date(y, mo - 1, d, 12, 0, 0, 0);
}

export function periodRangeDescription(period: HistoryPeriod, anchor: Date): string {
  const { start, end } = periodBounds(period, anchor);
  const fmt = (x: Date) =>
    x.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  switch (period) {
    case "day":
      return fmt(start);
    case "week":
      return `${fmt(start)} – ${fmt(end)}`;
    case "month":
      return start.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    case "year":
      return String(start.getFullYear());
  }
}

/** Fecha de referencia para filtrar filas del historial dentro del período. */
export function historyRowTime(t: {
  status: string;
  deliveredAt?: string | null;
  createdAt?: string | null;
}): number | null {
  if (t.status === "entregado" && t.deliveredAt) {
    const d = new Date(t.deliveredAt).getTime();
    if (Number.isFinite(d)) return d;
  }
  if (t.createdAt) {
    const c = new Date(t.createdAt).getTime();
    return Number.isFinite(c) ? c : null;
  }
  return null;
}
