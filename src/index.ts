import { readFile, writeFile, mkdir } from "fs/promises";
import { Processor } from "./processor.js";
import { config } from "dotenv";
import { CYTOKENS, generateSnapshotBlocksForEpoch } from "./config";
import { EPOCHS_LIST, REWARD_POOL } from "./constants";
import assert from "assert";

// Load environment variables
config();

// make sure the SEED is set
assert(typeof process?.env?.SEED === "string" && process.env.SEED, "invalid or undefined SEED phrase");
assert(!isNaN(parseInt(process?.env?.EPOCH as any)), "invalid or undefined EPOCH index");

const CURRENT_EPOCH = EPOCHS_LIST[parseInt(process.env.EPOCH as any)];

// Must match expected structure
// https://github.com/flare-foundation/rnat-distribution-tool/blob/main/README.md#add-csv-file-with-rewards-data
const REWARDS_CSV_COLUMN_HEADER_ADDRESS = "recipient address";
const REWARDS_CSV_COLUMN_HEADER_REWARD = "amount wei";

async function main() {
  // generate snapshot blocks
  const SNAPSHOTS = await generateSnapshotBlocksForEpoch(process.env.SEED!, CURRENT_EPOCH);

  // write generated snapshots
  await writeFile(
    "output/snapshots-" + SNAPSHOTS[0] + "-" + SNAPSHOTS[SNAPSHOTS.length - 1] + ".txt",
    SNAPSHOTS.join("\n")
  );

  console.log("Starting processor...");
  console.log(`Snapshot blocks: ${SNAPSHOTS[0]}, ${SNAPSHOTS[SNAPSHOTS.length - 1]}`);

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

  // Read liquidity file
  console.log("Reading liquidity file...");
  const liquidityData = await readFile("data/liquidity.dat", "utf8");
  const liquidities = liquidityData
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  console.log(`Found ${liquidities.length} liquidity changes`);

  // Read pools file
  console.log("Reading pools file...");
  const poolsData = await readFile("data/pools.dat", "utf8");
  const pools = JSON.parse(poolsData);
  console.log(`Found ${pools.length} pools`);

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
  const processor = new Processor(SNAPSHOTS, CURRENT_EPOCH.length, reports, undefined, pools);

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
  for (const token of CYTOKENS) {
    console.log("Getting token balances for ", token.name);
    const tokenBalances = balances.get(token.address.toLowerCase());
    if (!tokenBalances) continue;

    const totalAverage = Array.from(tokenBalances.values()).reduce(
      (sum, bal) => sum + bal.average,
      0n
    );
    const totalPenalties = Array.from(tokenBalances.values()).reduce(
      (sum, bal) => sum + bal.penalty,
      0n
    );
    const totalBounties = Array.from(tokenBalances.values()).reduce(
      (sum, bal) => sum + bal.bounty,
      0n
    );
    const totalFinal = Array.from(tokenBalances.values()).reduce(
      (sum, bal) => sum + bal.final,
      0n
    );

    console.log("- Total Avg:", totalAverage.toString());
    console.log("- Total Penalties:", totalPenalties.toString());
    console.log("- Total Bounties:", totalBounties.toString());
    console.log("- Total Final:", totalFinal.toString());
    console.log(
      `Note: Final Total for ${token.name} should equal Average Total - Penalties + Bounties`
    );
    console.log(
      `Verification: ${
        totalAverage - totalPenalties + totalBounties === totalFinal ? "✓" : "✗"
      }`
    );
  }

  // Write balances with per-token data
  console.log("Writing balances...");
  const tokenColumns = CYTOKENS.map(
    (token) =>
      `${SNAPSHOTS.map((_s, i) => `${token.name}_snapshot${i}`).join(",")},${token.name}_average,${token.name}_penalty,${token.name}_bounty,${token.name}_final,${token.name}_rewards`
  ).join(",");

  const balancesOutput = [`address,${tokenColumns},total_rewards`];

  // get the rewards for each address by summing the rewards for each token
  const rewardsPerToken = await processor.calculateRewards(REWARD_POOL);
  const totalRewardsPerAddress = new Map<string, bigint>();

  for (const token of CYTOKENS) {
    const rewardsPerAddress = rewardsPerToken.get(token.address.toLowerCase());
    if (!rewardsPerAddress) continue;

    for (const [address, reward] of rewardsPerAddress) {
      totalRewardsPerAddress.set(
        address,
        (totalRewardsPerAddress.get(address) || 0n) + reward
      );
    }
  }

  // create an array of all the addresses but sorted by their total rewards
  const addresses = Array.from(totalRewardsPerAddress.keys()).sort((a, b) => {
    const valueB = totalRewardsPerAddress.get(b)!;
    const valueA = totalRewardsPerAddress.get(a)!;
    // Convert comparison to a number: -1, 0, or 1
    return valueB > valueA ? 1 : valueB < valueA ? -1 : 0;
  });

  // get the balances for each address
  for (const address of addresses) {
    const tokenValues = CYTOKENS.map((token) => {
      const tokenBalances = balances.get(token.address.toLowerCase());
      const snapshotsDefault = new Array(CURRENT_EPOCH.length).fill("0").join(",");
      if (!tokenBalances) return `${snapshotsDefault},0,0,0,0,0`;
      const tokenBalance = tokenBalances.get(address);
      if (!tokenBalance) return `${snapshotsDefault},0,0,0,0,0`;
      return `${tokenBalance.snapshots.join(",")},${tokenBalance.average},${tokenBalance.penalty},${tokenBalance.bounty},${tokenBalance.final},${rewardsPerToken.get(token.address.toLowerCase())?.get(address) ?? 0n}`;
    }).join(",");

    balancesOutput.push(
      `${address},` +
        `${tokenValues},` +
        `${totalRewardsPerAddress.get(address) || 0n}`
    );
  }
  await writeFile(
    "output/balances-" + SNAPSHOTS[0] + "-" + SNAPSHOTS[SNAPSHOTS.length - 1] + ".csv",
    balancesOutput.join("\n")
  );
  console.log(`Wrote ${addresses.length} balances to output/balances.csv`);

  // Calculate and write rewards
  console.log("Calculating rewards...");

  // remove any addresses with no rewards
  for (const [address, reward] of totalRewardsPerAddress) {
    if (reward === 0n) {
      addresses.splice(addresses.indexOf(address), 1);
    }
  }
  const rewardsOutput = [
    REWARDS_CSV_COLUMN_HEADER_ADDRESS + "," + REWARDS_CSV_COLUMN_HEADER_REWARD,
  ];
  for (const address of addresses) {
    rewardsOutput.push(
      `${address},${totalRewardsPerAddress.get(address) || 0n}`
    );
  }
  await writeFile(
    "output/rewards-" + SNAPSHOTS[0] + "-" + SNAPSHOTS[SNAPSHOTS.length - 1] + ".csv",
    rewardsOutput.join("\n")
  );
  console.log(`Wrote ${addresses.length} rewards to output/rewards.csv`);

  // Verify total rewards equals reward pool
  const totalRewards = Array.from(totalRewardsPerAddress.values()).reduce(
    (sum, reward) => sum + reward,
    0n
  );
  console.log(`\nTotal rewards: ${totalRewards}`);
  console.log(`Reward pool: ${REWARD_POOL}`);
  console.log(`Difference: ${totalRewards - REWARD_POOL}`); // Should be very small due to rounding

  console.log("Done!");
}

main().catch((error) => {
  console.error("Error occurred:", error);
  process.exit(1);
});
