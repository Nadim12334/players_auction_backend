import { Request, Response } from "express";
import {
    prisma,
    io,
    updateAuctionState,
    getTournamentAuctionState,
} from "../server";
import xlsx from "xlsx";

export const startAuction = async (req: Request, res: Response) => {
    const playerId = Number(req.params.playerId);
    const requestedTournamentId = req.params.tournamentId || req.body.tournamentId || req.query.tournamentId;

    const player = await prisma.player.findUnique({
        where: { id: playerId },
    });

    if (!player) {
        return res.status(404).json({ message: "Player not found" });
    }

    const tournamentId = requestedTournamentId ? Number(requestedTournamentId) : player.tournamentId;
    if (player.tournamentId !== tournamentId) {
        return res.status(400).json({
            message: `Player belongs to Tournament ${player.tournamentId}, not Tournament ${tournamentId}`,
        });
    }

    // Reset player state and clear bids for a clean manual start
    const updatedPlayer = await prisma.player.update({
        where: { id: playerId },
        data: {
            sold: false,
            status: "LIVE",
            teamId: null,
            currentBid: null,
        },
    });

    // Delete existing bids for this player
    await prisma.bid.deleteMany({
        where: { playerId },
    });

    updateAuctionState(tournamentId, { currentPlayerId: playerId, status: "BIDDING" });

    io.to(`auction_${tournamentId}`).emit("auctionStarted", { playerId });
    io.to(`auction_${tournamentId}`).emit("unsoldUpdated");

    res.json({
        message: "Auction started",
        player: updatedPlayer,
        tournamentId,
    });
};

export const sellPlayer = async (req: Request, res: Response) => {
    const playerId = Number(req.params.playerId);

    const p = await prisma.player.findUnique({
        where: { id: playerId },
    });

    if (!p) {
        return res.status(404).json({ message: "Player not found" });
    }

    if (!p.teamId) {
        return res.status(400).json({ message: "Cannot sell player without bids" });
    }

    const tournamentId = p.tournamentId;

    const player = await prisma.player.update({
        where: { id: playerId },
        data: {
            sold: true,
            status: "SOLD",
        },
    });

    updateAuctionState(tournamentId, { status: "SOLD" });

    io.to(`auction_${tournamentId}`).emit("playerSold", { playerId, sold: true });
    io.to(`auction_${tournamentId}`).emit("unsoldUpdated");

    res.json({
        message: "Player sold successfully",
        player,
        tournamentId,
    });
};

export const markUnsold = async (req: Request, res: Response) => {
    const playerId = Number(req.params.playerId);

    const p = await prisma.player.findUnique({
        where: { id: playerId },
    });

    if (!p) {
        return res.status(404).json({ message: "Player not found" });
    }

    const tournamentId = p.tournamentId;

    // Refund leading bidder if any
    if (p.teamId && p.currentBid) {
        await prisma.team.update({
            where: { id: p.teamId },
            data: { purse: { increment: p.currentBid } },
        });
    }

    // Delete any bids placed for this player
    await prisma.bid.deleteMany({
        where: { playerId },
    });

    const player = await prisma.player.update({
        where: { id: playerId },
        data: {
            sold: false,
            status: "UNSOLD",
            teamId: null,
            currentBid: null,
        },
    });

    updateAuctionState(tournamentId, { status: "UNSOLD" });

    io.to(`auction_${tournamentId}`).emit("playerSold", { playerId, sold: false });
    io.to(`auction_${tournamentId}`).emit("unsoldUpdated");

    res.json({
        message: "Player marked as unsold",
        player,
        tournamentId,
    });
};

export const nextPlayer = async (req: Request, res: Response) => {
    const tournamentId = Number(
        req.params.tournamentId || req.body.tournamentId || req.query.tournamentId || 1
    );

    // Find the first available player strictly in THIS tournament
    const player = await prisma.player.findFirst({
        where: {
            tournamentId,
            sold: false,
            status: "AVAILABLE",
        },
        orderBy: [
            { queueOrder: "asc" },
            { id: "asc" },
        ],
    });

    if (player) {
        // Reset player in database
        const updatedPlayer = await prisma.player.update({
            where: { id: player.id },
            data: {
                currentBid: null,
                teamId: null,
                sold: false,
                status: "LIVE",
            },
        });

        // Delete any bids placed for this player
        await prisma.bid.deleteMany({
            where: { playerId: player.id },
        });

        updateAuctionState(tournamentId, { currentPlayerId: player.id, status: "IDLE" });
        io.to(`auction_${tournamentId}`).emit("auctionNext", { playerId: player.id });
        io.to(`auction_${tournamentId}`).emit("unsoldUpdated");

        return res.json({
            message: "Next player loaded successfully",
            player: updatedPlayer,
            tournamentId,
        });
    } else {
        updateAuctionState(tournamentId, { currentPlayerId: null, status: "IDLE" });
        io.to(`auction_${tournamentId}`).emit("auctionNext", { playerId: null });

        return res.json({
            message: "No more unsold players left in this tournament",
            player: null,
            tournamentId,
        });
    }
};

