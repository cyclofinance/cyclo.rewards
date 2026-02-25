import assert from "assert";
import { CyToken, Epoch } from "./types";
import seedrandom from "seedrandom";

export const REWARDS_SOURCES = [
  "0xcee8cd002f151a536394e564b84076c41bbbcd4d", // orderbook
  "0x0f3D8a38D4c74afBebc2c42695642f0e3acb15D3", // Sparkdex Universal Router
  "0x6352a56caadC4F1E25CD6c75970Fa768A3304e64", // OpenOcean Exchange Proxy
  "0xeD85325119cCFc6aCB16FA931bAC6378B76e4615", // OpenOcean Exchange Impl
  "0x8c7ba8f245aef3216698087461e05b85483f791f", // OpenOcean Exchange Router
  "0x9D70B0b90915Bb8b9bdAC7e6a7e6435bBF1feC4D", // Sparkdex TWAP
];

export const FACTORIES = [
  "0x16b619B04c961E8f4F06C10B42FDAbb328980A89", // Sparkdex V2
  "0xb3fB4f96175f6f9D716c17744e5A6d4BA9da8176", // Sparkdex V3
  "0x8A2578d23d4C532cC9A98FaD91C0523f5efDE652", // Sparkdex V3.1
  "0x440602f459D7Dd500a74528003e6A20A46d6e2A6", // Blazeswap
];

export const CYTOKENS: CyToken[] = [
  {
    name: "cysFLR",
    address: "0x19831cfB53A0dbeAD9866C43557C1D48DfF76567",
    underlyingAddress: "0x12e605bc104e93B45e1aD99F9e555f659051c2BB", // sFlr
    underlyingSymbol: "sFLR",
    receiptAddress: "0xd387FC43E19a63036d8FCeD559E81f5dDeF7ef09",
    decimals: 18,
  },
  {
    name: "cyWETH",
    address: "0xd8BF1d2720E9fFD01a2F9A2eFc3E101a05B852b4",
    underlyingAddress: "0x1502fa4be69d526124d453619276faccab275d3d", // weth
    underlyingSymbol: "WETH",
    receiptAddress: "0xBE2615A0fcB54A49A1eB472be30d992599FE0968",
    decimals: 18,
  },
  {
    name: "cyFXRP",
    address: "0xf23595ede14b54817397b1dab899ba061bdce7b5",
    underlyingAddress: "0xAd552A648C74D49E10027AB8a618A3ad4901c5bE", // fxrp
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
    `failed to generated expected number of snapshots, expected: 30, got: ${snapshots.length}`
  );

  // sort asc
  snapshots.sort((a, b) => a - b);

  return snapshots;
}

/**
 * Scales a given value and its decimals to 18 fixed point decimals
 * @param value - The value to scale to 18
 * @param decimals - The decimals of the value to scale to 18
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
