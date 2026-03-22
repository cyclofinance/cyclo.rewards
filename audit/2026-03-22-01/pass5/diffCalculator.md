# Pass 5: Correctness / Intent Verification — diffCalculator.ts

**Auditor:** A03
**Date:** 2026-03-22
**Files reviewed:**
- `/Users/thedavidmeister/Code/cyclo.rewards/src/diffCalculator.ts`
- `/Users/thedavidmeister/Code/cyclo.rewards/src/diffCalculator.test.ts`
- `/Users/thedavidmeister/Code/cyclo.rewards/src/diffCalculatorOutput.test.ts`
- `/Users/thedavidmeister/Code/cyclo.rewards/src/constants.ts`

## Evidence of Thorough Reading

1. **readCsv** (lines 10-44): Verified line-by-line parsing logic, header skip, column count validation, empty field checks, lowercase normalization, BigInt conversion.
2. **calculateDiff** (lines 61-132): Verified clone-then-splice pattern, underpaid detection logic, greedy budget allocation, all returned fields.
3. **main()** (lines 134-181): Verified hardcoded file paths, CSV writing with correct headers, console output.
4. **Unit tests** (diffCalculator.test.ts): Verified all 22 test cases including edge cases, invariant tests, mocking setup with `vi.hoisted`.
5. **Output integration tests** (diffCalculatorOutput.test.ts): Verified 21 integrity tests against real output files.
6. **Constants** (constants.ts): Verified `DEC25_REWARD_POOL`, CSV header constants, and their usage.

---

## Findings

### F-DC-P5-01: Greedy budget allocation is order-dependent and non-optimal (MEDIUM)

**Location:** `calculateDiff`, lines 108-119

The budget allocation loop processes `remainingUndistributed` in array order. It uses a greedy "first-fit" strategy: if an item fits in the remaining budget it is covered, otherwise it is uncovered. This means a large item early in the list can exhaust the budget, causing smaller items that would have fit to be classified as uncovered.

For example, if the remaining budget is 50n and the list is `[{reward: 45n}, {reward: 10n}]`, the 45n item is covered (leaving 5n), and the 10n item is uncovered. But if the order were reversed, both could potentially be covered if the budget were 55n, or the 10n item could be covered first leaving 40n < 45n.

The algorithm skips items that don't fit rather than trying to fit smaller subsequent items. Specifically, once an item fails the budget check (`diff < 0n`), all subsequent items are still evaluated independently, so it is not strictly "first that doesn't fit kills everything after." Each item is evaluated against the running budget. However, a large uncovered item does not consume budget, so smaller items after it can still be covered. This is actually correct greedy behavior -- re-reading line 111: `const diff = remainingRewardsDiff - item.reward; if (diff < 0n) { uncovered } else { covered; remainingRewardsDiff -= item.reward }`. So items are independently tested against the remaining budget. A large item that doesn't fit is skipped (uncovered), and the budget remains for subsequent smaller items.

**Correction:** After careful re-reading, the algorithm IS a greedy knapsack that skips items too large and continues trying smaller ones. This is reasonable behavior. The ordering still matters (the input order determines which items get priority when the budget is tight and multiple items compete for the last slot), but the algorithm does not fail catastrophically.

