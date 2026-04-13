/**
 * Verifies that scraped data/liquidity.dat matches the subgraph's own
 * LiquidityChange events up to endBlock. Both sides are filtered to the
 * same block range, so there is no time-mismatch.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import {
  EPOCHS,
  CURRENT_EPOCH,
  SUBGRAPH_URL,
  DATA_DIR,
  TRANSFERS_FILE_BASE,
  POOLS_FILE,
} from "./constants";
import { CYTOKENS } from "./config";
import { parsePools } from "./pipeline";

const epoch = EPOCHS[CURRENT_EPOCH - 1];
const END_BLOCK = epoch.endBlock!;

interface SubgraphEvent {
  owner: { id: string };
  depositedBalanceChange: string;
  blockNumber: string;
}

interface LocalEvent {
  owner: string;
  tokenAddress: string;
  depositedBalanceChange: string;
  blockNumber: number;
}

async function queryAllPaginated<T>(
  entityName: string,
  fields: string,
  filter: string,
): Promise<T[]> {
  const results: T[] = [];
  let skip = 0;
  const first = 1000;
  while (true) {
    const response = await fetch(SUBGRAPH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `{ ${entityName}(where: {${filter}}, first: ${first}, skip: ${skip}, orderBy: blockNumber, orderDirection: asc) { ${fields} } }`,
      }),
    });
    const data = await response.json();
    const batch = data.data[entityName] as T[];
    results.push(...batch);
    if (batch.length < first) break;
    skip += first;
  }
  return results;
}

function loadLocalLpBalances(tokenAddress: string): Map<string, bigint> {
  const data = readFileSync("./data/liquidity.dat", "utf8");
  const balances = new Map<string, bigint>();
  for (const line of data.split("\n").filter(Boolean)) {
    const event: LocalEvent = JSON.parse(line);
    if (event.tokenAddress !== tokenAddress) continue;
    if (event.blockNumber > END_BLOCK) continue;
    const prev = balances.get(event.owner) ?? 0n;
    balances.set(event.owner, prev + BigInt(event.depositedBalanceChange));
  }
  return balances;
}

async function querySubgraphLpBalances(
  tokenAddress: string,
): Promise<Map<string, bigint>> {
  const balances = new Map<string, bigint>();
  const filter = `tokenAddress: "${tokenAddress}", blockNumber_lte: "${END_BLOCK}"`;

  const v2 = await queryAllPaginated<SubgraphEvent>(
    "liquidityV2Changes",
    "owner { id } depositedBalanceChange blockNumber",
    filter,
  );
  const v3 = await queryAllPaginated<SubgraphEvent>(
    "liquidityV3Changes",
    "owner { id } depositedBalanceChange blockNumber",
    filter,
  );

  for (const event of [...v2, ...v3]) {
    const prev = balances.get(event.owner.id) ?? 0n;
    balances.set(event.owner.id, prev + BigInt(event.depositedBalanceChange));
  }
  return balances;
}

describe("scraped liquidity data matches subgraph", () => {
  for (const token of CYTOKENS) {
    it(`${token.name} local lpBalances match subgraph events up to endBlock`, async () => {
      const local = loadLocalLpBalances(token.address);
      const subgraph = await querySubgraphLpBalances(token.address);

      const allOwners = new Set([...local.keys(), ...subgraph.keys()]);
      const mismatches: Array<{
        address: string;
        local: bigint;
        subgraph: bigint;
      }> = [];

      for (const owner of allOwners) {
        const localBal = local.get(owner) ?? 0n;
        const sgBal = subgraph.get(owner) ?? 0n;
        if (localBal !== sgBal) {
          mismatches.push({ address: owner, local: localBal, subgraph: sgBal });
        }
      }

      if (mismatches.length > 0) {
        const details = mismatches
          .slice(0, 10)
          .map(
            (m) => `  ${m.address}  local=${m.local}  subgraph=${m.subgraph}`,
          )
          .join("\n");
        throw new Error(
          `${mismatches.length} accounts have mismatched ${token.name} lpBalance between local data and subgraph:\n${details}`,
        );
      }
    }, 60_000);
  }
});

describe("scraped transfer count matches subgraph", () => {
  it("subgraph has no more transfers than local data up to endBlock", async () => {
    // Count local transfers
    const transferFiles = readdirSync(DATA_DIR).filter(
      (f) => f.startsWith(TRANSFERS_FILE_BASE) && f.endsWith(".dat"),
    );
    let localCount = 0;
    for (const file of transferFiles) {
      const data = readFileSync(`${DATA_DIR}/${file}`, "utf8");
      localCount += data.split("\n").filter(Boolean).length;
    }

    // Check subgraph doesn't have more than local by skipping past local count
    const res = await fetch(SUBGRAPH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `{ transfers(where: {blockNumber_lte: "${END_BLOCK}"}, first: 1, skip: ${localCount}, orderBy: blockNumber, orderDirection: asc) { id } }`,
      }),
    });
    const data = await res.json();
    expect(
      data.data.transfers.length,
      `Subgraph has more transfers than local (${localCount})`,
    ).toBe(0);
  }, 30_000);
});

describe("scraped pools match subgraph", () => {
  it("local pools.dat matches V3 pool addresses in subgraph liquidity events", async () => {
    const localPools = new Set(
      parsePools(readFileSync(`${DATA_DIR}/${POOLS_FILE}`, "utf8")).map((p) =>
        p.toLowerCase(),
      ),
    );

    // Collect V3 pool addresses from subgraph
    const sgPools = new Set<string>();
    let skip = 0;
    while (true) {
      const res = await fetch(SUBGRAPH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `{ liquidityV3Changes(where: {blockNumber_lte: "${END_BLOCK}"}, first: 1000, skip: ${skip}, orderBy: blockNumber, orderDirection: asc) { poolAddress } }`,
        }),
      });
      const data = await res.json();
      const batch = data.data.liquidityV3Changes as Array<{
        poolAddress: string;
      }>;
      for (const e of batch) sgPools.add(e.poolAddress.toLowerCase());
      if (batch.length < 1000) break;
      skip += 1000;
    }

    const missingLocal = [...sgPools].filter((p) => !localPools.has(p));
    const extraLocal = [...localPools].filter((p) => !sgPools.has(p));

    expect(
      missingLocal,
      `Subgraph has pools missing from local: ${missingLocal.join(", ")}`,
    ).toHaveLength(0);
    expect(
      extraLocal,
      `Local has extra pools not in subgraph: ${extraLocal.join(", ")}`,
    ).toHaveLength(0);
  }, 60_000);
});
