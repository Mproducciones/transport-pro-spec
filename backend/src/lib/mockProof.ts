const MOCK_PREFIX = "mock-proof://";

export type MockProofInput = {
  fileName: string;
  mimeType: "application/pdf" | "image/png" | "image/jpeg" | "image/webp";
  base64: string;
};

export type MockProofMeta = {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  hasInlineData: boolean;
  base64?: string;
};

export function buildMockProofReference(input: MockProofInput): string {
  const safeName = encodeURIComponent(input.fileName.trim());
  const safeMime = encodeURIComponent(input.mimeType);
  const safeData = encodeURIComponent(input.base64.replace(/\s/g, ""));
  // base64 length ~ 4/3 bytes, rounded down.
  const approxBytes = Math.floor((input.base64.length * 3) / 4);
  return `${MOCK_PREFIX}${safeName}?mime=${safeMime}&bytes=${approxBytes}&data=${safeData}`;
}

export function parseMockProofReference(reference: string | null | undefined): MockProofMeta | null {
  if (!reference || !reference.startsWith(MOCK_PREFIX)) return null;
  const raw = reference.slice(MOCK_PREFIX.length);
  const [nameRaw, queryRaw] = raw.split("?");
  const params = new URLSearchParams(queryRaw ?? "");
  const mimeType = params.get("mime") ? decodeURIComponent(String(params.get("mime"))) : "application/octet-stream";
  const sizeBytes = Number(params.get("bytes") ?? 0);
  const base64 = params.get("data") ? decodeURIComponent(String(params.get("data"))) : undefined;
  return {
    fileName: decodeURIComponent(nameRaw || "comprobante"),
    mimeType,
    sizeBytes: Number.isFinite(sizeBytes) ? sizeBytes : 0,
    hasInlineData: Boolean(base64),
    base64,
  };
}
