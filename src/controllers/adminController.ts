import { Request, Response } from "express";
import { prisma, io, updateAuctionState, auctionState } from "../server";
import xlsx from "xlsx";

export const startAuction = async (req: Request, res: Response) => {
    const playerId = Number(req.params.playerId);

    const player = await prisma.player.findUnique({
        where: { id: playerId },
    });

    if (!player) {
        return res.status(404).json({ message: "Player not found" });
    }

    // Reset player state and clear bids for a clean manual start if restarting
    const updatedPlayer = await prisma.player.update({
        where: { id: playerId },
        data: {
            sold: false,
            status: "LIVE",
            teamId: null,
            currentBid: null,
        },
    });

    // Delete existing bids for this player so history starts fresh
    await prisma.bid.deleteMany({
        where: { playerId },
    });

    updateAuctionState({ currentPlayerId: playerId, status: "BIDDING" });

    io.emit("auctionStarted", { playerId });
    io.emit("unsoldUpdated");

    res.json({
        message: "Auction started",
        player: updatedPlayer,
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

    const player = await prisma.player.update({
        where: { id: playerId },
        data: {
            sold: true,
            status: "SOLD",
        },
    });

    updateAuctionState({ status: "SOLD" });

    io.emit("playerSold", { playerId, sold: true });
    io.emit("unsoldUpdated");

    res.json({
        message: "Player sold successfully",
        player,
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

    // If there was a bid, we need to refund the purse
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

    updateAuctionState({ status: "UNSOLD" });

    io.emit("playerSold", { playerId, sold: false });
    io.emit("unsoldUpdated");

    res.json({
        message: "Player marked as unsold",
        player,
    });
};

export const nextPlayer = async (req: Request, res: Response) => {
    // Find the first available player in the database
    const player = await prisma.player.findFirst({
        where: {
            sold: false,
            status: "AVAILABLE",
        },
        orderBy: [
            { queueOrder: "asc" },
            { id: "asc" }
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
            }
        });

        // Delete any bids placed for this player
        await prisma.bid.deleteMany({
            where: { playerId: player.id },
        });

        updateAuctionState({ currentPlayerId: player.id, status: "IDLE" });
        io.emit("auctionNext", { playerId: player.id });
        io.emit("unsoldUpdated");

        return res.json({
            message: "Next player loaded successfully",
            player: updatedPlayer,
        });
    } else {
        updateAuctionState({ currentPlayerId: null, status: "IDLE" });
        io.emit("auctionNext", { playerId: null });

        return res.json({
            message: "No more unsold players left",
            player: null,
        });
    }
};

// GET /api/admin/unsold-players
export const getUnsoldPlayers = async (req: Request, res: Response) => {
    try {
        const players = await prisma.player.findMany({
            where: {
                OR: [
                    { status: "UNSOLD" },
                    { sold: true, teamId: null }
                ]
            },
            orderBy: { id: "desc" }
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

        // Reset player state & bids
        const updatedPlayer = await prisma.player.update({
            where: { id },
            data: {
                status: "LIVE",
                sold: false,
                teamId: null,
                currentBid: null,
            }
        });

        await prisma.bid.deleteMany({ where: { playerId: id } });

        updateAuctionState({ currentPlayerId: id, status: "BIDDING" });

        io.emit("auctionStarted", { playerId: id });
        io.emit("playerRecalled", { player: updatedPlayer, mode: "AUCTION_NOW" });
        io.emit("unsoldUpdated");

        res.json({
            message: "Player loaded for auction now",
            player: updatedPlayer
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

        // Find highest queueOrder or id
        const maxOrderResult = await prisma.player.aggregate({
            _max: { queueOrder: true }
        });
        const maxIdResult = await prisma.player.aggregate({
            _max: { id: true }
        });
        const currentMax = Math.max(
            maxOrderResult._max.queueOrder || 0,
            maxIdResult._max.id || 0
        );

        const updatedPlayer = await prisma.player.update({
            where: { id },
            data: {
                status: "AVAILABLE",
                sold: false,
                teamId: null,
                currentBid: null,
                queueOrder: currentMax + 1
            }
        });

        await prisma.bid.deleteMany({ where: { playerId: id } });

        io.emit("playerRecalled", { player: updatedPlayer, mode: "MOVE_TO_END" });
        io.emit("unsoldUpdated");

        res.json({
            message: "Player moved to end of auction queue",
            player: updatedPlayer
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

        if (auctionState.currentPlayerId === id) {
            updateAuctionState({ currentPlayerId: null, status: "IDLE" });
        }

        await prisma.player.delete({ where: { id } });

        io.emit("unsoldUpdated");

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

        // Fetch all existing phone numbers to prevent duplicates (O(1) lookup)
        const existingPlayers = await prisma.player.findMany({
            select: { phoneNumber: true },
        });
        const existingPhones = new Set<string>();
        existingPlayers.forEach(p => {
            if (p.phoneNumber) {
                existingPhones.add(p.phoneNumber.toString().trim());
            }
        });

        const seenInBatch = new Set<string>();

        // Process rows one by one
        for (let i = 0; i < rawRows.length; i++) {
            totalRows++;
            const row = rawRows[i];
            const rowNum = i + 2; // Row number in Excel is 1-indexed with headers at row 1

            // Find columns case-insensitively
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
                } else if (lowerKey === "mobile number" || lowerKey === "mobile" || lowerKey === "phone" || lowerKey === "phone number" || lowerKey === "contact" || lowerKey === "contact number" || lowerKey === "phonenumber") {
                    mobileNumber = val;
                } else if (lowerKey === "category" || lowerKey === "player category") {
                    category = val;
                } else if (lowerKey === "village / city (from where)" || lowerKey === "village / city" || lowerKey === "village" || lowerKey === "city" || lowerKey === "from where" || lowerKey === "fromwhere") {
                    fromWhere = val;
                } else if (lowerKey === "player photo" || lowerKey === "photo" || lowerKey === "image" || lowerKey === "player photo (optional)") {
                    photo = val;
                }
            }

            // Validations
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
                    const found = standardCategories.find(c => c.toLowerCase() === category.toLowerCase());
                    if (found) {
                        mappedCategory = found;
                    }
                }
            }

            if (!mappedCategory) {
                invalidRows++;
                errors.push(`Row ${rowNum}: Invalid Category '${category}' for player '${fullName}'. Must be one of Batsman, Bowler, All-Rounder, or Wicket Keeper.`);
                continue;
            }

            // Duplicate mobile check
            if (existingPhones.has(mobileNumber) || seenInBatch.has(mobileNumber)) {
                duplicates++;
                continue;
            }

            // Create player in database
            try {
                await prisma.player.create({
                    data: {
                        name: fullName,
                        phoneNumber: mobileNumber,
                        category: mappedCategory,
                        fromWhere: fromWhere,
                        photo: photo || null,
                        basePrice: 500,
                        sold: false,
                        teamId: null,
                        currentBid: null
                    }
                });
                seenInBatch.add(mobileNumber);
                imported++;
            } catch (err: any) {
                invalidRows++;
                errors.push(`Row ${rowNum}: Database error while importing player '${fullName}': ${err.message || err}`);
            }
        }

        res.json({
            totalRows,
            imported,
            duplicates,
            invalidRows,
            errors
        });

    } catch (err: any) {
        console.error("Bulk Import error:", err);
        res.status(500).json({ error: err.message || "An unexpected error occurred during bulk import." });
    }
};