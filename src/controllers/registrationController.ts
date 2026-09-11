import { Request, Response } from "express";
import { prisma, io } from "../server";
import fs from "fs";
import path from "path";

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(process.cwd(), "uploads", "players");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// 1. Get Public Tournament Details for Registration Page
export const getPublicTournamentInfo = async (req: Request, res: Response) => {
  try {
    const rawSlug = (String(req.params.slug || req.query.slug || "kudal-premier-league")).toLowerCase();

    let tournament = await prisma.tournament.findUnique({
      where: { slug: rawSlug },
    });

    if (!tournament) {
      tournament = await prisma.tournament.findFirst();
    }

    if (!tournament) {
      return res.status(404).json({ error: "Tournament not found" });
    }

    res.json({
      id: tournament.id,
      tournamentName: tournament.name,
      tournamentLogo: tournament.logo,
      season: tournament.season,
      registrationOpen: tournament.registrationOpen,
      slug: tournament.slug,
      status: tournament.status,
    });
  } catch (error) {
    console.error("Error fetching tournament info:", error);
    res.status(500).json({ error: "Failed to fetch tournament information" });
  }
};

// 2. Public Player Registration API
export const registerPlayer = async (req: Request, res: Response) => {
  try {
    const { name, phoneNumber, category, fromWhere, tournamentSlug, tournamentId, photo: base64Photo } = req.body;
    const targetSlug = (tournamentSlug || req.params.slug || "").toLowerCase();

    let targetTournament;
    if (tournamentId) {
      targetTournament = await prisma.tournament.findUnique({
        where: { id: Number(tournamentId) },
      });
    } else if (targetSlug) {
      targetTournament = await prisma.tournament.findUnique({
        where: { slug: targetSlug },
      });
    }

    if (!targetTournament) {
      targetTournament = await prisma.tournament.findFirst();
    }

    if (!targetTournament) {
      return res.status(404).json({ error: "Tournament not found" });
    }

    if (!targetTournament.registrationOpen) {
      return res.status(403).json({ error: "Player registration is currently closed for this tournament." });
    }

    // Validate Mandatory Fields
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Full Name is required." });
    }

    const cleanPhone = (phoneNumber || "").trim().replace(/[^0-9]/g, "");
    if (!cleanPhone || cleanPhone.length !== 10) {
      return res.status(400).json({ error: "Mobile number must be exactly 10 digits." });
    }

    if (!category || !category.trim()) {
      return res.status(400).json({ error: "Category is required." });
    }

    if (!fromWhere || !fromWhere.trim()) {
      return res.status(400).json({ error: "Village / City is required." });
    }

    // Process Photo File (Multer file upload or Base64 string)
    let photoPath = "";
    if (req.file) {
      photoPath = `/uploads/players/${req.file.filename}`;
    } else if (base64Photo && base64Photo.startsWith("data:image/")) {
      const matches = base64Photo.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const ext = matches[1] === "jpeg" ? "jpg" : matches[1];
        const fileName = `player-${Date.now()}-${Math.round(Math.random() * 1e9)}.${ext}`;
        const filePath = path.join(UPLOADS_DIR, fileName);
        fs.writeFileSync(filePath, Buffer.from(matches[2], "base64"));
        photoPath = `/uploads/players/${fileName}`;
      } else {
        photoPath = base64Photo;
      }
    } else {
      photoPath = base64Photo || "";
    }

    if (!photoPath) {
      return res.status(400).json({ error: "Player Photo is required." });
    }

    // Prevent duplicate mobile registrations strictly within this tournament
    const existingPlayer = await prisma.player.findFirst({
      where: {
        phoneNumber: cleanPhone,
        tournamentId: targetTournament.id,
      },
    });

    if (existingPlayer) {
      return res.status(400).json({
        error: "This mobile number is already registered for this tournament.",
      });
    }

    // Create player record
    const newPlayer = await prisma.player.create({
      data: {
        tournamentId: targetTournament.id,
        tournamentSlug: targetTournament.slug,
        name: name.trim(),
        phoneNumber: cleanPhone,
        category: category.trim(),
        fromWhere: fromWhere.trim(),
        photo: photoPath,
        basePrice: 500,
        sold: false,
        status: "AVAILABLE",
      },
    });

    // Real-time socket broadcast isolated to the tournament room
    io.to(`auction_${targetTournament.id}`).emit("playerRegistered", newPlayer);
    io.to(`auction_${targetTournament.id}`).emit("unsoldUpdated");

    res.status(201).json({
      success: true,
      message: "Registration completed successfully",
      player: newPlayer,
    });
  } catch (error: any) {
    console.error("Error registering player:", error);
    res.status(500).json({ error: error.message || "Failed to complete player registration." });
  }
};

// 3. Admin: Get all registrations with search and filter
export const getRegistrations = async (req: Request, res: Response) => {
  try {
    const { search, category, village, tournamentSlug, tournamentId } = req.query;

    const where: any = {};

    if (tournamentId) {
      where.tournamentId = Number(tournamentId);
    } else if (tournamentSlug) {
      where.tournamentSlug = (tournamentSlug as string).toLowerCase();
    }

    if (category && category !== "ALL") {
      where.category = category as string;
    }

    if (village && village !== "ALL") {
      where.fromWhere = { contains: village as string };
    }

    if (search) {
      const queryStr = (search as string).trim();
      where.OR = [
        { name: { contains: queryStr } },
        { phoneNumber: { contains: queryStr } },
        { fromWhere: { contains: queryStr } },
      ];
    }

    const players = await prisma.player.findMany({
      where,
      include: { team: true },
      orderBy: { id: "desc" },
    });

    res.json(players);
  } catch (error) {
    console.error("Error fetching registrations:", error);
    res.status(500).json({ error: "Failed to fetch registrations" });
  }
};

// 4. Admin: Get player detail by ID
export const getRegistrationById = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const player = await prisma.player.findUnique({
      where: { id },
      include: { team: true },
    });

    if (!player) {
      return res.status(404).json({ error: "Player not found" });
    }

    res.json(player);
  } catch (error) {
    console.error("Error fetching player:", error);
    res.status(500).json({ error: "Failed to fetch player" });
  }
};

// 5. Admin: Update player registration detail
export const updateRegistration = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { name, phoneNumber, category, fromWhere, photo, basePrice } = req.body;

    const existing = await prisma.player.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: "Player not found" });
    }

    const updatedPlayer = await prisma.player.update({
      where: { id },
      data: {
        name: name ? name.trim() : undefined,
        phoneNumber: phoneNumber ? phoneNumber.trim() : undefined,
        category: category ? category.trim() : undefined,
        fromWhere: fromWhere ? fromWhere.trim() : undefined,
        photo: photo !== undefined ? photo : undefined,
        basePrice: basePrice !== undefined ? Number(basePrice) : undefined,
      },
      include: { team: true },
    });

    io.to(`auction_${existing.tournamentId}`).emit("unsoldUpdated");
    res.json({ message: "Player updated successfully", player: updatedPlayer });
  } catch (error) {
    console.error("Error updating player:", error);
    res.status(500).json({ error: "Failed to update player" });
  }
};

// 6. Admin: Delete player registration
export const deleteRegistration = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.player.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: "Player not found" });
    }

    await prisma.player.delete({
      where: { id },
    });

    io.to(`auction_${existing.tournamentId}`).emit("unsoldUpdated");
    res.json({ message: "Player deleted successfully" });
  } catch (error) {
    console.error("Error deleting player:", error);
    res.status(500).json({ error: "Failed to delete player" });
  }
};
