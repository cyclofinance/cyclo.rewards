# Audit 2026-02-23-01 -- Pass 2 (Test Coverage) -- diffCalculator

Agent: A03
Files reviewed:
- `/Users/thedavidmeister/Code/cyclo.rewards/src/diffCalculator.ts`
- `/Users/thedavidmeister/Code/cyclo.rewards/src/diffCalculator.test.ts`
- `/Users/thedavidmeister/Code/cyclo.rewards/src/diffCalculatorOutput.test.ts`

---

## Evidence of thorough reading

### Source file `src/diffCalculator.ts`

**Functions:**
- `readCsv(filePath: string)` -- lines 10-44
- `calculateDiff(newRewards, oldRewards, distributedCount, rewardPool)` -- lines 61-126
- `main()` -- lines 128-172 (invoked unconditionally at line 175)

**Constants/Types:**
- `DISTRIBUTED_COUNT = 100` -- line 4
- `RewardEntry` type alias -- line 46
- `DiffEntry` type alias -- line 47
- `DiffResult` interface (fields: covered, uncovered, underpaid, totalAlreadyPaid, remainingRewards, totalNewDistribution, remainingRewardsDiff, totalRemainingUncovered, totalUnderpaid) -- lines 49-59

### Test file `src/diffCalculator.test.ts` -- 32 test cases

1. `hoisted header should match header constants`
2. `readCsv > should throw on empty file`
3. `readCsv > should throw on header-only file`
4. `readCsv > should throw on line with fewer than 2 columns`
5. `readCsv > should throw on line with more than 2 columns`
6. `readCsv > should throw on empty address`
7. `readCsv > should throw on empty reward`
8. `readCsv > should lowercase addresses`
9. `readCsv > should parse valid CSV`
10. `readCsv > should throw on non-numeric reward value`
11. `readCsv > should throw on floating point reward value`
12. `readCsv > should accept negative reward values`
13. `readCsv > should accept zero reward values`
14. `readCsv > should return duplicate addresses as separate entries`
15. `calculateDiff > should split remaining into covered and uncovered based on budget`
16. `calculateDiff > should identify underpaid accounts`
17. `calculateDiff > should not flag accounts that received more than or equal to new calculation`
18. `calculateDiff > should remove distributed accounts from remaining`
19. `calculateDiff > should handle old account not found in new rewards`
20. `calculateDiff > should handle zero distributed count`
21. `calculateDiff > should handle all accounts fitting in budget exactly`
22. `calculateDiff > should handle empty new rewards`
23. `calculateDiff > should not mutate input arrays`
24. `calculateDiff > covered + uncovered rewards should equal total remaining undistributed`
25. `calculateDiff > totalNewDistribution + remainingRewardsDiff should equal remainingRewards`
26. `calculateDiff > should handle greedy ordering -- large account first exhausts budget`
27. `calculateDiff > should throw when distributedCount exceeds oldRewards length`
28. `main() CSV output > should write three CSV files`
29. `main() CSV output > should write remainingCovered CSV with correct header and format`
30. `main() CSV output > should write remainingUncovered CSV with header only`
31. `main() CSV output > should write diff CSV with header only when old and new are identical`
32. `main() CSV output > should only include non-distributed addresses in covered CSV`

### Test file `src/diffCalculatorOutput.test.ts` -- 26 test cases

1-22. `diffCalculator output` describe block (22 tests on real CSV output)
23-26. `on-chain distribution verification` describe block (4 tests)

---

## Findings

### A03-1 -- LOW -- No test for `readCsv` with whitespace-padded values

`readCsv` at line 25 calls `.map(v => v.trim())` on each column value. No test verifies that leading/trailing whitespace on addresses or reward values is correctly stripped. For example, a CSV line like `" 0xabc123 " , " 1000 "` should parse to `{address: "0xabc123", reward: 1000n}`. Without a test, a future refactor removing `.trim()` would not be caught.

### A03-2 -- MEDIUM -- No test for `readCsv` header content validation

`readCsv` skips the first line (line 24: `for (let i = 1; ...)`) assuming it is a header, but never validates that the header contains the expected column names. There is no test verifying that a CSV with a malformed or missing header row (e.g., data in the first row instead of a header) is handled. The function silently skips any first line regardless of content.

### A03-3 -- MEDIUM -- No unit test for `calculateDiff` when `rewardPool < totalAlreadyPaid` (negative remaining budget)

When `rewardPool` is less than `totalAlreadyPaid`, `remainingRewards` goes negative (line 96). The subsequent loop at lines 102-113 would then place every remaining account into `uncovered` because `remainingRewardsDiff - item.reward < 0n` for any positive reward. No test exercises this negative-budget scenario to verify the function behaves correctly or that `remainingRewardsDiff` is reported as negative.

### A03-4 -- LOW -- No test for `calculateDiff` with duplicate addresses in `newRewards`

The function uses `findIndex` (line 78) which only finds the first matching address. If `newRewards` contains duplicate addresses, only the first occurrence is matched and spliced out for a given old entry. The second duplicate remains in `remainingUndistributed`. No test verifies this behavior, which could lead to unexpected double-counting.

### A03-5 -- LOW -- No test for `calculateDiff` with duplicate addresses in `oldRewards`

