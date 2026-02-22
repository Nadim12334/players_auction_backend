import { Router } from "express";
import * as teamController from "../controllers/teamController";

const router = Router();

router.get("/", teamController.getTeams);
router.post("/", teamController.createTeam);

export default router;
