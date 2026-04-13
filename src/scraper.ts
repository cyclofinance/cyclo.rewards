/**
 * Subgraph scraper. Fetches ERC-20 transfer and liquidity change events from the
 * Goldsky-hosted Cyclo subgraph up to END_SNAPSHOT, writing JSONL to data/*.dat.
 */

import { request, gql } from "graphql-request";
import { writeFile } from "fs/promises";
import { LiquidityChange, LiquidityChangeType, Transfer } from "./types";
import {
  DATA_DIR,
  LIQUIDITY_FILE,
  POOLS_FILE,
  TRANSFER_CHUNK_SIZE,
  TRANSFER_FILE_COUNT,
  TRANSFERS_FILE_BASE,
  SUBGRAPH_URL,
  validateAddress,
} from "./constants";
import { parseEnv } from "./config";
import assert from "assert";

const BATCH_SIZE = 1000;

/** Throw if pagination hit a skip ceiling (expected more results but got none) */
function assertNoPaginationCeiling(
  hasMore: boolean,
  batchLength: number,
  skip: number,
): void {
  if (hasMore && batchLength === 0) {
    throw new Error(
      `Pagination ceiling hit at skip=${skip}: expected results but got 0. The subgraph may have a skip limit.`,
    );
  }
}

const { endSnapshot } = parseEnv();
// blockNumber_lte is inclusive, so no +1 needed
export const UNTIL_SNAPSHOT = endSnapshot;

/** Raw transfer event shape from the Goldsky subgraph GraphQL response */
export interface SubgraphTransfer {
  /** Subgraph entity ID */
  id: string;
  /** ERC-20 token contract address */
  tokenAddress: string;
  /** Sender account (nested subgraph entity) */
  from: { id: string };
  /** Receiver account (nested subgraph entity) */
  to: { id: string };
  /** Transfer amount as a decimal string */
  value: string;
  /** Block number as a string (subgraph returns BigInt fields as strings) */
  blockNumber: string;
  /** Block timestamp as a string */
  blockTimestamp: string;
  /** Transaction hash */
  transactionHash: string;
}

/** Common fields for V2/V3 liquidity change events from the subgraph */
export type SubgraphLiquidityChangeBase = {
  /** Subgraph entity ID */
  id: string;
  /** LP position owner (nested subgraph entity with address field) */
  owner: { address: string };
  /** Cy token contract address */
  tokenAddress: string;
  /** Liquidity pool or position manager address */
  lpAddress: string;
  /** Type of liquidity change */
  liquidityChangeType: "DEPOSIT" | "TRANSFER" | "WITHDRAW";
  /** Change in pool liquidity units as a decimal string */
  liquidityChange: string;
  /** Change in deposited token balance as a decimal string */
  depositedBalanceChange: string;
  /** Block number as a string */
  blockNumber: string;
  /** Block timestamp as a string */
  blockTimestamp: string;
  /** Transaction hash */
  transactionHash: string;
};

/** Uniswap V2 liquidity change from the subgraph */
export type SubgraphLiquidityChangeV2 = SubgraphLiquidityChangeBase & {
  __typename: "LiquidityV2Change";
};

/** Uniswap V3 liquidity change from the subgraph, with concentrated position data */
export type SubgraphLiquidityChangeV3 = SubgraphLiquidityChangeBase & {
  __typename: "LiquidityV3Change";
  tokenId: string;
  poolAddress: string;
  fee: string;
  lowerTick: string;
  upperTick: string;
};

/** Discriminated union of V2 and V3 subgraph liquidity change events */
export type SubgraphLiquidityChange =
  | SubgraphLiquidityChangeV2
  | SubgraphLiquidityChangeV3;

const VALID_CHANGE_TYPES = Object.values(LiquidityChangeType);

/** Parse a string or number to integer, throwing if non-integer or round-trip fails */
export function parseIntStrict(value: string | number, field: string): number {
  const s = String(value);
  const n = Number(s);
  if (!Number.isInteger(n) || String(n) !== s)
    throw new Error(`Invalid ${field}: "${value}" is not a valid integer`);
  return n;
}

/** Validate that a string is a non-negative integer (for token values) */
function validateNumericString(value: string, field: string): void {
  if (!/^\d+$/.test(value))
    throw new Error(`Invalid ${field}: "${value}" is not a numeric string`);
}

