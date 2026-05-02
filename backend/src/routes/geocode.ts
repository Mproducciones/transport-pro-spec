import { Router } from "express";
import rateLimit from "express-rate-limit";
import { authenticate } from "../middleware/auth.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { searchAddresses } from "../lib/geocode.js";

const geoLimiter = rateLimit({
  windowMs: 60_000,
  limit: 24,
  standardHeaders: true,
  legacyHeaders: false,
});

export const geocodeRouter = Router();

geocodeRouter.use(authenticate);
geocodeRouter.use(geoLimiter);

geocodeRouter.get(
  "/suggestions",
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (q.length < 3) {
      res.json({ success: true, data: [] });
      return;
    }
    const data = await searchAddresses(q, { limit: 8 });
    res.json({ success: true, data });
  })
);
