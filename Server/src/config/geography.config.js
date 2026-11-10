import path from "node:path";
import { fileURLToPath } from "node:url";

// Server/ root (this file lives in Server/src/config).
const SERVER_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);

// Pin the Natural Earth release so builds are reproducible.
export const NATURAL_EARTH_VERSION = "v5.1.2";
const RAW_BASE = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${NATURAL_EARTH_VERSION}/geojson`;

export const geographyConfig = {
  serverRoot: SERVER_ROOT,
  rawDir: path.join(SERVER_ROOT, "data", "raw"),
  processedDir: path.join(SERVER_ROOT, "data", "processed"),

  sources: {
    countries: {
      file: "ne_10m_admin_0_countries.geojson",
      url: `${RAW_BASE}/ne_10m_admin_0_countries.geojson`,
    },
    admin1: {
      file: "ne_10m_admin_1_states_provinces.geojson",
      url: `${RAW_BASE}/ne_10m_admin_1_states_provinces.geojson`,
    },
  },

  // 4 decimals ≈ 11 m: far finer than the 1:10m source, so nothing is lost.
  coordinatePrecision: 4,

  // A polygon counts as "main landmass" for camera framing when its area is
  // at least this fraction of the country's largest polygon.
  focusAreaRatio: 0.25,

  // Build-time sanity thresholds (guards against a truncated download).
  sanity: { minCountries: 200, minDivisions: 3000 },

  meta: {
    source: `Natural Earth 1:10m Admin-0 Countries and Admin-1 States/Provinces (${NATURAL_EARTH_VERSION}, public domain)`,
    resolution:
      "1:10,000,000 cartographic generalisation — boundaries are approximate, not survey-grade",
    attributionUrl: "https://www.naturalearthdata.com/",
  },
};
