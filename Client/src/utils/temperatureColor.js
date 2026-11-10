// ONE colour scale for the globe, legend and chart. Values are temperature
// ANOMALIES in °C (difference from the baseline), never absolute temperatures.

// The eight classes from the project brief, with the anomaly range of each.
export const TEMPERATURE_CLASSES = [
  { id: "strong-cool",   label: "Strong decrease",   color: "#17307a", from: -Infinity, to: -1.5 },
  { id: "moderate-cool", label: "Moderate decrease", color: "#2f6fe0", from: -1.5, to: -0.75 },
  { id: "slight-cool",   label: "Slight decrease",   color: "#9ecff5", from: -0.75, to: -0.15 },
  { id: "neutral",       label: "Near zero",         color: "#e9e9e9", from: -0.15, to: 0.15 },
  { id: "slight-warm",   label: "Slight increase",   color: "#ffe45c", from: 0.15, to: 0.6 },
  { id: "small-warm",    label: "Small increase",    color: "#ff9a1f", from: 0.6, to: 1.2 },
  { id: "moderate-warm", label: "Moderate increase", color: "#e5361e", from: 1.2, to: 2.0 },
  { id: "strong-warm",   label: "Strong increase",   color: "#7a0c0c", from: 2.0, to: Infinity },
];

// Colour stops sit at the centre of each class; values in between are
// blended smoothly so neighbouring years and cells transition gradually.
const STOPS = [
  [-2.25, "#17307a"],
  [-1.1, "#2f6fe0"],
  [-0.45, "#9ecff5"],
  [0, "#e9e9e9"],
  [0.4, "#ffe45c"],
  [0.9, "#ff9a1f"],
  [1.6, "#e5361e"],
  [2.5, "#7a0c0c"],
].map(([v, hex]) => [v, hexToRgb(hex)]);

export const SCALE_RANGE = [STOPS[0][0], STOPS.at(-1)[0]];

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// anomaly (°C) -> [r, g, b]
export function anomalyToRGB(anomaly) {
  if (anomaly <= STOPS[0][0]) return STOPS[0][1];
  if (anomaly >= STOPS.at(-1)[0]) return STOPS.at(-1)[1];
  for (let i = 1; i < STOPS.length; i++) {
    const [v1, c1] = STOPS[i];
    if (anomaly <= v1) {
      const [v0, c0] = STOPS[i - 1];
      const t = (anomaly - v0) / (v1 - v0);
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * t),
        Math.round(c0[1] + (c1[1] - c0[1]) * t),
        Math.round(c0[2] + (c1[2] - c0[2]) * t),
      ];
    }
  }
  return STOPS.at(-1)[1];
}

export function anomalyToCss(anomaly) {
  const [r, g, b] = anomalyToRGB(anomaly);
  return `rgb(${r}, ${g}, ${b})`;
}

export function classifyAnomaly(anomaly) {
  return TEMPERATURE_CLASSES.find((c) => anomaly >= c.from && anomaly < c.to) ?? TEMPERATURE_CLASSES.at(-1);
}

// CSS gradient for the legend bar, using the same stops.
export function legendGradientCss() {
  const [lo, hi] = SCALE_RANGE;
  const parts = STOPS.map(([v, [r, g, b]]) => `rgb(${r}, ${g}, ${b}) ${(((v - lo) / (hi - lo)) * 100).toFixed(1)}%`);
  return `linear-gradient(to right, ${parts.join(", ")})`;
}
