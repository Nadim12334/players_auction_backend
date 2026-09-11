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
    io.to(`auction_${tId}`).emit("auctionStateUpdate", state);
    console.log(`[Socket] State updated for Tournament ${tId}:`, state.status, "Player:", state.currentPlayerId);
}

// Room broadcast helper
export const emitToTournament = (tournamentId: number, event: string, data?: any) => {
    io.to(`auction_${tournamentId}`).emit(event, data);
};

io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    // Optional query parameter on connect: ?tournamentId=1
    const handshakeTournamentId = socket.handshake.query.tournamentId
        ? Number(socket.handshake.query.tournamentId)
        : null;

    if (handshakeTournamentId && !isNaN(handshakeTournamentId)) {
        const room = `auction_${handshakeTournamentId}`;
        socket.join(room);
        socket.emit("auctionStateUpdate", getTournamentAuctionState(handshakeTournamentId));
        console.log(`Socket ${socket.id} auto-joined ${room} from handshake`);
    } else {
        // Default to tournament 1 state
        socket.emit("auctionStateUpdate", getTournamentAuctionState(1));
    }

    // Explicit room subscription
    socket.on("joinTournament", ({ tournamentId }: { tournamentId: number | string }) => {
        const tId = Number(tournamentId);
        if (isNaN(tId)) return;

        // Leave any previous auction rooms
        for (const room of socket.rooms) {
            if (room.startsWith("auction_") && room !== `auction_${tId}`) {
                socket.leave(room);
            }
        }

        const room = `auction_${tId}`;
        socket.join(room);
        console.log(`Socket ${socket.id} joined room: ${room}`);

        // Send the latest state of this tournament to the connecting client
        socket.emit("auctionStateUpdate", getTournamentAuctionState(tId));
    });

    socket.on("leaveTournament", ({ tournamentId }: { tournamentId: number | string }) => {
        const tId = Number(tournamentId);
        if (!isNaN(tId)) {
            socket.leave(`auction_${tId}`);
            console.log(`Socket ${socket.id} left room: auction_${tId}`);
        }
    });

    // Real-time bid broadcast scoped to tournament room
    socket.on("placeBid", (data) => {
        const tId = Number(data?.tournamentId) || 1;
        io.to(`auction_${tId}`).emit("updateBid", data);
    });

    socket.on("disconnect", () => {
        console.log("Client disconnected:", socket.id);
    });
});

server.listen(5000, () => {
    console.log("Server running on port 5000 (Multi-Tournament Enabled)");
});