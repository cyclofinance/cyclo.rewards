/**
 * Main pipeline entrypoint. Reads scraped data files, runs the reward processor,
 * and writes balance/reward CSVs to the output directory.
 */

import { readFile, writeFile, mkdir } from "fs/promises";
import { createPublicClient, http } from "viem";
import { flare } from "viem/chains";
import { Processor } from "./processor";
import { config } from "dotenv";
import assert from "assert";
import { CYTOKENS, generateSnapshotBlocks, parseEnv } from "./config";
import {
  aggregateRewardsPerAddress,
  filterZeroRewards,
  formatBalancesCsv,
  formatRewardsCsv,
  parseBlocklist,
  parseJsonl,
  parsePools,
  readOptionalFile,
  sortAddressesByReward,
  summarizeTokenBalances,
  normalizeTransfer,
  normalizeLiquidityChange,
  verifyRewardPoolTolerance,
} from "./pipeline";
import {
  BLOCKLIST_FILE,
  DATA_DIR,
  LIQUIDITY_FILE,
  OUTPUT_DIR,
  POOLS_FILE,
  REWARD_POOL,
  TRANSFER_FILE_COUNT,
  TRANSFERS_FILE_BASE,
} from "./constants";
import { LiquidityChange, Transfer } from "./types";

// Load environment variables
config();

/**
 * Orchestrates the full reward calculation pipeline:
 * loads env config, reads scraped transfer/liquidity/pool data files
 * (transfers split across data/transfers1.dat–transfers10.dat to stay under GitHub's 100MB limit),
 * reads pools from data/pools.dat, reads blocklist from data/blocklist.txt,
 * processes all events through the Processor, and writes output CSVs
 * (output/balances-{start}-{end}.csv, output/rewards-{start}-{end}.csv,
 * output/snapshots-{start}-{end}.txt).
 * @throws If balance verification fails or reward pool tolerance is exceeded
 */
