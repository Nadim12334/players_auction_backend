import express from "express";
import http from "http";
import { Server as SocketServer } from "socket.io";
import { PrismaClient } from "@prisma/client";

import playerRoutes from "./routes/players";
import teamRoutes from "./routes/teams";
import auctionRoutes from "./routes/auction";
import statsRoutes from "./routes/stats";

const app = express();
const server = http.createServer(app);
export const io = new SocketServer(server, {
    cors: { origin: "*" },
});

export const prisma = new PrismaClient();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/api/players", playerRoutes);
app.use("/api/teams", teamRoutes);
app.use("/api/auction", auctionRoutes);
app.use("/api/stats", statsRoutes);

app.get("/", (req, res) => {
    res.send("Backend is running!");
});

// Socket.io events
io.on("connection", (socket) => {
    console.log("A client connected:", socket.id);

    socket.on("placeBid", (data) => {
        // Broadcast new bid to all clients
        io.emit("updateBid", data);
    });

    socket.on("disconnect", () => {
        console.log("Client disconnected:", socket.id);
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));