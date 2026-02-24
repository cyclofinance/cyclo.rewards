import { RewardsPerToken } from "./types";

export function aggregateRewardsPerAddress(rewardsPerToken: RewardsPerToken): Map<string, bigint> {
  const totals = new Map<string, bigint>();
  for (const rewardsPerAddress of rewardsPerToken.values()) {
    for (const [address, reward] of rewardsPerAddress) {
      totals.set(address, (totals.get(address) || 0n) + reward);
    }
  }
  return totals;
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
