import { anomalyToRGB } from "./temperatureColor";

// Draws one year's grid as an RGBA canvas (one pixel per grid cell, row 0 =
// north). Colour = anomaly = year value − cell baseline. Cells with no data
// are fully transparent: missing data is shown as missing, never filled.
export function renderFrameToCanvas({ frame, baseline, grid, encoding }) {
  const { rows, cols } = grid;
  const canvas = document.createElement("canvas");
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext("2d");
  const image = ctx.createImageData(cols, rows);
  const px = image.data;
  const fill = encoding.fill;

  for (let i = 0; i < frame.length; i++) {
    const t = frame[i];
    const b = baseline[i];
    const o = i * 4;
    if (t === fill || b === fill) {
      px[o + 3] = 0;
      continue;
    }
    const [r, g, bl] = anomalyToRGB((t - b) * encoding.scale);
    px[o] = r;
    px[o + 1] = g;
    px[o + 2] = bl;
    px[o + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}
