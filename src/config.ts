export const REWARDS_SOURCES = [
  "0xCEe8Cd002F151A536394E564b84076c41bBBcD4d", // orderbook
  "0x0f3D8a38D4c74afBebc2c42695642f0e3acb15D3", // Sparkdex Universal Router
];

export const FACTORIES = [
  "0x16b619B04c961E8f4F06C10B42FDAbb328980A89", // Sparkdex V2
  "0x8A2578d23d4C532cC9A98FaD91C0523f5efDE652", // Sparkdex V3
  "0x440602f459D7Dd500a74528003e6A20A46d6e2A6", // Blazeswap
];

export const RPC_URL = "https://flare-api.flare.network/ext/C/rpc";

// Let's add case-insensitive comparison
export function isSameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}
