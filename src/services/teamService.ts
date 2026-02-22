import { prisma } from "../prisma";

export const getAllTeams = async () => {
    return await prisma.team.findMany({
        include: { players: true },
    });
};

export const createTeam = async (data: { name: string; budget: string | number }) => {
    return await prisma.team.create({
        data: {
            name: data.name,
            budget: Number(data.budget),
        },
    });
};
