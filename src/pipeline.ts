import { REWARDS_CSV_COLUMN_HEADER_ADDRESS, REWARDS_CSV_COLUMN_HEADER_REWARD } from "./constants";
import { CyToken, EligibleBalances, RewardsPerToken } from "./types";

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

export function parseJsonl(data: string): any[] {
  return data
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function parseBlocklist(data: string): {reporter: string; cheater: string}[] {
  return data
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [reporter, reported] = line.split(" ");
      return {
        reporter: reporter.toLowerCase(),
        cheater: reported.toLowerCase(),
      };
    });
}
