import { describe, expect, test } from "@jest/globals";
import { assertValidChileanRut, isValidChileanRut, normalizeChileanRut } from "../src/lib/chileRut.js";
import { ApiError } from "../src/lib/apiError.js";

describe("chileRut", () => {
  test("normaliza formato con puntos y guión", () => {
    expect(normalizeChileanRut("11.111.111-1")).toBe("11111111-1");
  });

  test("valida dígito verificador conocido", () => {
    expect(isValidChileanRut("11111111-1")).toBe(true);
    expect(isValidChileanRut("11111111-9")).toBe(false);
  });

  test("assertValidChileanRut lanza ApiError si el verificador no coincide", () => {
    expect(() => assertValidChileanRut("11.111.111-0")).toThrow(ApiError);
  });
});
