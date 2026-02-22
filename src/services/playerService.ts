import { prisma } from "../prisma";

export const getAllPlayers = async () => {
    return await prisma.player.findMany({
        include: { team: true },
    });
};

export const addPlayer = async (data: { name: string; teamId?: string; basePrice: string | number }) => {
    return await prisma.player.create({
        data: {
            name: data.name,
            basePrice: Number(data.basePrice),
            teamId: data.teamId ? Number(data.teamId) : null,
        },
    });
};
