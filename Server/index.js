import { createApp } from "./src/app.js";
import { initGeoStore } from "./src/services/geography/geoStore.js";
import { initTemperatureStore } from "./src/services/analysis/temperatureStore.js";

// Node ≥ 20.12 can read .env without an extra dependency.
try { process.loadEnvFile(); } catch { /* no .env file — defaults apply */ }

const PORT = Number(process.env.PORT) || 4000;
const origins = process.env.CLIENT_ORIGIN?.split(",").map((s) => s.trim()).filter(Boolean);

try {
  const store = await initGeoStore();
  console.log(`Geography loaded: ${store.countries.length} countries, ${store.divisions.length} divisions`);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

// Temperature data is optional at startup: geography still works without it.
try {
  const t = await initTemperatureStore();
  console.log(`Temperature data loaded: ${t.years[0]}–${t.years.at(-1)}, ${t.grid.cellDeg}° grid`);
} catch (err) {
  console.warn(`${err.message}\n(The globe works without it, but no temperature layer will be shown.)`);
}

createApp({ clientOrigins: origins }).listen(PORT, () => {
  console.log(`EarthExplorer API listening on http://localhost:${PORT}`);
});
