// SYNTHETIC test data only (fictional countries, made-up temperatures with a
// known trend) to verify the maths. Nothing here is shipped as data. The POWER
// JSON shape used in the parser tests is the shape the parser ASSUMES; confirm
// it against the real API with `npm run data:temperature -- --probe`.

import test, { before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { annualValue, parseRegionalResponse, fetchRegionalAnnual } from "../src/services/nasa/nasaPower.service.js";
import { buildGridDataset, makeGrid, FILL } from "../src/services/analysis/temperatureBuild.service.js";
import { rasterizeGeometry, regionSeries, globalMask, buildMask } from "../src/services/analysis/aggregation.service.js";
import { writeTemperatureDataset, initTemperatureStore, getTemperatureStore } from "../src/services/analysis/temperatureStore.js";
import * as analysis from "../src/services/analysis/temperatureAnalysis.service.js";
import { buildFromRaw } from "../src/services/geography/geoBuild.js";
import { writeProcessed } from "../scripts/build-geodata.js";
import { initGeoStore } from "../src/services/geography/geoStore.js";
import { planTiles } from "../scripts/build-temperature.js";

const YEARS = Array.from({ length: 25 }, (_, i) => 2001 + i);
const BASELINE = { start: 2001, end: 2020, minValidYears: 16 };
const sq = (w, s, e, n) => [[[w, s], [e, s], [e, n], [w, n], [w, s]]];
const poly = (...b) => ({ type: "Polygon", coordinates: sq(...b) });

// ---------- parser ----------
test("annualValue: uses the annual key, falls back to 12 valid months, never fills", () => {
  assert.equal(annualValue({ "200113": 12.5 }, 2001), 12.5);
  const months = {};
  for (let m = 1; m <= 12; m++) months[`2002${String(m).padStart(2, "0")}`] = m; // mean 6.5
  assert.equal(annualValue(months, 2002), 6.5);
  months["200203"] = -999; // fill value
  assert.ok(Number.isNaN(annualValue(months, 2002)));
  assert.ok(Number.isNaN(annualValue({ "200413": -999 }, 2004)));
  assert.ok(Number.isNaN(annualValue({ "200413": 999 }, 2004))); // outside valid range
});

test("parseRegionalResponse reads features and rejects unexpected shapes", () => {
  const json = { features: [{ geometry: { coordinates: [10.5, 20, 100] }, properties: { parameter: { T2M: { "200113": 21, "200213": -999 } } } }] };
  const pts = parseRegionalResponse(json, [2001, 2002]);
  assert.deepEqual([pts[0].lat, pts[0].lon, pts[0].values[0]], [20, 10.5, 21]);
  assert.ok(Number.isNaN(pts[0].values[1]));
  assert.throws(() => parseRegionalResponse({ nope: 1 }, [2001]), /features/);
  assert.throws(() => parseRegionalResponse({ features: [{ geometry: { coordinates: [0, 0] }, properties: { other: 1 } }] }, [2001]).length);
});

test("fetchRegionalAnnual retries on 429 and fails fast on 4xx", async () => {
  const ok = { features: [{ geometry: { coordinates: [1, 2] }, properties: { parameter: { T2M: { "200113": 5 } } } }] };
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    return calls === 1
      ? { status: 429, ok: false, headers: { get: () => "0" } }
      : { status: 200, ok: true, json: async () => ok, headers: { get: () => null } };
  };
  const pts = await fetchRegionalAnnual({ west: 0, south: 0, east: 1, north: 1 }, { startYear: 2001, endYear: 2001, fetchImpl, sleepImpl: async () => {} });
  assert.equal(calls, 2);
  assert.equal(pts[0].values[0], 5);

  const bad = async () => ({ status: 422, ok: false, headers: { get: () => null }, text: async () => "bad area" });
  await assert.rejects(fetchRegionalAnnual({ west: 0, south: 0, east: 1, north: 1 }, { startYear: 2001, endYear: 2001, fetchImpl: bad, sleepImpl: async () => {} }), /HTTP 422/);
});

test("planTiles covers the box without overlapping shared edges", () => {
  const tiles = planTiles([0, 0, 9, 9], 4.5);
  assert.equal(tiles.length, 4);
  assert.deepEqual(tiles[0], { west: 0, south: 0, east: 4.49, north: 4.49 });
  assert.deepEqual(tiles.at(-1), { west: 4.5, south: 4.5, east: 9, north: 9 });
});

// ---------- grid build ----------
const synthValue = (year, lon) => 20 + 0.02 * lon + 0.04 * (year - 2001);

