import { Router } from "express";
import multer from "multer";
import { getPlayers, addPlayer, editPlayer, deletePlayer, getTournamentQueue } from "../controllers/playerController";
import { getTeams, addTeam, editTeam, deleteTeam, teamLogoUpload } from "../controllers/teamController";
import { placeBid, getSoldPlayers, getUnsoldPlayers as getAuctionUnsold, getTournamentAuctionDetails, getTournamentResults, getAllBids, getAuctionState, getCurrentAuctionPlayer } from "../controllers/auctionController";
import { startAuction, sellPlayer, markUnsold, nextPlayer, importPlayers, getUnsoldPlayers as getAdminUnsold, auctionUnsoldNow, moveUnsoldToEnd, removeUnsoldPlayer } from "../controllers/adminController";
import { getPublicTournamentInfo } from "../controllers/registrationController";
import {
    getTournaments,
    getTournamentById,
    createTournament,
    updateTournament,
    archiveTournament,
    restoreTournament,
    completeTournament,
    deleteTournament,
    toggleRegistration,
} from "../controllers/tournamentController";

const router = Router();

router.get("/", getTournaments);
router.post("/", createTournament);
router.get("/public/:identifier", getPublicTournamentInfo);
router.get("/public", getPublicTournamentInfo);

const upload = multer({ storage: multer.memoryStorage() });

// ==========================================
// TOURNAMENT-SCOPED SUBOUTPUTS & ACTIONS
// ==========================================

// Players & Queue
router.get("/:tournamentId/players", getPlayers);
router.post("/:tournamentId/players", addPlayer);
router.post("/:tournamentId/players/import", upload.single("file"), importPlayers);
router.get("/:tournamentId/queue", getTournamentQueue);

// Teams / Franchises
router.get("/:tournamentId/teams", getTeams);
router.post("/:tournamentId/teams", teamLogoUpload.single("logo"), addTeam);
router.put("/:tournamentId/teams/:teamId", teamLogoUpload.single("logo"), editTeam);

// Auction Console State & Results
router.get("/:tournamentId/auction", getTournamentAuctionDetails);
router.get("/:tournamentId/current", getCurrentAuctionPlayer);
router.get("/:tournamentId/auction/current", getCurrentAuctionPlayer);
router.get("/:tournamentId/results", getTournamentResults);
router.get("/:tournamentId/sold", getSoldPlayers);
router.get("/:tournamentId/unsold", getAuctionUnsold);
router.get("/:tournamentId/history", getAllBids);
router.get("/:tournamentId/bids", getAllBids);
router.get("/:tournamentId/state", getAuctionState);

// Auction Bidding & State Transitions
router.post("/:tournamentId/auction/bid", placeBid);
router.post("/:tournamentId/auction/start/:playerId", startAuction);
router.post("/:tournamentId/auction/sell/:playerId", sellPlayer);
router.post("/:tournamentId/auction/unsold/:playerId", markUnsold);
router.post("/:tournamentId/auction/next", nextPlayer);

// Unsold Management
router.get("/:tournamentId/unsold-players", getAdminUnsold);
router.post("/:tournamentId/unsold-players/:id/auction-now", auctionUnsoldNow);
router.post("/:tournamentId/unsold-players/:id/move-to-end", moveUnsoldToEnd);
router.delete("/:tournamentId/unsold-players/:id", removeUnsoldPlayer);

router.get("/:id", getTournamentById);
router.put("/:id", updateTournament);

// Registration open/close toggle
router.post("/:id/toggle-registration", toggleRegistration);
router.post("/:id/registration", toggleRegistration);

// Status lifecycle routes
router.post("/:id/archive", archiveTournament);
router.post("/:id/restore", restoreTournament);
router.post("/:id/complete", completeTournament);

// Permanent Delete
router.delete("/:id", deleteTournament);

export default router;