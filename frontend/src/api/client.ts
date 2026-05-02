/** Vacío en local (mismo origen + proxy Vite). En Vercel: https://tu-api.onrender.com sin barra final. */
export const API_ORIGIN = (import.meta.env.VITE_API_ORIGIN as string | undefined)?.trim().replace(/\/$/, "") ?? "";

const API_BASE = API_ORIGIN ? `${API_ORIGIN}/api/v1` : "/api/v1";

/** Rutas `/api/owner` (consola plataforma). */
export function ownerApiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return API_ORIGIN ? `${API_ORIGIN}/api/owner${p}` : `/api/owner${p}`;
}

export type ApiResult<T> =
  | { success: true; data: T }
  | { success: false; message: string; code?: string; details?: unknown };

/** Redirige al login y borra la sesión local cuando el servidor responde 401. */
function handleUnauthorized() {
  localStorage.removeItem("tp_role");
  localStorage.removeItem("tp_slug");
  if (!window.location.pathname.startsWith("/login")) {
    window.location.href = "/login";
  }
}

async function parse<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    handleUnauthorized();
    throw new Error("Sesión expirada. Iniciá sesión nuevamente.");
  }
  const json = (await res.json()) as ApiResult<T>;
  if (typeof json === "object" && json && "success" in json && json.success === true) {
    return (json as { success: true; data: T }).data;
  }
  const code = json && typeof json === "object" && "code" in json ? String((json as { code?: string }).code ?? "") : "";
  const details = json && typeof json === "object" && "details" in json ? (json as { details?: unknown }).details : undefined;
  if (code === "VALIDATION_ERROR" && details && typeof details === "object" && details !== null) {
    const fieldErrors = (details as { fieldErrors?: Record<string, string[] | undefined> }).fieldErrors;
    if (fieldErrors && typeof fieldErrors === "object") {
      for (const [field, messages] of Object.entries(fieldErrors)) {
        if (messages && messages.length > 0) {
          throw new Error(`${field}: ${messages[0]}`);
        }
      }
    }
  }
  const msg =
    json && typeof json === "object" && "message" in json
      ? String((json as { message: string }).message)
      : `HTTP ${res.status}`;
  throw new Error(msg);
}

export function getToken(): string | null {
  return null;
}

export function setToken(token: string | null) {
  if (!token) {
    void fetch(`${API_BASE}/auth/logout`, {
      method: "POST",
      credentials: "include",
    }).catch(() => undefined);
  }
}

export async function apiGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const q = params ? `?${new URLSearchParams(params).toString()}` : "";
  const res = await fetch(`${API_BASE}${path}${q}`, {
    credentials: "include",
  });
  return parse<T>(res);
}

export async function apiSend<T>(
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return parse<T>(res);
}

/** Multipart (sin `Content-Type` manual: el navegador pone el boundary). */
export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });
  return parse<T>(res);
}

export async function apiBlob(path: string): Promise<Blob> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
  });
  if (res.status === 401) {
    handleUnauthorized();
    throw new Error("Sesión expirada. Iniciá sesión nuevamente.");
  }
  if (!res.ok) {
    const text = await res.text();
    try {
      const j = JSON.parse(text) as { message?: string };
      throw new Error(j.message ?? text);
    } catch {
      throw new Error(text || res.statusText);
    }
  }
  return res.blob();
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
