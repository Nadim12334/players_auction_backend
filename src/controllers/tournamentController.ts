import { Request, Response } from "express";
import { prisma, tournamentAuctionStates } from "../server";

// 1. Get all tournaments with player, team, and bid counts
export const getTournaments = async (req: Request, res: Response) => {
    try {
        const tournaments = await prisma.tournament.findMany({
            include: {
                _count: {
                    select: {
                        players: true,
                        teams: true,
                        bids: true,
                    },
                },
            },
            orderBy: { id: "asc" },
        });

        const formatted = tournaments.map((t) => ({
            id: t.id,
            name: t.name,
            tournamentName: t.name, // backward compatibility
            slug: t.slug,
            logo: t.logo,
            tournamentLogo: t.logo, // backward compatibility
            season: t.season,
            status: t.status,
            registrationOpen: t.registrationOpen,
            whatsappTemplate: t.whatsappTemplate,
            playersCount: t._count.players,
            teamsCount: t._count.teams,
            bidsCount: t._count.bids,
            createdAt: t.createdAt,
            updatedAt: t.updatedAt,
        }));

        res.json(formatted);
    } catch (error: any) {
        console.error("Error fetching tournaments:", error);
        res.status(500).json({ error: error.message || "Failed to fetch tournaments" });
    }
};

// 2. Get single tournament by ID or slug
export const getTournamentById = async (req: Request, res: Response) => {
    try {
        const param = String(req.params.id);
        const isNumeric = !isNaN(Number(param));

        const tournament = isNumeric
            ? await prisma.tournament.findUnique({
                  where: { id: Number(param) },
                  include: {
                      _count: {
                          select: {
                              players: true,
                              teams: true,
                              bids: true,
                          },
                      },
                  },
              })
            : await prisma.tournament.findUnique({
                  where: { slug: param.toLowerCase() },
                  include: {
                      _count: {
                          select: {
                              players: true,
                              teams: true,
                              bids: true,
                          },
                      },
                  },
              });

        if (!tournament) {
            return res.status(404).json({ error: "Tournament not found" });
        }

        res.json({
            id: tournament.id,
            name: tournament.name,
            tournamentName: tournament.name,
            slug: tournament.slug,
            logo: tournament.logo,
            tournamentLogo: tournament.logo,
            season: tournament.season,
            status: tournament.status,
            registrationOpen: tournament.registrationOpen,
            whatsappTemplate: tournament.whatsappTemplate,
            playersCount: tournament._count.players,
            teamsCount: tournament._count.teams,
            bidsCount: tournament._count.bids,
            createdAt: tournament.createdAt,
            updatedAt: tournament.updatedAt,
        });
    } catch (error: any) {
        console.error("Error fetching tournament:", error);
        res.status(500).json({ error: error.message || "Failed to fetch tournament" });
    }
};

// 3. Create a new tournament
export const createTournament = async (req: Request, res: Response) => {
    try {
        const {
            name,
            tournamentName,
            slug,
            logo,
            tournamentLogo,
            season,
            status,
            registrationOpen,
            whatsappTemplate,
        } = req.body;

        const targetName = (name || tournamentName || "").trim();
        if (!targetName) {
            return res.status(400).json({ error: "Tournament name is required" });
        }

        let cleanSlug = (slug || targetName)
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");

        // Ensure unique slug
        let uniqueSlug = cleanSlug;
        let counter = 1;
        while (await prisma.tournament.findUnique({ where: { slug: uniqueSlug } })) {
            uniqueSlug = `${cleanSlug}-${counter}`;
            counter++;
        }

        const newTournament = await prisma.tournament.create({
            data: {
                name: targetName,
                slug: uniqueSlug,
                logo: logo || tournamentLogo || null,
                season: season ? season.trim() : "Season 1",
                status: status || "NOT_STARTED",
                registrationOpen: registrationOpen !== undefined ? Boolean(registrationOpen) : true,
                whatsappTemplate: whatsappTemplate || "",
            },
        });

        res.status(201).json({
            message: "Tournament created successfully",
            tournament: {
                ...newTournament,
                tournamentName: newTournament.name,
                tournamentLogo: newTournament.logo,
            },
        });
    } catch (error: any) {
        console.error("Error creating tournament:", error);
        res.status(500).json({ error: error.message || "Failed to create tournament" });
    }
};

// 4. Update tournament details and status
export const updateTournament = async (req: Request, res: Response) => {
    try {
        const id = Number(req.params.id);
        if (isNaN(id)) {
            return res.status(400).json({ error: "Invalid tournament ID" });
        }

        const existing = await prisma.tournament.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({ error: "Tournament not found" });
        }

        const {
            name,
            tournamentName,
            slug,
            logo,
            tournamentLogo,
            season,
            status,
            registrationOpen,
            whatsappTemplate,
        } = req.body;

        const updatedData: any = {};
        if (name || tournamentName) {
            updatedData.name = (name || tournamentName).trim();
        }
        if (slug) {
            const cleanSlug = slug
                .toLowerCase()
                .trim()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-+|-+$/g, "");
            if (cleanSlug !== existing.slug) {
                const slugConflict = await prisma.tournament.findUnique({ where: { slug: cleanSlug } });
                if (slugConflict && slugConflict.id !== id) {
                    return res.status(400).json({ error: "Slug is already taken by another tournament" });
                }
                updatedData.slug = cleanSlug;
            }
        }
        if (logo !== undefined || tournamentLogo !== undefined) {
            updatedData.logo = logo !== undefined ? logo : tournamentLogo;
        }
        if (season !== undefined) {
            updatedData.season = season.trim();
        }
        if (status !== undefined) {
            updatedData.status = status;
        }
        if (registrationOpen !== undefined) {
            updatedData.registrationOpen = Boolean(registrationOpen);
        }
        if (whatsappTemplate !== undefined) {
            updatedData.whatsappTemplate = whatsappTemplate;
        }

        const updated = await prisma.tournament.update({
            where: { id },
            data: updatedData,
        });

        res.json({
            message: "Tournament updated successfully",
            tournament: {
                ...updated,
                tournamentName: updated.name,
                tournamentLogo: updated.logo,
            },
        });
    } catch (error: any) {
        console.error("Error updating tournament:", error);
        res.status(500).json({ error: error.message || "Failed to update tournament" });
    }
};

// 5. Delete tournament and CASCADE delete all related players, teams, and bids
export const deleteTournament = async (req: Request, res: Response) => {
    try {
        const id = Number(req.params.id);
        if (isNaN(id)) {
            return res.status(400).json({ error: "Invalid tournament ID" });
        }

        const existing = await prisma.tournament.findUnique({
            where: { id },
            include: {
                _count: {
                    select: {
                        players: true,
                        teams: true,
                        bids: true,
                    },
                },
            },
        });

        if (!existing) {
            return res.status(404).json({ error: "Tournament not found" });
        }

        // Delete tournament record (Cascade in MySQL/Prisma deletes players, teams, bids)
        await prisma.tournament.delete({
            where: { id },
        });

        // Clean up in-memory auction state
        tournamentAuctionStates.delete(id);

        res.json({
            message: `Tournament '${existing.name}' and all its associated data (${existing._count.players} players, ${existing._count.teams} teams, ${existing._count.bids} bids) have been deleted successfully.`,
        });
    } catch (error: any) {
        console.error("Error deleting tournament:", error);
        res.status(500).json({ error: error.message || "Failed to delete tournament" });
    }
};
