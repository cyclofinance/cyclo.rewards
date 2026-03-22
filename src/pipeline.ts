import { readFile } from "fs/promises";
import { REWARDS_CSV_COLUMN_HEADER_ADDRESS, REWARDS_CSV_COLUMN_HEADER_REWARD } from "./constants";
import { validateAddress } from "./constants";
import { CyToken, EligibleBalances, RewardsPerToken, BlocklistReport, Transfer, LiquidityChange, LiquidityChangeType } from "./types";

const VALID_CHANGE_TYPES = Object.values(LiquidityChangeType);
const VALID_TX_HASH_REGEX = /^0x[0-9a-fA-F]{64}$/;

export function validateTransfer(item: unknown): Transfer {
  const t = item as Record<string, unknown>;
  if (typeof t.from !== "string") throw new Error(`Transfer missing or invalid 'from'`);
  if (typeof t.to !== "string") throw new Error(`Transfer missing or invalid 'to'`);
  if (typeof t.tokenAddress !== "string") throw new Error(`Transfer missing or invalid 'tokenAddress'`);
  if (typeof t.transactionHash !== "string" || !VALID_TX_HASH_REGEX.test(t.transactionHash)) throw new Error(`Transfer missing or invalid 'transactionHash': "${t.transactionHash}"`);
  if (typeof t.value !== "string" || !/^\d+$/.test(t.value)) throw new Error(`Transfer missing or invalid 'value': "${t.value}"`);
  if (!Number.isInteger(t.blockNumber) || (t.blockNumber as number) < 0) throw new Error(`Transfer missing or invalid 'blockNumber': ${t.blockNumber}`);
  if (!Number.isInteger(t.timestamp) || (t.timestamp as number) < 0) throw new Error(`Transfer missing or invalid 'timestamp': ${t.timestamp}`);
  validateAddress(t.from, "from");
  validateAddress(t.to, "to");
  validateAddress(t.tokenAddress, "tokenAddress");
  return t as unknown as Transfer;
}

export function validateLiquidityChange(item: unknown): LiquidityChange {
  const t = item as Record<string, unknown>;
  if (typeof t.tokenAddress !== "string") throw new Error(`LiquidityChange missing or invalid 'tokenAddress'`);
  if (typeof t.lpAddress !== "string") throw new Error(`LiquidityChange missing or invalid 'lpAddress'`);
  if (typeof t.owner !== "string") throw new Error(`LiquidityChange missing or invalid 'owner'`);
  if (typeof t.transactionHash !== "string" || !VALID_TX_HASH_REGEX.test(t.transactionHash)) throw new Error(`LiquidityChange missing or invalid 'transactionHash': "${t.transactionHash}"`);
  if (typeof t.changeType !== "string" || !VALID_CHANGE_TYPES.includes(t.changeType as LiquidityChangeType)) throw new Error(`LiquidityChange invalid 'changeType': "${t.changeType}"`);
  if (typeof t.liquidityChange !== "string" || !/^-?\d+$/.test(t.liquidityChange)) throw new Error(`LiquidityChange invalid 'liquidityChange': "${t.liquidityChange}"`);
  if (typeof t.depositedBalanceChange !== "string" || !/^-?\d+$/.test(t.depositedBalanceChange)) throw new Error(`LiquidityChange invalid 'depositedBalanceChange': "${t.depositedBalanceChange}"`);
  if (!Number.isInteger(t.blockNumber) || (t.blockNumber as number) < 0) throw new Error(`LiquidityChange invalid 'blockNumber': ${t.blockNumber}`);
  if (!Number.isInteger(t.timestamp) || (t.timestamp as number) < 0) throw new Error(`LiquidityChange invalid 'timestamp': ${t.timestamp}`);
  validateAddress(t.tokenAddress, "tokenAddress");
  validateAddress(t.lpAddress, "lpAddress");
  validateAddress(t.owner, "owner");

  if (t.__typename === "LiquidityV3Change") {
    if (typeof t.poolAddress !== "string") throw new Error(`LiquidityChangeV3 missing 'poolAddress'`);
    validateAddress(t.poolAddress, "poolAddress");
    if (typeof t.tokenId !== "string" || t.tokenId.length === 0) throw new Error(`LiquidityChangeV3 missing or empty 'tokenId'`);
    if (!Number.isInteger(t.fee)) throw new Error(`LiquidityChangeV3 invalid 'fee': ${t.fee}`);
    if (!Number.isInteger(t.lowerTick)) throw new Error(`LiquidityChangeV3 invalid 'lowerTick': ${t.lowerTick}`);
    if (!Number.isInteger(t.upperTick)) throw new Error(`LiquidityChangeV3 invalid 'upperTick': ${t.upperTick}`);
  } else if (t.__typename !== "LiquidityV2Change") {
    throw new Error(`LiquidityChange invalid '__typename': "${t.__typename}"`);
  }

  return t as unknown as LiquidityChange;
}

