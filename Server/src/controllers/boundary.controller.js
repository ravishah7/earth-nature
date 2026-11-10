import { getBoundaryFeature } from "../services/geography/boundary.service.js";
import { getGeoStore } from "../services/geography/geoStore.js";
import { sendOk } from "../utils/response.js";
import { parseRegionId } from "../utils/validators.js";

export const boundary = async (req, res) => {
  const feature = await getBoundaryFeature(parseRegionId(req.params.regionId));
  const { source, resolution } = getGeoStore().meta;
  // Boundaries only change when the dataset is rebuilt.
  res.set("Cache-Control", "public, max-age=86400");
  sendOk(res, feature, { source, resolution });
};
