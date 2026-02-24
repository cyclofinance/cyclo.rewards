# Audit Report: src/diffCalculator.ts

**Audit ID:** 2026-02-24-01
**Pass:** 4 (Code Quality)
**Agent:** A03
**File:** `src/diffCalculator.ts` (181 lines)
**Date:** 2026-02-24

---

### A03-1 --- HIGH --- Side effect on import: `main()` executes unconditionally at module level

**Location:** Lines 180-181

```typescript
// run the script
main()
```

The `main()` function is called unconditionally at the top level of the module. Any consumer that imports from this file -- whether for `readCsv`, `calculateDiff`, type exports (`RewardEntry`, `DiffEntry`, `DiffResult`), or the `DISTRIBUTED_COUNT` constant -- will trigger the full `main()` execution as a side effect. This includes synchronous file reads, synchronous file writes, and console output.

The test file `diffCalculator.test.ts` works around this by using `vi.hoisted` to set up `fs` mocks before the import occurs, but this is fragile. Any new consumer of the exported functions or types must also pre-mock `fs` or face unexpected side effects. The integration test file `diffCalculatorOutput.test.ts` avoids the problem by not importing from `diffCalculator.ts` at all, duplicating the CSV parsing logic locally instead (its `parseCsv` function on lines 6-13).

This stands in contrast to `index.ts`, which wraps `main()` in an async IIFE with error handling (`main().catch(...)`) and is never imported by other modules.

**Recommendation:** Move `main()` and its invocation into a dedicated entry-point file (e.g., `diffCalculatorMain.ts` or `scripts/diffCalculator.ts`), leaving the current file as a side-effect-free module exporting only the pure functions and types. Alternatively, guard the call:

```typescript
// Only run when executed directly, not when imported
if (process.argv[1]?.endsWith('diffCalculator.ts') || process.argv[1]?.endsWith('diffCalculator.js')) {
  main();
}
```

---

### A03-2 --- HIGH --- Hardcoded file paths and epoch-specific values in `main()`

**Location:** Lines 134-178

The `main()` function contains six hardcoded file paths all referencing the specific block range `51504517-52994045`:

- `./output/rewards-51504517-52994045.csv` (line 136)
- `./output/rewards-51504517-52994045-old.csv` (line 137)
- `output/rewards-51504517-52994045-remainingCovered.csv` (line 148)
- `output/rewards-51504517-52994045-remainingUncovered.csv` (line 157)
- `output/rewards-51504517-52994045-diff.csv` (line 166)

Additionally:
- Line 135 prints `"Running script for Dec2025 rewards case:\n"` -- epoch-specific label.
- Line 139 uses `DEC25_REWARD_POOL` -- a constant specific to December 2025.
- Line 176 prints `"Total for those 3 accounts who got less:"` -- hardcoding the count "3" which depends on the data. The actual count is `result.underpaid.length`.

By contrast, `index.ts` constructs all file paths dynamically from `START_SNAPSHOT` and `END_SNAPSHOT` environment variables. The `main()` function in `diffCalculator.ts` is not reusable for any other epoch without code changes.

**Recommendation:** Parameterize the block range, reward pool, and distributed count, deriving file paths from environment variables or function arguments consistent with the pattern in `index.ts`. Replace `"those 3 accounts"` with `result.underpaid.length`.

---

### A03-3 --- MEDIUM --- Typos in comments

**Location:** Lines 70, 76

Line 70:
```typescript
// clone for removing already distirbuted accounts from list
```
`"distirbuted"` should be `"distributed"`.

Line 76:
```typescript
// gather all undistruibuted and thos who received less than they should have
```
`"undistruibuted"` should be `"undistributed"` and `"thos"` should be `"those"`.

**Recommendation:** Fix both comments:
- Line 70: `// clone for removing already distributed accounts from list`
- Line 76: `// gather all undistributed and those who received less than they should have`

---

### A03-4 --- MEDIUM --- Inconsistent indentation: `main()` uses 4-space indentation, rest of file uses 2-space

**Location:** Lines 134-178 vs. lines 1-132

The `readCsv` function (lines 10-44) and `calculateDiff` function (lines 61-132) use 2-space indentation, which is consistent with the rest of the codebase (`index.ts`, `processor.ts`, `config.ts`, `scraper.ts`). The `main()` function body (lines 134-178) uses 4-space indentation throughout. There is no `.prettierrc`, `.editorconfig`, or ESLint configuration in the project, so there is no enforced standard, but the overwhelming convention across all other files is 2-space.

Within `main()`, there is a further inconsistency: the `for` loop bodies use 8-space indentation (4 for function + 4 for loop body), creating deeply nested code that visually differs from every other loop in the codebase.

