import { useEffect, useState } from "react";
import { onNotify } from "../../lib/notify.js";

type ToastItem = {
  id: string;
  type: "success" | "error" | "info";
  message: string;
};

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const off = onNotify((detail) => {
      setItems((prev) => [...prev, detail]);
      setTimeout(() => {
        setItems((prev) => prev.filter((x) => x.id !== detail.id));
      }, 2800);
    });
    return off;
  }, []);

  if (items.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed right-3 z-[100] space-y-2 max-md:bottom-32 max-md:top-auto md:top-3 md:bottom-auto"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      {items.map((t) => (
        <div
          key={t.id}
          className={`min-w-[240px] rounded-lg px-3 py-2 text-sm text-white shadow-lg ${
            t.type === "success"
              ? "bg-emerald-600"
              : t.type === "error"
                ? "bg-rose-600"
                : "bg-slate-700"
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
