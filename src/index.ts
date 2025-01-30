import { createPublicClient, http } from "viem";
import { readFile, writeFile, mkdir } from "fs/promises";
import { Processor } from "./processor.js";
import { config } from "dotenv";

// Load environment variables
config();

const SNAPSHOT_BLOCK_1 = parseInt(process.env.SNAPSHOT_BLOCK_1 || "0");
const SNAPSHOT_BLOCK_2 = parseInt(process.env.SNAPSHOT_BLOCK_2 || "0");
const REWARD_POOL = 1000000000000000000000000n; // 1M rFLR (1e6 * 1e18)

async function main() {
  // Create output directory if it doesn't exist
  await mkdir("output", { recursive: true });

  // Read transfers file
  const transfersData = await readFile("data/transfers.dat", "utf8");
  const transfers = transfersData
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  // Read blocklist
  const blocklistData = await readFile("data/blocklist.txt", "utf8");
  const blocklist = blocklistData
    .split("\n")
    .filter(Boolean)
    .map((addr) => addr.toLowerCase());

  // Setup processor with snapshot blocks
  const processor = new Processor(SNAPSHOT_BLOCK_1, SNAPSHOT_BLOCK_2);

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
  const [addresses, snapshot1Balances, snapshot2Balances, averageBalances] =
    await processor.getEligibleBalances(blocklist);

  // Write balances
  const balancesOutput = [
    "address,balance_snapshot1,balance_snapshot2,average_balance",
  ];
  for (let i = 0; i < addresses.length; i++) {
    balancesOutput.push(
      `${addresses[i]},${snapshot1Balances[i]},${snapshot2Balances[i]},${averageBalances[i]}`
    );
  }
  await writeFile("output/balances.csv", balancesOutput.join("\n"));
  console.log(`\nWrote ${addresses.length} balances to output/balances.csv`);

  // Calculate and write rewards
  const [rewardAddresses, rewards] = await processor.calculateRewards(
    REWARD_POOL
  );
  const rewardsOutput = ["address,reward"];
  for (let i = 0; i < rewardAddresses.length; i++) {
    rewardsOutput.push(`${rewardAddresses[i]},${rewards[i]}`);
  }
  await writeFile("output/rewards.csv", rewardsOutput.join("\n"));
  console.log(
    `\nWrote ${rewardAddresses.length} rewards to output/rewards.csv`
  );

  // Verify total rewards equals reward pool
  const totalRewards = rewards.reduce((sum, reward) => sum + reward, 0n);
  console.log(`\nTotal rewards: ${totalRewards}`);
  console.log(`Reward pool: ${REWARD_POOL}`);
  console.log(`Difference: ${totalRewards - REWARD_POOL}`); // Should be very small due to rounding
}

main().catch(console.error);
