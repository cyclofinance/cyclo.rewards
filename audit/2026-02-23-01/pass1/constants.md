# Audit Pass 1 (Security) -- `src/constants.ts`

**Auditor:** A02
**Date:** 2026-02-23
**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/constants.ts`
**Lines:** 11

---

## Evidence of Thorough Reading

**Module:** `src/constants.ts` (ES module, no default export)

**Functions/Methods:** None. This file contains only constant exports.

**Constants defined:**

| Name | Line | Value |
|------|------|-------|
| `ONE` | 1 | `BigInt(10 ** 18)` |
| `REWARD_POOL` | 2 | `BigInt(1000000000000000000000000)` |
| `REWARDS_CSV_COLUMN_HEADER_ADDRESS` | 6 | `"recipient address"` |
| `REWARDS_CSV_COLUMN_HEADER_REWARD` | 7 | `"amount wei"` |
| `DIFF_CSV_COLUMN_HEADER_OLD` | 8 | `"old"` |
| `DIFF_CSV_COLUMN_HEADER_NEW` | 9 | `"new"` |
| `DIFF_CSV_COLUMN_HEADER_DIFF` | 10 | `"diff"` |

**Types/Errors:** None defined.

**Comments:** Line 4-5 contains a reference comment linking to the Flare rnat-distribution-tool README for the expected CSV structure.

---

## Security Findings

### A02-1 -- CRITICAL -- `REWARD_POOL` has incorrect value due to floating-point precision loss

**Line:** 2
**Code:** `export const REWARD_POOL = BigInt(1000000000000000000000000);`

The numeric literal `1000000000000000000000000` (intended: 1e24, i.e., 1,000,000 tokens at 18 decimals) exceeds `Number.MAX_SAFE_INTEGER` (9,007,199,254,740,991). JavaScript parses this as a `Number` first, which loses precision, and then passes the imprecise value to `BigInt()`.

**Actual value at runtime:** `999999999999999983222784`
**Intended value:** `1000000000000000000000000`
**Difference:** `16,777,216` wei (2^24 wei, approximately 1.68e-11 tokens)

While the absolute magnitude of the error is small in token terms (~0.0000000000168 tokens), this is still a correctness bug in a financial calculation. The reward pool is silently 16,777,216 wei less than the intended 1 million tokens. This means slightly fewer total rewards are distributed than intended.

**Verified empirically:** `BigInt(1000000000000000000000000).toString()` outputs `"999999999999999983222784"`, confirming the precision loss.

**Remediation:** Use a BigInt literal (with the `n` suffix) or construct from string:
```typescript
// Option A: BigInt literal (preferred)
export const REWARD_POOL = 1000000000000000000000000n;

// Option B: Construct from string
export const REWARD_POOL = BigInt("1000000000000000000000000");

// Option C: Compose from safe components
export const REWARD_POOL = 10n ** 24n;  // 1e6 tokens * 1e18 decimals
```

---

### A02-2 -- LOW -- `ONE` uses intermediate floating-point arithmetic in BigInt construction

**Line:** 1
**Code:** `export const ONE = BigInt(10 ** 18);`

The expression `10 ** 18` is computed in floating-point `Number` arithmetic before being passed to `BigInt()`. The value `10 ** 18` (1,000,000,000,000,000,000) exceeds `Number.MAX_SAFE_INTEGER`.

**Mitigating factor:** In this specific case, the value `10^18` happens to be exactly representable as a float64 because its odd factor `5^18 = 3,814,697,265,625` is less than `2^53`. The resulting BigInt is correct. This was verified empirically: `BigInt(10**18) === 10n**18n` evaluates to `true`.

**Risk:** The pattern is fragile. If a developer changes the exponent (e.g., to `10 ** 19` or `10 ** 24`), precision loss may or may not occur depending on the specific value's float64 representability. The code provides no signal that this is a concern.

**Remediation:** Use BigInt-native arithmetic to eliminate reliance on float64 exactness:
```typescript
export const ONE = 10n ** 18n;
```

---

### A02-3 -- INFO -- No `as const` or `Object.freeze` on exported constants

**Lines:** 1-10

All constants are exported as mutable `const` bindings. While `const` prevents reassignment of the binding itself, this is standard TypeScript practice for primitive values and is not a practical concern here since all values are primitives (BigInt or string), which are immutable by nature.

No action required.

---

### A02-4 -- INFO -- CSV column header strings are not validated against downstream consumers

**Lines:** 6-10

The CSV column header constants (`REWARDS_CSV_COLUMN_HEADER_ADDRESS`, etc.) are plain strings that must match the expected format of the Flare rnat-distribution-tool (referenced in the comment on lines 4-5). There is no compile-time or runtime validation that these strings match the downstream tool's expectations. Any mismatch would cause silent failures in the distribution pipeline.

**Mitigating factor:** The CI pipeline (`git-clean.yaml`) runs the full pipeline end-to-end, which would surface gross formatting errors. The comment linking to the upstream README provides human-readable documentation of the contract.

No immediate action required, but integration tests against the downstream tool's parser would add defense in depth.

---

## Summary

| ID | Severity | Description |
|----|----------|-------------|
| A02-1 | CRITICAL | `REWARD_POOL` is silently incorrect (off by 2^24 wei) due to float64 precision loss in `BigInt(1000000000000000000000000)` |
| A02-2 | LOW | `ONE` uses float64 intermediate; correct by coincidence but fragile pattern |
| A02-3 | INFO | Constants are standard mutable `const` bindings (no concern for primitives) |
| A02-4 | INFO | CSV headers rely on string match with external tool; no programmatic validation |
