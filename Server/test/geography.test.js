// Tests use small SYNTHETIC geometries with fictional countries to exercise
// the logic (code fallbacks, antimeridian, island framing, search, locate).
// They are test fixtures only — nothing here is shipped as data.

import test, { before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { buildFromRaw } from "../src/services/geography/geoBuild.js";
import { writeProcessed } from "../scripts/build-geodata.js";
import { initGeoStore } from "../src/services/geography/geoStore.js";
import * as regions from "../src/services/geography/region.service.js";
import { getBoundaryFeature } from "../src/services/geography/boundary.service.js";
import * as controller from "../src/controllers/region.controller.js";
import { HttpError } from "../src/utils/response.js";
import {
  pointInGeometry,
  focusBboxOfGeometry,
  roundGeometry,
} from "../src/utils/geoProcessing.js";

const sq = (w, s, e, n) => [[[w, s], [e, s], [e, n], [w, n], [w, s]]];
const poly = (...b) => ({ type: "Polygon", coordinates: sq(...b) });
const multi = (...boxes) => ({ type: "MultiPolygon", coordinates: boxes.map((b) => sq(...b)) });

// Admin-0 uses UPPER-case keys, admin-1 lower-case, as a stress test.
const countriesFC = {
  features: [
    { properties: { ADM0_A3: "AAA", ISO_A3: "AAA", ISO_A2: "AA", NAME: "Alphaland", CONTINENT: "Asia" }, geometry: poly(0, 0, 10, 10) },
    // France-style: ISO_A3 is -99, ISO_A3_EH carries the real code.
    { properties: { ADM0_A3: "BBB", ISO_A3: "-99", ISO_A3_EH: "BBX", ISO_A2: "-99", ISO_A2_EH: "BX", NAME: "Betaland", CONTINENT: "Europe" }, geometry: poly(20, 0, 30, 10) },
    // Crosses the antimeridian: split into two polygons at ±180.
    { properties: { ADM0_A3: "GGG", ISO_A3: "GGG", NAME: "Gammaland", CONTINENT: "Oceania" }, geometry: multi([170, -10, 180, 0], [-180, -10, -179.9, 0]) },
    // Big mainland + tiny remote island.
    { properties: { ADM0_A3: "DDD", ISO_A3: "DDD", NAME: "Deltaland", CONTINENT: "Europe" }, geometry: multi([40, 0, 50, 10], [80, 40, 80.5, 40.5]) },
  ],
};

const admin1FC = {
  features: [
    { properties: { adm0_a3: "AAA", name: "Alpha North", iso_3166_2: "AA-N", adm1_code: "AAA-1", type_en: "Province", name_alt: "Nordic|Northern Alpha" }, geometry: poly(0, 5, 10, 10) },
    { properties: { adm0_a3: "AAA", name: "Alpha South", iso_3166_2: "AA-S", adm1_code: "AAA-2", type_en: "Province" }, geometry: poly(0, 0, 10, 5) },
    // Duplicate iso_3166_2 → ids must fall back to adm1_code.
    { properties: { adm0_a3: "BBB", name: "Beta East", iso_3166_2: "BX-X", adm1_code: "BBB-1", type_en: "Region" }, geometry: poly(25, 0, 30, 10) },
    { properties: { adm0_a3: "BBB", name: "Beta West", iso_3166_2: "BX-X", adm1_code: "BBB-2", type_en: "Region" }, geometry: poly(20, 0, 25, 10) },
    // Orphan: parent country does not exist.
    { properties: { adm0_a3: "ZZZ", name: "Nowhere", iso_3166_2: "ZZ-1", adm1_code: "ZZZ-1" }, geometry: poly(0, 0, 1, 1) },
  ],
};

before(async () => {
  const built = buildFromRaw(countriesFC, admin1FC);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ee-geo-"));
  await writeProcessed(dir, built);
  await initGeoStore(dir);
});

test("point in polygon respects holes", () => {
  const g = { type: "Polygon", coordinates: [...sq(0, 0, 10, 10), [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]]] };
  assert.equal(pointInGeometry(2, 2, g), true);
  assert.equal(pointInGeometry(5, 5, g), false);
  assert.equal(pointInGeometry(20, 20, g), false);
});

