import { useEffect, useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { KeyRound, MapPin } from "lucide-react";
import { apiSend } from "../../api/client.js";
import { PortalShell } from "../PortalShell.js";
import { notify } from "../../lib/notify.js";
import {
  DRIVER_MAP_PREF_CHOICES,
  clearDriverMapOpenPreference,
  readDriverMapOpenPreference,
  writeDriverMapOpenPreference,
  type DriverMapOpenPreference,
} from "../../lib/driverMapPreference.js";

export function ConductorCuentaPage() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [mapOpenMode, setMapOpenMode] = useState<"" | DriverMapOpenPreference>(() => readDriverMapOpenPreference() ?? "");

  useEffect(() => {
    setMapOpenMode(readDriverMapOpenPreference() ?? "");
  }, []);

  function applyMapOpenMode(v: "" | DriverMapOpenPreference) {
    setMapOpenMode(v);
    if (v === "") clearDriverMapOpenPreference();
    else writeDriverMapOpenPreference(v);
    notify("success", "Preferencia de mapa guardada en este dispositivo.");
  }

  const mut = useMutation({
    mutationFn: () =>
      apiSend<{ ok: boolean }>("/me/password", "PATCH", {
        currentPassword: current,
        newPassword: next,
      }),
    onSuccess: () => {
      notify("success", "Contraseña actualizada. Usá la nueva en el próximo inicio de sesión.");
      setCurrent("");
      setNext("");
      setConfirm("");
    },
    onError: (e: Error) => notify("error", e.message),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (next !== confirm) {
      notify("error", "La nueva contraseña y la repetición no coinciden.");
      return;
    }
    if (next.length < 8) {
      notify("error", "La nueva contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (current === next) {
      notify("error", "Elegí una contraseña distinta a la actual.");
      return;
    }
    mut.mutate();
  }

  return (
    <PortalShell title="Tu cuenta" basePath="/driver/viaje-activo">
      <div id="viajes" className="mx-auto max-w-md space-y-4">
        <section
          id="mapa-chofer"
          className="scroll-mt-6 rounded-xl border-2 border-green-300 bg-white p-4 shadow-sm"
        >
          <h2 className="mb-1 flex items-center gap-2 text-lg font-bold text-slate-900">
            <MapPin className="h-6 w-6 text-green-700" aria-hidden />
            Mapa al tocar «Ver en mapa»
          </h2>
          <p className="mb-3 text-sm text-slate-600">
            Elegí con qué app abrir la ruta por defecto. Solo aplica en <strong className="font-medium text-slate-800">este teléfono o navegador</strong>;
            no tiene costo. Si elegís «Preguntar cada vez», volvés a ver el selector como la primera vez.
          </p>
          <fieldset className="space-y-2">
            <legend className="sr-only">Preferencia de mapa</legend>
            {DRIVER_MAP_PREF_CHOICES.map((opt) => (
              <label
                key={opt.value === "" ? "ask" : opt.value}
                className={`flex cursor-pointer gap-3 rounded-lg border-2 p-3 text-left transition ${
                  mapOpenMode === opt.value
                    ? "border-green-600 bg-green-50 ring-2 ring-green-200/80"
                    : "border-slate-200 bg-slate-50/80 hover:border-green-300"
                }`}
              >
                <input
                  type="radio"
                  className="mt-0.5 h-4 w-4 border-slate-300 text-green-700 focus:ring-green-600"
                  name="driver-map-pref"
                  checked={mapOpenMode === opt.value}
                  onChange={() => applyMapOpenMode(opt.value === "" ? "" : opt.value)}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-slate-900">{opt.label}</span>
                  {opt.hint ? <span className="mt-0.5 block text-xs text-slate-600">{opt.hint}</span> : null}
                </span>
              </label>
            ))}
          </fieldset>
        </section>

        <section className="rounded-xl border border-green-200 bg-white p-4 shadow-sm">
        <h2 className="mb-1 flex items-center gap-2 text-lg font-bold text-slate-900">
          <KeyRound className="h-6 w-6 text-green-700" aria-hidden />
          Cambiar contraseña
        </h2>
        <p className="mb-4 text-sm text-slate-600">
          Necesitás la clave que te dio la empresa. La nueva debe tener al menos 8 caracteres.
        </p>
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label htmlFor="cur-pw" className="mb-1 block text-sm font-medium text-slate-700">
              Contraseña actual
            </label>
            <input
              id="cur-pw"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 shadow-sm focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-600"
              required
            />
          </div>
          <div>
            <label htmlFor="new-pw" className="mb-1 block text-sm font-medium text-slate-700">
              Nueva contraseña
            </label>
            <input
              id="new-pw"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 shadow-sm focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-600"
              minLength={8}
              required
            />
          </div>
          <div>
            <label htmlFor="new-pw2" className="mb-1 block text-sm font-medium text-slate-700">
              Repetir nueva contraseña
            </label>
            <input
              id="new-pw2"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 shadow-sm focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-600"
              minLength={8}
              required
            />
          </div>
          <button
            type="submit"
            disabled={mut.isPending}
            className="w-full rounded-lg bg-green-700 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {mut.isPending ? "Guardando…" : "Guardar nueva contraseña"}
          </button>
        </form>
        </section>
      </div>
    </PortalShell>
  );
}
