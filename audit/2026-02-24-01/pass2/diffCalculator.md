# Pass 2: Test Coverage Audit for diffCalculator.ts

**Auditor:** A03
**Date:** 2026-02-24
**Files reviewed:**
- `/Users/thedavidmeister/Code/cyclo.rewards/src/diffCalculator.ts` (182 lines)
- `/Users/thedavidmeister/Code/cyclo.rewards/src/diffCalculator.test.ts` (441 lines)
- `/Users/thedavidmeister/Code/cyclo.rewards/src/diffCalculatorOutput.test.ts` (221 lines)

---

## 1. Evidence of Thorough Reading

### diffCalculator.ts (source)
- **Exports:** `DISTRIBUTED_COUNT` (constant, value 100), `readCsv` (function), `RewardEntry` (type), `DiffEntry` (type), `DiffResult` (interface), `calculateDiff` (function).
- **Non-exported:** `main()` function (lines 134-178), invoked unconditionally at line 181.
- `readCsv` (lines 10-44): Reads file with `readFileSync`, splits on `\n`, filters empty strings, validates header presence, validates column count (exactly 2), validates non-empty address and reward, lowercases addresses, parses reward as `BigInt`.
- `calculateDiff` (lines 61-132): Takes newRewards, oldRewards, distributedCount, rewardPool. Validates distributedCount <= oldRewards.length. Clones newRewards via `structuredClone`. Iterates first `distributedCount` of oldRewards, finds matching address in remaining (case-insensitive via `.toLowerCase()`), computes diff, tracks underpaid (diff > 0). Removes matched entries from remaining. Then iterates remaining, greedily classifying each as covered (fits in budget) or uncovered (does not fit). Throws if totalAlreadyPaid > rewardPool.
- `main()` (lines 134-178): Reads two specific CSV files, calls `calculateDiff` with `DISTRIBUTED_COUNT` and `DEC25_REWARD_POOL`, writes three output CSVs (remainingCovered, remainingUncovered, diff), logs summary to console.

### diffCalculator.test.ts (test 1)
- Uses `vi.hoisted` to create 200 fake CSV rows with addresses `0x000...000` through `0x000...0c7` and rewards 1-200.
- Mocks `fs.readFileSync` and `fs.writeFileSync`.
- **readCsv tests (lines 34-148):** empty file, header-only, fewer than 2 columns, more than 2 columns, empty address, empty reward, lowercase addresses, valid CSV parse, non-numeric reward, floating point reward, negative reward, zero reward, duplicate addresses.
- **calculateDiff tests (lines 150-384):** covered/uncovered split, underpaid detection, no flag for equal/overpaid, removal of distributed from remaining, old not in new, zero distributed count, exact budget, empty new rewards, non-mutation of inputs, algebraic invariant (covered + uncovered = remaining), algebraic invariant (totalNewDistribution + remainingRewardsDiff = remainingRewards), greedy ordering, distributedCount exceeds oldRewards error, totalAlreadyPaid exceeds rewardPool error.
- **main() CSV output tests (lines 387-441):** Checks three files written, correct headers and line counts, correct address formats, non-distributed addresses only in covered.

### diffCalculatorOutput.test.ts (test 2)
- Integration test against actual output files on disk.
- `parseCsv` and `parseDiffCsv` helper functions (local, not using the source `readCsv`).
- **diffCalculator output tests (lines 24-176):** covered+uncovered = remaining addresses, covered+uncovered = remaining rewards, no negatives in new rewards, total <= DEC25_REWARD_POOL, all positive, no duplicates in new/old/covered/uncovered, underpaid in both old and new, diff old/new match actual, no duplicates in diff, underpaid not in covered/uncovered, diff arithmetic correct, covered total <= remaining pool, old+covered <= pool, all covered/uncovered positive, old has >= DISTRIBUTED_COUNT, all old distributed positive, no overlap covered/uncovered.
- **On-chain distribution verification (lines 178-207):** on-chain count = DISTRIBUTED_COUNT, addresses match, amounts match, no overlap with covered.
- **Blocklist integrity (lines 209-220):** no duplicate cheaters.

---

## 2. Exported Symbol Coverage Matrix

| Symbol | Type | Test 1 | Test 2 | Coverage |
|---|---|---|---|---|
| `DISTRIBUTED_COUNT` | const | Used in main() tests | Used as parameter | Covered |
| `readCsv` | function | 12 test cases | Not used (has local `parseCsv`) | Good |
| `RewardEntry` | type | Used in test helpers | N/A (TS type) | Covered |
| `DiffEntry` | type | Referenced implicitly | N/A (TS type) | Covered |
| `DiffResult` | interface | All fields asserted | N/A | Covered |
| `calculateDiff` | function | 14 test cases | Implicitly via output files | Good |
| `main` (not exported) | function | Side effects tested via mock | Integration tests on output | Partial |

---

