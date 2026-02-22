import express from "express";
import { PrismaClient } from "@prisma/client";

const app = express();
const prisma = new PrismaClient();

app.use(express.json());

const PORT = process.env.PORT || 5000;

// Test route
app.get("/", (req, res) => {
    res.send("Backend is running!");
});

// Example: Get all players
app.get("/api/players", async (req, res) => {
    const players = await prisma.player.findMany();
    res.json(players);
});

// Example: Add a new player
app.post("/api/players", async (req, res) => {
    const { name, team, basePrice } = req.body;
    const player = await prisma.player.create({
        data: { name, team, basePrice },
    });
    res.json(player);
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});