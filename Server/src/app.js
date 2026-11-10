import express from "express";
import cors from "cors";
import compression from "compression";

import regionRoutes from "./routes/region.routes.js";
import boundaryRoutes from "./routes/boundary.routes.js";
import temperatureRoutes from "./routes/temperature.routes.js";
import { sendError, sendOk, HttpError } from "./utils/response.js";
import { getGeoStore } from "./services/geography/geoStore.js";
import { getTemperatureStore } from "./services/analysis/temperatureStore.js";

export function createApp({ clientOrigins } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(compression());
  app.use(cors({ origin: clientOrigins ?? ["http://localhost:5173", "http://127.0.0.1:5173"] }));

  app.get("/api/health", (req, res) => {
    let geography = { ready: false };
    try {
      const { meta } = getGeoStore();
      geography = { ready: true, version: meta.version, countries: meta.countryCount, divisions: meta.divisionCount };
    } catch { /* not loaded */ }
    let temperature = { ready: false };
    try {
      const { meta } = getTemperatureStore();
      temperature = { ready: true, years: [meta.years[0], meta.years.at(-1)], builtAt: meta.builtAt };
    } catch { /* not built */ }
    sendOk(res, { status: "ok", geography, temperature });
  });

  app.use("/api/regions", regionRoutes);
  app.use("/api/regions", boundaryRoutes);
  app.use("/api/temperature", temperatureRoutes);

  app.use((req, res) => sendError(res, 404, "NOT_FOUND", "Route not found."));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof HttpError) return sendError(res, err.status, err.code, err.message, err.details);
    console.error(err);
    sendError(res, 500, "INTERNAL_ERROR", "Unexpected server error.");
  });

  return app;
}
