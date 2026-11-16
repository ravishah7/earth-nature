// Builds the global annual T2M grid from NASA POWER (run once, needs internet).
//
//   npm run data:temperature -- --probe                 # fetch ONE tile, print what came back
//   npm run data:temperature -- --bbox 68,6,98,38       # quick regional test (India-ish)
//   npm run data:temperature                            # full globe (long: thousands of requests)
//
// Options:
//   --bbox w,s,e,n     limit the area (default -180,-90,180,90)
//   --start/--end      first/last year to fetch (default from nasa.config.js)
//   --baseline a-b     baseline period, must lie inside the fetched years
//   --tile deg         tile size in degrees (default 4.5)
//   --concurrency n    parallel requests (default 2)
//
// Every tile is cached in data/raw/power/, so an interrupted run resumes
// where it stopped and a re-run makes no repeated NASA requests.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { nasaConfig as cfg } from "../src/config/nasa.config.js";
import { geographyConfig } from "../src/config/geography.config.js";
import { fetchRegionalAnnual, buildRegionalUrl } from "../src/services/nasa/nasaPower.service.js";
import { buildGridDataset, makeGrid, FILL, SCALE } from "../src/services/analysis/temperatureBuild.service.js";
import { writeTemperatureDataset, TEMPERATURE_DIR } from "../src/services/analysis/temperatureStore.js";

const RAW_DIR = path.join(geographyConfig.serverRoot, "data", "raw", "power");

export function planTiles([W, S, E, N], tileDeg) {
  const tiles = [];
  for (let s = S; s < N - 1e-9; s += tileDeg) {
    for (let w = W; w < E - 1e-9; w += tileDeg) {
      const n = Math.min(s + tileDeg, N);
      const e = Math.min(w + tileDeg, E);
      // Shave the shared edge so neighbouring tiles don't both return the
      // same grid points (only the outermost edge stays inclusive).
      tiles.push({
        west: w,
        south: s,
        east: e < E ? e - 0.01 : e,
        north: n < N ? n - 0.01 : n,
      });
    }
  }
  return tiles;
}

function parseArgs(argv) {
  const get = (name, fallback) => {
    const i = argv.indexOf(`--${name}`);
    return i === -1 ? fallback : argv[i + 1];
  };
  const bbox = get("bbox", "-180,-90,180,90").split(",").map(Number);
  if (bbox.length !== 4 || bbox.some((n) => !Number.isFinite(n))) throw new Error("--bbox must be w,s,e,n");
  const [b0, b1] = get("baseline", `${cfg.baseline.start}-${cfg.baseline.end}`).split("-").map(Number);
  return {
    probe: argv.includes("--probe"),
    bbox,
    startYear: Number(get("start", cfg.firstYear)),
    endYear: Number(get("end", cfg.lastYear)),
    baseline: { start: b0, end: b1, minValidYears: Math.max(1, Math.round((b1 - b0 + 1) * 0.8)) },
    tileDeg: Number(get("tile", cfg.tileDeg)),
    concurrency: Number(get("concurrency", cfg.concurrency)),
  };
}

const tileFile = (t, a) =>
  path.join(RAW_DIR, `t_${t.west}_${t.south}_${t.east}_${t.north}_${a.startYear}-${a.endYear}.json`);

async function loadOrFetchTile(tile, args, log) {
  const file = tileFile(tile, args);

  // Reuse previously downloaded tiles.
  try {
    return { points: JSON.parse(await fs.readFile(file, "utf8")), cached: true };
  } catch {
    // Tile is not cached; fetch it.
  }

  // NASA POWER regional API requires at least a 2° latitude range.
  // Expand only the request boundaries, not the actual tile boundaries.
  let requestSouth = tile.south;
  let requestNorth = tile.north;

  const latitudeRange = requestNorth - requestSouth;

  if (latitudeRange < 2) {
    const missingRange = 2 - latitudeRange;

    // Prefer expanding north; expand south if we reach the 90° limit.
    const expandNorth = Math.min(missingRange, 90 - requestNorth);
    requestNorth += expandNorth;
    requestSouth -= missingRange - expandNorth;
  }

  const requestTile = {
    ...tile,
    south: requestSouth,
    north: requestNorth,
  };

  const downloadedPoints = await fetchRegionalAnnual(requestTile, {
    startYear: args.startYear,
    endYear: args.endYear,
    log,
  });

  // Keep only points belonging to the original tile.
  // This prevents expanded requests from introducing duplicate or
  // out-of-bounds grid points.
  const epsilon = 1e-6;
  const points = downloadedPoints.filter(
    (p) =>
      p.lat >= tile.south - epsilon &&
      p.lat <= tile.north + epsilon &&
      p.lon >= tile.west - epsilon &&
      p.lon <= tile.east + epsilon
  );

  await fs.mkdir(RAW_DIR, { recursive: true });

  await fs.writeFile(
    file,
    JSON.stringify(
      points.map((p) => ({
        lat: p.lat,
        lon: p.lon,
        values: p.values.map((v) =>
          Number.isFinite(v) ? v : null
        ),
      }))
    )
  );

  return { points, cached: false };
}

