# Pass 2 -- Test Coverage: `src/index.ts`

Auditor: A04
Date: 2026-02-24
File under review: `src/index.ts` (247 lines)

## Summary

There is **no dedicated test file** for `src/index.ts`. No test file in the repository imports from `./index` or exercises the `main()` function directly. A grep across all five test files (`config.test.ts`, `diffCalculator.test.ts`, `diffCalculatorOutput.test.ts`, `liquidity.test.ts`, `processor.test.ts`) confirms zero imports or references to index.ts functionality.

The CI workflow (`git-clean.yaml`) provides an indirect integration check by running the full pipeline and asserting no uncommitted changes, but this is a determinism gate, not a correctness test. It does not validate edge cases, error paths, or behavioral contracts of the code in `index.ts`.

The following findings detail each untested area.

---

## A04-1: `main()` function -- zero unit or integration test coverage

**Severity:** Medium
**Location:** `src/index.ts`, lines 13-241

The entire `main()` function is untested. It is the orchestration entry point that wires together scraping output, the processor, reward calculation, CSV generation, and file I/O. No test instantiates or invokes `main()` in any form (mocked or otherwise).

**What is at risk:** Any regression in the orchestration order (e.g., calling `processLiquidityPositions` before `organizeLiquidityPositions`, or writing files before processing completes) would go undetected by the test suite. The only safety net is the CI determinism check, which will only catch regressions that change output files -- it cannot catch logic errors that happen to produce the same output or that only manifest with different input data.

---

## A04-2: Environment variable handling -- no validation, silent fallback to zero

**Severity:** High
**Location:** `src/index.ts`, lines 10-11, 15

```typescript
const START_SNAPSHOT = parseInt(process.env.START_SNAPSHOT || "0");
const END_SNAPSHOT = parseInt(process.env.END_SNAPSHOT || "0");
// ...
const SNAPSHOTS = generateSnapshotBlocks(process.env.SEED!, START_SNAPSHOT, END_SNAPSHOT);
```

There are three problems here, none of which are tested:

1. **Silent fallback to `0`:** If `START_SNAPSHOT` or `END_SNAPSHOT` are unset or empty, `parseInt` returns `0`. The pipeline proceeds with `START_SNAPSHOT=0, END_SNAPSHOT=0`, which would produce a degenerate snapshot range. There is no assertion or early-exit check. By contrast, `src/scraper.ts` line 15 uses `assert(process.env.END_SNAPSHOT, ...)` to fail fast.

2. **Non-numeric strings:** `parseInt("abc")` returns `NaN`. The code does not check for `NaN`. `generateSnapshotBlocks` would receive `NaN` as start/end and `seedrandom` would produce unpredictable results. No test covers this path.

3. **`SEED` uses non-null assertion (`!`):** If `SEED` is undefined, the `!` operator suppresses the TypeScript error but passes `undefined` to `generateSnapshotBlocks` at runtime. The `seedrandom` library accepts `undefined` and produces a deterministic-but-wrong sequence. No test validates that `SEED` is actually set.

**Recommendation:** Add fail-fast assertions (like the scraper does) for all three environment variables, and add tests that verify the pipeline rejects missing or invalid configuration.

---

## A04-3: JSONL file parsing -- untested, fragile, no error handling

**Severity:** Medium
**Location:** `src/index.ts`, lines 31-55

```typescript
// transfers: lines 32-39
for (let i = 0; i < 10; i++) {
  const transfersData = await readFile(`data/transfers${i + 1}.dat`, "utf8").catch(() => "");
  const transfersBatch = transfersData
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  transfers = [...transfers, ...transfersBatch]
}

// liquidity: lines 44-48
const liquidityData = await readFile("data/liquidity.dat", "utf8");
const liquidities = liquidityData
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line));

// pools: lines 53-54
const poolsData = await readFile("data/pools.dat", "utf8");
const pools = JSON.parse(poolsData);
```

No tests cover this parsing logic. Specific concerns:

