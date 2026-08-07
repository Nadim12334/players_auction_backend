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
    let settings = await prisma.tournamentSettings.findFirst();

    if (!settings) {
      settings = await prisma.tournamentSettings.create({
        data: {
          tournamentName: "Kudal Premier League",
          tournamentLogo: "",
          season: "Season 1",
          whatsappTemplate: DEFAULT_WHATSAPP_TEMPLATE,
        },
      });
    }

    res.json(settings);
  } catch (error: any) {
    console.error("Error fetching settings:", error);
    res.status(500).json({ error: "Failed to fetch tournament settings" });
  }
};

export const updateSettings = async (req: Request, res: Response) => {
  try {
    const { tournamentName, tournamentLogo, season, whatsappTemplate } = req.body;

    if (!tournamentName || !tournamentName.trim()) {
      return res.status(400).json({ error: "Tournament name is required." });
    }

    let existing = await prisma.tournamentSettings.findFirst();

    let settings;
    if (existing) {
      settings = await prisma.tournamentSettings.update({
        where: { id: existing.id },
        data: {
          tournamentName: tournamentName.trim(),
          tournamentLogo: tournamentLogo !== undefined ? tournamentLogo : existing.tournamentLogo,
          season: season !== undefined ? season.trim() : existing.season,
          whatsappTemplate: whatsappTemplate !== undefined ? whatsappTemplate : existing.whatsappTemplate,
        },
      });
    } else {
      settings = await prisma.tournamentSettings.create({
        data: {
          tournamentName: tournamentName.trim(),
          tournamentLogo: tournamentLogo || "",
          season: season ? season.trim() : "Season 1",
          whatsappTemplate: whatsappTemplate || DEFAULT_WHATSAPP_TEMPLATE,
        },
      });
    }

    res.json({
      message: "Tournament settings updated successfully",
      settings,
    });
  } catch (error: any) {
    console.error("Error updating settings:", error);
    res.status(500).json({ error: "Failed to update tournament settings" });
  }
};
