import { prisma } from "../server";
import { Request, Response } from "express";
import multer from "multer";
import fsSync from "fs";
import pathLib from "path";

// ============================================================
// Multer Storage - Stores team logos under uploads/tournaments/:tId/teams/
// ============================================================
const teamLogoStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const tId = req.params.tournamentId || req.body.tournamentId || "misc";
        const dir = pathLib.join(process.cwd(), "uploads", "tournaments", String(tId), "teams");
        fsSync.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = pathLib.extname(file.originalname).toLowerCase();
        cb(null, `team-logo-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    },
});

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

const fileFilter = (
    req: Request,
    file: Express.Multer.File,
    cb: multer.FileFilterCallback
) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error("INVALID_TYPE"));
    }
};

export const teamLogoUpload = multer({
    storage: teamLogoStorage,
    fileFilter,
    limits: { fileSize: MAX_FILE_SIZE_BYTES },
});

// ============================================================
// Helper: Build the public URL path for a logo file
// ============================================================
function buildLogoPath(tId: number | string, filename: string): string {
    return `/uploads/tournaments/${tId}/teams/${filename}`;
}

// ============================================================
// Helper: Safely delete a file if it exists under uploads/
// ============================================================
function safeDeleteLogo(logoPath: string | null) {
    if (!logoPath) return;
    try {
        // Only delete relative paths that start with /uploads/
        if (!logoPath.startsWith("/uploads/")) return;
        const absPath = pathLib.join(process.cwd(), logoPath.replace(/^\//, ""));
        if (fsSync.existsSync(absPath)) {
            fsSync.unlinkSync(absPath);
        }
    } catch (e) {
        // Non-fatal: log but don't crash
        console.warn("Could not delete old logo:", logoPath, e);
    }
}

// ============================================================
// GET /api/tournaments/:tournamentId/teams  (or /api/teams)
// ============================================================
export const getTeams = async (req: Request, res: Response) => {
    try {
        const rawTId = req.params.tournamentId || req.query.tournamentId;
        const where: any = {};
        if (rawTId) {
            where.tournamentId = Number(rawTId);
        }

        const teams = await prisma.team.findMany({
            where,
            include: { players: true },
            orderBy: { id: "asc" },
        });
        res.json(teams);
    } catch (error: any) {
        console.error("Error fetching teams:", error);
        res.status(500).json({ error: error.message || "Failed to fetch teams" });
    }
};

// ============================================================
// POST /api/tournaments/:tournamentId/teams
// Accepts: multipart/form-data with optional logo file
// ============================================================
export const addTeam = async (req: Request, res: Response) => {
    try {
        // 1. Get and strictly validate tournamentId from route params
        const rawTId = req.params.tournamentId;
        if (!rawTId) {
            return res.status(400).json({ error: "Valid tournamentId is required" });
        }
        const tId = Number(rawTId);
        if (isNaN(tId) || tId <= 0) {
            return res.status(400).json({ error: "Valid tournamentId is required" });
        }

        // 2. Verify tournament exists
        const tournament = await prisma.tournament.findUnique({ where: { id: tId } });
        if (!tournament) {
            return res.status(404).json({ error: `Tournament ID ${tId} does not exist` });
        }

        // 3. Extract and validate name
        const cleanName = String(req.body.name || "").trim();
        if (!cleanName) {
            return res.status(400).json({ error: "Team name is required" });
        }

        // 4. Extract and validate purse
        const purse = req.body.purse;
        if (purse === undefined || purse === null || purse === "") {
            return res.status(400).json({ error: "Purse is required" });
        }
        const purseInt = Number(purse);
        if (isNaN(purseInt) || purseInt < 0) {
            return res.status(400).json({ error: "Purse must be a valid non-negative number" });
        }

        // 5. Determine logo path (optional)
        let logoPath: string | null = null;
        if (req.file) {
            logoPath = buildLogoPath(tId, req.file.filename);
        }

        // 6. Create team
        const team = await prisma.team.create({
            data: {
                tournamentId: tId,
                name: cleanName,
                purse: purseInt,
                logo: logoPath,
            },
            include: { players: true },
        });

        res.status(201).json(team);
    } catch (error: any) {
        console.error("Error creating team:", error);
        res.status(500).json({ error: error.message || "Internal server error" });
    }
};

// ============================================================
// PUT /api/teams/:id  (or /api/tournaments/:tournamentId/teams/:teamId)
// Accepts: multipart/form-data with optional NEW logo file
// ============================================================
export const editTeam = async (req: Request, res: Response) => {
    try {
        const teamId = parseInt(req.params.id as string);
        if (isNaN(teamId) || teamId <= 0) {
            return res.status(400).json({ error: "Valid team ID is required" });
        }

        // Fetch existing team so we can preserve / replace logo safely
        const existingTeam = await prisma.team.findUnique({ where: { id: teamId } });
        if (!existingTeam) {
            return res.status(404).json({ error: "Team not found" });
        }

        // Validate name
        const cleanName = String(req.body.name || "").trim();
        if (!cleanName) {
            return res.status(400).json({ error: "Team name is required" });
        }

        // Validate purse
        const purse = req.body.purse;
        if (purse === undefined || purse === null || purse === "") {
            return res.status(400).json({ error: "Purse is required" });
        }
        const purseInt = Number(purse);
        if (isNaN(purseInt) || purseInt < 0) {
            return res.status(400).json({ error: "Purse must be a valid non-negative number" });
        }

        // Determine logo path:
        // - If new file uploaded -> use new file, delete old file
        // - If removeLogo=true in body -> set null, delete old file
        // - Otherwise keep existing logo
        let logoPath: string | null | undefined = undefined; // undefined = no change
        if (req.file) {
            // New logo uploaded
            const tId = existingTeam.tournamentId;
            logoPath = buildLogoPath(tId, req.file.filename);
            // Delete old logo
            safeDeleteLogo(existingTeam.logo);
        } else if (req.body.removeLogo === "true" || req.body.removeLogo === true) {
            logoPath = null;
            safeDeleteLogo(existingTeam.logo);
        }
        // else: logoPath remains undefined -> don't change

        const updateData: any = {
            name: cleanName,
            purse: purseInt,
        };
        if (logoPath !== undefined) {
            updateData.logo = logoPath;
        }

        if (req.body.tournamentId) {
            updateData.tournamentId = Number(req.body.tournamentId);
        }

        const updatedTeam = await prisma.team.update({
            where: { id: teamId },
            data: updateData,
            include: { players: true },
        });

        res.json(updatedTeam);
    } catch (error: any) {
        console.error("Error updating team:", error);
        res.status(500).json({ error: error.message || "Internal server error" });
    }
};

// ============================================================
// DELETE /api/teams/:id
// Also cleans up the team's logo file if stored under /uploads/
// ============================================================
export const deleteTeam = async (req: Request, res: Response) => {
    try {
        const teamId = parseInt(req.params.id as string);
        if (isNaN(teamId) || teamId <= 0) {
            return res.status(400).json({ error: "Valid team ID is required" });
        }

        const team = await prisma.team.findUnique({ where: { id: teamId } });
        if (!team) {
            return res.status(404).json({ error: "Team not found" });
        }

        await prisma.team.delete({ where: { id: teamId } });

        // Clean up logo file after successful DB deletion
        safeDeleteLogo(team.logo);

        res.json({ message: "Team deleted successfully" });
    } catch (error: any) {
        console.error("Error deleting team:", error);
        res.status(500).json({ error: error.message || "Internal server error" });
    }
};
