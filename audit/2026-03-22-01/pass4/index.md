# Pass 4: Code Quality Review -- `src/index.ts`

**Auditor:** A04
**Date:** 2026-03-22
**File:** `src/index.ts` (182 lines)

## Evidence of Thorough Reading

### Imports (lines 6-14)

| Line | Import |
|------|--------|
| 6 | `readFile`, `writeFile`, `mkdir` from `fs/promises` |
| 7 | `createPublicClient`, `http` from `viem` |
| 8 | `flare` from `viem/chains` |
| 9 | `Processor` from `./processor` |
| 10 | `config` from `dotenv` |
| 11 | `CYTOKENS`, `generateSnapshotBlocks`, `parseEnv`, `RPC_URL` from `./config` |
| 12 | `aggregateRewardsPerAddress`, `filterZeroRewards`, `formatBalancesCsv`, `formatRewardsCsv`, `parseBlocklist`, `parseJsonl`, `sortAddressesByReward`, `summarizeTokenBalances` from `./pipeline` |
| 13 | `BLOCKLIST_FILE`, `DATA_DIR`, `LIQUIDITY_FILE`, `OUTPUT_DIR`, `POOLS_FILE`, `REWARD_POOL`, `TRANSFER_FILE_COUNT`, `TRANSFERS_FILE_BASE` from `./constants` |
| 14 | `LiquidityChange`, `Transfer` from `./types` |

### Top-level Statements

| Line | Statement |
|------|-----------|
| 17 | `config()` -- dotenv side effect |

### Functions

| Line(s) | Name | Kind | Exported |
|---------|------|------|----------|
| 26-176 | `main()` | async function | No |
| 178-181 | `main().catch(...)` | entry point invocation | N/A |

### All Variables Declared in `main()`

| Line | Variable | Type |
|------|----------|------|
| 27 | `SEED`, `START_SNAPSHOT`, `END_SNAPSHOT` | destructured from `parseEnv()` |
| 30 | `SNAPSHOTS` | `number[]` |
| 46 | `transfers` | `Transfer[]` |
| 48 | `transfersData` | `string` (loop-scoped) |
| 55 | `liquidityData` | `string` |
| 56 | `liquidities` | `LiquidityChange[]` |
| 61 | `poolsData` | `string` |
| 62 | `pools` | `` `0x${string}`[] `` |
| 67 | `blocklistData` | `string` |
| 68 | `reports` | `BlocklistReport[]` |
| 73 | `client` | viem `PublicClient` |
| 74 | `processor` | `Processor` |
| 84 | `processedCount` | `number` |
| 96 | `liquidityProcessedCount` | `number` |
| 113 | `balances` | `EligibleBalances` |
| 133 | `rewardsPerToken` | `RewardsPerToken` |
| 137 | `totalForToken` | `bigint` (loop-scoped) |
| 141 | `totalRewardsPerAddress` | `Map<string, bigint>` |
| 142 | `addresses` | `string[]` |
| 143 | `balancesOutput` | `string[]` |
| 154 | `rewardedAddresses` | `string[]` |
| 155 | `rewardsOutput` | `string[]` |
| 163 | `totalRewards` | `bigint` |
| 167 | `diff` | `bigint` |

---

## Findings

### P4-IDX-01: Inlined tolerance check uses manual absolute value instead of a named function [MEDIUM]

**Location:** Lines 171-173

```typescript
if (diff < 0n ? -diff > REWARD_POOL / 1000n : diff > REWARD_POOL / 1000n) {
  throw new Error(`Reward pool difference too large: ${diff}`);
}
```

**Description:** The reward pool tolerance check encodes two distinct responsibilities in a single inlined expression: (1) computing the absolute value of a BigInt, and (2) comparing it against a tolerance threshold derived from a magic divisor `1000n`. The ternary-based absolute value is a non-obvious idiom -- BigInt has no built-in `abs()` -- and the threshold `REWARD_POOL / 1000n` (0.1%) is an unexplained magic number.

This is a safety-critical invariant: the last guard preventing corrupt reward data from being written. Inlining it in `main()` means:
- The tolerance threshold cannot be referenced or tested independently.
- The ternary absolute value pattern is error-prone if modified (e.g., accidentally flipping a sign operator).
- The 0.1% tolerance is not named or documented at the point of use.

