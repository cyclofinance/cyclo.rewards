# A02 -- Code Quality Audit: `src/constants.ts`

**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/constants.ts`
**Lines:** 13
**Audit date:** 2026-02-24
**Pass:** 4 (Code Quality)

---

## Findings

### A02-1 -- MEDIUM -- Three different BigInt construction idioms in a 4-line span

**Location:** Lines 1, 3, 4

**Description:** The file uses three distinct methods for constructing BigInt constants within 4 lines:

```typescript
export const ONE = BigInt(10 ** 18);                                    // BigInt() with JS arithmetic
export const REWARD_POOL = BigInt(500000000000000000000000);             // BigInt() with numeric literal
export const DEC25_REWARD_POOL = 1_000_000_000_000_000_000_000_000n as const;  // BigInt literal with underscores
```

**Idiom 1 (line 1):** `BigInt(10 ** 18)` -- Uses JavaScript `Number` arithmetic *inside* the `BigInt()` call. This works because `10 ** 18 = 1e18` which is within `Number.MAX_SAFE_INTEGER` (approximately `9e15`). Wait -- `10 ** 18 = 1e18` which is `1000000000000000000`. `Number.MAX_SAFE_INTEGER` is `9007199254740991` (approximately `9.007e15`). Therefore `10 ** 18` (which is `1e18`) exceeds `Number.MAX_SAFE_INTEGER` and may lose precision before being passed to `BigInt()`. In practice, `10 ** 18` is an exact power of 2 times 5^18, and JavaScript can represent it exactly as a float because it is within the range of IEEE 754 doubles. However, this pattern is fragile and would silently produce wrong results for values like `BigInt(10 ** 19 + 1)`.

**Idiom 2 (line 3):** `BigInt(500000000000000000000000)` -- Passes a numeric literal directly to `BigInt()`. The value `5e23` exceeds `Number.MAX_SAFE_INTEGER`. However, `5e23` is `5 * 10^23` which can be represented exactly as a double (it is `5 * 2^23 * 5^23`... actually, any power of 10 up to `10^22` is exact, but `5 * 10^23` may not be). This is the most dangerous idiom because precision loss is silent.

**Idiom 3 (line 4):** `1_000_000_000_000_000_000_000_000n` -- Native BigInt literal with underscore separators. This is the safest and most readable approach.

**Recommendation:** Standardize on the BigInt literal syntax (`...n`) for all constants. Replace:

```typescript
export const ONE = 1_000_000_000_000_000_000n;
export const REWARD_POOL = 500_000_000_000_000_000_000_000n;
export const DEC25_REWARD_POOL = 1_000_000_000_000_000_000_000_000n;
```

This eliminates any risk of `Number` precision loss and is visually consistent.

---

### A02-2 -- MEDIUM -- `REWARD_POOL` may have silent precision loss

**Location:** Line 3

**Description:** Expanding on A02-1, the specific concern with `BigInt(500000000000000000000000)`:

```typescript
export const REWARD_POOL = BigInt(500000000000000000000000);
```

The numeric literal `500000000000000000000000` has 24 significant digits. `Number.MAX_SAFE_INTEGER` is `2^53 - 1 = 9007199254740991` (16 digits). The value `5e23` is `500000000000000000000000`. As a floating-point double, this number is representable exactly because it equals `5 * 10^23 = 5 * (2 * 5)^23 = 5^24 * 2^23`, and `5^24 = 59604644775390625` which is within 2^56, so the full product fits in a double. So in this specific case there is no actual precision loss.

However, the pattern is dangerous because a future developer modifying the value (e.g., to `500000000000000000000001`) would silently lose the trailing `1`. TypeScript/JavaScript do not warn about this.

**Recommendation:** Use BigInt literal syntax: `500_000_000_000_000_000_000_000n`.

---

### A02-3 -- LOW -- `ONE` naming is ambiguous

**Location:** Line 1

**Description:** The constant `ONE` represents `1e18` (1 token in 18-decimal fixed-point). The name `ONE` does not convey that it represents a scaling factor or a fixed-point unit. In a file with `REWARD_POOL` (which represents 500K tokens in wei), a reader might expect `ONE` to be `1n` or `BigInt(1)`.

It is used in `processor.ts` line 419 as a scaling factor:

```typescript
(sumOfAllBalances * ONE) / ...
```

A more descriptive name like `ONE_TOKEN_18`, `DECIMALS_FACTOR`, or `WEI_PER_TOKEN` would be self-documenting.

**Recommendation:** Consider renaming to `ONE_TOKEN` or `FIXED_POINT_ONE` to clarify its purpose.

---

### A02-4 -- LOW -- `as const` used inconsistently

**Location:** Line 4

**Description:** `DEC25_REWARD_POOL` uses `as const` assertion while `REWARD_POOL` and `ONE` do not:

```typescript
export const ONE = BigInt(10 ** 18);                                     // no `as const`
export const REWARD_POOL = BigInt(500000000000000000000000);              // no `as const`
export const DEC25_REWARD_POOL = 1_000_000_000_000_000_000_000_000n as const;  // has `as const`
```

For BigInt literals, `as const` narrows the type from `bigint` to the specific literal type (e.g., `1000000000000000000000000n`). The other two constants cannot use `as const` because `BigInt()` returns `bigint` (not a literal type). This is an artifact of the inconsistent construction idioms (A02-1). If all three used `...n` literal syntax, all three could consistently use `as const`.

**Recommendation:** After converting to `...n` literals (per A02-1), apply or remove `as const` consistently across all three.

---

### A02-5 -- LOW -- Naming convention inconsistency: `DEC25_REWARD_POOL` embeds a date

**Location:** Line 4

**Description:** `DEC25_REWARD_POOL` embeds a specific date reference ("Dec 2025") in the constant name, while `REWARD_POOL` does not. This creates an asymmetry: when a new reward pool is needed for a different period, the naming pattern is unclear. Does `REWARD_POOL` refer to a specific period? Is it deprecated in favor of `DEC25_REWARD_POOL`?

Examining usage: `REWARD_POOL` is used in `index.ts` for the main rewards calculation pipeline, while `DEC25_REWARD_POOL` is used in `diffCalculator.ts` and its tests for the diff calculation. Both are active and used in production code paths.

**Recommendation:** Add a comment to each constant clarifying which epoch/period it applies to, or adopt a consistent naming scheme (e.g., both include the period, or neither does with the period specified in a comment).

---

### A02-6 -- INFO -- No JSDoc comments on any export

**Location:** All lines

**Description:** None of the 7 exported constants have JSDoc documentation. The only documentation is the inline comment on line 7 referencing the Flare Foundation CSV format spec. Constants like `ONE`, `REWARD_POOL`, and the CSV column headers would benefit from brief JSDoc comments explaining their purpose and units.

Compare to `config.ts` which has JSDoc on `generateSnapshotBlocks` and `scaleTo18`.

**Recommendation:** Add brief JSDoc comments, especially for `ONE` (units, purpose) and the two reward pool constants (period, denomination).

---

## Style Consistency Observations

| Aspect | Pattern in constants.ts | Pattern in config.ts | Pattern in types.ts |
|---|---|---|---|
| Indentation | 2-space (implicit, file too short to demonstrate) | Mixed 2/4-space | 2-space |
| JSDoc | None | Present on functions | None |
| Semicolons | Present on all lines | Present | Present (interfaces use `;`) |
| `as const` | On 1 of 3 BigInt constants | Not applicable | Not applicable |
| BigInt construction | 3 different idioms | String concatenation `BigInt("1" + ...)` | Not applicable |

---

## Summary Table

| ID | Severity | Category | Description |
|---|---|---|---|
| A02-1 | MEDIUM | Style / safety | Three different BigInt construction idioms in 4 lines |
| A02-2 | MEDIUM | Precision risk | `REWARD_POOL` uses `BigInt()` with a large numeric literal |
| A02-3 | LOW | Naming | `ONE` is ambiguous; does not convey fixed-point scaling purpose |
| A02-4 | LOW | Style | `as const` applied inconsistently |
| A02-5 | LOW | Naming | `DEC25_REWARD_POOL` embeds a date; `REWARD_POOL` does not |
| A02-6 | INFO | Documentation | No JSDoc on any export |