function syntheticPoints({ dropYear2012AboveLon } = {}) {
  const pts = [];
  for (let lat = -2; lat <= 12; lat += 0.5) {
    for (let lon = 0; lon <= 12; lon += 0.625) {
      pts.push({
        lat, lon,
        values: YEARS.map((y) => (y === 2012 && dropYear2012AboveLon !== undefined && lon >= dropYear2012AboveLon ? NaN : synthValue(y, lon))),
      });
    }
  }
  return pts;
}

test("buildGridDataset: baseline, strict cell validity, duplicates collapsed", () => {
  const grid = makeGrid(1);
  const pts = syntheticPoints({ dropYear2012AboveLon: 3 });
  const { frames, baselineGrid, report } = buildGridDataset([...pts, ...pts.slice(0, 20)], { grid, years: YEARS, baseline: BASELINE });
  assert.equal(report.nativePoints, pts.length); // duplicates removed

  // A cell fully inside lon 1–2, lat 5–6 (row = 90-6 = 84, col = 1+180).
  const idx = 84 * grid.cols + 181;
  const base = baselineGrid[idx] * 0.01;
  const expectedBase = 20 + 0.02 * 1.4 + 0.04 * 9.5; // cell mean of lon samples 1.25 & 1.875 ≈ 1.5625 → check tolerance
  assert.ok(Math.abs(base - (20 + 0.02 * 1.5625 + 0.04 * 9.5)) < 0.02, `baseline ${base} vs ~${expectedBase}`);
  // 2012 is index 11: cells with lon>=3 lose that year entirely.
  assert.notEqual(frames[0][idx], FILL);
  const farCell = 84 * grid.cols + (180 + 8);
  assert.equal(frames[11][farCell], FILL);
  assert.notEqual(frames[10][farCell], FILL);
});

test("buildGridDataset rejects a baseline outside the fetched years", () => {
  assert.throws(() => buildGridDataset([], { grid: makeGrid(1), years: [2001, 2002], baseline: BASELINE }), /Baseline/);
});

// ---------- rasterization & weighting ----------
test("rasterizeGeometry: full cells, partial cells, holes", () => {
  const grid = makeGrid(1);
  const full = rasterizeGeometry(poly(0, 0, 2, 2), grid);
  assert.equal(full.size, 4);
  for (const f of full.values()) assert.equal(f, 1);

  const half = rasterizeGeometry(poly(0, 0, 1.5, 1), grid);
  const fr = [...half.values()].sort();
  assert.deepEqual(fr.map((x) => Math.round(x * 100) / 100), [0.6, 1]); // lattice of 5 → 0.5 shows as 0.6 (3 of 5 samples)

  const holed = { type: "Polygon", coordinates: [...sq(0, 0, 3, 3), [[1, 1], [2, 1], [2, 2], [1, 2], [1, 1]]] };
  const m = rasterizeGeometry(holed, grid);
  assert.equal(m.size, 8); // centre cell is a hole
});

test("buildMask falls back to the centre cell for regions smaller than the lattice", () => {
  const mask = buildMask(poly(5.01, 5.01, 5.03, 5.03), makeGrid(1));
  assert.equal(mask.fallback, true);
  assert.equal(mask.cellsTouched, 1);
});

test("regionSeries: area weighting and coverage rule", () => {
  const grid = makeGrid(1);
  const n = grid.rows * grid.cols;
  const baseline = new Int16Array(n).fill(FILL);
  const frame = new Int16Array(n).fill(FILL);
  // Two cells: equator (row 89) value 30.00, baseline 29.00; 60°N (row 29) value 10.00, baseline 9.50.
  const eq = 89 * grid.cols, hi = 29 * grid.cols;
  baseline[eq] = 2900; frame[eq] = 3000;
  baseline[hi] = 950; frame[hi] = 1000;
  const store = { years: [2001], frames: new Map([[2001, frame]]), baseline };
  const mask = { indices: Int32Array.from([eq, hi]), weights: Float64Array.from([Math.cos(0.5 * Math.PI / 180), Math.cos(59.5 * Math.PI / 180)]), effectiveCells: 2, cellsTouched: 2, fallback: false };
  const [row] = regionSeries(mask, store, { startYear: 2001, endYear: 2001, minCoverage: 0.5 });
  const w1 = mask.weights[0], w2 = mask.weights[1];
  const expectedAnom = (w1 * 1.0 + w2 * 0.5) / (w1 + w2);
  assert.ok(Math.abs(row.anomaly - expectedAnom) < 0.002);
  assert.ok(Math.abs(row.meanTemp - row.baselineTemp - row.anomaly) < 0.002);

  // Remove the equatorial cell: valid weight share drops below 50% → missing, not guessed.
  frame[eq] = FILL;
  const [row2] = regionSeries(mask, store, { startYear: 2001, endYear: 2001, minCoverage: 0.5 });
  assert.equal(row2.anomaly, null);
  assert.ok(row2.coverage < 0.5);
});

