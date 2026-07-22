import { Router } from "express";
import { getPlayers, addPlayer, editPlayer, deletePlayer } from "../controllers/playerController";

const router = Router();

router.get("/", getPlayers);
router.post("/", addPlayer);
router.put("/:id", editPlayer);
router.delete("/:id", deletePlayer);

export default router;