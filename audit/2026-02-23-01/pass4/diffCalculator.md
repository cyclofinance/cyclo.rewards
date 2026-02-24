# Audit Report: src/diffCalculator.ts

**Audit ID:** 2026-02-23-01
**Pass:** 4 (Code Quality)
**Agent:** A03
**File:** `src/diffCalculator.ts`

---

### A03-1 --- HIGH --- Side effect on import: `main()` executes unconditionally at module level

Lines 174-175 call `main()` unconditionally at the bottom of the file. This means any module that imports from `diffCalculator.ts` (e.g., test files importing `readCsv`, `calculateDiff`, or type exports) will trigger the full `main()` execution as a side effect, including file I/O reads and writes. The test file `diffCalculator.test.ts` works around this by mocking `fs` via `vi.hoisted` before any imports occur, but this is fragile --- any new test or consumer importing from this module must also pre-mock `fs` or face unexpected file system operations and console output.

**Recommendation:** Wrap the `main()` call in a standard entry-point guard, or move `main()` into a separate entry-point file (e.g., `diffCalculatorMain.ts`) that is referenced from `package.json` scripts. The pure functions and types should be exported from a module that has no side effects.

```typescript
// Current (problematic):
main()

// Option A - guard with import.meta check (ESM):
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

// Option B - separate entry-point file
```

---

### A03-2 --- HIGH --- Hardcoded file paths in `main()` function

Lines 130-162 contain six hardcoded file paths referencing a specific epoch (`51504517-52994045`):

- `./output/rewards-51504517-52994045.csv`
- `./output/rewards-51504517-52994045-old.csv`
- `output/rewards-51504517-52994045-remainingCovered.csv`
- `output/rewards-51504517-52994045-remainingUncovered.csv`
- `output/rewards-51504517-52994045-diff.csv`

These block numbers are specific to the Dec 2025 rewards epoch. The `main()` function is not reusable for any other epoch, and these paths are not derived from any configuration (unlike `index.ts` which constructs paths from `START_SNAPSHOT` and `END_SNAPSHOT` environment variables). If this file is intended as a one-off script, it should be documented as such; if it is intended to be part of the recurring pipeline (it is invoked by `npm run start`), the paths should be parameterized.

**Recommendation:** Derive file paths from environment variables or function parameters, consistent with how `index.ts` handles epoch-specific paths.

---

### A03-3 --- MEDIUM --- Hardcoded console message references "Dec2025" and "3 accounts"

Line 129: `console.log("Running script for Dec2025 rewards case:\n")`
Line 170: `console.log("Total for those 3 accounts who got less:", ...)`

These messages are specific to a single historical run. Line 170 hardcodes "3 accounts" but the actual count depends on the data. If the script is reused with different data, these messages will be misleading.

**Recommendation:** Use `result.underpaid.length` in the message on line 170, and make the introductory message generic or parameterized.

---

### A03-4 --- MEDIUM --- Typos in comments

Line 67: `"distirbuted"` should be `"distributed"`
Line 73: `"undistruibuted"` should be `"undistributed"` and `"thos"` should be `"those"`

```typescript
// Line 67:
// clone for removing already distirbuted accounts from list
// Line 73:
// gather all undistruibuted and thos who received less than they should have
```

**Recommendation:** Fix to: `"clone for removing already distributed accounts from list"` and `"gather all undistributed and those who received less than they should have"`.

---

### A03-5 --- MEDIUM --- Inconsistent indentation style

The `main()` function body (lines 128-172) uses 4-space indentation, while `readCsv()` and `calculateDiff()` (lines 10-126) use 2-space indentation. The rest of the codebase (`index.ts`, `processor.ts`, `config.ts`) consistently uses 2-space indentation.

**Recommendation:** Reformat `main()` to use 2-space indentation for consistency with the rest of the codebase.

---

### A03-6 --- MEDIUM --- Redundant `.toLowerCase()` calls in `calculateDiff`

Line 78 calls `.toLowerCase()` on both sides of the address comparison:

```typescript
const index = remainingUndistributed.findIndex(
  (v) => v.address.toLowerCase() === oldItem.address.toLowerCase()
);
```

However, `readCsv()` already normalizes all addresses to lowercase on line 40. If `calculateDiff` is always called with data from `readCsv()`, the `.toLowerCase()` calls are redundant. If `calculateDiff` is intended to be a general-purpose function that may receive non-normalized input, then this is acceptable but should be documented. The codebase has a utility function `isSameAddress()` in `config.ts` for this exact purpose.

**Recommendation:** Either remove the redundant `.toLowerCase()` calls (if inputs are always pre-normalized), or use `isSameAddress()` from `config.ts` for consistency with the rest of the codebase.

