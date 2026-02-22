import { prisma } from "../server";
import { Request, Response } from "express";

// Get top buyers by number of players
export const topBuyers = async (req: Request, res: Response) => {
    const result = await prisma.player.groupBy({
        by: ["teamId"],
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
        take: 5,
    });
    res.json(result);
};

// Get team's remaining purse
export const teamPurse = async (req: Request, res: Response) => {
    const teamId = parseInt(req.params.teamId as string);
    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team) return res.status(404).json({ message: "Team not found" });

    res.json({ teamId, purse: team.purse });
};