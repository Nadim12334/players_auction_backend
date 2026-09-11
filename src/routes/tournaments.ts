import { Router } from "express";
import {
    getTournaments,
    getTournamentById,
    createTournament,
    updateTournament,
    deleteTournament,
} from "../controllers/tournamentController";

const router = Router();

router.get("/", getTournaments);
router.post("/", createTournament);
router.get("/:id", getTournamentById);
router.put("/:id", updateTournament);
router.delete("/:id", deleteTournament);

export default router;
