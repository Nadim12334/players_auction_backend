import { prisma } from "../server";
import { Request, Response } from "express";

export const getPlayers = async (req: Request, res: Response) => {
    const players = await prisma.player.findMany();
    res.json(players);
};

export const addPlayer = async (req: Request, res: Response) => {
    try {
        const { name, teamId, basePrice, category, fromWhere, photo, phoneNumber } = req.body || {};

        if (!name || basePrice === undefined || !category || !phoneNumber) {
            return res.status(400).json({ error: "Name, basePrice, category, and phoneNumber are required" });
        }

        const player = await prisma.player.create({
            data: {
                name,
                teamId: teamId ? Number(teamId) : null,
                basePrice: Number(basePrice),
                category,
                fromWhere: fromWhere || "",
                photo: photo || null,
                phoneNumber
            },
        });
        res.json(player);
    } catch (error) {
        console.error("Error creating player:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

export const editPlayer = async (req: Request, res: Response) => {
    try {
        const playerId = parseInt(req.params.id as string);
        const { name, teamId, basePrice, category, fromWhere, photo, phoneNumber } = req.body || {};

        if (!name || basePrice === undefined || !category || !phoneNumber) {
            return res.status(400).json({ error: "Name, basePrice, category, and phoneNumber are required" });
        }

        const player = await prisma.player.update({
            where: { id: playerId },
            data: {
                name,
                teamId: teamId ? Number(teamId) : null,
                basePrice: Number(basePrice),
                category,
                fromWhere: fromWhere || "",
                photo: photo || null,
                phoneNumber
            },
        });
        res.json(player);
    } catch (error) {
        console.error("Error updating player:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

export const deletePlayer = async (req: Request, res: Response) => {
    try {
        const playerId = parseInt(req.params.id as string);

        await prisma.player.delete({
            where: { id: playerId },
        });

        res.json({ message: "Player deleted successfully" });
    } catch (error) {
        console.error("Error deleting player:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};