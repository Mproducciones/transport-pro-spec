import fs from "fs";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import { config } from "./config.js";
import { securityHelmet } from "./middleware/httpSecurity.js";
import { requestIdMiddleware } from "./middleware/requestId.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { simpleSecurityLogger, simpleDoSDetection } from "./middleware/securitySimple.js";
import { authRouter } from "./routes/auth.js";
import { meRouter } from "./routes/me.js";
import { customersRouter } from "./routes/customers.js";
import { driversRouter } from "./routes/drivers.js";
import { vehiclesRouter } from "./routes/vehicles.js";
import { shipmentsRouter } from "./routes/shipments.js";
import { usersRouter } from "./routes/users.js";
import { invoicesRouter } from "./routes/invoices.js";
import { paymentsRouter } from "./routes/payments.js";
import { reportsRouter } from "./routes/reports.js";
import { expensesRouter } from "./routes/expenses.js";
import { tariffsRouter } from "./routes/tariffs.js";
import { settingsRouter } from "./routes/settings.js";
import { subscriptionsRouter } from "./routes/subscriptions.js";
import { webhooksRouter } from "./routes/webhooks.js";
import { companiesRouter } from "./routes/companies.js";
import { ownerRouter } from "./routes/owner.js";
import { alertsRouter } from "./routes/alerts.js";
import { geocodeRouter } from "./routes/geocode.js";
import { attachmentsRouter } from "./routes/attachments.js";
import { supportRouter } from "./routes/support.js";
import { settlementsRouter } from "./routes/settlements.js";

const app = express();

const trustProxyHopsEnv = process.env.TRUST_PROXY_HOPS?.trim();
if (trustProxyHopsEnv === "0" || trustProxyHopsEnv === "false") {
  // API sin reverse proxy: no confiar en X-Forwarded-*.
} else if (trustProxyHopsEnv && !Number.isNaN(Number(trustProxyHopsEnv))) {
  app.set("trust proxy", Number(trustProxyHopsEnv));
} else if (config.nodeEnv === "development") {
  // Vite (y otros dev proxies) envían X-Forwarded-For; express-rate-limit exige trust proxy.
  app.set("trust proxy", true);
} else {
  app.set("trust proxy", 1);
}

fs.mkdirSync(config.uploadDir, { recursive: true });

app.use(requestIdMiddleware);
app.use(securityHelmet());
app.use(simpleDoSDetection);
app.use(simpleSecurityLogger);
app.use(cookieParser());
app.use(
  cors({
    origin: config.corsOrigins,
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));

// Rate limiting básico para pruebas
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: config.apiRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/", apiLimiter);

const mutationLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: config.mutationRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Demasiados cambios. Esperá un minuto e intentá de nuevo.", code: "RATE_LIMIT" },
});
app.use("/api/v1", (req, res, next) => {
  if (["POST", "PATCH", "PUT", "DELETE"].includes(req.method)) {
    return mutationLimiter(req, res, next);
  }
  next();
});

// Rate limiting específico para autenticación
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.authRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/v1/auth", authLimiter);

// Rate limiting para uploads
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/v1/attachments", uploadLimiter);

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

const v1 = express.Router();
v1.use("/auth", authRouter);
v1.use("/", meRouter);
v1.use("/customers", customersRouter);
v1.use("/drivers", driversRouter);
v1.use("/vehicles", vehiclesRouter);
v1.use("/shipments", shipmentsRouter);
v1.use("/users", usersRouter);
v1.use("/invoices", invoicesRouter);
v1.use("/payments", paymentsRouter);
v1.use("/reports", reportsRouter);
v1.use("/expenses", expensesRouter);
v1.use("/tariffs", tariffsRouter);
v1.use("/settings", settingsRouter);
v1.use("/subscriptions", subscriptionsRouter);
v1.use("/webhooks", webhooksRouter);
v1.use("/companies", companiesRouter);
v1.use("/alertas", alertsRouter);
v1.use("/geocode", geocodeRouter);
v1.use(attachmentsRouter);
v1.use(supportRouter);
v1.use(settlementsRouter);

app.use("/api/v1", v1);
const ownerLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Demasiados intentos owner. Esperá un minuto.", code: "RATE_LIMIT_OWNER" },
});
app.use("/api/owner", ownerLimiter);
app.use("/api/owner", ownerRouter);
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(
    JSON.stringify({
      level: "info",
      msg: "transport-pro-api",
      port: config.port,
      env: config.nodeEnv,
    })
  );
});
