import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { apiSend, setToken } from "../api/client.js";
import { useAuthMeta } from "../store/auth.js";

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setTenantSlug } = useAuthMeta();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await apiSend<{ token: string; user: { role: string; tenantSlug?: string } }>(
        "/auth/login",
        "POST",
        { email, password }
      );
      setToken(data.token);
      setTenantSlug(data.user.tenantSlug ?? null);
      localStorage.setItem("tp_role", data.user.role);
      if (data.user.role === "admin") {
        navigate("/admin/dashboard", { replace: true });
      } else if (data.user.role === "cliente") {
        navigate("/cliente/pedidos", { replace: true });
      } else {
        navigate("/driver/viaje-activo", { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al iniciar sesión");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <header className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded bg-blue-600 font-bold text-white">
            TP
          </span>
          <span className="font-semibold">Transport Pro</span>
        </div>
              </header>

      <div className="mx-auto grid max-w-5xl gap-8 p-6 md:grid-cols-2 md:p-10">
        <div className="hidden rounded-2xl bg-gradient-to-br from-blue-700 to-slate-800 p-8 md:flex md:flex-col md:justify-between">
          <div>
            <h2 className="text-2xl font-bold leading-snug">
              La operación de su empresa de transporte, con estándar profesional
            </h2>
            <p className="mt-3 text-sm text-blue-100">
              Envíos, flota, facturación y pagos en una plataforma multi-empresa.
            </p>
          </div>
          <ul className="mt-6 space-y-2 text-sm text-blue-100">
            <li className="flex items-center gap-2">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-400" />
              Panel unificado para admin, cliente y chofer
            </li>
            <li className="flex items-center gap-2">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-400" />
              Seguimiento de envíos en tiempo real
            </li>
            <li className="flex items-center gap-2">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-400" />
              Facturación y cobranza automatizada
            </li>
          </ul>
        </div>

        <div className="rounded-2xl bg-white p-6 text-slate-900 shadow-xl">
          <p className="text-xs uppercase tracking-wider text-slate-500">Acceso seguro</p>
          <h1 className="mt-1 text-2xl font-bold">Iniciar sesión</h1>
          <p className="mt-1 text-sm text-slate-500">
            Acceso unificado para administrador, cliente y chofer.
          </p>

          <form onSubmit={onSubmit} className="mt-5 space-y-4">
            <div>
              <label htmlFor="login-email" className="mb-1 block text-xs font-medium text-slate-600">
                Correo electrónico
              </label>
              <input
                id="login-email"
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="correo@empresa.cl"
              />
            </div>
            <div>
              <label htmlFor="login-pass" className="mb-1 block text-xs font-medium text-slate-600">
                Contraseña
              </label>
              <input
                id="login-pass"
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>

            {searchParams.get("registered") === "1" && (
              <div className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                ¡Registro completado! Iniciá sesión con tus credenciales.
              </div>
            )}
            {searchParams.get("reason") === "role" && (
              <div className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Esta sección requiere una cuenta de tipo{" "}
                <strong>{roleLabel(searchParams.get("required"))}</strong>. Cerrá la otra sesión e ingresá con el usuario correcto.
              </div>
            )}
            {error && (
              <div className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
            >
              {loading ? "Verificando…" : "Entrar"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function roleLabel(role: string | null): string {
  if (role === "admin") return "empresa";
  if (role === "cliente") return "cliente";
  if (role === "conductor") return "chofer";
  if (role === "superadmin") return "superadmin";
  return "correspondiente";
}
