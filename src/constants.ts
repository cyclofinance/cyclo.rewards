export const ONE = BigInt(10 ** 18);
export const REWARD_POOL = BigInt(500000000000000000000000);

// epoch list from: https://flare.network/news/a-guide-to-rflr-rewards
export const EPOCHS_LIST = [
    // 2024
    { date: "2024-07-06T12:00:00Z", length: 30, timestamp: 1720267200 },
    { date: "2024-08-05T12:00:00Z", length: 30, timestamp: 1722859200 },
    { date: "2024-09-04T12:00:00Z", length: 30, timestamp: 1725451200 },
    { date: "2024-10-04T12:00:00Z", length: 30, timestamp: 1728043200 },
    { date: "2024-11-03T12:00:00Z", length: 30, timestamp: 1730635200 },
    { date: "2024-12-03T12:00:00Z", length: 30, timestamp: 1733227200 },

    // 2025
    { date: "2025-01-02T12:00:00Z", length: 30, timestamp: 1735819200 },
    { date: "2025-02-01T12:00:00Z", length: 30, timestamp: 1738411200 },
    { date: "2025-03-03T12:00:00Z", length: 30, timestamp: 1741003200 },
    { date: "2025-04-02T12:00:00Z", length: 30, timestamp: 1743595200 },
    { date: "2025-05-02T12:00:00Z", length: 30, timestamp: 1746187200 },
    { date: "2025-06-01T12:00:00Z", length: 30, timestamp: 1748779200 },
    { date: "2025-07-01T12:00:00Z", length: 30, timestamp: 1751371200 },
    { date: "2025-07-31T12:00:00Z", length: 30, timestamp: 1753963200 },
    { date: "2025-08-30T12:00:00Z", length: 30, timestamp: 1756555200 },
    { date: "2025-09-29T12:00:00Z", length: 30, timestamp: 1759147200 },
    { date: "2025-10-29T12:00:00Z", length: 30, timestamp: 1761739200 },
    { date: "2025-11-28T12:00:00Z", length: 30, timestamp: 1764331200 }, // latest distribution
    { date: "2025-12-28T12:00:00Z", length: 30, timestamp: 1766923200 },

    // 2026
    { date: "2026-01-27T12:00:00Z", length: 30, timestamp: 1769515200 },
    { date: "2026-02-26T12:00:00Z", length: 30, timestamp: 1772107200 },
    { date: "2026-03-28T12:00:00Z", length: 30, timestamp: 1774699200 },
    { date: "2026-04-27T12:00:00Z", length: 30, timestamp: 1777291200 },
    { date: "2026-05-27T12:00:00Z", length: 30, timestamp: 1779883200 },
] as const;
