import { Router } from "express";
import * as auctionController from "../controllers/auctionController";

const router = Router();

router.post("/bid", auctionController.placeBid);
router.get("/status", auctionController.getAuctionStatus);

export default router;
