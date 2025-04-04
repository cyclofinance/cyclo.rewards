import { CyToken } from "./types";

export const REWARDS_SOURCES = [
  "0xCEe8Cd002F151A536394E564b84076c41bBBcD4d", // orderbook
  "0x0f3D8a38D4c74afBebc2c42695642f0e3acb15D3", // Sparkdex Universal Router
];

export const FACTORIES = [
  "0x16b619B04c961E8f4F06C10B42FDAbb328980A89", // Sparkdex V2
  "0x8A2578d23d4C532cC9A98FaD91C0523f5efDE652", // Sparkdex V3
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
