import { useEffect, useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../api/client.js";

export type AddressSuggestion = { label: string; lat: number; lng: number };

type Props = {
  id?: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  /** Coordenadas cuando el usuario elige una sugerencia; null si escribe a mano o borra. */
  onResolvedCoords: (coords: { lat: number; lng: number } | null) => void;
  hint?: string;
  placeholder?: string;
};

export function AddressAutocomplete({ label, value, onChange, onResolvedCoords, hint, placeholder, id }: Props) {
  const listId = useId();
  const inputId = id ?? listId.replace(/:/g, "");
  const [open, setOpen] = useState(false);
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value.trim()), 380);
    return () => window.clearTimeout(t);
  }, [value]);

  const q = useQuery({
    queryKey: ["geocode-suggestions", debounced],
    queryFn: () => apiGet<AddressSuggestion[]>("/geocode/suggestions", { q: debounced }),
    enabled: debounced.length >= 3,
    staleTime: 60_000,
  });

  const items = q.data ?? [];
  const showList = open && debounced.length >= 3 && (items.length > 0 || q.isFetching);

  return (
    <div className="relative">
      <label htmlFor={inputId} className="mt-2 block text-xs text-slate-600">
        {label}
      </label>
      <input
        id={inputId}
        className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onResolvedCoords(null);
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 200);
        }}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
      />
      {hint ? <p className="mt-0.5 text-[10px] text-slate-500">{hint}</p> : null}
      {showList ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-0.5 max-h-56 w-full overflow-auto rounded border border-slate-200 bg-white py-1 text-left text-xs shadow-lg"
        >
          {q.isFetching && items.length === 0 ? (
            <li className="px-2 py-1.5 text-slate-500">Buscando direcciones…</li>
          ) : null}
          {items.map((s, i) => (
            <li key={`${s.lat}-${s.lng}-${i}`} role="presentation">
              <button
                type="button"
                role="option"
                className="w-full px-2 py-1.5 text-left hover:bg-orange-50"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(s.label);
                  onResolvedCoords({ lat: s.lat, lng: s.lng });
                  setOpen(false);
                }}
              >
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
