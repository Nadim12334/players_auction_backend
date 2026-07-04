import express from "express";
import {
    startAuction,
    sellPlayer,
    markUnsold,
    nextPlayer
} from "../controllers/adminController";

const router = express.Router();

router.post("/auction/start/:playerId", startAuction);
router.post("/auction/sell/:playerId", sellPlayer);
router.post("/auction/unsold/:playerId", markUnsold);
router.post("/auction/next", nextPlayer);

export default router;