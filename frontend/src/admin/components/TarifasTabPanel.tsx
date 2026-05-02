import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiSend } from "../../api/client.js";
import { notify } from "../../lib/notify.js";

type CustomerRow = { id: string; name: string };
type TariffRow = {
  id: string;
  origin: string;
  destination: string;
  cargoType?: string | null;
  baseAmount: unknown;
  helperSurcharge: unknown;
  active: boolean;
  customer?: { id: string; name: string } | null;
};

/** Catálogo de tarifas por ruta (pestaña dentro de Precios y tarifas). */
export function TarifasTabPanel() {
  const qc = useQueryClient();
  const customersQ = useQuery({ queryKey: ["customers"], queryFn: () => apiGet<CustomerRow[]>("/customers") });
  const tariffsQ = useQuery({ queryKey: ["tariffs"], queryFn: () => apiGet<TariffRow[]>("/tariffs") });

  const [customerId, setCustomerId] = useState("");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [cargoType, setCargoType] = useState("");
  const [baseAmount, setBaseAmount] = useState("");
  const [helperSurcharge, setHelperSurcharge] = useState("0");
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      apiSend("/tariffs", "POST", {
        customerId: customerId || null,
        origin,
        destination,
        cargoType: cargoType || null,
        baseAmount: Number(baseAmount),
        helperSurcharge: Number(helperSurcharge || 0),
      }),
    onSuccess: () => {
      setOrigin("");
      setDestination("");
      setCargoType("");
      setBaseAmount("");
      setHelperSurcharge("0");
      setError(null);
      void qc.invalidateQueries({ queryKey: ["tariffs"] });
      notify(
        "success",
        "Tarifa creada en el catálogo de tu empresa. Se usará al sugerir montos en rutas que coincidan."
      );
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="grid2">
      {error ? <p className="error col-span-full">{error}</p> : null}
      <div className="card card-elevated">
        <h2 className="card-title">Nueva tarifa por ruta</h2>
        <p className="muted text-sm">
          Filas concretas origen → destino (y opcional cliente o tipo de carga). Complementa los parámetros globales de la otra pestaña.
        </p>
        <label>Cliente (vacío = tarifa general)</label>
        <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
          <option value="">General</option>
          {(customersQ.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <label>Origen</label>
        <input value={origin} onChange={(e) => setOrigin(e.target.value)} />
        <label>Destino</label>
        <input value={destination} onChange={(e) => setDestination(e.target.value)} />
        <label>Tipo carga (opcional)</label>
        <select value={cargoType} onChange={(e) => setCargoType(e.target.value)}>
          <option value="">Todos</option>
          <option value="pallet">Pallet</option>
          <option value="contenedor">Contenedor</option>
          <option value="granel">Granel</option>
          <option value="caja">Caja</option>
          <option value="otro">Otro</option>
        </select>
        <label>Tarifa base</label>
        <input value={baseAmount} onChange={(e) => setBaseAmount(e.target.value)} />
        <label>Recargo peoneta</label>
        <input value={helperSurcharge} onChange={(e) => setHelperSurcharge(e.target.value)} />
        <p className="hint" style={{ marginTop: "0.35rem" }}>
          Cada guardado crea una <strong>nueva</strong> fila de tarifa en base de datos (no edita la anterior).
        </p>
        <button
          type="button"
          className="btn-primary"
          disabled={!origin || !destination || !baseAmount || create.isPending}
          onClick={() => create.mutate()}
        >
          Guardar tarifa
        </button>
      </div>
      <div className="card card-elevated">
        <h2 className="card-title">Listado</h2>
        <div className="table-wrap">
          <table className="table-pro">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Ruta</th>
                <th>Carga</th>
                <th>Base</th>
                <th>Peoneta</th>
              </tr>
            </thead>
            <tbody>
              {(tariffsQ.data ?? []).map((t) => (
                <tr key={t.id}>
                  <td>{t.customer?.name ?? "General"}</td>
                  <td>
                    {t.origin} {"->"} {t.destination}
                  </td>
                  <td>{t.cargoType ?? "Todos"}</td>
                  <td>{String(t.baseAmount)}</td>
                  <td>{String(t.helperSurcharge)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
