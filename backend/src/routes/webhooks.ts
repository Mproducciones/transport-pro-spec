import crypto from "crypto";
import express, { Router } from "express";
import { config } from "../config.js";

export const webhooksRouter = Router();
webhooksRouter.use(express.json({ limit: "256kb" }));

function secureCompareString(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/** Si `MP_WEBHOOK_SECRET` está definido, exige `X-TP-Webhook-Token` igual (comparación en tiempo constante). */
function assertWebhookToken(req: express.Request, res: express.Response): boolean {
  if (!config.mercadoPagoWebhookSecret) return true;
  const token = String(req.header("X-TP-Webhook-Token") ?? "");
  if (!secureCompareString(token, config.mercadoPagoWebhookSecret)) {
    res.status(401).json({ success: false, message: "Webhook no autorizado", code: "WEBHOOK_UNAUTHORIZED" });
    return false;
  }
  return true;
}

webhooksRouter.post("/mercadopago", (req, res) => {
  if (!assertWebhookToken(req, res)) return;
  if (!config.mpEnabled) {
    return res.status(200).json({ received: true, ignored: true, reason: "MP_DISABLED" });
  }
  return res.status(501).json({
    received: true,
    message: "Webhook MP: validar firma y actualizar Subscription (pendiente de claves reales).",
  });
});