// ---------- end to end through the services ----------
before(async () => {
  // Geography: Alphaland (0–10°) with two divisions, and a tiny country.
  const countriesFC = { features: [
    { properties: { ADM0_A3: "AAA", ISO_A3: "AAA", ISO_A2: "AA", NAME: "Alphaland", CONTINENT: "Asia" }, geometry: poly(0, 0, 10, 10) },
    { properties: { ADM0_A3: "TTT", ISO_A3: "TTT", NAME: "Tinyland", CONTINENT: "Asia" }, geometry: poly(5.01, 5.01, 5.03, 5.03) },
  ] };
  const admin1FC = { features: [
    { properties: { adm0_a3: "AAA", name: "Alpha North", iso_3166_2: "AA-N", adm1_code: "AAA-1" }, geometry: poly(0, 5, 10, 10) },
    { properties: { adm0_a3: "AAA", name: "Alpha South", iso_3166_2: "AA-S", adm1_code: "AAA-2" }, geometry: poly(0, 0, 10, 5) },
  ] };
  const geoDir = await fs.mkdtemp(path.join(os.tmpdir(), "ee-geo2-"));
  await writeProcessed(geoDir, buildFromRaw(countriesFC, admin1FC));
  await initGeoStore(geoDir);

  const grid = makeGrid(1);
  const { frames, baselineGrid, report } = buildGridDataset(syntheticPoints({ dropYear2012AboveLon: 3 }), { grid, years: YEARS, baseline: BASELINE });
  const tdir = await fs.mkdtemp(path.join(os.tmpdir(), "ee-temp-"));
  await writeTemperatureDataset(tdir, {
    meta: { version: 1, builtAt: "test", grid, years: YEARS, baseline: BASELINE, report },
    baselineGrid, frames, years: YEARS,
  });
  await initTemperatureStore(tdir);
});

test("store round-trips the binary grid", () => {
  const s = getTemperatureStore();
  assert.equal(s.years.length, 25);
  assert.equal(s.frames.get(2001).length, 180 * 360);
});

test("country timeline: exact known anomalies, missing year reported, trend recovered", async () => {
  const { data, meta } = await analysis.getRegionTimeline("AAA");
  const byYear = Object.fromEntries(data.series.map((s) => [s.year, s]));
  // Every cell's anomaly is 0.04 × (year − 2010.5); allow Int16 rounding.
  assert.ok(Math.abs(byYear[2025].anomaly - 0.04 * (2025 - 2010.5)) < 0.011);
  assert.ok(Math.abs(byYear[2001].anomaly - 0.04 * (2001 - 2010.5)) < 0.011);
  // 2012 lost most of the region → null with a stated reason, never interpolated.
  assert.equal(byYear[2012].anomaly, null);
  assert.ok(meta.missing.some((m) => m.year === 2012 && /Valid data covers/.test(m.reason)));
  // Descriptive linear trend ≈ 0.4 °C/decade.
  assert.ok(Math.abs(data.summary.trend.perDecade - 0.4) < 0.02);
  assert.equal(data.summary.trend.n, 24);
  assert.equal(data.parent, null);
  assert.equal(data.coverage.lowResolution, false);
  assert.match(meta.baseline, /2001–2020/);
});

test("division timeline includes its parent country and global for comparison", async () => {
  const { data } = await analysis.getRegionTimeline("AA-N");
  assert.equal(data.parent.id, "AAA");
  assert.equal(data.parent.series.length, 25);
  assert.equal(data.global.series.length, 25);
});

test("tiny region is flagged as low resolution", async () => {
  const { data } = await analysis.getRegionTimeline("TTT");
  assert.equal(data.coverage.fallbackToCentreCell, true);
  assert.equal(data.coverage.lowResolution, true);
  assert.ok(data.notes.length >= 1);
});

test("partial dataset: global series is missing, not fabricated", () => {
  const { data, meta } = analysis.getGlobalData();
  assert.ok(data.series.every((s) => s.anomaly === null));
  assert.equal(meta.missing.length, 25);
  assert.equal(Object.keys(data.frames).length, 25);
  assert.equal(data.encoding.fill, -32768);
});

test("year range validation and region summary", async () => {
  assert.throws(() => analysis.getGlobalData({ startYear: 1990 }), (e) => e.status === 400);
  const { data } = await analysis.getRegionSummary("AAA", { selectedYear: 2020 });
  assert.equal(data.selectedYear, 2020);
  assert.ok(Math.abs(data.value.anomaly - 0.04 * 9.5) < 0.011);
  await assert.rejects(analysis.getRegionSummary("AAA", { selectedYear: 1999 }), (e) => e.status === 400);
  await assert.rejects(analysis.getRegionTimeline("NOPE"), (e) => e.status === 404);
});
