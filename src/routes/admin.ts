import express from "express";
import multer from "multer";
import {
    startAuction,
    sellPlayer,
    markUnsold,
    nextPlayer,
    importPlayers,
    getUnsoldPlayers,
    auctionUnsoldNow,
    moveUnsoldToEnd,
    removeUnsoldPlayer
} from "../controllers/adminController";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post("/auction/start/:playerId", startAuction);
router.post("/auction/sell/:playerId", sellPlayer);
router.post("/auction/unsold/:playerId", markUnsold);
router.post("/auction/next", nextPlayer);
router.post("/players/import", upload.single("file"), importPlayers);

// Unsold Players Management Routes
router.get("/unsold-players", getUnsoldPlayers);
router.post("/unsold-players/:id/auction-now", auctionUnsoldNow);
router.post("/unsold-players/:id/move-to-end", moveUnsoldToEnd);
router.delete("/unsold-players/:id", removeUnsoldPlayer);

export default router;