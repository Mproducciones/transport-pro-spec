import { Router } from "express";
import { Prisma, SubscriptionStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { config } from "../config.js";
import { authenticate } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireRole.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { ApiError } from "../lib/apiError.js";

export const subscriptionsRouter = Router();
type BillingCycle = "monthly" | "annual";

subscriptionsRouter.use(authenticate, requireRole("admin"));

subscriptionsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const sub = await prisma.subscription.findUnique({
      where: { tenantId: req.auth!.tenantId },
    });
    res.json({
      success: true,
      data: {
        ...sub,
        mpEnabled: config.mpEnabled,
      },
    });
  })
);

if (config.nodeEnv !== "production") {
  subscriptionsRouter.post(
    "/activate-dev",
    asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;
    const cycleRaw = typeof req.body?.billingCycle === "string" ? req.body.billingCycle : "monthly";
    const billingCycle: BillingCycle = cycleRaw === "annual" ? "annual" : "monthly";
    const billingAmount = billingCycle === "annual" ? new Prisma.Decimal(490) : new Prisma.Decimal(49);
    const periodDays = billingCycle === "annual" ? 365 : 30;
    const sub = await prisma.subscription.upsert({
      where: { tenantId },
      update: {
        status: SubscriptionStatus.active,
        billingCycle,
        billingAmount,
        currentPeriodEnd: new Date(Date.now() + periodDays * 86400000),
      },
      create: {
        tenantId,
        status: SubscriptionStatus.active,
        plan: "pro",
        billingCycle,
        billingAmount,
        currentPeriodEnd: new Date(Date.now() + periodDays * 86400000),
      },
    });
    res.json({
      success: true,
      data: sub,
      message: "Suscripción activada en modo desarrollo (sin Mercado Pago).",
    });
    })
  );
}

const changePlanSchema = z.object({
  billingCycle: z.enum(["monthly", "annual"]),
});

subscriptionsRouter.post(
  "/change-plan",
  asyncHandler(async (req, res) => {
    const body = changePlanSchema.parse(req.body);
    const tenantId = req.auth!.tenantId;
    const amount = body.billingCycle === "annual" ? new Prisma.Decimal(490) : new Prisma.Decimal(49);
    const periodDays = body.billingCycle === "annual" ? 365 : 30;
    const sub = await prisma.subscription.upsert({
      where: { tenantId },
      update: {
        billingCycle: body.billingCycle,
        billingAmount: amount,
        status: SubscriptionStatus.active,
        currentPeriodEnd: new Date(Date.now() + periodDays * 86400000),
      },
      create: {
        tenantId,
        plan: "pro",
        status: SubscriptionStatus.active,
        billingCycle: body.billingCycle,
        billingAmount: amount,
        currentPeriodEnd: new Date(Date.now() + periodDays * 86400000),
      },
    });
    res.json({ success: true, data: sub });
  })
);

subscriptionsRouter.post(
  "/mercadopago/start",
  asyncHandler(async (_req, res) => {
    if (!config.mpEnabled) {
      return res.status(503).json({
        success: false,
        code: "MP_DISABLED",
        message: "Mercado Pago aún no está habilitado para esta empresa.",
      });
    }
    throw new ApiError(501, "Integración MP pendiente de configuración (preapproval + URLs).", "MP_NOT_CONFIGURED");
  })
);
