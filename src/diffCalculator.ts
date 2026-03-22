import { writeFileSync } from "fs";
import { DEC25_REWARD_POOL, REWARDS_CSV_COLUMN_HEADER_ADDRESS, REWARDS_CSV_COLUMN_HEADER_REWARD, DIFF_CSV_COLUMN_HEADER_OLD, DIFF_CSV_COLUMN_HEADER_NEW, DIFF_CSV_COLUMN_HEADER_DIFF } from "./constants";
import { readCsv, calculateDiff, DISTRIBUTED_COUNT } from "./diff";

/**
 * Dec 2025 epoch reconciliation script.
 *
 * Compares the recalculated Dec 2025 rewards (blocks 51504517–52994045) against the
 * original rewards CSV to identify underpaid accounts and compute remaining distributions.
 * File paths and block ranges are hardcoded to this specific epoch.
 */
function main() {
    console.log("Running script for Dec2025 rewards case:\n")
    const newRewards = readCsv("./output/rewards-51504517-52994045.csv");
    const oldRewards = readCsv("./output/rewards-51504517-52994045-old.csv");

    const result = calculateDiff(newRewards, oldRewards, DISTRIBUTED_COUNT, DEC25_REWARD_POOL);

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

    tmp = [REWARDS_CSV_COLUMN_HEADER_ADDRESS + "," + DIFF_CSV_COLUMN_HEADER_OLD + "," + DIFF_CSV_COLUMN_HEADER_NEW + "," + DIFF_CSV_COLUMN_HEADER_DIFF]
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
