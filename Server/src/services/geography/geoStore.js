// Loads the processed geography once at startup and serves it from memory.
// Country geometry is resident; division geometry is read per country on
// demand and kept in a small LRU cache.

import fs from "node:fs/promises";
import path from "node:path";
import { geographyConfig } from "../../config/geography.config.js";
import { HttpError } from "../../utils/response.js";

const SHARD_CACHE_SIZE = 32;
let store = null;

export const normalizeText = (s) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export async function initGeoStore(dir = geographyConfig.processedDir) {
  let index, countriesFC;
  try {
    index = JSON.parse(await fs.readFile(path.join(dir, "index.json"), "utf8"));
    countriesFC = JSON.parse(await fs.readFile(path.join(dir, "countries.json"), "utf8"));
  } catch (err) {
    throw new Error(
      `Geography data not found in ${dir}. Run "npm run data:geo" first. (${err.code ?? err.message})`
    );
  }

  const countryById = new Map(index.countries.map((c) => [c.id, c]));
  const divisionById = new Map(index.divisions.map((d) => [d.id, d]));
  const divisionsByCountry = new Map();
  for (const d of index.divisions) {
    if (!divisionsByCountry.has(d.parentId)) divisionsByCountry.set(d.parentId, []);
    divisionsByCountry.get(d.parentId).push(d);
  }
  for (const list of divisionsByCountry.values()) list.sort((a, b) => a.name.localeCompare(b.name));

  const countryGeometry = new Map(countriesFC.features.map((f) => [f.id, f.geometry]));

  // Search index: normalised keys per region (name, long name, aliases) plus
  // exact-match codes.
  const searchEntries = [];
  for (const c of index.countries) {
    searchEntries.push({
      region: c,
      names: [c.name, c.nameLong].filter(Boolean).map(normalizeText),
      codes: [c.iso2, c.iso3, c.adm0A3].filter(Boolean).map(normalizeText),
    });
  }
  for (const d of index.divisions) {
    searchEntries.push({
      region: d,
      names: [d.name, ...(d.aliases ?? [])].map(normalizeText),
      codes: [d.iso3166_2, d.adm1Code].filter(Boolean).map(normalizeText),
    });
  }

  store = {
    dir,
    meta: index.meta,
    continents: index.continents,
    countries: index.countries,
    divisions: index.divisions,
    countryById,
    divisionById,
    divisionsByCountry,
    countryGeometry,
    searchEntries,
    shardCache: new Map(),
  };
  return store;
}

export function getGeoStore() {
  if (!store) {
    throw new HttpError(503, "GEODATA_NOT_READY", "Geography data has not been loaded.");
  }
  return store;
}

// Features (with geometry) for one country's divisions.
export async function loadDivisionFeatures(countryId) {
  const s = getGeoStore();
  const cached = s.shardCache.get(countryId);
  if (cached) {
    s.shardCache.delete(countryId); // refresh LRU position
    s.shardCache.set(countryId, cached);
    return cached;
  }
  let features;
  try {
    const raw = await fs.readFile(path.join(s.dir, "admin1", `${countryId}.json`), "utf8");
    features = JSON.parse(raw).features;
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
  s.shardCache.set(countryId, features);
  if (s.shardCache.size > SHARD_CACHE_SIZE) {
    s.shardCache.delete(s.shardCache.keys().next().value);
  }
  return features;
}
