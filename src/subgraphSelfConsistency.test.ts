/**
 * Tests that the subgraph's VaultBalance.lpBalance matches the sum of its own
 * LiquidityChange events. Both sides are queried at HEAD, so there is no
 * time-mismatch. Failures here indicate the subgraph is not crediting LP
 * deposits/withdrawals correctly in VaultBalance.lpBalance.
 */
import { describe, it, expect } from "vitest";

const SUBGRAPH_URL =
  "https://api.goldsky.com/api/public/project_cm4zggfv2trr301whddsl9vaj/subgraphs/cyclo-flare/2026-04-09-ae4f/gn";

const CYSFLR = "0x19831cfb53a0dbead9866c43557c1d48dff76567";

interface LiquidityChangeResult {
  owner: { id: string };
  depositedBalanceChange: string;
}

interface VaultBalanceResult {
  owner: { id: string };
  lpBalance: string;
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

async function computeLpBalancesFromSubgraphEvents(
  tokenAddress: string,
): Promise<Map<string, bigint>> {
  const balances = new Map<string, bigint>();

  const v2Changes = await queryAllPaginated<LiquidityChangeResult>(
    "liquidityV2Changes",
    "owner { id } depositedBalanceChange",
    `tokenAddress: "${tokenAddress}"`,
  );
  const v3Changes = await queryAllPaginated<LiquidityChangeResult>(
    "liquidityV3Changes",
    "owner { id } depositedBalanceChange",
    `tokenAddress: "${tokenAddress}"`,
  );

  for (const event of [...v2Changes, ...v3Changes]) {
    const prev = balances.get(event.owner.id) ?? 0n;
    balances.set(event.owner.id, prev + BigInt(event.depositedBalanceChange));
  }
  return balances;
}

async function querySubgraphLpBalances(
  tokenAddress: string,
): Promise<Map<string, bigint>> {
  const balances = new Map<string, bigint>();
  let lastId = "";
  const first = 1000;
  while (true) {
    const idFilter = lastId ? `, id_gt: "${lastId}"` : "";
    const response = await fetch(SUBGRAPH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `{ vaultBalances(where: {vault: "${tokenAddress}"${idFilter}}, first: ${first}, orderBy: id, orderDirection: asc) { id owner { id } lpBalance } }`,
      }),
    });
    const data = await response.json();
    const batch = data.data.vaultBalances as (VaultBalanceResult & { id: string })[];
    for (const vb of batch) {
      balances.set(vb.owner.id, BigInt(vb.lpBalance));
    }
    if (batch.length < first) break;
    lastId = batch[batch.length - 1].id;
  }
  return balances;
}

describe("subgraph self-consistency: lpBalance vs liquidity change events", () => {
  it("cysFLR vaultBalance.lpBalance matches sum of liquidityChange events", async () => {
    const fromEvents = await computeLpBalancesFromSubgraphEvents(CYSFLR);
    const fromVaultBalances = await querySubgraphLpBalances(CYSFLR);

    const accountsWithLp = [...fromEvents.entries()].filter(([, v]) => v > 0n);
    const mismatches: Array<{ address: string; fromEvents: bigint; fromVaultBalance: bigint }> = [];

    for (const [address, eventLp] of accountsWithLp) {
      const vaultLp = fromVaultBalances.get(address) ?? 0n;
      if (vaultLp !== eventLp) {
        mismatches.push({ address, fromEvents: eventLp, fromVaultBalance: vaultLp });
      }
    }

    if (mismatches.length > 0) {
      const details = mismatches
        .sort((a, b) => Number(b.fromEvents - a.fromEvents))
        .slice(0, 10)
        .map((m) => `  ${m.address}  events=${m.fromEvents}  vaultBalance=${m.fromVaultBalance}`)
        .join("\n");
      throw new Error(
        `${mismatches.length} of ${accountsWithLp.length} accounts have inconsistent cysFLR lpBalance:\n${details}`
      );
    }
  }, 60_000);
});
