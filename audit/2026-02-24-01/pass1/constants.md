# Security Audit -- Pass 1 (Security)

**File:** `src/constants.ts`
**Auditor:** A02
**Date:** 2026-02-24

---

## 1. Evidence of Thorough Reading

**Module:** `src/constants.ts` (13 lines, no imports, pure constant definitions)

| Line | Export | Type | Value |
|------|--------|------|-------|
| 1 | `ONE` | `bigint` | `BigInt(10 ** 18)` |
| 3 | `REWARD_POOL` | `bigint` | `BigInt(500000000000000000000000)` |
| 4 | `DEC25_REWARD_POOL` | `bigint` (const-asserted) | `1_000_000_000_000_000_000_000_000n` |
| 8 | `REWARDS_CSV_COLUMN_HEADER_ADDRESS` | `string` | `"recipient address"` |
| 9 | `REWARDS_CSV_COLUMN_HEADER_REWARD` | `string` | `"amount wei"` |
| 10 | `DIFF_CSV_COLUMN_HEADER_OLD` | `string` | `"old"` |
| 11 | `DIFF_CSV_COLUMN_HEADER_NEW` | `string` | `"new"` |
| 12 | `DIFF_CSV_COLUMN_HEADER_DIFF` | `string` | `"diff"` |

Lines 6-7 contain a comment referencing the expected CSV structure for Flare's RNAT distribution tool.

---

## 2. Findings

### A02-1: `REWARD_POOL` uses Number-to-BigInt conversion with precision loss (CRITICAL)

**Location:** `src/constants.ts`, line 3

**Code:**
```typescript
export const REWARD_POOL = BigInt(500000000000000000000000);
```

**Issue:** The numeric literal `500000000000000000000000` (5 * 10^23) exceeds `Number.MAX_SAFE_INTEGER` (2^53 - 1 = 9007199254740991). When JavaScript evaluates this expression, it first creates the Number `500000000000000000000000`, which cannot be exactly represented in IEEE 754 float64. The resulting float is then passed to `BigInt()`.

**Verified empirically:**
```
BigInt(500000000000000000000000)  => 499999999999999991611392n
500_000_000_000_000_000_000_000n => 500000000000000000000000n
Difference: -8388608  (approximately -8.39 million wei)
```

The actual value stored in `REWARD_POOL` is **499,999,999,999,999,991,611,392** -- roughly **8.39 million wei less** than the intended 500,000 * 10^18.

**Impact:** `REWARD_POOL` is actively used in `src/index.ts` (line 162) as the total reward pool passed to `processor.calculateRewards()`. This means every reward calculation based on this constant distributes approximately 8,388,608 wei fewer tokens than intended. While 8.39 million wei is a negligibly small fraction of 500,000 tokens (about 0.0000000000000017%), this represents a silent correctness bug. The discrepancy would propagate to all per-address reward calculations and the "Difference" check logged at `src/index.ts` line 238.

**Recommendation:** Use a BigInt literal, consistent with how `DEC25_REWARD_POOL` is already written on line 4:
```typescript
export const REWARD_POOL = 500_000_000_000_000_000_000_000n;
```

---

### A02-2: `ONE` uses Number-to-BigInt conversion via intermediate float (LOW)

**Location:** `src/constants.ts`, line 1

**Code:**
```typescript
export const ONE = BigInt(10 ** 18);
```

**Issue:** The expression `10 ** 18` is evaluated as a JavaScript Number before being passed to `BigInt()`. The value 10^18 (1,000,000,000,000,000,000) exceeds `Number.MAX_SAFE_INTEGER`, so this pattern is generally unsafe.

**However**, empirical verification confirms that `10^18` is **exactly representable** in IEEE 754 float64. The value 10^18 in binary has only 42 significant bits (the remaining 18 low-order bits are trailing zeros), which fits within float64's 53-bit mantissa. Thus:
```
BigInt(10 ** 18) === 10n ** 18n  =>  true (both equal 1000000000000000000n)
```

**Impact:** No actual precision loss occurs. The result is numerically correct. However, the pattern is fragile and misleading -- a reader or future maintainer cannot tell at a glance whether this is safe. It also violates the principle of least surprise and is inconsistent with the safer BigInt-literal style used for `DEC25_REWARD_POOL`.

**Recommendation:** Use a BigInt literal or BigInt exponentiation for clarity and safety:
```typescript
export const ONE = 10n ** 18n;
// or
export const ONE = 1_000_000_000_000_000_000n;
```

---

### A02-3: Inconsistent BigInt construction patterns across constants (INFO)

**Location:** `src/constants.ts`, lines 1, 3, 4

**Issue:** Three different BigInt construction patterns are used within a single file:
- Line 1: `BigInt(10 ** 18)` -- Number arithmetic, then conversion (unsafe pattern, happens to work)
- Line 3: `BigInt(500000000000000000000000)` -- Number literal conversion (actively broken)
- Line 4: `1_000_000_000_000_000_000_000_000n` -- BigInt literal with numeric separators (correct)

The inconsistency suggests the code evolved over time. `DEC25_REWARD_POOL` was written correctly, likely by someone aware of the precision issue, but the older constants were not updated.

**Recommendation:** Standardize all BigInt constants to use the `n` suffix literal form with underscore separators for readability.

---

## 3. Summary

| ID | Severity | Title | Status |
|----|----------|-------|--------|
| A02-1 | **CRITICAL** | `REWARD_POOL` loses 8,388,608 wei due to float64 precision loss in Number-to-BigInt conversion | Open |
| A02-2 | **LOW** | `ONE` uses unsafe Number-to-BigInt pattern (happens to be correct but is fragile) | Open |
| A02-3 | **INFO** | Inconsistent BigInt construction patterns across the file | Open |

**Note on A02-1 severity:** While the absolute magnitude of the error (~8.4 million wei) is financially trivial for an 18-decimal token, this is classified as CRITICAL because: (1) it is a silent, non-obvious correctness bug in a financial calculation, (2) it affects every reward distribution that uses `REWARD_POOL`, (3) it is trivially fixable, and (4) the project's own CI enforces deterministic reproducibility, meaning any undiscovered precision error undermines the integrity guarantee the project is designed to provide.
