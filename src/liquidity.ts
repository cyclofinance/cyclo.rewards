/**
 * Queries Uniswap V3 pool tick data via multicall for in-range LP position calculations.
 */

import { PublicClient } from "viem";
import { TICK_RETRY_ATTEMPTS, TICK_RETRY_DELAY_MS } from "./constants";

/** Multicall3 canonical deployment address (same on all EVM chains) */
export const MULTICALL3_ADDRESS =
  "0xcA11bde05977b3631167028862bE2a173976CA11" as const;

/** Index of the `tick` field in the slot0 return tuple */
const SLOT0_TICK_INDEX = 1;

/** Uniswap V3 pool slot0 ABI — returns current tick and other pool state */
const abi = [
  {
    inputs: [],
    name: "slot0",
    outputs: [
      {
        internalType: "uint160",
        name: "sqrtPriceX96",
        type: "uint160",
      },
      {
        internalType: "int24",
        name: "tick",
        type: "int24",
      },
      {
        internalType: "uint16",
        name: "observationIndex",
        type: "uint16",
      },
      {
        internalType: "uint16",
        name: "observationCardinality",
        type: "uint16",
      },
      {
        internalType: "uint16",
        name: "observationCardinalityNext",
        type: "uint16",
      },
      {
        internalType: "uint8",
        name: "feeProtocol",
        type: "uint8",
      },
      {
        internalType: "bool",
        name: "unlocked",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

/**
 * Fetches current tick for each pool via a single multicall at the given block.
 * Pools that don't exist at the block (no code deployed) are silently skipped.
 * @param client - Viem public client
 * @param pools - Array of pool contract addresses (must be pre-validated via parsePools)
 * @param blockNumber - Block number to query at (bigint for viem multicall API)
 * @returns Map of lowercase pool address to current tick value
 * @throws On RPC/network errors from the multicall
 */
export async function getPoolsTickMulticall(
  client: PublicClient,
  pools: `0x${string}`[],
  blockNumber: bigint,
): Promise<Record<string, number>> {
  const ticks: Record<string, number> = {};
  const results = await client.multicall({
    blockNumber,
    allowFailure: true,
    multicallAddress: MULTICALL3_ADDRESS,
    contracts: pools.map(
      (address) =>
        ({
          abi,
          address,
          functionName: "slot0",
        }) as const,
    ),
  });
  for (let i = 0; i < results.length; i++) {
    const res = results[i];
    const pool = pools[i];
    if (res.status === "success") {
      ticks[pool] = res.result[SLOT0_TICK_INDEX];
    }
  }

  const missingPools = pools.filter((p) => !(p in ticks));
  if (missingPools.length > 0) {
    const realFailures: string[] = [];
    for (const pool of missingPools) {
      const code = await client.getCode({ address: pool, blockNumber });
      if (code && code !== "0x") {
        realFailures.push(pool);
      }
    }
    if (realFailures.length > 0) {
      throw new Error(
        `Failed to get ticks for pools: ${realFailures.join(", ")}`,
      );
    }
  }

  return ticks;
}

/**
 * Fetches pool ticks with retry logic (TICK_RETRY_ATTEMPTS attempts, TICK_RETRY_DELAY_MS between retries).
 * @param client - Viem public client
 * @param pools - Array of pool contract addresses
 * @param blockNumber - Block number to query at (number, converted to bigint internally)
 * @returns Map of lowercase pool address to current tick value
 * @throws If blockNumber is not a non-negative integer, or all retry attempts fail
 */
export async function getPoolsTick(
  client: PublicClient,
  pools: `0x${string}`[],
  blockNumber: number,
): Promise<Record<string, number>> {
  if (!Number.isInteger(blockNumber) || blockNumber < 0) {
    throw new Error(`Invalid blockNumber: ${blockNumber}`);
  }
  for (let i = 0; i < TICK_RETRY_ATTEMPTS; i++) {
    try {
      return await getPoolsTickMulticall(client, pools, BigInt(blockNumber));
    } catch (error) {
      if (i >= TICK_RETRY_ATTEMPTS - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, TICK_RETRY_DELAY_MS));
    }
  }

  throw new Error("failed to get pools ticks");
}
