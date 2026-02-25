# Pass 3 -- Documentation Audit: `src/constants.ts`

**Auditor:** A02
**Date:** 2026-02-24
**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/constants.ts` (13 lines)

---

## Export Inventory

| Line | Export | Type | Documentation |
|------|--------|------|---------------|
| 1 | `ONE` | `BigInt` | None |
| 3 | `REWARD_POOL` | `BigInt` | None |
| 4 | `DEC25_REWARD_POOL` | `bigint` literal | None |
| 8 | `REWARDS_CSV_COLUMN_HEADER_ADDRESS` | `string` | Covered by block comment on lines 6-7 |
| 9 | `REWARDS_CSV_COLUMN_HEADER_REWARD` | `string` | Covered by block comment on lines 6-7 |
| 10 | `DIFF_CSV_COLUMN_HEADER_OLD` | `string` | Covered by block comment on lines 6-7 |
| 11 | `DIFF_CSV_COLUMN_HEADER_NEW` | `string` | Covered by block comment on lines 6-7 |
| 12 | `DIFF_CSV_COLUMN_HEADER_DIFF` | `string` | Covered by block comment on lines 6-7 |

---

## Findings

### A02-1 -- CRITICAL: `REWARD_POOL` has silent precision loss

**Line:** 3
**Severity:** Critical (correctness)

```ts
export const REWARD_POOL = BigInt(500000000000000000000000);
```

The numeric literal `500000000000000000000000` (5 * 10^23) exceeds `Number.MAX_SAFE_INTEGER` (2^53 - 1 = 9007199254740991). When JavaScript evaluates the expression, the number literal is first parsed as a `Number` (IEEE 754 float64), losing precision, and that lossy value is then converted to `BigInt`.

**Actual value produced:**

| Expression | Result |
|---|---|
| `BigInt(500000000000000000000000)` | `499999999999999991611392n` |
| `BigInt('500000000000000000000000')` (correct) | `500000000000000000000000n` |

The deficit is **8,388,608 wei** (exactly 2^23, as expected from float64 rounding). If the intended value is 500,000 tokens at 18 decimals (i.e., 500,000 * 10^18 = 5 * 10^23), the constant is incorrect.

There is no documentation (JSDoc, inline comment, or otherwise) explaining:
- What the intended human-readable value is (e.g., "500,000 tokens").
- Why this pool size was chosen.
- The relationship to `DEC25_REWARD_POOL`.

Note that `DEC25_REWARD_POOL` on line 4 uses the `n` BigInt literal syntax, which does not suffer from this issue. The inconsistency between the two lines suggests the pattern on line 3 is a latent bug rather than an intentional choice.

**Recommendation:** Replace with a BigInt literal or string-based construction and add a comment stating the intended value:

```ts
// 500,000 tokens in wei (500k * 1e18)
export const REWARD_POOL = 500_000_000_000_000_000_000_000n;
```

---

### A02-2 -- HIGH: `ONE` uses fragile `BigInt(10 ** 18)` pattern

**Line:** 1
**Severity:** High (fragility, potential correctness)

```ts
export const ONE = BigInt(10 ** 18);
```

This passes the result of `10 ** 18` (a `Number`) to `BigInt()`. The value `10 ** 18` = `1000000000000000000` happens to be exactly representable as an IEEE 754 float64 because `10^18 = 2^18 * 5^18` and `5^18 = 3814697265625` fits within 53 bits. So the current value is correct.

However, this relies on a non-obvious property of float64 representation. The same pattern applied to a slightly different exponent (e.g., `10 ** 19` or `10 ** 23`) would silently produce an incorrect value, as demonstrated by `REWARD_POOL` on line 3. The pattern is therefore a footgun.

There is no documentation explaining:
- What `ONE` represents semantically (1 token in wei? A scaling factor for fixed-point arithmetic?).
- Why `10 ** 18` specifically (ERC-20 standard 18-decimal convention).

From usage in `processor.ts` line 419, `ONE` is used as a fixed-point scaling factor for proportional reward calculation.

**Recommendation:** Use the `n` literal syntax for consistency and safety, and add documentation:

```ts
/** Fixed-point scaling factor: 1e18, matching ERC-20 18-decimal token precision. */
export const ONE = 10n ** 18n;
```

---

### A02-3 -- HIGH: `DEC25_REWARD_POOL` has no documentation explaining its purpose or relationship to `REWARD_POOL`

**Line:** 4
**Severity:** High (comprehensibility)

```ts
export const DEC25_REWARD_POOL = 1_000_000_000_000_000_000_000_000n as const;
```

This constant has no documentation. From the name and usage it appears to represent a 1,000,000-token reward pool specific to a "December 2025" distribution period, while `REWARD_POOL` (line 3) represents a 500,000-token pool (presumably for an earlier period). Key questions left unanswered:

- Why are there two pool constants?
- What period or distribution does each correspond to?
- Why is `DEC25_REWARD_POOL` double the size of `REWARD_POOL`?
- Why does `REWARD_POOL` use `BigInt(number)` while `DEC25_REWARD_POOL` uses the `n` literal? (Is the former simply older code that was never updated?)

From codebase usage:
- `REWARD_POOL` is used in `src/index.ts` (line 162) for the main `calculateRewards()` call.
- `DEC25_REWARD_POOL` is used in `src/diffCalculator.ts` (line 139) for diff calculations and in tests.

The naming convention (`DEC25_` prefix) implies temporal scoping, but there is no comment or documentation connecting these constants to specific distribution rounds.

**Recommendation:** Add JSDoc or inline comments explaining the purpose and temporal scope of each pool constant:

```ts
/** Reward pool for the initial distribution period: 500,000 tokens in wei. */
export const REWARD_POOL = 500_000_000_000_000_000_000_000n;

