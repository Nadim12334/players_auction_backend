import fs from "fs";
import path from "path";
import { prisma, tournamentAuctionStates, cleanupTournamentSocket } from "../server";

/**
 * Normalizes a stored file path to a relative path from the app root.
 * Ignores base64 data URIs, external URLs, and blob URIs.
 */
function normalizeLocalPath(filePath: string | null | undefined): string | null {
    if (!filePath) return null;
    const trimmed = filePath.trim();
    if (
        trimmed.startsWith("data:image/") ||
        trimmed.startsWith("http://") ||
        trimmed.startsWith("https://") ||
        trimmed.startsWith("blob:")
    ) {
        return null;
    }

    // Remove leading slashes/backslashes to get clean relative path
    const relative = trimmed.replace(/^[/\\]+/, "");
    // Ensure it starts with uploads
    if (relative.startsWith("uploads/") || relative.startsWith("uploads\\")) {
        return relative;
    }
    return null;
}

/**
 * 1. Collect all local file paths associated with a tournament,
 * verifying that no other tournament is referencing the same file.
 */
export async function getTournamentFiles(tournamentId: number): Promise<string[]> {
    const candidatePaths = new Set<string>();

    // Collect player photos
    const players = await prisma.player.findMany({
        where: { tournamentId },
        select: { id: true, photo: true },
    });
    for (const p of players) {
        const local = normalizeLocalPath(p.photo);
        if (local) candidatePaths.add(local);
    }

    // Collect team logos
    const teams = await prisma.team.findMany({
        where: { tournamentId },
        select: { id: true, logo: true },
    });
    for (const t of teams) {
        const local = normalizeLocalPath(t.logo);
        if (local) candidatePaths.add(local);
    }

    // Collect tournament logo
    const tourney = await prisma.tournament.findUnique({
        where: { id: tournamentId },
        select: { id: true, logo: true },
    });
    if (tourney) {
        const local = normalizeLocalPath(tourney.logo);
        if (local) candidatePaths.add(local);
    }

    if (candidatePaths.size === 0) {
        return [];
    }

    const candidateArray = Array.from(candidatePaths);

    // Cross-tournament safety check:
    // Verify none of these files are referenced by ANY other tournament's players, teams, or tournament record
    const safeFilesToDelete: string[] = [];

    for (const relPath of candidateArray) {
        const searchPattern = relPath.replace(/\\/g, "/");
        const altSearchPattern = `/${searchPattern}`;

        const otherPlayerCount = await prisma.player.count({
            where: {
                tournamentId: { not: tournamentId },
                OR: [
                    { photo: { contains: searchPattern } },
                    { photo: { contains: altSearchPattern } },
                ],
            },
        });

        const otherTeamCount = await prisma.team.count({
            where: {
                tournamentId: { not: tournamentId },
                OR: [
                    { logo: { contains: searchPattern } },
                    { logo: { contains: altSearchPattern } },
                ],
            },
        });

        const otherTournamentCount = await prisma.tournament.count({
            where: {
                id: { not: tournamentId },
                OR: [
                    { logo: { contains: searchPattern } },
                    { logo: { contains: altSearchPattern } },
                ],
            },
        });

        if (otherPlayerCount === 0 && otherTeamCount === 0 && otherTournamentCount === 0) {
            safeFilesToDelete.push(relPath);
        } else {
            console.warn(
                `[Cleanup Warning] Skipping file ${relPath} as it is referenced by another tournament.`
            );
        }
    }

    return safeFilesToDelete;
}

/**
 * 2. Safely deletes the identified files from the local filesystem.
 * Missing files are handled gracefully without failing the operation.
 */
