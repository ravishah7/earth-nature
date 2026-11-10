import * as regions from "../services/geography/region.service.js";
import { getGeoStore } from "../services/geography/geoStore.js";
import { sendOk } from "../utils/response.js";
import {
  parseRegionId,
  parseCoordinate,
  parseLevel,
  parseLimit,
  parseQuery,
} from "../utils/validators.js";

const geoMeta = () => {
  const { source, resolution } = getGeoStore().meta;
  return { source, resolution };
};

export const continents = (req, res) => {
  const data = regions.listContinents();
  sendOk(res, data, geoMeta());
};

export const countries = (req, res) => {
  const continentId = parseQuery(req.query.continent, 60) || undefined;
  const q = parseQuery(req.query.q) || undefined;
  sendOk(res, regions.listCountries({ continentId, q }), geoMeta());
};

export const divisions = (req, res) => {
  const countryId = parseRegionId(req.params.countryId);
  const data = regions.listDivisions(countryId);
  sendOk(res, data, {
    ...geoMeta(),
    missing: data.available ? [] : [{ regionId: countryId, reason: data.limitation }],
  });
};

export const search = (req, res) => {
  const data = regions.searchRegions({
    q: parseQuery(req.query.q),
    level: parseLevel(req.query.level ?? req.query.regionLevel),
    limit: parseLimit(req.query.limit),
    parentRegionId: req.query.parentRegionId
      ? parseRegionId(req.query.parentRegionId)
      : undefined,
  });
  sendOk(res, data, geoMeta());
};

export const locate = async (req, res) => {
  const lat = parseCoordinate(req.query.lat, "lat", -90, 90);
  const lon = parseCoordinate(req.query.lon, "lon", -180, 180);
  const level = parseLevel(req.query.level ?? req.query.regionLevel, "country");
  const parentRegionId = req.query.parentRegionId
    ? parseRegionId(req.query.parentRegionId)
    : undefined;
  const data = await regions.locateRegion({ lat, lon, level, parentRegionId });
  sendOk(res, data, geoMeta());
};

export const region = (req, res) => {
  sendOk(res, regions.getRegion(parseRegionId(req.params.regionId)), geoMeta());
};
