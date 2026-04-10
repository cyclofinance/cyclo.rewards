import assert from "assert";
import { CyToken } from "./types";
import { validateAddress, EPOCHS, CURRENT_EPOCH, SNAPSHOT_COUNT } from "./constants";
import seedrandom from "seedrandom";
import { shuffle } from "./shuffle";

/** Approved DEX router and orderbook addresses whose transfers are reward-eligible */
export const REWARDS_SOURCES = [
  "0xcee8cd002f151a536394e564b84076c41bbbcd4d", // orderbook
  "0x0f3d8a38d4c74afbebc2c42695642f0e3acb15d3", // Sparkdex Universal Router
  "0x6352a56caadc4f1e25cd6c75970fa768a3304e64", // OpenOcean Exchange Proxy
  "0xed85325119ccfc6acb16fa931bac6378b76e4615", // OpenOcean Exchange Impl
  "0x8c7ba8f245aef3216698087461e05b85483f791f", // OpenOcean Exchange Router
  "0x9d70b0b90915bb8b9bdac7e6a7e6435bbf1fec4d", // Sparkdex TWAP
];

/** DEX factory contract addresses; transfers from pools created by these factories are reward-eligible */
export const FACTORIES = [
  "0x16b619b04c961e8f4f06c10b42fdabb328980a89", // Sparkdex V2
  "0xb3fb4f96175f6f9d716c17744e5a6d4ba9da8176", // Sparkdex V3
  "0x8a2578d23d4c532cc9a98fad91c0523f5efde652", // Sparkdex V3.1
  "0x440602f459d7dd500a74528003e6a20a46d6e2a6", // Blazeswap
];

/** Cyclo token definitions for reward calculation */
export const CYTOKENS: CyToken[] = [
  {
    name: "cysFLR",
    address: "0x19831cfb53a0dbead9866c43557c1d48dff76567",
    underlyingAddress: "0x12e605bc104e93b45e1ad99f9e555f659051c2bb", // sFlr
    underlyingSymbol: "sFLR",
    receiptAddress: "0xd387fc43e19a63036d8fced559e81f5ddef7ef09",
    decimals: 18,
  },
  {
    name: "cyWETH",
    address: "0xd8bf1d2720e9ffd01a2f9a2efc3e101a05b852b4",
    underlyingAddress: "0x1502fa4be69d526124d453619276faccab275d3d", // weth
    underlyingSymbol: "WETH",
    receiptAddress: "0xbe2615a0fcb54a49a1eb472be30d992599fe0968",
    decimals: 18,
  },
  {
    name: "cyFXRP",
    address: "0xf23595ede14b54817397b1dab899ba061bdce7b5",
    underlyingAddress: "0xad552a648c74d49e10027ab8a618a3ad4901c5be", // fxrp
    underlyingSymbol: "FXRP",
    receiptAddress: "0xc46600cebd84ed2fe60ec525df13e341d24642f2",
    decimals: 6,
  },
];

assert(process.env.RPC_URL, "RPC_URL environment variable must be set");
/** Flare RPC endpoint URL for on-chain queries */
export const RPC_URL = process.env.RPC_URL;

/**
 * Case-insensitive comparison of two Ethereum addresses
 * @param a - First address
 * @param b - Second address
 * @returns True if addresses match (case-insensitive)
 */
export function isSameAddress(a: string, b: string): boolean {
  validateAddress(a, "address a");
  validateAddress(b, "address b");
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * Generates random snapshots between the given start/end numbers based on the given seed
 * @param seed - The seed phrase
 * @param start - The start block number
 * @param end - The end block number
 * @returns Sorted array of SNAPSHOT_COUNT unique block numbers between start and end (inclusive)
 */
export function generateSnapshotBlocks(
  seed: string,
  start: number,
  end: number,
): number[] {
  assert.ok(seed.length > 0, "Seed must not be empty");
  assert.ok(Number.isInteger(start) && start >= 0, `start must be a non-negative integer, got ${start}`);
  assert.ok(Number.isInteger(end) && end >= 0, `end must be a non-negative integer, got ${end}`);
  const rng = seedrandom(seed);
  const range = end - start + 1;

  assert.ok(range >= SNAPSHOT_COUNT, `Snapshot range must be at least ${SNAPSHOT_COUNT}, got ${range}`);

  // Build candidate array and sample SNAPSHOT_COUNT via Fisher-Yates shuffle
  const candidates = Array.from({ length: range }, (_, i) => start + i);
  const shuffled = shuffle(candidates, rng);
  const snapshots = shuffled.slice(0, SNAPSHOT_COUNT).sort((a, b) => a - b);

  assert.ok(
    snapshots.length === SNAPSHOT_COUNT,
    `failed to generate expected number of snapshots, expected: ${SNAPSHOT_COUNT}, got: ${snapshots.length}`
  );

  return snapshots;
}

/**
 * Scales a given value and its decimals to 18 fixed point decimals
 * @param value - The value to scale to 18
 * @param decimals - The decimals of the value to scale to 18
 * @returns The value scaled to 18 decimal places
 */
export function scaleTo18(value: bigint, decimals: number): bigint {
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new Error(`Invalid decimals: ${decimals} (must be a non-negative integer)`);
  }
  if (decimals === 18) {
    return value;
  } else if (decimals > 18) {
    return value / 10n ** BigInt(decimals - 18);
  } else {
    return value * 10n ** BigInt(18 - decimals);
  }
}

export function parseEnv(): { seed: string; startSnapshot: number; endSnapshot: number } {
  const epoch = EPOCHS[CURRENT_EPOCH - 1];
  assert(epoch, `No epoch found for CURRENT_EPOCH ${CURRENT_EPOCH}`);
  assert(epoch.seed, `Epoch ${epoch.number} has no seed`);
  assert(epoch.startBlock !== undefined, `Epoch ${epoch.number} has no startBlock`);
  return { seed: epoch.seed, startSnapshot: epoch.startBlock, endSnapshot: epoch.endBlock };
}
