import { Router } from "express";
import { getAllPlayers, addPlayer } from "../controllers/playerController";

const router = Router();

router.get("/", getAllPlayers);
router.post("/", addPlayer);

export default router;