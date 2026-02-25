import { readFile, writeFile, mkdir } from "fs/promises";
import { Processor } from "./processor.js";
import { config } from "dotenv";
import { CYTOKENS, generateSnapshotBlocks, parseEnv } from "./config";
import { aggregateRewardsPerAddress, filterZeroRewards, formatBalancesCsv, formatRewardsCsv, parseBlocklist, parseJsonl, sortAddressesByReward, summarizeTokenBalances } from "./pipeline";
import { REWARD_POOL } from "./constants";
import { Transfer } from "./types";

// Load environment variables
config();

async function main() {
  const { seed: SEED, startSnapshot: START_SNAPSHOT, endSnapshot: END_SNAPSHOT } = parseEnv();

  // generate snapshot blocks
  const SNAPSHOTS = generateSnapshotBlocks(SEED, START_SNAPSHOT, END_SNAPSHOT);

  // Create output directory if it doesn't exist
  await mkdir("output", { recursive: true });

  // write generated snapshots
  await writeFile(
    "output/snapshots-" + START_SNAPSHOT + "-" + END_SNAPSHOT + ".txt",
    SNAPSHOTS.join("\n")
  );

  console.log("Starting processor...");
  console.log(`Snapshot blocks: ${START_SNAPSHOT}, ${END_SNAPSHOT}`);

  // Read transfers file
  console.log("Reading transfers file...");
  let transfers: Transfer[] = []
  for (let i = 0; i < 10; i++) {
    const transfersData = await readFile(`data/transfers${i + 1}.dat`, "utf8").catch(() => "");
    transfers = [...transfers, ...parseJsonl(transfersData)]
  }
  console.log(`Found ${transfers.length} transfers`);

  // Read liquidity file
  console.log("Reading liquidity file...");
  const liquidityData = await readFile("data/liquidity.dat", "utf8");
  const liquidities = parseJsonl(liquidityData);
  console.log(`Found ${liquidities.length} liquidity changes`);

  // Read pools file
  console.log("Reading pools file...");
  const poolsData = await readFile("data/pools.dat", "utf8");
  const pools = JSON.parse(poolsData);
  console.log(`Found ${pools.length} pools`);

  // Read blocklist
  console.log("Reading blocklist...");
  const blocklistData = await readFile("data/blocklist.txt", "utf8");
  const reports = parseBlocklist(blocklistData);
  console.log(`Found ${reports.length} reports`);

  // Setup processor with snapshot blocks and blocklist
  console.log("Setting up processor...");
  const processor = new Processor(SNAPSHOTS, reports, undefined, pools);

  // Organize liquidity changes
  console.log(`Organizing ${liquidities.length} liquidity change events...`);
  for (const liquidity of liquidities) {
    await processor.organizeLiquidityPositions(liquidity);
  }

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

  // Process liquidity changes
  console.log(`Processing ${liquidities.length} liquidity change events...`);
  let liquidityProcessedCount = 0;
  for (const liquidity of liquidities) {
    await processor.processLiquidityPositions(liquidity);
    liquidityProcessedCount++;

    if (liquidityProcessedCount % 1000 === 0) {
      console.log(`Processed ${liquidityProcessedCount} liquidity change events`);
    }
  }

  // Process liquidity v3 price range
  console.log(`Processing ${pools.length} v3 pools price range for all accounts...`);
  await processor.processLpRange();
  console.log(`Processed ${pools.length} v3 pools price range for all accounts`);

  // Get eligible balances
  console.log("Getting eligible balances...");
  const balances = await processor.getEligibleBalances();

  // Add per-token balance logging
  for (const summary of summarizeTokenBalances(balances, CYTOKENS)) {
    console.log("Getting token balances for ", summary.name);
    console.log("- Total Avg:", summary.totalAverage.toString());
    console.log("- Total Penalties:", summary.totalPenalties.toString());
    console.log("- Total Bounties:", summary.totalBounties.toString());
    console.log("- Total Final:", summary.totalFinal.toString());
    console.log(
      `Note: Final Total for ${summary.name} should equal Average Total - Penalties + Bounties`
    );
    if (!summary.verified) {
      throw new Error(`Balance verification failed for ${summary.name}: totalAverage - totalPenalties + totalBounties !== totalFinal`);
    }
    console.log("Verification: ✓");
  }

  // Write balances with per-token data
  console.log("Writing balances...");
  const rewardsPerToken = await processor.calculateRewards(REWARD_POOL);
  const totalRewardsPerAddress = aggregateRewardsPerAddress(rewardsPerToken);
  const addresses = sortAddressesByReward(totalRewardsPerAddress);
  const balancesOutput = formatBalancesCsv(addresses, CYTOKENS, SNAPSHOTS, balances, rewardsPerToken, totalRewardsPerAddress);
  await writeFile(
    "output/balances-" + START_SNAPSHOT + "-" + END_SNAPSHOT + ".csv",
    balancesOutput.join("\n")
  );
  console.log(`Wrote ${addresses.length} balances to output/balances.csv`);

  // Calculate and write rewards
  console.log("Calculating rewards...");

  // remove any addresses with no rewards
  const rewardedAddresses = filterZeroRewards(addresses, totalRewardsPerAddress);
  const rewardsOutput = formatRewardsCsv(rewardedAddresses, totalRewardsPerAddress);
  await writeFile(
    "output/rewards-" + START_SNAPSHOT + "-" + END_SNAPSHOT + ".csv",
    rewardsOutput.join("\n")
  );
  console.log(`Wrote ${rewardedAddresses.length} rewards to output/rewards.csv`);

  // Verify total rewards equals reward pool
  const totalRewards = Array.from(totalRewardsPerAddress.values()).reduce(
    (sum, reward) => sum + reward,
    0n
  );
  const diff = totalRewards - REWARD_POOL;
  console.log(`\nTotal rewards: ${totalRewards}`);
  console.log(`Reward pool: ${REWARD_POOL}`);
  console.log(`Difference: ${diff}`);
  if (diff < 0n ? -diff > REWARD_POOL / 1000n : diff > REWARD_POOL / 1000n) {
    throw new Error(`Reward pool difference too large: ${diff}`);
  }

  console.log("Done!");
}

main().catch((error) => {
  console.error("Error occurred:", error);
  process.exit(1);
});
