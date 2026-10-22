import { Router } from "express";
import {
    getTeams,
    addTeam,
    editTeam,
    deleteTeam,
    teamLogoUpload,
} from "../controllers/teamController";

const router = Router();

router.get("/", getTeams);
router.get("/tournament/:tournamentId", getTeams);
router.post("/", teamLogoUpload.single("logo"), addTeam);
router.post("/tournament/:tournamentId", teamLogoUpload.single("logo"), addTeam);
router.put("/:id", teamLogoUpload.single("logo"), editTeam);
router.delete("/:id", deleteTeam);

export default router;
