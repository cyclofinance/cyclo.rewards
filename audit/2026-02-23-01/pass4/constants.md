# Audit Pass 4 — Code Quality: `src/constants.ts`

**Auditor:** A02
**Date:** 2026-02-23
**Audit ID:** 2026-02-23-01
**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/constants.ts`

---

## Findings

### A02-1 — CRITICAL — `REWARD_POOL` loses precision due to Number-to-BigInt conversion

**Line 2:**
```ts
export const REWARD_POOL = BigInt(1000000000000000000000000);
```

The numeric literal `1000000000000000000000000` (10^24) exceeds `Number.MAX_SAFE_INTEGER` (approximately 9 x 10^15). JavaScript first parses this as a `Number`, losing precision, and then converts the imprecise value to `BigInt`. The actual runtime value is:

```
999999999999999983222784n   // actual
1000000000000000000000000n  // intended
```

This is a difference of `16777216` wei (approximately 1.68 x 10^-11 tokens). While the absolute error is small relative to the pool, this is a correctness bug in a financial calculation context. The reward pool is silently ~16.8 million wei less than intended.

**Verified empirically:**
```js
BigInt(1000000000000000000000000) === 1000000000000000000000000n  // false
```

**Recommended fix:** Use a BigInt literal or string constructor:
```ts
export const REWARD_POOL = 1_000_000_000_000_000_000_000_000n;
// or
export const REWARD_POOL = BigInt("1000000000000000000000000");
// or, most readable:
export const REWARD_POOL = 1_000_000n * 10n ** 18n;
```

### A02-2 — LOW — `ONE` uses a fragile pattern that happens to work

**Line 1:**
```ts
export const ONE = BigInt(10 ** 18);
```

This works correctly because `10 ** 18` (10^18) is exactly representable as an IEEE 754 double (since `5^18` fits in 53 bits of mantissa). However, the pattern is fragile and misleading -- it looks identical to the broken `REWARD_POOL` pattern on line 2. A reader or maintainer cannot easily tell which `BigInt(numericLiteral)` calls are safe and which are not.

**Recommended fix:** Use a BigInt literal for consistency and clarity:
```ts
export const ONE = 10n ** 18n;
```

This eliminates the need to reason about floating-point precision entirely and makes the intent unambiguous.

### A02-3 — INFO — Test file shadows `ONE` with a string instead of importing it

In `src/processor.test.ts` (line 22), the test defines its own local `ONE`:
```ts
const ONE = "1000000000000000000";
```

This is a string (used where transfer values are strings), and a separate `ONEn = 1000000000000000000n` BigInt literal (line 23). Neither imports from `constants.ts`. This is acceptable since the test needs a string representation and a BigInt literal, neither of which matches the exported `BigInt(10 ** 18)` type. However, if `ONE` in `constants.ts` were fixed to use `10n ** 18n`, the test could import and use `ONE` directly as the BigInt, improving coupling between source and test.

### A02-4 — INFO — Numeric underscore separators would improve readability

The `REWARD_POOL` value `1000000000000000000000000` is 25 digits with no visual structure. Even after fixing the precision bug (A02-1), using underscore separators improves readability:

```ts
export const REWARD_POOL = 1_000_000_000_000_000_000_000_000n;
// or
export const REWARD_POOL = 1_000_000n * 10n ** 18n;  // 1M tokens in wei
```

The latter form (`1_000_000n * 10n ** 18n`) is self-documenting: it clearly expresses "one million tokens, each with 18 decimals."

### A02-5 — INFO — CSV column header constants are well-structured

Lines 4-10 define CSV column header constants with a clear comment linking to the expected upstream format specification. The naming convention `{FORMAT}_CSV_COLUMN_HEADER_{FIELD}` is consistent and descriptive. All constants are used in the codebase (`src/index.ts`, `src/diffCalculator.ts`, and their tests). No dead code found among these.

### A02-6 — INFO — CLAUDE.md documentation is slightly inaccurate

`CLAUDE.md` (line 38) describes `REWARD_POOL` as "(1M tokens as BigInt)". Due to finding A02-1, the actual runtime value is not exactly 1M tokens. This documentation should be updated after the fix is applied, but is otherwise a reasonable description of intent.

---

## Summary

| ID | Severity | Title |
|----|----------|-------|
| A02-1 | CRITICAL | `REWARD_POOL` loses precision due to Number-to-BigInt conversion |
| A02-2 | LOW | `ONE` uses a fragile pattern that happens to work |
| A02-3 | INFO | Test file shadows `ONE` with a string instead of importing it |
| A02-4 | INFO | Numeric underscore separators would improve readability |
| A02-5 | INFO | CSV column header constants are well-structured |
| A02-6 | INFO | CLAUDE.md documentation is slightly inaccurate |

**Critical findings:** 1
**Actionable findings:** 2 (A02-1, A02-2)
**Informational findings:** 4

The file is small (11 lines) and generally well-organized. The single critical finding (A02-1) is a genuine precision bug where `REWARD_POOL` is silently ~16.8 million wei less than intended due to floating-point intermediate representation. This should be fixed by using a BigInt literal (`n` suffix) or string-based `BigInt()` constructor.
