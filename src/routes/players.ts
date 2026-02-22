import { Router } from "express";
import { getPlayers, addPlayer } from "../controllers/playerController";

const router = Router();

router.get("/", getPlayers);
router.post("/", addPlayer);

export default router;