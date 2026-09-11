import { prisma } from "../server";
import { Request, Response } from "express";

export const getPlayers = async (req: Request, res: Response) => {
    try {
        const rawTId = req.params.tournamentId || req.query.tournamentId;
        const where: any = {};
        if (rawTId) {
            where.tournamentId = Number(rawTId);
        }

        const players = await prisma.player.findMany({
            where,
            include: { team: true },
            orderBy: [{ queueOrder: "asc" }, { id: "asc" }],
        });
        res.json(players);
    } catch (error: any) {
        console.error("Error fetching players:", error);
        res.status(500).json({ error: error.message || "Failed to fetch players" });
    }
};

export const addPlayer = async (req: Request, res: Response) => {
    try {
        const {
            name,
            teamId,
            basePrice,
            category,
            fromWhere,
            photo,
            phoneNumber,
            tournamentId,
            queueOrder,
        } = req.body || {};

        if (!name || basePrice === undefined || !category || !phoneNumber) {
            return res.status(400).json({ error: "Name, basePrice, category, and phoneNumber are required" });
        }

        const tId = Number(tournamentId || req.params.tournamentId || 1);

        const player = await prisma.player.create({
            data: {
                tournamentId: tId,
                name,
                teamId: teamId ? Number(teamId) : null,
                basePrice: Number(basePrice),
                category,
                fromWhere: fromWhere || "",
                photo: photo || null,
                phoneNumber,
                queueOrder: queueOrder ? Number(queueOrder) : 0,
            },
            include: { team: true },
        });
        res.status(201).json(player);
    } catch (error: any) {
        console.error("Error creating player:", error);
        res.status(500).json({ error: error.message || "Internal server error" });
    }
};

export const editPlayer = async (req: Request, res: Response) => {
    try {
        const playerId = parseInt(req.params.id as string);
        const {
            name,
            teamId,
            basePrice,
            category,
            fromWhere,
            photo,
            phoneNumber,
            tournamentId,
            queueOrder,
        } = req.body || {};

        if (!name || basePrice === undefined || !category || !phoneNumber) {
            return res.status(400).json({ error: "Name, basePrice, category, and phoneNumber are required" });
        }

        const updateData: any = {
            name,
            teamId: teamId ? Number(teamId) : null,
            basePrice: Number(basePrice),
            category,
            fromWhere: fromWhere || "",
            photo: photo || null,
            phoneNumber,
        };

        if (tournamentId) {
            updateData.tournamentId = Number(tournamentId);
        }
        if (queueOrder !== undefined) {
            updateData.queueOrder = Number(queueOrder);
        }

        const player = await prisma.player.update({
            where: { id: playerId },
            data: updateData,
            include: { team: true },
        });
        res.json(player);
    } catch (error: any) {
        console.error("Error updating player:", error);
        res.status(500).json({ error: error.message || "Internal server error" });
    }
};

export const deletePlayer = async (req: Request, res: Response) => {
    try {
        const playerId = parseInt(req.params.id as string);

        await prisma.player.delete({
            where: { id: playerId },
        });

        res.json({ message: "Player deleted successfully" });
    } catch (error: any) {
        console.error("Error deleting player:", error);
        res.status(500).json({ error: error.message || "Internal server error" });
    }
};