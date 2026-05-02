export const ALLOWED_UPLOAD_MIME_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"] as const;

export type AllowedUploadMimeType = (typeof ALLOWED_UPLOAD_MIME_TYPES)[number];

const EXT_BY_MIME: Record<AllowedUploadMimeType, string> = {
  "application/pdf": ".pdf",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
};

export function isAllowedUploadMimeType(value: string): value is AllowedUploadMimeType {
  return (ALLOWED_UPLOAD_MIME_TYPES as readonly string[]).includes(value);
}

export function extensionForMimeType(mimeType: string): string {
  return isAllowedUploadMimeType(mimeType) ? EXT_BY_MIME[mimeType] : ".bin";
}

export function isReasonableBase64Payload(value: string): boolean {
  return /^[A-Za-z0-9+/]+={0,2}$/.test(value.replace(/\s/g, ""));
}
