/**
 * Shared constants for reward pool amounts, CSV column headers, and validation patterns.
 */

/** 1e18 as BigInt — the fixed-point unit for 18-decimal token arithmetic */
export const ONE_18 = 10n ** 18n;

// Jan 2026 epoch: 500,000 tokens (18 decimals)
export const REWARD_POOL = 500_000_000_000_000_000_000_000n;
// Dec 2025 epoch: 1,000,000 tokens (18 decimals) — used by diffCalculator for reconciliation
export const DEC25_REWARD_POOL = 1_000_000_000_000_000_000_000_000n;

// Must match expected structure
// https://github.com/flare-foundation/rnat-distribution-tool/blob/main/README.md#add-csv-file-with-rewards-data
export const REWARDS_CSV_COLUMN_HEADER_ADDRESS = "recipient address";
export const REWARDS_CSV_COLUMN_HEADER_REWARD = "amount wei";
export const DIFF_CSV_COLUMN_HEADER_OLD = "old";
export const DIFF_CSV_COLUMN_HEADER_NEW = "new";
export const DIFF_CSV_COLUMN_HEADER_DIFF = "diff";

export const VALID_ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;
