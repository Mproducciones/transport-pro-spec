type FloatingAlertModalProps = {
  open: boolean;
  title: string;
  message: string;
  onClose: () => void;
  ctaLabel?: string;
};

export function FloatingAlertModal({ open, title, message, onClose, ctaLabel = "Entendido" }: FloatingAlertModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/55 p-4" role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-amber-200 bg-white p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-700">{message}</p>
        <div className="mt-4 flex justify-end">
          <button type="button" className="rounded bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-500" onClick={onClose}>
            {ctaLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
