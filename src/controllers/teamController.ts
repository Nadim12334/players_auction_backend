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
    const { name, purse } = req.body || {};
    console.log("BODY:", req.body);

    if (!name || !purse) {
        return res.status(400).json({ error: "Name and purse are required" });
    }

    const purseInt = parseInt(purse);
    const team = await prisma.team.create({
        data: { name, purse: purseInt },
    });
    res.json(team);
};

// Update team purse
export const updateTeamPurse = async (req: Request, res: Response) => {
    const teamId = parseInt(req.params.id as string);
    const { purse } = req.body || {};

    if (purse === undefined) {
        return res.status(400).json({ error: "Purse is required" });
    }

    const purseInt = parseInt(purse);

    const updatedTeam = await prisma.team.update({
        where: { id: teamId },
        data: { purse: purseInt },
    });

    res.json(updatedTeam);
};