# Pass 2: Test Coverage Review — `src/index.ts`

**Auditor:** A04
**Date:** 2026-03-22
**File:** `src/index.ts` (182 lines)

## Evidence of Reading

### Functions and key code locations

| Line(s) | Function/Statement | Description |
|----------|-------------------|-------------|
| 17 | `config()` | Top-level dotenv load |
| 26-176 | `main()` | Sole async orchestration function |
| 27 | `parseEnv()` call | Destructures `seed`, `startSnapshot`, `endSnapshot` |
| 30 | `generateSnapshotBlocks()` call | Generates 30 deterministic snapshot blocks |
| 33 | `mkdir(OUTPUT_DIR, { recursive: true })` | Ensures output directory exists |
| 36-39 | `writeFile(...)` | Writes snapshot blocks to file |
| 47-50 | Transfer file reading loop | Reads `TRANSFER_FILE_COUNT` files with `.catch(() => "")` |
| 55-56 | Liquidity file read | Reads + parses `liquidity.dat` via `parseJsonl` |
| 61-62 | Pools file read | Reads + `JSON.parse` on `pools.dat` |
| 67-68 | Blocklist file read | Reads + `parseBlocklist` on `blocklist.txt` |
| 73-74 | Client + Processor setup | Creates viem client, instantiates `Processor` |
| 78-80 | Liquidity organization loop | Calls `processor.organizeLiquidityPositions` per event |
| 85-92 | Transfer processing loop | Calls `processor.processTransfer` per transfer (with progress logging every 1000) |
| 97-104 | Liquidity processing loop | Calls `processor.processLiquidityPositions` per event (with progress logging every 1000) |
| 108 | `processor.processLpRange()` | V3 pool price range processing |
| 113 | `processor.getEligibleBalances()` | Gets all eligible balances |
| 116-129 | Balance verification loop | Iterates `summarizeTokenBalances()`, throws if `!summary.verified` |
| 133-140 | Rewards calculation + per-token logging | Calculates rewards, logs per-token totals |
| 141-148 | Balances CSV write | Aggregates, sorts, formats, writes `balances-*.csv` |
| 154-160 | Rewards CSV write | Filters zeros, formats, writes `rewards-*.csv` |
| 163-173 | Tolerance check | Computes total rewards vs `REWARD_POOL`, throws if abs(diff) > 0.1% |
| 178-181 | Entry point | `main().catch(...)` with `process.exit(1)` |

### Branches and error paths

| Line(s) | Branch/Path | Description |
|----------|------------|-------------|
| 48 | `.catch(() => "")` | Swallows ALL errors when reading transfer files |
| 125-127 | `if (!summary.verified)` | Throws `Error` when balance verification invariant fails |
| 136 | `if (tokenRewards)` | Guards per-token reward logging when a token has rewards |
| 171-173 | `if (abs(diff) > REWARD_POOL / 1000n)` | Throws when total rewards diverge > 0.1% from pool |
| 178-181 | `.catch((error) => ...)` | Top-level error handler; logs and exits with code 1 |

## Test Coverage Analysis

### Existing test coverage for imported functions

The individual utility functions called by `main()` are well-tested in `src/pipeline.test.ts`:
- `parseJsonl` — 6 tests including malformed JSON, empty input, single line
- `parseBlocklist` — 8 tests including validation, empty lines, real data format
- `aggregateRewardsPerAddress` — 4 tests
- `sortAddressesByReward` — 4 tests
- `filterZeroRewards` — 5 tests
- `formatRewardsCsv` — 3 tests
- `formatBalancesCsv` — 5 tests
- `summarizeTokenBalances` — 4 tests (including `verified: false` case)

Output integrity is tested in `src/rewardsOutput.test.ts`:
- Rewards CSV format, positive values, no duplicates, address validation, sorted order
- Total rewards within 0.1% of `REWARD_POOL` (end-to-end check on actual output)
- Balances CSV column structure, rewarded addresses present
- Blocklist cheaters excluded, reporters have positive rewards

### Coverage gaps

No `src/index.test.ts` exists. No test file imports from or references `src/index.ts`.

---

## Findings

### F-01: No unit test for the reward pool tolerance check logic [MEDIUM]

**Location:** Lines 163-173

```typescript
const totalRewards = Array.from(totalRewardsPerAddress.values()).reduce(
  (sum, reward) => sum + reward,
  0n
);
const diff = totalRewards - REWARD_POOL;
if (diff < 0n ? -diff > REWARD_POOL / 1000n : diff > REWARD_POOL / 1000n) {
  throw new Error(`Reward pool difference too large: ${diff}`);
}
```

**Description:** The tolerance check is inlined in `main()` and has no direct unit test. `rewardsOutput.test.ts` tests the *positive* case (the actual output is within tolerance) but never exercises the *failure* path -- i.e., verifying that the pipeline throws when drift exceeds 0.1%. The ternary-based absolute value on `diff` has subtle boundary conditions (exactly at threshold, negative diff, positive diff, zero diff) that go untested.

This logic is a critical safety invariant: it is the last line of defense preventing a broken reward calculation from producing output. If someone refactors this condition incorrectly (e.g., flips a sign, changes the divisor), no test would catch it.