This was flagged in Pass 2 (F-01) as lacking test coverage. Extracting it is a prerequisite for testability.

**Recommendation:** Extract to a named, exported function with a named constant for the tolerance divisor. See fix file A04-PASS4-1.md.

---

### P4-IDX-02: Quadratic array growth in transfer file loading loop [LOW]

**Location:** Lines 46-50

```typescript
let transfers: Transfer[] = []
for (let i = 0; i < TRANSFER_FILE_COUNT; i++) {
    const transfersData = await readFile(`${DATA_DIR}/${TRANSFERS_FILE_BASE}${i + 1}.dat`, "utf8").catch(() => "");
    transfers = [...transfers, ...parseJsonl(transfersData)]
}
```

**Description:** Each loop iteration allocates a new array containing all previous transfers plus the new batch via spread. With up to 10 files of ~270,000 lines each (up to ~2.7M total transfers), this creates progressively larger intermediate arrays: the first iteration copies 0+270k elements, the second copies 270k+270k, the third copies 540k+270k, etc. The total element copies sum to O(n*k) where n is total transfers and k is the number of files -- effectively quadratic in the number of files.

This was noted as INFO in Pass 1 (F-04) and the fix in A04-PASS1-2.md already addresses it by switching to `transfers.push(...parseJsonl(transfersData))`. However, if that fix is not applied, this remains an independent code quality issue.

Every other loop in this file (lines 78-80, 85-92, 97-104) processes items one at a time rather than rebuilding collections. The spread-reassignment pattern on line 49 is the only instance of this anti-pattern in the file.

**Recommendation:** Replace `transfers = [...transfers, ...parseJsonl(transfersData)]` with `transfers.push(...parseJsonl(transfersData))`. See fix file A04-PASS4-2.md.

---

### P4-IDX-03: Inconsistent naming convention -- UPPER_CASE for local variables [LOW]

**Location:** Lines 27, 30

```typescript
const { seed: SEED, startSnapshot: START_SNAPSHOT, endSnapshot: END_SNAPSHOT } = parseEnv();
const SNAPSHOTS = generateSnapshotBlocks(SEED, START_SNAPSHOT, END_SNAPSHOT);
```

**Description:** `SEED`, `START_SNAPSHOT`, `END_SNAPSHOT`, and `SNAPSHOTS` are local variables inside `main()`, but they use UPPER_CASE naming -- a convention normally reserved for module-level constants. Compare with other local variables in the same function: `transfers` (line 46), `liquidities` (line 56), `pools` (line 62), `reports` (line 68), `client` (line 73), `processor` (line 74), `balances` (line 113), `rewardsPerToken` (line 133), `addresses` (line 142), etc. -- all use camelCase.

The UPPER_CASE names likely originated from when these were read directly from `process.env` (environment variables are conventionally UPPER_CASE). After the refactor to `parseEnv()`, the destructured results are ordinary local `const` bindings and should follow the same camelCase convention as the rest of the function.

**Recommendation:** Rename to camelCase: `seed`, `startSnapshot`, `endSnapshot`, `snapshots`. See fix file A04-PASS4-3.md.

---

### P4-IDX-04: Missing semicolons on lines 46 and 49 [LOW]

**Location:** Lines 46, 49

```typescript
let transfers: Transfer[] = []    // line 46 -- no semicolon
// ...
transfers = [...transfers, ...parseJsonl(transfersData)]  // line 49 -- no semicolon
```

**Description:** Lines 46 and 49 omit trailing semicolons. Every other statement in the file uses explicit semicolons (e.g., lines 30, 55, 56, 62, 68, 73, 74, 113, 133, 141, 142, 154, 155, 163, 167). ASI (Automatic Semicolon Insertion) makes this functionally correct, but the inconsistency suggests these lines were added or modified in a different editing session without linting.

**Recommendation:** Add semicolons to lines 46 and 49. See fix file A04-PASS4-4.md.

---

### P4-IDX-05: Balance verification loop mixes logging and invariant enforcement [LOW]

**Location:** Lines 116-129

