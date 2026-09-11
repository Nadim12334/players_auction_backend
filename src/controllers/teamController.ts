import { prisma } from "../server";
import { Request, Response } from "express";

// Get all teams (Filtered by tournamentId if provided)
export const getTeams = async (req: Request, res: Response) => {
    try {
        const rawTId = req.params.tournamentId || req.query.tournamentId;
        const where: any = {};
        if (rawTId) {
            where.tournamentId = Number(rawTId);
        }

        const teams = await prisma.team.findMany({
            where,
            include: { players: true },
            orderBy: { id: "asc" },
        });
        res.json(teams);
    } catch (error: any) {
        console.error("Error fetching teams:", error);
        res.status(500).json({ error: error.message || "Failed to fetch teams" });
    }
};

// Add a new team
export const addTeam = async (req: Request, res: Response) => {
    try {
        const { name, purse, logo, tournamentId } = req.body || {};

        if (!name || purse === undefined || !logo) {
            return res.status(400).json({ error: "Name, purse, and logo are required" });
        }

        const tId = Number(tournamentId || req.params.tournamentId || 1);

        const tournament = await prisma.tournament.findUnique({
            where: { id: tId },
        });

        if (!tournament) {
            return res.status(404).json({ error: `Tournament ID ${tId} does not exist` });
        }

        const purseInt = Number(purse);
        const team = await prisma.team.create({
            data: {
                tournamentId: tId,
                name,
                purse: purseInt,
                logo,
            },
            include: { players: true },
        });
        res.status(201).json(team);
    } catch (error: any) {
        console.error("Error creating team:", error);
        res.status(500).json({ error: error.message || "Internal server error" });
    }
};

// Update a team
export const editTeam = async (req: Request, res: Response) => {
    try {
        const teamId = parseInt(req.params.id as string);
        const { name, purse, logo, tournamentId } = req.body || {};

        if (!name || purse === undefined || !logo) {
            return res.status(400).json({ error: "Name, purse, and logo are required" });
        }

        const updateData: any = {
            name,
            purse: Number(purse),
            logo,
        };

        if (tournamentId) {
            updateData.tournamentId = Number(tournamentId);
        }

        const updatedTeam = await prisma.team.update({
            where: { id: teamId },
            data: updateData,
            include: { players: true },
        });

        res.json(updatedTeam);
    } catch (error: any) {
        console.error("Error updating team:", error);
        res.status(500).json({ error: error.message || "Internal server error" });
    }
};

// Delete a team
export const deleteTeam = async (req: Request, res: Response) => {
    try {
        const teamId = parseInt(req.params.id as string);

        await prisma.team.delete({
            where: { id: teamId },
        });

        res.json({ message: "Team deleted successfully" });
    } catch (error: any) {
        console.error("Error deleting team:", error);
        res.status(500).json({ error: error.message || "Internal server error" });
    }
};