/**
 * Tests that the subgraph's VaultBalance.lpBalance matches the sum of its own
 * LiquidityChange events. Both sides are queried at HEAD, so there is no
 * time-mismatch. Failures here indicate the subgraph is not crediting LP
 * deposits/withdrawals correctly in VaultBalance.lpBalance.
 */
import { describe, it, expect } from "vitest";
import { CYTOKENS } from "./config";
import { SUBGRAPH_URL } from "./constants";

interface LiquidityChangeResult {
  owner: { id: string };
  depositedBalanceChange: string;
}

interface VaultBalanceResult {
  owner: { id: string };
  lpBalance: string;
  boughtCap: string;
  balance: string;
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
): Promise<Map<string, VaultBalanceResult>> {
  const balances = new Map<string, VaultBalanceResult>();
  let lastId = "";
  const first = 1000;
  while (true) {
    const idFilter = lastId ? `, id_gt: "${lastId}"` : "";
    const response = await fetch(SUBGRAPH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `{ vaultBalances(where: {vault: "${tokenAddress}"${idFilter}}, first: ${first}, orderBy: id, orderDirection: asc) { id owner { id } lpBalance boughtCap balance } }`,
      }),
    });
    const data = await response.json();
    const batch = data.data.vaultBalances as (VaultBalanceResult & { id: string })[];
    for (const vb of batch) {
      balances.set(vb.owner.id, vb);
    }
    if (batch.length < first) break;
    lastId = batch[batch.length - 1].id;
  }
  return balances;
}

describe("subgraph self-consistency: lpBalance vs liquidity change events", () => {
  for (const token of CYTOKENS) {
  it(`${token.name} vaultBalance.lpBalance matches sum of liquidityChange events`, async () => {
    const fromEvents = await computeLpBalancesFromSubgraphEvents(token.address);
    const fromVaultBalances = await querySubgraphLpBalances(token.address);

    const accountsWithLp = [...fromEvents.entries()].filter(([, v]) => v > 0n);
    const mismatches: Array<{ address: string; fromEvents: bigint; fromVaultBalance: bigint }> = [];

    for (const [address, eventLp] of accountsWithLp) {
      const vb = fromVaultBalances.get(address);
      const vaultLp = vb ? BigInt(vb.lpBalance) : 0n;
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
        `${mismatches.length} of ${accountsWithLp.length} accounts have inconsistent ${token.name} lpBalance:\n${details}`
      );
    }
  }, 60_000);

  it(`${token.name} no vaultBalance has lpBalance > 0 without matching events`, async () => {
    const fromEvents = await computeLpBalancesFromSubgraphEvents(token.address);
    const vaultBalances = await querySubgraphLpBalances(token.address);

    const mismatches: Array<{ address: string; fromEvents: bigint; fromVaultBalance: bigint }> = [];

    for (const [address, vb] of vaultBalances) {
      const vaultLp = BigInt(vb.lpBalance);
      if (vaultLp <= 0n) continue;
      const eventLp = fromEvents.get(address) ?? 0n;
      if (eventLp !== vaultLp) {
        mismatches.push({ address, fromEvents: eventLp, fromVaultBalance: vaultLp });
      }
    }

    if (mismatches.length > 0) {
      const details = mismatches
        .sort((a, b) => Number(b.fromVaultBalance - a.fromVaultBalance))
        .slice(0, 10)
        .map((m) => `  ${m.address}  events=${m.fromEvents}  vaultBalance=${m.fromVaultBalance}`)
        .join("\n");
      throw new Error(
        `${mismatches.length} accounts have ${token.name} lpBalance > 0 without matching events:\n${details}`
      );
    }
  }, 60_000);

  it(`${token.name} balance equals min(clamp0(boughtCap), clamp0(lpBalance))`, async () => {
    const vaultBalances = await querySubgraphLpBalances(token.address);

    const mismatches: Array<{ address: string; expected: bigint; actual: bigint }> = [];

    for (const [address, vb] of vaultBalances) {
      const cap = BigInt(vb.boughtCap);
      const lp = BigInt(vb.lpBalance);
      const clampedCap = cap < 0n ? 0n : cap;
      const clampedLp = lp < 0n ? 0n : lp;
      const expected = clampedCap < clampedLp ? clampedCap : clampedLp;
      const actual = BigInt(vb.balance);
      if (actual !== expected) {
        mismatches.push({ address, expected, actual });
      }
    }

    if (mismatches.length > 0) {
      const details = mismatches
        .sort((a, b) => Number(b.expected - a.expected))
        .slice(0, 10)
        .map((m) => `  ${m.address}  expected=${m.expected}  actual=${m.actual}`)
        .join("\n");
      throw new Error(
        `${mismatches.length} accounts have wrong ${token.name} balance:\n${details}`
      );
    }
  }, 60_000);
  }
});
