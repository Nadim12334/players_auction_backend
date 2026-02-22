import { Router } from "express";
import playerRoutes from "./players";
import teamRoutes from "./teams";
import auctionRoutes from "./auction";
import statsRoutes from "./stats";

const router = Router();

router.use("/players", playerRoutes);
router.use("/teams", teamRoutes);
router.use("/auction", auctionRoutes);
router.use("/stats", statsRoutes);

export default router;