async function probe(args) {
  const tile = { west: 70, south: 20, east: 74.5, north: 24.5 };
  console.log("Probing one tile:", buildRegionalUrl({ ...tile, startYear: args.startYear, endYear: args.startYear + 1 }));
  const res = await fetch(buildRegionalUrl({ ...tile, startYear: args.startYear, endYear: args.startYear + 1 }));
  console.log("HTTP", res.status, res.headers.get("content-type"));
  const json = await res.json();
  console.log("Top-level keys:", Object.keys(json));
  const f = json.features?.[0];
  console.log("Features:", json.features?.length, "| first feature geometry:", JSON.stringify(f?.geometry));
  const p = f?.properties?.parameter?.[cfg.parameter];
  console.log("Series keys (first 16):", p ? Object.keys(p).slice(0, 16) : "(none)");
  console.log("Header:", JSON.stringify(json.header ?? json.messages ?? null).slice(0, 400));
  console.log("\nIf this looks wrong, send me this output and I will adjust the parser.");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.probe) return probe(args);

  const years = [];
  for (let y = args.startYear; y <= args.endYear; y++) years.push(y);
  const tiles = planTiles(args.bbox, args.tileDeg);
  console.log(`${tiles.length} tiles, ${years[0]}–${years.at(-1)}, concurrency ${args.concurrency}. Cached tiles are reused.`);

  const allPoints = [];
  let done = 0, fetched = 0;
  const started = Date.now();
  let next = 0;
  const worker = async () => {
    while (next < tiles.length) {
      const tile = tiles[next++];
      const { points, cached } = await loadOrFetchTile(tile, args, (m) => console.log(m));
      for (const p of points) {
        allPoints.push({ lat: p.lat, lon: p.lon, values: p.values.map((v) => (v === null ? NaN : v)) });
      }
      done++;
      if (!cached) fetched++;
      if (done % 25 === 0 || done === tiles.length) {
        const rate = fetched / ((Date.now() - started) / 1000) || 0;
        const eta = rate ? Math.round((tiles.length - done) / rate / 60) : "?";
        console.log(`  ${done}/${tiles.length} tiles (${fetched} downloaded)  ~${eta} min left`);
      }
    }
  };
  await Promise.all(Array.from({ length: args.concurrency }, worker));

  const grid = makeGrid(cfg.cellDeg);
  const { frames, baselineGrid, report } = buildGridDataset(allPoints, { grid, years, baseline: args.baseline });

  // Sanity checks: refuse to publish a dataset that is obviously broken.
  if (report.cellsWithBaseline === 0) throw new Error("No grid cell has a valid baseline — the NASA response was not parsed correctly. Run with --probe and check the structure.");
  if (report.minAnnualMeanC < -95 || report.maxAnnualMeanC > 65) {
    throw new Error(`Implausible annual mean temperatures (${report.minAnnualMeanC} to ${report.maxAnnualMeanC} °C).`);
  }

  const partial = args.bbox.join(",") !== "-180,-90,180,90";
  const meta = {
    version: 1,
    builtAt: new Date().toISOString(),
    partial: partial ? args.bbox : false,
    source: { ...cfg.attribution, api: cfg.baseUrl, community: cfg.community, fillValue: cfg.fillValue },
    grid,
    years,
    baseline: args.baseline,
    encoding: { type: "int16-le", scale: SCALE, fill: FILL },
    rules: [
      "Annual value = POWER's annual (month 13) value, or the mean of 12 valid months; never filled.",
      "A 1° cell value is the mean of its native points and is valid only if ALL native points are valid that year.",
      "Baseline = cell mean over the baseline years; needs minValidYears valid years.",
    ],
    report,
  };
  await writeTemperatureDataset(TEMPERATURE_DIR, { meta, baselineGrid, frames, years });

  console.log("\nBuild report:", JSON.stringify(report, null, 2));
  console.log(`\nDone → ${TEMPERATURE_DIR}${partial ? "  (PARTIAL: only inside --bbox)" : ""}\nRestart the server to load it.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("\nBuild failed:", err.message);
    process.exit(1);
  });
}
