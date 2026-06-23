import { Router } from "express";
import { getFoundingShopProgramSettings } from "../controllers/platformSettingsPublic.controller.js";

const router = Router();

router.get("/platform-settings/founding-shop-program", getFoundingShopProgramSettings);

export default router;
