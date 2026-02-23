# Pass 3 (Documentation) -- `src/constants.ts`

**Audit:** 2026-02-23-01
**Agent:** A02
**File reviewed:** `src/constants.ts` (11 lines)

## Exported Constants

| Line | Name | Value | Has Documentation |
|------|------|-------|-------------------|
| 1 | `ONE` | `BigInt(10 ** 18)` | No |
| 2 | `REWARD_POOL` | `BigInt(1000000000000000000000000)` | No |
| 6 | `REWARDS_CSV_COLUMN_HEADER_ADDRESS` | `"recipient address"` | Yes (comment block on lines 4-5) |
| 7 | `REWARDS_CSV_COLUMN_HEADER_REWARD` | `"amount wei"` | Yes (comment block on lines 4-5) |
| 8 | `DIFF_CSV_COLUMN_HEADER_OLD` | `"old"` | Yes (covered by comment block on lines 4-5) |
| 9 | `DIFF_CSV_COLUMN_HEADER_NEW` | `"new"` | Yes (covered by comment block on lines 4-5) |
| 10 | `DIFF_CSV_COLUMN_HEADER_DIFF` | `"diff"` | Yes (covered by comment block on lines 4-5) |

## Existing Comments

1. **Lines 4-5:** `// Must match expected structure` followed by a URL reference to the Flare Foundation rnat-distribution-tool README section on CSV format: `https://github.com/flare-foundation/rnat-distribution-tool/blob/main/README.md#add-csv-file-with-rewards-data`

## Findings

### A02-1 -- LOW -- `ONE` has no documentation

**Location:** `src/constants.ts` line 1

**Code:**
```typescript
export const ONE = BigInt(10 ** 18);
```

`ONE` is exported without any JSDoc or inline comment. It represents the standard EVM 18-decimal scaling factor (1e18), commonly used to convert between human-readable token amounts and their on-chain wei representation. There is no documentation explaining:
- What `ONE` represents (1 token in wei, i.e., 10^18)
- Why it exists (EVM tokens typically use 18 decimal places)
- Its units (wei)

This is a widely understood EVM convention, so the severity is low, but a brief comment would help readers unfamiliar with the pattern.

### A02-2 -- LOW -- `REWARD_POOL` has no documentation

**Location:** `src/constants.ts` line 2

**Code:**
```typescript
export const REWARD_POOL = BigInt(1000000000000000000000000);
```

`REWARD_POOL` is exported without any JSDoc or inline comment. It is intended to represent 1,000,000 tokens in wei (1M * 1e18 = 1e24). There is no documentation explaining:
- What the reward pool represents (total rewards available for distribution)
- The intended value in human-readable terms (1 million tokens)
- The units (wei)
- The relationship to `ONE` (it is conceptually `1_000_000 * ONE`)

For a critical financial constant, the lack of documentation is a concern.

### A02-3 -- LOW -- `REWARD_POOL` is a raw numeric literal making it hard to verify at a glance

**Location:** `src/constants.ts` line 2

The value `BigInt(1000000000000000000000000)` is a 25-digit raw numeric literal. It is not immediately clear that this represents 1 million tokens at 18 decimals. Expressing it as `1_000_000n * ONE` or adding a comment like `// 1M tokens in wei` would make the intent self-documenting.

### A02-4 -- CRITICAL -- `REWARD_POOL` has an incorrect value due to floating-point precision loss

**Location:** `src/constants.ts` line 2

**Code:**
```typescript
export const REWARD_POOL = BigInt(1000000000000000000000000);
```

The numeric literal `1000000000000000000000000` exceeds `Number.MAX_SAFE_INTEGER` (2^53 - 1 = 9007199254740991). JavaScript evaluates this as a `Number` first (producing `1e+24` which is the float64 approximation `999999999999999983222784`), then converts that imprecise number to BigInt. The result is:

```
BigInt(1000000000000000000000000) = 999999999999999983222784n
```

The intended value is `1000000000000000000000000n` (10^24). The actual value is off by `16777216` wei (which equals 2^24). While this difference is negligible in token terms (~1.68e-11 tokens), it is a factual inaccuracy in the constant. This same issue was identified in prior audits (pass 1 A02-1, pass 2 A02-5).

**Note:** The `ONE` constant (`BigInt(10 ** 18)`) does NOT have this problem. Although `10 ** 18` also exceeds `MAX_SAFE_INTEGER`, the value `1000000000000000000` happens to be exactly representable as a float64 (it is a multiple of a power of 2 that fits within the mantissa). Verified:

```
BigInt(10 ** 18) === 10n ** 18n  // true
```

**Recommended fix (any of these):**
```typescript
export const REWARD_POOL = 1_000_000n * ONE;
export const REWARD_POOL = 10n ** 24n;
export const REWARD_POOL = BigInt("1000000000000000000000000");
export const REWARD_POOL = 1000000000000000000000000n;
```

### A02-5 -- INFO -- CSV column header comment references external URL without version pinning

**Location:** `src/constants.ts` lines 4-5

**Code:**
```typescript
// Must match expected structure
// https://github.com/flare-foundation/rnat-distribution-tool/blob/main/README.md#add-csv-file-with-rewards-data
```

The comment references the `main` branch of the external repository. If the upstream README changes the expected CSV structure, this link would silently point to a different specification. Pinning to a specific commit hash in the URL would make the reference stable. The comment itself ("Must match expected structure") is accurate and helpful -- it clearly communicates the constraint.

This is informational only, as using `main` is common practice and the constants themselves are defined locally.

### A02-6 -- LOW -- CSV column header comment does not explicitly state which constants it covers

**Location:** `src/constants.ts` lines 4-5

The comment on lines 4-5 precedes `REWARDS_CSV_COLUMN_HEADER_ADDRESS` and `REWARDS_CSV_COLUMN_HEADER_REWARD` (lines 6-7). It is reasonable to infer that it also covers `DIFF_CSV_COLUMN_HEADER_OLD`, `DIFF_CSV_COLUMN_HEADER_NEW`, and `DIFF_CSV_COLUMN_HEADER_DIFF` (lines 8-10), but this is not explicit. The diff CSV headers may follow a different format specification than the rewards CSV headers, or they may be internal conventions not governed by the external tool's requirements. The comment does not clarify which constants must match the external structure and which are internal.

## Summary

| ID | Severity | Title |
|----|----------|-------|
| A02-1 | LOW | `ONE` has no documentation |
| A02-2 | LOW | `REWARD_POOL` has no documentation |
| A02-3 | LOW | `REWARD_POOL` is a raw numeric literal making it hard to verify at a glance |
| A02-4 | CRITICAL | `REWARD_POOL` has an incorrect value due to floating-point precision loss |
| A02-5 | INFO | CSV column header comment references external URL without version pinning |
| A02-6 | LOW | CSV column header comment does not explicitly state which constants it covers |