**Recommendation:** Extract the tolerance check into a named, exported function and add unit tests covering: within tolerance (positive diff), within tolerance (negative diff), at boundary, exceeds tolerance (positive), exceeds tolerance (negative), zero diff.

**Severity:** MEDIUM -- This is a safety-critical invariant with no direct test coverage. While the end-to-end output test in `rewardsOutput.test.ts` validates the happy path indirectly, the error path is completely untested.

---

### F-02: No unit test for balance verification throw [MEDIUM]

**Location:** Lines 125-127

```typescript
if (!summary.verified) {
  throw new Error(`Balance verification failed for ${summary.name}: totalAverage - totalPenalties + totalBounties !== totalFinal`);
}
```

**Description:** `summarizeTokenBalances` is tested in `pipeline.test.ts` including the case where `verified` is `false`. However, the throwing behavior in `main()` when `verified === false` is never tested. This is a second safety invariant: it guards against inconsistent balance arithmetic. If the throw were accidentally removed during refactoring, no test would fail.

**Recommendation:** Extract the verification loop into a named function (e.g., `verifyTokenBalances`) and test that it throws when any token's summary has `verified === false`.

**Severity:** MEDIUM -- Same rationale as F-01. The underlying computation is tested, but the guard that halts the pipeline on failure is not.

---

### F-03: No test for silent transfer file read errors [LOW]

**Location:** Lines 47-50

```typescript
for (let i = 0; i < TRANSFER_FILE_COUNT; i++) {
  const transfersData = await readFile(`${DATA_DIR}/${TRANSFERS_FILE_BASE}${i + 1}.dat`, "utf8").catch(() => "");
  transfers = [...transfers, ...parseJsonl(transfersData)]
}
```

**Description:** The `.catch(() => "")` handler swallows all errors (not just `ENOENT`) when reading transfer files. There is no test that verifies the behavior when a transfer file is missing, unreadable, or corrupt. This was already flagged as F-02 in the Pass 1 security review, but remains without test coverage.

**Recommendation:** If the catch-all is intentional, add a test confirming the pipeline produces correct output when some transfer files are absent. If not, the fix from `A04-PASS1-2.md` (distinguish `ENOENT` from other errors) should be applied and tested.

**Severity:** LOW -- Mitigated by CI determinism checks, but the silent error swallowing behavior is untested.

---

### F-04: No test for pools `JSON.parse` without validation [LOW]

**Location:** Lines 61-62

```typescript
const poolsData = await readFile(`${DATA_DIR}/${POOLS_FILE}`, "utf8");
const pools: `0x${string}`[] = JSON.parse(poolsData);
```

**Description:** Pool data is parsed with `JSON.parse` and type-asserted without runtime validation. No test verifies behavior when `pools.dat` contains non-array JSON, non-string entries, or invalid addresses. This was flagged as F-01 in the Pass 1 security review. Once validation is added per `A04-PASS1-1.md`, tests should cover the new validation paths.

**Severity:** LOW -- Dependent on the Pass 1 fix. If the fix is applied, tests for the validation logic should accompany it.

---

### F-05: No test for `main()` top-level error handler [INFO]

**Location:** Lines 178-181

```typescript
main().catch((error) => {
  console.error("Error occurred:", error);
  process.exit(1);
});
```

**Description:** The top-level error handler logs and exits with code 1. This is not tested -- but testing `process.exit` behavior in a unit test is non-trivial and of limited value. The behavior is standard Node.js error handling.

**Severity:** INFO -- Standard pattern, low risk of regression.

---

### F-06: No test for `tokenRewards` guard in per-token reward logging [INFO]

**Location:** Lines 134-140

```typescript
for (const token of CYTOKENS) {
  const tokenRewards = rewardsPerToken.get(token.address.toLowerCase());
  if (tokenRewards) {
    const totalForToken = Array.from(tokenRewards.values()).reduce((a, b) => a + b, 0n);
    console.log(`Total rewards for ${token.name}: ${totalForToken}`);
  }
}
```

**Description:** The `if (tokenRewards)` guard silently skips tokens with no rewards in the map. This is console logging only and has no effect on output correctness, so the lack of a test is acceptable.

**Severity:** INFO -- Logging-only code path; no impact on output.

---

## Summary

| ID   | Severity | Title |
|------|----------|-------|
| F-01 | MEDIUM   | No unit test for reward pool tolerance check logic |
| F-02 | MEDIUM   | No unit test for balance verification throw |
| F-03 | LOW      | No test for silent transfer file read errors |
| F-04 | LOW      | No test for pools `JSON.parse` without validation |
| F-05 | INFO     | No test for `main()` top-level error handler |
| F-06 | INFO     | No test for per-token reward logging guard |

**Overall:** `index.ts` has **no dedicated test file**. The individual utility functions it calls are well-tested in `pipeline.test.ts`, and the end-to-end output is validated in `rewardsOutput.test.ts`. However, two safety-critical invariants -- the reward pool tolerance check (F-01) and the balance verification throw (F-02) -- are inlined in `main()` with only their happy paths covered by integration tests. The error paths that halt the pipeline on detected corruption are untested.
