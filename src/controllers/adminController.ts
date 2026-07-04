import { Request, Response } from "express";
import { prisma, io, updateAuctionState } from "../server";

export const startAuction = async (req: Request, res: Response) => {
    const playerId = Number(req.params.playerId);

    const player = await prisma.player.findUnique({
        where: { id: playerId },
    });

    if (!player) {
        return res.status(404).json({ message: "Player not found" });
    }

    // Reset player state and clear bids for a clean manual start if restarting
    const updatedPlayer = await prisma.player.update({
        where: { id: playerId },
        data: {
            sold: false,
            teamId: null,
            currentBid: null,
        },
    });

    // Delete existing bids for this player so history starts fresh
    await prisma.bid.deleteMany({
        where: { playerId },
    });

    updateAuctionState({ currentPlayerId: playerId, status: "BIDDING" });

    io.emit("auctionStarted", { playerId });

    res.json({
        message: "Auction started",
        player: updatedPlayer,
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

    if (!p.teamId) {
        return res.status(400).json({ message: "Cannot sell player without bids" });
    }

    const player = await prisma.player.update({
        where: { id: playerId },
        data: { sold: true },
    });

    updateAuctionState({ status: "SOLD" });

    io.emit("playerSold", { playerId, sold: true });

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

    // If there was a bid, we need to refund the purse
    if (p.teamId && p.currentBid) {
        await prisma.team.update({
            where: { id: p.teamId },
            data: { purse: { increment: p.currentBid } },
        });
    }

    // Delete any bids placed for this player
    await prisma.bid.deleteMany({
        where: { playerId },
    });

    const player = await prisma.player.update({
        where: { id: playerId },
        data: {
            sold: true,
            teamId: null,
            currentBid: null,
        },
    });

    updateAuctionState({ status: "UNSOLD" });

    io.emit("playerSold", { playerId, sold: false });

    res.json({
        message: "Player marked as unsold",
        player,
    });
};

export const nextPlayer = async (req: Request, res: Response) => {
    // Find the first unsold player in the database
    const player = await prisma.player.findFirst({
        where: { sold: false },
        orderBy: { id: "asc" },
    });

    if (player) {
        // Reset player in database just in case
        await prisma.player.update({
            where: { id: player.id },
            data: {
                currentBid: null,
                teamId: null,
                sold: false,
            }
        });

        // Delete any bids placed for this player
        await prisma.bid.deleteMany({
            where: { playerId: player.id },
        });

        updateAuctionState({ currentPlayerId: player.id, status: "IDLE" });
        io.emit("auctionNext", { playerId: player.id });

        return res.json({
            message: "Next player loaded successfully",
            player,
        });
    } else {
        updateAuctionState({ currentPlayerId: null, status: "IDLE" });
        io.emit("auctionNext", { playerId: null });

        return res.json({
            message: "No more unsold players left",
            player: null,
        });
    }
};