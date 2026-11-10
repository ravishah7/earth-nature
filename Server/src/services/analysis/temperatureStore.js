// Loads the pre-built temperature grid into memory (a few MB) and serves it.
//
// Files in data/temperature/:
//   meta.json        grid definition, years, baseline, source, build report
//   baseline.i16     Int16 (little-endian) per-cell baseline mean, ×0.01 °C
//   t2m-<year>.i16   Int16 annual-mean T2M per cell for each year, ×0.01 °C
// Missing cells hold -32768 and are never filled or interpolated.

import fs from "node:fs/promises";
import path from "node:path";
import { geographyConfig } from "../../config/geography.config.js";
import { HttpError } from "../../utils/response.js";
import { FILL } from "./temperatureBuild.service.js";

export const TEMPERATURE_DIR = path.join(geographyConfig.serverRoot, "data", "temperature");
let store = null;

const toBuffer = (i16) => Buffer.from(i16.buffer, i16.byteOffset, i16.byteLength);

async function readInt16(file, expectedLength) {
  const buf = await fs.readFile(file);
  // Copy so the typed array is aligned regardless of Buffer pooling.
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const arr = new Int16Array(ab);
  if (arr.length !== expectedLength) {
    throw new Error(`${path.basename(file)} has ${arr.length} cells, expected ${expectedLength}.`);
  }
  return arr;
}

export async function writeTemperatureDataset(dir, { meta, baselineGrid, frames, years }) {
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2));
  await fs.writeFile(path.join(dir, "baseline.i16"), toBuffer(baselineGrid));
  for (let i = 0; i < years.length; i++) {
    await fs.writeFile(path.join(dir, `t2m-${years[i]}.i16`), toBuffer(frames[i]));
  }
}

export async function initTemperatureStore(dir = TEMPERATURE_DIR) {
  let meta;
  try {
    meta = JSON.parse(await fs.readFile(path.join(dir, "meta.json"), "utf8"));
  } catch (err) {
    throw new Error(
      `Temperature data not found in ${dir}. Run "npm run data:temperature" first. (${err.code ?? err.message})`
    );
  }
  const n = meta.grid.rows * meta.grid.cols;
  const baseline = await readInt16(path.join(dir, "baseline.i16"), n);
  const frames = new Map();
  for (const y of meta.years) {
    frames.set(y, await readInt16(path.join(dir, `t2m-${y}.i16`), n));
  }

  // Pre-encode once for the /global endpoint.
  const encoded = {
    baseline: toBuffer(baseline).toString("base64"),
    frames: new Map(meta.years.map((y) => [y, toBuffer(frames.get(y)).toString("base64")])),
  };

  store = { dir, meta, grid: meta.grid, years: meta.years, baseline, frames, encoded };
  return store;
}

export function getTemperatureStore() {
  if (!store) {
    throw new HttpError(
      503,
      "TEMPERATURE_DATA_NOT_BUILT",
      'The NASA temperature dataset has not been built yet. Run "npm run data:temperature" in the Server folder.'
    );
  }
  return store;
}

export { FILL };
