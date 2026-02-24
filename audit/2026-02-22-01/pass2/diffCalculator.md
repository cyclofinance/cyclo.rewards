# Test Coverage Audit: diffCalculator.ts

**Auditor Agent:** A03
**Date:** 2026-02-22
**Pass:** 2
**Files Under Review:**
- `/Users/thedavidmeister/Code/cyclo.rewards/src/diffCalculator.ts`
- `/Users/thedavidmeister/Code/cyclo.rewards/src/diffCalculator.test.ts`
- `/Users/thedavidmeister/Code/cyclo.rewards/src/diffCalculatorOutput.test.ts`

---

## 1. Source File Inventory: `diffCalculator.ts`

### Constants
| Name | Line | Value |
|------|------|-------|
| `DISTRIBUTED_COUNT` | 4 | `101` |

### Imports
| Import | Source | Line |
|--------|--------|------|
| `readFileSync`, `writeFileSync` | `fs` | 1 |
| `REWARD_POOL` | `./constants` | 2 |

### Exported Functions
| Function | Lines | Parameters | Return Type |
|----------|-------|------------|-------------|
| `readCsv` | 10-44 | `filePath: string` | `Array<{address: string; reward: bigint}>` |

### Non-exported Functions
| Function | Lines | Parameters | Return Type |
|----------|-------|------------|-------------|
| `main` | 46-136 | none | `void` (implicit) |

### Error Paths in `readCsv` (lines 10-44)
1. **Line 15:** Empty file -- `CSV file is empty: ${filePath}`
2. **Line 19:** Header-only file -- `CSV file has no data rows (only header): ${filePath}`
3. **Line 27:** Fewer than 2 columns -- `CSV line ${i + 1} has fewer than 2 columns in ${filePath}: "${lines[i]}"`
4. **Line 30:** More than 2 columns -- `CSV line ${i + 1} has more than 2 columns in ${filePath}: "${lines[i]}"`
5. **Line 34:** Empty address -- `CSV line ${i + 1} has empty address in ${filePath}: "${lines[i]}"`
6. **Line 38:** Empty reward -- `CSV line ${i + 1} has empty reward in ${filePath}: "${lines[i]}"`
7. **Implicit (line 40):** `BigInt(rewardStr)` will throw if the reward string is not a valid integer (e.g., `"abc"`, `"1.5"`)

### Logic in `main` (lines 46-136)
1. **Lines 48-49:** Reads two specific CSV files (new and old rewards)
2. **Lines 52-53:** Clones `newRewards` into `remainingUndistributed`; initializes `totalAlreadyPaid`
3. **Lines 58-77:** Loop over first `DISTRIBUTED_COUNT` (101) entries of `oldRewards`:
   - Accumulates `totalAlreadyPaid`
   - Finds matching address in `remainingUndistributed` (case-insensitive compare)
   - If found and diff > 0, tracks in `oldAccountsThatReceivedLess`
   - Removes matched entry from `remainingUndistributed` via `splice`
4. **Lines 80-97:** Loop over `remainingUndistributed`:
   - Calculates `remainingRewards = REWARD_POOL - totalAlreadyPaid`
   - Splits accounts into `remainingCovers` (can be paid) and `remainingNotCovers` (cannot be paid)
   - Uses a running `remainingRewardsDiff` to check if remaining funds cover each account
5. **Lines 99-126:** Writes three output CSV files with hardcoded paths
6. **Lines 128-136:** Logs summary totals to console

### File-Level Side Effect
- **Line 139:** `main()` is called at module scope, meaning the `main` function executes on import

---

## 2. Test File Inventory: `diffCalculator.test.ts`

### Test Setup (lines 2-21)
- Uses `vi.hoisted` to create `fakeCsv` with 200 fake rows, `mockReadFileSync`, `mockWriteFileSync`
- Mocks `fs` module to intercept `readFileSync` and `writeFileSync`
- Imports only `readCsv` from `diffCalculator`

### Tests in `describe('readCsv')` (lines 25-98)
| Test | Line | What It Covers |
|------|------|----------------|
| `should throw on empty file` | 30-35 | Error path: line 15 |
| `should throw on header-only file` | 37-42 | Error path: line 19 |
| `should throw on line with fewer than 2 columns` | 44-51 | Error path: line 27 |
| `should throw on line with more than 2 columns` | 53-59 | Error path: line 30 |
| `should throw on empty address` | 62-68 | Error path: line 34 |
| `should throw on empty reward` | 70-77 | Error path: line 38 |
| `should lowercase addresses` | 80-86 | Line 40 lowercase behavior |
| `should parse valid CSV` | 88-97 | Happy path with 2 rows |

---

## 3. Test File Inventory: `diffCalculatorOutput.test.ts`

### Setup (lines 1-13)
- Defines local `DISTRIBUTED_COUNT = 101`
- Defines local `parseCsv` helper (reads real files from disk)
- Reads 4 real CSV files from `./output/`