---

### A03-7 --- LOW --- CSV header construction is duplicated between `main()` and test files

Lines 136 and 155 in `main()` construct CSV headers by concatenating column-header constants:

```typescript
const header = REWARDS_CSV_COLUMN_HEADER_ADDRESS + "," + REWARDS_CSV_COLUMN_HEADER_REWARD;
```

The same pattern appears in `diffCalculator.test.ts` (line 26, 382) and `index.ts` (line 208). This duplication means that if the CSV format changes, multiple locations must be updated.

**Recommendation:** Export a pre-constructed header string from `constants.ts`, e.g., `export const REWARDS_CSV_HEADER = ...`.

---

### A03-8 --- LOW --- Missing semicolons on several lines (inconsistent style)

Several lines in `calculateDiff` and `main()` are missing trailing semicolons, while the rest of the file and codebase uses them consistently:

- Line 80: `const newItem = remainingUndistributed[index]`
- Line 81: `const diff = newItem.reward - oldItem.reward`
- Line 89: `totalUnderpaid += diff`
- Line 106: `totalRemainingUncovered += item.reward`
- Line 137: `let tmp = [header]`
- Line 146: `tmp = [header]`

**Recommendation:** Add trailing semicolons for consistency.

---

### A03-9 --- LOW --- `DISTRIBUTED_COUNT` is exported as a constant but is a scenario-specific value

Line 4: `export const DISTRIBUTED_COUNT = 100 as const;`

This value (100) represents the number of accounts that were distributed in the Dec 2025 epoch specifically. It is not a general-purpose configuration constant. It is used in the test files and in `main()`, coupling them to this specific historical scenario. If the diff calculator is used for future epochs with a different distribution count, this constant would need to change.

**Recommendation:** Either document that this is epoch-specific, or accept it as a parameter (similar to how `rewardPool` is a parameter to `calculateDiff`).

---

### A03-10 --- LOW --- `structuredClone` used on array of objects with BigInt values

Line 68: `const remainingUndistributed = structuredClone(newRewards);`

`structuredClone` does support `BigInt` (unlike `JSON.parse(JSON.stringify(...))`), so this is functionally correct. However, for an array of simple `{address, reward}` objects, a shallow copy via `.map(e => ({...e}))` would be more idiomatic and marginally more efficient, since the objects are flat (no nested references).

**Recommendation:** Consider using `.map(e => ({...e}))` for clarity and performance, though this is a minor point.

---

### A03-11 --- LOW --- Greedy budget allocation in `calculateDiff` is order-dependent but not documented

Lines 102-113 iterate `remainingUndistributed` in order, greedily assigning accounts to `covered` until the budget runs out. This means the order of `newRewards` input directly determines which accounts are covered vs. uncovered --- a later account that fits within the remaining budget could be skipped because an earlier larger account was already rejected. This greedy-first-fit behavior is tested (the "greedy ordering" test case) but not documented in the function's contract.

**Recommendation:** Add a JSDoc comment to `calculateDiff` explaining that budget allocation is order-dependent and uses a greedy first-fit strategy. Callers should sort `newRewards` by priority before calling.

---

### A03-12 --- INFO --- No header validation in `readCsv`

`readCsv()` skips the first line (line 24: `for (let i = 1; ...)`), assuming it is a header, but does not validate that the header matches the expected column names (`REWARDS_CSV_COLUMN_HEADER_ADDRESS`, `REWARDS_CSV_COLUMN_HEADER_REWARD`). A file with swapped columns or wrong headers would be silently parsed incorrectly.

**Recommendation:** Add a header validation check after reading lines, e.g., verify `lines[0]` matches the expected header format.

---

## Summary

| ID | Severity | Title |
|----|----------|-------|
| A03-1 | HIGH | Side effect on import: `main()` executes unconditionally |
| A03-2 | HIGH | Hardcoded file paths in `main()` |
| A03-3 | MEDIUM | Hardcoded console messages reference specific epoch |
| A03-4 | MEDIUM | Typos in comments |
| A03-5 | MEDIUM | Inconsistent indentation style |
| A03-6 | MEDIUM | Redundant `.toLowerCase()` calls |
| A03-7 | LOW | CSV header construction is duplicated |
| A03-8 | LOW | Missing semicolons on several lines |
| A03-9 | LOW | `DISTRIBUTED_COUNT` is epoch-specific |
| A03-10 | LOW | `structuredClone` vs shallow copy |
| A03-11 | LOW | Greedy budget allocation is order-dependent but undocumented |
| A03-12 | INFO | No header validation in `readCsv` |

**Total findings:** 12 (2 HIGH, 3 MEDIUM, 5 LOW, 1 INFO)
