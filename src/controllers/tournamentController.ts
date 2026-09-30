import { Request, Response } from "express";
import { prisma, tournamentAuctionStates, cleanupTournamentSocket } from "../server";
import { deleteTournamentPermanently } from "../services/tournamentCleanupService";

// 1. Get all tournaments with player, team, and bid counts + status filtering
export const getTournaments = async (req: Request, res: Response) => {
    try {
        const { status, excludeArchived } = req.query;

        const where: any = {};
        if (status) {
            const s = String(status).toUpperCase();
            if (s === "ACTIVE") {
                where.status = { in: ["ACTIVE", "LIVE", "NOT_STARTED"] };
            } else if (s === "COMPLETED") {
                where.status = "COMPLETED";
            } else if (s === "ARCHIVED") {
                where.status = "ARCHIVED";
            } else if (s !== "ALL") {
                where.status = s;
            }
        } else if (excludeArchived === "true") {
            where.status = { not: "ARCHIVED" };
        }

        const tournaments = await prisma.tournament.findMany({
            where,
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

        const formatted = tournaments.map((t) => {
            const inMem = tournamentAuctionStates.get(t.id);
            const isLive = t.status === "LIVE" || (inMem?.status === "BIDDING");

            return {
                id: t.id,
                name: t.name,
                tournamentName: t.name, // backward compatibility
                slug: t.slug,
                logo: t.logo,
                tournamentLogo: t.logo, // backward compatibility
                season: t.season,
                status: t.status,
                isLive,
                registrationOpen: t.registrationOpen,
                whatsappTemplate: t.whatsappTemplate,
                playersCount: t._count.players,
                teamsCount: t._count.teams,
                bidsCount: t._count.bids,
                createdAt: t.createdAt,
                updatedAt: t.updatedAt,
            };
        });

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

        const inMem = tournamentAuctionStates.get(tournament.id);
        const isLive = tournament.status === "LIVE" || (inMem?.status === "BIDDING");

        res.json({
            id: tournament.id,
            name: tournament.name,
            tournamentName: tournament.name,
            slug: tournament.slug,
            logo: tournament.logo,
            tournamentLogo: tournament.logo,
            season: tournament.season,
            status: tournament.status,
            isLive,
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
        const id = Number(req.params.id || req.params.tournamentId);
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

// 5. Archive Tournament: Sets status to ARCHIVED
export const archiveTournament = async (req: Request, res: Response) => {
    try {
        const id = Number(req.params.id || req.params.tournamentId);
        if (isNaN(id)) {
            return res.status(400).json({ error: "Invalid tournament ID" });
        }

        const existing = await prisma.tournament.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({ error: "Tournament not found" });
        }

        // Prevent archiving while an auction is actively LIVE
        const inMem = tournamentAuctionStates.get(id);
        if (existing.status === "LIVE" || inMem?.status === "BIDDING") {
            return res.status(400).json({
                error: "Cannot archive a live auction tournament. Complete or stop the auction first.",
            });
        }

        const updated = await prisma.tournament.update({
            where: { id },
            data: { status: "ARCHIVED" },
        });

        // Notify socket connections and reset auction state
        cleanupTournamentSocket(id, "archived");

        res.json({
            message: `Tournament '${updated.name}' has been archived successfully.`,
            tournament: updated,
        });
    } catch (error: any) {
        console.error("Error archiving tournament:", error);
        res.status(500).json({ error: error.message || "Failed to archive tournament" });
    }
};

// 6. Restore Tournament: Sets status from ARCHIVED to COMPLETED
export const restoreTournament = async (req: Request, res: Response) => {
    try {
        const id = Number(req.params.id || req.params.tournamentId);
        if (isNaN(id)) {
            return res.status(400).json({ error: "Invalid tournament ID" });
        }

        const existing = await prisma.tournament.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({ error: "Tournament not found" });
        }

        const updated = await prisma.tournament.update({
            where: { id },
            data: { status: "COMPLETED" },
        });

        res.json({
            message: `Tournament '${updated.name}' restored to Completed list successfully.`,
            tournament: updated,
        });
    } catch (error: any) {
        console.error("Error restoring tournament:", error);
        res.status(500).json({ error: error.message || "Failed to restore tournament" });
    }
};

// 7. Complete Tournament: Sets status to COMPLETED
export const completeTournament = async (req: Request, res: Response) => {
    try {
        const id = Number(req.params.id || req.params.tournamentId);
        if (isNaN(id)) {
            return res.status(400).json({ error: "Invalid tournament ID" });
        }

        const existing = await prisma.tournament.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({ error: "Tournament not found" });
        }

        const updated = await prisma.tournament.update({
            where: { id },
            data: { status: "COMPLETED" },
        });

        // Reset in-memory status
        const inMem = tournamentAuctionStates.get(id);
        if (inMem) {
            inMem.status = "IDLE";
            inMem.currentPlayerId = null;
        }

        res.json({
            message: `Tournament '${updated.name}' marked as COMPLETED.`,
            tournament: updated,
        });
    } catch (error: any) {
        console.error("Error completing tournament:", error);
        res.status(500).json({ error: error.message || "Failed to complete tournament" });
    }
};

// 8. Delete tournament PERMANENTLY (Atomic Prisma transaction + file cleanup + socket eviction)
export const deleteTournament = async (req: Request, res: Response) => {
    try {
        const id = Number(req.params.id || req.params.tournamentId);
        if (isNaN(id)) {
            return res.status(400).json({ error: "Invalid tournament ID" });
        }

        const result = await deleteTournamentPermanently(id);
        res.json(result);
    } catch (error: any) {
        console.error("Error deleting tournament permanently:", error);
        const status = error.statusCode || 500;
        res.status(status).json({ error: error.message || "Failed to permanently delete tournament" });
    }
};

// 9. Toggle Registration Open / Closed
export const toggleRegistration = async (req: Request, res: Response) => {
    try {
        const id = Number(req.params.id || req.params.tournamentId);
        if (isNaN(id)) {
            return res.status(400).json({ error: "Invalid tournament ID" });
        }

        const existing = await prisma.tournament.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({ error: "Tournament not found" });
        }

        const newStatus = req.body?.registrationOpen !== undefined
            ? Boolean(req.body.registrationOpen)
            : !existing.registrationOpen;

        const updated = await prisma.tournament.update({
            where: { id },
            data: { registrationOpen: newStatus },
        });

        res.json({
            message: `Player registration for '${updated.name}' is now ${updated.registrationOpen ? "OPEN" : "CLOSED"}.`,
            registrationOpen: updated.registrationOpen,
            tournament: updated,
        });
    } catch (error: any) {
        console.error("Error toggling registration:", error);
        res.status(500).json({ error: error.message || "Failed to toggle registration" });
    }
};