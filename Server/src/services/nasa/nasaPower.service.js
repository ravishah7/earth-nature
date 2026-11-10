// Client for the NASA POWER Monthly & Annual regional API. Used by the
// offline build script (never at request time) so the browser and the API
// never wait on NASA and NASA is never hit repeatedly.

import { nasaConfig as cfg } from "../../config/nasa.config.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const round3 = (n) => Math.round(n * 1000) / 1000;

export function buildRegionalUrl({ west, south, east, north, startYear, endYear }) {
  const q = new URLSearchParams({
    parameters: cfg.parameter,
    community: cfg.community,
    "latitude-min": String(round3(south)),
    "latitude-max": String(round3(north)),
    "longitude-min": String(round3(west)),
    "longitude-max": String(round3(east)),
    start: String(startYear),
    end: String(endYear),
    format: "JSON",
  });
  return `${cfg.baseUrl}?${q}`;
}

const isValid = (v) =>
  typeof v === "number" &&
  Number.isFinite(v) &&
  v !== cfg.fillValue &&
  v >= cfg.validRangeC[0] &&
  v <= cfg.validRangeC[1];

// Annual mean for one year from POWER's per-year keys: "YYYYMM" for months
// 01–12 and "YYYY13" for the annual value. If the annual key is absent or
// invalid, the mean of the 12 months is used ONLY when all 12 are valid.
// Anything else is missing (NaN) — nothing is filled or interpolated.
export function annualValue(series, year) {
  const ann = series[`${year}13`];
  if (isValid(ann)) return ann;
  let sum = 0;
  for (let m = 1; m <= 12; m++) {
    const v = series[`${year}${String(m).padStart(2, "0")}`];
    if (!isValid(v)) return NaN;
    sum += v;
  }
  return sum / 12;
}

// Turns one POWER regional JSON response into
//   [{ lat, lon, values: number[] }]  with values aligned to `years`.
export function parseRegionalResponse(json, years) {
  const features = json?.features;
  if (!Array.isArray(features)) {
    throw new Error(
      `Unexpected POWER response: no "features" array (top-level keys: ${Object.keys(json ?? {}).join(", ") || "none"}).`
    );
  }
  const points = [];
  for (const f of features) {
    const coords = f?.geometry?.coordinates;
    const series = f?.properties?.parameter?.[cfg.parameter];
    if (!Array.isArray(coords) || coords.length < 2 || !series) continue;
    const [lon, lat] = coords;
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    points.push({ lat, lon, values: years.map((y) => annualValue(series, y)) });
  }
  if (features.length > 0 && points.length === 0) {
    const sample = features[0]?.properties?.parameter
      ? Object.keys(features[0].properties.parameter)
      : Object.keys(features[0]?.properties ?? {});
    throw new Error(
      `POWER response had features but no ${cfg.parameter} series (first feature property keys: ${sample.join(", ")}).`
    );
  }
  return points;
}

// GET with timeout, retries and backoff (429 / 5xx / network errors).
export async function fetchRegionalAnnual(
  bbox,
  { startYear, endYear, fetchImpl = fetch, sleepImpl = sleep, log = () => {} } = {}
) {
  const years = [];
  for (let y = startYear; y <= endYear; y++) years.push(y);
  const url = buildRegionalUrl({ ...bbox, startYear, endYear });

  let lastError;
  for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
    try {
      const res = await fetchImpl(url, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      clearTimeout(timer);

      if (res.status === 429 || res.status >= 500) {
        const retryAfter = Number(res.headers?.get?.("retry-after"));
        const wait = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : cfg.retryBaseMs * 2 ** attempt;
        lastError = new Error(`HTTP ${res.status}`);
        log(`  ${lastError.message} — retry ${attempt + 1}/${cfg.maxRetries} in ${Math.round(wait / 1000)}s`);
        await sleepImpl(wait);
        continue;
      }
      if (!res.ok) {
        // 4xx other than 429: retrying will not help; include NASA's message.
        let detail = "";
        try { detail = (await res.text()).slice(0, 300); } catch { /* ignore */ }
        throw Object.assign(new Error(`HTTP ${res.status} for ${url}\n${detail}`), { fatal: true });
      }
      return parseRegionalResponse(await res.json(), years);
    } catch (err) {
      clearTimeout(timer);
      if (err.fatal) throw err;
      lastError = err;
      const wait = cfg.retryBaseMs * 2 ** attempt;
      log(`  ${err.name === "AbortError" ? "timeout" : err.message} — retry ${attempt + 1}/${cfg.maxRetries} in ${Math.round(wait / 1000)}s`);
      await sleepImpl(wait);
    }
  }
  throw new Error(`Gave up after ${cfg.maxRetries} retries: ${lastError?.message}`);
}
