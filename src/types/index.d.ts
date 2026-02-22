export interface Player {
    id: number;
    name: string;
    basePrice: number;
    sold: boolean;
    teamId?: number | null;
}

export interface Team {
    id: number;
    name: string;
    budget: number;
    players: Player[];
}

export interface Bid {
    playerId: number;
    teamId: number;
    amount: number;
}
