import { request, gql } from "graphql-request";
import { writeFile } from "fs/promises";
import { LiquidityChange, LiquidityChangeType, Transfer } from "./types";
import { config } from "dotenv";
import assert from "assert";

config();

const SUBGRAPH_URL =
  "https://api.goldsky.com/api/public/project_cm4zggfv2trr301whddsl9vaj/subgraphs/cyclo-flare/2025-11-25-21af/gn";
const BATCH_SIZE = 1000;

// ensure SNAPSHOT_BLOCK_2 env is set for deterministic transfers.dat,
// as we will fetch transfers up until the end of the snapshot block numbers
assert(process.env.SNAPSHOT_BLOCK_2, "undefined SNAPSHOT_BLOCK_2 env variable")
const UNTIL_SNAPSHOT = parseInt(process.env.SNAPSHOT_BLOCK_2) + 1; // +1 to make sure every transfer is gathered

interface SubgraphTransfer {
  id: string;
  tokenAddress: string;
  from: { id: string };
  to: { id: string };
  value: string;
  blockNumber: string;
  blockTimestamp: string;
}

interface SubgraphLiquidityChange {
  id: string;
  __typename: "LiquidityV3Change" | "LiquidityV2Change";
  owner: { address: string };
  tokenAddress: string;
  lpAddress: string;
  LiquidityChangeType: "DEPOSIT" | "TRANSFER" | "WITHDRAW";
  liquidityChange: string;
  depositedBalanceChange: string;
  blockNumber: string;
  blockTimestamp: string;
}

async function scrapeTransfers() {
  let skip = 0;
  let hasMore = true;
  let totalProcessed = 0;
  const transfers: Transfer[] = [];

  while (hasMore) {
    console.log(`Fetching transfers batch starting at ${skip}`);

    const query = gql`
      query getTransfers($skip: Int!, $first: Int!, $untilSnapshot: Int!) {
        transfers(
          skip: $skip
          first: $first
          orderBy: blockNumber
          orderDirection: asc
          where: {
            blockNumber_lte: $untilSnapshot
          }
        ) {
          id
          tokenAddress
          from {
            id
          }
          to {
            id
          }
          value
          blockNumber
          blockTimestamp
        }
      }
    `;

    const response = await request<{ transfers: SubgraphTransfer[] }>(
      SUBGRAPH_URL,
      query,
      {
        skip,
        first: BATCH_SIZE,
        untilSnapshot: UNTIL_SNAPSHOT,
      }
    );

    const batchTransfers = response.transfers.map((t) => ({
      tokenAddress: t.tokenAddress,
      from: t.from.id,
      to: t.to.id,
      value: t.value,
      blockNumber: parseInt(t.blockNumber),
      timestamp: parseInt(t.blockTimestamp),
    }));

    transfers.push(...batchTransfers);

    console.log(`Found ${batchTransfers.length} transfers in batch`);
    totalProcessed += batchTransfers.length;

    hasMore = batchTransfers.length === BATCH_SIZE;
    skip += batchTransfers.length;

    // Save progress after each batch
    await writeFile(
      "data/transfers.dat",
      transfers.map((t) => JSON.stringify(t)).join("\n")
    );

    // Log progress
    console.log(`Total transfers processed: ${totalProcessed}`);
  }

  console.log(`\nFinished!`);
  console.log(`Total transfers fetched: ${totalProcessed}`);
}

async function scrapeLiquidityChanges() {
  let skip = 0;
  let hasMore = true;
  let totalProcessed = 0;
  const liquidityChanges: LiquidityChange[] = [];

  while (hasMore) {
    console.log(`Fetching liquidity changes batch starting at ${skip}`);

    const query = gql`
      query getLiquidityChanges($skip: Int!, $first: Int!, $untilSnapshot: Int!) {
        liquidityChanges(
          skip: $skip
          first: $first
          orderBy: blockNumber
          orderDirection: asc
          where: {
            blockNumber_lte: $untilSnapshot
          }
        ) {
          id
          __typename
          owner {
            address
          }
          tokenAddress
          lpAddress
          LiquidityChangeType
          liquidityChange
          depositedBalanceChange
          blockNumber
          blockTimestamp
        }
      }
    `;

    const response = await request<{ liquidityChanges: SubgraphLiquidityChange[] }>(
      SUBGRAPH_URL,
      query,
      {
        skip,
        first: BATCH_SIZE,
        untilSnapshot: UNTIL_SNAPSHOT,
      }
    );

    const batchLiquidityChanges = response.liquidityChanges.map((t) => ({
      tokenAddress: t.tokenAddress,
      lpAddress: t.lpAddress,
      owner: t.owner.address,
      changeType: t.LiquidityChangeType as LiquidityChangeType,
      liquidityChange: t.liquidityChange,
      depositedBalanceChange: t.depositedBalanceChange,
      blockNumber: parseInt(t.blockNumber),
      timestamp: parseInt(t.blockTimestamp),
    }));

    liquidityChanges.push(...batchLiquidityChanges);

    console.log(`Found ${batchLiquidityChanges.length} liquidity changes in batch`);
    totalProcessed += batchLiquidityChanges.length;

    hasMore = batchLiquidityChanges.length === BATCH_SIZE;
    skip += batchLiquidityChanges.length;

    // Save progress after each batch
    await writeFile(
      "data/liquidity.dat",
      liquidityChanges.map((t) => JSON.stringify(t)).join("\n")
    );

    // Log progress
    console.log(`Total liquidity changes processed: ${totalProcessed}`);
  }

  console.log(`\nFinished!`);
  console.log(`Total liquidity changes fetched: ${totalProcessed}`);
}

// main entrypoint to capture transfers and liquidity changes
async function main() {
  await scrapeTransfers();
  await scrapeLiquidityChanges();
}

main().catch(console.error);
