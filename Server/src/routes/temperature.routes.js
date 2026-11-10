import { Router } from "express";
import * as c from "../controllers/temperature.controller.js";

const router = Router();
router.get("/global", c.global);
router.get("/region/:regionId/timeline", c.regionTimeline);
router.get("/region/:regionId", c.regionSummary);
export default router;
