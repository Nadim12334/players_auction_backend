import express from "express";
import { placeBid, markAsSold, startPlayerAuction } from "../controllers/auctionController";

const router = express.Router();

router.post("/bid", placeBid);
router.post("/sell/:playerId", markAsSold);
router.post("/start/:playerId", startPlayerAuction);

export default router;