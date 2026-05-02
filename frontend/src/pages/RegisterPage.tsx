import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { apiSend } from "../api/client.js";
import { useAuthMeta } from "../store/auth.js";

type RegisterResult = { customerId: string; tenantSlug: string; message: string };

const fld = "w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

export function RegisterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { tenantSlug, setTenantSlug } = useAuthMeta();
  const [companyTaxId, setCompanyTaxId] = useState(searchParams.get("rut") ?? "");
  const [name, setName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError("La confirmación de contraseña no coincide.");
      return;
    }
    setIsSubmitting(true);
    try {
      const data = await apiSend<RegisterResult>("/auth/register", "POST", {
        companyTaxId,
        tenantSlug: searchParams.get("tenant") ?? tenantSlug ?? undefined,
        name, email, password,
        taxId: taxId || undefined,
        phone: phone || undefined,
      });
      setTenantSlug(data.tenantSlug);
      navigate("/login?registered=1", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al registrar");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <header className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded bg-blue-600 font-bold text-white">TP</span>
          <span className="font-semibold">Transport Pro</span>
        </div>
        <Link to="/login" className="text-sm text-blue-300 hover:text-blue-200">Ya tengo cuenta</Link>
      </header>
      <div className="mx-auto max-w-2xl p-6">
        <div className="rounded-2xl bg-white p-6 text-slate-900 shadow-xl">
          <p className="text-xs uppercase tracking-wider text-slate-500">Registro de cliente</p>
          <h1 className="mt-1 text-2xl font-bold">Crear cuenta</h1>
          <p className="mt-1 text-sm text-slate-500">
            Completá el formulario. La empresa transportista recibirá tu solicitud.
          </p>
          <form onSubmit={onSubmit} className="mt-4 grid gap-3 md:grid-cols-2">
            <Field label="RUT empresa transportista">
              <input className={fld} value={companyTaxId} onChange={(e) => setCompanyTaxId(e.target.value)} required placeholder="12345678-9" />
            </Field>
            <Field label="Nombre / razón social">
              <input className={fld} value={name} onChange={(e) => setName(e.target.value)} required />
            </Field>
            <Field label="RUT del cliente">
              <input className={fld} value={taxId} onChange={(e) => setTaxId(e.target.value)} required placeholder="98765432-1" />
            </Field>
            <Field label="Teléfono">
              <input className={fld} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+56 9 1234 5678" />
            </Field>
            <Field label="Correo electrónico">
              <input className={fld} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="correo@empresa.cl" />
            </Field>
            <Field label="Contraseña">
              <input className={fld} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
            </Field>
            <Field label="Confirmar contraseña">
              <input className={fld} type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={8} />
            </Field>
            <div className="md:col-span-2">
              {error && (
                <div className="mb-2 rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
              )}
              <button
                type="submit"
                className="w-full rounded bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
                disabled={isSubmitting || !taxId}
              >
                {isSubmitting ? "Registrando…" : "Crear cuenta"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}
