import multer from "multer";
import path from "path";
import { ApiError } from "../lib/apiError.js";

// Tipos MIME permitidos (lista restrictiva)
const ALLOWED_MIME_TYPES = [
  // Imágenes
  "image/jpeg",
  "image/jpg", 
  "image/png",
  "image/webp",
  // Documentos
  "application/pdf",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  // Hojas de cálculo
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
];

// Extensiones de archivo permitidas
const ALLOWED_EXTENSIONS = [
  ".jpg", ".jpeg", ".png", ".webp",
  ".pdf", ".txt", ".doc", ".docx",
  ".xls", ".xlsx"
];

// Tamaño máximo: 5MB
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// Storage configuration con nombres de archivo seguros
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads"));
  },
  filename: (req, file, cb) => {
    // Generar nombre de archivo seguro con timestamp y UUID
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = `${timestamp}-${randomString}${ext}`;
    cb(null, safeName);
  }
});

// Filtro de archivos para validar tipo y extensión
const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Validar MIME type
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return cb(new ApiError(400, `Tipo de archivo no permitido: ${file.mimetype}`, "INVALID_FILE_TYPE"));
  }

  // Validar extensión
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return cb(new ApiError(400, `Extensión de archivo no permitida: ${ext}`, "INVALID_FILE_EXTENSION"));
  }

  // Validar nombre de archivo (no caracteres sospechosos)
  const originalName = file.originalname;
  if (/[<>:"|?*]/.test(originalName)) {
    return cb(new ApiError(400, "Nombre de archivo contiene caracteres no válidos", "INVALID_FILENAME"));
  }

  // Validar que no sea archivo ejecutable
  if (originalName.toLowerCase().endsWith('.exe') || 
      originalName.toLowerCase().endsWith('.bat') ||
      originalName.toLowerCase().endsWith('.sh') ||
      originalName.toLowerCase().endsWith('.scr')) {
    return cb(new ApiError(400, "No se permiten archivos ejecutables", "EXECUTABLE_FILE"));
  }

  cb(null, true);
};

// Configuración de multer con seguridad
export const secureUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1, // Solo un archivo por solicitud
    fields: 10, // Límite de campos
    fieldNameSize: 100, // Límite de nombre de campo
    fieldSize: 200 // Límite de tamaño de campo
  }
});

// Middleware para validación adicional de archivos
export function validateUploadFile(req: any, res: any, next: any) {
  if (!req.file) {
    return next();
  }

  const file = req.file;
  
  // Validaciones adicionales de seguridad
  try {
    // Verificar que el archivo existe y tiene tamaño
    if (!file.size || file.size === 0) {
      throw new ApiError(400, "El archivo está vacío", "EMPTY_FILE");
    }

    // Verificar que el archivo no sea demasiado pequeño (posible malware)
    if (file.size < 100) {
      throw new ApiError(400, "El archivo es demasiado pequeño", "FILE_TOO_SMALL");
    }

    // Log de seguridad para auditoría
    console.log(`File upload: ${file.originalname} (${file.size} bytes) from IP: ${req.ip}`);
    
    next();
  } catch (error) {
    // Eliminar archivo si hay error
    try {
      require("fs").unlinkSync(file.path);
    } catch (unlinkError) {
      // Ignorar error al eliminar
    }
    next(error);
  }
}

// Función para limpiar archivos temporales
export function cleanupTempFile(filePath: string): void {
  try {
    require("fs").unlinkSync(filePath);
  } catch (error) {
    console.error("Error cleaning up temp file:", error);
  }
}

// Middleware para sanitizar nombres de archivo en URLs
export function sanitizeFileName(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .replace(/_{2,}/g, '_')
    .substring(0, 255); // Límite de longitud
}