```typescript
for (const summary of summarizeTokenBalances(balances, CYTOKENS)) {
  console.log("Getting token balances for ", summary.name);
  console.log("- Total Avg:", summary.totalAverage.toString());
  console.log("- Total Penalties:", summary.totalPenalties.toString());
  console.log("- Total Bounties:", summary.totalBounties.toString());
  console.log("- Total Final:", summary.totalFinal.toString());
  console.log(
    `Note: Final Total for ${summary.name} should equal Average Total - Penalties + Bounties`
  );
  if (!summary.verified) {
    throw new Error(`Balance verification failed for ${summary.name}: ...`);
  }
  console.log("Verification: ✓");
}
```

**Description:** This loop interleaves seven `console.log` calls (observational side effects) with a safety-critical `throw` (invariant enforcement). The inline comment on line 115 says "Add per-token balance logging" (flagged in P3-IDX-06 as misleading), reinforcing the impression that this is a logging block. A maintainer removing "verbose logging" could accidentally delete the invariant check.

Additionally, the log message on line 116 says "Getting token balances for" but the balances have already been retrieved at line 113. The log is actually printing a verification summary, not "getting" anything.

Separating the invariant check from the logging would make the safety-critical path explicit and independently testable (as recommended in Pass 2, F-02).

**Recommendation:** Extract the invariant check into a separate named function. Keep logging in `main()` if desired, but make the throw path structurally distinct. See fix file A04-PASS4-5.md.

---

### P4-IDX-06: Console log says "Getting token balances" during a summary/verification step [INFO]

**Location:** Line 116

```typescript
console.log("Getting token balances for ", summary.name);
```

**Description:** The message "Getting token balances for" implies an active data-fetching operation, but this code is iterating over already-computed summaries to log and verify them. The actual balance retrieval happened on line 113 (`processor.getEligibleBalances()`). This is a minor readability issue -- the log output could mislead someone reading pipeline logs into thinking this step involves additional computation or I/O.

**Recommendation:** Change to `console.log("Token balance summary for", summary.name);` or similar.

---

### P4-IDX-07: Console log says "Calculating rewards..." after rewards are already calculated [INFO]

**Location:** Line 151

```typescript
console.log("Calculating rewards...");
```

**Description:** Rewards were calculated on line 133 (`processor.calculateRewards(REWARD_POOL)`). By line 151, the code is filtering zero-reward addresses and formatting the CSV -- no further calculation occurs. This was also flagged in Pass 3 (P3-IDX-07) as a stale comment; the corresponding `console.log` has the same staleness.

**Recommendation:** Change to `console.log("Writing rewards CSV...");` or remove.

---

### P4-IDX-08: Progress logging uses hardcoded modulo `1000` in two places [INFO]

**Location:** Lines 89 and 101

```typescript
if (processedCount % 1000 === 0) {          // line 89
if (liquidityProcessedCount % 1000 === 0) { // line 101
```

**Description:** The progress logging interval `1000` appears as a magic number in two separate loops. This is a minor style point -- the value is self-evident in context (log every 1000 items), and changing it would be a single search-replace. No named constant is needed, but the duplication is worth noting for completeness.

---

## Summary

| ID | Severity | Title |
|----|----------|-------|
| P4-IDX-01 | MEDIUM | Inlined tolerance check uses manual absolute value instead of a named function |
| P4-IDX-02 | LOW | Quadratic array growth in transfer file loading loop |
| P4-IDX-03 | LOW | Inconsistent naming convention -- UPPER_CASE for local variables |
| P4-IDX-04 | LOW | Missing semicolons on lines 46 and 49 |
| P4-IDX-05 | LOW | Balance verification loop mixes logging and invariant enforcement |
| P4-IDX-06 | INFO | Console log says "Getting token balances" during summary step |
| P4-IDX-07 | INFO | Console log says "Calculating rewards..." after calculation is done |
| P4-IDX-08 | INFO | Progress logging uses hardcoded modulo 1000 in two places |

**Overall:** `index.ts` is a well-structured orchestration file that delegates domain logic to imported modules. The code is readable with thorough inline comments marking each pipeline stage. The main code quality concern is P4-IDX-01: the safety-critical tolerance check is inlined as a non-obvious ternary expression with a magic threshold, making it both hard to read and impossible to unit test independently. The remaining LOW findings are minor style inconsistencies (naming convention, semicolons, array growth pattern, mixed concerns in the verification loop) that reflect the file evolving across multiple editing sessions without a strict linter enforcing uniformity.
