import { prisma } from "../server";
import { Request, Response } from "express";

// Get all teams
export const getTeams = async (req: Request, res: Response) => {
    const teams = await prisma.team.findMany({
        include: { players: true },
    });
    res.json(teams);
};

// Add a new team
export const addTeam = async (req: Request, res: Response) => {
    try {
        const { name, purse, logo } = req.body || {};

        if (!name || purse === undefined || !logo) {
            return res.status(400).json({ error: "Name, purse, and logo are required" });
        }

        const purseInt = Number(purse);
        const team = await prisma.team.create({
            data: { name, purse: purseInt, logo },
        });
        res.json(team);
    } catch (error) {
        console.error("Error creating team:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

// Update a team
export const editTeam = async (req: Request, res: Response) => {
    try {
        const teamId = parseInt(req.params.id as string);
        const { name, purse, logo } = req.body || {};

        if (!name || purse === undefined || !logo) {
            return res.status(400).json({ error: "Name, purse, and logo are required" });
        }

        const purseInt = Number(purse);
        const updatedTeam = await prisma.team.update({
            where: { id: teamId },
            data: { name, purse: purseInt, logo },
        });

        res.json(updatedTeam);
    } catch (error) {
        console.error("Error updating team:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

// Delete a team
export const deleteTeam = async (req: Request, res: Response) => {
    try {
        const teamId = parseInt(req.params.id as string);

        // Delete related bids first if necessary, or let Prisma handle if cascade is set
        // For simplicity, we just delete the team and assume the user understands players will lose team link
        await prisma.team.delete({
            where: { id: teamId },
        });

        res.json({ message: "Team deleted successfully" });
    } catch (error) {
        console.error("Error deleting team:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};