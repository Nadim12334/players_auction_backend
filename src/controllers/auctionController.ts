import { Request, Response } from "express";
import { prisma } from "../server";
import { notifyBuyer } from "../utils/notify";

// Place a bid
export const placeBid = async (req: Request, res: Response) => {
    const { playerId, teamId, amount } = req.body;

    const player = await prisma.player.findUnique({ where: { id: playerId } });
    if (!player) return res.status(404).json({ message: "Player not found" });
    if (player.sold) return res.status(400).json({ message: "Player already sold" });

    // Check if bid is higher than current bid
    const currentBidAmount = player.currentBid ?? 0;
    if (amount <= currentBidAmount) {
        return res.status(400).json({ message: "Bid must be higher than current bid" });
    }

    // Update player current bid and teamId
    await prisma.player.update({
        where: { id: playerId },
        data: {
            currentBid: amount,
            teamId: teamId
        },
    });

    // Save bid record
    const bid = await prisma.bid.create({
        data: { playerId, teamId, amount },
    });

    // Send notification
    notifyBuyer(`Team ${teamId}`, player.name);

    res.json(bid);
};

// Get live auction info
export const getLiveAuction = async (req: Request, res: Response) => {
    const players = await prisma.player.findMany();
    res.json(players);
};