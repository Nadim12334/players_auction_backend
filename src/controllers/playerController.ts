import { prisma } from "../server";
import { Request, Response } from "express";

export const getPlayers = async (req: Request, res: Response) => {
    const players = await prisma.player.findMany();
    res.json(players);
};

export const addPlayer = async (req: Request, res: Response) => {
    const { name, teamId, basePrice, category, fromWhere } = req.body;
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
};