/**
 * Shared constants for reward pool amounts, CSV column headers, validation patterns,
 * and data file paths used by both the scraper and processor.
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

/** Validate that a string is a valid Ethereum address (0x + 40 hex chars) */
export function validateAddress(value: string, field: string): void {
  if (!VALID_ADDRESS_REGEX.test(value)) throw new Error(`Invalid ${field}: "${value}" is not a valid address`);
}

/** Percentage of a cheater's penalty paid to the reporter as a bounty (10%) */
export const BOUNTY_PERCENT = 10n;

/** Base delay in ms for exponential backoff on RPC retries */
export const RETRY_BASE_DELAY_MS = 500;

/** Directory for scraped data files */
export const DATA_DIR = "data";

/** Directory for output CSV files */
export const OUTPUT_DIR = "output";

/** Base filename for transfer JSONL data (appended with 1-based index, e.g. transfers1.dat) */
export const TRANSFERS_FILE_BASE = "transfers";

/** Filename for liquidity change JSONL data */
export const LIQUIDITY_FILE = "liquidity.dat";

/** Filename for V3 pool addresses JSON */
export const POOLS_FILE = "pools.dat";

/** Filename for penalty/bounty blocklist */
export const BLOCKLIST_FILE = "blocklist.txt";

/** Max lines per transfer data file to stay under GitHub's 100MB file size limit */
export const TRANSFER_CHUNK_SIZE = 270000;

/** Max number of transfer data files to read */
export const TRANSFER_FILE_COUNT = 10;

/** 1-indexed epoch number for the current rewards run */
export const CURRENT_EPOCH = 21;

export interface Epoch {
  number: number;
  /** Epoch end date at 12:00 UTC (ISO 8601) */
  end: string;
  /** Seed phrase for deterministic snapshot block generation */
  seed?: string;
  /** First block at or after the epoch start timestamp */
  startBlock?: number;
  /** First block at or after the epoch end timestamp */
  endBlock: number;
}

/**
 * rFLR Emissions Epochs Schedule with on-chain block numbers.
 * Source: https://flare.network/news/a-guide-to-rflr-rewards
 * Block numbers derived via binary search against Flare C-chain timestamps.
 */
export const EPOCHS: Epoch[] = [
  { number: 1,  end: "2024-07-06T12:00:00Z", endBlock: 26478162 },
  { number: 2,  end: "2024-08-05T12:00:00Z", startBlock: 26478162, endBlock: 27905729 },
  { number: 3,  end: "2024-09-04T12:00:00Z", startBlock: 27905729, endBlock: 29318054 },
  { number: 4,  end: "2024-10-04T12:00:00Z", startBlock: 29318054, endBlock: 30761375 },
  { number: 5,  end: "2024-11-03T12:00:00Z", startBlock: 30761375, endBlock: 32359087 },
  { number: 6,  end: "2024-12-03T12:00:00Z", startBlock: 32359087, endBlock: 33946347 },
  { number: 7,  end: "2025-01-02T12:00:00Z", startBlock: 33946347, endBlock: 35449142 },
  { number: 8,  end: "2025-02-01T12:00:00Z", startBlock: 35449142, endBlock: 36886815 },
  { number: 9,  end: "2025-03-03T12:00:00Z", startBlock: 36886815, endBlock: 38230033 },
  { number: 10, end: "2025-04-02T12:00:00Z", startBlock: 38230033, endBlock: 39573388 },
  { number: 11, end: "2025-05-02T12:00:00Z", startBlock: 39573388, endBlock: 40958009 },
  { number: 12, end: "2025-06-01T12:00:00Z", startBlock: 40958009, endBlock: 42427560 },
  { number: 13, end: "2025-07-01T12:00:00Z", startBlock: 42427560, endBlock: 43894536 },
  { number: 14, end: "2025-07-31T12:00:00Z", startBlock: 43894536, endBlock: 45383680 },
  { number: 15, end: "2025-08-30T12:00:00Z", startBlock: 45383680, endBlock: 46847856 },
  { number: 16, end: "2025-09-29T12:00:00Z", startBlock: 46847856, endBlock: 48306268 },
  { number: 17, end: "2025-10-29T12:00:00Z", startBlock: 48306268, endBlock: 49772029 },
  { number: 18, end: "2025-11-28T12:00:00Z", seed: "cyclo-rewards-for-nov-2025", startBlock: 49772029, endBlock: 51355293 },
  { number: 19, end: "2025-12-28T12:00:00Z", seed: "cyclo-rewards-for-dec-2025", startBlock: 51355293, endBlock: 52936176 },
  { number: 20, end: "2026-01-27T12:00:00Z", seed: "cyclo-rewards-for-jan-2026", startBlock: 52936176, endBlock: 54506725 },
  { number: 21, end: "2026-02-26T12:00:00Z", seed: "e18b5100f9b97f8c88f3a79de3d82fdd", startBlock: 54506725, endBlock: 56142314 },
  { number: 22, end: "2026-03-28T12:00:00Z", startBlock: 56142314 },
  { number: 23, end: "2026-04-27T12:00:00Z" },
  { number: 24, end: "2026-05-27T12:00:00Z" },
];
