/**
 * Data parsing, formatting, and output helpers for the reward calculation pipeline.
 * Handles JSONL parsing, CSV generation, balance summarization, and reward aggregation.
 */

import { readFile } from "fs/promises";
import {
  REWARDS_CSV_COLUMN_HEADER_ADDRESS,
  REWARDS_CSV_COLUMN_HEADER_REWARD,
} from "./constants";
import { validateAddress } from "./constants";
import {
  CyToken,
  EligibleBalances,
  RewardsPerToken,
  BlocklistReport,
  Transfer,
  LiquidityChange,
  LiquidityChangeType,
} from "./types";

const VALID_CHANGE_TYPES = Object.values(LiquidityChangeType);
const VALID_TX_HASH_REGEX = /^0x[0-9a-fA-F]{64}$/;

export function normalizeTransfer(item: unknown): Transfer {
  const t = item as Record<string, unknown>;
  if (typeof t.from !== "string")
    throw new Error(`Transfer missing or invalid 'from'`);
  if (typeof t.to !== "string")
    throw new Error(`Transfer missing or invalid 'to'`);
  if (typeof t.tokenAddress !== "string")
    throw new Error(`Transfer missing or invalid 'tokenAddress'`);
  if (
    typeof t.transactionHash !== "string" ||
    !VALID_TX_HASH_REGEX.test(t.transactionHash)
  )
    throw new Error(
      `Transfer missing or invalid 'transactionHash': "${t.transactionHash}"`,
    );
  if (typeof t.value !== "string" || !/^\d+$/.test(t.value))
    throw new Error(`Transfer missing or invalid 'value': "${t.value}"`);
  if (!Number.isInteger(t.blockNumber) || (t.blockNumber as number) < 0)
    throw new Error(
      `Transfer missing or invalid 'blockNumber': ${t.blockNumber}`,
    );
  if (!Number.isInteger(t.timestamp) || (t.timestamp as number) < 0)
    throw new Error(`Transfer missing or invalid 'timestamp': ${t.timestamp}`);
  validateAddress(t.from, "from");
  validateAddress(t.to, "to");
  validateAddress(t.tokenAddress, "tokenAddress");
  return {
    from: t.from.toLowerCase(),
    to: t.to.toLowerCase(),
    tokenAddress: t.tokenAddress.toLowerCase(),
    transactionHash: t.transactionHash.toLowerCase(),
    value: t.value,
    blockNumber: t.blockNumber as number,
    timestamp: t.timestamp as number,
  };
}

export function normalizeLiquidityChange(item: unknown): LiquidityChange {
  const t = item as Record<string, unknown>;
  if (typeof t.tokenAddress !== "string")
    throw new Error(`LiquidityChange missing or invalid 'tokenAddress'`);
  if (typeof t.lpAddress !== "string")
    throw new Error(`LiquidityChange missing or invalid 'lpAddress'`);
  if (typeof t.owner !== "string")
    throw new Error(`LiquidityChange missing or invalid 'owner'`);
  if (
    typeof t.transactionHash !== "string" ||
    !VALID_TX_HASH_REGEX.test(t.transactionHash)
  )
    throw new Error(
      `LiquidityChange missing or invalid 'transactionHash': "${t.transactionHash}"`,
    );
  if (
    typeof t.changeType !== "string" ||
    !VALID_CHANGE_TYPES.includes(t.changeType as LiquidityChangeType)
  )
    throw new Error(`LiquidityChange invalid 'changeType': "${t.changeType}"`);
  if (
    typeof t.liquidityChange !== "string" ||
    !/^-?\d+$/.test(t.liquidityChange)
  )
    throw new Error(
      `LiquidityChange invalid 'liquidityChange': "${t.liquidityChange}"`,
    );
  if (
    typeof t.depositedBalanceChange !== "string" ||
    !/^-?\d+$/.test(t.depositedBalanceChange)
  )
    throw new Error(
      `LiquidityChange invalid 'depositedBalanceChange': "${t.depositedBalanceChange}"`,
    );
  if (!Number.isInteger(t.blockNumber) || (t.blockNumber as number) < 0)
    throw new Error(`LiquidityChange invalid 'blockNumber': ${t.blockNumber}`);
  if (!Number.isInteger(t.timestamp) || (t.timestamp as number) < 0)
    throw new Error(`LiquidityChange invalid 'timestamp': ${t.timestamp}`);
  validateAddress(t.tokenAddress, "tokenAddress");
  validateAddress(t.lpAddress, "lpAddress");
  validateAddress(t.owner, "owner");

  const base = {
    tokenAddress: t.tokenAddress.toLowerCase(),
    lpAddress: t.lpAddress.toLowerCase(),
    owner: t.owner.toLowerCase(),
    transactionHash: t.transactionHash.toLowerCase(),
    changeType: t.changeType as LiquidityChangeType,
    liquidityChange: t.liquidityChange,
    depositedBalanceChange: t.depositedBalanceChange,
    blockNumber: t.blockNumber as number,
    timestamp: t.timestamp as number,
  };

  if (t.__typename === "LiquidityV3Change") {
    if (typeof t.poolAddress !== "string")
      throw new Error(`LiquidityChangeV3 missing 'poolAddress'`);
    validateAddress(t.poolAddress, "poolAddress");
    if (typeof t.tokenId !== "string" || t.tokenId.length === 0)
      throw new Error(`LiquidityChangeV3 missing or empty 'tokenId'`);
    if (!Number.isInteger(t.fee))
      throw new Error(`LiquidityChangeV3 invalid 'fee': ${t.fee}`);
    if (!Number.isInteger(t.lowerTick))
      throw new Error(`LiquidityChangeV3 invalid 'lowerTick': ${t.lowerTick}`);
    if (!Number.isInteger(t.upperTick))
      throw new Error(`LiquidityChangeV3 invalid 'upperTick': ${t.upperTick}`);
    return {
      __typename: "LiquidityV3Change" as const,
      ...base,
      tokenId: t.tokenId,
      poolAddress: t.poolAddress.toLowerCase(),
      fee: t.fee as number,
      lowerTick: t.lowerTick as number,
      upperTick: t.upperTick as number,
    };
  } else if (t.__typename !== "LiquidityV2Change") {
    throw new Error(`LiquidityChange invalid '__typename': "${t.__typename}"`);
  }

  return { __typename: "LiquidityV2Change" as const, ...base };
}

