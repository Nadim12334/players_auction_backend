import { Request, Response } from "express";
import { prisma } from "../server";

const DEFAULT_WHATSAPP_TEMPLATE = `🏏 Congratulations {{playerName}}!

You have been selected in {{tournamentName}}.

🏆 Team
{{teamName}}

💰 Sold Amount
₹{{soldAmount}}

📂 Category
{{category}}

We wish you all the best for the tournament!

Thank you.`;

export const getSettings = async (req: Request, res: Response) => {
  try {
    const rawTarget = (req.query.tournamentId || req.query.slug || "").toString().trim();
    let tournament;

    if (rawTarget) {
      if (!isNaN(Number(rawTarget))) {
        tournament = await prisma.tournament.findUnique({
          where: { id: Number(rawTarget) },
        });
      } else {
        tournament = await prisma.tournament.findUnique({
          where: { slug: rawTarget.toLowerCase() },
        });
      }
    }

    if (!tournament) {
      tournament = await prisma.tournament.findFirst();
    }

    if (!tournament) {
      tournament = await prisma.tournament.create({
        data: {
          name: "Kudal Premier League",
          slug: "kudal-premier-league",
          logo: "",
          season: "Season 1",
          registrationOpen: true,
          whatsappTemplate: DEFAULT_WHATSAPP_TEMPLATE,
        },
      });
    }

    res.json({
      id: tournament.id,
      tournamentName: tournament.name,
      slug: tournament.slug,
      tournamentLogo: tournament.logo,
      season: tournament.season,
      status: tournament.status,
      registrationOpen: tournament.registrationOpen,
      whatsappTemplate: tournament.whatsappTemplate || DEFAULT_WHATSAPP_TEMPLATE,
      createdAt: tournament.createdAt,
      updatedAt: tournament.updatedAt,
    });
  } catch (error: any) {
    console.error("Error fetching settings:", error);
    res.status(500).json({ error: "Failed to fetch tournament settings" });
  }
};

export const updateSettings = async (req: Request, res: Response) => {
  try {
    const {
      tournamentId,
      tournamentName,
      name,
      slug,
      tournamentLogo,
      logo,
      season,
      status,
      registrationOpen,
      whatsappTemplate,
    } = req.body;

    const targetName = (tournamentName || name || "").trim();
    const tId = tournamentId ? Number(tournamentId) : undefined;

    let existing = tId
      ? await prisma.tournament.findUnique({ where: { id: tId } })
      : await prisma.tournament.findFirst();

    const cleanSlug = (slug || targetName || (existing ? existing.slug : ""))
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    let tournament;
    if (existing) {
      tournament = await prisma.tournament.update({
        where: { id: existing.id },
        data: {
          name: targetName || existing.name,
          slug: cleanSlug || existing.slug,
          logo: logo !== undefined ? logo : tournamentLogo !== undefined ? tournamentLogo : existing.logo,
          season: season !== undefined ? season.trim() : existing.season,
          status: status !== undefined ? status : existing.status,
          registrationOpen: registrationOpen !== undefined ? Boolean(registrationOpen) : existing.registrationOpen,
          whatsappTemplate: whatsappTemplate !== undefined ? whatsappTemplate : existing.whatsappTemplate,
        },
      });
    } else {
      tournament = await prisma.tournament.create({
        data: {
          name: targetName || "Kudal Premier League",
          slug: cleanSlug || "kudal-premier-league",
          logo: logo || tournamentLogo || "",
          season: season ? season.trim() : "Season 1",
          status: status || "NOT_STARTED",
          registrationOpen: registrationOpen !== undefined ? Boolean(registrationOpen) : true,
          whatsappTemplate: whatsappTemplate || DEFAULT_WHATSAPP_TEMPLATE,
        },
      });
    }

    res.json({
      message: "Tournament settings updated successfully",
      settings: {
        id: tournament.id,
        tournamentName: tournament.name,
        slug: tournament.slug,
        tournamentLogo: tournament.logo,
        season: tournament.season,
        status: tournament.status,
        registrationOpen: tournament.registrationOpen,
        whatsappTemplate: tournament.whatsappTemplate,
      },
    });
  } catch (error: any) {
    console.error("Error updating settings:", error);
    res.status(500).json({ error: "Failed to update tournament settings" });
  }
};
