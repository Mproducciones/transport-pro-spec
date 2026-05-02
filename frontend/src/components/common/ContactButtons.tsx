import { Mail, MessageCircle, Phone } from "lucide-react";
import { isLikelyValidPhone, mailHref, telHref, whatsappHref } from "../../lib/contact.js";

type Variant = "compact" | "full";

export function ContactButtons({
  phone,
  email,
  whatsappMessage,
  emailSubject,
  emailBody,
  variant = "compact",
  className = "",
}: {
  phone?: string | null;
  email?: string | null;
  whatsappMessage?: string;
  emailSubject?: string;
  emailBody?: string;
  variant?: Variant;
  className?: string;
}) {
  const phoneValid = isLikelyValidPhone(phone);
  const tel = phoneValid ? telHref(phone) : null;
  const wa = phoneValid ? whatsappHref(phone, whatsappMessage) : null;
  const mail = email ? mailHref(email, emailSubject, emailBody) : null;

  if (!tel && !wa && !mail) {
    return (
      <span className={`inline-flex items-center gap-1 text-xs text-slate-400 ${className}`}>
        <Phone size={13} className="opacity-60" />
        <span>Sin datos de contacto</span>
      </span>
    );
  }

  const labelClass = variant === "compact" ? "sr-only sm:not-sr-only" : "";
  const sizeClass =
    variant === "compact"
      ? "h-8 gap-1.5 px-2.5 text-xs"
      : "h-9 gap-2 px-3 text-sm";

  return (
    <div className={`inline-flex flex-wrap items-center gap-1.5 ${className}`}>
      {tel ? (
        <a
          href={tel}
          className={`inline-flex items-center rounded-md bg-emerald-600 font-semibold text-white shadow-sm transition hover:bg-emerald-500 ${sizeClass}`}
          title="Llamar"
          aria-label="Llamar"
        >
          <Phone size={variant === "compact" ? 13 : 15} />
          <span className={labelClass}>Llamar</span>
        </a>
      ) : null}
      {wa ? (
        <a
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex items-center rounded-md bg-[#25D366] font-semibold text-white shadow-sm transition hover:bg-[#1da851] ${sizeClass}`}
          title="Abrir WhatsApp"
          aria-label="Abrir WhatsApp"
        >
          <MessageCircle size={variant === "compact" ? 13 : 15} />
          <span className={labelClass}>WhatsApp</span>
        </a>
      ) : null}
      {mail ? (
        <a
          href={mail}
          className={`inline-flex items-center rounded-md bg-slate-700 font-semibold text-white shadow-sm transition hover:bg-slate-600 ${sizeClass}`}
          title="Enviar correo"
          aria-label="Enviar correo"
        >
          <Mail size={variant === "compact" ? 13 : 15} />
          <span className={labelClass}>Email</span>
        </a>
      ) : null}
    </div>
  );
}
