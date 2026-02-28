import { Request, Response } from "express";
import { prisma } from "../server";
import { startAuctionTimer, resetAuctionTimer } from "../utils/auctionTimer";

/**
 * =========================
 * PLACE A BID
 * =========================
 */
export const placeBid = async (req: Request, res: Response) => {
    const MIN_BID_INCREMENT = 50;


    try {
        const { playerId, teamId, amount } = req.body;

        if (
            typeof playerId !== "number" ||
            typeof teamId !== "number" ||
            typeof amount !== "number"
        ) {
            return res.status(400).json({
                message: "playerId, teamId and amount must be numbers",
            });
        }

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

            // ✅ FIXED: Proper null check
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

            // Refund previous bidder
            if (player.currentBid !== null && player.teamId !== null) {
                await tx.team.update({
                    where: { id: player.teamId },
                    data: {
                        purse: { increment: player.currentBid },
                    },
                });
            }

            // Deduct from new bidder
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

            resetAuctionTimer(playerId, handleAuctionExpire);

            // Save bid history
            return await tx.bid.create({
                data: {
                    playerId,
                    teamId,
                    amount,
                },
            });
        });

        return res.json({
            message: "Bid placed successfully",
            bid: result,
        });

    } catch (error: any) {
        return res.status(400).json({
            message: error.message || "Something went wrong",
        });
    }
};

/**
 * =========================
 * START PLAYER AUCTION
 * =========================
 */
export const startPlayerAuction = async (
    req: Request<{ playerId: string }>,
    res: Response
) => {
    const playerId = parseInt(req.params.playerId);

    if (isNaN(playerId)) {
        return res.status(400).json({ message: "Invalid playerId" });
    }

    startAuctionTimer(playerId, handleAuctionExpire);

    return res.json({ message: "Auction started for player" });
};

/**
 * =========================
 * MARK PLAYER AS SOLD
 * =========================
 */
export const markAsSold = async (
    req: Request<{ playerId: string }>,
    res: Response
) => {
    try {
        const playerId = parseInt(req.params.playerId);

        if (isNaN(playerId)) {
            return res.status(400).json({
                message: "Invalid playerId",
            });
        }

        const player = await prisma.player.findUnique({
            where: { id: playerId },
        });

        if (!player) {
            return res.status(404).json({ message: "Player not found" });
        }

        if (player.sold) {
            return res.status(400).json({
                message: "Player already sold",
            });
        }

        if (!player.teamId) {
            return res.status(400).json({
                message: "No bids placed yet",
            });
        }

        const updatedPlayer = await prisma.player.update({
            where: { id: playerId },
            data: { sold: true },
        });

        return res.json({
            message: "Player sold successfully",
            player: updatedPlayer,
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({
            message: "Something went wrong",
        });
    }
};

export const handleAuctionExpire = async (playerId: number) => {
    const player = await prisma.player.findUnique({
        where: { id: playerId },
    });

    if (!player || player.sold) return;

    if (player.teamId) {
        // 🔥 At least one bid → SOLD
        await prisma.player.update({
            where: { id: playerId },
            data: { sold: true },
        });

        console.log(`Player ${playerId} SOLD`);
    } else {
        // ❌ No bid → UNSOLD
        console.log(`Player ${playerId} UNSOLD (No bids)`);
    }
};