/** Reward pool for the December 2025 distribution period: 1,000,000 tokens in wei. */
export const DEC25_REWARD_POOL = 1_000_000_000_000_000_000_000_000n as const;
```

---

### A02-4 -- LOW: CSV column header comment is accurate but could be more specific

**Lines:** 6-7

```ts
// Must match expected structure
// https://github.com/flare-foundation/rnat-distribution-tool/blob/main/README.md#add-csv-file-with-rewards-data
```

**Accuracy assessment:** The comment correctly states that the column headers must conform to the structure defined by the external distribution tool. The URL points to the Flare Foundation's `rnat-distribution-tool` README, which is the appropriate upstream reference. The comment is accurate.

**Issues:**
- The comment applies to `REWARDS_CSV_COLUMN_HEADER_ADDRESS` and `REWARDS_CSV_COLUMN_HEADER_REWARD` (lines 8-9), as these are the headers for the rewards CSV consumed by the distribution tool. However, it is ambiguous whether the comment also covers the `DIFF_CSV_COLUMN_HEADER_*` constants (lines 10-12), which appear to be for internal diff reporting rather than the external tool's format.
- The GitHub URL references a specific branch (`main`), which could become stale if the upstream repository reorganizes.

**Recommendation:** Clarify which constants the comment covers:

```ts
// Rewards CSV headers must match the structure expected by the distribution tool:
// https://github.com/flare-foundation/rnat-distribution-tool/blob/main/README.md#add-csv-file-with-rewards-data
export const REWARDS_CSV_COLUMN_HEADER_ADDRESS = "recipient address";
export const REWARDS_CSV_COLUMN_HEADER_REWARD = "amount wei";

// Internal diff CSV headers (not constrained by external tooling).
export const DIFF_CSV_COLUMN_HEADER_OLD = "old";
export const DIFF_CSV_COLUMN_HEADER_NEW = "new";
export const DIFF_CSV_COLUMN_HEADER_DIFF = "diff";
```

---

### A02-5 -- LOW: No file-level documentation

**Severity:** Low (comprehensibility)

The file has no file-level JSDoc or header comment explaining its purpose. While the file is small and the names are fairly self-describing, a brief header would help orient new contributors, especially regarding the relationship between the two reward pool constants.

**Recommendation:** Add a brief file-level comment:

```ts
/**
 * Shared constants for the Cyclo rewards calculator.
 *
 * - ONE: Fixed-point scaling factor (1e18) for ERC-20 token arithmetic.
 * - REWARD_POOL / DEC25_REWARD_POOL: Total reward pools per distribution period.
 * - CSV column headers: Match the format expected by the Flare rNat distribution tool.
 */
```

---

## Summary

| ID | Severity | Line(s) | Finding |
|----|----------|---------|---------|
| A02-1 | Critical | 3 | `REWARD_POOL` loses 8,388,608 wei due to float-to-BigInt precision loss; no documentation of intended value |
| A02-2 | High | 1 | `ONE` uses fragile `BigInt(Number)` pattern; happens to be correct but undocumented |
| A02-3 | High | 4 | `DEC25_REWARD_POOL` has no documentation explaining its purpose or relationship to `REWARD_POOL` |
| A02-4 | Low | 6-7 | CSV comment is accurate but ambiguous in scope (rewards vs diff headers) |
| A02-5 | Low | -- | No file-level documentation |

**Critical/High findings: 3 | Low findings: 2 | Total: 5**
