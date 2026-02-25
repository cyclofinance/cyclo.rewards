/**
 * Subgraph scraper. Fetches ERC-20 transfer and liquidity change events from the
 * Goldsky-hosted Cyclo subgraph up to END_SNAPSHOT, writing JSONL to data/*.dat.
 */

import { request, gql } from "graphql-request";
import { writeFile } from "fs/promises";
import { LiquidityChange, LiquidityChangeType, Transfer } from "./types";
import { DATA_DIR, LIQUIDITY_FILE, POOLS_FILE, TRANSFER_CHUNK_SIZE, TRANSFERS_FILE_BASE } from "./constants";
import { validateAddress } from "./config";
import { config } from "dotenv";
import assert from "assert";

config();

/** Goldsky-hosted Cyclo subgraph endpoint for the current epoch */
const SUBGRAPH_URL =
  "https://api.goldsky.com/api/public/project_cm4zggfv2trr301whddsl9vaj/subgraphs/cyclo-flare/2026-02-13-78a0/gn";
const BATCH_SIZE = 1000;

// ensure END_SNAPSHOT env is set for deterministic transfers.dat,
// as we will fetch transfers up until the end of the snapshot block numbers
assert(process.env.END_SNAPSHOT, "undefined END_SNAPSHOT env variable")
const UNTIL_SNAPSHOT = parseInt(process.env.END_SNAPSHOT) + 1; // +1 to make sure every transfer is gathered

/** Raw transfer event shape from the Goldsky subgraph GraphQL response */
export interface SubgraphTransfer {
  id: string;
  tokenAddress: string;
  from: { id: string };
  to: { id: string };
  value: string;
  blockNumber: string;
  blockTimestamp: string;
  transactionHash: string;
}

/** Common fields for V2/V3 liquidity change events from the subgraph */
export type SubgraphLiquidityChangeBase = {
  id: string;
  owner: { address: string };
  tokenAddress: string;
  lpAddress: string;
  liquidityChangeType: "DEPOSIT" | "TRANSFER" | "WITHDRAW";
  liquidityChange: string;
  depositedBalanceChange: string;
  blockNumber: string;
  blockTimestamp: string;
  transactionHash: string;
}

/** Uniswap V2 liquidity change from the subgraph */
export type SubgraphLiquidityChangeV2 = SubgraphLiquidityChangeBase & {
  __typename: "LiquidityV2Change";
}

/** Uniswap V3 liquidity change from the subgraph, with concentrated position data */
export type SubgraphLiquidityChangeV3 = SubgraphLiquidityChangeBase & {
  __typename: "LiquidityV3Change";
  tokenId: string;
  poolAddress: string;
  fee: string;
  lowerTick: string;
  upperTick: string;
}

/** Discriminated union of V2 and V3 subgraph liquidity change events */
export type SubgraphLiquidityChange = SubgraphLiquidityChangeV2 | SubgraphLiquidityChangeV3

const VALID_CHANGE_TYPES = ["DEPOSIT", "TRANSFER", "WITHDRAW"];

/** Parse a string to integer and throw if the result is NaN */
function parseIntStrict(value: string, field: string): number {
  const n = parseInt(value);
  if (isNaN(n)) throw new Error(`Invalid ${field}: "${value}" is not a number`);
  return n;
}


/** Validate that a string is a non-negative integer (for token values) */
function validateNumericString(value: string, field: string): void {
  if (!/^\d+$/.test(value)) throw new Error(`Invalid ${field}: "${value}" is not a numeric string`);
}

/** Validate that a string is a valid signed integer (for BigInt-convertible fields) */
function validateIntegerString(value: string, field: string): void {
  if (!/^-?\d+$/.test(value)) throw new Error(`Invalid ${field}: "${value}" is not an integer string`);
}

/**
 * Maps a raw subgraph transfer event to the internal Transfer type.
 * Flattens nested from/to objects and parses numeric strings.
 * Throws on invalid data (NaN, malformed addresses, non-numeric values).
 */
export function mapSubgraphTransfer(t: SubgraphTransfer): Transfer {
  validateAddress(t.tokenAddress, "tokenAddress");
  validateAddress(t.from.id, "from");
  validateAddress(t.to.id, "to");
  validateNumericString(t.value, "value");
  return {
    tokenAddress: t.tokenAddress,
    from: t.from.id,
    to: t.to.id,
    value: t.value,
    blockNumber: parseIntStrict(t.blockNumber, "blockNumber"),
    timestamp: parseIntStrict(t.blockTimestamp, "blockTimestamp"),
    transactionHash: t.transactionHash,
  };
}

/**
 * Maps a raw subgraph liquidity change event to the internal LiquidityChange type.
 * Discriminates V2/V3 by __typename, adding V3-specific fields when present.
 * Throws on invalid data (NaN, malformed addresses, unknown change types).
 */
