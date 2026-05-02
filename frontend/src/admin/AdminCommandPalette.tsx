import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mic, MicOff, Search } from "lucide-react";
import { ADMIN_COMMAND_INTENTS, type AdminCommandIntent } from "./adminCommandIntents.js";
import { getSpeechRecognitionCtor } from "./adminSpeechRecognition.js";

function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

function scoreIntent(queryRaw: string, intent: AdminCommandIntent): number {
  const q = normalizeText(queryRaw);
  if (!q) return 0;
  const title = normalizeText(intent.title);
  const hint = normalizeText(intent.hint);
  let score = 0;
  if (title.includes(q)) score += 120;
  if (hint.includes(q)) score += 45;
  for (const word of q.split(/\s+/).filter((w) => w.length > 1)) {
    if (title.includes(word)) score += 35;
    if (hint.includes(word)) score += 18;
  }
  for (const kw of intent.keywords) {
    const k = normalizeText(kw);
    if (!k) continue;
    if (q.includes(k) || k.includes(q)) score += 55;
    for (const word of q.split(/\s+/).filter((w) => w.length > 1)) {
      if (k.includes(word) || word.includes(k)) score += 22;
    }
  }
  if (normalizeText(intent.id).includes(q)) score += 30;
  return score;
}

function rankIntents(query: string): AdminCommandIntent[] {
  const trimmed = query.trim();
  if (!trimmed) {
    return [...ADMIN_COMMAND_INTENTS].sort((a, b) => a.priority - b.priority);
  }
  const scored = ADMIN_COMMAND_INTENTS.map((intent) => ({
    intent,
    score: scoreIntent(trimmed, intent),
  }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.intent.priority - b.intent.priority);
  return scored.map((x) => x.intent);
}

type AdminCommandPaletteProps = {
  open: boolean;
  onRequestClose: () => void;
};

export function AdminCommandPalette({ open, onRequestClose }: AdminCommandPaletteProps) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [voiceOn, setVoiceOn] = useState(false);
  const [voiceErr, setVoiceErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<SpeechRecognition | null>(null);

  const stopListening = useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {
      /* ya detenido */
    }
    recRef.current = null;
    setVoiceOn(false);
  }, []);

  const startListening = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setVoiceErr("Este navegador no soporta dictado por voz. Usá Chrome o Edge, o escribí la consulta.");
      return;
    }
    setVoiceErr(null);
    stopListening();
    const r = new Ctor();
    recRef.current = r;
    r.lang = "es-CL";
    r.continuous = false;
    r.interimResults = false;
    r.onstart = () => setVoiceOn(true);
    r.onend = () => {
      setVoiceOn(false);
      recRef.current = null;
    };
    r.onerror = (ev) => {
      setVoiceOn(false);
      recRef.current = null;
      if (ev.error === "not-allowed") {
        setVoiceErr("Micrófono bloqueado. Permití el acceso en el navegador o escribí.");
      } else if (ev.error === "no-speech") {
        setVoiceErr("No captamos voz. Acercate al micrófono o probá de nuevo.");
      } else if (ev.error === "aborted") {
        setVoiceErr(null);
      } else {
        setVoiceErr("No se pudo dictar. Escribí la consulta o probá otro navegador.");
      }
    };
    r.onresult = (ev) => {
      const text = ev.results[0]?.[0]?.transcript?.trim() ?? "";
      if (text) {
        setQ(text);
        setVoiceErr(null);
      }
    };
    try {
      r.start();
    } catch {
      setVoiceErr("No se pudo iniciar el micrófono.");
      setVoiceOn(false);
    }
  }, [stopListening]);

  const results = useMemo(() => rankIntents(q), [q]);

  const go = useCallback(
    (intent: AdminCommandIntent) => {
      const search = intent.search ? (intent.search.startsWith("?") ? intent.search : `?${intent.search}`) : "";
      const hash = intent.hash ? (intent.hash.startsWith("#") ? intent.hash : `#${intent.hash}`) : "";
      navigate({ pathname: intent.path, search: search || undefined, hash: hash || undefined });
      onRequestClose();
      setQ("");
      setHighlight(0);
    },
    [navigate, onRequestClose]
  );

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onRequestClose();
        setQ("");
        setHighlight(0);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onRequestClose]);

  useEffect(() => {
    if (!open) {
      stopListening();
      setVoiceErr(null);
      setQ("");
      setHighlight(0);
      return;
    }
    setHighlight(0);
    const t = window.setTimeout(() => inputRef.current?.focus(), 10);
    return () => window.clearTimeout(t);
  }, [open, stopListening]);

  useEffect(() => {
    setHighlight((h) => (results.length === 0 ? 0 : Math.min(h, results.length - 1)));
  }, [results.length, q]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-idx="${highlight}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [highlight, open, results]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center bg-black/45 p-4 pt-[12vh] backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-cmd-heading"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onRequestClose();
          setQ("");
        }
      }}
    >
      <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <h2 id="admin-cmd-heading" className="sr-only">
          Buscar en Transport Pro: decí o escribí qué necesitás ver
        </h2>
        <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
          <Search size={18} className="shrink-0 text-slate-400" aria-hidden />
          <input
            ref={inputRef}
            type="search"
            autoComplete="off"
            spellCheck={false}
            aria-label="Qué necesitás ver: escribí o usá el micrófono"
            placeholder="Ej. pedidos en tránsito, cartera, retrasos…"
            className="min-w-0 flex-1 border-0 bg-transparent py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setVoiceErr(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHighlight((h) => (results.length === 0 ? 0 : (h + 1) % results.length));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHighlight((h) =>
                  results.length === 0 ? 0 : (h - 1 + results.length) % results.length
                );
              } else if (e.key === "Enter" && results[highlight]) {
                e.preventDefault();
                go(results[highlight]);
              }
            }}
          />
          <button
            type="button"
            title={voiceOn ? "Detener micrófono" : "Hablar: describí qué necesitás (español Chile)"}
            aria-pressed={voiceOn}
            className={`flex shrink-0 items-center justify-center rounded-lg p-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              voiceOn
                ? "bg-rose-100 text-rose-700 ring-2 ring-rose-400/70"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              if (voiceOn) stopListening();
              else startListening();
            }}
          >
            {voiceOn ? <MicOff size={18} aria-hidden /> : <Mic size={18} aria-hidden />}
            <span className="sr-only">{voiceOn ? "Detener dictado" : "Iniciar dictado por voz"}</span>
          </button>
          <kbd className="hidden shrink-0 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 sm:inline">
            esc
          </kbd>
        </div>
        {voiceErr ? (
          <p className="border-b border-amber-100 bg-amber-50/90 px-3 py-1.5 text-[11px] text-amber-950">{voiceErr}</p>
        ) : null}
        {voiceOn ? (
          <p className="border-b border-blue-100 bg-blue-50/80 px-3 py-1.5 text-[11px] font-medium text-blue-900">
            Escuchando… decí una frase completa (ej. «necesito ver los pedidos en tránsito»).
          </p>
        ) : null}
        <p className="border-b border-slate-50 px-3 py-1.5 text-[11px] leading-snug text-slate-500">
          Un solo buscador para el admin: te llevamos a la pantalla correcta con los datos ya calculados. Elegí un resultado y
          verás tablas y totales ahí.
        </p>
        <div ref={listRef} className="max-h-[min(55vh,420px)] overflow-y-auto p-2">
          {results.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-slate-500">
              No encontramos una vista para &quot;{q.trim()}&quot;. Probá otra palabra o abrí el menú lateral.
            </p>
          ) : (
            <ul className="space-y-1">
              {results.map((intent, idx) => (
                <li key={intent.id}>
                  <button
                    type="button"
                    data-idx={idx}
                    className={`w-full rounded-xl px-3 py-2.5 text-left transition ${
                      idx === highlight ? "bg-blue-50 ring-2 ring-blue-400/60" : "hover:bg-slate-50"
                    }`}
                    onMouseEnter={() => setHighlight(idx)}
                    onClick={() => go(intent)}
                  >
                    <span className="block text-sm font-semibold text-slate-900">{intent.title}</span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-slate-600">{intent.hint}</span>
                    <span className="mt-1 block truncate font-mono text-[10px] text-slate-400">
                      {intent.path}
                      {intent.search ? `?${intent.search.replace(/^\?/, "")}` : ""}
                      {intent.hash ? `#${intent.hash.replace(/^#/, "")}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2 text-[10px] text-slate-500">
          <span>
            <kbd className="rounded bg-slate-100 px-1 font-mono">↑</kbd>{" "}
            <kbd className="rounded bg-slate-100 px-1 font-mono">↓</kbd> elegir ·{" "}
            <kbd className="rounded bg-slate-100 px-1 font-mono">Enter</kbd> ir
          </span>
          <span>Ctrl o ⌘ + K</span>
        </div>
      </div>
    </div>
  );
}
