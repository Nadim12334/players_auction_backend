import { Router } from "express";
import { getPlayers, addPlayer, editPlayer, deletePlayer } from "../controllers/playerController";

const router = Router();

router.get("/", getPlayers);
router.get("/tournament/:tournamentId", getPlayers);
router.post("/", addPlayer);
router.post("/tournament/:tournamentId", addPlayer);
router.put("/:id", editPlayer);
router.delete("/:id", deletePlayer);

export default router;