// GET /api/admin/unsold-players
export const getUnsoldPlayers = async (req: Request, res: Response) => {
    try {
        const tournamentId = Number(
            req.params.tournamentId || req.query.tournamentId || 1
        );

        const players = await prisma.player.findMany({
            where: {
                tournamentId,
                OR: [
                    { status: "UNSOLD" },
                    { sold: true, teamId: null },
                ],
            },
            orderBy: { id: "desc" },
        });
        res.json(players);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

// POST /api/admin/unsold-players/:id/auction-now
export const auctionUnsoldNow = async (req: Request, res: Response) => {
    try {
        const id = Number(req.params.id);
        const player = await prisma.player.findUnique({ where: { id } });

        if (!player) {
            return res.status(404).json({ message: "Player not found" });
        }

        const tournamentId = player.tournamentId;

        // Reset player state & bids
        const updatedPlayer = await prisma.player.update({
            where: { id },
            data: {
                status: "LIVE",
                sold: false,
                teamId: null,
                currentBid: null,
            },
        });

        await prisma.bid.deleteMany({ where: { playerId: id } });

        updateAuctionState(tournamentId, { currentPlayerId: id, status: "BIDDING" });

        io.to(`auction_${tournamentId}`).emit("auctionStarted", { playerId: id });
        io.to(`auction_${tournamentId}`).emit("playerRecalled", { player: updatedPlayer, mode: "AUCTION_NOW" });
        io.to(`auction_${tournamentId}`).emit("unsoldUpdated");

        res.json({
            message: "Player loaded for auction now",
            player: updatedPlayer,
            tournamentId,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

// POST /api/admin/unsold-players/:id/move-to-end
export const moveUnsoldToEnd = async (req: Request, res: Response) => {
    try {
        const id = Number(req.params.id);
        const player = await prisma.player.findUnique({ where: { id } });

        if (!player) {
            return res.status(404).json({ message: "Player not found" });
        }

        const tournamentId = player.tournamentId;

        // Find highest queueOrder or id within THIS tournament
        const maxOrderResult = await prisma.player.aggregate({
            where: { tournamentId },
            _max: { queueOrder: true, id: true },
        });

        const currentMax = Math.max(
            maxOrderResult._max.queueOrder || 0,
            maxOrderResult._max.id || 0
        );

        const updatedPlayer = await prisma.player.update({
            where: { id },
            data: {
                status: "AVAILABLE",
                sold: false,
                teamId: null,
                currentBid: null,
                queueOrder: currentMax + 1,
            },
        });

        await prisma.bid.deleteMany({ where: { playerId: id } });

        io.to(`auction_${tournamentId}`).emit("playerRecalled", { player: updatedPlayer, mode: "MOVE_TO_END" });
        io.to(`auction_${tournamentId}`).emit("unsoldUpdated");

        res.json({
            message: "Player moved to end of auction queue",
            player: updatedPlayer,
            tournamentId,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

// DELETE /api/admin/unsold-players/:id
export const removeUnsoldPlayer = async (req: Request, res: Response) => {
    try {
        const id = Number(req.params.id);
        const player = await prisma.player.findUnique({ where: { id } });

        if (!player) {
            return res.status(404).json({ message: "Player not found" });
        }

        const tournamentId = player.tournamentId;
        const state = getTournamentAuctionState(tournamentId);

        if (state.currentPlayerId === id) {
            updateAuctionState(tournamentId, { currentPlayerId: null, status: "IDLE" });
        }

        await prisma.player.delete({ where: { id } });

        io.to(`auction_${tournamentId}`).emit("unsoldUpdated");

        res.json({ message: "Player permanently removed from tournament auction" });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const importPlayers = async (req: Request, res: Response) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded. Please upload an Excel or CSV file." });
        }

        const tournamentId = Number(
            req.params.tournamentId || req.body.tournamentId || req.query.tournamentId || 1
        );

        const targetTournament = await prisma.tournament.findUnique({
            where: { id: tournamentId },
        });

        if (!targetTournament) {
            return res.status(404).json({ error: `Tournament ID ${tournamentId} does not exist.` });
        }

        // Read the file buffer
        const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) {
            return res.status(400).json({ error: "The uploaded file has no sheets or is empty." });
        }

        // Parse sheets to JSON arrays
        const rawRows = xlsx.utils.sheet_to_json<any>(sheet, { defval: "" });

        let totalRows = 0;
        let imported = 0;
        let duplicates = 0;
        let invalidRows = 0;
        const errors: string[] = [];

        // Fetch existing phone numbers strictly for this tournament to prevent cross-tournament blocking
        const existingPlayers = await prisma.player.findMany({
            where: { tournamentId },
            select: { phoneNumber: true },
        });
        const existingPhones = new Set<string>();
        existingPlayers.forEach((p) => {
            if (p.phoneNumber) {
                existingPhones.add(p.phoneNumber.toString().trim());
            }
        });

        const seenInBatch = new Set<string>();

        // Process rows one by one
        for (let i = 0; i < rawRows.length; i++) {
            totalRows++;
            const row = rawRows[i];
            const rowNum = i + 2;

            let fullName: string = "";
            let mobileNumber: string = "";
            let category: string = "";
            let fromWhere: string = "";
            let photo: string = "";

            for (const key of Object.keys(row)) {
                const lowerKey = key.trim().toLowerCase();
                const val = row[key] !== undefined && row[key] !== null ? row[key].toString().trim() : "";

                if (lowerKey === "full name" || lowerKey === "name" || lowerKey === "player name" || lowerKey === "fullname") {
                    fullName = val;
                } else if (
                    lowerKey === "mobile number" ||
                    lowerKey === "mobile" ||
                    lowerKey === "phone" ||
                    lowerKey === "phone number" ||
                    lowerKey === "contact" ||
                    lowerKey === "contact number" ||
                    lowerKey === "phonenumber"
                ) {
                    mobileNumber = val;
                } else if (lowerKey === "category" || lowerKey === "player category") {
                    category = val;
                } else if (
                    lowerKey === "village / city (from where)" ||
                    lowerKey === "village / city" ||
                    lowerKey === "village" ||
                    lowerKey === "city" ||
                    lowerKey === "from where" ||
                    lowerKey === "fromwhere"
                ) {
                    fromWhere = val;
                } else if (lowerKey === "player photo" || lowerKey === "photo" || lowerKey === "image" || lowerKey === "player photo (optional)") {
                    photo = val;
                }
            }

            if (!fullName) {
                invalidRows++;
                errors.push(`Row ${rowNum}: 'Full Name' is missing.`);
                continue;
            }

            if (!mobileNumber) {
                invalidRows++;
                errors.push(`Row ${rowNum}: 'Mobile Number' is missing for player '${fullName}'.`);
                continue;
            }

            if (!category) {
                invalidRows++;
                errors.push(`Row ${rowNum}: 'Category' is missing for player '${fullName}'.`);
                continue;
            }

            if (!fromWhere) {
                invalidRows++;
                errors.push(`Row ${rowNum}: 'Village / City' is missing for player '${fullName}'.`);
                continue;
            }

            // Standardize categories
            const lowerCat = category.toLowerCase().replace(/[^a-z0-9]/g, "");
            let mappedCategory = "";
            if (lowerCat === "batsman" || lowerCat === "batsmen" || lowerCat === "bat") {
                mappedCategory = "Batsman";
            } else if (lowerCat === "bowler" || lowerCat === "bowlers" || lowerCat === "bowl") {
                mappedCategory = "Bowler";
            } else if (lowerCat === "allrounder" || lowerCat === "allrounders" || lowerCat === "all rounder" || lowerCat === "ar") {
                mappedCategory = "All-Rounder";
            } else if (lowerCat === "wicketkeeper" || lowerCat === "wicketkeepers" || lowerCat === "wk" || lowerCat === "keeper" || lowerCat === "wicket keeper") {
                mappedCategory = "Wicket Keeper";
            } else {
                if (lowerCat.includes("keeper")) {
                    mappedCategory = "Wicket Keeper";
                } else if (lowerCat.includes("round")) {
                    mappedCategory = "All-Rounder";
                } else if (lowerCat.includes("bat")) {
                    mappedCategory = "Batsman";
                } else if (lowerCat.includes("bowl")) {
                    mappedCategory = "Bowler";
                } else {
                    const standardCategories = ["Batsman", "Bowler", "All-Rounder", "Wicket Keeper"];
                    const found = standardCategories.find((c) => c.toLowerCase() === category.toLowerCase());
                    if (found) {
                        mappedCategory = found;
                    }
                }
            }

            if (!mappedCategory) {
                invalidRows++;
                errors.push(`Row ${rowNum}: Invalid Category '${category}' for player '${fullName}'.`);
                continue;
            }

            // Duplicate mobile check strictly within this tournament
            if (existingPhones.has(mobileNumber) || seenInBatch.has(mobileNumber)) {
                duplicates++;
                continue;
            }

            // Create player in database connected to this tournament
            try {
                await prisma.player.create({
                    data: {
                        tournamentId,
                        tournamentSlug: targetTournament.slug,
                        name: fullName,
                        phoneNumber: mobileNumber,
                        category: mappedCategory,
                        fromWhere: fromWhere,
                        photo: photo || null,
                        basePrice: 500,
                        sold: false,
                        teamId: null,
                        currentBid: null,
                    },
                });
                seenInBatch.add(mobileNumber);
                imported++;
            } catch (err: any) {
                invalidRows++;
                errors.push(`Row ${rowNum}: Database error for player '${fullName}': ${err.message || err}`);
            }
        }

        io.to(`auction_${tournamentId}`).emit("unsoldUpdated");

        res.json({
            tournamentId,
            tournamentName: targetTournament.name,
            totalRows,
            imported,
            duplicates,
            invalidRows,
            errors,
        });
    } catch (err: any) {
        console.error("Bulk Import error:", err);
        res.status(500).json({ error: err.message || "An unexpected error occurred during bulk import." });
    }
};

// Helper to resolve tournament by ID or Slug
export const resolveTournament = async (tournamentId?: any, slug?: any) => {
    const rawTarget = (tournamentId || slug || "").toString().trim();
    if (rawTarget) {
        if (!isNaN(Number(rawTarget))) {
            const byId = await prisma.tournament.findUnique({
                where: { id: Number(rawTarget) },
            });
            if (byId) return byId;
        }
        const bySlug = await prisma.tournament.findFirst({
            where: { slug: rawTarget.toLowerCase() },
        });
        if (bySlug) return bySlug;
    }
    // Fallback to first tournament in DB
    let defaultTournament = await prisma.tournament.findFirst();
    if (!defaultTournament) {
        defaultTournament = await prisma.tournament.create({
            data: {
                name: "Kudal Premier League",
                slug: "kudal-premier-league",
                season: "Season 1",
                registrationOpen: true,
                whatsappTemplate: "",
            },
        });
    }
    return defaultTournament;
};

// GET /api/admin/tournaments (or /api/tournaments)
export const getTournamentsList = async (req: Request, res: Response) => {
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

        res.json(
            tournaments.map((t) => ({
                id: t.id,
                name: t.name,
                tournamentName: t.name,
                slug: t.slug,
                logo: t.logo,
                tournamentLogo: t.logo,
                season: t.season,
                status: t.status,
                registrationOpen: t.registrationOpen,
                playersCount: t._count.players,
                teamsCount: t._count.teams,
                bidsCount: t._count.bids,
            }))
        );
    } catch (error: any) {
        console.error("Error fetching tournaments list:", error);
        res.status(500).json({ error: error.message || "Failed to fetch tournaments" });
    }
};

// GET /api/admin/export/players (Accepts tournamentId or slug)
export const exportPlayerRegistrationList = async (req: Request, res: Response) => {
    try {
        const { tournamentId, slug } = req.query;
        const tournament = await resolveTournament(tournamentId, slug);

        const players = await prisma.player.findMany({
            where: { tournamentId: tournament.id },
            orderBy: { id: "asc" },
        });

        const rows = players.map((p, index) => ({
            "Sr. No.": index + 1,
            "Registration Number": `REG-${String(p.id).padStart(4, "0")}`,
            "Player Name": p.name || "",
            "Mobile Number": p.phoneNumber || "N/A",
            "Village / From Where": p.fromWhere || "N/A",
            "Playing Category": p.category || "N/A",
            "Batting Style": (p as any).battingStyle || "N/A",
            "Bowling Style": (p as any).bowlingStyle || "N/A",
            "Age": (p as any).age !== undefined && (p as any).age !== null ? (p as any).age : "N/A",
            "Registration Status": p.status === "AVAILABLE" ? "Registered" : (p.status || "Registered"),
            "Payment Status": (p as any).paymentStatus || "Verified",
        }));

        const workbook = xlsx.utils.book_new();
        let worksheet;
        if (rows.length === 0) {
            worksheet = xlsx.utils.aoa_to_sheet([
                [
                    "Sr. No.",
                    "Registration Number",
                    "Player Name",
                    "Mobile Number",
                    "Village / From Where",
                    "Playing Category",
                    "Batting Style",
                    "Bowling Style",
                    "Age",
                    "Registration Status",
                    "Payment Status",
                ],
            ]);
        } else {
            worksheet = xlsx.utils.json_to_sheet(rows);
        }

        worksheet["!cols"] = [
            { wch: 8 },
            { wch: 20 },
            { wch: 26 },
            { wch: 16 },
            { wch: 24 },
            { wch: 18 },
            { wch: 15 },
            { wch: 15 },
            { wch: 10 },
            { wch: 20 },
            { wch: 16 },
        ];

        xlsx.utils.book_append_sheet(workbook, worksheet, "Player Registrations");

        const excelBuffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });

        const safeTournamentName = (tournament?.name || "Tournament")
            .replace(/[^a-zA-Z0-9_-]/g, "_")
            .replace(/_+/g, "_");
        const filename = `${safeTournamentName}_Player_Registration_List.xlsx`;

        res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");

        return res.send(excelBuffer);
    } catch (error: any) {
        console.error("Export players error:", error);
        res.status(500).json({ error: error.message || "Failed to generate Player Registration List Excel file." });
    }
};

// GET /api/admin/export/auction-results (Accepts tournamentId or slug)
export const exportAuctionResults = async (req: Request, res: Response) => {
    try {
        const { tournamentId, slug } = req.query;
        const tournament = await resolveTournament(tournamentId, slug);

        const players = await prisma.player.findMany({
            where: { tournamentId: tournament.id },
            include: { team: true },
            orderBy: { id: "asc" },
        });

        const rows = players.map((p, index) => {
            const isSold = Boolean(p.sold && p.teamId !== null && p.team);
            return {
                "Sr. No.": index + 1,
                "Registration Number": `REG-${String(p.id).padStart(4, "0")}`,
                "Player Name": p.name || "",
                "Village / From Where": p.fromWhere || "N/A",
                "Category": p.category || "N/A",
                "Base Price": p.basePrice || 0,
                "Auction Status": isSold ? "SOLD" : "UNSOLD",
                "Sold Team": isSold && p.team ? p.team.name : "",
                "Sold Price / Final Bid": isSold ? (p.currentBid ?? p.basePrice) : "",
            };
        });

        const workbook = xlsx.utils.book_new();
        let worksheet;
        if (rows.length === 0) {
            worksheet = xlsx.utils.aoa_to_sheet([
                [
                    "Sr. No.",
                    "Registration Number",
                    "Player Name",
                    "Village / From Where",
                    "Category",
                    "Base Price",
                    "Auction Status",
                    "Sold Team",
                    "Sold Price / Final Bid",
                ],
            ]);
        } else {
            worksheet = xlsx.utils.json_to_sheet(rows);
        }

        worksheet["!cols"] = [
            { wch: 8 },
            { wch: 20 },
            { wch: 26 },
            { wch: 24 },
            { wch: 18 },
            { wch: 14 },
            { wch: 16 },
            { wch: 24 },
            { wch: 22 },
        ];

        xlsx.utils.book_append_sheet(workbook, worksheet, "Auction Results");

        const excelBuffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });

        const safeTournamentName = (tournament?.name || "Tournament")
            .replace(/[^a-zA-Z0-9_-]/g, "_")
            .replace(/_+/g, "_");
        const filename = `${safeTournamentName}_Auction_Results.xlsx`;

        res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");

        return res.send(excelBuffer);
    } catch (error: any) {
        console.error("Export auction results error:", error);
        res.status(500).json({ error: error.message || "Failed to generate Auction Results Excel file." });
    }
};
