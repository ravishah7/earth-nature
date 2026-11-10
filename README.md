# EarthExplorer — Earth Change Intelligence

An interactive 3D globe for exploring how Earth's air temperature has changed
year by year, built for the **NASA Space Apps Challenge 2026**.

Pick any country on the globe (or search for it), watch an animated anomaly
heatmap play through 2001–2025, and read a synchronised graph and statistics for
the selected region.

> **Project status**
>
> | Area | State |
> |---|---|
> | Global country boundaries, search, click-to-select, camera zoom | Implemented |
> | NASA POWER temperature pipeline, anomaly heatmap, timeline animation | Implemented — **needs a one-off data build** (see [Build the temperature data](#4-build-the-temperature-data)) |
> | Recharts graph, regional statistics, region/parent/global comparison | Implemented |
> | State / province selection (first-level divisions) in the UI | **Not built yet** (the server API for it already exists) |
> | Performance tuning pass, tablet layout polish | Not done |
>
> The server logic has automated tests (synthetic data only). The browser UI has
> been syntax- and import-checked but has not been verified end to end — please
> report anything that misbehaves.

---

## Contents

1. [What it does](#what-it-does)
2. [Tech stack](#tech-stack)
3. [Quick start](#quick-start)
4. [Build the temperature data](#4-build-the-temperature-data)
5. [Project structure](#project-structure)
6. [Configuration](#configuration)
7. [API reference](#api-reference)
8. [Scientific method](#scientific-method)
9. [Limitations](#limitations)
10. [Testing](#testing)
11. [Troubleshooting](#troubleshooting)
12. [Roadmap](#roadmap)
13. [Data sources and attribution](#data-sources-and-attribution)

---

## What it does

- **3D Earth** (CesiumJS): rotate, zoom, pan; click anywhere to select the
  country under the cursor.
- **Geography**: Continent → Country selectors and a debounced, keyboard-friendly
  search. Selecting a country highlights its boundary and flies the camera to it.
  The camera frames the *main landmass* (France frames Europe, not French
  Guiana). "Back to global view" resets everything.
- **Temperature heatmap**: annual air-temperature **anomaly** on a 1° grid,
  drawn as one image layer per year (not thousands of Cesium entities).
- **Timeline animation**: year slider, Play / Pause / Reset, speed control
  (0.5×–4×), large selected-year display, smooth cross-fade between years.
- **Historical graph** (Recharts): annual anomaly or annual mean temperature, a
  baseline line, a selected-year marker, a descriptive linear trend, and optional
  comparison with the parent region and the global mean. Gaps show where data is
  insufficient — nothing is estimated.
- **Regional statistics**: anomaly for the selected year, annual mean, baseline
  mean, historical and recent averages, and trend per decade (± standard error).

The globe, graph and statistics always read the same dataset, region and year.

## Tech stack

| Layer | Technology |
|---|---|
| Client | React 19, Vite, Tailwind CSS 4, CesiumJS, Recharts, lucide-react |
| Server | Node.js ≥ 20.12, Express 5 (ES modules) |
| Boundaries | Natural Earth 1:10m Admin-0 / Admin-1 (v5.1.2, public domain) |
| Temperature | NASA POWER Monthly & Annual API, parameter `T2M` (MERRA-2) |

No database. Processed data lives in files under `Server/data/` (git-ignored).

## Quick start

**Prerequisites:** Node.js 20.12 or newer, and a free
[Cesium ion](https://ion.cesium.com/tokens) access token.

### 1. Server

```bash
cd Server
npm install
npm run data:geo        # one-off: downloads Natural Earth and builds boundary files (needs internet)
npm test                # optional: unit tests
npm run dev             # http://localhost:4000
```

### 2. Client

```bash
cd Client
npm install
cp .env.example .env.local     # Windows: copy .env.example .env.local
```

Edit `Client/.env.local` so it contains **exactly one line** — no quotes, no
spaces, and the value starts with `eyJ`:

```
VITE_CESIUM_ION_TOKEN=eyJhbGciOi...your_whole_token...
```

Then:

```bash
npm run dev             # http://localhost:5173  (proxies /api to :4000)
```

Vite only reads `.env.local` at startup — restart it after any change.

### 3. See the globe

Open <http://localhost:5173>. Geography works as soon as `data:geo` has run. The
temperature layer appears after the next step.

---

## 4. Build the temperature data

This is a one-off step. The browser never calls NASA; the server serves a
pre-built grid.

```bash
cd Server
npm run data:temperature -- --probe              # 1 request: print the real response structure
npm run data:temperature -- --bbox 68,6,98,38    # small test build first (India region)
npm run data:temperature                         # full globe (thousands of requests)
npm run dev                                      # restart so the server loads the data
```

Notes:

- **Start with `--probe`.** It fetches one small tile and prints the response
  keys. The parser assumes the documented POWER JSON layout; if `--probe` shows
  something different, the parser needs a small adjustment.
- **It is resumable.** Every tile is cached in `Server/data/raw/power/`. An
  interrupted run continues where it stopped; nothing is requested twice.
- **It is long.** A full globe is thousands of regional requests (about 4.5° per
  tile, limited to one parameter and roughly 100 grid points each). Failures
  retry with back-off, including on HTTP 429. Run a `--bbox` build first to
  verify everything end to end.
- **A `--bbox` build is partial.** The heatmap only fills that box, and global
  statistics are reported as missing rather than estimated.
- The build refuses to publish obviously broken data (no valid baseline cells,
  or implausible temperatures).

### Build options

| Option | Default | Meaning |
|---|---|---|
| `--probe` | off | Fetch one tile, print its structure, exit |
| `--bbox w,s,e,n` | `-180,-90,180,90` | Limit the area |
| `--start`, `--end` | `2001`, `2025` | Years to fetch |
| `--baseline a-b` | `2001-2020` | Baseline period (must lie inside the fetched years) |
| `--tile deg` | `4.5` | Tile size in degrees |
| `--concurrency n` | `2` | Parallel requests |

To use the WMO-standard 1991–2020 normal instead, run
`npm run data:temperature -- --start 1991 --baseline 1991-2020` (a larger download).

---

## Project structure

```
earth-nature/
├── Client/
│   ├── .env.example
│   ├── vite.config.js                 # dev proxy: /api -> http://localhost:4000
│   └── src/
│       ├── App.jsx                    # composes globe, panels, timeline
│       ├── components/
│       │   ├── globe/
│       │   │   ├── EarthGlobe.jsx     # Cesium viewer, click picking, load fallbacks
│       │   │   ├── BoundaryLayer.jsx  # selected-region outline + camera fly-to
│       │   │   └── TemperatureLayer.jsx  # per-year imagery layers, cross-fade
│       │   ├── geography/             # RegionSearch, RegionSelector, CountrySelector
│       │   ├── temperature/           # Legend, TimelineControls, Chart, Statistics, Comparison
│       │   ├── dashboard/             # RegionPanel, TemperatureDashboard
│       │   └── layout/                # Navbar, LocationPanel
│       ├── hooks/                     # useRegionSelection, useTemperatureData,
│       │                              # useTimeline, useRegionTimeline
│       ├── services/                  # apiClient, regionApi, boundaryApi, temperatureApi
│       ├── utils/                     # geoUtils, temperatureColor, temperatureRaster, cesiumToken
│       └── styles/                    # geography.css, temperature.css
└── Server/
    ├── index.js                       # boot: load data, start Express
    ├── scripts/
    │   ├── build-geodata.js           # Natural Earth -> processed boundary files
    │   └── build-temperature.js       # NASA POWER -> processed temperature grid
    ├── src/
    │   ├── app.js
    │   ├── config/                    # geography.config.js, nasa.config.js
    │   ├── routes/ controllers/       # region, boundary, temperature
    │   ├── services/
    │   │   ├── geography/             # geoBuild, geoStore, region, boundary
    │   │   ├── nasa/nasaPower.service.js
    │   │   └── analysis/              # temperatureBuild, temperatureStore,
    │   │                              # anomaly, aggregation, temperatureAnalysis
    │   └── utils/                     # geoProcessing, validators, response
    ├── test/                          # geography.test.js, temperature.test.js
    └── data/                          # generated, git-ignored
        ├── raw/                       # downloaded source files and cached NASA tiles
        ├── processed/                 # boundary index + geometry
        └── temperature/               # meta.json, baseline.i16, t2m-<year>.i16
```

## Configuration

| File | Variable | Purpose |
|---|---|---|
| `Client/.env.local` | `VITE_CESIUM_ION_TOKEN` | Cesium ion token (required) |
| `Client/.env.local` | `VITE_API_BASE_URL` | Absolute API origin for production builds (leave empty in dev) |
| `Client/.env.local` | `VITE_DEV_API_TARGET` | Override the dev proxy target (default `http://localhost:4000`) |
| `Server/.env` | `PORT` | API port (default `4000`) |
| `Server/.env` | `CLIENT_ORIGIN` | Comma-separated allowed browser origins (not needed with the Vite proxy) |

Scientific settings (baseline, grid size, coverage threshold, tile size, valid
temperature range) live in `Server/src/config/nasa.config.js`. Boundary settings
live in `Server/src/config/geography.config.js`.

Never commit `.env.local` or `.env`; both are git-ignored. Do not share a zip of
the repository that contains your token.

---

## API reference

Every response uses one envelope:

```json
{
  "data": { },
  "meta": {
    "source": "…",
    "resolution": "…",
    "baseline": "2001–2020 mean of each grid cell",
    "units": "°C",
    "missing": [ { "year": 2012, "reason": "…" } ]
  },
  "error": null
}
```

On failure, `data` is `null` and `error` is `{ "code": "…", "message": "…" }`.

### Regions

| Endpoint | Description |
|---|---|
| `GET /api/health` | Server status; whether geography and temperature data are loaded |
| `GET /api/regions/continents` | Continents with country counts and a camera box |
| `GET /api/regions/countries?continent=&q=` | Countries (no geometry) |
| `GET /api/regions/search?q=&level=country\|admin1\|all&limit=&parentRegionId=` | Diacritics-insensitive search over names, aliases and codes |
| `GET /api/regions/locate?lat=&lon=&level=&parentRegionId=` | Which country (or division) contains a point; `data: null` over open ocean |
| `GET /api/regions/:regionId` | One region's metadata |
| `GET /api/regions/:regionId/boundary` | GeoJSON Feature (Polygon / MultiPolygon) |
| `GET /api/regions/:countryId/administrative-divisions` | First-level divisions, or `available: false` with an explicit limitation message |

Region ids: countries use ISO 3166-1 alpha-3 where it exists, otherwise Natural
Earth's code (e.g. `KOS`); divisions use ISO 3166-2 where unique (e.g. `IN-RJ`),
otherwise Natural Earth's `adm1_code`.

### Temperature

| Endpoint | Description |
|---|---|
| `GET /api/temperature/global?startYear=&endYear=` | The temperature grids for all years (Int16, little-endian, base64), baseline grid, global series and summary |
| `GET /api/temperature/region/:regionId?selectedYear=` | One region's value for a year, plus summary |
| `GET /api/temperature/region/:regionId/timeline?startYear=&endYear=` | Yearly series, trend, period averages, parent-region and global series, grid coverage, notes |

Grid encoding: stored value = round(°C × 100); `-32768` means no data. Row 0 is
the northernmost row; column 0 starts at longitude −180°. The client computes
anomaly as year value − baseline value, per cell.

If the dataset has not been built, temperature endpoints return HTTP 503 with
code `TEMPERATURE_DATA_NOT_BUILT`; the rest of the app keeps working.

---

## Scientific method

**Variable.** NASA POWER `T2M`: air temperature at 2 metres from the MERRA-2
reanalysis, over land and ocean. It is **not** land-surface temperature.

**Annual value.** POWER's annual value for each year, or the mean of all 12
monthly values when all 12 are valid. Fill values (−999) and values outside
−100…70 °C are invalid. Nothing is filled or interpolated.

**Grid.** The native points (about 0.5° latitude × 0.625° longitude) are averaged
into 1° × 1° cells. A cell is valid for a year only if **every** native point in
it is valid that year.

**Baseline and anomaly.** Each cell's baseline is its own mean over 2001–2020
(at least 16 valid years). Anomaly = annual mean − that cell's baseline. The
colours on the globe, legend and graph show anomaly, **not** absolute temperature.

**Regional averages.** Each cell is weighted by `cos(latitude) × f`, where `f` is
the fraction of the cell inside the region polygon (estimated on a 5 × 5 lattice
per cell with an exact scanline fill). Only cells with a valid year *and* a valid
baseline are used, so anomaly = mean temperature − baseline over the same cells.
A year needs at least 50 % valid area-weighted coverage; otherwise it is reported
missing with the coverage percentage.

**Trend and periods.** Trend is an ordinary least-squares line through the yearly
anomalies (needs ≥ 10 valid years), reported per decade with its standard error.
"Recent" is the last 10 years, "historical" is everything earlier in range. The
trend is **descriptive**: it shows how the series changed, not why.

**Colour classes (anomaly, °C).**

| Class | Colour | Range |
|---|---|---|
| Strong decrease | dark blue | ≤ −1.5 |
| Moderate decrease | blue | −1.5 to −0.75 |
| Slight decrease | light blue | −0.75 to −0.15 |
| Near zero | neutral grey | −0.15 to +0.15 |
| Slight increase | yellow | +0.15 to +0.6 |
| Small increase | orange | +0.6 to +1.2 |
| Moderate increase | red | +1.2 to +2.0 |
| Strong increase | dark red | ≥ +2.0 |

These thresholds are a design choice and live in
`Client/src/utils/temperatureColor.js`.

## Limitations

- **Resolution is coarse.** Data is 1° cells (about 110 km) averaged from a
  ~50 km source. It cannot describe cities or street-level conditions. Regions
  smaller than about 3 cells are flagged, and regions too small to sample take
  the value of their centre cell, with a warning.
- **Boundaries are approximate.** Natural Earth 1:10m is a generalised dataset,
  not survey-grade. Disputed borders follow Natural Earth's choices.
- **First-level divisions** depend on Natural Earth coverage and granularity,
  which may not match each country's official divisions. Countries without data
  are reported as such; no boundaries are invented.
- **"Global" is not NASA's official global temperature.** It is an area-weighted
  mean of this reanalysis grid, not the GISS surface temperature analysis.
- **Reanalysis, not raw observations.** MERRA-2 assimilates observations into a
  model; long-term trends can be affected by changes in the observing system.
- **Continent view** is a camera framing box only; continents have no boundary
  polygon. Europe's box is wide because Russia is classed as Europe.
- **Antarctica** is outlined but not filled (a polygon along the pole cannot be
  filled correctly on a globe).
- **Click picking** uses the ellipsoid, so a click on a steep mountain at a low
  camera angle can land slightly off.
- **Large archipelagos** (Canada, Indonesia) draw one entity per polygon ring;
  switching to a ground primitive is the upgrade path if it feels slow.
- **Server memory:** country geometry is held in memory; division geometry loads
  per country on demand.

## Testing

```bash
cd Server
npm test
```

26 tests cover boundary building (including Natural Earth's `-99` codes),
search, point-in-polygon, the NASA response parser and retry logic, grid
building, area-weighted aggregation, trend recovery, and missing-data handling.
They use small **synthetic** fixtures (fictional countries, made-up temperatures
with a known trend) to verify the maths — no test data is ever shipped as real
data.

Not covered by automated tests: the Express wiring, the live NASA response, and
everything that runs in the browser (Cesium rendering, the chart, the timeline).

### Manual check list

1. `curl localhost:4000/api/health` reports geography (and temperature) ready.
2. Search "Brazil"; click France and Australia; click the ocean (a notice, not an
   error).
3. Press Play: the heatmap should cross-fade year to year and the graph's
   vertical marker should follow.
4. Drag the slider while paused; the year, globe, graph and panel should agree.
5. Select a very small country: a low-resolution warning should appear.
6. Stop the server mid-session: the UI should show an error message, not a blank
   screen.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Black screen, no planet; console shows **401** from `api.cesium.com` | The Cesium token is invalid or malformed. Check `Client/.env.local` has exactly one `VITE_CESIUM_ION_TOKEN=eyJ…` line (no quotes, no repeated variable name), restart `npm run dev`, or create a fresh token at ion.cesium.com/tokens. |
| Orange message box at the bottom right | The globe fell back to a smooth ellipsoid or the built-in Natural Earth map; the message states what failed to load. |
| "Cesium ion token missing / looks malformed" | The globe area explains the fix; see the first row. |
| Server exits: "Geography data not found" | Run `npm run data:geo` in `Server`. |
| Server warns "Temperature data not found" | Run `npm run data:temperature` (see above), then restart the server. The globe still works without it. |
| "Cannot reach the EarthExplorer server" | Start the server (`npm run dev` in `Server`) and keep the Vite dev server running so `/api` is proxied. |
| `data:temperature` fails with "No grid cell has a valid baseline" | The NASA response was not parsed as expected. Run with `--probe` and compare the structure with the parser in `Server/src/services/nasa/nasaPower.service.js`. |
| `data:temperature` is slow or hits HTTP 429 | The script backs off and retries automatically; reduce `--concurrency` to 1, or build a smaller `--bbox` first. Cached tiles are never re-downloaded. |
| Data build blocked by a firewall | For boundaries, download the two files named in `geography.config.js` and run `npm run data:geo -- --source <folder>`. |

## Roadmap

- **Milestone 2 — administrative divisions in the UI:** state/province selector,
  faint division outlines inside the selected country, click-through selection,
  comparison with parent country and global (server side already supports it).
- **Milestone 6 — polish:** rendering performance for large archipelagos,
  tablet layout, wider testing across countries.
- Possible: additional NASA datasets (the grid pipeline is parameter-driven),
  finer grid for regional views, geoBoundaries to fill Natural Earth gaps.

## Data sources and attribution

- **Temperature:** NASA Prediction Of Worldwide Energy Resources (POWER),
  Monthly & Annual API — MERRA-2 (NASA GMAO), parameter T2M.
  <https://power.larc.nasa.gov/> · API docs:
  <https://power.larc.nasa.gov/docs/services/api/temporal/monthly/>
- **Boundaries:** Natural Earth, public domain. <https://www.naturalearthdata.com/>
- **Globe and imagery:** CesiumJS and Cesium ion. <https://cesium.com/>

This is a hackathon project: the visualisations describe how a reanalysis
product changed over time. They do not, on their own, establish why.