## 3. Coverage Gap Findings

### A03-1: readCsv does not handle CRLF line endings

**Severity:** Medium
**Location:** `diffCalculator.ts` line 12 (`data.split("\n")`)
**Detail:** `readCsv` splits on `\n` only. If a CSV file has Windows-style `\r\n` line endings, the `\r` will be left attached to the reward value on each line. While `.trim()` is applied to each column value after splitting on `,` (line 25), the initial `filter(Boolean)` and line splitting would still work. However, the `.trim()` on line 25 does save this -- after `split(",")` and `.map(v => v.trim())`, the `\r` would be stripped from the reward value.

**Test gap:** Despite the code being incidentally resilient to CRLF (because of `.trim()` on column values), there is no test verifying this behavior. A CRLF test would document this implicit contract.

**Recommendation:** Add a test with `\r\n` line endings to confirm correct parsing.

### A03-2: readCsv whitespace handling in addresses not tested

**Severity:** Low
**Location:** `diffCalculator.ts` lines 25, 32
**Detail:** The code does `values[0]` after `split(",").map(v => v.trim())`, so leading/trailing whitespace in addresses is stripped. However, there is no test that verifies this behavior. An address like `" 0xabc123 "` should be trimmed to `"0xabc123"`.

**Recommendation:** Add a test with whitespace-padded addresses and rewards to verify trimming.

### A03-3: readCsv with very large BigInt values not tested

**Severity:** Low
**Location:** `diffCalculator.ts` line 40
**Detail:** Real reward values are 18-decimal fixed-point numbers (e.g., `1000000000000000000000000` for 1M tokens). The test suite uses small values (1-200 in the mock, small values in unit tests). There is no test that `BigInt()` correctly parses very large values representative of actual production data (e.g., values near `DEC25_REWARD_POOL = 1_000_000_000_000_000_000_000_000n`).

**Recommendation:** Add a test with production-scale BigInt values to ensure no parsing issues.

### A03-4: calculateDiff with zero-reward entries not tested

**Severity:** Medium
**Location:** `diffCalculator.ts` lines 61-132
**Detail:** `readCsv` has a test for zero reward values (line 130-136 in test), confirming they parse. However, `calculateDiff` is never tested with entries that have `reward: 0n`. A zero-reward entry in `newRewards` would be classified as covered (since `remainingRewardsDiff - 0n >= 0n`), consuming no budget. A zero-reward entry in `oldRewards` among the distributed would contribute 0 to `totalAlreadyPaid`. Neither scenario is tested.

Additionally, zero-reward entries are arguably semantic anomalies (why distribute 0?), yet the code silently accepts them. The output integration tests check `all covered rewards are positive` and `all uncovered rewards are positive`, but that is against actual data, not a unit test of the logic.

**Recommendation:** Add unit tests for `calculateDiff` with zero-reward entries in both newRewards and oldRewards positions.

### A03-5: Case-insensitivity in address matching relies on double-lowercasing

**Severity:** Low
**Location:** `diffCalculator.ts` line 81
**Detail:** In `calculateDiff`, the address match uses `.toLowerCase()` on both sides: `v.address.toLowerCase() === oldItem.address.toLowerCase()`. Since `readCsv` already lowercases addresses (line 40), this is redundant when data comes through `readCsv`. However, `calculateDiff` is a public function that accepts arbitrary `RewardEntry[]` arrays. The double-lowercasing is a defensive measure.

**Test gap:** No test verifies that `calculateDiff` correctly matches mixed-case addresses that were NOT pre-processed by `readCsv`. For example, passing `entry('0xABC', 10n)` in newRewards and `entry('0xabc', 10n)` in oldRewards.

**Recommendation:** Add a test where `calculateDiff` receives mixed-case addresses to verify case-insensitive matching works independently of `readCsv`.

### A03-6: Duplicate addresses in calculateDiff inputs not tested

**Severity:** Medium
**Location:** `diffCalculator.ts` lines 77-96
**Detail:** `readCsv` is tested for duplicate addresses and returns them as separate entries (test line 138-147). However, `calculateDiff` is never tested with duplicate addresses in either `newRewards` or `oldRewards`.

If `newRewards` contains two entries for the same address, `findIndex` (line 81) will match the first occurrence and splice it out. The second occurrence would remain in `remainingUndistributed` and could appear in covered/uncovered. This could lead to double-counting rewards for the same address.

If `oldRewards` contains duplicates within the first `distributedCount`, each duplicate would be matched against `remainingUndistributed` separately, potentially removing multiple entries.

**Recommendation:** Add tests with duplicate addresses in both newRewards and oldRewards to document the current behavior. Consider whether duplicates should be treated as an error condition.

### A03-7: main() is not independently testable; side-effect testing is indirect