async function main() {
  assert(process.env.RPC_URL, "RPC_URL environment variable must be set");
  const RPC_URL = process.env.RPC_URL;

  const { seed, startSnapshot, endSnapshot } = parseEnv();

  // generate snapshot blocks
  const snapshots = generateSnapshotBlocks(seed, startSnapshot, endSnapshot);

  // Create output directory if it doesn't exist
  await mkdir(OUTPUT_DIR, { recursive: true });

  // write generated snapshots
  await writeFile(
    `${OUTPUT_DIR}/snapshots-${startSnapshot}-${endSnapshot}.txt`,
    snapshots.join("\n"),
  );

  console.log("Starting processor...");
  console.log(`Snapshot blocks: ${startSnapshot}, ${endSnapshot}`);

  // Read transfers file — append per file with push to avoid quadratic copying
  console.log("Reading transfers file...");
  const transfers: Transfer[] = [];
  for (let i = 0; i < TRANSFER_FILE_COUNT; i++) {
    const transfersData = await readOptionalFile(
      `${DATA_DIR}/${TRANSFERS_FILE_BASE}${i + 1}.dat`,
    );
    for (const t of parseJsonl(transfersData, normalizeTransfer)) {
      transfers.push(t);
    }
  }
  console.log(`Found ${transfers.length} transfers`);

  // Read liquidity file
  console.log("Reading liquidity file...");
  const liquidityData = await readFile(`${DATA_DIR}/${LIQUIDITY_FILE}`, "utf8");
  const liquidities = parseJsonl(liquidityData, normalizeLiquidityChange);
  console.log(`Found ${liquidities.length} liquidity changes`);

  // Read pools file
  console.log("Reading pools file...");
  const poolsData = await readFile(`${DATA_DIR}/${POOLS_FILE}`, "utf8");
  const pools = parsePools(poolsData);
  console.log(`Found ${pools.length} pools`);

  // Read blocklist
  console.log("Reading blocklist...");
  const blocklistData = await readFile(`${DATA_DIR}/${BLOCKLIST_FILE}`, "utf8");
  const reports = parseBlocklist(blocklistData);
  console.log(`Found ${reports.length} reports`);

  // Setup processor with snapshot blocks and blocklist
  console.log("Setting up processor...");
  const client = createPublicClient({ chain: flare, transport: http(RPC_URL) });
  const processor = new Processor(snapshots, reports, client, pools);

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
      console.log(
        `Processed ${liquidityProcessedCount} liquidity change events`,
      );
    }
  }

  // Process liquidity v3 price range
  console.log(
    `Processing ${pools.length} v3 pools price range for all accounts...`,
  );
  await processor.processLpRange();
  console.log(
    `Processed ${pools.length} v3 pools price range for all accounts`,
  );

  // Get eligible balances
  console.log("Getting eligible balances...");
  const balances = await processor.getEligibleBalances();

  // Verify all token balances before proceeding
  const summaries = summarizeTokenBalances(balances, CYTOKENS);
  for (const summary of summaries) {
    if (!summary.verified) {
      throw new Error(
        `Balance verification failed for ${summary.name}: totalAverage - totalPenalties + totalBounties !== totalFinal`,
      );
    }
  }

  // Log per-token balance summaries
  for (const summary of summaries) {
    console.log(
      `${summary.name}: avg=${summary.totalAverage} penalties=${summary.totalPenalties} bounties=${summary.totalBounties} final=${summary.totalFinal} ✓`,
    );
  }

  // Write balances with per-token data
  console.log("Writing balances...");
  const rewardsPerToken = await processor.calculateRewards(
    REWARD_POOL,
    balances,
  );
  for (const token of CYTOKENS) {
    const tokenRewards = rewardsPerToken.get(token.address);
    if (tokenRewards) {
      const totalForToken = Array.from(tokenRewards.values()).reduce(
        (a, b) => a + b,
        0n,
      );
      console.log(`Total rewards for ${token.name}: ${totalForToken}`);
    }
  }
  const totalRewardsPerAddress = aggregateRewardsPerAddress(rewardsPerToken);
  const addresses = sortAddressesByReward(totalRewardsPerAddress);
  const balancesOutput = formatBalancesCsv(
    addresses,
    CYTOKENS,
    snapshots,
    balances,
    rewardsPerToken,
    totalRewardsPerAddress,
  );
  await writeFile(
    `${OUTPUT_DIR}/balances-${startSnapshot}-${endSnapshot}.csv`,
    balancesOutput.join("\n"),
  );
  console.log(
    `Wrote ${addresses.length} balances to ${OUTPUT_DIR}/balances-${startSnapshot}-${endSnapshot}.csv`,
  );

  // Calculate and write rewards
  console.log("Calculating rewards...");

  // remove any addresses with no rewards
  const rewardedAddresses = filterZeroRewards(
    addresses,
    totalRewardsPerAddress,
  );
  const rewardsOutput = formatRewardsCsv(
    rewardedAddresses,
    totalRewardsPerAddress,
  );
  await writeFile(
    `${OUTPUT_DIR}/rewards-${startSnapshot}-${endSnapshot}.csv`,
    rewardsOutput.join("\n"),
  );
  console.log(
    `Wrote ${rewardedAddresses.length} rewards to ${OUTPUT_DIR}/rewards-${startSnapshot}-${endSnapshot}.csv`,
  );

  // Verify total rewards equals reward pool
  const totalRewards = Array.from(totalRewardsPerAddress.values()).reduce(
    (sum, reward) => sum + reward,
    0n,
  );
  console.log(`\nTotal rewards: ${totalRewards}`);
  console.log(`Reward pool: ${REWARD_POOL}`);
  console.log(`Difference: ${totalRewards - REWARD_POOL}`);
  verifyRewardPoolTolerance(totalRewards, REWARD_POOL);

  console.log("Done!");
}

main().catch((error) => {
  console.error("Error occurred:", error);
  process.exit(1);
});