**Revised severity: LOW** — The order-dependence means the set of covered accounts depends on input ordering when budget is tight. The `newRewards` array order (from the processor's output) implicitly determines priority. This is acceptable if intentional but is not documented.

### F-DC-P5-02: `readCsv` does not validate the header row (MEDIUM)

**Location:** `readCsv`, lines 10-44

The function skips the first line (assumed header) but never validates that it matches the expected format (`"recipient address,amount wei"`). If a CSV file has a corrupted or missing header, the first data row would be silently skipped, and all subsequent rows would be parsed but offset by one. This could lead to silent data loss.

The `main()` function writes CSVs with the correct header (lines 142-168), and the tests use the correct header in mocks, but `readCsv` itself does not enforce this.

**Severity: MEDIUM** — Silent data loss if a non-header first row is present.

### F-DC-P5-03: `readCsv` accepts negative reward values without warning (LOW)

**Location:** `readCsv`, line 40

`BigInt(rewardStr)` accepts negative values. The test `'should accept negative reward values'` (test line 122-128) explicitly documents this behavior. However, negative rewards are semantically invalid for this use case — they would mean an account owes tokens. `calculateDiff` does not handle negative rewards specially, and the greedy budget allocation could behave unexpectedly (a negative reward would increase the remaining budget when "spent").

The output integration tests do verify `'all new rewards are positive'` and `'all covered rewards are positive'`, so negative values would be caught at the output level, but not at the parse level.

**Severity: LOW** — Defense-in-depth concern; caught by downstream tests but not at parse boundary.

### F-DC-P5-04: `main()` runs on module import as a side effect (MEDIUM)

**Location:** Lines 181

`main()` is called unconditionally at module scope. This means importing `diffCalculator.ts` for its exports (e.g., `readCsv`, `calculateDiff`, `DISTRIBUTED_COUNT`) always triggers the full pipeline including file I/O. The test file works around this by mocking `fs` before import, but this is fragile.

The unit test file (`diffCalculator.test.ts`) must use `vi.hoisted` + `vi.mock('fs')` specifically because of this side effect. If the mock setup were slightly wrong, tests would attempt real file reads and fail or produce wrong results.

**Severity: MEDIUM** — Fragile test setup; importing the module for its pure function exports triggers I/O side effects.

### F-DC-P5-05: `structuredClone` does not preserve BigInt in all environments (INFO)

**Location:** `calculateDiff`, line 71

`structuredClone(newRewards)` is used to clone the array. `structuredClone` does support BigInt values per the structured clone algorithm specification, and Node.js 17+ handles this correctly. Since this project uses nix and modern Node, this is not a real issue, but worth noting for portability awareness.

**Severity: INFO**

### F-DC-P5-06: `readCsv` does not validate address format (LOW)

**Location:** `readCsv`, lines 32-35

The function checks that the address field is non-empty but does not validate that it is a valid Ethereum address (e.g., using `VALID_ADDRESS_REGEX` from `constants.ts`). The `constants.ts` file exports `validateAddress()` specifically for this purpose, but `readCsv` does not use it. Malformed addresses would propagate through the diff calculator silently.

**Severity: LOW** — The processor that generates these CSVs validates addresses upstream, but `readCsv` as a standalone function lacks this check.

### F-DC-P5-07: Underpaid accounts are not included in the greedy budget allocation (HIGH)

**Location:** `calculateDiff`, lines 77-119

When an account is found in both `oldRewards` (distributed) and `newRewards`, and the new reward exceeds the old reward, the diff is recorded in `underpaid` but the underpaid amount is NOT deducted from the remaining budget. The `underpaid` list is computed (lines 85-93) and `totalUnderpaid` is accumulated, but `remainingRewardsDiff` (the budget for new distributions) does not account for the underpaid amounts that also need to be paid.

Looking at `main()` line 177: `console.log("Total EXTRA needed to complete all payments:", result.totalUnderpaid + result.totalRemainingUncovered - result.remainingRewardsDiff)` — this log line computes the shortfall manually, suggesting the caller knows underpaid amounts are not budgeted. The "covered" CSV therefore does not represent a self-consistent payment plan: paying both the covered accounts AND the underpaid diffs may exceed the remaining budget.

However, examining the actual use case: the `main()` function writes THREE separate CSVs — covered, uncovered, and diff. The underpaid amounts are meant to be a separate concern tracked in the diff CSV, and the operator must decide how to handle them. The budget allocation for "covered" only covers accounts that were NOT previously distributed at all. The underpaid amounts are informational.

**Revised assessment:** This is by design — underpaid is a separate output, and the log line on 177 explicitly computes the total extra needed. The covered/uncovered split only addresses accounts that received nothing in the first distribution round.

**Revised severity: LOW** — The function's return value does not provide a single "total needed" figure. The caller must manually combine `totalUnderpaid` + `totalNewDistribution` to get the true total outlay. This is computed in the log (line 177) but not returned as a field, which could lead to misuse.

### F-DC-P5-08: `calculateDiff` does not detect duplicate addresses in inputs (LOW)

**Location:** `calculateDiff`, lines 61-132

Neither `newRewards` nor `oldRewards` is checked for duplicate addresses. The `readCsv` test explicitly documents that duplicates are returned as separate entries (test line 138-147). If `newRewards` contains duplicate addresses, `findIndex` (line 81) will match the first occurrence and splice it, but the second occurrence will remain in `remainingUndistributed` and be allocated budget separately. This could result in double-paying an address.

The output integration tests (`diffCalculatorOutput.test.ts`) verify no duplicates in the actual output files (lines 71-89), but `calculateDiff` itself does not enforce this invariant.

**Severity: LOW** — Caught by downstream integration tests on actual data, but the function itself is not safe against duplicate inputs.

### F-DC-P5-09: Test `'covered + uncovered rewards should equal total remaining undistributed'` uses incomplete filter (LOW)

**Location:** `diffCalculator.test.ts`, lines 311-334

The test computes `remainingTotal` by filtering `newRewards` to exclude addresses present in `oldRewards`. But `calculateDiff` removes accounts from `remainingUndistributed` based on the first `distributedCount` entries of `oldRewards`, not all of `oldRewards`. In this specific test, `distributedCount` equals `oldRewards.length` (2), so the filter is correct. But the test's filter logic (`!oldRewards.some(...)`) would be wrong if `distributedCount < oldRewards.length`, making the test fragile against refactoring.

**Severity: LOW** — Test is currently correct for its specific inputs, but the filter logic does not match the actual function logic in the general case.

### F-DC-P5-10: `main()` hardcodes "3 accounts" in log message (INFO)

**Location:** Line 176

`console.log("Total for those 3 accounts who got less:", result.totalUnderpaid)` — the "3" is hardcoded and refers to the specific Dec 2025 epoch result. If the data changes, this message would be misleading. This is acceptable for a one-off script but worth noting.

**Severity: INFO**

### F-DC-P5-11: Error messages are accurate for their trigger conditions (INFO)

All error messages in `readCsv` and `calculateDiff` were verified against their trigger conditions:
- `"CSV file is empty"` triggers when `lines.length === 0` (after filtering blank lines) — correct.
- `"CSV file has no data rows (only header)"` triggers when `lines.length === 1` — correct.
- `"has fewer than 2 columns"` / `"has more than 2 columns"` — correct column count checks.
- `"has empty address"` / `"has empty reward"` — correct empty string checks.
- `"distributedCount exceeds oldRewards length"` — correct bounds check.
- `"totalAlreadyPaid exceeds rewardPool"` — correct overflow check.

**Severity: INFO** — All error messages match their triggers.

### F-DC-P5-12: Tests accurately exercise the behavior their names describe (INFO)

All test names were verified against their implementations:
- `'should throw on empty file'` — tests empty string input, correct.
- `'should throw on header-only file'` — tests header + newline, correct.
- `'should lowercase addresses'` — verifies mixed-case input produces lowercase output, correct.
- `'should split remaining into covered and uncovered based on budget'` — verified arithmetic in comments, correct.
- `'should identify underpaid accounts'` — old=10, new=25, diff=15, correct.
- `'should not flag accounts that received more than or equal to new calculation'` — tests exact and overpaid, correct.
- `'should handle greedy ordering'` — tests order-dependent budget exhaustion, correct.
- `'should not mutate input arrays'` — uses structuredClone comparison, correct.
- All invariant tests verified: `totalNewDistribution + remainingRewardsDiff = remainingRewards`, `covered + uncovered = remaining`, both correct.

**Severity: INFO**

---

## Summary

| ID | Severity | Title |
|----|----------|-------|
| F-DC-P5-01 | LOW | Greedy budget allocation is order-dependent (undocumented) |
| F-DC-P5-02 | MEDIUM | `readCsv` does not validate the header row |
| F-DC-P5-03 | LOW | `readCsv` accepts negative reward values without warning |
| F-DC-P5-04 | MEDIUM | `main()` runs on module import as a side effect |
| F-DC-P5-05 | INFO | `structuredClone` BigInt portability note |
| F-DC-P5-06 | LOW | `readCsv` does not validate address format |
| F-DC-P5-07 | LOW | Underpaid amounts not included in budget (by design, but no combined total returned) |
| F-DC-P5-08 | LOW | `calculateDiff` does not detect duplicate addresses in inputs |
| F-DC-P5-09 | LOW | Test invariant filter logic fragile against refactoring |
| F-DC-P5-10 | INFO | Hardcoded "3 accounts" in log message |
| F-DC-P5-11 | INFO | Error messages verified accurate |
| F-DC-P5-12 | INFO | Test names verified accurate |
