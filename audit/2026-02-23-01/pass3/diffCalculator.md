# Audit 2026-02-23-01 -- Pass 3 (Documentation) -- diffCalculator.ts

**Agent:** A03
**Date:** 2026-02-23
**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/diffCalculator.ts`
**Lines:** 176

---

## Evidence of Thorough Reading

### Complete Inventory of Exported Symbols

| Symbol | Kind | Line | Has Documentation |
|--------|------|------|-------------------|
| `DISTRIBUTED_COUNT` | `const` (100) | 4 | No |
| `readCsv` | function | 10 | Yes (JSDoc, lines 6-9) |
| `RewardEntry` | type alias | 46 | No |
| `DiffEntry` | type alias | 47 | No |
| `DiffResult` | interface | 49-59 | No |
| `calculateDiff` | function | 61 | No |

### Internal (Non-Exported) Symbols

| Symbol | Kind | Line | Has Documentation |
|--------|------|------|-------------------|
| `main` | function | 128 | No |

### Inline Comments

| Line(s) | Comment Text | Accurate? |
|---------|-------------|-----------|
| 22 | `// Parse remaining lines` | Yes |
| 67 | `// clone for removing already distirbuted accounts from list` | Contains typo "distirbuted"; otherwise accurate |
| 73 | `// gather all undistruibuted and thos who received less than they should have` | Contains typos "undistruibuted" and "thos"; semantically inaccurate -- the loop iterates old distributed accounts, not undistributed ones |
| 95 | `// calculate those who can be paid with remaining rewards and those who cant` | Missing apostrophe in "cant"; otherwise accurate |
| 129 | `console.log("Running script for Dec2025 rewards case:\n")` | Documents purpose; accurate |
| 135 | `// write to files` | Accurate |
| 164 | `// report` | Accurate |
| 174 | `// run the script` | Accurate |

### CLAUDE.md Description of This File

CLAUDE.md (line 36) states: `src/diffCalculator.ts -- Compares new rewards against previously distributed amounts in output/dispersed/ to produce diff CSVs.`

Actual behavior: The file reads from `./output/rewards-51504517-52994045.csv` and `./output/rewards-51504517-52994045-old.csv` (lines 130-131), not from `output/dispersed/`. It writes to `output/rewards-51504517-52994045-remainingCovered.csv`, `output/rewards-51504517-52994045-remainingUncovered.csv`, and `output/rewards-51504517-52994045-diff.csv` (lines 141-162). The `output/dispersed/` directory is not referenced anywhere in this file.

---

## Findings

### A03-1 -- HIGH -- `calculateDiff` has no JSDoc or documentation whatsoever

**Location:** Line 61

**Description:** `calculateDiff` is the primary exported function of this module. It implements the core diff logic -- comparing new rewards against old rewards, identifying underpaid accounts, and partitioning remaining accounts into covered vs. uncovered based on a reward budget. It accepts four parameters (`newRewards`, `oldRewards`, `distributedCount`, `rewardPool`) and returns a complex `DiffResult` object with nine fields.

There is no JSDoc comment, no `@param` documentation, no `@returns` documentation, and no prose description of the algorithm. Critically:

1. The meaning of "covered" vs. "uncovered" is not documented -- a reader must reverse-engineer that "covered" means "fits within remaining budget" and "uncovered" means "does not fit."
2. The greedy first-fit allocation strategy is not documented. The output depends on input ordering, and there is no documentation stating this is intentional or explaining the ordering policy.
3. The `distributedCount` parameter's relationship to `oldRewards` is not documented -- it is not obvious that only the first `distributedCount` entries of `oldRewards` are considered, not all of them.
4. The semantics of `rewardPool` (total pool, not remaining pool) are undocumented.
5. The nine fields in `DiffResult` are individually undocumented (see A03-3).

For a financial distribution function, this lack of documentation creates significant risk of misuse by consumers of the exported API.

**Recommendation:** Add a comprehensive JSDoc comment documenting the function's purpose, algorithm, parameters, return value semantics, and ordering dependency.

---

### A03-2 -- HIGH -- CLAUDE.md description of `diffCalculator.ts` is factually incorrect

