import { Router } from "express";
import playerRoutes from "./players";
import teamRoutes from "./teams";
import auctionRoutes from "./auction";

const router = Router();

router.use("/players", playerRoutes);
router.use("/teams", teamRoutes);
router.use("/auction", auctionRoutes);

export default router;
