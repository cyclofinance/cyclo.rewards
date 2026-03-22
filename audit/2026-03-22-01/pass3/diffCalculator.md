# Pass 3 -- Documentation Audit: diffCalculator.ts

**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/diffCalculator.ts`
**Auditor:** A03
**Date:** 2026-03-22
**Prior audit:** 2026-02-24-01 (all 11 PENDING items checked)

---

## 1. Exports Inventory (Evidence of Thorough Reading)

| # | Export | Kind | Line |
|---|--------|------|------|
| 1 | `DISTRIBUTED_COUNT` | `const` (number literal `100`) | 4 |
| 2 | `readCsv` | function | 10 |
| 3 | `RewardEntry` | type alias | 46 |
| 4 | `DiffEntry` | type alias | 47 |
| 5 | `DiffResult` | interface (9 fields) | 49--59 |
| 6 | `calculateDiff` | function | 61--132 |

Non-exported:
| 7 | `main` | function (called unconditionally at line 181) | 134--178 |

Imports (line 1--2): `readFileSync`, `writeFileSync` from `fs`; `DEC25_REWARD_POOL`, CSV column header constants from `./constants`.

Inline comments at lines: 22, 70, 76, 98, 141, 170, 180.

---

## 2. Prior Findings Status

All 11 findings from the 2026-02-24-01 audit remain PENDING. The file has not changed since the prior audit.

| Prior ID | Status | Line(s) | Description |
|----------|--------|---------|-------------|
| A03-1 | STILL OPEN | 7 | `readCsv` JSDoc says "array and map" -- only array is returned |
| A03-2 | STILL OPEN | 6--9 | `readCsv` missing `@returns` tag |
| A03-3 | STILL OPEN | 6--9 | `readCsv` missing `@throws` for 5 error conditions |
| A03-4 | STILL OPEN | 61 | `calculateDiff` has no JSDoc |
| A03-5 | STILL OPEN | 4 | `DISTRIBUTED_COUNT = 100` magic constant unexplained |
| A03-6 | STILL OPEN | 134 | `main()` undocumented |
| A03-7 | STILL OPEN | 70 | Typo: "distirbuted" |
| A03-8 | STILL OPEN | 76 | Typos: "undistruibuted", "thos" |
| A03-9 | STILL OPEN | 176 | Hardcoded "3 accounts" should use `result.underpaid.length` |
| A03-10 | STILL OPEN | 98 | Typo: "cant" should be "can't" |
| A03-11 | STILL OPEN | 46--59 | `RewardEntry`, `DiffEntry`, `DiffResult` undocumented |

---

## 3. New Findings

### A03-12 -- Missing header validation in `readCsv`

**Line:** 24
**Severity:** LOW
**Category:** Missing documentation (defensive comment)

The function skips line index 0 (the header) at line 24 with `for (let i = 1; ...)` but does not validate that the header matches the expected column names (`REWARDS_CSV_COLUMN_HEADER_ADDRESS`, `REWARDS_CSV_COLUMN_HEADER_REWARD`). This is technically a correctness gap, but from a documentation perspective the comment at line 22 ("Parse remaining lines") does not mention that the header is assumed valid and unchecked. A reader might assume validation occurs.

Note: This finding overlaps with correctness (Pass 1/2 territory). Documenting it here because the comment is misleading by omission.

### A03-13 -- `main()` unconditional execution prevents safe import

**Line:** 181
**Severity:** LOW
**Category:** Missing documentation

Line 181 calls `main()` unconditionally at module load time. The comment at line 180 ("// run the script") is accurate but does not warn that importing this module as a library (e.g., for `readCsv` or `calculateDiff`) will trigger side effects including file I/O and console output. The test file imports from `diffCalculator.ts` -- this means tests execute `main()` as a side effect unless the test framework or bundler handles it.

After checking: the test file likely imports from a compiled/bundled version or vitest handles it. Regardless, a documentation note about the side-effecting import would be appropriate.

---

## 4. Complete Findings Table

| ID | Line(s) | Severity | Category | Description |
|----|---------|----------|----------|-------------|
| A03-4 | 61 | MEDIUM | Missing JSDoc | `calculateDiff` has no JSDoc -- core public API |
| A03-5 | 4 | MEDIUM | Missing comment | `DISTRIBUTED_COUNT = 100` magic constant unexplained |
| A03-11 | 46--59 | LOW-MEDIUM | Missing JSDoc | `RewardEntry`, `DiffEntry`, `DiffResult` types undocumented |
| A03-1 | 7 | LOW | Stale JSDoc | `readCsv` says "array and map" but only array returned |
| A03-2 | 6--9 | LOW | Missing JSDoc | `readCsv` missing `@returns` tag |
| A03-3 | 6--9 | LOW | Missing JSDoc | `readCsv` missing `@throws` for 5 error conditions |
| A03-6 | 134 | LOW | Missing JSDoc | `main()` undocumented |
| A03-7 | 70 | LOW | Typo | "distirbuted" should be "distributed" |
| A03-8 | 76 | LOW | Typo | "undistruibuted" / "thos" should be "undistributed" / "those" |
| A03-9 | 176 | LOW | Hardcoded value | "3 accounts" should use `result.underpaid.length` |
| A03-10 | 98 | LOW | Typo | "cant" should be "can't" |
| A03-12 | 22--24 | LOW | Misleading comment | Comment does not mention header is assumed valid |
| A03-13 | 180--181 | LOW | Missing documentation | Unconditional `main()` execution causes side effects on import |

**Total findings: 13** (11 carried forward, 2 new)
- MEDIUM: 2 (A03-4, A03-5)
- LOW-MEDIUM: 1 (A03-11)
- LOW: 10 (A03-1, A03-2, A03-3, A03-6, A03-7, A03-8, A03-9, A03-10, A03-12, A03-13)
