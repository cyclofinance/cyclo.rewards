# Pass 3 -- Documentation Audit: diffCalculator.ts

**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/diffCalculator.ts`
**Auditor:** A03
**Date:** 2026-02-24

---

## 1. Exports Inventory

| # | Export | Kind | Line |
|---|--------|------|------|
| 1 | `DISTRIBUTED_COUNT` | `const` (number literal `100`) | 4 |
| 2 | `readCsv` | function | 10 |
| 3 | `RewardEntry` | type alias | 46 |
| 4 | `DiffEntry` | type alias | 47 |
| 5 | `DiffResult` | interface | 49 |
| 6 | `calculateDiff` | function | 61 |

Note: `main()` (line 134) is **not** exported. It is invoked unconditionally at line 181.

---

## 2. JSDoc and Inline Comment Review

### 2.1 `readCsv` (lines 6--9 JSDoc, function lines 10--44)

**Existing JSDoc:**
```ts
/**
 * Reads a CSV file and returns the data as an array and map
 * @param filePath - Path to the CSV file
 */
```

**Issues:**

- **A03-1 -- Stale description: "and map" is inaccurate.** The function returns only `Array<{address: string; reward: bigint}>`. No `Map` is returned. The description text "returns the data as an array and map" is left over from an earlier version and does not match the current return type.
  - **Severity:** Low (misleading but not functionally harmful).
  - **Recommendation:** Update to: `Reads a CSV file and returns the data as an array of address/reward entries.`

- **A03-2 -- Missing `@returns` tag.** The JSDoc documents the parameter but omits a `@returns` description. The return type is visible in the TypeScript signature but the JSDoc is incomplete by its own conventions.
  - **Severity:** Low.
  - **Recommendation:** Add `@returns Array of objects with lowercase address and reward as bigint.`

- **A03-3 -- No documentation of thrown errors.** The function throws on five distinct conditions (empty file, header-only, wrong column count, empty address, empty reward). None are documented with `@throws`.
  - **Severity:** Low.
  - **Recommendation:** Add `@throws {Error}` descriptions for the five error conditions, or at minimum note that the function throws on malformed input.

### 2.2 `calculateDiff` (lines 61--132)

- **A03-4 -- No JSDoc at all.** This is the core exported function of the module. It has no documentation describing its purpose, parameters, return value, or error conditions. The function takes four parameters (`newRewards`, `oldRewards`, `distributedCount`, `rewardPool`) whose roles and invariants are non-obvious.
  - **Severity:** Medium. This is the primary public API of the module and callers must read the implementation to understand semantics such as: the greedy first-fit allocation strategy for covered/uncovered, the assumption that `oldRewards` is ordered with the first `distributedCount` entries being the distributed ones, and the fact that underpaid accounts are removed from the remaining pool.
  - **Recommendation:** Add full JSDoc with `@param` and `@returns` and `@throws` tags.

### 2.3 `DISTRIBUTED_COUNT` (line 4)

- **A03-5 -- Magic constant with no explanation.** `DISTRIBUTED_COUNT = 100` has no comment explaining what it represents, why 100, or where the value comes from. From context (the test file `diffCalculatorOutput.test.ts` and the `main()` function), it represents the number of accounts from the old rewards list that were already paid on-chain. This is a domain-critical constant that directly affects financial calculations.
  - **Severity:** Medium. A reader unfamiliar with the operational history has no way to understand why this is 100 without tracing through test files and the on-chain distribution CSV.
  - **Recommendation:** Add a comment such as: `/** Number of accounts from the old rewards CSV that were already distributed on-chain in the first Dec 2025 batch. */`

### 2.4 `main()` (lines 134--178)

- **A03-6 -- No documentation for `main()`.** The function is undocumented. It serves as a standalone script entry point (called unconditionally at line 181) that orchestrates the Dec 2025 diff calculation for a specific pair of reward files. It has hardcoded file paths and is tightly coupled to a single rewards period.
  - **Severity:** Low. Since `main()` is not exported, its audience is primarily maintainers.
  - **Recommendation:** Add a brief JSDoc or block comment explaining its purpose, e.g., `/** Script entry point: computes and writes diff CSVs for the Dec 2025 rewards recalculation. */`

---

## 3. Inline Comment Accuracy and Typos

### 3.1 Typos

- **A03-7 -- Line 70: "distirbuted" should be "distributed."**
  ```ts
  // clone for removing already distirbuted accounts from list
  ```
  The letters "i" and "r" are transposed in "distirbuted".
  - **Severity:** Low (cosmetic).

- **A03-8 -- Line 76: "undistruibuted" should be "undistributed"; "thos" should be "those."**
  ```ts
  // gather all undistruibuted and thos who received less than they should have
  ```
  Two errors: "undistruibuted" has extra letters ("ui") and "thos" is missing the trailing "e".
  - **Severity:** Low (cosmetic).

### 3.2 Hardcoded contextual reference

- **A03-9 -- Line 176: Hardcoded "3 accounts" in log message.**
  ```ts
  console.log("Total for those 3 accounts who got less:", result.totalUnderpaid)
  ```
  The string "3 accounts" is hardcoded. While the current diff CSV does contain exactly 3 underpaid accounts (verified against `output/rewards-51504517-52994045-diff.csv`), this is a runtime-dependent value. If the input data changes or this code is adapted for a different period, the message becomes inaccurate. The actual count is available as `result.underpaid.length`.
  - **Severity:** Low (the `main()` function is effectively a one-shot script for a specific reward period, so the value is coincidentally correct for its intended use). However, it is still poor practice.
  - **Recommendation:** Replace with a dynamic count:
    ```ts
    console.log(`Total for those ${result.underpaid.length} accounts who got less:`, result.totalUnderpaid)
    ```

### 3.3 Inline comment accuracy

- **Line 22:** `// Parse remaining lines` -- Accurate. The loop starts at index 1, skipping the header.
- **Line 98:** `// calculate those who can be paid with remaining rewards and those who cant` -- Accurate description of lines 99--119. Minor: missing apostrophe in "cant" (should be "can't").
  - **A03-10 -- Line 98: "cant" should be "can't."**
    - **Severity:** Low (cosmetic).
