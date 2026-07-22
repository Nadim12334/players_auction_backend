import { Request, Response } from "express";
import { prisma, io, auctionState } from "../server";

export const handleAuctionExpire = async (playerId: number) => {
    const player = await prisma.player.findUnique({
        where: { id: playerId },
    });

    if (!player || player.sold) return;

    if (player.teamId) {
        await prisma.player.update({
            where: { id: playerId },
            data: { sold: true },
        });

        io.emit("playerSold", { playerId });

        console.log(`Player ${playerId} SOLD`);
    } else {
        console.log(`Player ${playerId} UNSOLD`);
    }
};

// PLACE BID
export const placeBid = async (req: Request, res: Response) => {
    try {
        const { playerId, teamId, amount } = req.body;

        const result = await prisma.$transaction(async (tx) => {
            const player = await tx.player.findUnique({
                where: { id: playerId },
            });

            if (!player) throw new Error("Player not found");
            if (player.sold) throw new Error("Player already sold");

            const team = await tx.team.findUnique({
                where: { id: teamId },
                include: { players: true }
            });

            if (!team) throw new Error("Team not found");

            // Dynamic Maximum Available Bid Calculation
            const MIN_PLAYERS_REQUIRED = 8;
            const MIN_BASE_PRICE = 500;

            const purchasedCount = team.players.filter(p => p.sold).length;
            const requiredPlayersCount = Math.max(0, MIN_PLAYERS_REQUIRED - purchasedCount);

            // If the team placing the bid is already the leading bidder on this player,
            // their current bid is returned to their purse first before the new bid amount is placed.
            const isLeadingBidder = player.teamId === teamId;
            const effectivePurse = isLeadingBidder && player.currentBid !== null
                ? team.purse + player.currentBid
                : team.purse;

            const maxAvailableBid = effectivePurse - (requiredPlayersCount * MIN_BASE_PRICE);

            // Validate: new bid must be strictly greater than current bid (or >= basePrice for opening)
            const minimumBid =
                player.currentBid !== null
                    ? player.currentBid + 1
                    : player.basePrice;

            if (amount < minimumBid) {
                throw new Error(
                    player.currentBid !== null
                        ? `Bid must be greater than the current bid of ${player.currentBid}`
                        : `Opening bid must be at least ${player.basePrice}`
                );
            }

            if (amount > maxAvailableBid) {
                throw new Error(`Maximum allowed bid is ₹${maxAvailableBid.toLocaleString()}.`);
            }

            if (effectivePurse < amount) {
                throw new Error("Not enough purse balance");
            }

            // Refund old team
            if (player.currentBid !== null && player.teamId !== null) {
                await tx.team.update({
                    where: { id: player.teamId },
                    data: {
                        purse: { increment: player.currentBid },
                    },
                });
            }

            // Deduct new team
            await tx.team.update({
                where: { id: teamId },
                data: {
                    purse: { decrement: amount },
                },
            });

            // Update player
            await tx.player.update({
                where: { id: playerId },
                data: {
                    currentBid: amount,
                    teamId: teamId,
                },
            });

            return await tx.bid.create({
                data: { playerId, teamId, amount },
            });
        });

        // 🔥 Emit real-time update
        io.emit("newBid", result);

        res.json({
            message: "Bid placed successfully",
            bid: result,
        });
    } catch (error: any) {
        res.status(400).json({
            message: error.message,
        });
    }
};

// SOLD PLAYERS
export const getSoldPlayers = async (req: Request, res: Response) => {
    const players = await prisma.player.findMany({
        where: { sold: true, teamId: { not: null } },
        include: { team: true },
    });

    res.json(players);
};

// UNSOLD PLAYERS
export const getUnsoldPlayers = async (req: Request, res: Response) => {
    const players = await prisma.player.findMany({
        where: {
            sold: true,
            teamId: null,
        },
    });

    res.json(players);
};

// BID HISTORY
export const getBidHistory = async (req: Request, res: Response) => {
    try {
        const playerId = Number(req.params.playerId);
        const bids = await prisma.bid.findMany({
            where: { playerId },
            orderBy: { createdAt: "desc" },
        });
        res.json(bids);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

// ALL BIDS (FEED)
export const getAllBids = async (req: Request, res: Response) => {
    try {
        const bids = await prisma.bid.findMany({
            orderBy: { createdAt: "desc" },
            take: 50,
        });
        res.json(bids);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

// GET AUCTION STATE
export const getAuctionState = async (req: Request, res: Response) => {
    res.json(auctionState);
};