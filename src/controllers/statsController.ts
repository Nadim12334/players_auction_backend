import { prisma } from "../server";
import { Request, Response } from "express";

// Get top buyers by number of players (optionally scoped to tournament)
export const topBuyers = async (req: Request, res: Response) => {
    try {
        const rawTId = req.params.tournamentId || req.query.tournamentId;
        const where: any = { teamId: { not: null } };
        if (rawTId) {
            where.tournamentId = Number(rawTId);
        }

        const result = await prisma.player.groupBy({
            by: ["teamId"],
            where,
            _count: { id: true },
            orderBy: { _count: { id: "desc" } },
            take: 5,
        });

        // Enrich with team names
        const enriched = await Promise.all(
            result.map(async (item) => {
                const team = item.teamId
                    ? await prisma.team.findUnique({ where: { id: item.teamId } })
                    : null;
                return {
                    teamId: item.teamId,
                    teamName: team ? team.name : "Unknown Team",
                    count: item._count.id,
                };
            })
        );

        res.json(enriched);
    } catch (error: any) {
        console.error("Error fetching top buyers:", error);
        res.status(500).json({ error: error.message || "Failed to fetch top buyers" });
    }
};

// Get team's remaining purse
export const teamPurse = async (req: Request, res: Response) => {
    try {
        const teamId = parseInt(req.params.teamId as string);
        const team = await prisma.team.findUnique({ where: { id: teamId } });
        if (!team) return res.status(404).json({ message: "Team not found" });

        res.json({ teamId, purse: team.purse, tournamentId: team.tournamentId });
    } catch (error: any) {
        console.error("Error fetching team purse:", error);
        res.status(500).json({ error: error.message || "Failed to fetch team purse" });
    }
};