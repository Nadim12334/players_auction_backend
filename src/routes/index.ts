import { Router } from "express";
import playerRoutes from "./players";
import teamRoutes from "./teams";
import auctionRoutes from "./auction";
import statsRoutes from "./stats";
import adminRoutes from "./admin";
import settingsRoutes from "./settings";

const router = Router();

router.use("/players", playerRoutes);
router.use("/teams", teamRoutes);
router.use("/auction", auctionRoutes);
router.use("/stats", statsRoutes);
router.use("/admin", adminRoutes);
router.use("/settings", settingsRoutes);

export default router;
