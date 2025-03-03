import { readFile, writeFile, mkdir } from "fs/promises";
import { Processor } from "./processor.js";
import { config } from "dotenv";
import { CYTOKENS } from "./config.js";

// Load environment variables
config();

const SNAPSHOT_BLOCK_1 = parseInt(process.env.SNAPSHOT_BLOCK_1 || "0");
const SNAPSHOT_BLOCK_2 = parseInt(process.env.SNAPSHOT_BLOCK_2 || "0");
const REWARD_POOL = 1000000000000000000000000n; // 1M rFLR (1e6 * 1e18)

// Must match expected structure
// https://github.com/flare-foundation/rnat-distribution-tool/blob/main/README.md#add-csv-file-with-rewards-data
const REWARDS_CSV_COLUMN_HEADER_ADDRESS = "recipient address";
const REWARDS_CSV_COLUMN_HEADER_REWARD = "amount wei";

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

  // Setup processor with snapshot blocks and blocklist
  console.log("Setting up processor...");
  const processor = new Processor(SNAPSHOT_BLOCK_1, SNAPSHOT_BLOCK_2, reports);

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
  const totalSnapshot1 = balances.totalSnapshot1Balances.reduce(
    (sum: bigint, bal: bigint) => sum + bal,
    0n
  );
  const totalSnapshot2 = balances.totalSnapshot2Balances.reduce(
    (sum: bigint, bal: bigint) => sum + bal,
    0n
  );
  const totalAverage = balances.totalAverageBalances.reduce(
    (sum: bigint, bal: bigint) => sum + bal,
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

  // Add per-token balance logging
  for (const token of CYTOKENS) {
    const tokenBalances = balances.balancesByToken.get(
      token.address.toLowerCase()
    );
    if (!tokenBalances) continue;

    const tokenTotal = tokenBalances.reduce(
      (sum, bal) => sum + bal.average,
      0n
    );
    console.log(`${token.name} Average Total: ${tokenTotal.toString()}`);
  }

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

  // Write balances with per-token data
  console.log("Writing balances...");
  const tokenColumns = CYTOKENS.map(
    (token) =>
      `${token.name}_snapshot1,${token.name}_snapshot2,${token.name}_average`
  ).join(",");

  const balancesOutput = [
    `address,${tokenColumns},total_snapshot1,total_snapshot2,total_average,penalty,bounty,final_balance`,
  ];

  for (let i = 0; i < balances.addresses.length; i++) {
    const tokenValues = CYTOKENS.map((token) => {
      const tokenBalance = balances.balancesByToken.get(
        token.address.toLowerCase()
      )![i];
      return `${tokenBalance.snapshot1},${tokenBalance.snapshot2},${tokenBalance.average}`;
    }).join(",");

    balancesOutput.push(
      `${balances.addresses[i]},` +
        `${tokenValues},` +
        `${balances.totalSnapshot1Balances[i]},` +
        `${balances.totalSnapshot2Balances[i]},` +
        `${balances.totalAverageBalances[i]},` +
        `${balances.penalties[i]},` +
        `${balances.bounties[i]},` +
        `${balances.finalBalances[i]}`
    );
  }
  await writeFile(
    "output/balances-" + SNAPSHOT_BLOCK_1 + "-" + SNAPSHOT_BLOCK_2 + ".csv",
    balancesOutput.join("\n")
  );
  console.log(
    `Wrote ${balances.addresses.length} balances to output/balances.csv`
  );

  // Calculate and write rewards
  console.log("Calculating rewards...");
  const { addresses, rewards } = await processor.calculateRewards(REWARD_POOL);
  const rewardsOutput = [
    REWARDS_CSV_COLUMN_HEADER_ADDRESS + "," + REWARDS_CSV_COLUMN_HEADER_REWARD,
  ];
  for (let i = 0; i < addresses.length; i++) {
    rewardsOutput.push(`${addresses[i]},${rewards[i]}`);
  }
  await writeFile(
    "output/rewards-" + SNAPSHOT_BLOCK_1 + "-" + SNAPSHOT_BLOCK_2 + ".csv",
    rewardsOutput.join("\n")
  );
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
