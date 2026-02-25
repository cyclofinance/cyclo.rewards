# Security Audit -- Pass 2 (Test Coverage)

**File:** `src/constants.ts`
**Auditor:** A02
**Date:** 2026-02-24

---

## 1. Evidence of Thorough Reading

**Module:** `src/constants.ts` (13 lines, no imports, pure constant definitions)

| Line | Export | Type | Value (as written) |
|------|--------|------|---------------------|
| 1 | `ONE` | `bigint` | `BigInt(10 ** 18)` |
| 3 | `REWARD_POOL` | `bigint` | `BigInt(500000000000000000000000)` |
| 4 | `DEC25_REWARD_POOL` | `bigint` (const-asserted) | `1_000_000_000_000_000_000_000_000n` |
| 8 | `REWARDS_CSV_COLUMN_HEADER_ADDRESS` | `string` | `"recipient address"` |
| 9 | `REWARDS_CSV_COLUMN_HEADER_REWARD` | `string` | `"amount wei"` |
| 10 | `DIFF_CSV_COLUMN_HEADER_OLD` | `string` | `"old"` |
| 11 | `DIFF_CSV_COLUMN_HEADER_NEW` | `string` | `"new"` |
| 12 | `DIFF_CSV_COLUMN_HEADER_DIFF` | `string` | `"diff"` |

---

## 2. Per-Export Test Coverage Analysis

### 2.1 `ONE` (line 1)

**Directly tested:** NO
**Imported in tests:** NO -- The constant is NOT imported from `./constants` in any test file.

**Indirect usage:** `src/processor.test.ts` defines a local shadow variable at line 22:
```typescript
const ONE = "1000000000000000000";
const ONEn = 1000000000000000000n;
```
This local `ONE` is a string `"1000000000000000000"`, not the BigInt from `src/constants.ts`. The test uses this local value to construct mock transfer `value` fields. It does NOT import or validate the actual `ONE` constant from the source.

**Production usage:** `ONE` is imported and used in `src/processor.ts` (line 21, used at line 419) as a scaling factor for reward calculations.

**Coverage gap:** There is no test that:
- Imports `ONE` from `src/constants.ts`
- Asserts its numeric value equals `1_000_000_000_000_000_000n` (10^18)
- Validates that `BigInt(10 ** 18)` produces the correct result

**Risk assessment (for `ONE`):** LOW. As documented in Pass 1 (A02-2), `10 ** 18` happens to be exactly representable in IEEE 754 float64, so the value is numerically correct. However, there is no regression test to catch a hypothetical future change (e.g., if someone changed the exponent).

---

### 2.2 `REWARD_POOL` (line 3)

**Directly tested:** NO
**Imported in tests:** NO -- `REWARD_POOL` is not imported in any test file.

**Indirect usage:** `src/processor.test.ts` calls `processor.calculateRewards(rewardPool)` at lines 458, 598, and 731, but passes `ONEn` (the local `1000000000000000000n`) as the reward pool, NOT the actual `REWARD_POOL` constant.

**Production usage:** `REWARD_POOL` is imported in `src/index.ts` (line 5) and used at:
- Line 162: `processor.calculateRewards(REWARD_POOL)` -- the core reward distribution calculation
- Line 237-238: Logging and difference check

**Coverage gap -- CRITICAL:** There is no test that:
- Imports `REWARD_POOL` from `src/constants.ts`
- Asserts its value equals the intended `500_000_000_000_000_000_000_000n` (500,000 * 10^18)
- Detects the known precision loss from `BigInt(Number)` conversion

**The known bug is undetected by tests.** As documented in Pass 1 (A02-1):
```
BigInt(500000000000000000000000)  evaluates to  499999999999999991611392n
Intended value:                                 500000000000000000000000n
Difference:                                     -8,388,608 wei
```

The literal `500000000000000000000000` exceeds `Number.MAX_SAFE_INTEGER` (9,007,199,254,740,991). JavaScript first parses it as a float64, losing precision, then passes the imprecise Number to `BigInt()`. A simple value-assertion test would catch this:

```typescript
import { REWARD_POOL } from './constants';
it('REWARD_POOL equals 500,000 tokens in wei', () => {
  expect(REWARD_POOL).toBe(500_000n * 10n ** 18n);
});
```

This test would FAIL with the current code, exposing the bug.

---

### 2.3 `DEC25_REWARD_POOL` (line 4)

**Directly tested:** PARTIAL (used as a bound, not value-asserted)
**Imported in tests:** YES -- `src/diffCalculatorOutput.test.ts` line 4.

