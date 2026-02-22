export const sendNotification = async (playerId: number, message: string) => {
    console.log(`Sending notification to player ${playerId}: ${message}`);
    // Implement actual notification logic (e.g., SMS, Email, In-app)
    return { success: true };
};
