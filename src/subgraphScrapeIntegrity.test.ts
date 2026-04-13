/**
 * Verifies that scraped data/liquidity.dat matches the subgraph's own
 * LiquidityChange events up to endBlock. Both sides are filtered to the
 * same block range, so there is no time-mismatch.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { EPOCHS, CURRENT_EPOCH, SUBGRAPH_URL } from "./constants";
import { CYTOKENS } from "./config";

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
