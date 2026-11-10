// Pure functions: native POWER points -> the equal-angle grid the app serves.
// No I/O here so the logic is unit-testable.

import { nasaConfig as cfg } from "../../config/nasa.config.js";

export const FILL = -32768; // Int16 marker for "no data"
export const SCALE = 0.01; // stored value = round(°C / SCALE)

export function makeGrid(cellDeg = cfg.cellDeg) {
  const rows = Math.round(180 / cellDeg);
  const cols = Math.round(360 / cellDeg);
  if (rows * cellDeg !== 180 || cols * cellDeg !== 360) {
    throw new Error(`cellDeg ${cellDeg} must divide 180 and 360 evenly.`);
  }
  // Row 0 is the northernmost row; col 0 starts at longitude -180.
  return { cellDeg, rows, cols, north: 90, west: -180 };
}

export function cellIndexOf(grid, lat, lon) {
  const r = Math.min(grid.rows - 1, Math.max(0, Math.floor((grid.north - lat) / grid.cellDeg)));
  const c = Math.min(grid.cols - 1, Math.max(0, Math.floor((lon - grid.west) / grid.cellDeg)));
  return r * grid.cols + c;
}

const toInt16 = (celsius) => Math.round(celsius / SCALE);

// points: [{ lat, lon, values: number[] }] with values aligned to `years`
// (NaN = missing). Duplicate coordinates (tile edges) are collapsed first.
export function buildGridDataset(points, { grid, years, baseline }) {
  const nCells = grid.rows * grid.cols;
  const nYears = years.length;

  const baseYearIdx = [];
  years.forEach((y, i) => { if (y >= baseline.start && y <= baseline.end) baseYearIdx.push(i); });
  if (baseYearIdx.length < baseline.minValidYears) {
    throw new Error(
      `Baseline ${baseline.start}–${baseline.end} needs at least ${baseline.minValidYears} years inside the fetched range ${years[0]}–${years.at(-1)}.`
    );
  }

  // Collapse duplicates (adjacent tiles share edge points).
  const unique = new Map();
  for (const p of points) unique.set(`${p.lat.toFixed(4)}|${p.lon.toFixed(4)}`, p);

  const nativeCount = new Uint16Array(nCells);
  const validCount = new Uint16Array(nCells * nYears);
  const sums = new Float64Array(nCells * nYears);

  for (const p of unique.values()) {
    const ci = cellIndexOf(grid, p.lat, p.lon);
    nativeCount[ci]++;
    for (let y = 0; y < nYears; y++) {
      const v = p.values[y];
      if (Number.isFinite(v)) {
        validCount[ci * nYears + y]++;
        sums[ci * nYears + y] += v;
      }
    }
  }

  // Cell-year value: mean of its native points, only if ALL are valid.
  const frames = years.map(() => new Int16Array(nCells).fill(FILL));
  for (let ci = 0; ci < nCells; ci++) {
    const n = nativeCount[ci];
    if (n === 0) continue;
    for (let y = 0; y < nYears; y++) {
      if (validCount[ci * nYears + y] === n) {
        frames[y][ci] = toInt16(sums[ci * nYears + y] / n);
      }
    }
  }

  // Baseline: mean of the cell's stored annual values over the baseline years.
  const baselineGrid = new Int16Array(nCells).fill(FILL);
  for (let ci = 0; ci < nCells; ci++) {
    let sum = 0, n = 0;
    for (const y of baseYearIdx) {
      const v = frames[y][ci];
      if (v !== FILL) { sum += v; n++; }
    }
    if (n >= baseline.minValidYears) baselineGrid[ci] = Math.round(sum / n);
  }

  // Report.
  let cellsWithData = 0, minC = Infinity, maxC = -Infinity;
  for (let ci = 0; ci < nCells; ci++) if (nativeCount[ci] > 0) cellsWithData++;
  const validCellsPerYear = {};
  years.forEach((yr, y) => {
    let n = 0;
    for (let ci = 0; ci < nCells; ci++) {
      const v = frames[y][ci];
      if (v !== FILL) {
        n++;
        if (v * SCALE < minC) minC = v * SCALE;
        if (v * SCALE > maxC) maxC = v * SCALE;
      }
    }
    validCellsPerYear[yr] = n;
  });
  let baselineCells = 0;
  for (let ci = 0; ci < nCells; ci++) if (baselineGrid[ci] !== FILL) baselineCells++;

  return {
    frames, // Int16Array per year, aligned with `years`
    baselineGrid,
    report: {
      nativePoints: unique.size,
      cellsWithNativePoints: cellsWithData,
      cellsWithBaseline: baselineCells,
      validCellsPerYear,
      minAnnualMeanC: Number.isFinite(minC) ? minC : null,
      maxAnnualMeanC: Number.isFinite(maxC) ? maxC : null,
    },
  };
}
