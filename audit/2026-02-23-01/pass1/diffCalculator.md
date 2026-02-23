# Security Audit Pass 1 -- diffCalculator.ts

**Agent:** A03
**Date:** 2026-02-23
**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/diffCalculator.ts`
**Lines:** 176

---

## Evidence of Thorough Reading

### Module Purpose
Compares newly calculated reward allocations against previously distributed (old) rewards for the Dec 2025 rewards case on Flare Network. Identifies underpaid accounts, partitions remaining undistributed accounts into "covered" (payable from the remaining reward pool) vs. "uncovered" (insufficient remaining funds), and writes three output CSVs. Invokes `main()` unconditionally at module scope (line 175).

### Imports (lines 1-2)
- `readFileSync`, `writeFileSync` from `"fs"` (line 1)
- `REWARD_POOL`, `REWARDS_CSV_COLUMN_HEADER_ADDRESS`, `REWARDS_CSV_COLUMN_HEADER_REWARD`, `DIFF_CSV_COLUMN_HEADER_OLD`, `DIFF_CSV_COLUMN_HEADER_NEW`, `DIFF_CSV_COLUMN_HEADER_DIFF` from `"./constants"` (line 2)

### Constants Defined
- `DISTRIBUTED_COUNT = 100 as const` (line 4) -- number of accounts from oldRewards that were already distributed on-chain

### Types Defined
- `RewardEntry` (line 46): `{address: string; reward: bigint}`
- `DiffEntry` (line 47): `{address: string; old: bigint; new: bigint; diff: bigint}`
- `DiffResult` (lines 49-59): interface with fields `covered`, `uncovered`, `underpaid`, `totalAlreadyPaid`, `remainingRewards`, `totalNewDistribution`, `remainingRewardsDiff`, `totalRemainingUncovered`, `totalUnderpaid`

### Exported Functions
| Function | Line | Signature |
|----------|------|-----------|
| `readCsv` | 10 | `(filePath: string): Array<{address: string; reward: bigint}>` |
| `calculateDiff` | 61 | `(newRewards: RewardEntry[], oldRewards: RewardEntry[], distributedCount: number, rewardPool: bigint): DiffResult` |

### Internal Functions
| Function | Line | Description |
|----------|------|-------------|
| `main` | 128 | Top-level script; reads CSVs, calls `calculateDiff`, writes 3 output CSVs, logs summary |

### Errors Thrown (all in `readCsv`, lines 10-44)
- `"CSV file is empty: ${filePath}"` (line 15)
- `"CSV file has no data rows (only header): ${filePath}"` (line 19)
- `"CSV line ${i + 1} has fewer than 2 columns in ${filePath}: ..."` (line 27)
- `"CSV line ${i + 1} has more than 2 columns in ${filePath}: ..."` (line 30)
- `"CSV line ${i + 1} has empty address in ${filePath}: ..."` (line 34)
- `"CSV line ${i + 1} has empty reward in ${filePath}: ..."` (line 38)

### Key Variables in `calculateDiff` (lines 61-126)
- `remainingUndistributed` (line 68): deep clone of `newRewards`, entries removed as they are matched to old distributed accounts
- `totalAlreadyPaid` (line 69): running sum of old reward amounts for the first `distributedCount` entries
- `underpaid` (line 71): array of `DiffEntry` for accounts that received less than their new entitlement
- `totalUnderpaid` (line 70): sum of underpaid diffs
- `remainingRewards` (line 96): `rewardPool - totalAlreadyPaid`
- `remainingRewardsDiff` (line 97): decremented as covered accounts are allocated
- `covered` / `uncovered` (lines 100-101): partitioned remaining accounts

### `main()` Output Files (lines 128-172)
1. `output/rewards-51504517-52994045-remainingCovered.csv` (line 142)
2. `output/rewards-51504517-52994045-remainingUncovered.csv` (line 150)
3. `output/rewards-51504517-52994045-diff.csv` (line 160)

### `main()` Invocation
- Line 175: `main()` called unconditionally at module scope

---

## Security Findings

### A03-1 -- Out-of-Bounds Access on `oldRewards` Array When `distributedCount > oldRewards.length` [HIGH]

**Location:** Lines 74-76 in `calculateDiff`

**Description:** The loop on line 74 iterates from `0` to `distributedCount`, accessing `oldRewards[i]` on lines 75 and 76. If `distributedCount` exceeds `oldRewards.length`, `oldRewards[i]` will be `undefined`. Accessing `.reward` on `undefined` (line 76) will throw a `TypeError`, and accessing `.address` on `undefined` (line 78) will also throw.

While the test suite includes a test that asserts this throws (line 366 of `diffCalculator.test.ts`), the throw is an accidental `TypeError` from accessing a property on `undefined`, not a deliberate validation error. The function has no explicit bounds check, and the error message would be an opaque `TypeError: Cannot read properties of undefined (reading 'reward')` rather than a meaningful diagnostic.

In `main()` (line 133), `DISTRIBUTED_COUNT` is `100` and the old CSV is expected to have at least 100 rows. But the `calculateDiff` function is exported and could be called with any arguments. A mismatch between `distributedCount` and `oldRewards.length` in a financial calculation should fail loudly and early with a descriptive message.

**Recommendation:** Add an explicit guard at the top of `calculateDiff`:
```typescript
if (distributedCount > oldRewards.length) {
  throw new Error(`distributedCount (${distributedCount}) exceeds oldRewards length (${oldRewards.length})`);
}
```

---

### A03-2 -- Greedy Allocation Algorithm is Order-Dependent and Non-Deterministic [MEDIUM]

**Location:** Lines 102-113 in `calculateDiff`

**Description:** The loop iterates `remainingUndistributed` in the order inherited from the `newRewards` input array and greedily subtracts each account's reward from the remaining budget. If a reward exceeds the remaining budget, the account is placed in the "uncovered" list; otherwise it is "covered."

This is a greedy first-fit algorithm whose output depends entirely on input ordering. A different row order in the source CSV produces a different partition of covered vs. uncovered accounts. Specifically:
1. A large-reward account appearing early can exhaust the budget, pushing many smaller accounts to "uncovered," whereas the opposite ordering would cover all small accounts.
2. There is no deterministic sort applied before the loop.
3. Any entity that can influence CSV row order (e.g., by controlling the order events appear in the subgraph scrape) could influence which accounts get paid.

The test on line 352 (`diffCalculator.test.ts`) explicitly demonstrates this behavior ("large account first exhausts budget") but treats it as expected. This is a design-level concern rather than a bug, but for a financial distribution system, the allocation policy should be explicit and deterministic.

**Recommendation:** Sort `remainingUndistributed` by a deterministic criterion (e.g., descending reward amount, or ascending address) before the allocation loop. Alternatively, document the intended allocation policy and accept the ordering dependency as a known property.

---

### A03-3 -- `remainingRewards` Can Go Negative Without Detection [MEDIUM]

**Location:** Line 96 in `calculateDiff`

**Description:** `remainingRewards` is computed as `rewardPool - totalAlreadyPaid`. If the old rewards CSV contains inflated values (from corruption, a different reward pool, or a different configuration), `totalAlreadyPaid` could exceed `rewardPool`, making `remainingRewards` negative. The subsequent loop (lines 102-113) would then classify every remaining account as "uncovered" since `remainingRewardsDiff - item.reward` would always be negative.

Line 171 in `main()` computes `totalUnderpaid + totalRemainingUncovered - remainingRewardsDiff`. If `remainingRewardsDiff` is negative, this subtraction becomes an addition, inflating the "EXTRA needed" figure or, if `remainingRewardsDiff` went deeply negative, potentially masking the true shortfall.

The function completes silently with misleading output. No test validates behavior when `totalAlreadyPaid > rewardPool`.

**Recommendation:** Assert `remainingRewards >= 0n` after line 96 and throw a descriptive error if violated. This protects against corrupted or mismatched input files.

---

### A03-4 -- No Validation That Reward Strings Are Valid Non-Negative Decimal Integers [MEDIUM]

**Location:** Line 40 in `readCsv`

**Description:** `BigInt(rewardStr)` is called on CSV data. While empty strings are checked (line 37), the code does not validate that `rewardStr` is a valid non-negative decimal integer before conversion. Several problematic inputs are silently accepted or produce unhelpful errors:

1. **Negative values** are accepted silently. A row like `0xabc,-1000` parses to `BigInt(-1000)` without error. The test on line 122 of `diffCalculator.test.ts` explicitly confirms negative values are accepted. Negative rewards would corrupt downstream arithmetic (totals, diffs, remaining pool).
2. **Hexadecimal strings** like `0x1234` are accepted by `BigInt()` and could represent a different magnitude than intended decimal input.
3. **Floating point strings** like `1.5` cause `BigInt()` to throw a `SyntaxError` with an unhelpful generic message rather than a context-aware error.
4. **Non-numeric strings** similarly throw a generic `SyntaxError`.

**Recommendation:** Validate `rewardStr` matches `/^\d+$/` before conversion to ensure only non-negative decimal integers are accepted. Provide a descriptive error message including file path and line number on failure.

---

### A03-5 -- No Address Format Validation [LOW]

**Location:** Lines 32-35, 40 in `readCsv`

**Description:** The only validation on the `address` field is a truthiness check (non-empty). There is no validation that it is a well-formed Ethereum address (`0x` prefix, 40 hex characters, 42 characters total). Malformed addresses would pass through to output CSVs, potentially causing downstream on-chain distribution failures or, worse, sending funds to unintended addresses.

The project uses `viem` as a dependency which provides `isAddress()` for validation.

**Recommendation:** Validate that each address matches `/^0x[0-9a-fA-F]{40}$/` or use `viem`'s `isAddress()`. Throw a descriptive error on mismatch.

---

### A03-6 -- `main()` Executes Unconditionally on Module Import [LOW]

**Location:** Line 175

**Description:** `main()` is called unconditionally at module scope. Importing this module for any reason (e.g., to use `readCsv` or `calculateDiff`) triggers file I/O as a side effect: two file reads and three file writes. The test file works around this by mocking `fs` via `vi.hoisted()`, but this is fragile -- any change to mock setup could cause unintended file system operations during tests.

Since `calculateDiff` was extracted as an exported, testable function, and `readCsv` is also exported, the `main()` side-effect execution is unnecessary for consumers of these functions.

**Recommendation:** Guard the invocation:
```typescript
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
```
Or move `readCsv` and `calculateDiff` into a separate module from the script entrypoint.

---

### A03-7 -- Hardcoded File Paths and Block Range Identifiers [LOW]

**Location:** Lines 130-131, 141-161 in `main`

**Description:** All input and output file paths are hardcoded with specific block-range identifiers (`rewards-51504517-52994045`). The function is a one-off script for a single rewards period. If paths are incorrect or files are missing, the error is a raw Node.js `ENOENT` error. Paths are relative (`"./output/..."`), making behavior dependent on the working directory at execution time.

In a financial system, brittle file handling increases risk of miscalculation from operator error (running from the wrong directory, using stale files).

**Recommendation:** Accept file paths as parameters or environment variables. Use `path.resolve()` for reliability. Validate file existence before processing.

---

### A03-8 -- Duplicate Addresses in Input CSV Are Silently Accepted [LOW]

**Location:** Lines 23-41 in `readCsv`

**Description:** `readCsv` returns duplicate addresses as separate entries without deduplication or error (confirmed by test on line 138 of `diffCalculator.test.ts`). In `calculateDiff`, `findIndex` on line 78 matches only the first occurrence of a duplicate address, leaving subsequent duplicates in `remainingUndistributed`. This could cause:

1. An account appearing twice in `newRewards` would have only its first occurrence matched and removed when processing old distributions; the second occurrence would remain and could receive a second allocation.
2. The total reward calculation would double-count the duplicate address.

While the output tests (`diffCalculatorOutput.test.ts` lines 71-89) verify no duplicates in the actual data files, the function itself does not enforce this invariant.

**Recommendation:** Either deduplicate (summing rewards) or reject duplicates with an explicit error in `readCsv` or at the start of `calculateDiff`.

---

### A03-9 -- CSV Injection via Address Field [INFO]

**Location:** Lines 138-161 in `main` (CSV output writing)

**Description:** Address values from input CSVs are written directly into output CSVs via template literals without sanitization. If an address field contained characters meaningful to spreadsheet applications (starting with `=`, `+`, `-`, `@`), the output CSV could trigger formula injection when opened in Excel or Google Sheets.

In practice, Ethereum addresses always start with `0x`, so this is extremely unlikely given on-chain-sourced data. This finding is subsumed by A03-5: if address format validation is implemented, CSV injection via the address field becomes impossible.

**Recommendation:** Implement A03-5 (address format validation), which eliminates this risk.

---

### A03-10 -- Header Row Content Not Validated in `readCsv` [INFO]

**Location:** Lines 12-16 in `readCsv`

**Description:** `readCsv` skips the first line as a header (iteration starts at `i = 1` on line 24) but never validates that the header actually contains the expected column names (`"recipient address,amount wei"`). If a CSV file has no header and starts directly with data, the first data row would be silently skipped. Conversely, if a file with a different schema is provided, parsing would proceed with incorrect column semantics.

**Recommendation:** Validate that `lines[0]` matches the expected header format before parsing data rows.

---

## Summary

| ID | Severity | Title |
|----|----------|-------|
| A03-1 | HIGH | Out-of-bounds access on `oldRewards` when `distributedCount > oldRewards.length` |
| A03-2 | MEDIUM | Greedy allocation algorithm is order-dependent and non-deterministic |
| A03-3 | MEDIUM | `remainingRewards` can go negative without detection |
| A03-4 | MEDIUM | No validation that reward strings are valid non-negative decimal integers |
| A03-5 | LOW | No address format validation |
| A03-6 | LOW | `main()` executes unconditionally on module import |
| A03-7 | LOW | Hardcoded file paths and block range identifiers |
| A03-8 | LOW | Duplicate addresses in input CSV silently accepted |
| A03-9 | INFO | CSV injection via address field (theoretical) |
| A03-10 | INFO | Header row content not validated |

**Total findings:** 10 (1 HIGH, 3 MEDIUM, 4 LOW, 2 INFO)