### Tests in `describe('diffCalculator output')` (lines 15-51)
| Test | Line | What It Covers |
|------|------|----------------|
| `covered + uncovered addresses = remaining undistributed addresses` | 26-33 | Address set correctness of output |
| `covered + uncovered rewards = remaining undistributed rewards` | 35-41 | Reward total correctness of output |
| `covered and uncovered have no overlapping addresses` | 44-50 | No duplicates between covered/uncovered |

These are integration/output-validation tests that verify properties of the generated CSV files. They do not exercise the `main()` function directly in a controlled way; they validate pre-existing output files on disk.

---

## 4. Coverage Gap Analysis

### A03-01 -- CRITICAL: `main()` function has zero unit test coverage

**Severity:** CRITICAL
**Location:** `diffCalculator.ts` lines 46-136

The `main()` function contains the entire business logic for the diff calculation: matching old/new rewards, computing diffs for underpaid accounts, splitting remaining accounts into covered/uncovered, calculating remaining reward budget, and writing three output CSV files. None of this logic is unit-tested.

The `diffCalculatorOutput.test.ts` file validates properties of the output files but:
- Depends on pre-existing output files (not generated during the test)
- Does not control inputs, so it cannot test edge cases
- Does not verify the diff CSV (`rewards-...-diff.csv`) content at all
- Does not test the covered/uncovered classification algorithm

For a financial calculation system, the core distribution logic having zero isolated unit test coverage is a critical gap.

### A03-02 -- CRITICAL: `main()` executes on module import (side effect at line 139)

**Severity:** CRITICAL
**Location:** `diffCalculator.ts` line 139

`main()` is invoked at the top level of the module. This means any test file that imports anything from `diffCalculator.ts` will trigger `main()`, which reads hardcoded file paths and writes output files. The existing `diffCalculator.test.ts` works around this by mocking `fs` before import (using `vi.hoisted`), but:
- The mock must return data with at least 101 rows for `main()` not to crash on the `oldRewards[i]` access in the loop (the mock returns 200 rows, which is sufficient but fragile)
- This architectural pattern makes it impossible to unit-test `main()` in isolation with different inputs
- The `main()` function cannot be imported and called with controlled parameters

### A03-03 -- HIGH: No test for the covered/uncovered splitting algorithm

**Severity:** HIGH
**Location:** `diffCalculator.ts` lines 80-97

The algorithm that decides whether remaining accounts are "covered" (can be paid from remaining funds) or "not covered" is order-dependent. It processes `remainingUndistributed` sequentially and subtracts from a running budget. This means:
- An account with a large reward early in the list could exhaust the budget, causing smaller accounts later to be classified as uncovered even though they could individually be paid
- The ordering of `remainingUndistributed` is determined by `newRewards` order minus spliced entries, which depends on the input CSV ordering

This greedy sequential algorithm has no test verifying its behavior under boundary conditions such as: budget exactly equals one account's reward, budget is zero, budget is negative, single remaining account, etc.

### A03-04 -- HIGH: No test for the diff calculation for underpaid accounts

**Severity:** HIGH
**Location:** `diffCalculator.ts` lines 58-77

The loop that identifies accounts who received less than they should have (`oldAccountsThatReceivedLess`) is untested. Specific untested scenarios:
- An old account that received MORE than the new calculation (diff <= 0) -- should not appear in the diff list
- An old account that received exactly the same amount (diff == 0) -- should not appear
- An old account whose address does not appear in the new rewards at all (index == -1)
- All 101 old accounts match vs. some missing

### A03-05 -- HIGH: No test for `DISTRIBUTED_COUNT` boundary behavior

**Severity:** HIGH
**Location:** `diffCalculator.ts` lines 4, 58

The constant `DISTRIBUTED_COUNT = 101` is used to slice the first 101 entries of `oldRewards`. There is no test for:
- What happens if `oldRewards` has fewer than 101 entries (will crash with undefined access at line 59-60)
- What happens if `oldRewards` has exactly 101 entries
- The value 101 is duplicated in `diffCalculatorOutput.test.ts` (line 4) as a local constant rather than imported, creating a maintenance risk

### A03-06 -- HIGH: No test for CSV file write correctness

**Severity:** HIGH
**Location:** `diffCalculator.ts` lines 99-126

Three CSV files are written by `main()`:
1. `rewards-...-remainingCovered.csv` (lines 101-108)
2. `rewards-...-remainingUncovered.csv` (lines 110-117)
3. `rewards-...-diff.csv` (lines 119-126)

No unit test verifies:
- The correct CSV headers are written
- The diff CSV has 4 columns (address, old, new, diff) with correct values
- File paths are correct
- `writeFileSync` is called with expected content

The `diffCalculatorOutput.test.ts` reads the output files but never validates the diff CSV at all.