**Test references:**
- Line 59-63: `'new rewards total is at most DEC25_REWARD_POOL (within rounding)'` -- asserts that the sum of all new rewards is <= `DEC25_REWARD_POOL` and that the gap is < `DEC25_REWARD_POOL / 1000000n`.
- Line 137: Used to compute `remainingPool = DEC25_REWARD_POOL - totalDistributed`.
- Line 142-146: `'old distributed total + covered total <= DEC25_REWARD_POOL'` -- asserts a bound.

**Coverage gap:** The constant is used as an upper bound in inequality checks, but no test asserts the literal value:
```typescript
expect(DEC25_REWARD_POOL).toBe(1_000_000_000_000_000_000_000_000n);
```

**Risk assessment:** LOW. The constant is already defined using the safe BigInt literal syntax (`1_000_000_000_000_000_000_000_000n as const`), so it is not subject to the same precision-loss bug as `REWARD_POOL`. A value-assertion test would still be good practice but is not critical.

---

### 2.4 `REWARDS_CSV_COLUMN_HEADER_ADDRESS` (line 8)

**Directly tested:** YES (indirectly validated)
**Imported in tests:** YES -- `src/diffCalculator.test.ts` line 24.

**Test references:**
- Line 26: Used to construct `header = REWARDS_CSV_COLUMN_HEADER_ADDRESS + ',' + REWARDS_CSV_COLUMN_HEADER_REWARD`
- Line 28-32: The test `'hoisted header should match header constants'` validates that the header constructed from constants matches the hardcoded header in the hoisted mock CSV.
- Line 393: Used to construct the rewards header in further tests.

**Coverage assessment:** ADEQUATE. The test validates the constant is used correctly in CSV construction and matches the expected format.

---

### 2.5 `REWARDS_CSV_COLUMN_HEADER_REWARD` (line 9)

**Directly tested:** YES (indirectly validated alongside `_ADDRESS`)
**Imported in tests:** YES -- `src/diffCalculator.test.ts` line 24.

**Test references:** Same as `REWARDS_CSV_COLUMN_HEADER_ADDRESS` above (lines 26, 28-32, 393).

**Coverage assessment:** ADEQUATE.

---

### 2.6 `DIFF_CSV_COLUMN_HEADER_OLD` (line 10)

**Directly tested:** PARTIAL (used in header construction, not value-asserted)
**Imported in tests:** YES -- `src/diffCalculator.test.ts` line 24.

**Test references:**
- Line 394: Used to construct `diffHeader = REWARDS_CSV_COLUMN_HEADER_ADDRESS + "," + DIFF_CSV_COLUMN_HEADER_OLD + "," + DIFF_CSV_COLUMN_HEADER_NEW + "," + DIFF_CSV_COLUMN_HEADER_DIFF`

**Coverage assessment:** PARTIAL. Used in header construction for tests but no assertion that the value equals the string `"old"`.

---

### 2.7 `DIFF_CSV_COLUMN_HEADER_NEW` (line 11)

**Directly tested:** PARTIAL (same situation as `_OLD`)
**Imported in tests:** YES -- `src/diffCalculator.test.ts` line 24.

**Coverage assessment:** PARTIAL. Same as `DIFF_CSV_COLUMN_HEADER_OLD`.

---

### 2.8 `DIFF_CSV_COLUMN_HEADER_DIFF` (line 12)

**Directly tested:** PARTIAL (same situation as `_OLD`)
**Imported in tests:** YES -- `src/diffCalculator.test.ts` line 24.

**Coverage assessment:** PARTIAL. Same as `DIFF_CSV_COLUMN_HEADER_OLD`.

---

## 3. Coverage Summary

| Export | Imported in Tests | Value Asserted | Functionally Tested | Gap Severity |
|--------|-------------------|----------------|---------------------|--------------|
| `ONE` | NO | NO | NO (local shadow used) | MEDIUM |
| `REWARD_POOL` | NO | NO | NO | **CRITICAL** |
| `DEC25_REWARD_POOL` | YES | NO | YES (as bound) | LOW |
| `REWARDS_CSV_COLUMN_HEADER_ADDRESS` | YES | YES (via match) | YES | None |
| `REWARDS_CSV_COLUMN_HEADER_REWARD` | YES | YES (via match) | YES | None |
| `DIFF_CSV_COLUMN_HEADER_OLD` | YES | NO | YES (in header) | LOW |
| `DIFF_CSV_COLUMN_HEADER_NEW` | YES | NO | YES (in header) | LOW |
| `DIFF_CSV_COLUMN_HEADER_DIFF` | YES | NO | YES (in header) | LOW |

---

## 4. Findings

### A02-P2-1: No test detects REWARD_POOL precision loss (CRITICAL)

**Relates to:** Pass 1 finding A02-1

