import { prisma } from "../server";
import { Request, Response } from "express";

export const getPlayers = async (req: Request, res: Response) => {
    const players = await prisma.player.findMany();
    res.json(players);
};

export const addPlayer = async (req: Request, res: Response) => {
    const { name, teamId, basePrice, category, fromWhere } = req.body || {};

    if (!name || basePrice === undefined || !category) {
        return res.status(400).json({ error: "Name, basePrice, and category are required fields" });
    }

    try {
        const player = await prisma.player.create({
            data: {
                name,
                teamId: teamId ? parseInt(teamId) : null,
                basePrice: parseInt(basePrice),
                category,
                fromWhere
            },
        });
        res.json(player);
    } catch (error) {
        console.error("Error creating player:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};