import { prisma } from "../prisma";

export const getAllTeams = async (tournamentId?: number) => {
    const where = tournamentId ? { tournamentId } : {};
    return await prisma.team.findMany({
        where,
        include: { players: true },
    });
};

export const createTeam = async (data: {
    name: string;
    purse: string | number;
    tournamentId?: string | number;
    logo?: string;
}) => {
    return await prisma.team.create({
        data: {
            tournamentId: Number(data.tournamentId || 1),
            name: data.name,
            purse: Number(data.purse),
            logo: data.logo || null,
        },
    });
};