**Severity:** Low
**Location:** `diffCalculator.ts` lines 134-181
**Detail:** `main()` is not exported and is invoked unconditionally at module load (line 181). The test file tests its side effects by importing the module with mocked `fs` functions. This approach works but has limitations:
- `main()` cannot be tested with different inputs without re-mocking and re-importing the module.
- The `console.log` output (lines 171-177) is not captured or asserted.
- Error paths in `main()` (e.g., file not found, `calculateDiff` throwing) are not tested.

The integration test file (`diffCalculatorOutput.test.ts`) partially compensates by testing actual output files, but that depends on the full pipeline having been run.

**Recommendation:** Consider exporting `main()` or refactoring to allow direct testing with controlled inputs. Add tests for console output assertions.

### A03-8: Underpaid scenario not tested in CSV output integration tests

**Severity:** Medium
**Location:** `diffCalculator.test.ts` lines 387-441 and `diffCalculatorOutput.test.ts` lines 127-132
**Detail:** In `diffCalculator.test.ts`, the `main() CSV output` describe block uses identical old and new rewards (same mock for both `readFileSync` calls), so `underpaid` is always empty and the diff CSV always has header-only. The test at line 420-427 verifies this header-only state but never exercises the path where underpaid entries actually appear in the diff CSV output.

In `diffCalculatorOutput.test.ts`, the diff entries are tested for arithmetic correctness (line 127-132), but this is against real data which happens to have underpaid entries. There is no controlled unit test that:
1. Creates a scenario where old rewards are lower than new rewards for distributed accounts.
2. Verifies the diff CSV output contains the correct `address,old,new,diff` format.

**Recommendation:** Add a unit test in `diffCalculator.test.ts` that mocks different old/new reward CSVs to exercise the underpaid CSV output path, verifying the 4-column format.

### A03-9: readCsv single data row (header + 1 row) not explicitly tested as success case

**Severity:** Low
**Location:** `diffCalculator.ts` lines 14-20
**Detail:** The tests cover empty file (0 lines) and header-only (1 line after filter) as error cases. The smallest successful case tested has 2 data rows (line 97-106). While a single data row would logically work (the loop on line 24 would execute once for i=1), there is no explicit test for `header + single_data_row` as a success case.

**Recommendation:** Add a test with exactly one data row to confirm minimal valid input.

### A03-10: Greedy allocation order sensitivity not highlighted as a design concern

**Severity:** Informational
**Location:** `diffCalculator.ts` lines 108-119
**Detail:** The covered/uncovered classification is greedy and order-dependent. The test at line 352-364 ("greedy ordering") demonstrates this: a large entry first can exhaust budget, leaving small entries uncovered even if they could have fit in an optimal allocation. This is tested but worth noting: the ordering of `newRewards` directly determines which accounts get classified as covered vs. uncovered. The `remainingUndistributed` array preserves the order of `newRewards` (minus spliced distributed entries). This is a design choice, not a bug, but the test coverage correctly documents it.

No action needed; included for completeness.

### A03-11: No test for negative reward values flowing through calculateDiff

**Severity:** Low
**Location:** `diffCalculator.ts` lines 61-132
**Detail:** `readCsv` is tested to accept negative reward values (test line 122-128). However, no `calculateDiff` test exercises negative rewards. A negative reward in `oldRewards` would make `totalAlreadyPaid` decrease, potentially making `remainingRewards` exceed `rewardPool`. A negative reward in `newRewards` would subtract from the budget consumption (the entry would be "covered" since `remainingRewardsDiff - (-X)` is always >= 0). These edge cases could produce unexpected results.

**Recommendation:** Add tests or validation for negative reward values in `calculateDiff`.

---

## 4. Summary

| ID | Finding | Severity |
|---|---|---|
| A03-1 | No CRLF line ending test for readCsv | Medium |
| A03-2 | No whitespace-in-address test for readCsv | Low |
| A03-3 | No large BigInt value test for readCsv | Low |
| A03-4 | No zero-reward entry test for calculateDiff | Medium |
| A03-5 | No mixed-case address test for calculateDiff (independent of readCsv) | Low |
| A03-6 | No duplicate address test for calculateDiff inputs | Medium |
| A03-7 | main() not independently testable; console output not asserted | Low |
| A03-8 | Underpaid scenario not tested in CSV output (mock-based tests) | Medium |
| A03-9 | No single-data-row success case test for readCsv | Low |
| A03-10 | Greedy allocation order sensitivity documented in tests (informational) | Informational |
| A03-11 | No negative reward test for calculateDiff | Low |

**Overall assessment:** The test suite provides solid coverage of the core paths in both `readCsv` and `calculateDiff`, including error conditions, algebraic invariants, and non-mutation guarantees. The integration tests in `diffCalculatorOutput.test.ts` add a valuable layer of real-data verification. The main gaps are around edge-case inputs (CRLF, zero rewards, duplicates, negatives) flowing through `calculateDiff`, and the inability to test `main()` with varied controlled inputs due to its non-exported, auto-invoked design.
