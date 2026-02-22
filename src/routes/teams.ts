import { Router } from "express";
import {
    getTeams,
    addTeam,
    updateTeamPurse,
} from "../controllers/teamController";

const router = Router();

router.get("/", getTeams);               // List all teams
router.post("/", addTeam);               // Add a new team
router.patch("/:id/purse", updateTeamPurse); // Update team's purse

export default router;