export async function readOptionalFile(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (e: any) {
    if (e?.code === "ENOENT") return "";
    throw e;
  }
}

/** Per-token aggregate balance data for verification logging */
export interface TokenSummary {
  name: string;
  totalAverage: bigint;
  totalPenalties: bigint;
  totalBounties: bigint;
  totalFinal: bigint;
  verified: boolean;
}

/** Aggregate average, penalty, bounty, and final balances per token for verification */
export function summarizeTokenBalances(
  balances: EligibleBalances,
  cytokens: CyToken[],
): TokenSummary[] {
  const summaries: TokenSummary[] = [];
  for (const token of cytokens) {
    const tokenBalances = balances.get(token.address);
    if (!tokenBalances) continue;

    let totalAverage = 0n;
    let totalPenalties = 0n;
    let totalBounties = 0n;
    let totalFinal = 0n;
    for (const bal of tokenBalances.values()) {
      totalAverage += bal.average;
      totalPenalties += bal.penalty;
      totalBounties += bal.bounty;
      totalFinal += bal.final;
    }

    summaries.push({
      name: token.name,
      totalAverage,
      totalPenalties,
      totalBounties,
      totalFinal,
      verified: totalAverage - totalPenalties + totalBounties === totalFinal,
    });
  }
  return summaries;
}

/** Sum rewards across all tokens to get total reward per address */
export function aggregateRewardsPerAddress(
  rewardsPerToken: RewardsPerToken,
): Map<string, bigint> {
  const totals = new Map<string, bigint>();
  for (const rewardsPerAddress of rewardsPerToken.values()) {
    for (const [address, reward] of rewardsPerAddress) {
      totals.set(address, (totals.get(address) || 0n) + reward);
    }
  }
  return totals;
}

/** Sort addresses by total reward descending, with deterministic address tiebreaker */
export function sortAddressesByReward(rewards: Map<string, bigint>): string[] {
  return Array.from(rewards.keys()).sort((a, b) => {
    const valueB = rewards.get(b) ?? 0n;
    const valueA = rewards.get(a) ?? 0n;
    if (valueB > valueA) return 1;
    if (valueB < valueA) return -1;
    return a.localeCompare(b);
  });
}

export function filterZeroRewards(
  addresses: string[],
  rewards: Map<string, bigint>,
): string[] {
  return addresses.filter((address) => (rewards.get(address) || 0n) !== 0n);
}

/** Format the rewards CSV with address and amount columns */
export function formatRewardsCsv(
  addresses: string[],
  rewards: Map<string, bigint>,
): string[] {
  const header =
    REWARDS_CSV_COLUMN_HEADER_ADDRESS + "," + REWARDS_CSV_COLUMN_HEADER_REWARD;
  const rows = addresses.map(
    (address) => `${address},${rewards.get(address) || 0n}`,
  );
  return [header, ...rows];
}

