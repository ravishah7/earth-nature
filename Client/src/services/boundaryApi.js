import { apiGet } from "./apiClient";

// Boundaries are large; keep each one after the first load so re-selecting a
// region (or switching back to it) is instant.
const loaded = new Map();
const inflight = new Map();

export async function fetchBoundary(regionId) {
  if (loaded.has(regionId)) return loaded.get(regionId);
  if (!inflight.has(regionId)) {
    const p = apiGet(`/api/regions/${encodeURIComponent(regionId)}/boundary`)
      .then((r) => {
        loaded.set(regionId, r.data);
        return r.data;
      })
      .finally(() => inflight.delete(regionId));
    inflight.set(regionId, p);
  }
  return inflight.get(regionId);
}
