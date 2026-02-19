import { readFileSync, writeFileSync } from "fs";
import { REWARD_POOL } from "./constants";

const DISTRIBUTED_COUNT = 101 as const;

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

function main() {
    console.log("Running script for Dec2025 rewards case:\n")
    const newRewards = readCsv("./output/rewards-51504517-52994045.csv");
    const oldRewards = readCsv("./output/rewards-51504517-52994045-old.csv");

    // clone for removing already distirbuted accounts from list
    const remainingUndistributed = structuredClone(newRewards);
    let totalAlreadyPaid = 0n;
    let totalOldAccountsWhoReceievedLess = 0n
    const oldAccountsThatReceivedLess = [];

    // gather all undistruibuted and thos who received less than they should have
    for (let i = 0; i < DISTRIBUTED_COUNT; i++) {
        const oldItem = oldRewards[i];
        totalAlreadyPaid += oldRewards[i].reward;

        const index = remainingUndistributed.findIndex((v) => v.address.toLowerCase() === oldItem.address.toLowerCase());
        if (index > -1) {
            const newItem = remainingUndistributed[index]
            const diff = newItem.reward - oldItem.reward
            if (diff > 0n) {
                oldAccountsThatReceivedLess.push({
                    address: newItem.address,
                    old: oldItem.reward,
                    new: newItem.reward,
                    diff
                })
                totalOldAccountsWhoReceievedLess += diff
            }
            remainingUndistributed.splice(index, 1);
        }
    }

    // calculate those who can be paid with remaining rewards and those who cant
    const remainingRewards = REWARD_POOL - totalAlreadyPaid;
    let remainingRewardsDiff = remainingRewards;
    let totalNewDistribution = 0n;
    let totalRemainingUncovered = 0n;
    const remainingCovers = [];
    const remainingNotCovers = [];
    for (let i = 0; i < remainingUndistributed.length; i++) {
        const item = remainingUndistributed[i];
        const diff = remainingRewardsDiff - item.reward;
        if (diff < 0n) {
            totalRemainingUncovered += item.reward
            remainingNotCovers.push(item)
        } else {
            remainingCovers.push(item)
            totalNewDistribution += item.reward
            remainingRewardsDiff -= item.reward
        }
    }

    // write to files
    const header = "recipient address,amount wei";
    let tmp = [header]
    for (const item of remainingCovers) {
        tmp.push(`${item.address},${item.reward}`);
    }
    writeFileSync(
        "output/rewards-51504517-52994045-remainingCovered.csv",
        tmp.join("\n")
    );

    tmp = [header]
    for (const item of remainingNotCovers) {
        tmp.push(`${item.address},${item.reward}`);
    }
    writeFileSync(
        "output/rewards-51504517-52994045-remainingUncovered.csv",
        tmp.join("\n")
    );

    tmp = ["recipient address,old,new,diff"]
    for (const item of oldAccountsThatReceivedLess) {
        tmp.push(`${item.address},${item.old},${item.new},${item.diff}`);
    }
    writeFileSync(
        "output/rewards-51504517-52994045-diff.csv",
        tmp.join("\n")
    );

    // report
    console.log("Total rFLR already paid:", totalAlreadyPaid)
    console.log("Total unpaid rFLR remaining:", remainingRewards)
    console.log("Total new distributions for covered accounts:", totalNewDistribution)
    console.log("Total remaining undistributed rewards (from 1M rewards) after new payments:", remainingRewardsDiff)
    console.log("Total remaining uncovered accounts:", totalRemainingUncovered)
    console.log("Total for those 3 accounts who got less:", totalOldAccountsWhoReceievedLess)
    console.log("Total EXTRA needed to complete all payments:", totalOldAccountsWhoReceievedLess + totalRemainingUncovered - remainingRewardsDiff)
}

// run the script
main()
