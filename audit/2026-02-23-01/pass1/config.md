# Pass 1 — Security Audit: `src/config.ts`

**Auditor:** A01
**Date:** 2026-02-23
**File:** `src/config.ts` (77 lines)

---

## Evidence of Thorough Reading

**Module:** `src/config.ts` — Configuration constants and utility functions for the Cyclo rewards calculator.

**Imports (lines 1-3):**
- `assert` from `"assert"` (line 1)
- `CyToken`, `Epoch` from `"./types"` (line 2) — note: `Epoch` is imported but never used in this file
- `seedrandom` from `"seedrandom"` (line 3)

**Constants defined:**
| Name | Line | Type | Description |
|------|------|------|-------------|
| `REWARDS_SOURCES` | 5-12 | `string[]` (exported) | Array of 6 approved DEX router/orderbook addresses |
| `FACTORIES` | 14-19 | `string[]` (exported) | Array of 4 factory contract addresses |
| `CYTOKENS` | 21-36 | `CyToken[]` (exported) | Array of 2 cyToken definitions (cysFLR, cyWETH) |
| `RPC_URL` | 38 | `string` (exported) | Hardcoded Flare Network public RPC endpoint |

**Functions defined:**
| Name | Line | Signature | Description |
|------|------|-----------|-------------|
| `isSameAddress` | 40-42 | `(a: string, b: string): boolean` | Case-insensitive address comparison via `toLowerCase()` |
| `generateSnapshotBlocks` | 50-76 | `(seed: string, start: number, end: number): number[]` | Generates 30 deterministic snapshot block numbers using seeded PRNG |

**Types/Errors defined in this file:** None (types are imported from `./types`).

---

## Security Findings

### A01-1 — MEDIUM — No input validation on `generateSnapshotBlocks` parameters

**Location:** Lines 50-76

The function `generateSnapshotBlocks` does not validate its inputs:
- `start` and `end` are not checked for being positive integers.
- There is no assertion that `end > start`. If `end < start`, then `range = end - start + 1` becomes zero or negative, causing `Math.floor(rng() * range) + start` to produce values outside the intended block range (or `NaN` if `range` is 0 and floating-point edge cases arise).
- If `start === end`, `range = 1`, and all 30 snapshots will be the same block. This may or may not be intentional but is likely a degenerate case.
- Non-integer or `NaN`/`Infinity` values for `start`/`end` would produce unpredictable snapshot block numbers.

**Recommendation:** Add explicit precondition checks:
```typescript
assert.ok(Number.isInteger(start) && start >= 0, "start must be a non-negative integer");
assert.ok(Number.isInteger(end) && end >= 0, "end must be a non-negative integer");
assert.ok(end > start, "end must be greater than start");
```

---

### A01-2 — LOW — Possible duplicate snapshot blocks

**Location:** Lines 58-64

The function generates 28 random blocks and adds `start` and `end` as fixed endpoints. Because the random blocks are drawn from the range `[start, end]` inclusive, it is possible for a random block to equal `start` or `end`, or for two random blocks to be identical. The function does not deduplicate. If duplicate snapshots exist, certain blocks would be over-weighted in the average balance calculation downstream. The assertion on line 67-70 only checks length (30), not uniqueness.

**Impact:** A duplicated snapshot biases the reward calculation in favor of balances at that block. With a range of millions of blocks this is astronomically unlikely, but the code does not guard against it.

**Recommendation:** Either document that duplicates are acceptable by design, or add a uniqueness check/deduplication step.

---

### A01-3 — LOW — Inconsistent address casing in constants

**Location:** Lines 5-36

`REWARDS_SOURCES` contains a mix of all-lowercase addresses (lines 6, 11) and mixed-case (EIP-55 checksummed) addresses (lines 7-10). Similarly, `FACTORIES` uses mixed-case throughout, and `CYTOKENS` has a mix (e.g., `underlyingAddress` on line 32 is all-lowercase while others are checksummed). The `isSameAddress` function (line 40) normalizes via `toLowerCase()`, so comparisons work correctly at runtime. However, the inconsistency means that any code path that does a direct `===` comparison without using `isSameAddress` would silently fail for some addresses.

**Recommendation:** Normalize all address constants to a single casing convention (either all-lowercase or all EIP-55 checksummed) to reduce the risk of future direct-comparison bugs.

---

### A01-4 — INFO — Unused import `Epoch`

**Location:** Line 2

The type `Epoch` is imported from `"./types"` but is never referenced anywhere in `config.ts`. This is a dead import.

**Recommendation:** Remove the unused import to keep the module clean. TypeScript with `noUnusedLocals` would flag this.

---

### A01-5 — INFO — Hardcoded public RPC URL

**Location:** Line 38

`RPC_URL` is hardcoded to `"https://flare-api.flare.network/ext/C/rpc"`. This is the Flare Network's public community RPC endpoint — not a secret or private API key — so there is no credential exposure. However, hardcoding it means the endpoint cannot be overridden without code changes (e.g., for testing, failover, or if the endpoint changes).

**Recommendation:** Consider making this configurable via an environment variable with the current value as a default, e.g.:
```typescript
export const RPC_URL = process.env.RPC_URL ?? "https://flare-api.flare.network/ext/C/rpc";
```

---

### A01-6 — INFO — `isSameAddress` does not validate address format

**Location:** Lines 40-42

`isSameAddress` performs a case-insensitive string comparison but does not verify that either argument is a valid Ethereum address (40 hex characters prefixed with `0x`). Passing arbitrary strings (e.g., empty string, non-hex data) would not raise an error — it would simply return `true` or `false` on the raw string comparison. In the context of this codebase, callers always pass addresses sourced from on-chain data or the constants above, so the practical risk is low.

**Recommendation:** No action required given current usage, but consider adding a lightweight validation if this function is ever exposed to untrusted input.

---

### A01-7 — INFO — Floating-point arithmetic in snapshot generation

**Location:** Line 62

```typescript
const randomBlock = Math.floor(rng() * range) + start;
```

`rng()` returns a floating-point number in `[0, 1)`. Multiplying by `range` and flooring is the standard pattern. For very large ranges (approaching `Number.MAX_SAFE_INTEGER`), floating-point precision loss could cause a slight bias. In practice, Flare block numbers are well within safe integer range (currently in the low tens of millions), so this is not a real concern for this application.

**Recommendation:** No action required for current block number magnitudes.

---

## Summary

| ID | Severity | Title |
|----|----------|-------|
| A01-1 | MEDIUM | No input validation on `generateSnapshotBlocks` parameters |
| A01-2 | LOW | Possible duplicate snapshot blocks |
| A01-3 | LOW | Inconsistent address casing in constants |
| A01-4 | INFO | Unused import `Epoch` |
| A01-5 | INFO | Hardcoded public RPC URL |
| A01-6 | INFO | `isSameAddress` does not validate address format |
| A01-7 | INFO | Floating-point arithmetic in snapshot generation |

**No CRITICAL or HIGH severity issues found.** The file is a straightforward configuration module with minimal attack surface. The MEDIUM finding (A01-1) is the most actionable — missing precondition checks on `generateSnapshotBlocks` could lead to incorrect snapshot generation if called with invalid parameters.