**Recommendation:** Reformat `main()` to use 2-space indentation for consistency.

---

### A03-5 --- MEDIUM --- Inconsistent semicolon usage

**Location:** Multiple lines in `calculateDiff` and `main()`

The codebase convention is to use trailing semicolons on statements. Most of `readCsv` and the export/import declarations follow this convention. However, the following lines are missing semicolons:

In `calculateDiff`:
- Line 83: `const newItem = remainingUndistributed[index]`
- Line 84: `const diff = newItem.reward - oldItem.reward`
- Line 91: `})`
- Line 92: `totalUnderpaid += diff`
- Line 112: `totalRemainingUncovered += item.reward`
- Line 113: `uncovered.push(item)`
- Line 115: `covered.push(item)`
- Line 116: `totalNewDistribution += item.reward`

In `main()`:
- Line 135: `console.log("Running script for Dec2025 rewards case:\n")`
- Line 143: `let tmp = [header]`
- Line 152: `tmp = [header]`
- Line 161: `tmp = [...]`

The `readCsv` function is the cleanest section, using semicolons consistently. The pattern degrades in `calculateDiff` and `main()`, suggesting these sections were written or edited separately without a linter pass.

**Recommendation:** Add trailing semicolons throughout for consistency. Consider adding an ESLint or Prettier configuration to enforce style automatically.

---

### A03-6 --- MEDIUM --- Redundant `.toLowerCase()` calls in `calculateDiff`

**Location:** Line 81

```typescript
const index = remainingUndistributed.findIndex(
  (v) => v.address.toLowerCase() === oldItem.address.toLowerCase()
);
```

`readCsv()` already normalizes all addresses to lowercase on line 40 (`address.toLowerCase()`). Both `newRewards` and `oldRewards` in `main()` are produced by `readCsv`, so all addresses are already lowercase by the time `calculateDiff` is called. The `.toLowerCase()` calls are redundant.

If `calculateDiff` is intended as a general-purpose function that may receive non-normalized input, this is defensively correct -- but then the function contract should document this. The codebase has `isSameAddress()` in `config.ts` (line 50-52) which performs the same case-insensitive comparison and would be the idiomatic choice.

**Recommendation:** Either remove the redundant `.toLowerCase()` calls and document that inputs must be pre-normalized, or use `isSameAddress()` from `config.ts` for consistency with the pattern used elsewhere in the codebase (e.g., `processor.ts`).

---

### A03-7 --- LOW --- Inconsistent use of `./` prefix in file paths

**Location:** Lines 136-137 vs. lines 148, 157, 166

Input file paths use the `./` prefix:
```typescript
readCsv("./output/rewards-51504517-52994045.csv");
readCsv("./output/rewards-51504517-52994045-old.csv");
```

Output file paths omit it:
```typescript
writeFileSync("output/rewards-51504517-52994045-remainingCovered.csv", ...);
writeFileSync("output/rewards-51504517-52994045-remainingUncovered.csv", ...);
writeFileSync("output/rewards-51504517-52994045-diff.csv", ...);
```

Both resolve identically in Node.js, but the inconsistency suggests ad-hoc editing.

**Recommendation:** Pick one convention and apply it consistently.

---

### A03-8 --- LOW --- CSV header construction duplicated across files

**Location:** Lines 142, 161 in `diffCalculator.ts`; line 26 in `diffCalculator.test.ts`; line 218 in `index.ts`

The pattern `REWARDS_CSV_COLUMN_HEADER_ADDRESS + "," + REWARDS_CSV_COLUMN_HEADER_REWARD` is repeated in at least three files. The diff-specific header on line 161 is similarly reconstructed from constants in the test file (`diffCalculator.test.ts` line 394).

**Recommendation:** Export pre-constructed header strings from `constants.ts`:
```typescript
export const REWARDS_CSV_HEADER = REWARDS_CSV_COLUMN_HEADER_ADDRESS + "," + REWARDS_CSV_COLUMN_HEADER_REWARD;
export const DIFF_CSV_HEADER = REWARDS_CSV_COLUMN_HEADER_ADDRESS + "," + DIFF_CSV_COLUMN_HEADER_OLD + "," + DIFF_CSV_COLUMN_HEADER_NEW + "," + DIFF_CSV_COLUMN_HEADER_DIFF;
```

---

### A03-9 --- LOW --- `DISTRIBUTED_COUNT` is an epoch-specific value exported as a general constant

**Location:** Line 4

```typescript
export const DISTRIBUTED_COUNT = 100 as const;
```

This value represents the number of accounts distributed in the Dec 2025 epoch specifically. It is used in `main()`, `diffCalculator.test.ts`, and `diffCalculatorOutput.test.ts`. The `as const` assertion and export suggest it is a stable configuration value, but it is tied to a single historical scenario.

