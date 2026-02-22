import { Request, Response } from "express";
import * as teamService from "../services/teamService";

export const getTeams = async (req: Request, res: Response) => {
    try {
        const teams = await teamService.getAllTeams();
        res.json(teams);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch teams" });
    }
};

export const createTeam = async (req: Request, res: Response) => {
    try {
        const team = await teamService.createTeam(req.body);
        res.status(201).json(team);
    } catch (error) {
        res.status(500).json({ error: "Failed to create team" });
    }
};
