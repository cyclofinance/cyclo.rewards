# Pass 4 -- Code Quality Audit: diffCalculator.ts

**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/diffCalculator.ts`
**Auditor:** A03
**Date:** 2026-03-22
**Prior audit:** 2026-02-24-01 (11 PENDING items checked)

---

## 1. Exports Inventory (Evidence of Thorough Reading)

| # | Name | Kind | Line(s) | Exported? |
|---|------|------|---------|-----------|
| 1 | `DISTRIBUTED_COUNT` | `const` (number literal `100`) | 4 | Yes |
| 2 | `readCsv` | function (params: `filePath: string`) -> `Array<{address: string; reward: bigint}>` | 10--44 | Yes |
| 3 | `RewardEntry` | type alias `{address: string; reward: bigint}` | 46 | Yes |
| 4 | `DiffEntry` | type alias `{address: string; old: bigint; new: bigint; diff: bigint}` | 47 | Yes |
| 5 | `DiffResult` | interface (9 fields: `covered`, `uncovered`, `underpaid`, `totalAlreadyPaid`, `remainingRewards`, `totalNewDistribution`, `remainingRewardsDiff`, `totalRemainingUncovered`, `totalUnderpaid`) | 49--59 | Yes |
| 6 | `calculateDiff` | function (params: `newRewards`, `oldRewards`, `distributedCount`, `rewardPool`) -> `DiffResult` | 61--132 | Yes |
| 7 | `main` | function (no params, no return) | 134--178 | No |

Unconditional call: `main()` at line 181.

Imports (lines 1--2): `readFileSync`, `writeFileSync` from `"fs"`; `DEC25_REWARD_POOL`, `REWARDS_CSV_COLUMN_HEADER_ADDRESS`, `REWARDS_CSV_COLUMN_HEADER_REWARD`, `DIFF_CSV_COLUMN_HEADER_OLD`, `DIFF_CSV_COLUMN_HEADER_NEW`, `DIFF_CSV_COLUMN_HEADER_DIFF` from `"./constants"`.

Inline comments at lines: 22, 70, 76, 98, 141, 170, 180.

---

## 2. Prior Findings Status (2026-02-24-01)

All 11 findings are re-checked against the current file.

| Prior ID | Severity | Still Open? | Notes |
|----------|----------|-------------|-------|
| A03-1 | HIGH | YES | `main()` still executes unconditionally at line 181. Carried forward. |
| A03-2 | HIGH | YES | File paths in `main()` still hardcoded to epoch `51504517-52994045`. Carried forward. |
| A03-3 | MEDIUM | YES | Typos at line 70 ("distirbuted") and line 76 ("undistruibuted", "thos") unchanged. Carried forward. |
| A03-4 | MEDIUM | YES | `main()` uses 4-space indentation (lines 135--177); rest of file uses 2-space. Carried forward. |
| A03-5 | MEDIUM | YES | Semicolons inconsistent: present on lines 11--40, missing on lines 83--84, 91--92, 112--113, 115--116, 135, 143, 152, 171--177. Carried forward. |
| A03-6 | MEDIUM | YES | `.toLowerCase()` on line 81 called on both `v.address` and `oldItem.address`, but `readCsv` already lowercases at line 40. Carried forward. |
| A03-7 | LOW | YES | `readCsv` paths use `./output/` prefix (lines 136--137), `writeFileSync` paths use `output/` without `./` (lines 148, 157, 166). Carried forward. |
| A03-8 | LOW | YES | CSV header `REWARDS_CSV_COLUMN_HEADER_ADDRESS + "," + REWARDS_CSV_COLUMN_HEADER_REWARD` constructed inline at line 142 and again at line 161 (different columns). Same pattern exists in `pipeline.ts:60`. No shared helper. Carried forward. |
| A03-9 | LOW | YES | `DISTRIBUTED_COUNT = 100` is epoch-specific (Dec 2025) but exported as a general constant with no comment about which epoch it applies to. Carried forward. |
| A03-10 | LOW | YES | Greedy budget allocation loop (lines 108--119) is order-dependent -- accounts that appear earlier in the array get priority for "covered" status. No comment or doc. Carried forward. |
| A03-11 | LOW | YES | `structuredClone` at line 71 deep-copies `newRewards` (an array of `{address: string; reward: bigint}`). These are flat objects with primitives only (`bigint` is a primitive). A shallow copy like `.map(e => ({...e}))` would be equivalent and more explicit about intent. Carried forward. |

---

## 3. New Findings

### A03-P4-1 -- Inconsistent indentation: `main()` uses 4-space, rest uses 2-space

**Lines:** 135--177 vs. 11--131
**Severity:** MEDIUM
**Category:** Style consistency

The `readCsv` function (lines 10--44) and `calculateDiff` function (lines 61--132) consistently use 2-space indentation. The `main()` function (lines 134--178) uses 4-space indentation throughout. This is the same finding as prior A03-4, confirmed still present. Additionally, within `main()`, the `for` loop bodies (lines 145, 154, 163) use 8-space indentation (two levels of 4-space), while the `writeFileSync` arguments (lines 148--149, 157--158, 166--167) also use 8-space. The rest of the file uses 4-space for two-level nesting (e.g., line 27).

### A03-P4-2 -- Inconsistent semicolon usage

**Lines:** throughout
**Severity:** MEDIUM
**Category:** Style consistency

The file mixes two semicolon styles with no clear boundary:

- **Semicolons present:** lines 11, 12, 15, 19, 23, 25, 27, 30, 32, 34, 36, 38, 40, 43, 68, 71, 72, 73, 79, 81, 94, 99, 101, 103, 104, 105
- **Semicolons missing:** lines 83, 84, 91, 92, 112, 113, 115, 116, 117, 135, 143, 152, 161, 171, 172, 173, 174, 175, 176, 177

The pattern roughly correlates with `readCsv` having semicolons and `calculateDiff`'s inner loop + `main()` lacking them, but this is not a deliberate style boundary -- it's inconsistency. The rest of the codebase (`constants.ts`, `config.ts`, `scraper.ts`, `index.ts`, `processor.ts`) predominantly uses semicolons on statements.

### A03-P4-3 -- Side effect on import: unconditional `main()` call

**Lines:** 180--181
**Severity:** HIGH
**Category:** Leaky abstraction / dead code risk

`main()` is called unconditionally at module load time. Any import of this module (e.g., `import { readCsv } from "./diffCalculator"`) triggers file I/O, console output, and potentially crashes if the referenced CSV files don't exist. The test file (`diffCalculator.test.ts`) works around this by mocking `fs` before import. Compare with `index.ts` which calls `main().catch(...)` -- similar pattern but `index.ts` is never imported by other modules, while `diffCalculator.ts` exports reusable functions.

This is the same core issue as prior A03-1, restated for Pass 4 with code-quality framing.

### A03-P4-4 -- Hardcoded epoch-specific file paths in `main()`

**Lines:** 136--137, 148, 157, 166
**Severity:** HIGH
**Category:** Magic strings / dead code

Five file paths reference block range `51504517-52994045` (the Dec 2025 epoch):
- `./output/rewards-51504517-52994045.csv` (line 136)
- `./output/rewards-51504517-52994045-old.csv` (line 137)
- `output/rewards-51504517-52994045-remainingCovered.csv` (line 148)
- `output/rewards-51504517-52994045-remainingUncovered.csv` (line 157)
- `output/rewards-51504517-52994045-diff.csv` (line 166)

These should be parameterized or at least declared as named constants. The `CLAUDE.md` project documentation confirms: "Each new epoch requires manual updates to [...] `diffCalculator.ts` file paths and block ranges."

Additionally, `readCsv` input paths use `./output/` prefix (lines 136--137) while `writeFileSync` output paths use `output/` without `./` (lines 148, 157, 166). This inconsistency works because Node resolves both relative to `cwd`, but it signals different authors or edits at different times.

### A03-P4-5 -- Typos in comments

**Lines:** 70, 76, 98
**Severity:** LOW
**Category:** Style consistency

Three typos in comments:
- Line 70: `"distirbuted"` should be `"distributed"`
- Line 76: `"undistruibuted"` should be `"undistributed"`, `"thos"` should be `"those"`
- Line 98: `"cant"` should be `"can't"`

### A03-P4-6 -- Redundant `.toLowerCase()` in `calculateDiff`

**Lines:** 81
**Severity:** MEDIUM
**Category:** Leaky abstraction

```typescript
const index = remainingUndistributed.findIndex((v) => v.address.toLowerCase() === oldItem.address.toLowerCase());
```

Both `remainingUndistributed` (cloned from `newRewards`) and `oldRewards` are expected to originate from `readCsv`, which already lowercases all addresses at line 40. The redundant `.toLowerCase()` calls:
1. Suggest the function does not trust its own inputs -- a leaky abstraction.
2. Execute `O(n * m)` unnecessary string operations.
3. If external callers pass non-lowercased data, the function silently normalizes without documenting this contract.

Either: (a) document that inputs must be pre-lowercased and remove the calls, or (b) normalize at function entry and document that normalization happens.

### A03-P4-7 -- `DISTRIBUTED_COUNT` is epoch-specific but exported as general constant

**Lines:** 4
**Severity:** LOW
**Category:** Magic number

`DISTRIBUTED_COUNT = 100` has no comment explaining which epoch it belongs to or what determines the value (it's the number of accounts from the Dec 2025 epoch that were already paid on-chain). Compare with `DEC25_REWARD_POOL` in `constants.ts` which at least has a comment: `"Dec 2025 epoch: 1,000,000 tokens"`. `DISTRIBUTED_COUNT` has neither epoch label nor derivation.

### A03-P4-8 -- Greedy budget allocation is order-dependent

**Lines:** 108--119
**Severity:** LOW
**Category:** Inconsistent pattern / undocumented behavior

The covered/uncovered split loop iterates `remainingUndistributed` in array order. Accounts that appear first in the array consume budget first. If account N has reward 60 and account N+1 has reward 5, and budget is 62, then N is covered (budget 2 remaining) and N+1 is uncovered -- even though covering N+1 instead would waste less budget. This greedy-by-input-order behavior is not documented. It could produce different outputs if the input CSVs are reordered.

### A03-P4-9 -- `structuredClone` on flat objects where shallow copy suffices

**Lines:** 71
**Severity:** LOW
**Category:** Inconsistent pattern

`structuredClone(newRewards)` deep-copies an array of `{address: string; reward: bigint}`. Both `string` and `bigint` are primitives -- there are no nested objects to deep-copy. A shallow alternative like `newRewards.map(e => ({...e}))` would be functionally identical, more explicit about intent, and avoids the overhead of structured cloning (which serializes and deserializes). The test file itself uses `structuredClone` for snapshot comparison, which is fine, but for the hot path in `calculateDiff` it's unnecessary.

### A03-P4-10 -- CSV header construction duplicated across files

**Lines:** 142, 161 (diffCalculator.ts) and pipeline.ts:60
**Severity:** LOW
**Category:** Inconsistent pattern

The pattern `REWARDS_CSV_COLUMN_HEADER_ADDRESS + "," + REWARDS_CSV_COLUMN_HEADER_REWARD` is constructed inline in at least two files. `pipeline.ts` has `formatRewardsCsv` which does the same thing. The diff CSV header (line 161) adds `OLD`, `NEW`, `DIFF` columns in yet another inline construction. A shared helper or pre-built constant for each header format would reduce duplication and prevent drift.

### A03-P4-11 -- Inconsistent `./` prefix in file paths

**Lines:** 136--137 vs. 148, 157, 166
**Severity:** LOW
**Category:** Style consistency

Input paths use `./output/` (lines 136--137), output paths use `output/` (lines 148, 157, 166). Both resolve identically in Node.js, but the inconsistency suggests ad-hoc editing. The rest of the codebase (e.g., `index.ts` lines 144--157) uses template literals with `OUTPUT_DIR` constant (which is `"output"` without `./`).

### A03-P4-12 -- Hardcoded "3 accounts" in console log

**Lines:** 176
**Severity:** LOW
**Category:** Magic number

```typescript
console.log("Total for those 3 accounts who got less:", result.totalUnderpaid)
```

The `3` is hardcoded for the Dec 2025 epoch result. Should be `result.underpaid.length` to remain accurate across epochs.

### A03-P4-13 -- `main()` missing semicolons on all statements

**Lines:** 135, 143, 152, 161, 171--177
**Severity:** LOW
**Category:** Style consistency (subset of A03-P4-2)

Every statement in `main()` (lines 134--178) lacks a trailing semicolon. This includes variable declarations, `for` loop bodies, `writeFileSync` calls, and `console.log` calls. In contrast, every statement in `readCsv` (lines 10--44) has a semicolon. The `calculateDiff` function is mixed (semicolons in declarations and throws, missing in inner loop assignments and pushes).

---

## 4. Mapping to Prior Audit Findings

| Prior ID (2026-02-24-01) | New ID (Pass 4) | Status |
|--------------------------|-----------------|--------|
| A03-1 (HIGH) | A03-P4-3 | STILL OPEN |
| A03-2 (HIGH) | A03-P4-4 | STILL OPEN |
| A03-3 (MEDIUM) | A03-P4-5 (part) | STILL OPEN |
| A03-4 (MEDIUM) | A03-P4-1 | STILL OPEN |
| A03-5 (MEDIUM) | A03-P4-2 | STILL OPEN |
| A03-6 (MEDIUM) | A03-P4-6 | STILL OPEN |
| A03-7 (LOW) | A03-P4-11 | STILL OPEN |
| A03-8 (LOW) | A03-P4-10 | STILL OPEN |
| A03-9 (LOW) | A03-P4-7 | STILL OPEN |
| A03-10 (LOW) | A03-P4-8 | STILL OPEN |
| A03-11 (LOW) | A03-P4-9 | STILL OPEN |

---

## 5. Complete Findings Table

| ID | Line(s) | Severity | Category | Description |
|----|---------|----------|----------|-------------|
| A03-P4-3 | 180--181 | HIGH | Leaky abstraction | `main()` executes unconditionally on import, causing side effects for any consumer |
| A03-P4-4 | 136--137, 148, 157, 166 | HIGH | Magic strings | 5 hardcoded epoch-specific file paths in `main()` |
| A03-P4-1 | 135--177 | MEDIUM | Style consistency | `main()` uses 4-space indent; rest of file uses 2-space |
| A03-P4-2 | throughout | MEDIUM | Style consistency | ~20 statements missing semicolons, ~25 have them, no pattern |
| A03-P4-6 | 81 | MEDIUM | Leaky abstraction | Redundant `.toLowerCase()` on already-lowered addresses |
| A03-P4-5 | 70, 76, 98 | LOW | Style | 4 typos in comments |
| A03-P4-7 | 4 | LOW | Magic number | `DISTRIBUTED_COUNT = 100` lacks epoch label/derivation |
| A03-P4-8 | 108--119 | LOW | Undocumented behavior | Greedy budget allocation is input-order-dependent |
| A03-P4-9 | 71 | LOW | Inconsistent pattern | `structuredClone` on flat objects where shallow copy suffices |
| A03-P4-10 | 142, 161 | LOW | Code duplication | CSV header construction duplicated across files |
| A03-P4-11 | 136--137 vs 148, 157, 166 | LOW | Style consistency | Inconsistent `./` prefix in file paths |
| A03-P4-12 | 176 | LOW | Magic number | Hardcoded "3 accounts" should use `result.underpaid.length` |
| A03-P4-13 | 135--177 | LOW | Style consistency | All `main()` statements lack semicolons (subset of A03-P4-2) |

**Totals: 13 findings**
- HIGH: 2 (A03-P4-3, A03-P4-4)
- MEDIUM: 3 (A03-P4-1, A03-P4-2, A03-P4-6)
- LOW: 8 (A03-P4-5 through A03-P4-13)
- INFO: 0
