import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CLIENTE_NAV_GROUP_LABELS, CLIENTE_NAV_ITEMS, type ClienteNavGroup } from "./clienteNavConfig.js";
import { CLIENTE_NAV_ICONS } from "./clienteNavIcons.js";

const GROUP_ORDER: ClienteNavGroup[] = ["pedidos", "cuenta"];

/**
 * Índice filtrable de todas las secciones del portal (acceso dinámico desde Pedidos u otras páginas).
 */
export function ClientePanelIndex() {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const s = query.trim().toLowerCase();
    if (!s) return CLIENTE_NAV_ITEMS;
    return CLIENTE_NAV_ITEMS.filter((item) => {
      const g = CLIENTE_NAV_GROUP_LABELS[item.group].toLowerCase();
      return (
        item.label.toLowerCase().includes(s) ||
        item.description.toLowerCase().includes(s) ||
        item.to.toLowerCase().includes(s) ||
        g.includes(s)
      );
    });
  }, [query]);

  const byGroup = useMemo(() => {
    const m = new Map<ClienteNavGroup, typeof filtered>();
    for (const g of GROUP_ORDER) m.set(g, []);
    for (const it of filtered) {
      const arr = m.get(it.group) ?? [];
      arr.push(it);
      m.set(it.group, arr);
    }
    return m;
  }, [filtered]);

  return (
    <section id="cliente-panel-index" className="scroll-mt-24 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-800">¿Buscás otra cosa?</h2>
      <p className="mt-1 text-xs text-slate-500">
        Listado buscable con las mismas rutas que el menú (y Más en el celular). Usalo si no encontraste el atajo arriba.
      </p>
      <label className="mt-3 block text-xs font-medium text-slate-600">
        Buscar
        <input
          type="search"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          placeholder="Ej. mapa, factura, comprobante, historial…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
        />
      </label>
      <p className="mt-2 text-[11px] text-slate-400">
        {filtered.length} de {CLIENTE_NAV_ITEMS.length} enlaces
      </p>
      <div className="mt-3 max-h-[420px] space-y-4 overflow-y-auto pr-1">
        {GROUP_ORDER.map((group) => {
          const items = byGroup.get(group) ?? [];
          if (items.length === 0) return null;
          return (
            <div key={group}>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                {CLIENTE_NAV_GROUP_LABELS[group]}
              </p>
              <ul className="space-y-1.5">
                {items.map((item) => {
                  const Icon = CLIENTE_NAV_ICONS[item.iconKey];
                  const inner = (
                    <>
                      <Icon size={18} className="mt-0.5 shrink-0 text-slate-600" />
                      <span>
                        <span className="block text-sm font-medium text-slate-900">{item.label}</span>
                        <span className="block text-[11px] text-slate-600">{item.description}</span>
                      </span>
                    </>
                  );
                  const className =
                    "flex gap-3 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 text-left transition hover:border-orange-200 hover:bg-orange-50/40";
                  return (
                    <li key={item.external ? `ext-${item.label}` : item.to}>
                      {item.external ? (
                        <a href={item.to} className={className}>
                          {inner}
                        </a>
                      ) : (
                        <Link to={item.to} className={className}>
                          {inner}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
      {filtered.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No hay coincidencias. Probá otra palabra o borrá el filtro.</p>
      ) : null}
    </section>
  );
}

/** Enlace discreto para páginas que no muestran el índice completo. */
export function ClientePortalNavHint() {
  return (
    <p className="text-center text-xs text-slate-500">
      <Link
        to="/cliente/pedidos#cliente-panel-index"
        className="font-medium text-orange-800 underline decoration-orange-300 hover:text-orange-950"
      >
        Buscar otra sección del portal
      </Link>
    </p>
  );
}