**Location:** `/Users/thedavidmeister/Code/cyclo.rewards/CLAUDE.md`, line 36

**Description:** CLAUDE.md states that `src/diffCalculator.ts` "Compares new rewards against previously distributed amounts in `output/dispersed/` to produce diff CSVs." This is inaccurate in two ways:

1. **Wrong input directory:** The file reads from `./output/rewards-51504517-52994045.csv` and `./output/rewards-51504517-52994045-old.csv` (lines 130-131 of `diffCalculator.ts`). The string `dispersed` does not appear anywhere in `diffCalculator.ts`. The `output/dispersed/` directory may exist for other purposes, but this file does not reference it.

2. **Incomplete description of outputs:** The file produces three CSVs (remainingCovered, remainingUncovered, and diff), not just "diff CSVs." The covered/uncovered partition is a significant output that the CLAUDE.md description omits entirely.

3. **Missing description of algorithm:** The CLAUDE.md entry does not mention the greedy budget-allocation algorithm, the underpaid detection, or the fact that the module runs `main()` as a side effect on import.

**Recommendation:** Update the CLAUDE.md description to accurately reflect the file's behavior:
```
- **`src/diffCalculator.ts`** -- Compares recalculated rewards against a previous distribution to identify underpaid accounts and partition remaining undistributed accounts into "covered" (payable from remaining pool) vs. "uncovered" (insufficient funds). Reads from `output/` CSVs, writes three output CSVs. Runs `main()` unconditionally on import.
```

---

### A03-3 -- MEDIUM -- `DiffResult` interface fields are completely undocumented

**Location:** Lines 49-59

**Description:** The `DiffResult` interface has nine fields, none of which have JSDoc comments or inline documentation:

| Field | Actual Meaning (reverse-engineered from implementation) |
|-------|--------------------------------------------------------|
| `covered` | Accounts from `remainingUndistributed` whose rewards fit within the remaining budget (greedy first-fit) |
| `uncovered` | Accounts from `remainingUndistributed` whose rewards did not fit within the remaining budget |
| `underpaid` | Previously distributed accounts whose new reward exceeds their old reward |
| `totalAlreadyPaid` | Sum of `oldRewards[i].reward` for `i` in `[0, distributedCount)` |
| `remainingRewards` | `rewardPool - totalAlreadyPaid` |
| `totalNewDistribution` | Sum of rewards for all `covered` accounts |
| `remainingRewardsDiff` | `remainingRewards - totalNewDistribution` (leftover budget after covering accounts) |
| `totalRemainingUncovered` | Sum of rewards for all `uncovered` accounts |
| `totalUnderpaid` | Sum of `diff` values for all `underpaid` entries |

Several field names are ambiguous or misleading without documentation:
- `remainingRewardsDiff` sounds like a diff between remaining rewards, but it is actually the leftover budget after paying covered accounts.
- `totalRemainingUncovered` could mean "total number of uncovered accounts remaining" but it is a reward amount.
- `covered` and `uncovered` without context do not convey what they are covered/uncovered by.

**Recommendation:** Add JSDoc comments to each field of `DiffResult` explaining its precise meaning and how it is computed.

---

### A03-4 -- MEDIUM -- `RewardEntry` and `DiffEntry` type aliases are undocumented

**Location:** Lines 46-47

**Description:** Both exported type aliases lack JSDoc comments:

- `RewardEntry = {address: string; reward: bigint}` -- No documentation of what `address` represents (Ethereum address? lowercase? checksummed?), what `reward` represents (wei? token units? from which token?), or when this type is used.
- `DiffEntry = {address: string; old: bigint; new: bigint; diff: bigint}` -- No documentation of what `old` and `new` represent (the old and new reward amounts), or the invariant that `diff === new - old`.

These types are part of the public API via `DiffResult` and are imported in test files.

**Recommendation:** Add JSDoc comments to both type aliases documenting each field's semantics and units.

---

### A03-5 -- MEDIUM -- `DISTRIBUTED_COUNT` constant has no documentation

**Location:** Line 4