### A03-07 -- MEDIUM: No test for `readCsv` with non-numeric reward value

**Severity:** MEDIUM
**Location:** `diffCalculator.ts` line 40

`BigInt(rewardStr)` will throw a `SyntaxError` if the reward string is not a valid integer (e.g., `"abc"`, `"1.5"`, `"1e18"`). There is no test verifying this implicit error path. While this is a JavaScript runtime error rather than an application-defined error, for a financial system it would be valuable to either:
- Add an explicit validation with a clear error message, or
- Test the current behavior to document it

### A03-08 -- MEDIUM: No test for `readCsv` with negative or zero reward values

**Severity:** MEDIUM
**Location:** `diffCalculator.ts` line 40

`BigInt()` will happily parse negative numbers (e.g., `"-1000"`) and zero (`"0"`). For a reward distribution system, negative rewards or zero rewards may indicate data corruption. There are no tests or validations for these edge cases.

### A03-09 -- MEDIUM: No test for duplicate addresses in CSV input

**Severity:** MEDIUM
**Location:** `diffCalculator.ts` lines 10-44

`readCsv` does not check for duplicate addresses. If the same address appears multiple times, `main()` will use `findIndex` which returns only the first match. This could lead to incorrect reward calculations. There is no test documenting or preventing this behavior.

### A03-10 -- MEDIUM: `diffCalculatorOutput.test.ts` does not validate the diff CSV

**Severity:** MEDIUM
**Location:** `diffCalculatorOutput.test.ts`

The output test validates covered + uncovered = remaining, but never reads or validates `rewards-...-diff.csv`. There is no test that:
- The diff file contains the correct accounts
- The diff amounts are calculated correctly (new - old)
- The diff file accounts are a subset of the first 101 old accounts

### A03-11 -- MEDIUM: No test that `totalAlreadyPaid + remainingRewards == REWARD_POOL`

**Severity:** MEDIUM
**Location:** `diffCalculator.ts` line 80

The invariant `REWARD_POOL == totalAlreadyPaid + remainingRewards` is trivially true from the code (`remainingRewards = REWARD_POOL - totalAlreadyPaid`), but the downstream consequence -- that `totalNewDistribution + remainingRewardsDiff == remainingRewards` -- is not validated by any test. For a financial system, asserting these accounting invariants in tests is important.

### A03-12 -- LOW: Case-insensitive comparison is redundant

**Severity:** LOW
**Location:** `diffCalculator.ts` line 62

The address comparison `v.address.toLowerCase() === oldItem.address.toLowerCase()` applies `toLowerCase()` at comparison time, even though `readCsv` already lowercases addresses at parse time (line 40). This is not a bug (it's defensive), but there is no test that verifies this end-to-end: that addresses from different CSV files with different casings will still match correctly through the pipeline.

### A03-13 -- LOW: `main()` console output is not tested

**Severity:** LOW
**Location:** `diffCalculator.ts` lines 129-135

The summary output logged to console contains financial totals. No test verifies the correctness of these logged values. While console output is often not tested, these are the final reported numbers in a financial calculation.

### A03-14 -- INFO: `DISTRIBUTED_COUNT` constant is duplicated

**Severity:** INFO
**Location:** `diffCalculator.ts` line 4, `diffCalculatorOutput.test.ts` line 4

The value `101` is defined in both files independently. If the source value changes, the test file would need manual updating. Consider exporting the constant from the source file.

### A03-15 -- INFO: Hardcoded file paths in `main()`

**Severity:** INFO
**Location:** `diffCalculator.ts` lines 48-49, 105-107, 114-116, 123-125

All file paths in `main()` are hardcoded strings. This makes the function non-reusable and non-testable with different input/output files. The function would benefit from parameterization for testability.

---

## 5. Summary

| Severity | Count | IDs |
|----------|-------|-----|
| CRITICAL | 2 | A03-01, A03-02 |
| HIGH | 4 | A03-03, A03-04, A03-05, A03-06 |
| MEDIUM | 5 | A03-07, A03-08, A03-09, A03-10, A03-11 |
| LOW | 2 | A03-12, A03-13 |
| INFO | 2 | A03-14, A03-15 |

**Key Observation:** The `readCsv` function has excellent test coverage with all 6 explicit error paths tested plus happy path and lowercase behavior. However, the `main()` function -- which contains 100% of the financial business logic (diff calculation, budget allocation, covered/uncovered splitting, file output) -- has zero unit test coverage. The output integration test (`diffCalculatorOutput.test.ts`) provides some assurance but is not a substitute for controlled unit tests of the algorithm, as it depends on pre-existing files and does not test edge cases, error conditions, or the diff CSV output.

The top recommendation is to refactor `main()` into a testable pure function (separating I/O from logic) and remove the module-level side effect at line 139, then add comprehensive unit tests for all business logic branches.
