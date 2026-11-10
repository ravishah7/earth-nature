import { FILL, SCALE } from "./temperatureBuild.service.js";

// Anomaly = annual mean − that cell's baseline mean (°C). Null if either is missing.
export function anomalyC(tempI16, baselineI16) {
  if (tempI16 === FILL || baselineI16 === FILL) return null;
  return (tempI16 - baselineI16) * SCALE;
}

export function describeBaseline(meta) {
  const { start, end } = meta.baseline;
  return `${start}–${end} mean of each grid cell`;
}