**Description:** `DISTRIBUTED_COUNT = 100 as const` is exported but has no JSDoc comment or inline documentation explaining what it represents. The name alone does not convey:
- That it refers to the number of accounts from a previous distribution that were already paid on-chain for the Dec 2025 rewards period.
- That it is used to slice the first N entries from `oldRewards` in `calculateDiff`.
- Why the value is 100 specifically (presumably this was the batch size of the first on-chain distribution transaction).
- Whether it should change for future distributions.

The `main()` function's `console.log` on line 170 refers to "those 3 accounts who got less" which is a hardcoded description of a specific run's output, not a documentation of the constant.

**Recommendation:** Add a JSDoc comment explaining the constant's purpose, provenance, and relationship to on-chain distribution history.

---

### A03-6 -- MEDIUM -- `readCsv` JSDoc is incomplete and partially inaccurate

**Location:** Lines 6-9

**Description:** The existing JSDoc for `readCsv` states:

```typescript
/**
 * Reads a CSV file and returns the data as an array and map
 * @param filePath - Path to the CSV file
 */
```

Issues:
1. **"and map" is inaccurate:** The function returns `Array<{address: string; reward: bigint}>` only. It does not return a map. The JSDoc description does not match the return type.
2. **Missing `@returns` tag:** There is no documentation of the return type or its structure.
3. **Missing error documentation:** The function throws six distinct error types (empty file, header-only, fewer than 2 columns, more than 2 columns, empty address, empty reward) plus a potential `SyntaxError` from `BigInt()`. None are documented with `@throws`.
4. **Missing behavioral documentation:** The function lowercases all addresses (line 40), trims whitespace from values (line 25), and skips the first line as a header without validating it. None of these behaviors are documented.
5. **Missing format documentation:** The expected CSV format (two columns: address and wei amount, with a header row) is not documented.

**Recommendation:** Rewrite the JSDoc to accurately describe the return type, expected CSV format, address lowercasing behavior, header-skipping behavior, and all error conditions.

---

### A03-7 -- LOW -- `main()` function has no documentation

**Location:** Line 128

**Description:** The `main()` function is the script entrypoint that orchestrates the entire diff calculation and output pipeline. It has no JSDoc comment or documentation of:
- What it does (reads two CSVs, calls `calculateDiff`, writes three output CSVs, logs a summary)
- Which specific files it reads and writes (all hardcoded)
- That it is called unconditionally on module import (line 175)
- That it is specific to the Dec 2025 rewards period (block range 51504517-52994045)

The only documentation is the `console.log` on line 129 ("Running script for Dec2025 rewards case") which serves as runtime output rather than code documentation.

**Recommendation:** Add a JSDoc comment documenting the function's purpose, input/output files, and the fact that it executes as a side effect on import.

---

### A03-8 -- LOW -- Inline comment on line 67 contains a typo

**Location:** Line 67

**Description:** The comment reads `// clone for removing already distirbuted accounts from list`. The word "distirbuted" should be "distributed."

**Recommendation:** Fix the typo: `// clone for removing already distributed accounts from list`

---

### A03-9 -- LOW -- Inline comment on line 73 contains two typos and is semantically misleading

**Location:** Line 73

**Description:** The comment reads `// gather all undistruibuted and thos who received less than they should have`. Issues:
1. "undistruibuted" should be "undistributed"
2. "thos" should be "those"
3. The comment says "gather all undistributed" but the loop (lines 74-93) actually iterates over the first `distributedCount` entries of `oldRewards` -- these are the *distributed* accounts. The loop's purpose is to (a) accumulate `totalAlreadyPaid`, (b) identify underpaid distributed accounts, and (c) remove distributed accounts from `remainingUndistributed`. It does not "gather undistributed" accounts; it removes distributed ones from a list that starts with all accounts.

**Recommendation:** Fix the typos and rewrite to accurately describe the loop:
```typescript
// Process already-distributed accounts: accumulate totalAlreadyPaid, identify underpaid, and remove from remainingUndistributed
```

---

### A03-10 -- LOW -- Inline comment on line 95 has a minor grammar issue

**Location:** Line 95

**Description:** The comment reads `// calculate those who can be paid with remaining rewards and those who cant`. Missing apostrophe in "cant" (should be "can't").

