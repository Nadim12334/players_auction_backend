let currentTimer: NodeJS.Timeout | null = null;
let currentPlayerId: number | null = null;

export const startAuctionTimer = (
    playerId: number,
    onExpire: (playerId: number) => void
) => {
    currentPlayerId = playerId;

    if (currentTimer) {
        clearTimeout(currentTimer);
    }

    currentTimer = setTimeout(() => {
        if (currentPlayerId) {
            onExpire(currentPlayerId);
        }
    }, 30000); // 30 seconds
};

export const resetAuctionTimer = (
    playerId: number,
    onExpire: (playerId: number) => void
) => {
    startAuctionTimer(playerId, onExpire);
};

export const clearAuctionTimer = () => {
    if (currentTimer) {
        clearTimeout(currentTimer);
        currentTimer = null;
    }
};