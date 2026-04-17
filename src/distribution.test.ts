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
    const epoch = EPOCHS[CURRENT_EPOCH - 1];

    // Paginate through distributor txs (desc order) until we pass this epoch's endBlock.
    // Distribution always happens after epoch end, so once we see txs from before endBlock
    // we've scanned past any relevant distribution calls.
    const PAGE_SIZE = 100;
    const MAX_PAGES = 50;
    const RNAT_ADDRESS = "0x26d460c3cf931fb2014fa436a49e3af08619810e";
    const txHashes: string[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const response = await fetch(
        `${EXPLORER_API}?module=account&action=txlist&address=${DISTRIBUTOR}&sort=desc&page=${page}&offset=${PAGE_SIZE}`,
      );
      const data = await response.json();
      const results: any[] = data.result ?? [];
      if (results.length === 0) break;
      for (const tx of results) {
        if (tx.to?.toLowerCase() === RNAT_ADDRESS) txHashes.push(tx.hash);
      }
      // Stop when the oldest tx on this page predates this epoch's endBlock
      const oldestBlock = Number(results[results.length - 1].blockNumber);
      if (epoch.endBlock !== undefined && oldestBlock < epoch.endBlock) break;
      if (results.length < PAGE_SIZE) break;
    }

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
