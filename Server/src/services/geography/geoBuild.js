// Turns raw Natural Earth GeoJSON into the compact processed layout the API
// serves. Pure functions only (no file I/O) so the logic is unit-testable.
//
// Processed layout:
//   index.json            metadata for every region (no geometry)
//   countries.json        FeatureCollection with country geometry
//   admin1/<countryId>.json   one FeatureCollection per country (lazy-loaded)

import {
  bboxOfGeometry,
  focusBboxOfGeometry,
  unionBbox,
  roundGeometry,
} from "../../utils/geoProcessing.js";

const ISO3 = /^[A-Z]{3}$/;
const ISO2 = /^[A-Z]{2}$/;
const ISO_3166_2 = /^[A-Z]{2}-[A-Z0-9]{1,6}$/;

// Natural Earth writes "-99" where it has no code (e.g. France, Norway in
// iso_a3), so every code is validated and falls back to the next candidate.
function pickCode(re, ...values) {
  for (const v of values) {
    if (typeof v !== "string") continue;
    const c = v.trim().toUpperCase();
    if (re.test(c)) return c;
  }
  return null;
}

// Key case differs between files/releases, so normalise to lower case.
const lowerKeys = (p = {}) =>
  Object.fromEntries(Object.entries(p).map(([k, v]) => [k.toLowerCase(), v]));

const clean = (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

export const slugify = (s) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export function buildFromRaw(countriesFC, admin1FC, { precision = 4, focusRatio = 0.25 } = {}) {
  const report = {
    skippedCountries: [],
    duplicateCountryIds: [],
    orphanDivisions: 0,
    unnamedDivisions: 0,
    renamedDivisionIds: 0,
  };

  // ---- Countries (admin-0) ----
  const countries = [];
  const countryFeatures = [];
  const seen = new Set();
  const adm0ToId = new Map();

  for (const feat of countriesFC.features ?? []) {
    const p = lowerKeys(feat.properties);
    const name = clean(p.name_en) ?? clean(p.name) ?? clean(p.admin);
    const adm0A3 = pickCode(ISO3, p.adm0_a3);
    const iso3 = pickCode(ISO3, p.iso_a3, p.iso_a3_eh);
    const iso2 = pickCode(ISO2, p.iso_a2, p.iso_a2_eh);
    const id = iso3 ?? adm0A3;
    const geometry = roundGeometry(feat.geometry, precision);

    if (!id || !name || !geometry) {
      report.skippedCountries.push(name ?? "(unnamed)");
      continue;
    }
    if (seen.has(id)) {
      report.duplicateCountryIds.push(id);
      continue;
    }
    seen.add(id);
    if (adm0A3) adm0ToId.set(adm0A3, id);
    adm0ToId.set(id, id);

    const continent = clean(p.continent) ?? "Unknown";
    const record = {
      id,
      level: "country",
      name,
      nameLong: clean(p.name_long) ?? name,
      iso2,
      iso3,
      adm0A3,
      continent,
      continentId: slugify(continent),
      subregion: clean(p.subregion),
      sovereignt: clean(p.sovereignt),
      type: clean(p.type),
      parentId: null,
      bbox: bboxOfGeometry(geometry),
      focusBbox: focusBboxOfGeometry(geometry, focusRatio),
      divisionCount: 0,
      adminDivisionsAvailable: false,
    };
    countries.push(record);
    countryFeatures.push({ type: "Feature", id, properties: record, geometry });
  }
  const countryById = new Map(countries.map((c) => [c.id, c]));

  // ---- Divisions (admin-1) ----
  const rawDivisions = [];
  for (const feat of admin1FC.features ?? []) {
    const p = lowerKeys(feat.properties);
    const countryId = adm0ToId.get(pickCode(ISO3, p.adm0_a3));
    if (!countryId) {
      report.orphanDivisions++;
      continue;
    }
    const name = clean(p.name_en) ?? clean(p.name) ?? clean(p.woe_name);
    const geometry = roundGeometry(feat.geometry, precision);
    if (!name || !geometry) {
      report.unnamedDivisions++;
      continue;
    }
    rawDivisions.push({
      p,
      name,
      geometry,
      countryId,
      iso: pickCode(ISO_3166_2, p.iso_3166_2),
      adm1Code: clean(p.adm1_code),
    });
  }

  // Prefer ISO 3166-2 as the id, but only where it is unique; otherwise use
  // Natural Earth's adm1_code. Guarantee global uniqueness either way.
  const isoCounts = new Map();
  for (const d of rawDivisions) if (d.iso) isoCounts.set(d.iso, (isoCounts.get(d.iso) ?? 0) + 1);

  const usedIds = new Set(countryById.keys());
  const divisions = [];
  const shards = new Map();

  for (const d of rawDivisions) {
    let id = d.iso && isoCounts.get(d.iso) === 1 ? d.iso : d.adm1Code;
    id ??= `${d.countryId}-${slugify(d.name)}`;
    if (usedIds.has(id)) {
      let n = 2;
      while (usedIds.has(`${id}~${n}`)) n++;
      id = `${id}~${n}`;
      report.renamedDivisionIds++;
    }
    usedIds.add(id);

    const country = countryById.get(d.countryId);
    const aliases = (clean(d.p.name_alt) ?? "")
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean);

    const record = {
      id,
      level: "admin1",
      name: d.name,
      aliases,
      type: clean(d.p.type_en) ?? clean(d.p.type),
      iso3166_2: d.iso,
      adm1Code: d.adm1Code,
      parentId: d.countryId,
      parentName: country.name,
      continent: country.continent,
      continentId: country.continentId,
      bbox: bboxOfGeometry(d.geometry),
      focusBbox: focusBboxOfGeometry(d.geometry, focusRatio),
    };
    divisions.push(record);
    country.divisionCount++;
    country.adminDivisionsAvailable = true;
    if (!shards.has(d.countryId)) shards.set(d.countryId, []);
    shards.get(d.countryId).push({ type: "Feature", id, properties: record, geometry: d.geometry });
  }

  // ---- Continents (derived; they have no boundary polygon) ----
  const continentMap = new Map();
  for (const c of countries) {
    const entry = continentMap.get(c.continentId) ?? {
      id: c.continentId,
      level: "continent",
      name: c.continent,
      countryCount: 0,
      focusBbox: null,
    };
    entry.countryCount++;
    entry.focusBbox = unionBbox(entry.focusBbox, c.focusBbox);
    continentMap.set(c.continentId, entry);
  }
  const continents = [...continentMap.values()].sort((a, b) => a.name.localeCompare(b.name));

  countries.sort((a, b) => a.name.localeCompare(b.name));

  return {
    index: { continents, countries, divisions },
    countriesFC: { type: "FeatureCollection", features: countryFeatures },
    shards: new Map(
      [...shards].map(([id, features]) => [id, { type: "FeatureCollection", features }])
    ),
    report,
  };
}
