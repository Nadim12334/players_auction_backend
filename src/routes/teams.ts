import { Router } from "express";
import {
    getTeams,
    addTeam,
    editTeam,
    deleteTeam,
} from "../controllers/teamController";

const router = Router();

router.get("/", getTeams);               // List all teams
router.post("/", addTeam);               // Add a new team
router.put("/:id", editTeam);            // Edit a team
router.delete("/:id", deleteTeam);      // Delete a team

export default router;