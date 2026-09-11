import { Router } from "express";
import {
    getTeams,
    addTeam,
    editTeam,
    deleteTeam,
} from "../controllers/teamController";

const router = Router();

router.get("/", getTeams);
router.get("/tournament/:tournamentId", getTeams);
router.post("/", addTeam);
router.post("/tournament/:tournamentId", addTeam);
router.put("/:id", editTeam);
router.delete("/:id", deleteTeam);

export default router;