If `oldRewards` contains the same address multiple times within the first `distributedCount` entries, the function would look up and splice the matching `newRewards` entry on the first encounter. On the second encounter, `findIndex` would either find a different entry (if there was a duplicate in `newRewards`) or return -1. No test verifies this scenario.

### A03-6 -- MEDIUM -- No test for `calculateDiff` case-insensitivity between old and new addresses

At line 78, the function compares addresses using `.toLowerCase()` on both sides. No test provides mixed-case addresses in `oldRewards` and `newRewards` to verify that `0xABC` in oldRewards matches `0xabc` in newRewards. The `readCsv` function lowercases on input, but `calculateDiff` is a separate exported function that accepts arbitrary `RewardEntry[]` arrays directly.

### A03-7 -- HIGH -- No test for `calculateDiff` with zero-reward entries in `newRewards`

When an entry in `newRewards` has `reward: 0n`, it passes the budget check (`diff = remainingRewardsDiff - 0n` is `>= 0n`) and gets placed in `covered`. No test verifies that zero-reward entries are handled. This matters because the output tests (`diffCalculatorOutput.test.ts` lines 149, 154) assert all covered/uncovered rewards are positive, meaning zero-reward entries would violate that invariant.

### A03-8 -- MEDIUM -- No test for `calculateDiff` when an underpaid account also appears in the covered/uncovered split

The function first marks underpaid accounts in the loop at lines 74-93, where it also splices them from `remainingUndistributed`. But the underpaid entries are tracked separately in the `underpaid` array and are removed from `remainingUndistributed`. No test verifies the invariant that underpaid addresses never appear in `covered` or `uncovered`. While the output test file checks this against real data, no unit test with controlled inputs confirms this property.

### A03-9 -- LOW -- No test for `readCsv` with a single data row (minimum valid input)

Tests cover empty file, header-only, and multi-row files, but no test explicitly verifies parsing of a CSV with exactly one data row (header + 1 data line). This is the minimum valid input boundary.

### A03-10 -- LOW -- No test for `readCsv` with very large reward values

No test verifies that `readCsv` correctly handles BigInt values near or exceeding `2^256` (the typical maximum for EVM uint256 values). While JavaScript BigInt has no upper limit, verifying this boundary is important given the blockchain context.

### A03-11 -- MEDIUM -- `main()` side-effects execute on module import, limiting test isolation

The `main()` function is called unconditionally at line 175. This means importing the module in tests triggers file I/O side effects. The test file `diffCalculator.test.ts` works around this by mocking `fs`, but this architecture means:
- It is impossible to test `main()` in isolation with different parameters
- The `main()` function uses hardcoded file paths (lines 130-131, 141-143, 150-153, 159-162) that cannot be parameterized in tests
- No test verifies `main()`'s console.log output (lines 165-171)
- No test verifies `main()` behavior when input files are missing or malformed

### A03-12 -- LOW -- No test for `calculateDiff` with `distributedCount` equal to `oldRewards.length`

Tests cover `distributedCount = 0` (zero) and `distributedCount > oldRewards.length` (overflow, expected to throw). But no test explicitly exercises the boundary where `distributedCount` equals exactly `oldRewards.length`, which is the normal operating case.

### A03-13 -- LOW -- No test for greedy algorithm ordering sensitivity with underpaid accounts

The covered/uncovered split uses a greedy first-fit approach (lines 102-113) that depends on the order of `remainingUndistributed`. Since underpaid accounts are spliced out of `remainingUndistributed` (which changes ordering via `splice`), no test verifies that the order-dependent greedy budget allocation produces correct results when splice-induced reordering changes which accounts end up covered vs uncovered.

### A03-14 -- MEDIUM -- No test that `totalRemainingUncovered` equals the sum of uncovered entry rewards

The `DiffResult` field `totalRemainingUncovered` is accumulated at line 106 inside the loop. No unit test asserts that `result.totalRemainingUncovered === result.uncovered.reduce((s, e) => s + e.reward, 0n)`. The output test file checks the real data indirectly but no controlled unit test verifies this invariant.

### A03-15 -- LOW -- No test for `calculateDiff` with all entries being underpaid (none remaining undistributed)

No test covers the scenario where every entry in `newRewards` appears in `oldRewards` within the first `distributedCount` and all are underpaid. In this case, `remainingUndistributed` would be empty after the first loop, `covered` and `uncovered` would both be empty, and all diff information is in `underpaid`. This edge case is not exercised.

### A03-16 -- LOW -- `main()` CSV output tests do not verify underpaid scenario

The `main()` CSV output tests in `diffCalculator.test.ts` (lines 375-429) only test the case where old and new rewards are identical (the mock returns the same CSV for both). No mock scenario exercises the path where `main()` writes actual underpaid diff entries to the diff CSV file. Lines 156-158 (the diff CSV write loop body) are never tested with non-empty `result.underpaid`.

### A03-17 -- LOW -- No test for `readCsv` with Windows-style line endings (CRLF)

The `readCsv` function splits on `\n` (line 12). If a CSV file has `\r\n` line endings, the `\r` character would be included in the last column value. While `.trim()` on column values would strip it, the address column value at line 32 is assigned from `values[0]` which has already been trimmed. No test verifies correct parsing with `\r\n` line endings.