/**
 * Formats the full balances CSV with per-token snapshot values, averages, penalties, bounties, finals, rewards, and total.
 * @param addresses - Sorted list of addresses to include
 * @param cytokens - Token definitions for column generation
 * @param snapshots - Snapshot block numbers (for column headers)
 * @param balances - Per-token per-account eligible balances
 * @param rewardsPerToken - Per-token per-account reward amounts
 * @param totalRewardsPerAddress - Aggregated total rewards per address
 * @returns Array of CSV lines (header + data rows)
 */
export function formatBalancesCsv(
  addresses: string[],
  cytokens: CyToken[],
  snapshots: number[],
  balances: EligibleBalances,
  rewardsPerToken: RewardsPerToken,
  totalRewardsPerAddress: Map<string, bigint>,
): string[] {
  const tokenColumns = cytokens
    .map(
      (token) =>
        `${snapshots.map((_s, i) => `${token.name}_snapshot${i + 1}`).join(",")},${token.name}_average,${token.name}_penalty,${token.name}_bounty,${token.name}_final,${token.name}_rewards`,
    )
    .join(",");

  const header = `address,${tokenColumns},total_rewards`;
  const rows = addresses.map((address) => {
    const tokenValues = cytokens
      .map((token) => {
        const tokenBalances = balances.get(token.address);
        const snapshotsDefault = new Array(snapshots.length)
          .fill("0")
          .join(",");
        if (!tokenBalances) return `${snapshotsDefault},0,0,0,0,0`;
        const tokenBalance = tokenBalances.get(address);
        if (!tokenBalance) return `${snapshotsDefault},0,0,0,0,0`;
        return `${tokenBalance.snapshots.join(",")},${tokenBalance.average},${tokenBalance.penalty},${tokenBalance.bounty},${tokenBalance.final},${rewardsPerToken.get(token.address)?.get(address) ?? 0n}`;
      })
      .join(",");

    return `${address},${tokenValues},${totalRewardsPerAddress.get(address) || 0n}`;
  });

  return [header, ...rows];
}

/** Parse newline-delimited JSON (JSONL) with optional per-item validation */
export function parseJsonl<T = any>(
  data: string,
  validate?: (item: unknown) => T,
): T[] {
  const lines = data.split("\n");
  const results: T[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i]) continue;
    try {
      const parsed = JSON.parse(lines[i]);
      results.push(validate ? validate(parsed) : parsed);
    } catch (e) {
      throw new Error(
        `Failed to parse JSON at line ${i + 1}: ${(e as Error).message}`,
      );
    }
  }
  return results;
}

export function verifyRewardPoolTolerance(
  totalRewards: bigint,
  rewardPool: bigint,
): void {
  if (totalRewards > rewardPool) {
    throw new Error(
      `Over-distribution: totalRewards ${totalRewards} > rewardPool ${rewardPool} (diff: ${totalRewards - rewardPool})`,
    );
  }
  const underDistribution = rewardPool - totalRewards;
  if (underDistribution > rewardPool / 1000n) {
    throw new Error(`Under-distribution too large: ${underDistribution}`);
  }
}

/** Parse blocklist file: one "reporter cheater" address pair per line, whitespace-separated */
export function parseBlocklist(data: string): BlocklistReport[] {
  const cheaters = new Set<string>();
  return data
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const parts = line.trim().split(/\s+/);
      if (parts.length !== 2) {
        throw new Error(
          `Blocklist line must have exactly 2 space-separated addresses, got ${parts.length}: "${line}"`,
        );
      }
      const [reporter, reported] = parts;
      validateAddress(reporter, "reporter address");
      validateAddress(reported, "cheater address");
      const cheater = reported.toLowerCase();
      if (cheaters.has(cheater)) {
        throw new Error(
          `Blocklist contains duplicate cheater address: ${cheater}`,
        );
      }
      cheaters.add(cheater);
      return {
        reporter: reporter.toLowerCase(),
        cheater,
      };
    });
}

export function parsePools(data: string): `0x${string}`[] {
  const parsed = JSON.parse(data);
  if (!Array.isArray(parsed)) {
    throw new Error(`pools data must be a JSON array, got ${typeof parsed}`);
  }
  for (let i = 0; i < parsed.length; i++) {
    if (typeof parsed[i] !== "string") {
      throw new Error(
        `pools entry ${i} must be a string, got ${typeof parsed[i]}`,
      );
    }
    validateAddress(parsed[i], `pools entry ${i}`);
  }
  return parsed.map((p: string) => p.toLowerCase() as `0x${string}`);
}
