import { Request, Response } from "express";
import { prisma } from "../server";
import { startAuctionTimer } from "../utils/auctionTimer";
import { handleAuctionExpire } from "./auctionController";

export const startAuction = async (req: Request, res: Response) => {
    const playerId = Number(req.params.playerId);

    const player = await prisma.player.findUnique({
        where: { id: playerId },
    });

    if (!player) {
        return res.status(404).json({ message: "Player not found" });
    }

    startAuctionTimer(playerId, handleAuctionExpire);

    res.json({
        message: "Auction started",
        player,
    });
};

export const sellPlayer = async (req: Request, res: Response) => {
    const playerId = Number(req.params.playerId);

    const player = await prisma.player.update({
        where: { id: playerId },
        data: { sold: true },
    });

    res.json({
        message: "Player sold successfully",
        player,
    });
};

export const markUnsold = async (req: Request, res: Response) => {
    const playerId = Number(req.params.playerId);

    const player = await prisma.player.update({
        where: { id: playerId },
        data: {
            sold: false,
            teamId: null,
            currentBid: null,
        },
    });

    res.json({
        message: "Player marked as unsold",
        player,
    });
};