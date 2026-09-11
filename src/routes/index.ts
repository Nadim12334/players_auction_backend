import { Router } from "express";
import playerRoutes from "./players";
import teamRoutes from "./teams";
import auctionRoutes from "./auction";
import statsRoutes from "./stats";
import adminRoutes from "./admin";
import settingsRoutes from "./settings";
import registrationRoutes from "./registration";
import tournamentRoutes from "./tournaments";

const router = Router();

router.use("/tournaments", tournamentRoutes);
router.use("/players", playerRoutes);
router.use("/teams", teamRoutes);
router.use("/auction", auctionRoutes);
router.use("/stats", statsRoutes);
router.use("/admin", adminRoutes);
router.use("/settings", settingsRoutes);
router.use("/", registrationRoutes);

export default router;
