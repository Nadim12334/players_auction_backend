import { prisma } from "../prisma";
import { io } from "../server";

export const handleBid = async (bidData: any) => {
    const { playerId, teamId, amount, tournamentId } = bidData;
    const tId = Number(tournamentId || 1);

    // Emit updates via Socket.io room
    io.to(`auction_${tId}`).emit("newBid", { playerId, teamId, amount, tournamentId: tId });

    return { success: true, message: "Bid placed successfully" };
};

export const getStatus = async () => {
    return { status: "active", currentItem: null };
};
