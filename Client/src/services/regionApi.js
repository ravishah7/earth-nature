import { apiGet } from "./apiClient";

// Lists change only when the server dataset is rebuilt, so keep them for the
// life of the page instead of refetching.
let continentsPromise = null;
const countriesPromises = new Map();

function cached(promise, reset) {
  promise.catch(reset); // don't cache failures
  return promise;
}

export function fetchContinents() {
  continentsPromise ??= cached(
    apiGet("/api/regions/continents").then((r) => r.data),
    () => { continentsPromise = null; }
  );
  return continentsPromise;
}

export function fetchCountries(continentId = "") {
  if (!countriesPromises.has(continentId)) {
    countriesPromises.set(
      continentId,
      cached(
        apiGet("/api/regions/countries", { params: { continent: continentId } }).then((r) => r.data),
        () => countriesPromises.delete(continentId)
      )
    );
  }
  return countriesPromises.get(continentId);
}

export const fetchDivisions = (countryId, signal) =>
  apiGet(`/api/regions/${encodeURIComponent(countryId)}/administrative-divisions`, { signal }).then((r) => r.data);

export const searchRegions = (q, { level = "country", limit = 8, parentRegionId, signal } = {}) =>
  apiGet("/api/regions/search", { params: { q, level, limit, parentRegionId }, signal });

export const locateRegion = (lat, lon, { level = "country", parentRegionId, signal } = {}) =>
  apiGet("/api/regions/locate", { params: { lat, lon, level, parentRegionId }, signal });
