import { Router } from "express";
import { boundary } from "../controllers/boundary.controller.js";

const router = Router();
router.get("/:regionId/boundary", boundary);
export default router;
