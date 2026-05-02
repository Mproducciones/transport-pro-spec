type LoginResult = {
  success: true;
  data: {
    token: string;
    user: { role: "admin" | "cliente" | "conductor" };
  };
};

type ApiErrorResult = {
  success: false;
  message: string;
  code?: string;
};

type DriverRow = {
  id: string;
  assignedVehicleId?: string | null;
  user?: { email: string } | null;
};

const API_BASE = process.env.SMOKE_API_BASE ?? "http://localhost:4000/api/v1";
const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL ?? "admin@demo.com";
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD ?? "Admin123!";
const CLIENT_EMAIL = process.env.SMOKE_CLIENT_EMAIL ?? "cliente@demo.com";
const CLIENT_PASSWORD = process.env.SMOKE_CLIENT_PASSWORD ?? "Cliente123!";
const DRIVER_EMAIL = process.env.SMOKE_DRIVER_EMAIL ?? "conductor@demo.com";
const DRIVER_PASSWORD = process.env.SMOKE_DRIVER_PASSWORD ?? "Conductor123!";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  const json = (await res.json()) as T | ApiErrorResult;
  if (!res.ok) {
    const err = json as ApiErrorResult;
    throw new Error(`${res.status} ${err.code ?? "ERROR"}: ${err.message}`);
  }
  return json as T;
}

async function login(email: string, password: string): Promise<LoginResult["data"]> {
  const json = await req<LoginResult>("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return json.data;
}

async function main() {
  const admin = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  const cliente = await login(CLIENT_EMAIL, CLIENT_PASSWORD);
  const conductor = await login(DRIVER_EMAIL, DRIVER_PASSWORD);

  const adminHeaders = { Authorization: `Bearer ${admin.token}` };
  const clienteHeaders = { Authorization: `Bearer ${cliente.token}` };
  const conductorHeaders = { Authorization: `Bearer ${conductor.token}` };

  const drivers = await req<{ success: true; data: DriverRow[] }>("/drivers", {
    headers: adminHeaders,
  });
  const vehicles = await req<{ success: true; data: Array<{ id: string; status: string }> }>("/vehicles", {
    headers: adminHeaders,
  });
  if (!drivers.data.length || !vehicles.data.length) throw new Error("Sin datos de chofer/flota para prueba");

  const driver = drivers.data.find((d) => d.user?.email === DRIVER_EMAIL) ?? drivers.data[0];
  const driverId = driver.id;
  const vehicleId = driver.assignedVehicleId ?? vehicles.data.find((v) => v.status !== "en_taller")?.id;
  if (!vehicleId) throw new Error("No se encontró vehículo disponible");

  const pickup = new Date(Date.now() - 3_600_000).toISOString();
  const delivery = new Date(Date.now() + 86_400_000 * 2).toISOString();

  const created = await req<{ success: true; data: { id: string } }>("/shipments", {
    method: "POST",
    headers: { ...clienteHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({
      origin: "Santiago Centro",
      destination: "Valparaiso Puerto",
      cargoDescription: "Smoke critical",
      cargoType: "caja",
      cargoWeightKg: 120,
      cargoVolumeM3: 2.5,
      scheduledPickup: pickup,
      scheduledDelivery: delivery,
      amount: 190000,
    }),
  });
  const shipmentId = created.data.id;

  await req("/shipments/" + shipmentId, {
    method: "PATCH",
    headers: { ...adminHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ driverId, vehicleId }),
  });
  await req("/shipments/" + shipmentId, {
    method: "PATCH",
    headers: { ...adminHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: 190000,
      paymentTerm: "upfront_partial",
      upfrontPercent: 50,
      decisionNote: "Cotización smoke — pago antes de confirmar",
    }),
  });

  const payment = await req<{ success: true; data: { id: string } }>("/payments", {
    method: "POST",
    headers: { ...clienteHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({
      shipmentId,
      amount: 95000,
      method: "transferencia",
      proofFileName: "comprobante-smoke.pdf",
      proofMimeType: "application/pdf",
      proofBase64: "JVBERi0xLjQKJcTl8uXrp/Og0MTGCg==",
    }),
  });

  await req("/payments/" + payment.data.id + "/verification", {
    method: "PATCH",
    headers: { ...adminHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "aprobado", note: "Validado en smoke" }),
  });

  await req("/shipments/" + shipmentId, {
    method: "PATCH",
    headers: { ...adminHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "confirmado" }),
  });

  await req("/shipments/" + shipmentId, {
    method: "PATCH",
    headers: { ...conductorHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "recogido", note: "Inicio operativo smoke" }),
  });
  await req("/shipments/" + shipmentId + "/location", {
    method: "POST",
    headers: { ...conductorHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ lat: -33.45, lng: -70.66 }),
  });
  await req("/shipments/" + shipmentId, {
    method: "PATCH",
    headers: { ...conductorHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "en_transito", note: "Ruta smoke" }),
  });
  await req("/shipments/" + shipmentId, {
    method: "PATCH",
    headers: { ...conductorHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({
      status: "entregado",
      deliveredToName: "Recepcion Bodega",
      deliveredToId: "RUT-12345678-9",
      deliveryEvidence: "foto-entrega-smoke.jpg",
      deliveredLat: -33.03,
      deliveredLng: -71.55,
    }),
  });

  console.log("Smoke critical OK: solicitud cliente, aprobacion admin, pago+validacion y entrega.");
}

main().catch((err) => {
  console.error("Smoke critical FAIL:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
