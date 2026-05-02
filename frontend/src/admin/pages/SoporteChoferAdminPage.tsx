import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { PanelRightClose, Volume2 } from "lucide-react";
import { apiGet, apiSend } from "../../api/client.js";
import {
  isDriverMessageSoundEnabled,
  playDriverMessageAlertDouble,
  setDriverMessageSoundEnabled,
  unlockDriverMessageAudio,
} from "../../lib/driverMessageAlerts.js";
import { notify } from "../../lib/notify.js";

type SupportRow = {
  id: string;
  body: string;
  createdAt: string;
  authorRole: string;
  driver: { id: string; fullName: string };
  shipment: { id: string; origin: string; destination: string } | null;
  author: { email: string; role: string };
};
type DriverRow = {
  id: string;
  fullName: string;
  assignedVehicle?: { plate: string } | null;
};

function isFromDriver(m: SupportRow): boolean {
  return m.authorRole === "conductor";
}

export function SoporteChoferAdminPage() {
  const qc = useQueryClient();
  const [driverFilter, setDriverFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [soundAlerts, setSoundAlerts] = useState(() => isDriverMessageSoundEnabled());

  useEffect(() => {
    const sync = () => setSoundAlerts(isDriverMessageSoundEnabled());
    window.addEventListener("tp-driver-msg-sound", sync);
    return () => window.removeEventListener("tp-driver-msg-sound", sync);
  }, []);

  const driversQ = useQuery({ queryKey: ["drivers", "support"], queryFn: () => apiGet<DriverRow[]>("/drivers") });

  const q = useQuery({
    queryKey: ["support", "messages", "admin", driverFilter],
    queryFn: () =>
      apiGet<SupportRow[]>("/support/messages", driverFilter ? { driverId: driverFilter } : undefined),
    refetchInterval: 12_000,
    refetchOnWindowFocus: true,
    staleTime: 8_000,
  });

  const messages = q.data ?? [];
  const selected = useMemo(() => messages.find((m) => m.id === selectedId) ?? null, [messages, selectedId]);

  useEffect(() => {
    if (selectedId && !messages.some((m) => m.id === selectedId)) {
      setSelectedId(null);
    }
  }, [messages, selectedId]);

  const send = useMutation({
    mutationFn: (p: { driverId: string; body: string }) =>
      apiSend("/support/messages", "POST", {
        body: p.body.trim(),
        driverId: p.driverId,
      }),
    onSuccess: () => {
      setReplyBody("");
      notify("success", "Respuesta enviada al chofer.");
      void qc.invalidateQueries({ queryKey: ["support", "messages"] });
    },
    onError: (e: Error) => notify("error", e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiSend(`/support/messages/${id}`, "DELETE"),
    onSuccess: (_data, id) => {
      notify("success", "Mensaje eliminado.");
      if (selectedId === id) setSelectedId(null);
      void qc.invalidateQueries({ queryKey: ["support", "messages"] });
    },
    onError: (e: Error) => notify("error", e.message),
  });

  function handleDelete() {
    if (!selected) return;
    if (!window.confirm("¿Eliminar este mensaje? También desaparecerá del portal del chofer.")) return;
    remove.mutate(selected.id);
  }

  function handleReply() {
    if (!selected || replyBody.trim().length < 1) return;
    send.mutate({ driverId: selected.driver.id, body: replyBody });
  }

  return (
    <div className="page-stack">
      <header className="page-header">
        <h1 className="text-xl font-semibold">Mensajes a conductores</h1>
        <p className="text-sm text-blue-100">
          Tocá un mensaje para abrir el panel; tocá de nuevo el mismo para minimizarlo y seguir navegando. Activá alertas sonoras para
          enterarte al instante si un chofer escribe (también suena en otras pantallas del admin).
        </p>
      </header>

      <section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <Volume2 className="h-5 w-5 text-slate-500" aria-hidden />
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300"
              checked={soundAlerts}
              onChange={async (e) => {
                const on = e.target.checked;
                if (on) {
                  await unlockDriverMessageAudio();
                  void playDriverMessageAlertDouble();
                }
                setDriverMessageSoundEnabled(on);
                setSoundAlerts(on);
              }}
            />
            <span>
              <strong>Alertas sonoras</strong> ante mensajes nuevos del chofer
            </span>
          </label>
          <button
            type="button"
            className="text-xs font-semibold text-blue-700 underline hover:text-blue-900"
            onClick={() => void playDriverMessageAlertDouble()}
          >
            Probar sonido
          </button>
        </div>
        <p className="text-xs text-slate-500">
          El navegador puede pedir interacción: activá el checkbox o &quot;Probar sonido&quot; una vez para habilitar el audio.
        </p>
      </section>

      <section className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="min-w-[200px] flex-1">
          <label className="block text-xs font-medium text-slate-600">Filtrar por chofer</label>
          <select
            className="mt-1 w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={driverFilter}
            onChange={(e) => {
              setDriverFilter(e.target.value);
              setSelectedId(null);
            }}
          >
            <option value="">Todos</option>
            {(driversQ.data ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.fullName}
                {d.assignedVehicle?.plate ? ` · ${d.assignedVehicle.plate}` : ""}
              </option>
            ))}
          </select>
        </div>
        <p className="text-xs text-slate-500">
          {messages.length} mensaje{messages.length === 1 ? "" : "s"} · más recientes arriba
        </p>
      </section>

      <div className="grid min-h-[420px] gap-4 lg:grid-cols-5">
        <div className="flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm lg:col-span-2">
          <div className="border-b border-slate-100 px-3 py-2">
            <h2 className="text-xs font-bold uppercase tracking-wide text-slate-700">Bandeja</h2>
          </div>
          {q.isLoading ? <p className="p-4 text-sm text-slate-500">Cargando…</p> : null}
          {q.isError ? <p className="p-4 text-sm text-rose-600">{(q.error as Error).message}</p> : null}
          <div className="max-h-[520px] flex-1 space-y-1 overflow-y-auto p-2">
            {messages.map((m) => {
              const incoming = isFromDriver(m);
              const active = m.id === selectedId;
              const preview = m.body.replace(/\s+/g, " ").trim().slice(0, 72) + (m.body.length > 72 ? "…" : "");
              return (
                <button
                  key={m.id}
                  type="button"
                  title={active ? "Clic de nuevo para minimizar el panel" : "Abrir mensaje"}
                  onClick={() => {
                    if (selectedId === m.id) {
                      setSelectedId(null);
                      return;
                    }
                    setSelectedId(m.id);
                    setReplyBody("");
                  }}
                  className={`w-full rounded-lg border px-3 py-2.5 text-left text-sm transition ${
                    active
                      ? "border-blue-500 bg-blue-50 ring-1 ring-blue-200"
                      : "border-slate-100 bg-slate-50/80 hover:border-slate-200 hover:bg-white"
                  } ${incoming ? "border-l-4 border-l-amber-500" : "border-l-4 border-l-slate-300"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-slate-900">{m.driver.fullName}</span>
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                        incoming ? "bg-amber-100 text-amber-900" : "bg-slate-200 text-slate-700"
                      }`}
                    >
                      {incoming ? "Chofer" : "Empresa"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">{new Date(m.createdAt).toLocaleString("es-CL")}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-700">{preview}</p>
                </button>
              );
            })}
            {!q.isLoading && messages.length === 0 ? (
              <p className="p-4 text-center text-sm text-slate-500">No hay mensajes. Aparecerán cuando un chofer escriba desde su app.</p>
            ) : null}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm lg:col-span-3">
          {!selected ? (
            <div className="flex h-full min-h-[280px] flex-col items-center justify-center p-8 text-center text-slate-500">
              <p className="text-sm font-medium text-slate-700">Seleccioná un mensaje en la bandeja</p>
              <p className="mt-2 max-w-sm text-xs">
                Desde acá podés leer el texto completo, responder a ese conductor o eliminar el mensaje del historial compartido.
              </p>
            </div>
          ) : (
            <div className="flex h-full flex-col">
              <div className="border-b border-slate-100 px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium text-slate-500">Conductor</p>
                    <p className="text-lg font-bold text-slate-900">{selected.driver.fullName}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        isFromDriver(selected) ? "bg-amber-100 text-amber-900" : "bg-slate-200 text-slate-800"
                      }`}
                    >
                      {isFromDriver(selected) ? "Mensaje del chofer" : "Enviado por la empresa"}
                    </span>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      title="Minimizar panel"
                      onClick={() => setSelectedId(null)}
                    >
                      <PanelRightClose className="h-4 w-4" aria-hidden />
                      Cerrar
                    </button>
                  </div>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {new Date(selected.createdAt).toLocaleString("es-CL")} · {selected.author.email}
                </p>
                {selected.shipment ? (
                  <p className="mt-2 text-xs text-slate-600">
                    <span className="font-semibold text-slate-700">Envío vinculado:</span> {selected.shipment.origin} →{" "}
                    {selected.shipment.destination}
                  </p>
                ) : null}
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-3">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{selected.body}</p>
              </div>
              <div className="border-t border-slate-100 bg-slate-50/90 px-4 py-4">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700">Responder a {selected.driver.fullName}</h3>
                <textarea
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm"
                  rows={3}
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  placeholder="Escribí la respuesta…"
                />
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-600 disabled:opacity-50"
                    disabled={send.isPending || replyBody.trim().length < 1}
                    onClick={handleReply}
                  >
                    {send.isPending ? "Enviando…" : "Enviar respuesta"}
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-800 hover:bg-rose-50 disabled:opacity-50"
                    disabled={remove.isPending}
                    onClick={handleDelete}
                  >
                    {remove.isPending ? "Eliminando…" : "Eliminar mensaje"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
