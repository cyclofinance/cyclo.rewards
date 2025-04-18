import { request, gql } from "graphql-request";
import { writeFile } from "fs/promises";
import { Transfer } from "./types";

const SUBGRAPH_URL =
  "https://api.goldsky.com/api/public/project_cm4zggfv2trr301whddsl9vaj/subgraphs/cyclo-rewards/0.28/gn";
const BATCH_SIZE = 1000;

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
      query getTransfers($skip: Int!, $first: Int!) {
        transfers(
          skip: $skip
          first: $first
          orderBy: blockNumber
          orderDirection: asc
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