export async function readOptionalFile(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (e: any) {
    if (e?.code === "ENOENT") return "";
    throw e;
  }
}

export interface TokenSummary {
  name: string;
  totalAverage: bigint;
  totalPenalties: bigint;
  totalBounties: bigint;
  totalFinal: bigint;
  verified: boolean;
}

export function summarizeTokenBalances(balances: EligibleBalances, cytokens: CyToken[]): TokenSummary[] {
  const summaries: TokenSummary[] = [];
  for (const token of cytokens) {
    const tokenBalances = balances.get(token.address.toLowerCase());
    if (!tokenBalances) continue;

    const totalAverage = Array.from(tokenBalances.values()).reduce((sum, bal) => sum + bal.average, 0n);
    const totalPenalties = Array.from(tokenBalances.values()).reduce((sum, bal) => sum + bal.penalty, 0n);
    const totalBounties = Array.from(tokenBalances.values()).reduce((sum, bal) => sum + bal.bounty, 0n);
    const totalFinal = Array.from(tokenBalances.values()).reduce((sum, bal) => sum + bal.final, 0n);

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

export function aggregateRewardsPerAddress(rewardsPerToken: RewardsPerToken): Map<string, bigint> {
  const totals = new Map<string, bigint>();
  for (const rewardsPerAddress of rewardsPerToken.values()) {
    for (const [address, reward] of rewardsPerAddress) {
      totals.set(address, (totals.get(address) || 0n) + reward);
    }
  }
  return totals;
}

export function sortAddressesByReward(rewards: Map<string, bigint>): string[] {
  return Array.from(rewards.keys()).sort((a, b) => {
    const valueB = rewards.get(b)!;
    const valueA = rewards.get(a)!;
    return valueB > valueA ? 1 : valueB < valueA ? -1 : 0;
  });
}

export function filterZeroRewards(addresses: string[], rewards: Map<string, bigint>): string[] {
  return addresses.filter((address) => (rewards.get(address) || 0n) !== 0n);
}

export function formatRewardsCsv(addresses: string[], rewards: Map<string, bigint>): string[] {
  const header = REWARDS_CSV_COLUMN_HEADER_ADDRESS + "," + REWARDS_CSV_COLUMN_HEADER_REWARD;
  const rows = addresses.map(
    (address) => `${address},${rewards.get(address) || 0n}`
  );
  return [header, ...rows];
}

export function formatBalancesCsv(
  addresses: string[],
  cytokens: CyToken[],
  snapshots: number[],
  balances: EligibleBalances,
  rewardsPerToken: RewardsPerToken,
  totalRewardsPerAddress: Map<string, bigint>,
): string[] {
  const tokenColumns = cytokens.map(
    (token) =>
      `${snapshots.map((_s, i) => `${token.name}_snapshot${i + 1}`).join(",")},${token.name}_average,${token.name}_penalty,${token.name}_bounty,${token.name}_final,${token.name}_rewards`
  ).join(",");

  const header = `address,${tokenColumns},total_rewards`;
  const rows = addresses.map((address) => {
    const tokenValues = cytokens.map((token) => {
      const tokenBalances = balances.get(token.address.toLowerCase());
      const snapshotsDefault = new Array(snapshots.length).fill("0").join(",");
      if (!tokenBalances) return `${snapshotsDefault},0,0,0,0,0`;
      const tokenBalance = tokenBalances.get(address);
      if (!tokenBalance) return `${snapshotsDefault},0,0,0,0,0`;
      return `${tokenBalance.snapshots.join(",")},${tokenBalance.average},${tokenBalance.penalty},${tokenBalance.bounty},${tokenBalance.final},${rewardsPerToken.get(token.address.toLowerCase())?.get(address) ?? 0n}`;
    }).join(",");

    return `${address},${tokenValues},${totalRewardsPerAddress.get(address) || 0n}`;
  });

  return [header, ...rows];
}

export function parseJsonl<T = any>(data: string, validate?: (item: unknown) => T): T[] {
  const lines = data.split("\n");
  const results: T[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i]) continue;
    try {
      const parsed = JSON.parse(lines[i]);
      results.push(validate ? validate(parsed) : parsed);
    } catch (e) {
      throw new Error(`Failed to parse JSON at line ${i + 1}: ${(e as Error).message}`);
    }
  }
  return results;
}

export function parseBlocklist(data: string): BlocklistReport[] {
  return data
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(" ");
      if (parts.length !== 2) {
        throw new Error(`Blocklist line must have exactly 2 space-separated addresses, got ${parts.length}: "${line}"`);
      }
      const [reporter, reported] = parts;
      validateAddress(reporter, "reporter address");
      validateAddress(reported, "cheater address");
      return {
        reporter: reporter.toLowerCase(),
        cheater: reported.toLowerCase(),
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
      throw new Error(`pools entry ${i} must be a string, got ${typeof parsed[i]}`);
    }
    validateAddress(parsed[i], `pools entry ${i}`);
  }
  return parsed;
}