test("focus bbox ignores small remote islands", () => {
  const g = multi([40, 0, 50, 10], [80, 40, 80.5, 40.5]);
  assert.deepEqual(focusBboxOfGeometry(g, 0.25), [40, 0, 50, 10]);
});

test("roundGeometry drops degenerate rings", () => {
  const g = { type: "Polygon", coordinates: [[[0, 0], [0.00001, 0.00001], [0, 0]]] };
  assert.equal(roundGeometry(g, 4), null);
});

test("build: -99 codes fall back, duplicates and orphans handled", () => {
  const b = buildFromRaw(countriesFC, admin1FC);
  const ids = b.index.countries.map((c) => c.id);
  assert.ok(ids.includes("BBX"), "Betaland should use ISO_A3_EH");
  assert.equal(b.report.orphanDivisions, 1);
  const beta = b.index.divisions.filter((d) => d.parentId === "BBX").map((d) => d.id).sort();
  assert.deepEqual(beta, ["BBB-1", "BBB-2"]);
  assert.equal(new Set(b.index.divisions.map((d) => d.id)).size, b.index.divisions.length);
});

test("countries without divisions report adminDivisionsAvailable=false", () => {
  const gamma = regions.listCountries().find((c) => c.id === "GGG");
  assert.equal(gamma.adminDivisionsAvailable, false);
  const out = regions.listDivisions("GGG");
  assert.equal(out.available, false);
  assert.match(out.limitation, /no first-level/i);
  assert.equal(out.divisions.length, 0);
});

test("continents are derived and filterable", () => {
  assert.deepEqual(regions.listContinents().map((c) => c.id), ["asia", "europe", "oceania"]);
  assert.deepEqual(regions.listCountries({ continentId: "europe" }).map((c) => c.id).sort(), ["BBX", "DDD"]);
});

test("search: diacritics-insensitive, codes, aliases, ordering", () => {
  assert.equal(regions.searchRegions({ q: "ALPHA" })[0].id, "AAA"); // country before divisions
  assert.equal(regions.searchRegions({ q: "AAA" })[0].id, "AAA"); // code
  assert.equal(regions.searchRegions({ q: "nordic", level: "admin1" })[0].id, "AA-N"); // alias
  assert.equal(regions.searchRegions({ q: "a" }).length, 0); // too short
  assert.ok(regions.searchRegions({ q: "alpha", level: "admin1", parentRegionId: "AAA" }).every((r) => r.parentId === "AAA"));
});

test("locate: country, ocean, antimeridian piece, admin1", async () => {
  assert.equal((await regions.locateRegion({ lat: 5, lon: 5 })).id, "AAA");
  assert.equal(await regions.locateRegion({ lat: 50, lon: 50 }), null);
  assert.equal((await regions.locateRegion({ lat: -5, lon: -179.95 })).id, "GGG");
  assert.equal((await regions.locateRegion({ lat: 7, lon: 5, level: "admin1", parentRegionId: "AAA" })).id, "AA-N");
  await assert.rejects(regions.locateRegion({ lat: 1, lon: 1, level: "admin1" }), HttpError);
});

test("boundary: country and division features", async () => {
  const c = await getBoundaryFeature("DDD");
  assert.equal(c.properties.name, "Deltaland");
  assert.deepEqual(c.properties.focusBbox, [40, 0, 50, 10]);
  assert.equal(c.geometry.type, "MultiPolygon");
  const d = await getBoundaryFeature("AA-S");
  assert.equal(d.properties.parentId, "AAA");
  await assert.rejects(getBoundaryFeature("NOPE"), (e) => e.status === 404);
});

test("controller validation and envelope", async () => {
  const mkRes = () => ({ body: null, json(b) { this.body = b; return this; }, set() {} });
  const res = mkRes();
  await controller.locate({ query: { lat: "5", lon: "5" } }, res);
  assert.equal(res.body.data.id, "AAA");
  assert.equal(res.body.error, null);
  assert.deepEqual(Object.keys(res.body.meta).sort(), ["baseline", "missing", "resolution", "source", "units"]);
  await assert.rejects(controller.locate({ query: { lat: "abc", lon: "5" } }, mkRes()), (e) => e.status === 400);
  await assert.rejects(controller.locate({ query: { lat: "95", lon: "5" } }, mkRes()), (e) => e.status === 400);
});