export async function cleanupTournamentFiles(
    tournamentId: number,
    filePaths: string[]
): Promise<{ deletedCount: number; skippedCount: number; errors: string[] }> {
    const uploadsRoot = path.resolve(process.cwd(), "uploads");
    let deletedCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];

    for (const relPath of filePaths) {
        try {
            const absolutePath = path.resolve(process.cwd(), relPath);

            // Directory Traversal Prevention: Ensure target is strictly inside uploads folder
            const relDiff = path.relative(uploadsRoot, absolutePath);
            if (relDiff.startsWith("..") || path.isAbsolute(relDiff)) {
                console.error(`[Security Alert] Denied attempt to delete file outside uploads: ${absolutePath}`);
                skippedCount++;
                continue;
            }

            if (fs.existsSync(absolutePath)) {
                fs.unlinkSync(absolutePath);
                deletedCount++;
                console.log(`[Cleanup] Deleted file for Tournament ${tournamentId}: ${relPath}`);
            } else {
                // File was already missing; handle gracefully
                skippedCount++;
                console.log(`[Cleanup Info] File was already missing from disk: ${relPath}`);
            }
        } catch (err: any) {
            console.error(`[Cleanup Error] Failed to delete file ${relPath}:`, err.message);
            errors.push(`File ${relPath}: ${err.message}`);
            skippedCount++;
        }
    }

    // Also check for any dedicated tournament directory (e.g., uploads/tournaments/<id> or uploads/players/<id>)
    const dedicatedDirs = [
        path.join(uploadsRoot, "tournaments", String(tournamentId)),
        path.join(uploadsRoot, "players", String(tournamentId)),
    ];

    for (const dir of dedicatedDirs) {
        try {
            if (fs.existsSync(dir)) {
                fs.rmSync(dir, { recursive: true, force: true });
                console.log(`[Cleanup] Removed dedicated directory: ${dir}`);
            }
        } catch (dirErr: any) {
            console.error(`[Cleanup Warning] Failed to remove directory ${dir}:`, dirErr.message);
        }
    }

    return { deletedCount, skippedCount, errors };
}

/**
 * 3. Permanently deletes a tournament and all its related database records atomically.
 * Cleans up files and Socket.io state afterwards.
 */
export async function deleteTournamentPermanently(tournamentId: number) {
    if (isNaN(tournamentId) || tournamentId <= 0) {
        const err: any = new Error("Invalid tournament ID");
        err.statusCode = 400;
        throw err;
    }

    // 1. Verify tournament exists
    const tournament = await prisma.tournament.findUnique({
        where: { id: tournamentId },
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
        const err: any = new Error("Tournament not found");
        err.statusCode = 404;
        throw err;
    }

    // 2. Prevent deleting LIVE tournament auctions
    const inMemoryState = tournamentAuctionStates.get(tournamentId);
    if (
        tournament.status === "LIVE" ||
        (inMemoryState && (inMemoryState.status === "BIDDING" || inMemoryState.currentPlayerId !== null))
    ) {
        const err: any = new Error("Live tournaments cannot be permanently deleted. Complete or stop the auction first.");
        err.statusCode = 400;
        throw err;
    }

    // 3. Discover all tournament-specific files BEFORE database deletion
    const filesToDelete = await getTournamentFiles(tournamentId);

    console.log(
        `[Permanent Delete] Starting deletion of Tournament ${tournamentId} ('${tournament.name}'). ` +
        `Records to remove: ${tournament._count.players} players, ${tournament._count.teams} teams, ${tournament._count.bids} bids. ` +
        `Files to clean: ${filesToDelete.length}`
    );

    // 4. Atomic Prisma transaction for database deletion
    // Strictly ordered to respect foreign keys and guarantee complete rollback on failure
    await prisma.$transaction(async (tx) => {
        // Step A: Delete all bids belonging to this tournament
        await tx.bid.deleteMany({
            where: { tournamentId },
        });

        // Step B: Delete all players belonging to this tournament
        await tx.player.deleteMany({
            where: { tournamentId },
        });

        // Step C: Delete all teams belonging to this tournament
        await tx.team.deleteMany({
            where: { tournamentId },
        });

        // Step D: Delete the tournament settings record itself
        await tx.tournament.delete({
            where: { id: tournamentId },
        });
    });

    console.log(`[Permanent Delete] Database transaction completed successfully for Tournament ${tournamentId}`);

    // 5. File cleanup on disk (executed only after DB transaction commits)
    const fileCleanupResult = await cleanupTournamentFiles(tournamentId, filesToDelete);

    // 6. Socket.io room eviction and in-memory state cleanup
    cleanupTournamentSocket(tournamentId, "deleted");

    return {
        message: "Tournament deleted successfully",
        deletedTournament: {
            id: tournament.id,
            name: tournament.name,
            slug: tournament.slug,
            season: tournament.season,
            playersDeleted: tournament._count.players,
            teamsDeleted: tournament._count.teams,
            bidsDeleted: tournament._count.bids,
        },
        fileCleanup: fileCleanupResult,
    };
}
