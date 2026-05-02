import { useState } from "react";
import { apiBlob, downloadBlob } from "../../api/client.js";
import { Link } from "react-router-dom";

export function ReportesAdminPage() {
  const [msg, setMsg] = useState<string | null>(null);
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [analyticsModalOpen, setAnalyticsModalOpen] = useState(false);
  const [modalStack, setModalStack] = useState<string[]>([]);

  function pushModal(key: string) {
    setModalStack((prev) => (prev[prev.length - 1] === key ? prev : [...prev, key]));
  }

  function closeTopModal() {
    const top = modalStack[modalStack.length - 1];
    if (!top) return;
    if (top === "csv") setCsvModalOpen(false);
    if (top === "analytics") setAnalyticsModalOpen(false);
    setModalStack((prev) => prev.slice(0, -1));
  }

  async function dl(path: string, name: string) {
    setMsg(null);
    try {
      const blob = await apiBlob(path);
      downloadBlob(blob, name);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Error");
    }
  }

  return (
    <div className="page-stack">
      <header className="page-header">
        <p className="page-eyebrow">Análisis</p>
        <h1>Exportaciones de datos</h1>
        <p className="page-subtitle">
          Aquí solo se generan archivos <strong>CSV</strong> para Excel, contabilidad o respaldos. Para gráficos y márgenes usá{" "}
          <strong>Rentabilidad</strong>; para decisiones sobre envíos, <strong>Auditoría</strong>.
        </p>
      </header>
      {msg ? <p className="error">{msg}</p> : null}
      <div
        className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200/80 bg-slate-50/80 px-2 py-2"
        role="toolbar"
        aria-label="Atención rápida en reportes"
      >
        <button
          type="button"
          onClick={() => dl("/reports/payments.csv", "pagos.csv")}
          className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50/90 px-3 py-1.5 text-xs font-semibold text-emerald-950 shadow-sm ring-1 ring-emerald-900/5 hover:bg-emerald-100/80"
        >
          CSV de pagos
        </button>
        <button
          type="button"
          onClick={() => dl("/reports/shipments.csv", "envios.csv")}
          className="inline-flex items-center gap-1 rounded-full border border-cyan-200 bg-cyan-50/90 px-3 py-1.5 text-xs font-semibold text-cyan-950 shadow-sm ring-1 ring-cyan-900/5 hover:bg-cyan-100/80"
        >
          CSV de envíos
        </button>
        <div className="inline-flex items-center gap-0.5 rounded-full border border-slate-200 bg-white p-0.5 shadow-sm ring-1 ring-slate-900/5">
          <Link
            to="/admin/rentabilidad"
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100"
          >
            Rentabilidad
          </Link>
          <Link
            to="/admin/auditoria"
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100"
          >
            Auditoría
          </Link>
        </div>
      </div>
      <section className="grid gap-3 md:grid-cols-2">
        <div className="card">
          <h2 className="card-title">Exportaciones CSV</h2>
          <p className="muted mt-1">Abrí la ventana flotante para bajar envíos, facturas, egresos y pagos.</p>
          <button className="btn-primary mt-3" type="button" onClick={() => { setCsvModalOpen(true); pushModal("csv"); }}>
            Abrir exportaciones
          </button>
        </div>
        <div className="card">
          <h2 className="card-title">Analítica operativa</h2>
          <p className="muted mt-1">Auditoría para trazabilidad y Rentabilidad para márgenes por viaje.</p>
          <button className="btn-secondary mt-3" type="button" onClick={() => { setAnalyticsModalOpen(true); pushModal("analytics"); }}>
            Abrir accesos analíticos
          </button>
        </div>
      </section>

      {csvModalOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true" onClick={closeTopModal}>
          <div className="w-full max-w-lg rounded-t-2xl border border-slate-200 bg-white p-4 shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-slate-900">Descargar archivos CSV</h3>
              <button type="button" className="btn-secondary btn-sm" onClick={closeTopModal}>{modalStack.length > 1 ? "Volver" : "Cerrar"}</button>
            </div>
            <p className="mb-3 text-xs text-slate-600">Elegí el dataset a exportar. Se descarga directamente para Excel/Sheets.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <button className="btn-secondary" type="button" onClick={() => dl("/reports/shipments.csv", "envios.csv")}>Envíos CSV</button>
              <button className="btn-secondary" type="button" onClick={() => dl("/reports/invoices.csv", "facturas.csv")}>Facturas CSV</button>
              <button className="btn-secondary" type="button" onClick={() => dl("/reports/expenses.csv", "egresos.csv")}>Egresos CSV</button>
              <button className="btn-primary" type="button" onClick={() => dl("/reports/payments.csv", "pagos.csv")}>Pagos CSV</button>
            </div>
          </div>
        </div>
      ) : null}

      {analyticsModalOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true" onClick={closeTopModal}>
          <div className="w-full max-w-lg rounded-t-2xl border border-slate-200 bg-white p-4 shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-slate-900">Abrir módulos analíticos</h3>
              <button type="button" className="btn-secondary btn-sm" onClick={closeTopModal}>{modalStack.length > 1 ? "Volver" : "Cerrar"}</button>
            </div>
            <p className="mb-3 text-xs text-slate-600">Usá estos accesos cuando necesites investigar un caso o revisar márgenes.</p>
            <div className="row">
              <Link className="btn-primary" to="/admin/auditoria" onClick={closeTopModal}>
                Ver auditoría decisiones
              </Link>
              <Link className="btn-secondary" to="/admin/rentabilidad" onClick={closeTopModal}>
                Ver rentabilidad
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
