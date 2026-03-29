import express from "express";
import http from "http";
import { Server } from "socket.io";
import { PrismaClient } from "@prisma/client";
import cors from "cors";

import playerRoutes from "./routes/players";
import teamRoutes from "./routes/teams";
import auctionRoutes from "./routes/auction";
import statsRoutes from "./routes/stats";
import adminRoutes from "./routes/admin";

export const prisma = new PrismaClient();

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

app.use("/api/players", playerRoutes);
app.use("/api/teams", teamRoutes);
app.use("/api/auction", auctionRoutes);
app.use("/api/stats", statsRoutes);
app.use("/api/admin", adminRoutes);

app.get("/", (req, res) => {
    res.send("Backend is running!");
});

const server = http.createServer(app);

export const io = new Server(server, {
    cors: {
        origin: "*",
    },
});

io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    socket.on("placeBid", (data) => {
        // Broadcast new bid to all clients
        io.emit("updateBid", data);
    });

    socket.on("disconnect", () => {
        console.log("Client disconnected:", socket.id);
    });
});

server.listen(5000, () => {
    console.log("Server running on port 5000");
});