export function mapSubgraphLiquidityChange(t: SubgraphLiquidityChange): LiquidityChange {
  validateAddress(t.tokenAddress, "tokenAddress");
  validateAddress(t.lpAddress, "lpAddress");
  validateAddress(t.owner.address, "owner");
  if (!VALID_CHANGE_TYPES.includes(t.liquidityChangeType)) {
    throw new Error(`Invalid liquidityChangeType: "${t.liquidityChangeType}"`);
  }
  validateIntegerString(t.liquidityChange, "liquidityChange");
  validateIntegerString(t.depositedBalanceChange, "depositedBalanceChange");
  const base = {
    tokenAddress: t.tokenAddress,
    lpAddress: t.lpAddress,
    owner: t.owner.address,
    changeType: t.liquidityChangeType as LiquidityChangeType,
    liquidityChange: t.liquidityChange,
    depositedBalanceChange: t.depositedBalanceChange,
    blockNumber: parseIntStrict(t.blockNumber, "blockNumber"),
    timestamp: parseIntStrict(t.blockTimestamp, "blockTimestamp"),
    transactionHash: t.transactionHash,
  };
  if (t.__typename === "LiquidityV3Change") {
    validateAddress(t.poolAddress, "poolAddress");
    validateNumericString(t.tokenId, "tokenId");
    return {
      __typename: t.__typename,
      ...base,
      tokenId: t.tokenId,
      poolAddress: t.poolAddress,
      fee: parseIntStrict(t.fee, "fee"),
      lowerTick: parseIntStrict(t.lowerTick, "lowerTick"),
      upperTick: parseIntStrict(t.upperTick, "upperTick"),
    };
  }
  return { __typename: t.__typename, ...base };
}

/**
 * Paginates through all transfer events up to UNTIL_SNAPSHOT and writes them
 * as JSONL to data/transfers1.dat through data/transfersN.dat (split at 270k lines
 * to stay under GitHub's 100MB file size limit).
 */
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
          transactionHash
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

    const batchTransfers = response.transfers.map(mapSubgraphTransfer);

    transfers.push(...batchTransfers);

    console.log(`Found ${batchTransfers.length} transfers in batch`);
    totalProcessed += batchTransfers.length;

    hasMore = batchTransfers.length === BATCH_SIZE;
    skip += batchTransfers.length;

    // Rewrite all transfer files after each batch for crash recovery —
    // if the scraper fails mid-run, previously fetched data is preserved on disk.
    // Files are split at TRANSFER_CHUNK_SIZE lines to stay under GitHub's 100MB file size limit.
    const fileCount = Math.ceil(transfers.length / TRANSFER_CHUNK_SIZE);
    for (let i = 0; i < fileCount; i++) {
      await writeFile(
        `${DATA_DIR}/${TRANSFERS_FILE_BASE}${i + 1}.dat`,
        transfers.slice(TRANSFER_CHUNK_SIZE * i, TRANSFER_CHUNK_SIZE * (i + 1)).map((t) => JSON.stringify(t)).join("\n")
      );
    }

    // Log progress
    console.log(`Total transfers processed: ${totalProcessed}`);
  }

  console.log(`\nFinished!`);
  console.log(`Total transfers fetched: ${totalProcessed}`);
}

/**
 * Paginates through all liquidity change events up to UNTIL_SNAPSHOT.
 * Writes JSONL to data/liquidity.dat and collects V3 pool addresses to data/pools.dat.
 */
async function scrapeLiquidityChanges() {
  let skip = 0;
  let hasMore = true;
  let totalProcessed = 0;
  const liquidityChanges: LiquidityChange[] = [];
  const v3Pools: Set<string> = new Set(); // gather all v3 pools address

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
          liquidityChangeType
          liquidityChange
          depositedBalanceChange
          blockNumber
          blockTimestamp
          transactionHash
          ... on LiquidityV3Change {
            tokenId
            poolAddress
            fee
            lowerTick
            upperTick
          }
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

    const batchLiquidityChanges = response.liquidityChanges.map((t) => {
      if (t.__typename === "LiquidityV3Change") {
        v3Pools.add(t.poolAddress.toLowerCase());
      }
      return mapSubgraphLiquidityChange(t);
    });

    liquidityChanges.push(...batchLiquidityChanges);

    console.log(`Found ${batchLiquidityChanges.length} liquidity changes in batch`);
    totalProcessed += batchLiquidityChanges.length;

    hasMore = batchLiquidityChanges.length === BATCH_SIZE;
    skip += batchLiquidityChanges.length;

    // Rewrite full file after each batch for crash recovery —
    // if the scraper fails mid-run, previously fetched data is preserved on disk.
    await writeFile(
      `${DATA_DIR}/${LIQUIDITY_FILE}`,
      liquidityChanges.map((t) => JSON.stringify(t)).join("\n")
    );

    // Log progress
    console.log(`Total liquidity changes processed: ${totalProcessed}`);
  }

  // save v3 pools list
  await writeFile(
    `${DATA_DIR}/${POOLS_FILE}`,
    JSON.stringify(Array.from(v3Pools))
  );

  console.log(`\nFinished!`);
  console.log(`Total liquidity changes fetched: ${totalProcessed}`);
}

/** Scrapes transfers then liquidity changes from the subgraph */
async function main() {
  await scrapeTransfers();
  await scrapeLiquidityChanges();
}

main().catch(console.error);
