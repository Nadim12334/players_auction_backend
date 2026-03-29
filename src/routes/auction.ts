import express from "express";
import { placeBid, getSoldPlayers, getUnsoldPlayers, getBidHistory, getAllBids } from "../controllers/auctionController";

const router = express.Router();

router.post("/bid", placeBid);
router.get("/sold", getSoldPlayers);
router.get("/unsold", getUnsoldPlayers);
router.get("/history", getAllBids);
router.get("/bids/:playerId", getBidHistory);

export default router;