- **Line 141:** `// write to files` -- Accurate.
- **Line 170:** `// report` -- Accurate.
- **Line 180:** `// run the script` -- Accurate.

---

## 4. Type Export Documentation

- **A03-11 -- `RewardEntry`, `DiffEntry`, and `DiffResult` have no documentation.** Lines 46--59 export three type definitions with no JSDoc. `DiffResult` in particular has nine fields whose names alone may not convey full semantics (e.g., `remainingRewardsDiff` could be confused with a "diff" in the subtraction sense vs. the comparison sense -- it is actually the leftover budget after paying covered accounts).
  - **Severity:** Low-Medium. The field names are reasonably descriptive but some are ambiguous.
  - **Recommendation:** At minimum, add a JSDoc comment for `DiffResult` explaining the semantics of each field, especially `remainingRewardsDiff` (remaining pool budget after covering new distributions) vs. `remainingRewards` (pool minus already-paid).

---

## 5. Summary of Findings

| ID | Line(s) | Severity | Category | Description |
|----|---------|----------|----------|-------------|
| A03-1 | 7 | Low | Stale JSDoc | `readCsv` description says "array and map" but only an array is returned |
| A03-2 | 6--9 | Low | Missing JSDoc | `readCsv` missing `@returns` tag |
| A03-3 | 6--9 | Low | Missing JSDoc | `readCsv` missing `@throws` documentation for 5 error conditions |
| A03-4 | 61 | Medium | Missing JSDoc | `calculateDiff` has no JSDoc at all |
| A03-5 | 4 | Medium | Missing comment | `DISTRIBUTED_COUNT = 100` has no explanation of its meaning or provenance |
| A03-6 | 134 | Low | Missing JSDoc | `main()` is undocumented |
| A03-7 | 70 | Low | Typo | "distirbuted" should be "distributed" |
| A03-8 | 76 | Low | Typo | "undistruibuted" should be "undistributed"; "thos" should be "those" |
| A03-9 | 176 | Low | Hardcoded value | "3 accounts" is hardcoded; should use `result.underpaid.length` |
| A03-10 | 98 | Low | Typo | "cant" should be "can't" |
| A03-11 | 46--59 | Low-Medium | Missing JSDoc | `RewardEntry`, `DiffEntry`, `DiffResult` types are undocumented |

**Total findings: 11**
- Medium: 2 (A03-4, A03-5)
- Low-Medium: 1 (A03-11)
- Low: 8 (A03-1, A03-2, A03-3, A03-6, A03-7, A03-8, A03-9, A03-10)
