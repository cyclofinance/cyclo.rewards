import { readFileSync, writeFileSync } from "fs";
import { REWARD_POOL, REWARDS_CSV_COLUMN_HEADER_ADDRESS, REWARDS_CSV_COLUMN_HEADER_REWARD } from "./constants";

export const DISTRIBUTED_COUNT = 101 as const;

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
    list.push({address: address.toLowerCase(), reward: BigInt(rewardStr)});
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

function main() {
    console.log("Running script for Dec2025 rewards case:\n")
    const newRewards = readCsv("./output/rewards-51504517-52994045.csv");
    const oldRewards = readCsv("./output/rewards-51504517-52994045-old.csv");

    const result = calculateDiff(newRewards, oldRewards, DISTRIBUTED_COUNT, REWARD_POOL);

    // write to files
    const header = REWARDS_CSV_COLUMN_HEADER_ADDRESS + "," + REWARDS_CSV_COLUMN_HEADER_REWARD;
    let tmp = [header]
    for (const item of result.covered) {
        tmp.push(`${item.address},${item.reward}`);
    }
    writeFileSync(
        "output/rewards-51504517-52994045-remainingCovered.csv",
        tmp.join("\n")
    );

    tmp = [header]
    for (const item of result.uncovered) {
        tmp.push(`${item.address},${item.reward}`);
    }
    writeFileSync(
        "output/rewards-51504517-52994045-remainingUncovered.csv",
        tmp.join("\n")
    );

    tmp = [REWARDS_CSV_COLUMN_HEADER_ADDRESS + ",old,new,diff"]
    for (const item of result.underpaid) {
        tmp.push(`${item.address},${item.old},${item.new},${item.diff}`);
    }
    writeFileSync(
        "output/rewards-51504517-52994045-diff.csv",
        tmp.join("\n")
    );

    // report
    console.log("Total rFLR already paid:", result.totalAlreadyPaid)
    console.log("Total unpaid rFLR remaining:", result.remainingRewards)
    console.log("Total new distributions for covered accounts:", result.totalNewDistribution)
    console.log("Total remaining undistributed rewards (from 1M rewards) after new payments:", result.remainingRewardsDiff)
    console.log("Total remaining uncovered accounts:", result.totalRemainingUncovered)
    console.log("Total for those 3 accounts who got less:", result.totalUnderpaid)
    console.log("Total EXTRA needed to complete all payments:", result.totalUnderpaid + result.totalRemainingUncovered - result.remainingRewardsDiff)
}

// run the script
main()
