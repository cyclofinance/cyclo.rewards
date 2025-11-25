import { readFile, writeFile, mkdir } from "fs/promises";
import { Processor } from "./processor.js";
import { config } from "dotenv";
import { CYTOKENS } from "./config";
import { REWARD_POOL } from "./constants";

// Load environment variables
config();

const SNAPSHOT_BLOCK_1 = parseInt(process.env.SNAPSHOT_BLOCK_1 || "0");
const SNAPSHOT_BLOCK_2 = parseInt(process.env.SNAPSHOT_BLOCK_2 || "0");

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

  // Read liquidity file
  console.log("Reading transfers file...");
  const liquidityData = await readFile("data/liquidity.dat", "utf8");
  const liquidities = liquidityData
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  console.log(`Found ${liquidities.length} liquidity changes`);

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

  // Process liquidity changes
  console.log(`Processing ${liquidities.length} liquidity change events...`);
  let liquidityProcessedCount = 0;
  for (const liquidity of liquidities) {
    await processor.processLiquidityChanges(liquidity);
    liquidityProcessedCount++;

    if (liquidityProcessedCount % 1000 === 0) {
      console.log(`Processed ${liquidityProcessedCount} liquidity change events`);
    }
  }

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
      `${token.name}_snapshot1,${token.name}_snapshot2,${token.name}_average,${token.name}_penalty,${token.name}_bounty,${token.name}_rewards`
  ).join(",");

  const balancesOutput = [`address,${tokenColumns}`];

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
      if (!tokenBalances) return "0,0,0,0,0";
      const tokenBalance = tokenBalances.get(address);
      if (!tokenBalance) return "0,0,0,0,0";
      return `${tokenBalance.snapshot1},${tokenBalance.snapshot2},${tokenBalance.average},${tokenBalance.penalty},${tokenBalance.bounty}`;
    }).join(",");

    balancesOutput.push(
      `${address},` +
        `${tokenValues},` +
        `${totalRewardsPerAddress.get(address) || 0n}`
    );
  }
  await writeFile(
    "output/balances-" + SNAPSHOT_BLOCK_1 + "-" + SNAPSHOT_BLOCK_2 + ".csv",
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
    "output/rewards-" + SNAPSHOT_BLOCK_1 + "-" + SNAPSHOT_BLOCK_2 + ".csv",
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