The known precision-loss bug in `REWARD_POOL` (actual value `499999999999999991611392n` vs intended `500000000000000000000000n`, a difference of 8,388,608 wei) has **zero test coverage**. The constant is not imported in any test file.

The processor test suite at `src/processor.test.ts` exercises `calculateRewards()` but passes a local `ONEn = 1000000000000000000n` literal as the reward pool, completely bypassing the buggy constant.

The output-level test at `src/diffCalculatorOutput.test.ts` tests against `DEC25_REWARD_POOL` (which is correct), not `REWARD_POOL`.

A value-assertion test is trivial to write and would immediately catch the bug:
```typescript
import { REWARD_POOL } from './constants';
expect(REWARD_POOL).toBe(500_000n * 10n ** 18n); // WOULD FAIL
```

---

### A02-P2-2: ONE constant is not imported or tested from source (MEDIUM)

**Relates to:** Pass 1 finding A02-2

`ONE` from `src/constants.ts` is used in production code (`src/processor.ts` line 419) as a critical scaling factor in reward calculations. However, no test imports `ONE` from the constants module.

`src/processor.test.ts` defines a local shadow `const ONE = "1000000000000000000"` (string) and `const ONEn = 1000000000000000000n` (BigInt literal) that happen to match the production value. If the production `ONE` were ever changed or corrupted, no test would detect the discrepancy because the test uses its own independent definition.

While `BigInt(10 ** 18)` is currently numerically correct (10^18 happens to be exactly representable in float64), this is non-obvious and fragile. A test asserting `ONE === 10n ** 18n` would document the expectation and catch any future regression.

---

### A02-P2-3: No dedicated constants.test.ts file (INFO)

There is no `src/constants.test.ts` file. All constant coverage is incidental -- constants are imported only for use in testing other modules (diffCalculator, diffCalculatorOutput), never as direct test subjects.

For a financial system where constant values directly determine token distributions, a dedicated test file asserting every exported constant's exact value would be standard practice. This would serve as both documentation and a regression safety net.

**Recommended test file:**
```typescript
// src/constants.test.ts
import { describe, it, expect } from 'vitest';
import {
  ONE,
  REWARD_POOL,
  DEC25_REWARD_POOL,
  REWARDS_CSV_COLUMN_HEADER_ADDRESS,
  REWARDS_CSV_COLUMN_HEADER_REWARD,
  DIFF_CSV_COLUMN_HEADER_OLD,
  DIFF_CSV_COLUMN_HEADER_NEW,
  DIFF_CSV_COLUMN_HEADER_DIFF,
} from './constants';

describe('constants', () => {
  it('ONE equals 10^18', () => {
    expect(ONE).toBe(10n ** 18n);
  });

  it('REWARD_POOL equals 500,000 tokens in wei', () => {
    expect(REWARD_POOL).toBe(500_000n * 10n ** 18n);
    // ^^^ THIS WOULD CURRENTLY FAIL -- exposing the precision bug
  });

  it('DEC25_REWARD_POOL equals 1,000,000 tokens in wei', () => {
    expect(DEC25_REWARD_POOL).toBe(1_000_000n * 10n ** 18n);
  });

  it('CSV column headers match expected strings', () => {
    expect(REWARDS_CSV_COLUMN_HEADER_ADDRESS).toBe('recipient address');
    expect(REWARDS_CSV_COLUMN_HEADER_REWARD).toBe('amount wei');
    expect(DIFF_CSV_COLUMN_HEADER_OLD).toBe('old');
    expect(DIFF_CSV_COLUMN_HEADER_NEW).toBe('new');
    expect(DIFF_CSV_COLUMN_HEADER_DIFF).toBe('diff');
  });
});
```

---

## 5. Conclusion

The most significant finding is **A02-P2-1**: the `REWARD_POOL` precision-loss bug identified in Pass 1 has no test coverage whatsoever. This is a case where a single, simple value-assertion test would have caught a silent financial calculation error at the time it was introduced.

The test suite's coverage of `src/constants.ts` is best described as **incidental rather than intentional**. Constants that happen to be needed for test setup (`DEC25_REWARD_POOL`, CSV headers) get imported, but no test file exists that treats the constants module as a unit under test. The two most numerically critical constants (`ONE` and `REWARD_POOL`) are either shadowed by local test definitions or completely untested.

| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| A02-P2-1 | **CRITICAL** | `REWARD_POOL` precision-loss bug has zero test coverage | Open |
| A02-P2-2 | **MEDIUM** | `ONE` is not imported from source in any test; local shadow used instead | Open |
| A02-P2-3 | **INFO** | No dedicated `constants.test.ts` file for value assertions | Open |
