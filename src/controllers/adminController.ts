import { Request, Response } from "express";
import { prisma, io } from "../server";
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

    io.emit("auctionStarted", { playerId });

    res.json({
        message: "Auction started",
        player,
    });
};

export const sellPlayer = async (req: Request, res: Response) => {
    const playerId = Number(req.params.playerId);

    const p = await prisma.player.findUnique({
        where: { id: playerId },
    });

    if (!p) {
        return res.status(404).json({ message: "Player not found" });
    }

    const player = await prisma.player.update({
        where: { id: playerId },
        data: { sold: true },
    });

    io.emit("playerSold", { playerId });

    res.json({
        message: "Player sold successfully",
        player,
    });
};

export const markUnsold = async (req: Request, res: Response) => {
    const playerId = Number(req.params.playerId);

    const p = await prisma.player.findUnique({
        where: { id: playerId },
    });

    if (!p) {
        return res.status(404).json({ message: "Player not found" });
    }

    if (p.teamId && p.currentBid) {
        await prisma.team.update({
            where: { id: p.teamId },
            data: { purse: { increment: p.currentBid } },
        });
    }

    const player = await prisma.player.update({
        where: { id: playerId },
        data: {
            sold: true,
            teamId: null,
            currentBid: null,
        },
    });

    io.emit("playerSold", { playerId });

    res.json({
        message: "Player marked as unsold",
        player,
    });
};