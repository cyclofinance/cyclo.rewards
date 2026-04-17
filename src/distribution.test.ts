import { describe, it, expect } from "vitest";
import { createPublicClient, http, decodeFunctionData, parseAbi } from "viem";
import { flare } from "viem/chains";
import { readFileSync } from "fs";
import {
  EPOCHS,
  CURRENT_EPOCH,
  REWARDS_CSV_COLUMN_HEADER_ADDRESS,
  REWARDS_CSV_COLUMN_HEADER_REWARD,
} from "./constants";

const DISTRIBUTOR = "0x5de53560d7043b6c3ECDf74E3A8EB9f59785C4bb";
const CYCLO_PROJECT_ID = 6n;
const RNAT_MONTH = BigInt(CURRENT_EPOCH - 1);
const EXPLORER_API = "https://flare-explorer.flare.network/api";

const distributeAbi = parseAbi([
  "function distributeRewards(uint256, uint256, address[], uint128[])",
]);

const client = createPublicClient({
  chain: flare,
  transport: http(process.env.RPC_URL),
});

function readRewardsCsv(): Array<{ address: string; amount: bigint }> {
  const epoch = EPOCHS[CURRENT_EPOCH - 1];
  const path = `./output/rewards-${epoch.startBlock}-${epoch.endBlock}.csv`;
  const data = readFileSync(path, "utf8");
  const lines = data.split("\n").filter(Boolean);
  expect(lines[0]).toBe(
    `${REWARDS_CSV_COLUMN_HEADER_ADDRESS},${REWARDS_CSV_COLUMN_HEADER_REWARD}`,
  );
  return lines.slice(1).map((line) => {
    const [address, amount] = line.split(",");
    return { address: address.toLowerCase(), amount: BigInt(amount) };
  });
}

describe("on-chain distribution matches CSV", () => {
  it("all distributed amounts match the rewards CSV exactly", async (ctx) => {
    const csvEntries = readRewardsCsv();

    // Get recent txs from distributor via explorer API
    const response = await fetch(
      `${EXPLORER_API}?module=account&action=txlist&address=${DISTRIBUTOR}&sort=desc&page=1&offset=20`,
    );
    const data = await response.json();
    const txHashes: string[] = data.result
      .filter(
        (tx: any) =>
          tx.to?.toLowerCase() === "0x26d460c3cf931fb2014fa436a49e3af08619810e",
      )
      .map((tx: any) => tx.hash);

    const onchainEntries: Array<{ address: string; amount: bigint }> = [];

    for (const hash of txHashes) {
      const tx = await client.getTransaction({ hash: hash as `0x${string}` });
      let decoded;
      try {
        decoded = decodeFunctionData({ abi: distributeAbi, data: tx.input });
      } catch (e: any) {
        // Only swallow function selector mismatches — other decode errors should propagate
        if (e?.name === "AbiFunctionSignatureNotFoundError") continue;
        throw e;
      }
      if (
        decoded.args[0] !== CYCLO_PROJECT_ID ||
        decoded.args[1] !== RNAT_MONTH
      )
        continue;
      for (let i = 0; i < decoded.args[2].length; i++) {
        onchainEntries.push({
          address: decoded.args[2][i].toLowerCase(),
          amount: decoded.args[3][i],
        });
      }
    }

    // Skip (not pass) if the current epoch hasn't been distributed yet
    if (onchainEntries.length === 0) {
      ctx.skip();
    }

    expect(onchainEntries.length).toBe(csvEntries.length);

    for (const onchain of onchainEntries) {
      const csv = csvEntries.find((c) => c.address === onchain.address);
      expect(csv).toBeDefined();
      expect(csv!.amount).toBe(onchain.amount);
    }
  }, 60_000);
});
