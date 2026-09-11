import express from "express";
import {
    placeBid,
    getSoldPlayers,
    getUnsoldPlayers,
    getBidHistory,
    getAllBids,
    getAuctionState,
} from "../controllers/auctionController";

const router = express.Router();

// Auction State
router.get("/state", getAuctionState);
router.get("/:tournamentId/state", getAuctionState);

// Bidding
router.post("/bid", placeBid);
router.post("/:tournamentId/bid", placeBid);

// Sold / Unsold Lists
router.get("/sold", getSoldPlayers);
router.get("/:tournamentId/sold", getSoldPlayers);

router.get("/unsold", getUnsoldPlayers);
router.get("/:tournamentId/unsold", getUnsoldPlayers);

// Feed & History
router.get("/history", getAllBids);
router.get("/:tournamentId/history", getAllBids);
router.get("/bids/:playerId", getBidHistory);

export default router;