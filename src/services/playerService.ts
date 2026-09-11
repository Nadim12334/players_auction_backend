import { prisma } from "../prisma";

export const getAllPlayers = async (tournamentId?: number) => {
    const where = tournamentId ? { tournamentId } : {};
    return await prisma.player.findMany({
        where,
        include: { team: true },
    });
};

export const addPlayer = async (data: {
    name: string;
    teamId?: string;
    basePrice: string | number;
    category: string;
    fromWhere: string;
    tournamentId?: string | number;
}) => {
    return await prisma.player.create({
        data: {
            tournamentId: Number(data.tournamentId || 1),
            name: data.name,
            basePrice: Number(data.basePrice),
            teamId: data.teamId ? Number(data.teamId) : null,
            category: data.category,
            fromWhere: data.fromWhere,
        },
    });
};
