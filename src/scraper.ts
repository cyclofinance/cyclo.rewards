import { request, gql } from "graphql-request";
import { writeFile } from "fs/promises";
import { Transfer } from "./types";
import { config } from "dotenv";
import assert from "assert";

config();

const SUBGRAPH_URL =
  "https://api.goldsky.com/api/public/project_cm4zggfv2trr301whddsl9vaj/subgraphs/cyclo-rewards/0.30/gn";
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

async function main() {
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

main().catch(console.error);
