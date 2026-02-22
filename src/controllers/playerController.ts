import { Request, Response } from "express";
import * as playerService from "../services/playerService";

// GET all players
export const getAllPlayers = async (req: Request, res: Response) => {
    try {
        const players = await playerService.getAllPlayers();
        res.json(players);
    } catch (error) {
        res.status(500).json({ error: "Something went wrong" });
    }
};

// POST add player
export const addPlayer = async (req: Request, res: Response) => {
    try {
        const player = await playerService.addPlayer(req.body);
        res.json(player);
    } catch (error) {
        console.error("Add player error:", error);
        res.status(500).json({ error: "Could not add player" });
    }
};