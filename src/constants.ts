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
