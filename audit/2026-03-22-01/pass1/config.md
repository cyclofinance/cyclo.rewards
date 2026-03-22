# Pass 1: Security Review — `src/config.ts`

**Auditor:** A01
**Date:** 2026-03-22
**File:** `src/config.ts` (139 lines)

## Evidence of Reading

**Module:** `src/config.ts` — Configuration constants, environment parsing, address comparison, snapshot block generation, and decimal scaling for the Cyclo rewards pipeline.

**Imports (lines 1-4):**
- `assert` from `"assert"`
- `CyToken` from `"./types"`
- `validateAddress` from `"./constants"`
- `seedrandom` from `"seedrandom"`

**Constants:**
- `REWARDS_SOURCES` (line 7): `string[]` — 6 approved DEX router/orderbook addresses
- `FACTORIES` (line 17): `string[]` — 4 DEX factory contract addresses
- `CYTOKENS` (line 25): `CyToken[]` — 3 cyToken definitions (cysFLR, cyWETH, cyFXRP)
- `RPC_URL` (line 54): `string` — from `process.env.RPC_URL`, asserted at module load (line 52)

**Functions:**
- `isSameAddress(a: string, b: string): boolean` (line 62) — case-insensitive address comparison with validation
- `generateSnapshotBlocks(seed: string, start: number, end: number): number[]` (line 75) — deterministic 30-block snapshot generation using seedrandom
- `scaleTo18(value: bigint, decimals: number): bigint` (line 113) — scales a value from arbitrary decimals to 18 fixed-point decimals
- `parseEnv(): { seed: string; startSnapshot: number; endSnapshot: number }` (line 126) — reads and validates SEED, START_SNAPSHOT, END_SNAPSHOT from environment

## Findings

### LOW-01: `parseInt` without radix and without integer validation in `parseEnv`

**Location:** Lines 131-132
**Severity:** LOW

`parseInt(process.env.START_SNAPSHOT)` and `parseInt(process.env.END_SNAPSHOT)` are called without an explicit radix parameter, and there is no check that the result is an integer or within a safe range.

1. **Missing radix:** While `parseInt` defaults to radix 10 in modern engines for decimal strings, an input like `"0x1F4"` would be parsed as hex (500) since it starts with `0x`. Block numbers should always be base-10.

2. **Truncation of non-integer strings:** `parseInt("1000.7")` returns `1000` without error. The `isNaN` check on line 134-135 would pass, silently dropping the fractional part.

3. **Trailing garbage accepted:** `parseInt("1000abc")` returns `1000` without error. This silently ignores invalid suffixes.

4. **No safe integer check:** If the env var contained a number larger than `Number.MAX_SAFE_INTEGER` (2^53 - 1), `parseInt` would return an imprecise result. Block numbers are currently well within safe range on Flare, but the validation is missing.

**Impact:** In practice, the env vars are set by CI and developers, so exploitation risk is minimal. However, accepting malformed input silently violates defense-in-depth principles. A hex-prefixed block number or a block number with trailing garbage would be silently misinterpreted.

---

### LOW-02: `generateSnapshotBlocks` does not validate that `start <= end` or that inputs are safe integers

**Location:** Lines 75-105
**Severity:** LOW

The function validates `range >= 30` (line 84) and `seed.length > 0` (line 80), but does not validate:
- `start <= end` — If `start > end`, `range` becomes negative and the assertion on line 84 catches it, but the error message ("Snapshot range must be at least 30, got -X") is misleading about the root cause.
- `start` and `end` are integers — Fractional inputs would cause `Math.floor(rng() * range) + start` to produce fractional block numbers.
- `start` and `end` are within safe integer range — Though TypeScript's `number` type permits this, very large values could lose precision.

**Impact:** Low. The function is called internally with values parsed from env vars. The existing `range >= 30` assertion catches the `start > end` case incidentally. However, explicit validation would give clearer error messages and catch fractional inputs.

---

### LOW-03: Potential infinite loop in `generateSnapshotBlocks` when range is exactly 30

**Location:** Lines 89-91
**Severity:** LOW

When `range` is exactly 30 (e.g., `start=5000, end=5029`), there are exactly 30 possible values. The function uses random sampling without replacement via a `Set`. With `start` and `end` pre-seeded (2 of 30), it needs to randomly hit all remaining 28 values. The probability of the RNG generating all 28 remaining values converges (by the coupon collector problem), but the expected number of iterations is approximately `30 * H(28)` where `H(28)` is the 28th harmonic number (~4.02), so ~120 iterations on average for the last few values. For range=30, the expected total is ~30 * ln(28) + 30*0.5772 ~ 117 iterations.

This will terminate with probability 1 for any reasonable PRNG, but the expected iteration count grows as O(n * ln(n)) relative to the range/count ratio. For the exact boundary case (range=30), it could take hundreds of iterations to find the last missing value.

**Impact:** Negligible in practice. The test suite already exercises range=30 successfully. However, if the snapshot count were ever increased or parameterized, this sampling approach could become problematic. No fix needed currently but worth documenting.

---

### INFO-01: Module-level side effect — `assert` at line 52

**Location:** Line 52
**Severity:** INFO

`assert(process.env.RPC_URL, ...)` executes at module import time. Any code that imports `config.ts` (including tests) must have `RPC_URL` set in the environment, or the import fails. The test file works around this (lines 79-88 of `config.test.ts`), but this pattern makes the module harder to test in isolation and couples import-time behavior to runtime environment.

This is a design observation, not a security issue.

---

### INFO-02: Hardcoded addresses not validated at definition time

**Location:** Lines 7-49
**Severity:** INFO

The `REWARDS_SOURCES`, `FACTORIES`, and `CYTOKENS` arrays contain hardcoded Ethereum addresses that are not validated (e.g., via `validateAddress`) at definition time. Validation only occurs when `isSameAddress` is called. The test suite (`config.test.ts` lines 225-290) does validate all addresses against `VALID_ADDRESS_REGEX`, which mitigates this for CI, but a typo in a hardcoded address would only be caught by tests, not at module load.

This is a defense-in-depth observation. The existing test coverage adequately mitigates this.

---

### INFO-03: `scaleTo18` truncation for `decimals > 18` is by design but lossy

**Location:** Lines 119-120
**Severity:** INFO

When `decimals > 18`, the function divides by `10n ** BigInt(decimals - 18)`, which truncates (rounds toward zero). For example, `scaleTo18(99999n, 23)` returns `0n`. This is intentional BigInt floor division, but callers must be aware that small values in high-decimal tokens lose precision entirely. The test suite covers this case explicitly.

No action required.
