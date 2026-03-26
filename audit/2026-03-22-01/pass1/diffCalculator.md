# Pass 1 (Security) -- diffCalculator.ts

**Auditor:** A03
**Date:** 2026-03-22
**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/diffCalculator.ts`
**Lines:** 182

---

## 1. Evidence of Thorough Reading

### Imports (lines 1-2)
- `readFileSync`, `writeFileSync` from `"fs"`
- `DEC25_REWARD_POOL`, `REWARDS_CSV_COLUMN_HEADER_ADDRESS`, `REWARDS_CSV_COLUMN_HEADER_REWARD`, `DIFF_CSV_COLUMN_HEADER_OLD`, `DIFF_CSV_COLUMN_HEADER_NEW`, `DIFF_CSV_COLUMN_HEADER_DIFF` from `"./constants"`

### Exported Constants
- `DISTRIBUTED_COUNT = 100 as const` (line 4)

### Exported Types
- `RewardEntry` -- type alias `{address: string; reward: bigint}` (line 46)
- `DiffEntry` -- type alias `{address: string; old: bigint; new: bigint; diff: bigint}` (line 47)
- `DiffResult` -- interface with fields: `covered`, `uncovered`, `underpaid`, `totalAlreadyPaid`, `remainingRewards`, `totalNewDistribution`, `remainingRewardsDiff`, `totalRemainingUncovered`, `totalUnderpaid` (lines 49-59)

### Exported Functions
- `readCsv(filePath: string): Array<{address: string; reward: bigint}>` (line 10)
- `calculateDiff(newRewards: RewardEntry[], oldRewards: RewardEntry[], distributedCount: number, rewardPool: bigint): DiffResult` (line 61)

### Non-exported Functions
- `main()` (line 134)

### Top-Level Side Effect
- `main()` called unconditionally at module level (line 181)

---

## 2. Findings

### A03-1: Duplicate Addresses in `newRewards` Cause Silent Double-Counting in `calculateDiff`

**Severity:** MEDIUM
**Prior ID:** A03-4 (2026-02-24-01), status PENDING -- carried forward, still present

**Location:** Lines 61-131 (`calculateDiff`), specifically lines 77-96 and 108-119

**Description:** Neither `calculateDiff` nor `readCsv` deduplicates addresses. If `newRewards` contains duplicate addresses, `findIndex` (line 81) only removes the first occurrence via `splice` (line 94). The second occurrence remains in `remainingUndistributed` and is processed in the covered/uncovered loop (lines 108-119), consuming budget independently. The same address could appear multiple times in output CSVs, and if those CSVs are fed into an on-chain distribution tool, the address receives rewards multiple times.

The test `readCsv` explicitly confirms duplicates are returned as separate entries (test file line 138). The output test `diffCalculatorOutput.test.ts` checks for no duplicates in actual CSV files (lines 71-89), but the `calculateDiff` function itself does not enforce this invariant programmatically.

**Recommendation:** Add an explicit duplicate-address check at the start of `calculateDiff` for both `newRewards` and `oldRewards`, throwing an error if duplicates are found. Alternatively, deduplicate by summing rewards for the same address.

---

### A03-2: `main()` Executes on Module Import -- No Guard Against Accidental Execution

**Severity:** MEDIUM
**Prior ID:** A03-6 (2026-02-24-01), status PENDING -- carried forward, still present

**Location:** Lines 180-181

**Description:** `main()` is invoked unconditionally at module scope. Any module that imports from `diffCalculator.ts` (e.g., for `readCsv` or `calculateDiff`) triggers file I/O: reading two CSV files and writing three output files. The test suite works around this by mocking `fs` before import (`vi.hoisted` + `vi.mock` pattern), but this is fragile. A future import for reuse would unexpectedly execute the full Dec 2025 reconciliation pipeline and potentially overwrite output CSVs.

**Recommendation:** Guard the execution behind `if (import.meta.url === ...)` or `if (process.argv[1] === ...)`, or extract `main()` into a separate entry-point script that imports from `diffCalculator.ts`.

---

### A03-3: No Address Format Validation in `readCsv`

**Severity:** LOW
**Prior ID:** A03-2 (2026-02-24-01), status PENDING -- carried forward, still present

**Location:** Lines 32-35

**Description:** `readCsv` checks that the address field is non-empty but does not validate it as a well-formed Ethereum address (0x-prefixed, 40 hex chars). The `VALID_ADDRESS_REGEX` is already exported from `constants.ts` (line 22 of constants.ts) and a `validateAddress` helper exists (line 25 of constants.ts), but neither is used in `readCsv`. A malformed address (partial hex, wrong length, missing prefix) would be silently accepted and propagated to output CSVs destined for on-chain distribution.

**Recommendation:** Call `validateAddress(address, `CSV line ${i+1} address`)` on each parsed address, or apply `VALID_ADDRESS_REGEX` directly.

---

### A03-4: `readCsv` Does Not Validate the CSV Header Row

**Severity:** LOW
**Prior ID:** A03-3 (2026-02-24-01), status PENDING -- carried forward, still present

**Location:** Lines 14-24

**Description:** The first line is unconditionally skipped as a header (loop starts at `i = 1`), but its content is never validated. If the file has a different column order (e.g., `amount wei,recipient address`) or a missing header, the parser silently misinterprets data or skips a valid data row. The expected header constants are already imported from `constants.ts`.

**Recommendation:** Validate that `lines[0]` matches `"recipient address,amount wei"` and throw an informative error if it does not.

---

### A03-5: Hardcoded File Paths and `DISTRIBUTED_COUNT` Reduce Auditability and Safety

**Severity:** LOW
**Prior ID:** A03-7 (2026-02-24-01), status PENDING -- carried forward, still present

**Location:** Lines 4, 136-137, 148, 157, 166

**Description:** `main()` hardcodes input file paths (`./output/rewards-51504517-52994045.csv`, `./output/rewards-51504517-52994045-old.csv`), output file paths (three CSVs), and `DISTRIBUTED_COUNT = 100`. These are specific to the Dec 2025 epoch. The `100` has no documentation of its provenance (e.g., which on-chain transaction distributed exactly 100 accounts). Future epoch reuse requires modifying the source.

**Recommendation:** Add a comment explaining why `DISTRIBUTED_COUNT = 100`. Consider parameterizing file paths via CLI args or environment variables.

---

### A03-6: Negative Reward Values Accepted Without Validation

**Severity:** LOW
**Prior ID:** A03-8 (2026-02-24-01), status PENDING -- carried forward, still present

**Location:** Line 40 (`readCsv`)

**Description:** `BigInt(rewardStr)` successfully parses negative numbers. A negative reward in input would cause `calculateDiff` to behave unexpectedly: in the covered/uncovered loop, a negative reward increases `remainingRewardsDiff` (line 117), expanding the budget. In old rewards, a negative value decreases `totalAlreadyPaid`, also expanding apparent remaining budget. The test at line 122 of `diffCalculator.test.ts` explicitly confirms negative values are accepted.

The output test `diffCalculatorOutput.test.ts` checks actual CSVs have no negative values (lines 54-57, 66-69), but the functions themselves accept them without complaint.

**Recommendation:** Add `if (BigInt(rewardStr) < 0n) throw new Error(...)` in `readCsv`, or validate at the start of `calculateDiff`.

---

### A03-7: No Validation That `distributedCount` Is a Non-Negative Integer

**Severity:** LOW
**Prior ID:** A03-10 (2026-02-24-01), status PENDING -- carried forward, still present

**Location:** Lines 61-69

**Description:** `distributedCount` is typed as `number`, which allows floats, `NaN`, `Infinity`, or negative values. The existing check `distributedCount > oldRewards.length` (line 67) does not catch:
- Negative values: `0 < negative` is false, loop is skipped (treated as 0)
- Non-integer floats: `1.5` causes the loop to run once (`i < 1.5`), silently truncating
- `NaN`: comparison `NaN > length` is false, loop `i < NaN` is false, both silently skip

Currently only called with the constant `100`, so not exploitable in practice.

**Recommendation:** Add `if (!Number.isInteger(distributedCount) || distributedCount < 0) throw new Error(...)` at the start of `calculateDiff`.

---

### A03-8: `structuredClone` on BigInt Array Elements (Positive Pattern)

**Severity:** INFO

**Location:** Line 71

**Description:** `structuredClone` correctly deep-clones the `newRewards` array to avoid mutating the caller's data. `structuredClone` supports `BigInt`. The test at line 294 of the test file confirms inputs are not mutated. This is a positive defensive pattern.

No action needed.

---

### A03-9: Overpaid Accounts Silently Ignored (No Clawback Tracking)

**Severity:** INFO

**Location:** Lines 84-93

**Description:** When an already-distributed account's new reward is less than or equal to what was paid (`diff <= 0`), the account is removed from `remainingUndistributed` with no record of the overpayment. The overpayment permanently reduces the effective pool for other accounts. This is likely by design (no clawback mechanism), but reduces reconciliation transparency.

No action needed for security. Could improve auditability by tracking `totalOverpaid`.

---

### A03-10: Potential Misleading Log Output for Negative "EXTRA Needed"

**Severity:** INFO

**Location:** Line 177

**Description:** The expression `result.totalUnderpaid + result.totalRemainingUncovered - result.remainingRewardsDiff` can produce a negative BigInt when the pool has surplus. The log message "Total EXTRA needed to complete all payments:" would print a negative number, which is misleading. This value is only logged, not used in output files.

No action needed for security.

---

### A03-11: Path Traversal in `readCsv` Limited by Usage Context

**Severity:** INFO

**Location:** Line 11

**Description:** `readCsv` passes an arbitrary `filePath` directly to `readFileSync`. Since it is only called from `main()` with hardcoded paths and from tests with mocked `fs`, there is no practical path traversal risk. Noted for completeness.

No action needed.

---

## 3. Summary

| ID | Severity | Title | Prior ID |
|----|----------|-------|----------|
| A03-1 | MEDIUM | Duplicate addresses in newRewards cause silent double-counting | A03-4 (2026-02-24) |
| A03-2 | MEDIUM | main() executes on module import with no guard | A03-6 (2026-02-24) |
| A03-3 | LOW | No address format validation in readCsv | A03-2 (2026-02-24) |
| A03-4 | LOW | readCsv does not validate CSV header row | A03-3 (2026-02-24) |
| A03-5 | LOW | Hardcoded file paths and DISTRIBUTED_COUNT | A03-7 (2026-02-24) |
| A03-6 | LOW | Negative reward values accepted without validation | A03-8 (2026-02-24) |
| A03-7 | LOW | No validation that distributedCount is a non-negative integer | A03-10 (2026-02-24) |
| A03-8 | INFO | structuredClone on BigInt array elements (positive pattern) | -- |
| A03-9 | INFO | Overpaid accounts silently ignored with no clawback tracking | -- |
| A03-10 | INFO | Potential misleading log output for negative "EXTRA needed" | -- |
| A03-11 | INFO | Path traversal in readCsv limited by usage context | -- |

**CRITICAL:** 0
**HIGH:** 0
**MEDIUM:** 2 (A03-1, A03-2)
**LOW:** 5 (A03-3, A03-4, A03-5, A03-6, A03-7)
**INFO:** 4 (A03-8, A03-9, A03-10, A03-11)

All 7 PENDING findings from the 2026-02-24-01 audit (A03-4, A03-6, A03-2, A03-3, A03-7, A03-8, A03-10) were re-verified against the current code. All remain present and are carried forward above.
