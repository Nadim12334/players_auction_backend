import { Router } from "express";
import { placeBid, getLiveAuction } from "../controllers/auctionController";

const router = Router();

router.post("/bid", placeBid);          // Place a bid
router.get("/live", getLiveAuction);    // Get live auction info

export default router;