/** Validate that a string is a valid signed integer (for BigInt-convertible fields) */
function validateIntegerString(value: string, field: string): void {
  if (!/^-?\d+$/.test(value))
    throw new Error(`Invalid ${field}: "${value}" is not an integer string`);
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
export function mapSubgraphLiquidityChange(
  t: SubgraphLiquidityChange,
): LiquidityChange {
  validateAddress(t.tokenAddress, "tokenAddress");
  validateAddress(t.lpAddress, "lpAddress");
  validateAddress(t.owner.address, "owner");
  if (!(VALID_CHANGE_TYPES as string[]).includes(t.liquidityChangeType)) {
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
  if (t.__typename !== "LiquidityV2Change") {
    throw new Error(`Unknown liquidity change __typename: "${t.__typename}"`);
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
          where: { blockNumber_lte: $untilSnapshot }
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
      },
    );

    const batchTransfers = response.transfers.map(mapSubgraphTransfer);

    assertNoPaginationCeiling(hasMore, batchTransfers.length, skip);

    transfers.push(...batchTransfers);

    console.log(`Found ${batchTransfers.length} transfers in batch`);
    totalProcessed += batchTransfers.length;

    hasMore = batchTransfers.length === BATCH_SIZE;
    skip += batchTransfers.length;

    // Rewrite all transfer files after each batch for crash recovery —
    // if the scraper fails mid-run, previously fetched data is preserved on disk.
    // Files are split at TRANSFER_CHUNK_SIZE lines to stay under GitHub's 100MB file size limit.
    const fileCount = Math.ceil(transfers.length / TRANSFER_CHUNK_SIZE);
    assert(
      fileCount <= TRANSFER_FILE_COUNT,
      `Transfer data requires ${fileCount} files but TRANSFER_FILE_COUNT is ${TRANSFER_FILE_COUNT} — increase TRANSFER_FILE_COUNT to avoid data loss`,
    );
    for (let i = 0; i < fileCount; i++) {
      await writeFile(
        `${DATA_DIR}/${TRANSFERS_FILE_BASE}${i + 1}.dat`,
        transfers
          .slice(TRANSFER_CHUNK_SIZE * i, TRANSFER_CHUNK_SIZE * (i + 1))
          .map((t) => JSON.stringify(t))
          .join("\n"),
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
      query getLiquidityChanges(
        $skip: Int!
        $first: Int!
        $untilSnapshot: Int!
      ) {
        liquidityChanges(
          skip: $skip
          first: $first
          orderBy: blockNumber
          orderDirection: asc
          where: { blockNumber_lte: $untilSnapshot }
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

    const response = await request<{
      liquidityChanges: SubgraphLiquidityChange[];
    }>(SUBGRAPH_URL, query, {
      skip,
      first: BATCH_SIZE,
      untilSnapshot: UNTIL_SNAPSHOT,
    });

    const batchLiquidityChanges = response.liquidityChanges.map((t) => {
      if (t.__typename === "LiquidityV3Change") {
        v3Pools.add(t.poolAddress.toLowerCase());
      }
      return mapSubgraphLiquidityChange(t);
    });

    assertNoPaginationCeiling(hasMore, batchLiquidityChanges.length, skip);

    liquidityChanges.push(...batchLiquidityChanges);

    console.log(
      `Found ${batchLiquidityChanges.length} liquidity changes in batch`,
    );
    totalProcessed += batchLiquidityChanges.length;

    hasMore = batchLiquidityChanges.length === BATCH_SIZE;
    skip += batchLiquidityChanges.length;

    // Rewrite full file after each batch for crash recovery —
    // if the scraper fails mid-run, previously fetched data is preserved on disk.
    await writeFile(
      `${DATA_DIR}/${LIQUIDITY_FILE}`,
      liquidityChanges.map((t) => JSON.stringify(t)).join("\n"),
    );

    // Log progress
    console.log(`Total liquidity changes processed: ${totalProcessed}`);
  }

  // save v3 pools list
  await writeFile(
    `${DATA_DIR}/${POOLS_FILE}`,
    JSON.stringify(Array.from(v3Pools)),
  );

  console.log(`\nFinished!`);
  console.log(`Total liquidity changes fetched: ${totalProcessed}`);
}

/** Scrapes transfers then liquidity changes from the subgraph */
async function main() {
  await scrapeTransfers();
  await scrapeLiquidityChanges();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
