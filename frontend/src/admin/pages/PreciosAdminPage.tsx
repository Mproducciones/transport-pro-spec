import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { apiGet, apiSend } from "../../api/client.js";
import { notify } from "../../lib/notify.js";
import { TarifasTabPanel } from "../components/TarifasTabPanel.js";

type SettingsData = {
  tenant: { id: string; name: string; slug: string };
  company: {
    legalName: string;
    pricingBaseFee?: unknown;
    pricingPerKg?: unknown;
    pricingPerM3?: unknown;
    pricingMinimumCharge?: unknown;
    driverCommissionPercent?: unknown;
  } | null;
};

type TabKey = "tarifas" | "global";

export function PreciosAdminPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabRaw = searchParams.get("tab");
  const tab: TabKey = tabRaw === "global" ? "global" : "tarifas";

  function setTab(next: TabKey) {
    setSearchParams(next === "tarifas" ? {} : { tab: "global" }, { replace: true });
  }

  return (
    <div className="page-stack">
      <header className="page-header">
        <p className="page-eyebrow">Comercial</p>
        <h1>Precios y tarifas</h1>
        <p className="page-subtitle">
          <strong>Tarifas por ruta:</strong> montos fijos por origen/destino. <strong>Parámetros globales:</strong> base, kg, m³ y mínimo
          para cotizaciones automáticas; <strong>comisión chofer</strong> para liquidaciones.
        </p>
      </header>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          className={`rounded-lg px-4 py-2 text-sm font-semibold ${
            tab === "tarifas" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
          onClick={() => setTab("tarifas")}
        >
          Tarifas por ruta
        </button>
        <button
          type="button"
          className={`rounded-lg px-4 py-2 text-sm font-semibold ${
            tab === "global" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
          onClick={() => setTab("global")}
        >
          Parámetros globales y comisión
        </button>
      </div>

      {tab === "tarifas" ? <TarifasTabPanel /> : <GlobalPricingTab />}
    </div>
  );
}

function GlobalPricingTab() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["settings"], queryFn: () => apiGet<SettingsData>("/settings") });

  const [pricingBaseFee, setPricingBaseFee] = useState("");
  const [pricingPerKg, setPricingPerKg] = useState("");
  const [pricingPerM3, setPricingPerM3] = useState("");
  const [pricingMinimumCharge, setPricingMinimumCharge] = useState("");
  const [driverCommissionPercent, setDriverCommissionPercent] = useState("40");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (q.data?.company) {
      const c = q.data.company;
      setPricingBaseFee(String(c.pricingBaseFee ?? "0"));
      setPricingPerKg(String(c.pricingPerKg ?? "0"));
      setPricingPerM3(String(c.pricingPerM3 ?? "0"));
      setPricingMinimumCharge(String(c.pricingMinimumCharge ?? "0"));
      setDriverCommissionPercent(String(c.driverCommissionPercent ?? "40"));
    }
  }, [q.data]);

  const dirty = useMemo(() => {
    if (!q.data?.company) return false;
    const c = q.data.company;
    const numEq = (input: string, server: unknown) =>
      Number(String(input).trim().replace(",", ".")) ===
      Number(String(server ?? 0).trim().replace(",", "."));
    return (
      !numEq(pricingBaseFee, c.pricingBaseFee) ||
      !numEq(pricingPerKg, c.pricingPerKg) ||
      !numEq(pricingPerM3, c.pricingPerM3) ||
      !numEq(pricingMinimumCharge, c.pricingMinimumCharge) ||
      !numEq(driverCommissionPercent, c.driverCommissionPercent)
    );
  }, [q.data, pricingBaseFee, pricingPerKg, pricingPerM3, pricingMinimumCharge, driverCommissionPercent]);

  const save = useMutation({
    mutationFn: (body: {
      pricingBaseFee: number;
      pricingPerKg: number;
      pricingPerM3: number;
      pricingMinimumCharge: number;
      driverCommissionPercent: number;
    }) =>
      apiSend("/settings", "PATCH", {
        company: {
          pricingBaseFee: body.pricingBaseFee,
          pricingPerKg: body.pricingPerKg,
          pricingPerM3: body.pricingPerM3,
          pricingMinimumCharge: body.pricingMinimumCharge,
          driverCommissionPercent: body.driverCommissionPercent,
        },
      }),
    onSuccess: () => {
      setError(null);
      void qc.invalidateQueries({ queryKey: ["settings"] });
      notify("success", "Parámetros de precio y comisión guardados.");
    },
    onError: (e: Error) => {
      setError(e.message);
      notify("error", "No se pudo guardar.");
    },
  });

  function parseDecimalInput(raw: string, field: string) {
    const normalized = raw.trim().replace(",", ".");
    if (!normalized) return 0;
    const n = Number(normalized);
    if (!Number.isFinite(n) || n < 0) {
      throw new Error(`${field}: ingresa un numero valido mayor o igual a 0.`);
    }
    const maxByField: Record<string, number> = {
      "Costo base": 1000000,
      "Precio por kg": 1000,
      "Precio por m3": 100000,
      "Cobro minimo": 5000000,
    };
    const max = maxByField[field];
    if (max !== undefined && n > max) {
      throw new Error(`${field}: valor demasiado alto (${n}). Revisa separadores decimales.`);
    }
    return n;
  }

  function handleSave() {
    try {
      const baseFee = parseDecimalInput(pricingBaseFee, "Costo base");
      const perKg = parseDecimalInput(pricingPerKg, "Precio por kg");
      const perM3 = parseDecimalInput(pricingPerM3, "Precio por m3");
      const minimum = parseDecimalInput(pricingMinimumCharge, "Cobro minimo");
      const pctRaw = driverCommissionPercent.trim().replace(",", ".");
      const pct = Number(pctRaw);
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        throw new Error("Comisión chofer: usa un porcentaje entre 0 y 100.");
      }
      setError(null);
      save.mutate({
        pricingBaseFee: baseFee,
        pricingPerKg: perKg,
        pricingPerM3: perM3,
        pricingMinimumCharge: minimum,
        driverCommissionPercent: pct,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Revisa los valores.");
    }
  }

  if (q.isLoading) return <p className="muted p-4">Cargando configuración…</p>;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-amber-50/80 p-4 text-sm text-amber-950">
        <p>
          Estos valores alimentan las <strong>sugerencias de cotización</strong> cuando no hay una fila exacta en tarifas por ruta. Los datos
          fiscales y nombre de empresa siguen en{" "}
          <Link className="font-semibold underline" to="/admin/ajustes">
            Configuración
          </Link>
          .
        </p>
      </div>
      {error ? <p className="error">{error}</p> : null}
      <div className="card card-elevated">
        <h2 className="card-title">Referencia de cotización (CLP)</h2>
        <p className="muted text-sm">
          Valores en pesos chilenos. Punto decimal (<code>.</code>) sin separador de miles.
        </p>
        <label>Costo base</label>
        <input
          type="number"
          min={0}
          step="0.01"
          value={pricingBaseFee}
          onChange={(e) => setPricingBaseFee(e.target.value)}
        />
        <label>Precio por kg</label>
        <input
          type="number"
          min={0}
          step="0.0001"
          value={pricingPerKg}
          onChange={(e) => setPricingPerKg(e.target.value)}
        />
        <label>Precio por m³</label>
        <input
          type="number"
          min={0}
          step="0.01"
          value={pricingPerM3}
          onChange={(e) => setPricingPerM3(e.target.value)}
        />
        <label>Cobro mínimo</label>
        <input
          type="number"
          min={0}
          step="0.01"
          value={pricingMinimumCharge}
          onChange={(e) => setPricingMinimumCharge(e.target.value)}
        />
      </div>
      <div className="card card-elevated">
        <h2 className="card-title">Liquidaciones — comisión del chofer</h2>
        <p className="muted text-sm">
          Porcentaje aplicado sobre la suma de montos de envíos <strong>entregados</strong> en el período que el chofer elija al generar su
          pre-liquidación en la app. Bruto = base × (comisión ÷ 100); luego la empresa ajusta bono/descuento y cierra.
        </p>
        <label>Comisión (%)</label>
        <input
          type="number"
          min={0}
          max={100}
          step="0.01"
          value={driverCommissionPercent}
          onChange={(e) => setDriverCommissionPercent(e.target.value)}
        />
      </div>
      <div className="form-actions">
        <button
          type="button"
          className="btn-primary"
          onClick={handleSave}
          disabled={save.isPending || !dirty}
          title={dirty ? "Guardar cambios" : "Sin cambios pendientes"}
        >
          {save.isPending ? "Guardando…" : dirty ? "Guardar precios y comisión" : "Sin cambios pendientes"}
        </button>
      </div>
    </div>
  );
}
