import { getGeoStore, loadDivisionFeatures } from "./geoStore.js";
import { getRegionRecord, toSummary } from "./region.service.js";
import { HttpError } from "../../utils/response.js";

// Returns a GeoJSON Feature for a country or a first-level division.
// properties = the region summary (name, ids, bbox, focusBbox, …).
export async function getBoundaryFeature(regionId) {
  const record = getRegionRecord(regionId);
  if (!record) throw new HttpError(404, "REGION_NOT_FOUND", `Unknown region "${regionId}".`);
  const s = getGeoStore();

  let geometry;
  if (record.level === "country") {
    geometry = s.countryGeometry.get(regionId);
  } else {
    const features = await loadDivisionFeatures(record.parentId);
    geometry = features.find((f) => f.id === regionId)?.geometry;
  }
  if (!geometry) {
    throw new HttpError(404, "BOUNDARY_UNAVAILABLE", `No boundary available for "${regionId}".`);
  }
  return { type: "Feature", id: regionId, properties: toSummary(record), geometry };
}
