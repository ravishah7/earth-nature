import { apiGet } from "./apiClient";

// Int16 little-endian base64 -> Int16Array (what the server sends).
function decodeInt16(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

let globalPromise = null;

// The whole timeline of grids is fetched once and reused for every year.
export function fetchGlobalTemperature() {
  globalPromise ??= apiGet("/api/temperature/global")
    .then(({ data, meta }) => ({
      ...data,
      meta,
      baseline: decodeInt16(data.baseline),
      frames: Object.fromEntries(Object.entries(data.frames).map(([y, b64]) => [Number(y), decodeInt16(b64)])),
    }))
    .catch((err) => {
      globalPromise = null; // allow retry
      throw err;
    });
  return globalPromise;
}

const timelineCache = new Map();

export function fetchRegionTimeline(regionId) {
  if (!timelineCache.has(regionId)) {
    timelineCache.set(
      regionId,
      apiGet(`/api/temperature/region/${encodeURIComponent(regionId)}/timeline`)
        .then(({ data, meta }) => ({ ...data, meta }))
        .catch((err) => {
          timelineCache.delete(regionId);
          throw err;
        })
    );
  }
  return timelineCache.get(regionId);
}
