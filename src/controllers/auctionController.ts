import { Request, Response } from "express";
import { prisma, io, getTournamentAuctionState, updateAuctionState } from "../server";

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

        // Emit strictly to the tournament room
        io.to(`auction_${player.tournamentId}`).emit("playerSold", { playerId });
        console.log(`Player ${playerId} SOLD in Tournament ${player.tournamentId}`);
    } else {
        console.log(`Player ${playerId} UNSOLD in Tournament ${player.tournamentId}`);
    }
};

// PLACE BID (Scoped to tournament with strict cross-tournament validation)
export const placeBid = async (req: Request, res: Response) => {
    try {
        const { playerId, teamId, amount } = req.body;
        const requestedTournamentId = req.params.tournamentId || req.body.tournamentId;

        const result = await prisma.$transaction(async (tx) => {
            const player = await tx.player.findUnique({
                where: { id: Number(playerId) },
            });

            if (!player) throw new Error("Player not found");
            if (player.sold) throw new Error("Player already sold");

            // Determine tournamentId
            const tournamentId = requestedTournamentId
                ? Number(requestedTournamentId)
                : player.tournamentId;

            // Strict tournament isolation check for player
            if (player.tournamentId !== tournamentId) {
                throw new Error(
                    `Player #${playerId} belongs to Tournament ${player.tournamentId}, not Tournament ${tournamentId}. Cross-tournament bidding is blocked.`
                );
            }

            const team = await tx.team.findUnique({
                where: { id: Number(teamId) },
                include: { players: true },
            });

            if (!team) throw new Error("Team not found");

            // Strict tournament isolation check for team
            if (team.tournamentId !== tournamentId) {
                throw new Error(
                    `Team #${teamId} belongs to Tournament ${team.tournamentId}, not Tournament ${tournamentId}. Cross-tournament bidding is blocked.`
                );
            }

            // Dynamic Maximum Available Bid Calculation
            const MIN_PLAYERS_REQUIRED = 8;
            const MIN_BASE_PRICE = 500;

            const purchasedCount = team.players.filter((p) => p.sold).length;
            const requiredPlayersCount = Math.max(0, MIN_PLAYERS_REQUIRED - purchasedCount);

            // If the team placing the bid is already the leading bidder on this player,
            // their current bid is returned to their purse first before the new bid amount is placed.
            const isLeadingBidder = player.teamId === team.id;
            const effectivePurse =
                isLeadingBidder && player.currentBid !== null
                    ? team.purse + player.currentBid
                    : team.purse;

            const maxAvailableBid = effectivePurse - requiredPlayersCount * MIN_BASE_PRICE;

            // Validate: new bid must be strictly greater than current bid (or >= basePrice for opening)
            const minimumBid =
                player.currentBid !== null ? player.currentBid + 1 : player.basePrice;

            if (amount < minimumBid) {
                throw new Error(
                    player.currentBid !== null
                        ? `Bid must be greater than the current bid of ₹${player.currentBid}`
                        : `Opening bid must be at least ₹${player.basePrice}`
                );
            }

            if (amount > maxAvailableBid) {
                throw new Error(`Maximum allowed bid is ₹${maxAvailableBid.toLocaleString()}.`);
            }

            if (effectivePurse < amount) {
                throw new Error("Not enough purse balance");
            }

            // Refund previous leading team's purse if different
            if (player.currentBid !== null && player.teamId !== null && player.teamId !== team.id) {
                await tx.team.update({
                    where: { id: player.teamId },
                    data: {
                        purse: { increment: player.currentBid },
                    },
                });
            }

            // Deduct new team's purse (or net change if re-bidding)
            const deductAmount = isLeadingBidder && player.currentBid !== null
                ? amount - player.currentBid
                : amount;

            await tx.team.update({
                where: { id: team.id },
                data: {
                    purse: { decrement: deductAmount },
                },
            });

            // Update player leading bid
            await tx.player.update({
                where: { id: player.id },
                data: {
                    currentBid: amount,
                    teamId: team.id,
                },
            });

            // Create bid record connected to the tournament
            const createdBid = await tx.bid.create({
                data: {
                    tournamentId,
                    playerId: player.id,
                    teamId: team.id,
                    amount,
                },
                include: {
                    team: true,
                    player: true,
                },
            });

            return { createdBid, tournamentId };
        });

        // 🔥 Emit real-time update ONLY to the tournament's room
        const roomName = `auction_${result.tournamentId}`;
        io.to(roomName).emit("newBid", result.createdBid);
        io.to(roomName).emit("updateBid", result.createdBid);

        res.json({
            message: "Bid placed successfully",
            bid: result.createdBid,
        });
    } catch (error: any) {
        res.status(400).json({
            message: error.message,
        });
    }
};

// SOLD PLAYERS (Filtered by tournament)
export const getSoldPlayers = async (req: Request, res: Response) => {
    try {
        const tournamentId = Number(
            req.params.tournamentId || req.query.tournamentId || 1
        );

        const players = await prisma.player.findMany({
            where: {
                tournamentId,
                sold: true,
                teamId: { not: null },
            },
            include: { team: true },
        });

        res.json(players);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

// UNSOLD PLAYERS (Filtered by tournament)
export const getUnsoldPlayers = async (req: Request, res: Response) => {
    try {
        const tournamentId = Number(
            req.params.tournamentId || req.query.tournamentId || 1
        );

        const players = await prisma.player.findMany({
            where: {
                tournamentId,
                sold: true,
                teamId: null,
            },
        });

        res.json(players);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

// BID HISTORY (For a single player)
export const getBidHistory = async (req: Request, res: Response) => {
    try {
        const playerId = Number(req.params.playerId);
        const bids = await prisma.bid.findMany({
            where: { playerId },
            include: { team: true },
            orderBy: { createdAt: "desc" },
        });
        res.json(bids);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

// ALL BIDS (FEED, scoped by tournament)
export const getAllBids = async (req: Request, res: Response) => {
    try {
        const rawTId = req.params.tournamentId || req.query.tournamentId;
        const where: any = {};
        if (rawTId) {
            where.tournamentId = Number(rawTId);
        }

        const bids = await prisma.bid.findMany({
            where,
            include: { team: true, player: true },
            orderBy: { createdAt: "desc" },
            take: 50,
        });
        res.json(bids);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

// GET AUCTION STATE (Isolated per tournament)
export const getAuctionState = async (req: Request, res: Response) => {
    const tournamentId = Number(
        req.params.tournamentId || req.query.tournamentId || 1
    );
    const state = getTournamentAuctionState(tournamentId);
    res.json(state);
};