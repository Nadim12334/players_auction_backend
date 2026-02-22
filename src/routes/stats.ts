import { Router } from "express";
import { topBuyers, teamPurse } from "../controllers/statsController";

const router = Router();

router.get("/top-buyers", topBuyers);
router.get("/team-purse/:teamId", teamPurse);

export default router;