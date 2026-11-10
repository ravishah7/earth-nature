// Area-weighted regional averages.
//
// Each grid cell contributes with weight  w = f × cos(latitude), where
//   f = fraction of the cell that lies inside the region polygon, and
//   cos(latitude) corrects for cells shrinking toward the poles.
// f is estimated by testing a (sub × sub) lattice of points inside every
// cell with a scanline even-odd fill — exact for the lattice, ~1/sub of a
// cell in precision.

import { FILL, SCALE } from "./temperatureBuild.service.js";
import { bboxOfGeometry, polygonsOf } from "../../utils/geoProcessing.js";

const DEG = Math.PI / 180;

export function rasterizeGeometry(geometry, grid, sub = 5) {
  const counts = new Map();
  const bbox = bboxOfGeometry(geometry);
  if (!bbox) return counts;

  // Collect every ring edge once (outer rings and holes share even-odd parity).
  const edges = [];
  for (const poly of polygonsOf(geometry)) {
    for (const ring of poly) {
      for (let i = 0; i < ring.length - 1; i++) {
        const [x1, y1] = ring[i];
        const [x2, y2] = ring[i + 1];
        if (y1 !== y2) edges.push([x1, y1, x2, y2]);
      }
    }
  }

  const step = grid.cellDeg / sub;
  const totalRows = grid.rows * sub;
  const totalCols = grid.cols * sub;
  const kMin = Math.max(0, Math.floor((grid.north - bbox[3]) / step));
  const kMax = Math.min(totalRows - 1, Math.ceil((grid.north - bbox[1]) / step));

  for (let k = kMin; k <= kMax; k++) {
    const y = grid.north - (k + 0.5) * step; // latitude of this sample row
    const xs = [];
    for (const [x1, y1, x2, y2] of edges) {
      // Half-open rule so a vertex exactly on the scanline counts once.
      if ((y1 <= y && y < y2) || (y2 <= y && y < y1)) {
        xs.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
      }
    }
    if (xs.length < 2) continue;
    xs.sort((a, b) => a - b);
    const row = Math.floor(k / sub);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const jStart = Math.max(0, Math.ceil((xs[i] - grid.west) / step - 0.5));
      const jEnd = Math.min(totalCols - 1, Math.floor((xs[i + 1] - grid.west) / step - 0.5));
      for (let j = jStart; j <= jEnd; j++) {
        const idx = row * grid.cols + Math.floor(j / sub);
        counts.set(idx, (counts.get(idx) ?? 0) + 1);
      }
    }
  }

  const per = sub * sub;
  for (const [idx, c] of counts) counts.set(idx, c / per);
  return counts;
}

function rowCosine(grid, row) {
  const lat = grid.north - (row + 0.5) * grid.cellDeg;
  return Math.cos(lat * DEG);
}

// A mask is a list of cells with weights. `fallback` is set when the region
// is smaller than the sampling lattice and had to be assigned to one cell.
export function buildMask(geometry, grid, sub = 5) {
  let fractions = rasterizeGeometry(geometry, grid, sub);
  let fallback = false;

  if (fractions.size === 0) {
    const bbox = bboxOfGeometry(geometry);
    if (!bbox) return { indices: new Int32Array(0), weights: new Float64Array(0), effectiveCells: 0, cellsTouched: 0, fallback: true };
    const lat = (bbox[1] + bbox[3]) / 2;
    const lon = (bbox[0] + bbox[2]) / 2;
    const row = Math.min(grid.rows - 1, Math.max(0, Math.floor((grid.north - lat) / grid.cellDeg)));
    const col = Math.min(grid.cols - 1, Math.max(0, Math.floor((lon - grid.west) / grid.cellDeg)));
    fractions = new Map([[row * grid.cols + col, 1]]);
    fallback = true;
  }

  const indices = Int32Array.from(fractions.keys());
  const weights = new Float64Array(indices.length);
  let effectiveCells = 0;
  indices.forEach((idx, i) => {
    const f = fractions.get(idx);
    weights[i] = f * rowCosine(grid, Math.floor(idx / grid.cols));
    effectiveCells += f;
  });
  return { indices, weights, effectiveCells, cellsTouched: indices.length, fallback };
}

export function globalMask(grid) {
  const n = grid.rows * grid.cols;
  const indices = new Int32Array(n);
  const weights = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    indices[i] = i;
    weights[i] = rowCosine(grid, Math.floor(i / grid.cols));
  }
  return { indices, weights, effectiveCells: n, cellsTouched: n, fallback: false };
}

const r3 = (x) => Math.round(x * 1000) / 1000;

// Yearly area-weighted mean temperature, baseline and anomaly for a mask.
// A cell-year counts only if both the year and the baseline are valid, so
// anomaly = meanTemp − baselineTemp exactly over the same cells.
// Years where valid weight is below minCoverage are reported as missing.
export function regionSeries(mask, store, { startYear, endYear, minCoverage }) {
  const out = [];
  let totalWeight = 0;
  for (let i = 0; i < mask.weights.length; i++) totalWeight += mask.weights[i];

  for (const year of store.years) {
    if (year < startYear || year > endYear) continue;
    const frame = store.frames.get(year);
    let wSum = 0, tSum = 0, bSum = 0;
    for (let i = 0; i < mask.indices.length; i++) {
      const idx = mask.indices[i];
      const t = frame[idx];
      const b = store.baseline[idx];
      if (t === FILL || b === FILL) continue;
      const w = mask.weights[i];
      wSum += w;
      tSum += w * t;
      bSum += w * b;
    }
    const coverage = totalWeight > 0 ? wSum / totalWeight : 0;
    if (wSum === 0 || coverage < minCoverage) {
      out.push({ year, anomaly: null, meanTemp: null, baselineTemp: null, coverage: r3(coverage) });
    } else {
      const meanT = (tSum / wSum) * SCALE;
      const baseT = (bSum / wSum) * SCALE;
      out.push({
        year,
        anomaly: r3(meanT - baseT),
        meanTemp: r3(meanT),
        baselineTemp: r3(baseT),
        coverage: r3(coverage),
      });
    }
  }
  return out;
}
