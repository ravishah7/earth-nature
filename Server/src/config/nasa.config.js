// Everything about where the temperature data comes from and how it is
// turned into the grid the globe shows. Change values here, not in code.

export const nasaConfig = {
  // NASA POWER Monthly & Annual API, regional endpoint (one parameter per
  // request). Docs: https://power.larc.nasa.gov/docs/services/api/temporal/monthly/
  baseUrl: "https://power.larc.nasa.gov/api/temporal/monthly/regional",
  parameter: "T2M", // MERRA-2 air temperature at 2 metres (°C) — NOT land-surface temperature
  community: "AG",
  fillValue: -999, // POWER's documented value for missing source data

  // Regional requests are capped at roughly 100 grid points. At the native
  // ~0.5° × 0.625° grid that is about a 4.5° × 4.5° box.
  tileDeg: 4.5,
  concurrency: 2,
  timeoutMs: 90_000,
  maxRetries: 5,
  retryBaseMs: 2_000,

  // Timeline range (annual means). MERRA-2 meteorology is available up to the
  // end of the previous year, so 2025 is the last complete year.
  firstYear: 2001,
  lastYear: 2025,

  // Anomalies are measured against each grid cell's own mean over this
  // period. A cell needs at least minValidYears valid years to get a baseline.
  baseline: { start: 2001, end: 2020, minValidYears: 16 },

  // Output grid (equal-angle). The source is finer (~0.5° × 0.625°); native
  // points whose centres fall in a cell are averaged, and a cell is only
  // valid when ALL of its native points are valid for that year.
  cellDeg: 1,

  // A region's yearly value needs at least this share of its (area-weighted)
  // cells to have data.
  minRegionCoverage: 0.5,

  // Valid physical range for annual-mean 2 m air temperature (°C); anything
  // outside is treated as invalid rather than plotted.
  validRangeC: [-100, 70],

  attribution: {
    name: "NASA Prediction Of Worldwide Energy Resources (POWER)",
    url: "https://power.larc.nasa.gov/",
    dataset: "MERRA-2 (NASA GMAO) via POWER Monthly & Annual API",
    parameter: "T2M — Temperature at 2 Meters (air temperature)",
  },
};
