import { readFileSync } from "fs";
import { validateAddress, REWARDS_CSV_COLUMN_HEADER_ADDRESS, REWARDS_CSV_COLUMN_HEADER_REWARD } from "./constants";

/** Number of accounts from the Dec 2025 epoch that were already distributed on-chain via the first disperse call */
export const DISTRIBUTED_COUNT = 100 as const;

/**
 * Reads a CSV file and returns the data as an array and map
 * @param filePath - Path to the CSV file
 */
export function readCsv(filePath: string): Array<{address: string; reward: bigint}> {
  const data = readFileSync(filePath, "utf8");
  const lines = data.split("\n").filter(Boolean);

  if (lines.length === 0) {
    throw new Error(`CSV file is empty: ${filePath}`);
  }

  if (lines.length === 1) {
    throw new Error(`CSV file has no data rows (only header): ${filePath}`);
  }

  const expectedHeader = REWARDS_CSV_COLUMN_HEADER_ADDRESS + "," + REWARDS_CSV_COLUMN_HEADER_REWARD;
  if (lines[0] !== expectedHeader) {
    throw new Error(`CSV header mismatch in ${filePath}: expected "${expectedHeader}", got "${lines[0]}"`);
  }

  // Parse remaining lines
  const list: Array<{address: string; reward: bigint}> = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map(v => v.trim());
    if (values.length < 2) {
      throw new Error(`CSV line ${i + 1} has fewer than 2 columns in ${filePath}: "${lines[i]}"`);
    }
    if (values.length > 2) {
      throw new Error(`CSV line ${i + 1} has more than 2 columns in ${filePath}: "${lines[i]}"`);
    }
    const address = values[0];
    if (!address) {
      throw new Error(`CSV line ${i + 1} has empty address in ${filePath}: "${lines[i]}"`);
    }
    const rewardStr = values[1];
    if (!rewardStr) {
      throw new Error(`CSV line ${i + 1} has empty reward in ${filePath}: "${lines[i]}"`);
    }
    validateAddress(address, `CSV line ${i + 1} address in ${filePath}`);
    const reward = BigInt(rewardStr);
    if (reward < 0n) {
      throw new Error(`CSV line ${i + 1} has negative reward in ${filePath}: "${lines[i]}"`);
    }
    list.push({address: address.toLowerCase(), reward});
  }

  return list;
}

export type RewardEntry = {address: string; reward: bigint};
export type DiffEntry = {address: string; old: bigint; new: bigint; diff: bigint};

export interface DiffResult {
  covered: RewardEntry[];
  uncovered: RewardEntry[];
  underpaid: DiffEntry[];
  totalAlreadyPaid: bigint;
  remainingRewards: bigint;
  totalNewDistribution: bigint;
  remainingRewardsDiff: bigint;
  totalRemainingUncovered: bigint;
  totalUnderpaid: bigint;
}

export function calculateDiff(
  newRewards: RewardEntry[],
  oldRewards: RewardEntry[],
  distributedCount: number,
  rewardPool: bigint,
): DiffResult {
  if (!Number.isInteger(distributedCount) || distributedCount < 0) {
    throw new Error(`distributedCount must be a non-negative integer, got ${distributedCount}`);
  }
  if (distributedCount > oldRewards.length) {
    throw new Error(`distributedCount (${distributedCount}) exceeds oldRewards length (${oldRewards.length})`);
  }

  const newAddresses = new Set(newRewards.map(r => r.address.toLowerCase()));
  if (newAddresses.size !== newRewards.length) {
    throw new Error(`newRewards contains duplicate addresses`);
  }
  const oldAddresses = new Set(oldRewards.map(r => r.address.toLowerCase()));
  if (oldAddresses.size !== oldRewards.length) {
    throw new Error(`oldRewards contains duplicate addresses`);
  }

  // clone for removing already distirbuted accounts from list
  const remainingUndistributed = structuredClone(newRewards);
  let totalAlreadyPaid = 0n;
  let totalUnderpaid = 0n;
  const underpaid: DiffEntry[] = [];

  // gather all undistruibuted and thos who received less than they should have
  for (let i = 0; i < distributedCount; i++) {
    const oldItem = oldRewards[i];
    totalAlreadyPaid += oldRewards[i].reward;

    const index = remainingUndistributed.findIndex((v) => v.address.toLowerCase() === oldItem.address.toLowerCase());
    if (index > -1) {
      const newItem = remainingUndistributed[index]
      const diff = newItem.reward - oldItem.reward
      if (diff > 0n) {
        underpaid.push({
          address: newItem.address,
          old: oldItem.reward,
          new: newItem.reward,
          diff
        })
        totalUnderpaid += diff
      }
      remainingUndistributed.splice(index, 1);
    }
  }

  // calculate those who can be paid with remaining rewards and those who cant
  const remainingRewards = rewardPool - totalAlreadyPaid;
  if (remainingRewards < 0n) {
    throw new Error(`totalAlreadyPaid (${totalAlreadyPaid}) exceeds rewardPool (${rewardPool})`);
  }
  let remainingRewardsDiff = remainingRewards;
  let totalNewDistribution = 0n;
  let totalRemainingUncovered = 0n;
  const covered: RewardEntry[] = [];
  const uncovered: RewardEntry[] = [];
  for (let i = 0; i < remainingUndistributed.length; i++) {
    const item = remainingUndistributed[i];
    const diff = remainingRewardsDiff - item.reward;
    if (diff < 0n) {
      totalRemainingUncovered += item.reward
      uncovered.push(item)
    } else {
      covered.push(item)
      totalNewDistribution += item.reward
      remainingRewardsDiff -= item.reward
    }
  }

  return {
    covered,
    uncovered,
    underpaid,
    totalAlreadyPaid,
    remainingRewards,
    totalNewDistribution,
    remainingRewardsDiff,
    totalRemainingUncovered,
    totalUnderpaid,
  };
}
