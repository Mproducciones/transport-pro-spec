import { ApiError } from "./apiError.js";

function cleanRut(value: string): string {
  return value.replace(/[.\-\s]/g, "").toUpperCase();
}

export function normalizeChileanRut(value: string): string {
  const cleaned = cleanRut(value);
  if (!/^\d{7,8}[0-9K]$/.test(cleaned)) {
    throw new ApiError(400, "RUT inválido (formato Chile)", "INVALID_RUT");
  }
  const body = cleaned.slice(0, -1);
  const dv = cleaned.slice(-1);
  return `${body}-${dv}`;
}

export function isValidChileanRut(value: string): boolean {
  const cleaned = cleanRut(value);
  if (!/^\d{7,8}[0-9K]$/.test(cleaned)) return false;
  const body = cleaned.slice(0, -1);
  const givenDv = cleaned.slice(-1);

  let sum = 0;
  let multiplier = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  const remainder = 11 - (sum % 11);
  const expectedDv =
    remainder === 11 ? "0" : remainder === 10 ? "K" : String(remainder);
  return expectedDv === givenDv;
}

export function assertValidChileanRut(value: string, fieldLabel = "RUT"): string {
  const normalized = normalizeChileanRut(value);
  if (!isValidChileanRut(normalized)) {
    throw new ApiError(400, `${fieldLabel} inválido (verificador no coincide)`, "INVALID_RUT");
  }
  return normalized;
}