1. **Inconsistent error handling between file types:** Transfer files silently swallow read errors via `.catch(() => "")`, meaning a missing `transfers3.dat` would silently produce zero transfers from that file with no warning. Liquidity and pools files have no catch, so a missing file crashes the pipeline. This asymmetry is untested.

2. **Malformed JSON lines:** A single corrupted line in any `.dat` file will throw an unhandled `JSON.parse` error and crash the pipeline. There is no line-level error handling or reporting of which file/line failed.

3. **Pools file uses `JSON.parse(poolsData)` (single JSON object)** while transfers and liquidity use JSONL (one JSON object per line). This inconsistency is not documented or tested.

4. **No type validation:** Parsed objects are typed as `any[]`. Malformed objects (e.g., missing `from`/`to`/`value` fields) would silently propagate into the processor with `undefined` fields.

---

## A04-4: Blocklist parsing -- untested, assumes exact format

**Severity:** Medium
**Location:** `src/index.ts`, lines 59-69

```typescript
const blocklistData = await readFile("data/blocklist.txt", "utf8");
const reports = blocklistData
  .split("\n")
  .filter(Boolean)
  .map((line) => {
    const [reporter, reported] = line.split(" ");
    return {
      reporter: reporter.toLowerCase(),
      cheater: reported.toLowerCase(),
    };
  });
```

While `diffCalculatorOutput.test.ts` reads and validates the blocklist for duplicate cheaters, no test exercises this specific parsing code path in `index.ts`. Concerns:

1. **Format assumption:** `line.split(" ")` assumes exactly one space delimiter. Tabs, multiple spaces, or trailing whitespace would produce incorrect results. If a line has only one token (no space), `reported` would be `undefined`, and `.toLowerCase()` would throw a runtime error.

2. **No validation of addresses:** Parsed reporter/cheater strings are not validated as valid Ethereum addresses.

3. **Note:** The `diffCalculatorOutput.test.ts` file (lines 209-220) does test blocklist integrity (no duplicate cheaters) but parses the file independently -- it does not exercise the `index.ts` parsing code.

---

## A04-5: CSV output generation -- untested format and content

**Severity:** Medium
**Location:** `src/index.ts`, lines 153-228

The CSV output generation spans approximately 75 lines and produces two files (`balances-*.csv` and `rewards-*.csv`). None of this logic is tested:

1. **Balances CSV header construction (lines 154-157):** A complex string interpolation builds dynamic column headers from `CYTOKENS` and `SNAPSHOTS`. Any error in this construction (e.g., off-by-one in snapshot indexing, missing comma) would produce malformed CSV. No test validates the header format.

2. **Balances CSV row construction (lines 186-201):** Each row concatenates snapshot values, average, penalty, bounty, final, and per-token rewards. The fallback when a token balance is missing (line 190: `return \`${snapshotsDefault},0,0,0,0,0\``) must produce the correct number of columns to match the header. No test validates column count consistency.

3. **Rewards CSV construction (lines 217-228):** The rewards CSV uses constants `REWARDS_CSV_COLUMN_HEADER_ADDRESS` and `REWARDS_CSV_COLUMN_HEADER_REWARD` for headers. The downstream `diffCalculator.ts` and the Flare distribution tool both depend on this exact format. No test in the index.ts context validates the output matches what consumers expect.

---

## A04-6: Zero-reward filtering with `splice` -- untested, has a known bug pattern

**Severity:** High
**Location:** `src/index.ts`, lines 212-216

```typescript
for (const [address, reward] of totalRewardsPerAddress) {
  if (reward === 0n) {
    addresses.splice(addresses.indexOf(address), 1);
  }
}
```

This code has zero test coverage and contains a subtle but well-known bug pattern:

1. **`indexOf` returns -1 for missing elements:** If `address` exists in `totalRewardsPerAddress` but not in `addresses` (theoretically impossible given the code flow, but untested), `indexOf` returns `-1`. `splice(-1, 1)` removes the *last* element of the array, silently corrupting the output by removing a legitimate reward recipient.

