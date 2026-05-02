import { describe, expect, test } from "@jest/globals";
import { assertShipmentReadyForConfirm, canTransition } from "../src/services/shipmentService.js";
import { ApiError } from "../src/lib/apiError.js";

describe("shipmentService — transiciones", () => {
  test("admin puede transicionar cualquier estado", () => {
    expect(canTransition("admin", "pendiente", "rechazado")).toBe(true);
    expect(canTransition("admin", "en_transito", "entregado")).toBe(true);
  });

  test("conductor sigue flujo operativo", () => {
    expect(canTransition("conductor", "confirmado", "recogido")).toBe(true);
    expect(canTransition("conductor", "confirmado", "rechazado")).toBe(true);
    expect(canTransition("conductor", "recogido", "en_transito")).toBe(true);
    expect(canTransition("conductor", "recogido", "rechazado")).toBe(true);
    expect(canTransition("conductor", "en_transito", "entregado")).toBe(true);
    expect(canTransition("conductor", "en_transito", "rechazado")).toBe(true);
  });

  test("conductor no puede aprobar solicitudes", () => {
    expect(canTransition("conductor", "pendiente", "confirmado")).toBe(false);
  });

  test("cliente no puede transicionar", () => {
    expect(canTransition("cliente", "confirmado", "recogido")).toBe(false);
  });
});

describe("shipmentService — confirmar servicio", () => {
  test("exige retiro, entrega y equipo", () => {
    const t0 = new Date("2026-04-26T10:00:00Z");
    const t1 = new Date("2026-04-26T18:00:00Z");
    expect(() =>
      assertShipmentReadyForConfirm({
        scheduledPickup: null,
        scheduledDelivery: t1,
        driverId: "d1",
        vehicleId: "v1",
      })
    ).toThrow(ApiError);
    expect(() =>
      assertShipmentReadyForConfirm({
        scheduledPickup: t0,
        scheduledDelivery: t1,
        driverId: null,
        vehicleId: "v1",
      })
    ).toThrow(ApiError);
    expect(() =>
      assertShipmentReadyForConfirm({
        scheduledPickup: t1,
        scheduledDelivery: t0,
        driverId: "d1",
        vehicleId: "v1",
      })
    ).toThrow(ApiError);
    expect(() =>
      assertShipmentReadyForConfirm({
        scheduledPickup: t0,
        scheduledDelivery: t1,
        driverId: "d1",
        vehicleId: "v1",
      })
    ).not.toThrow();
  });
});
