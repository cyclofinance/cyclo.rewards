export const ONE = BigInt(10 ** 18);

export const REWARD_POOL = BigInt(500000000000000000000000);
export const DEC25_REWARD_POOL = 1_000_000_000_000_000_000_000_000n as const;

// Must match expected structure
// https://github.com/flare-foundation/rnat-distribution-tool/blob/main/README.md#add-csv-file-with-rewards-data
export const REWARDS_CSV_COLUMN_HEADER_ADDRESS = "recipient address";
export const REWARDS_CSV_COLUMN_HEADER_REWARD = "amount wei";
export const DIFF_CSV_COLUMN_HEADER_OLD = "old";
export const DIFF_CSV_COLUMN_HEADER_NEW = "new";
export const DIFF_CSV_COLUMN_HEADER_DIFF = "diff";
