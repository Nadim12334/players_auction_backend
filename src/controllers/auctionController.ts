import { Request, Response } from "express";
import * as auctionService from "../services/auctionService";

export const placeBid = async (req: Request, res: Response) => {
    try {
        const result = await auctionService.handleBid(req.body);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: "Failed to place bid" });
    }
};

export const getAuctionStatus = async (req: Request, res: Response) => {
    try {
        const status = await auctionService.getStatus();
        res.json(status);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch auction status" });
    }
};
