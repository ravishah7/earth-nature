import { Router } from "express";
import * as c from "../controllers/region.controller.js";

const router = Router();

// Fixed one-segment paths must come before "/:regionId".
router.get("/continents", c.continents);
router.get("/countries", c.countries);
router.get("/search", c.search);
router.get("/locate", c.locate);
router.get("/:countryId/administrative-divisions", c.divisions);
router.get("/:regionId", c.region);

export default router;
