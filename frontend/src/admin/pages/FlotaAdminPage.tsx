import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { apiGet, apiSend } from "../../api/client.js";
import { notify } from "../../lib/notify.js";

/** Por encima del modal de Flota en el dashboard (z-90). */
const flotaModalShell =
  "fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4";

type VehicleRow = {
  id: string;
  plate: string;
  kind?: string | null;
  status: string;
  assignedTo?: { fullName: string } | null;
};
type DriverRow = {
  id: string;
  fullName: string;
  taxId?: string | null;
  assignedVehicle?: { id: string; plate: string } | null;
  user?: { email: string } | null;
};

/**
 * Solo alta de conductor (portal opcional). Usado en la pantalla Flota.
 * No incluye vehículos ni asignación.
 */
export function CrearConductorForm({
  onCreated,
  className = "",
}: {
  onCreated?: () => void;
  className?: string;
}) {
  const qc = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [driverTaxId, setDriverTaxId] = useState("");
  const [portalEmail, setPortalEmail] = useState("");
  const [portalPassword, setPortalPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createDriver = useMutation({
    mutationFn: () =>
      apiSend("/drivers", "POST", {
        fullName,
        taxId: driverTaxId,
        portalEmail: portalEmail || undefined,
        portalPassword: portalPassword || undefined,
      }),
    onSuccess: () => {
      setFullName("");
      setDriverTaxId("");
      setPortalEmail("");
      setPortalPassword("");
      setError(null);
      void qc.invalidateQueries({ queryKey: ["drivers"] });
      notify("success", "Conductor creado en tu empresa. Podés asignarle vehículo desde Flota cuando esté disponible.");
      onCreated?.();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className={className}>
      {error ? <p className="error">{error}</p> : null}
      <p className="hint">El acceso del chofer se crea aquí; luego entra con su correo y clave en la pantalla de inicio.</p>
      <div className="grid2 max-w-xl">
        <div>
          <label>Nombre</label>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
          <label>RUT / NIT</label>
          <input value={driverTaxId} onChange={(e) => setDriverTaxId(e.target.value)} autoComplete="off" />
          <label>Email portal (opc.)</label>
          <input value={portalEmail} onChange={(e) => setPortalEmail(e.target.value)} autoComplete="email" />
          <label>Contraseña portal (opc.)</label>
          <input type="password" value={portalPassword} onChange={(e) => setPortalPassword(e.target.value)} autoComplete="new-password" />
          <button
            type="button"
            className="btn-primary"
            disabled={!fullName || !driverTaxId || createDriver.isPending}
            onClick={() => createDriver.mutate()}
          >
            {createDriver.isPending ? "Creando…" : "Crear conductor"}
          </button>
        </div>
      </div>
    </div>
  );
}

function vehicleSelectOptionsForDriver(d: DriverRow, allVehicles: VehicleRow[], freePlates: VehicleRow[]): VehicleRow[] {
  const byId = new Map(allVehicles.map((v) => [v.id, v]));
  const freeIds = new Set(freePlates.map((v) => v.id));
  const out: VehicleRow[] = [...freePlates];
  const curId = d.assignedVehicle?.id;
  if (curId) {
    const cur = byId.get(curId);
    if (cur && !freeIds.has(cur.id)) out.push(cur);
  }
  return out.sort((a, b) => a.plate.localeCompare(b.plate, "es"));
}

/** Formularios y tablas de vehículos + conductores (pantalla completa o panel en Inicio). */
export function FlotaAdminContent() {
  const qc = useQueryClient();
  const driversQ = useQuery({ queryKey: ["drivers"], queryFn: () => apiGet<DriverRow[]>("/drivers") });
  const vehiclesQ = useQuery({ queryKey: ["vehicles"], queryFn: () => apiGet<VehicleRow[]>("/vehicles") });

  const [modalCrearOpen, setModalCrearOpen] = useState(false);
  const [modalAsignarOpen, setModalAsignarOpen] = useState(false);
  /** Borradores de patente por conductor mientras el modal de asignación está abierto (id vehículo o ""). */
  const [vehicleDraft, setVehicleDraft] = useState<Record<string, string>>({});
  const [plate, setPlate] = useState("");
  const [kind, setKind] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);

  useEffect(() => {
    if (!modalAsignarOpen) {
      setVehicleDraft({});
      setAssignError(null);
    }
  }, [modalAsignarOpen]);

  const assign = useMutation({
    mutationFn: (p: { driverId: string; vehicleId: string | null }) =>
      apiSend(`/drivers/${p.driverId}/vehicle`, "PATCH", { vehicleId: p.vehicleId }),
    onSuccess: (_d, p) => {
      setAssignError(null);
      setVehicleDraft((prev) => {
        const next = { ...prev };
        delete next[p.driverId];
        return next;
      });
      void qc.invalidateQueries({ queryKey: ["drivers"] });
      void qc.invalidateQueries({ queryKey: ["vehicles"] });
      notify("success", "Asignación de vehículo guardada en el conductor (queda lista para envíos).");
    },
    onError: (e: Error) => setAssignError(e.message),
  });

  const createVehicle = useMutation({
    mutationFn: () => apiSend("/vehicles", "POST", { plate, kind: kind || undefined }),
    onSuccess: () => {
      setPlate("");
      setKind("");
      void qc.invalidateQueries({ queryKey: ["vehicles"] });
      notify("success", "Vehículo dado de alta en la flota de tu empresa.");
    },
    onError: (e: Error) => setError(e.message),
  });

  const setVehStatus = useMutation({
    mutationFn: (p: { id: string; status: string }) => apiSend(`/vehicles/${p.id}`, "PATCH", { status: p.status }),
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ["vehicles"] });
      notify(
        "info",
        v.status === "en_taller"
          ? "Vehículo marcado en taller (no disponible para nuevas asignaciones)."
          : "Vehículo marcado disponible en flota."
      );
    },
    onError: (e: Error) => setError(e.message),
  });

  const freeVehicles = (vehiclesQ.data ?? []).filter((v) => v.status === "disponible");
  const allVehicles = vehiclesQ.data ?? [];
  const vehicles = allVehicles;
  const pendingVehId = setVehStatus.variables?.id;

  return (
    <>
      {error ? <p className="error">{error}</p> : null}

      <div className="card card-elevated">
        <h2 className="card-title">Tu flota</h2>
        <p className="hint mb-3 !mt-0">
          Unidades: estado y taller. <strong>En ruta</strong> = asignado; para mandarlo a taller abrí{" "}
          <strong>Asignar o quitar conductor a un vehículo</strong> y quitá la unidad en la tabla.
        </p>

        {vehiclesQ.isLoading ? (
          <p className="text-sm text-slate-500">Cargando vehículos…</p>
        ) : vehicles.length === 0 ? (
          <p className="mb-4 rounded-lg border border-dashed border-slate-200 bg-slate-50/80 px-3 py-4 text-sm text-slate-600">
            Todavía no hay unidades en el sistema. Añadí la primera con placa (y tipo opcional) al final de esta sección.
          </p>
        ) : (
          <div className="table-wrap mb-6">
            <table className="table-pro w-full min-w-0">
              <thead>
                <tr>
                  <th>Placa</th>
                  <th>Tipo</th>
                  <th>Estado</th>
                  <th className="whitespace-nowrap">Taller / disponible</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map((v) => {
                  const st = v.status;
                  const enRuta = st === "asignado";
                  const enTaller = st === "en_taller";
                  const label =
                    enRuta ? "En ruta" : enTaller ? "En taller" : st === "disponible" ? "Disponible" : st;
                  const badgeClass = enRuta
                    ? "bg-sky-100 text-sky-900"
                    : enTaller
                      ? "bg-amber-100 text-amber-950"
                      : "bg-emerald-100 text-emerald-900";
                  return (
                    <tr key={v.id}>
                      <td className="font-semibold">{v.plate}</td>
                      <td className="text-slate-600">{v.kind?.trim() ? v.kind : "—"}</td>
                      <td>
                        <span className={`badge ${badgeClass}`}>{label}</span>
                        {v.assignedTo ? (
                          <span className="ml-1 text-[10px] text-slate-500">· {v.assignedTo.fullName}</span>
                        ) : null}
                      </td>
                      <td>
                        {enRuta ? (
                          <button
                            type="button"
                            className="btn-secondary btn-sm cursor-not-allowed opacity-60"
                            disabled
                            title="Desasigná el vehículo del conductor (Asignar o quitar conductor) antes de marcarlo en taller."
                          >
                            En taller
                          </button>
                        ) : enTaller ? (
                          <button
                            type="button"
                            className="btn-primary btn-sm"
                            disabled={setVehStatus.isPending && pendingVehId === v.id}
                            onClick={() => setVehStatus.mutate({ id: v.id, status: "disponible" })}
                          >
                            {setVehStatus.isPending && pendingVehId === v.id ? "…" : "Marcar disponible"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            disabled={setVehStatus.isPending && pendingVehId === v.id}
                            onClick={() => setVehStatus.mutate({ id: v.id, status: "en_taller" })}
                          >
                            {setVehStatus.isPending && pendingVehId === v.id ? "…" : "Poner en taller"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <h3 className="!mb-2 !mt-0 text-base font-semibold text-slate-900">Añadir vehículo</h3>
        <p className="hint !mb-3 !mt-0">Patente obligatoria; el tipo (camión, furgón, etc.) es opcional.</p>
        <div className="flex max-w-2xl flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="min-w-0 flex-1 sm:max-w-[12rem]">
            <label htmlFor="veh-plate">Placa</label>
            <input
              id="veh-plate"
              value={plate}
              onChange={(e) => setPlate(e.target.value)}
              placeholder="Ej. ABCD12"
              autoComplete="off"
            />
          </div>
          <div className="min-w-0 flex-1 sm:max-w-[12rem]">
            <label htmlFor="veh-kind">Tipo (opcional)</label>
            <input
              id="veh-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              placeholder="Camión, furgón…"
            />
          </div>
          <button
            type="button"
            className="btn-primary h-[42px] shrink-0 self-stretch sm:self-auto"
            disabled={!plate?.trim() || createVehicle.isPending}
            onClick={() => createVehicle.mutate()}
          >
            {createVehicle.isPending ? "Guardando…" : "Dar de alta"}
          </button>
        </div>
      </div>

      <div className="card card-elevated">
        <h2 className="card-title">Conductores</h2>
        <p className="hint mb-4 !mt-0">
          Cada acción se abre en su propia ventana. En asignación, elegí unidad por fila (o sin vehículo) y tocá Aplicar.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setModalCrearOpen(true);
              setModalAsignarOpen(false);
            }}
          >
            Crear conductor
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setModalAsignarOpen(true);
              setModalCrearOpen(false);
            }}
          >
            Asignar o quitar conductor a un vehículo
          </button>
        </div>
      </div>

      {modalCrearOpen ? (
        <div className={flotaModalShell} role="dialog" aria-modal="true" aria-labelledby="flota-modal-crear-title" onClick={() => setModalCrearOpen(false)}>
          <div
            className="flex max-h-[min(92vh,640px)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
              <h2 id="flota-modal-crear-title" className="text-base font-semibold text-slate-900">
                Nuevo conductor
              </h2>
              <button
                type="button"
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                onClick={() => setModalCrearOpen(false)}
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              <CrearConductorForm
                onCreated={() => setModalCrearOpen(false)}
                className="text-slate-800"
              />
            </div>
          </div>
        </div>
      ) : null}

      {modalAsignarOpen ? (
        <div className={flotaModalShell} role="dialog" aria-modal="true" aria-labelledby="flota-modal-asig-title" onClick={() => setModalAsignarOpen(false)}>
          <div
            className="flex max-h-[min(92vh,720px)] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
              <div>
                <h2 id="flota-modal-asig-title" className="text-base font-semibold text-slate-900">
                  Asignar o quitar vehículo
                </h2>
                <p className="text-xs text-slate-600">
                  Una fila por conductor: elegí unidad <strong>disponible</strong> o <strong>Sin vehículo</strong>. Si el camión está
                  en ruta, su patente sigue en la lista solo para esa fila. Para mandar unidad a taller, desasigná al chofer
                  acá primero.
                </p>
              </div>
              <button
                type="button"
                className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                onClick={() => setModalAsignarOpen(false)}
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {assignError ? <p className="error mx-4 mt-2">{assignError}</p> : null}
            <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3 sm:px-4">
              {driversQ.isLoading ? (
                <p className="text-sm text-slate-500">Cargando conductores…</p>
              ) : (driversQ.data ?? []).length === 0 ? (
                <p className="text-sm text-slate-500">No hay conductores. Creá uno con el botón Crear conductor.</p>
              ) : (
                <div className="table-wrap -mx-1 max-h-[min(60vh,520px)] overflow-auto rounded-lg border border-slate-200">
                  <table className="table-pro w-full min-w-[36rem] text-sm">
                    <thead className="sticky top-0 z-[1] bg-slate-100/95 text-xs shadow-sm">
                      <tr>
                        <th>Conductor</th>
                        <th>RUT/NIT</th>
                        <th>Portal</th>
                        <th className="min-w-[11rem]">Vehículo</th>
                        <th className="w-px whitespace-nowrap" />
                      </tr>
                    </thead>
                    <tbody>
                      {(driversQ.data ?? []).map((d) => {
                        const options = vehicleSelectOptionsForDriver(d, allVehicles, freeVehicles);
                        const saved = d.assignedVehicle?.id ?? "";
                        const picked = vehicleDraft[d.id] !== undefined ? vehicleDraft[d.id]! : saved;
                        const dirty = picked !== saved;
                        const pending = assign.isPending && assign.variables?.driverId === d.id;
                        return (
                          <tr key={d.id}>
                            <td className="font-medium text-slate-900">{d.fullName}</td>
                            <td className="text-slate-600">{d.taxId ?? "—"}</td>
                            <td className="text-slate-600 text-xs">{d.user?.email ?? "—"}</td>
                            <td>
                              <select
                                className="w-full min-w-0 text-sm"
                                value={picked}
                                disabled={pending}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setVehicleDraft((prev) => {
                                    if (v === saved) {
                                      const next = { ...prev };
                                      delete next[d.id];
                                      return next;
                                    }
                                    return { ...prev, [d.id]: v };
                                  });
                                }}
                                aria-label={`Vehículo para ${d.fullName}`}
                              >
                                <option value="">— Sin vehículo —</option>
                                {options.map((v) => (
                                  <option key={v.id} value={v.id}>
                                    {v.plate}
                                    {v.status === "asignado" ? " (en ruta)" : ""}
                                    {v.status === "en_taller" ? " (taller)" : ""}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="pr-1 pl-1">
                              <button
                                type="button"
                                className="btn-primary btn-sm whitespace-nowrap"
                                disabled={!dirty || pending}
                                onClick={() =>
                                  assign.mutate({
                                    driverId: d.id,
                                    vehicleId: picked || null,
                                  })
                                }
                              >
                                {pending ? "…" : "Aplicar"}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function FlotaAdminPage() {
  return (
    <div className="space-y-4">
      <header className="page-header">
        <h1 className="text-xl font-semibold">Flota</h1>
        <p className="text-sm text-blue-100">
          Arriba tu flota (unidades, estado, taller y alta de vehículo). Abajo, crear conductores o asignarlos a unidades.
        </p>
      </header>
      <FlotaAdminContent />
    </div>
  );
}
