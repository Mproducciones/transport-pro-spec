/** Rango local inclusivo (misma semántica que `historyPeriod` en el frontend). */
export function periodBounds(period: "day" | "week" | "month", anchor: Date): { start: Date; end: Date } {
  const a = new Date(anchor);
  if (Number.isNaN(a.getTime())) {
    const t = new Date();
    t.setHours(12, 0, 0, 0);
    return periodBounds(period, t);
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
  }
}
