import { Request, Response } from "express";
import { prisma, io } from "../server";

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
    const MIN_BID_INCREMENT = 50;

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
            });

            if (!team) throw new Error("Team not found");

            const minimumBid =
                player.currentBid !== null
                    ? player.currentBid + MIN_BID_INCREMENT
                    : player.basePrice;

            if (amount < minimumBid) {
                throw new Error(`Bid must be at least ${minimumBid}`);
            }

            if (team.purse < amount) {
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
        where: { sold: true },
        include: { team: true },
    });

    res.json(players);
};

// UNSOLD PLAYERS
export const getUnsoldPlayers = async (req: Request, res: Response) => {
    const players = await prisma.player.findMany({
        where: {
            sold: false,
            teamId: null,
        },
    });

    res.json(players);
};

// BID HISTORY
export const getBidHistory = async (req: Request, res: Response) => {
    const playerId = Number(req.params.playerId);

    const bids = await prisma.bid.findMany({
        where: { playerId },
        orderBy: { createdAt: "desc" },
    });

    res.json(bids);
};