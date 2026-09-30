import { Router } from "express";
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