2. **Mutating array during iteration of a different collection:** While this iterates over the Map (not the array being spliced), the relationship between the Map keys and the array entries is assumed to be 1:1. No test verifies this invariant.

3. **Inefficiency and fragility:** Each `splice` call is O(n) on the addresses array, and each `indexOf` is also O(n), making the overall operation O(n^2). More importantly, if the same address appeared multiple times in `addresses` (which shouldn't happen but isn't enforced), only the first occurrence would be removed. A `filter` approach would be both safer and more testable:
   ```typescript
   const filteredAddresses = addresses.filter(addr => totalRewardsPerAddress.get(addr) !== 0n);
   ```

4. **Zero-reward inclusion in totalRewards sum (line 232-235):** After splicing zero-reward addresses out of `addresses`, the `totalRewards` verification sum on line 232 still iterates `totalRewardsPerAddress.values()` which includes zero-reward entries. This is harmless (adding 0n doesn't change the sum) but inconsistent -- the rewards CSV excludes zero-reward addresses while the verification sum includes them. No test validates either behavior.

---

## A04-7: Balance verification logic -- console-only, untested, no failure mode

**Severity:** Medium
**Location:** `src/index.ts`, lines 116-150, 231-238

```typescript
// Per-token verification (lines 146-149):
console.log(
  `Verification: ${
    totalAverage - totalPenalties + totalBounties === totalFinal ? "checkmark" : "X"
  }`
);

// Total rewards verification (lines 232-238):
const totalRewards = Array.from(totalRewardsPerAddress.values()).reduce(
  (sum, reward) => sum + reward, 0n
);
console.log(`\nTotal rewards: ${totalRewards}`);
console.log(`Reward pool: ${REWARD_POOL}`);
console.log(`Difference: ${totalRewards - REWARD_POOL}`);
```

Two verification checks exist but are entirely untested:

1. **Per-token balance verification (line 147):** Checks that `totalAverage - totalPenalties + totalBounties === totalFinal`. If this invariant fails, it only prints "X" to the console. The pipeline continues and writes potentially incorrect CSV output. There is no `assert`, no thrown error, and no non-zero exit code. A test should verify that the invariant holds and that a violation is treated as a hard failure.

2. **Total rewards vs. reward pool (lines 232-238):** Prints the difference between calculated total rewards and the reward pool but does not assert or fail if the difference is unacceptable. The comment on line 238 says "Should be very small due to rounding" but there is no threshold check. A test should define an acceptable rounding tolerance and assert it.

**Recommendation:** Both verifications should throw or exit with a non-zero code on failure, and both should have dedicated tests that exercise both the passing and failing cases.

---

## Summary Table

| ID    | Finding                                          | Severity | Lines     |
|-------|--------------------------------------------------|----------|-----------|
| A04-1 | `main()` has zero test coverage                  | Medium   | 13-241    |
| A04-2 | Environment variable handling is unvalidated      | High     | 10-15     |
| A04-3 | JSONL file parsing is untested and fragile        | Medium   | 31-55     |
| A04-4 | Blocklist parsing assumes exact format            | Medium   | 59-69     |
| A04-5 | CSV output generation format is untested          | Medium   | 153-228   |
| A04-6 | Zero-reward splice has a known bug pattern        | High     | 212-216   |
| A04-7 | Balance verification is console-only, never fails | Medium   | 116-150, 231-238 |

**Overall assessment:** `src/index.ts` is the most critical file in the pipeline -- it is the entry point that orchestrates all computation and produces the final output that drives on-chain token distribution. Despite this, it has zero dedicated test coverage. The CI determinism gate provides some regression protection but cannot substitute for unit tests that validate edge cases, error handling, and correctness invariants. The two high-severity findings (A04-2 and A04-6) represent real risks: silent misconfiguration and a splice pattern that could silently corrupt output under unexpected conditions.
