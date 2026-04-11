/**
 * Tests that the subgraph's LP balance tracking matches the rewards processor's
 * computation from raw liquidity events. Failures here indicate the subgraph
 * is not crediting LP deposits correctly.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { EPOCHS, CURRENT_EPOCH, SUBGRAPH_URL } from "./constants";

const CYSFLR = "0x19831cfb53a0dbead9866c43557c1d48dff76567";

interface LiquidityEvent {
  owner: string;
  tokenAddress: string;
  blockNumber: string;
  depositedBalanceChange: string;
  changeType: string;
}

function computeLpBalancesFromEvents(
  tokenAddress: string,
  maxBlock: number,
): Map<string, bigint> {
  const data = readFileSync("./data/liquidity.dat", "utf8");
  const balances = new Map<string, bigint>();
  for (const line of data.split("\n").filter(Boolean)) {
    const event: LiquidityEvent = JSON.parse(line);
    if (event.tokenAddress !== tokenAddress) continue;
    if (parseInt(event.blockNumber) > maxBlock) continue;
    const prev = balances.get(event.owner) ?? 0n;
    balances.set(event.owner, prev + BigInt(event.depositedBalanceChange));
  }
  return balances;
}

async function querySubgraphLpBalances(
  tokenAddress: string,
): Promise<Map<string, bigint>> {
  const response = await fetch(SUBGRAPH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `{ vaultBalances(where: {vault: "${tokenAddress}"}, first: 1000) { owner { id } lpBalance } }`,
    }),
  });
  const data = await response.json();
  const balances = new Map<string, bigint>();
  for (const vb of data.data.vaultBalances) {
    const lp = BigInt(vb.lpBalance);
    if (lp !== 0n) {
      balances.set(vb.owner.id, lp);
    }
  }
  return balances;
}

describe("subgraph lpBalance matches rewards processor", () => {
  const epoch = EPOCHS[CURRENT_EPOCH - 1];

  it("cysFLR lpBalance matches for all accounts with LP positions", async () => {
    const expected = computeLpBalancesFromEvents(CYSFLR, epoch.endBlock!);
    const actual = await querySubgraphLpBalances(CYSFLR);

    const accountsWithLp = [...expected.entries()].filter(([, v]) => v > 0n);
    const mismatches: Array<{ address: string; expected: bigint; actual: bigint }> = [];

    for (const [address, expectedLp] of accountsWithLp) {
      const actualLp = actual.get(address) ?? 0n;
      if (actualLp !== expectedLp) {
        mismatches.push({ address, expected: expectedLp, actual: actualLp });
      }
    }

    if (mismatches.length > 0) {
      const details = mismatches
        .sort((a, b) => Number(b.expected - a.expected))
        .slice(0, 10)
        .map((m) => `  ${m.address}  expected=${m.expected}  actual=${m.actual}`)
        .join("\n");
      throw new Error(
        `${mismatches.length} of ${accountsWithLp.length} accounts have wrong cysFLR lpBalance in subgraph:\n${details}`
      );
    }
  }, 30_000);
});
