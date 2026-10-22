import express from "express";
import http from "http";
import path from "path";
import { Server } from "socket.io";
import { PrismaClient } from "@prisma/client";
import cors from "cors";

export const prisma = new PrismaClient();

export interface AuctionState {
    tournamentId: number;
    currentPlayerId: number | null;
    status: "IDLE" | "BIDDING" | "SOLD" | "UNSOLD";
}

// In-memory isolated auction states for each tournament
export const tournamentAuctionStates = new Map<number, AuctionState>();

export const getTournamentAuctionState = (tournamentId: number): AuctionState => {
    if (!tournamentAuctionStates.has(tournamentId)) {
        tournamentAuctionStates.set(tournamentId, {
            tournamentId,
            currentPlayerId: null,
            status: "IDLE",
        });
    }
    return tournamentAuctionStates.get(tournamentId)!;
};

// Backward-compatibility proxy for single-tournament callers
export const auctionState: AuctionState = new Proxy(
    { tournamentId: 1, currentPlayerId: null, status: "IDLE" } as AuctionState,
    {
        get(target, prop: keyof AuctionState) {
            return getTournamentAuctionState(1)[prop];
        },
        set(target, prop: keyof AuctionState, value) {
            (getTournamentAuctionState(1) as any)[prop] = value;
            return true;
        },
    }
);

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ limit: "100mb", extended: true }));

import playerRoutes from "./routes/players";
import teamRoutes from "./routes/teams";
import auctionRoutes from "./routes/auction";
import statsRoutes from "./routes/stats";
import adminRoutes from "./routes/admin";
import settingsRoutes from "./routes/settings";
import registrationRoutes from "./routes/registration";
import tournamentRoutes from "./routes/tournaments";

// Serve uploaded player photos statically
const uploadsDir = path.resolve(__dirname, "..", "uploads");
app.use("/uploads", express.static(uploadsDir));
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

app.use("/api/tournaments", tournamentRoutes);
app.use("/api/players", playerRoutes);
app.use("/api/teams", teamRoutes);
app.use("/api/auction", auctionRoutes);
app.use("/api/stats", statsRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api", registrationRoutes);

app.get("/", (req, res) => {
    res.send("Backend is running with Multi-Tournament support!");
});

const server = http.createServer(app);

export const io = new Server(server, {
    cors: {
        origin: "*",
    },
});

// Update auction state and broadcast ONLY to the tournament's dedicated room
export function updateAuctionState(tournamentId: number, newState: Partial<AuctionState>): void;
export function updateAuctionState(newState: Partial<AuctionState>): void;
export function updateAuctionState(
    arg1: number | Partial<AuctionState>,
    arg2?: Partial<AuctionState>
) {
    let tId = 1;
    let stateUpdates: Partial<AuctionState>;

    if (typeof arg1 === "number") {
        tId = arg1;
        stateUpdates = arg2 || {};
    } else {
        stateUpdates = arg1;
    }

    const state = getTournamentAuctionState(tId);
    Object.assign(state, stateUpdates);

    // Emit strictly to the tournament room
    io.to(`tournament_${tId}`).to(`auction_${tId}`).emit("auctionStateUpdate", state);
    io.to(`tournament_${tId}`).to(`auction_${tId}`).emit("auctionStateUpdated", state);
    console.log(`[Socket] State updated for Tournament ${tId}:`, state.status, "Player:", state.currentPlayerId);
}

// Room broadcast helper
export const emitToTournament = (tournamentId: number, event: string, data?: any) => {
    io.to(`tournament_${tournamentId}`).to(`auction_${tournamentId}`).emit(event, data);
};

// Safely evicts clients and cleans up state when a tournament is archived or deleted
export const cleanupTournamentSocket = (tournamentId: number, action: "deleted" | "archived" = "deleted") => {
    const room = `auction_${tournamentId}`;
    try {
        if (action === "deleted") {
            io.to(room).emit("tournamentDeleted", {
                tournamentId,
                message: "This tournament has been permanently deleted.",
            });
            io.in(room).socketsLeave(room);
            tournamentAuctionStates.delete(tournamentId);
            console.log(`[Socket] Evicted all clients and cleaned state for deleted tournament ${tournamentId}`);
        } else if (action === "archived") {
            io.to(room).emit("tournamentArchived", {
                tournamentId,
                message: "This tournament has been archived.",
            });
            updateAuctionState(tournamentId, { status: "IDLE", currentPlayerId: null });
            console.log(`[Socket] Broadcasted archive event and reset state for tournament ${tournamentId}`);
        }
    } catch (err) {
        console.error(`[Socket] Error cleaning up socket room for tournament ${tournamentId}:`, err);
    }
};

io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    // Optional query parameter on connect: ?tournamentId=1
    const handshakeTournamentId = socket.handshake.query.tournamentId
        ? Number(socket.handshake.query.tournamentId)
        : null;

    if (handshakeTournamentId && !isNaN(handshakeTournamentId)) {
        socket.join(`tournament_${handshakeTournamentId}`);
        socket.join(`auction_${handshakeTournamentId}`);
        socket.emit("auctionStateUpdate", getTournamentAuctionState(handshakeTournamentId));
        console.log(`Socket ${socket.id} auto-joined tournament_${handshakeTournamentId} and auction_${handshakeTournamentId}`);
    } else {
        socket.emit("auctionStateUpdate", getTournamentAuctionState(1));
    }

    // Explicit room subscription
    socket.on("joinTournament", ({ tournamentId }: { tournamentId: number | string }) => {
        const tId = Number(tournamentId);
        if (isNaN(tId)) return;

        // Leave any previous tournament rooms
        for (const room of socket.rooms) {
            if ((room.startsWith("auction_") || room.startsWith("tournament_")) &&
                room !== `auction_${tId}` && room !== `tournament_${tId}`) {
                socket.leave(room);
            }
        }

        socket.join(`tournament_${tId}`);
        socket.join(`auction_${tId}`);
        console.log(`Socket ${socket.id} joined rooms: tournament_${tId} & auction_${tId}`);

        socket.emit("auctionStateUpdate", getTournamentAuctionState(tId));
    });

    socket.on("leaveTournament", ({ tournamentId }: { tournamentId: number | string }) => {
        const tId = Number(tournamentId);
        if (!isNaN(tId)) {
            socket.leave(`tournament_${tId}`);
            socket.leave(`auction_${tId}`);
            console.log(`Socket ${socket.id} left rooms for tournament ${tId}`);
        }
    });

    // Real-time bid broadcast scoped to tournament room with security validation
    socket.on("placeBid", async (data) => {
        try {
            const tId = Number(data?.tournamentId);
            if (!tId || isNaN(tId)) {
                socket.emit("bidError", { message: "Invalid tournament ID" });
                return;
            }
            const playerId = Number(data?.playerId);
            const teamId = Number(data?.teamId);
            if (playerId && teamId) {
                const player = await prisma.player.findUnique({ where: { id: playerId } });
                const team = await prisma.team.findUnique({ where: { id: teamId } });
                if (!player || !team || player.tournamentId !== tId || team.tournamentId !== tId) {
                    socket.emit("bidError", { message: "Player and team must belong to the same tournament." });
                    return;
                }
            }
            io.to(`tournament_${tId}`).to(`auction_${tId}`).emit("updateBid", data);
        } catch (err) {
            console.error("Socket placeBid error:", err);
        }
    });

    socket.on("disconnect", () => {
        console.log("Client disconnected:", socket.id);
    });
});

server.listen(5000, () => {
    console.log("Server running on port 5000 (Multi-Tournament Enabled)");
});
