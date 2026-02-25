import assert from "assert";
import { CyToken } from "./types";
import seedrandom from "seedrandom";

export const REWARDS_SOURCES = [
  "0xcee8cd002f151a536394e564b84076c41bbbcd4d", // orderbook
  "0x0f3d8a38d4c74afbebc2c42695642f0e3acb15d3", // Sparkdex Universal Router
  "0x6352a56caadc4f1e25cd6c75970fa768a3304e64", // OpenOcean Exchange Proxy
  "0xed85325119ccfc6acb16fa931bac6378b76e4615", // OpenOcean Exchange Impl
  "0x8c7ba8f245aef3216698087461e05b85483f791f", // OpenOcean Exchange Router
  "0x9d70b0b90915bb8b9bdac7e6a7e6435bbf1fec4d", // Sparkdex TWAP
];

export const FACTORIES = [
  "0x16b619b04c961e8f4f06c10b42fdabb328980a89", // Sparkdex V2
  "0xb3fb4f96175f6f9d716c17744e5a6d4ba9da8176", // Sparkdex V3
  "0x8a2578d23d4c532cc9a98fad91c0523f5efde652", // Sparkdex V3.1
  "0x440602f459d7dd500a74528003e6a20a46d6e2a6", // Blazeswap
];

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
export const RPC_URL = process.env.RPC_URL;

export function isSameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * Generates random snapshots between the given start/end numbers based on the given seed
 * @param seed - The seed phrase
 * @param start - The start block number
 * @param end - The end block number
 * @returns Sorted array of 30 unique block numbers between start and end (inclusive)
 */
export function generateSnapshotBlocks(
  seed: string,
  start: number,
  end: number,
): number[] {
  assert.ok(seed.length > 0, "Seed must not be empty");
  const rng = seedrandom(seed);
  const range = end - start + 1;

  assert.ok(range >= 30, `Snapshot range must be at least 30, got ${range}`);

  const snapshotSet = new Set<number>([start, end]);

  // start + end + 28 = 30 snapshots, sampled without replacement
  while (snapshotSet.size < 30) {
    snapshotSet.add(Math.floor(rng() * range) + start);
  }

  const snapshots = Array.from(snapshotSet);

  // making sure we have correct length
  assert.ok(
    snapshots.length === 30,
    `failed to generate expected number of snapshots, expected: 30, got: ${snapshots.length}`
  );

  // sort asc
  snapshots.sort((a, b) => a - b);

  return snapshots;
}

/**
 * Scales a given value and its decimals to 18 fixed point decimals
 * @param value - The value to scale to 18
 * @param decimals - The decimals of the value to scale to 18
 * @returns The value scaled to 18 decimal places
 */
export function scaleTo18(value: bigint, decimals: number): bigint {
    if (decimals === 18) {
      return value;
    } else if (decimals > 18) {
        return value / BigInt("1" + "0".repeat(decimals - 18));
    } else {
        return value * BigInt("1" + "0".repeat(18 - decimals));
    }
}

export function parseEnv(): { seed: string; startSnapshot: number; endSnapshot: number } {
  assert(process.env.SEED, "SEED environment variable must be set");
  assert(process.env.START_SNAPSHOT, "START_SNAPSHOT environment variable must be set");
  assert(process.env.END_SNAPSHOT, "END_SNAPSHOT environment variable must be set");

  const startSnapshot = parseInt(process.env.START_SNAPSHOT);
  const endSnapshot = parseInt(process.env.END_SNAPSHOT);

  assert(!isNaN(startSnapshot), "START_SNAPSHOT must be a valid number");
  assert(!isNaN(endSnapshot), "END_SNAPSHOT must be a valid number");

  return { seed: process.env.SEED, startSnapshot, endSnapshot };
}
