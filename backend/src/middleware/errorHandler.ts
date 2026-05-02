import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import multer from "multer";
import { ApiError } from "../lib/apiError.js";
import { Prisma } from "@prisma/client";

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const requestId = req.requestId;

  if (err instanceof ApiError) {
    return res.status(err.status).json({
      success: false,
      message: err.message,
      code: err.code,
      details: err.details,
      requestId,
    });
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      message: "Validación fallida",
      code: "VALIDATION_ERROR",
      details: err.flatten(),
      requestId,
    });
  }

  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      success: false,
      message: err.code === "LIMIT_FILE_SIZE" ? "El archivo supera el tamano permitido." : "No pudimos recibir el archivo.",
      code: err.code,
      requestId,
    });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const schemaHint =
      err.code === "P2021" || err.code === "P2022"
        ? "cd backend && npx prisma migrate deploy && npx prisma generate"
        : undefined;
    console.error(
      JSON.stringify({
        level: "error",
        requestId,
        prismaCode: err.code,
        meta: err.meta,
        message: err.message,
        ...(schemaHint ? { hint: schemaHint } : {}),
      })
    );
    if (err.code === "P2021" || err.code === "P2022") {
      return res.status(503).json({
        success: false,
        message: "No pudimos cargar la informacion en este momento. Intenta nuevamente o contacta soporte.",
        code: "SCHEMA_DRIFT",
        details: { prismaCode: err.code },
        requestId,
      });
    }

    if (err.code === "P2002") {
      const target =
        err.meta && typeof err.meta === "object" && "target" in err.meta
          ? (err.meta.target as string[] | string)
          : undefined;
      const fields = Array.isArray(target) ? target.join(", ") : target;
      return res.status(409).json({
        success: false,
        message: fields
          ? `Conflicto: valor duplicado en ${fields}`
          : "Conflicto: registro duplicado",
        code: "DUPLICATE",
        details: fields ? { fields } : undefined,
        requestId,
      });
    }

    if (err.code === "P2003") {
      return res.status(400).json({
        success: false,
        message: "Operación inválida por relación de datos",
        code: "FK_CONSTRAINT",
        requestId,
      });
    }
  }

  console.error(JSON.stringify({ level: "error", requestId, err: String(err) }));
  return res.status(500).json({
    success: false,
    message: "Error interno",
    code: "INTERNAL",
    requestId,
  });
}
