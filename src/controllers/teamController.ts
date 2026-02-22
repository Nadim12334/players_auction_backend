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
    const { name, purse } = req.body;
    const team = await prisma.team.create({
        data: { name, purse },
    });
    res.json(team);
};

// Update team purse
export const updateTeamPurse = async (req: Request, res: Response) => {
    const teamId = parseInt(req.params.id as string);
    const { purse } = req.body;

    const updatedTeam = await prisma.team.update({
        where: { id: teamId },
        data: { purse },
    });

    res.json(updatedTeam);
};