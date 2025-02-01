import { createPublicClient, http } from "viem";
import { readFile, writeFile, mkdir } from "fs/promises";
import { Processor } from "./processor.js";
import { config } from "dotenv";

// Load environment variables
config();

const SNAPSHOT_BLOCK_1 = parseInt(process.env.SNAPSHOT_BLOCK_1 || "0");
const SNAPSHOT_BLOCK_2 = parseInt(process.env.SNAPSHOT_BLOCK_2 || "0");
const REWARD_POOL = 1000000000000000000000000n; // 1M rFLR (1e6 * 1e18)

// Must match expected structure
// https://github.com/flare-foundation/rnat-distribution-tool/blob/main/README.md#add-csv-file-with-rewards-data
const REWARDS_CSV_COLUMN_HEADER_ADDRESS = "recipient address";
const REWARDS_CSV_COLUMN_HEADER_REWARD = "reward amount";

async function main() {
  console.log("Starting processor...");
  console.log(`Snapshot blocks: ${SNAPSHOT_BLOCK_1}, ${SNAPSHOT_BLOCK_2}`);

  // Create output directory if it doesn't exist
  await mkdir("output", { recursive: true });

  // Read transfers file
  console.log("Reading transfers file...");
  const transfersData = await readFile("data/transfers.dat", "utf8");
  const transfers = transfersData
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  console.log(`Found ${transfers.length} transfers`);

  // Read blocklist
  console.log("Reading blocklist...");
  const blocklistData = await readFile("data/blocklist.txt", "utf8");
  const reports = blocklistData
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [reporter, reported] = line.split(" ");
      return {
        reporter: reporter.toLowerCase(),
        cheater: reported.toLowerCase(),
      };
    });
  console.log(`Found ${reports.length} reports`);

  // Get just the blocklisted addresses for the processor
  const blocklist = reports.map((report) => report.cheater);
  console.log(`Found ${blocklist.length} unique blocklisted addresses`);

  // Setup processor with snapshot blocks and blocklist
  console.log("Setting up processor...");
  const processor = new Processor(
    SNAPSHOT_BLOCK_1,
    SNAPSHOT_BLOCK_2,
    blocklist,
    reports
  );

  // Process transfers
  console.log(`Processing ${transfers.length} transfers...`);
  let processedCount = 0;
  for (const transfer of transfers) {
    await processor.processTransfer(transfer);
    processedCount++;

    if (processedCount % 1000 === 0) {
      console.log(`Processed ${processedCount} transfers`);
    }
  }

  // Get eligible balances
  console.log("Getting eligible balances...");
  const balances = await processor.getEligibleBalances();

  // Calculate totals
  const totalSnapshot1 = balances.snapshot1Balances.reduce(
    (sum, bal) => sum + bal,
    0n
  );
  const totalSnapshot2 = balances.snapshot2Balances.reduce(
    (sum, bal) => sum + bal,
    0n
  );
  const totalAverage = balances.averageBalances.reduce(
    (sum, bal) => sum + bal,
    0n
  );
  const totalPenalties = balances.penalties.reduce(
    (sum, penalty) => sum + penalty,
    0n
  );
  const totalBounties = balances.bounties.reduce(
    (sum, bounty) => sum + bounty,
    0n
  );
  const totalFinal = balances.finalBalances.reduce((sum, bal) => sum + bal, 0n);

  console.log("\nTotals:");
  console.log(`Snapshot 1 Total: ${totalSnapshot1.toString()}`);
  console.log(`Snapshot 2 Total: ${totalSnapshot2.toString()}`);
  console.log(`Average Total: ${totalAverage.toString()}`);
  console.log(`Total Penalties: ${totalPenalties.toString()}`);
  console.log(`Total Bounties: ${totalBounties.toString()}`);
  console.log(`Final Total: ${totalFinal.toString()}`);
  console.log(
    `Note: Final Total should equal Average Total - Penalties + Bounties`
  );
  console.log(
    `Verification: ${
      totalAverage - totalPenalties + totalBounties === totalFinal ? "✓" : "✗"
    }`
  );

  // Write balances
  console.log("Writing balances...");
  const balancesOutput = [
    "address,balance_snapshot1,balance_snapshot2,average_balance,penalty,bounty,final_balance",
  ];
  for (let i = 0; i < balances.addresses.length; i++) {
    balancesOutput.push(
      `${balances.addresses[i]},` +
        `${balances.snapshot1Balances[i]},` +
        `${balances.snapshot2Balances[i]},` +
        `${balances.averageBalances[i]},` +
        `${balances.penalties[i]},` +
        `${balances.bounties[i]},` +
        `${balances.finalBalances[i]}`
    );
  }
  await writeFile("output/balances-" + SNAPSHOT_BLOCK_1 + "-" + SNAPSHOT_BLOCK_2 + ".csv", balancesOutput.join("\n"));
  console.log(
    `Wrote ${balances.addresses.length} balances to output/balances.csv`
  );

  // Calculate and write rewards
  console.log("Calculating rewards...");
  const { addresses, rewards } = await processor.calculateRewards(REWARD_POOL);
  const rewardsOutput = [REWARDS_CSV_COLUMN_HEADER_ADDRESS + "," + REWARDS_CSV_COLUMN_HEADER_REWARD];
  for (let i = 0; i < addresses.length; i++) {
    rewardsOutput.push(`${addresses[i]},${rewards[i]}`);
  }
  await writeFile("output/rewards-" + SNAPSHOT_BLOCK_1 + "-" + SNAPSHOT_BLOCK_2 + ".csv", rewardsOutput.join("\n"));
  console.log(`Wrote ${addresses.length} rewards to output/rewards.csv`);

  // Verify total rewards equals reward pool
  const totalRewards = rewards.reduce((sum, reward) => sum + reward, 0n);
  console.log(`\nTotal rewards: ${totalRewards}`);
  console.log(`Reward pool: ${REWARD_POOL}`);
  console.log(`Difference: ${totalRewards - REWARD_POOL}`); // Should be very small due to rounding

  console.log("Done!");
}

main().catch((error) => {
  console.error("Error occurred:", error);
  process.exit(1);
});
