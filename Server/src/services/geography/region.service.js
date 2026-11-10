import { getGeoStore, loadDivisionFeatures, normalizeText } from "./geoStore.js";
import { HttpError } from "../../utils/response.js";
import { bboxContains, pointInGeometry } from "../../utils/geoProcessing.js";

// Public shape of a region (never includes geometry).
export function toSummary(r) {
  const { aliases, ...rest } = r; // eslint-disable-line no-unused-vars
  return rest;
}

export function listContinents() {
  return getGeoStore().continents;
}

export function listCountries({ continentId, q } = {}) {
  const s = getGeoStore();
  let list = s.countries;
  if (continentId) list = list.filter((c) => c.continentId === continentId);
  if (q) {
    const nq = normalizeText(q);
    list = list.filter((c) => normalizeText(c.name).includes(nq));
  }
  return list.map(toSummary);
}

export function getRegionRecord(id) {
  const s = getGeoStore();
  return s.countryById.get(id) ?? s.divisionById.get(id) ?? null;
}

export function getRegion(id) {
  const r = getRegionRecord(id);
  if (!r) throw new HttpError(404, "REGION_NOT_FOUND", `Unknown region "${id}".`);
  return toSummary(r);
}

export function listDivisions(countryId) {
  const s = getGeoStore();
  const country = s.countryById.get(countryId);
  if (!country) throw new HttpError(404, "REGION_NOT_FOUND", `Unknown country "${countryId}".`);
  const divisions = (s.divisionsByCountry.get(countryId) ?? []).map(toSummary);
  return {
    country: toSummary(country),
    available: divisions.length > 0,
    divisions,
    limitation:
      divisions.length > 0
        ? null
        : `The Natural Earth dataset has no first-level administrative boundaries for ${country.name}. No boundaries are shown rather than inventing them.`,
  };
}

// Ranking: exact code > exact name > name prefix > word prefix > substring.
function scoreEntry(entry, nq) {
  if (entry.codes.includes(nq)) return 95;
  let best = 0;
  for (const n of entry.names) {
    let sc = 0;
    if (n === nq) sc = 100;
    else if (n.startsWith(nq)) sc = 80;
    else if (n.split(" ").some((w) => w.startsWith(nq))) sc = 60;
    else if (n.includes(nq)) sc = 40;
    if (sc > best) best = sc;
  }
  return best;
}

export function searchRegions({ q, level = "all", limit = 10, parentRegionId } = {}) {
  const nq = normalizeText(q);
  if (nq.length < 2) return [];
  const s = getGeoStore();
  const scored = [];
  for (const entry of s.searchEntries) {
    const r = entry.region;
    if (level !== "all" && r.level !== level) continue;
    if (parentRegionId && r.parentId !== parentRegionId) continue;
    const score = scoreEntry(entry, nq);
    if (score > 0) scored.push({ r, score });
  }
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      (a.r.level === b.r.level ? 0 : a.r.level === "country" ? -1 : 1) ||
      a.r.name.length - b.r.name.length ||
      a.r.name.localeCompare(b.r.name)
  );
  return scored.slice(0, limit).map(({ r }) => toSummary(r));
}

// Which region contains this point? Returns a summary or null (ocean, or no
// polygon in the dataset).
export async function locateRegion({ lat, lon, level = "country", parentRegionId }) {
  const s = getGeoStore();

  if (level === "admin1") {
    if (!parentRegionId) {
      throw new HttpError(400, "PARENT_REQUIRED", "parentRegionId is required for level=admin1.");
    }
    if (!s.countryById.has(parentRegionId)) {
      throw new HttpError(404, "REGION_NOT_FOUND", `Unknown country "${parentRegionId}".`);
    }
    const features = await loadDivisionFeatures(parentRegionId);
    const hit = features.find(
      (f) => bboxContains(f.properties.bbox, lon, lat) && pointInGeometry(lon, lat, f.geometry)
    );
    return hit ? toSummary(s.divisionById.get(hit.id)) : null;
  }

  // Country: bbox prefilter, then exact test. If polygons overlap (rare,
  // disputed areas) the smallest bbox wins, i.e. the more specific one.
  const hits = [];
  for (const c of s.countries) {
    if (bboxContains(c.bbox, lon, lat) && pointInGeometry(lon, lat, s.countryGeometry.get(c.id))) {
      hits.push(c);
    }
  }
  if (hits.length === 0) return null;
  const bboxArea = (c) => (c.bbox[2] - c.bbox[0]) * (c.bbox[3] - c.bbox[1]);
  hits.sort((a, b) => bboxArea(a) - bboxArea(b));
  return toSummary(hits[0]);
}