**Recommendation:** Fix: `// calculate those who can be paid with remaining rewards and those who can't`

---

### A03-11 -- LOW -- Console output on line 170 contains a hardcoded, potentially misleading count

**Location:** Line 170

**Description:** The `console.log` statement reads: `"Total for those 3 accounts who got less:"`. The number "3" is hardcoded in the log message but the actual count of underpaid accounts is dynamic (`result.underpaid.length`). If the data changes such that the number of underpaid accounts is not 3, this message would be misleading. This is a form of documentation (runtime output) that is coupled to a specific data state rather than the actual computed result.

**Recommendation:** Use the actual count: `console.log(\`Total for those ${result.underpaid.length} accounts who got less:\`, result.totalUnderpaid)`

---

### A03-12 -- INFO -- No module-level documentation or file header

**Location:** Top of file (line 1)

**Description:** The file has no module-level JSDoc comment or file header describing its overall purpose, the Dec 2025 context it was built for, or how it fits into the broader pipeline. The only way to understand this module's role is from CLAUDE.md (which, per A03-2, is inaccurate) or by reading the entire implementation.

**Recommendation:** Add a module-level comment at the top of the file describing its purpose, the specific rewards period it addresses, and its position in the pipeline.

---

### A03-13 -- INFO -- No documentation of the greedy allocation algorithm's properties

**Location:** Lines 102-113

**Description:** The covered/uncovered partition uses a greedy first-fit algorithm that iterates `remainingUndistributed` in input order and subtracts each entry's reward from the remaining budget. If the entry fits, it goes to `covered`; otherwise, `uncovered`. This algorithm has important properties that are not documented anywhere:

1. **Order-dependent:** Different input orderings produce different covered/uncovered partitions.
2. **Not optimal:** It does not maximize the number of covered accounts or the total covered amount (a knapsack-style approach would).
3. **Skipping:** If an account's reward exceeds the remaining budget, it is skipped and placed in `uncovered`, but subsequent smaller accounts may still be covered. This means covered accounts are not necessarily contiguous in the input order.

The test suite documents point 3 via the "greedy ordering" test, but the source code itself has no documentation of these properties.

**Recommendation:** Add an inline comment or JSDoc note explaining the greedy first-fit strategy and its ordering dependency.

---

### A03-14 -- INFO -- `readCsv` does not document its header-skipping behavior

**Location:** Line 24

**Description:** The loop starts at `i = 1`, silently skipping the first line. There is no comment or documentation explaining that the first line is assumed to be a header row. The comment on line 22 says "Parse remaining lines" which implies awareness of the header, but does not explain what the header is expected to contain or that it is not validated.

**Recommendation:** Add a comment clarifying: `// Skip header row (assumed to be present but not validated)`

---

## Summary

| ID | Severity | Title |
|----|----------|-------|
| A03-1 | HIGH | `calculateDiff` has no JSDoc or documentation whatsoever |
| A03-2 | HIGH | CLAUDE.md description of `diffCalculator.ts` is factually incorrect |
| A03-3 | MEDIUM | `DiffResult` interface fields are completely undocumented |
| A03-4 | MEDIUM | `RewardEntry` and `DiffEntry` type aliases are undocumented |
| A03-5 | MEDIUM | `DISTRIBUTED_COUNT` constant has no documentation |
| A03-6 | MEDIUM | `readCsv` JSDoc is incomplete and partially inaccurate |
| A03-7 | LOW | `main()` function has no documentation |
| A03-8 | LOW | Inline comment on line 67 contains a typo |
| A03-9 | LOW | Inline comment on line 73 contains two typos and is semantically misleading |
| A03-10 | LOW | Inline comment on line 95 has a minor grammar issue |
| A03-11 | LOW | Console output on line 170 contains a hardcoded, potentially misleading count |
| A03-12 | INFO | No module-level documentation or file header |
| A03-13 | INFO | No documentation of the greedy allocation algorithm's properties |
| A03-14 | INFO | `readCsv` does not document its header-skipping behavior |

**Total findings:** 14 (2 HIGH, 4 MEDIUM, 5 LOW, 3 INFO)
