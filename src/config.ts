import assert from "assert";
import { CyToken } from "./types";
import { Epoch } from "./constants";
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
  },
  {
    name: "cyWETH",
    address: "0xd8BF1d2720E9fFD01a2F9A2eFc3E101a05B852b4",
    underlyingAddress: "0x1502fa4be69d526124d453619276faccab275d3d", // weth
    underlyingSymbol: "WETH",
    receiptAddress: "0xBE2615A0fcB54A49A1eB472be30d992599FE0968",
  },
];

export const RPC_URL = "https://flare-api.flare.network/ext/C/rpc";

export function isSameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * Generates daily random snapshot timestamps for the given epoch based on the given seed
 * @param seed - The seed phrase
 * @param epoch - The epoch
 */
export function generateSnapshotTimestampForEpoch(
    seed: string,
    epoch: Epoch,
): number[] {
  const rng = seedrandom(seed);
  const range = 24 * 60 * 60; // 24 hours range for random generator
  const len = epoch.length; // number of days in the epoch to take snapshot once each day

  // epoch timestamp is always the end of the epoch range
  // so all generated timestamps should be less than this
  const endTimestamp = epoch.timestamp;

  const snapshotTimestamps: number[] = [];

  for (let i = 1; i <= len; i++) {
    const dailyRandomOffset = Math.floor(rng() * range);
    const timestamp = (endTimestamp - (i * range)) + dailyRandomOffset;
    snapshotTimestamps.unshift(timestamp);
  }

  // making sure we have correct length
  assert.ok(
    snapshotTimestamps.length === len,
    `failed to generated expected number of snapshots, expected: ${len}, got: ${snapshotTimestamps.length}`
  );

  // its already sorted but just in case
  snapshotTimestamps.sort((a, b) => a - b);

  return snapshotTimestamps;
}
