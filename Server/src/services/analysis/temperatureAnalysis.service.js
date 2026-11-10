import { nasaConfig as cfg } from "../../config/nasa.config.js";
import { getTemperatureStore } from "./temperatureStore.js";
import { buildMask, globalMask, regionSeries } from "./aggregation.service.js";
import { describeBaseline } from "./anomaly.service.js";
import { SCALE, FILL } from "./temperatureBuild.service.js";
import { getRegionRecord } from "../geography/region.service.js";
import { getBoundaryFeature } from "../geography/boundary.service.js";
import { HttpError } from "../../utils/response.js";

const r3 = (x) => Math.round(x * 1000) / 1000;
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);

// ---- year range handling ----
export function resolveRange(store, startYear, endYear) {
  const first = store.years[0];
  const last = store.years.at(-1);
  const s = startYear ?? first;
  const e = endYear ?? last;
  if (s < first || e > last || s > e) {
    throw new HttpError(
      400,
      "INVALID_YEAR_RANGE",
      `Years must satisfy ${first} ≤ startYear ≤ endYear ≤ ${last}.`
    );
  }
  return { startYear: s, endYear: e };
}

// ---- descriptive statistics ----
// Ordinary least squares on (year, anomaly). Descriptive only: it says how
// the series changed, not why.
export function linearTrend(points) {
  const n = points.length;
  if (n < 3) return null;
  const mx = mean(points.map((p) => p.x));
  const my = mean(points.map((p) => p.y));
  let sxx = 0, sxy = 0;
  for (const p of points) {
    sxx += (p.x - mx) ** 2;
    sxy += (p.x - mx) * (p.y - my);
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  let rss = 0;
  for (const p of points) rss += (p.y - (intercept + slope * p.x)) ** 2;
  const stdErr = n > 2 ? Math.sqrt(rss / (n - 2) / sxx) : null;
  return { slope, intercept, stdErr, n };
}

export function summarize(series, meta, { recentYears = 10, minTrendPoints = 10 } = {}) {
  const valid = series.filter((s) => s.anomaly !== null);
  const trendFit = valid.length >= minTrendPoints
    ? linearTrend(valid.map((s) => ({ x: s.year, y: s.anomaly })))
    : null;

  const lastYear = series.at(-1)?.year;
  const recentStart = lastYear === undefined ? null : lastYear - recentYears + 1;
  const inRange = (a, b) => valid.filter((s) => s.year >= a && s.year <= b);
  const periodStats = (rows) => ({
    n: rows.length,
    startYear: rows[0]?.year ?? null,
    endYear: rows.at(-1)?.year ?? null,
    meanAnomaly: rows.length ? r3(mean(rows.map((s) => s.anomaly))) : null,
    meanTemp: rows.length ? r3(mean(rows.map((s) => s.meanTemp))) : null,
  });

  const baselineRows = inRange(meta.baseline.start, meta.baseline.end);
  const recentRows = recentStart === null ? [] : inRange(recentStart, lastYear);
  const historicalRows = recentStart === null ? [] : valid.filter((s) => s.year < recentStart);

  const baseline = periodStats(baselineRows);
  const recent = periodStats(recentRows);
  const minRecent = Math.ceil(recentYears * 0.6);

  return {
    trend: trendFit && {
      perDecade: r3(trendFit.slope * 10),
      stdErrPerDecade: trendFit.stdErr === null ? null : r3(trendFit.stdErr * 10),
      n: trendFit.n,
      startYear: valid[0].year,
      endYear: valid.at(-1).year,
      line: [valid[0].year, valid.at(-1).year].map((y) => ({
        year: y,
        value: r3(trendFit.intercept + trendFit.slope * y),
      })),
    },
    periods: {
      baseline: { ...baseline, definedStart: meta.baseline.start, definedEnd: meta.baseline.end },
      historical: periodStats(historicalRows),
      recent: { ...recent, enough: recent.n >= minRecent },
    },
    recentMinusBaseline:
      recent.meanAnomaly !== null && baseline.meanAnomaly !== null && recent.n >= minRecent
        ? r3(recent.meanAnomaly - baseline.meanAnomaly)
        : null,
    validYears: valid.length,
    totalYears: series.length,
  };
}

// ---- region masks (cached) ----
const MASK_CACHE_SIZE = 64;
const maskCache = new Map();

async function getMask(regionId, grid) {
  const key = `${regionId}|${grid.cellDeg}`;
  if (maskCache.has(key)) {
    const m = maskCache.get(key);
    maskCache.delete(key);
    maskCache.set(key, m);
    return m;
  }
  const feature = await getBoundaryFeature(regionId);
  const mask = buildMask(feature.geometry, grid);
  maskCache.set(key, mask);
  if (maskCache.size > MASK_CACHE_SIZE) maskCache.delete(maskCache.keys().next().value);
  return mask;
}

function metaBlock(store, extra = {}) {
  return {
    source: `${cfg.attribution.name} — ${cfg.attribution.dataset}, parameter ${cfg.attribution.parameter}`,
    resolution: `Grid cells of ${store.grid.cellDeg}° × ${store.grid.cellDeg}° averaged from the source's native grid (about 0.5° latitude × 0.625° longitude); regional values are area-weighted cell averages, not point measurements`,
    baseline: describeBaseline(store.meta),
    units: "°C",
    missing: [],
    ...extra,
  };
}

const missingYears = (series, store) =>
  series
    .filter((s) => s.anomaly === null)
    .map((s) => ({
      year: s.year,
      reason: `Valid data covers ${Math.round(s.coverage * 100)}% of the region (minimum ${Math.round(cfg.minRegionCoverage * 100)}%).`,
    }));

// ---- public API ----

export function getGlobalData({ startYear, endYear } = {}) {
  const store = getTemperatureStore();
  const range = resolveRange(store, startYear, endYear);
  const years = store.years.filter((y) => y >= range.startYear && y <= range.endYear);
  const series = regionSeries(globalMask(store.grid), store, { ...range, minCoverage: cfg.minRegionCoverage });

  return {
    data: {
      grid: store.grid,
      encoding: { type: "int16-le-base64", scale: SCALE, fill: FILL, unit: "°C" },
      years,
      baseline: store.encoded.baseline,
      frames: Object.fromEntries(years.map((y) => [y, store.encoded.frames.get(y)])),
      series,
      summary: summarize(series, store.meta),
      notes: [
        "Colours show temperature ANOMALY (difference from each cell's baseline mean), not absolute temperature.",
        "T2M is air temperature at 2 metres from the MERRA-2 reanalysis, not land-surface temperature.",
        "Cells with incomplete source data are left empty, never filled.",
      ],
    },
    meta: metaBlock(store, { missing: missingYears(series, store) }),
  };
}

export async function getRegionTimeline(regionId, { startYear, endYear } = {}) {
  const store = getTemperatureStore();
  const record = getRegionRecord(regionId);
  if (!record) throw new HttpError(404, "REGION_NOT_FOUND", `Unknown region "${regionId}".`);
  const range = resolveRange(store, startYear, endYear);
  const opts = { ...range, minCoverage: cfg.minRegionCoverage };

  const mask = await getMask(regionId, store.grid);
  const series = regionSeries(mask, store, opts);

  let parent = null;
  if (record.level === "admin1") {
    const parentRecord = getRegionRecord(record.parentId);
    const parentSeries = regionSeries(await getMask(record.parentId, store.grid), store, opts);
    parent = {
      id: parentRecord.id,
      name: parentRecord.name,
      series: parentSeries,
      summary: summarize(parentSeries, store.meta),
    };
  }
  const globalSeries = regionSeries(globalMask(store.grid), store, opts);

  const notes = [];
  const lowResolution = mask.effectiveCells < 3;
  if (mask.fallback) {
    notes.push("This region is smaller than the sampling lattice; values come from the single grid cell at its centre and describe the surrounding area, not the region itself.");
  } else if (lowResolution) {
    notes.push(`This region covers only about ${mask.effectiveCells.toFixed(1)} grid cells (${store.grid.cellDeg}°); its values are strongly influenced by the surrounding area.`);
  }

  return {
    data: {
      region: {
        id: record.id,
        name: record.name,
        level: record.level,
        parentId: record.parentId ?? null,
      },
      years: series.map((s) => s.year),
      series,
      summary: summarize(series, store.meta),
      parent,
      global: { series: globalSeries, summary: summarize(globalSeries, store.meta) },
      coverage: {
        cellsTouched: mask.cellsTouched,
        effectiveCells: r3(mask.effectiveCells),
        cellDeg: store.grid.cellDeg,
        lowResolution,
        fallbackToCentreCell: mask.fallback,
      },
      notes,
    },
    meta: metaBlock(store, { missing: missingYears(series, store) }),
  };
}

export async function getRegionSummary(regionId, { selectedYear, startYear, endYear } = {}) {
  const { data, meta } = await getRegionTimeline(regionId, { startYear, endYear });
  const year = selectedYear ?? data.years.at(-1);
  const row = data.series.find((s) => s.year === year);
  if (!row) {
    throw new HttpError(400, "INVALID_YEAR", `selectedYear ${year} is outside ${data.years[0]}–${data.years.at(-1)}.`);
  }
  return {
    data: {
      region: data.region,
      selectedYear: year,
      value: row,
      globalValue: data.global.series.find((s) => s.year === year) ?? null,
      summary: data.summary,
      coverage: data.coverage,
      notes: data.notes,
    },
    meta,
  };
}
