export const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
    }).format(amount);
};

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