**Recommendation:** Either document this as epoch-specific (e.g., `DEC25_DISTRIBUTED_COUNT`), accept it as a parameter in `main()`, or move it alongside `DEC25_REWARD_POOL` in `constants.ts` where the other epoch-specific constant lives.

---

### A03-10 --- LOW --- Greedy budget allocation is order-dependent but undocumented

**Location:** Lines 108-119

The `calculateDiff` function iterates `remainingUndistributed` sequentially, greedily assigning accounts to `covered` until the budget is exhausted. An account that exceeds the remaining budget is placed in `uncovered`, even if a smaller later account would fit. This means the order of `newRewards` directly determines outcomes.

The test suite includes a "greedy ordering" test case (`diffCalculator.test.ts` line 352) that verifies this behavior, but the function itself has no JSDoc or inline comment explaining this contract.

**Recommendation:** Add a JSDoc comment to `calculateDiff` explaining that budget allocation is order-dependent and uses a greedy first-fit strategy.

---

### A03-11 --- LOW --- `structuredClone` on flat objects where shallow copy suffices

**Location:** Line 71

```typescript
const remainingUndistributed = structuredClone(newRewards);
```

`structuredClone` performs a deep copy. The `RewardEntry` type is `{address: string; reward: bigint}` -- a flat object with no nested references. A shallow copy via `.map(e => ({...e}))` would achieve the same result more idiomatically and marginally more efficiently. `structuredClone` does correctly handle `BigInt` (unlike JSON serialization), so the choice is not buggy, just heavier than necessary.

**Recommendation:** Consider `.map(e => ({...e}))` for clarity.

---

### A03-12 --- INFO --- No header validation in `readCsv`

**Location:** Lines 14-20, 24

`readCsv()` validates that the file is not empty and has data rows, but does not validate that the first line (assumed to be a header) matches the expected format (`recipient address,amount wei`). A file with swapped columns or incorrect headers would be silently parsed with address and reward values transposed.

**Recommendation:** Add a header validation step:
```typescript
const expectedHeader = REWARDS_CSV_COLUMN_HEADER_ADDRESS + "," + REWARDS_CSV_COLUMN_HEADER_REWARD;
if (lines[0].trim() !== expectedHeader) {
  throw new Error(`Unexpected CSV header in ${filePath}: "${lines[0]}"`);
}
```

---

### A03-13 --- INFO --- No commented-out code or dead code detected (positive observation)

Apart from the unreachable code paths that would only be hit in impossible conditions (e.g., `calculateDiff` throwing on negative `remainingRewards` when the data invariants hold), there is no commented-out code, unused imports, or dead functions in the file. The `DiffEntry` and `DiffResult` types are all actively used. This is clean.

---

## Summary

| ID | Severity | Title |
|----|----------|-------|
| A03-1 | HIGH | Side effect on import: `main()` executes unconditionally |
| A03-2 | HIGH | Hardcoded file paths and epoch-specific values in `main()` |
| A03-3 | MEDIUM | Typos in comments (lines 70, 76) |
| A03-4 | MEDIUM | Inconsistent indentation (4-space in `main()`, 2-space elsewhere) |
| A03-5 | MEDIUM | Inconsistent semicolon usage |
| A03-6 | MEDIUM | Redundant `.toLowerCase()` calls in `calculateDiff` |
| A03-7 | LOW | Inconsistent `./` prefix in file paths |
| A03-8 | LOW | CSV header construction duplicated across files |
| A03-9 | LOW | `DISTRIBUTED_COUNT` is epoch-specific but exported as general constant |
| A03-10 | LOW | Greedy budget allocation is order-dependent but undocumented |
| A03-11 | LOW | `structuredClone` on flat objects where shallow copy suffices |
| A03-12 | INFO | No header validation in `readCsv` |
| A03-13 | INFO | No commented-out code or dead code (positive) |

**Total findings:** 13 (2 HIGH, 4 MEDIUM, 5 LOW, 2 INFO)

**Overall Assessment:** The file contains two distinct concerns that would benefit from separation: (1) a well-tested, pure-function library (`readCsv`, `calculateDiff`, types), and (2) an epoch-specific script (`main()`). The library portion (lines 1-132) is solid -- good input validation in `readCsv`, correct immutability guarantees in `calculateDiff`, and comprehensive test coverage in two test files. The script portion (lines 134-181) has multiple code quality issues: unconditional side effects on import, hardcoded paths, mixed indentation, missing semicolons, and epoch-specific hardcoded values. The highest-priority fix is extracting `main()` into a separate entry point to eliminate the import side effect.
