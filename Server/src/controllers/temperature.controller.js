import * as analysis from "../services/analysis/temperatureAnalysis.service.js";
import { sendOk, HttpError } from "../utils/response.js";
import { parseRegionId } from "../utils/validators.js";

function parseYear(value, name) {
  if (value === undefined || value === "") return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1900 || n > 2100) {
    throw new HttpError(400, "INVALID_YEAR", `${name} must be a four-digit year.`);
  }
  return n;
}

const range = (q) => ({ startYear: parseYear(q.startYear, "startYear"), endYear: parseYear(q.endYear, "endYear") });

export const global = (req, res) => {
  const { data, meta } = analysis.getGlobalData(range(req.query));
  sendOk(res, data, meta);
};

export const regionTimeline = async (req, res) => {
  const { data, meta } = await analysis.getRegionTimeline(parseRegionId(req.params.regionId), range(req.query));
  res.set("Cache-Control", "public, max-age=3600");
  sendOk(res, data, meta);
};

export const regionSummary = async (req, res) => {
  const { data, meta } = await analysis.getRegionSummary(parseRegionId(req.params.regionId), {
    ...range(req.query),
    selectedYear: parseYear(req.query.selectedYear, "selectedYear"),
  });
  sendOk(res, data, meta);
};
