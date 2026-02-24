# Security Audit: `src/constants.ts`

**Auditor:** A02
**Date:** 2026-02-22
**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/constants.ts`

## Evidence of Thorough Reading

**Module:** `src/constants.ts` (2 lines, no imports, no functions, no types/interfaces/errors)

### Constants Defined

| Name | Line | Value |
|------|------|-------|
| `ONE` | 1 | `BigInt(10 ** 18)` -- equals `1000000000000000000n` (1e18) |
| `REWARD_POOL` | 2 | `BigInt(1000000000000000000000000)` -- equals `1000000000000000000000000n` (1e24, i.e., 1M tokens at 18 decimals) |

### Functions/Methods

None.

### Types/Interfaces/Errors

None.

### Exports

Both constants are exported (`export const`).

## Usage Context

- `ONE` is used in `src/processor.ts` (line 355) as a scaling factor for fixed-point arithmetic in reward calculations.
- `REWARD_POOL` is used in `src/index.ts` (lines 157, 232-233) and `src/diffCalculator.ts` (line 80) to define the total reward pool size for distribution.

## Security Findings

### A02-1: Fragile BigInt Construction from Floating-Point Intermediate (LOW)

**Location:** Line 1
**Code:** `export const ONE = BigInt(10 ** 18);`

**Description:** The expression `10 ** 18` is first evaluated as a JavaScript `Number` (IEEE 754 float64) and the result is then converted to `BigInt`. The value `10**18` (1e18) exceeds `Number.MAX_SAFE_INTEGER` (2^53 - 1 = 9007199254740991).

**However**, `10^18` is exactly representable as a float64 because its odd factor `5^18 = 3814697265625` fits within 53 bits of mantissa (5^18 < 2^53), so the float representation is exact. The resulting BigInt value is correct: `1000000000000000000n`.

**The risk is a maintenance hazard:** this pattern would silently produce an incorrect value if the exponent were changed to certain other values (e.g., `10 ** 19` where `5^19` exceeds 2^53, or non-power-of-10 bases). A developer modifying this line might not realize the intermediate float precision constraint.

**Recommendation:** Use BigInt-native exponentiation to eliminate the float intermediate entirely:
```typescript
export const ONE = 10n ** 18n;
```

**Severity:** LOW -- the current value is correct, but the pattern is a latent maintenance risk.

---

### A02-2: REWARD_POOL Constructed via Numeric Literal Exceeding MAX_SAFE_INTEGER (LOW)

**Location:** Line 2
**Code:** `export const REWARD_POOL = BigInt(1000000000000000000000000);`

**Description:** The literal `1000000000000000000000000` (1e24) is first parsed as a JavaScript `Number`, then converted to `BigInt`. Like A02-1, this specific value (`10^24`) happens to be exactly representable as a float64 because `5^24 = 59604644775390625` fits in 53 bits (5^24 < 2^53). So the conversion is correct.

However, the same maintenance hazard applies: it is non-obvious that this works correctly, and a manual edit to the literal (e.g., adding or removing a zero, or changing to a non-round number) could silently produce an incorrect value due to float precision loss.

Additionally, the intent of the value is obscured. A reader must manually count 24 zeros to understand this represents 1,000,000 * 10^18.

**Recommendation:** Use BigInt-native syntax to make the intent clear and eliminate float precision risk:
```typescript
export const REWARD_POOL = 1_000_000n * 10n ** 18n;
```
Or use a string literal:
```typescript
export const REWARD_POOL = BigInt("1000000000000000000000000");
```

**Severity:** LOW -- the current value is correct, but readability and maintainability would benefit from BigInt-native construction.

---

## Summary

| ID | Severity | Title |
|----|----------|-------|
| A02-1 | LOW | Fragile BigInt construction from floating-point intermediate (`ONE`) |
| A02-2 | LOW | REWARD_POOL constructed via numeric literal exceeding MAX_SAFE_INTEGER |

No CRITICAL, HIGH, or MEDIUM findings. The file is minimal (2 lines, 2 constants) with a small and well-defined attack surface. Both constants produce correct values at present, but the construction patterns introduce unnecessary coupling to IEEE 754 float precision semantics that could become a source of silent bugs under maintenance.
