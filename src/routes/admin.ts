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
    removeUnsoldPlayer,
    getTournamentsList,
    exportPlayerRegistrationList,
    exportAuctionResults,
} from "../controllers/adminController";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Auction Control Routes (Supports both direct and tournament-parameterized paths)
router.post("/auction/start/:playerId", startAuction);
router.post("/auction/:tournamentId/start/:playerId", startAuction);

router.post("/auction/sell/:playerId", sellPlayer);
router.post("/auction/:tournamentId/sell/:playerId", sellPlayer);

router.post("/auction/unsold/:playerId", markUnsold);
router.post("/auction/:tournamentId/unsold/:playerId", markUnsold);

router.post("/auction/next", nextPlayer);
router.post("/auction/next-player", nextPlayer);
router.post("/auction/:tournamentId/next", nextPlayer);
router.post("/auction/:tournamentId/next-player", nextPlayer);

// Bulk Import
router.post("/players/import", upload.single("file"), importPlayers);
router.post("/players/:tournamentId/import", upload.single("file"), importPlayers);

// Unsold Players Management Routes
router.get("/unsold-players", getUnsoldPlayers);
router.get("/unsold-players/:tournamentId", getUnsoldPlayers);
router.post("/unsold-players/:id/auction-now", auctionUnsoldNow);
router.post("/unsold-players/:id/move-to-end", moveUnsoldToEnd);
router.delete("/unsold-players/:id", removeUnsoldPlayer);

// Tournaments List
router.get("/tournaments", getTournamentsList);

// Export Routes (Supports query ?tournamentId= and path /:tournamentId)
router.get("/export/players", exportPlayerRegistrationList);
router.get("/export/players/:tournamentId", exportPlayerRegistrationList);

router.get("/export/auction-results", exportAuctionResults);
router.get("/export/auction-results/:tournamentId", exportAuctionResults);

export default router;