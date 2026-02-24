# Test Coverage Audit - Pass 2: `src/liquidity.ts`

**Auditor Agent:** A05
**Date:** 2026-02-22
**Source File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/liquidity.ts` (96 lines)
**Test File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/liquidity.test.ts` (223 lines)

---

## Evidence of Thorough Reading

### Source File: `src/liquidity.ts`

**Module purpose:** Queries Uniswap V3 pool `slot0` data via Multicall3 at specific historical block numbers. Returns a mapping of lowercased pool addresses to their current tick values. Used by `processor.ts` to determine whether V3 LP positions are in-range at each snapshot block.

**Imports:**
| Import | Source | Line |
|--------|--------|------|
| `PublicClient` | `viem` | 1 |

**Constants:**
| Name | Type | Line(s) | Description |
|------|------|---------|-------------|
| `abi` | `const` ABI array | 3-47 | Uniswap V3 pool `slot0` function ABI. Returns 7 fields: `sqrtPriceX96` (uint160), `tick` (int24), `observationIndex` (uint16), `observationCardinality` (uint16), `observationCardinalityNext` (uint16), `feeProtocol` (uint8), `unlocked` (bool). |

**Hardcoded Addresses:**
| Address | Line | Purpose |
|---------|------|---------|
| `0xcA11bde05977b3631167028862bE2a173976CA11` | 58 | Multicall3 contract address |

**Exported Functions:**

| # | Function | Lines | Signature | Description |
|---|----------|-------|-----------|-------------|
| 1 | `getPoolsTickMulticall` | 49-76 | `(client: PublicClient, pools: \`0x${string}\`[], blockNumber: bigint) => Promise<Record<string, number>>` | Performs a single multicall to read `slot0` from all pools at a given block. Skips failed individual calls. Lowercases pool addresses in returned keys. |
| 2 | `getPoolsTick` | 79-95 | `(client: PublicClient, pools: \`0x${string}\`[], blockNumber: number) => Promise<Record<string, number>>` | Retry wrapper around `getPoolsTickMulticall`. Converts `number` blockNumber to `bigint`. Retries up to 3 times with fixed 10-second delay. Throws original error after 3rd failure. Has unreachable fallback `throw` on line 94. |

**Error/failure paths in source:**
1. Line 70-72: Individual pool multicall failure -- silently skipped (pool omitted from result).
2. Line 88-90: `getPoolsTickMulticall` throws -- caught, waits 10s, retries. After 3rd attempt (`i >= 2`), re-throws original error.
3. Line 94: Unreachable `throw new Error("failed to get pools ticks")` -- fallback after the for-loop (can never be reached because the loop either returns on success or throws on line 90 at `i === 2`).

### Test File: `src/liquidity.test.ts`

**Imports:**
| Import | Source | Line |
|--------|--------|------|
| `PublicClient` | `viem` | 1 |
| `getPoolsTickMulticall` | `./liquidity` | 2 |
| `describe, it, expect, vi, beforeEach, afterEach` | `vitest` | 3 |

**Note:** Only `getPoolsTickMulticall` is imported. `getPoolsTick` is **not imported and not tested** in this file.

**Test fixtures:**
- `mockClient` (line 6-8): Mock `PublicClient` with `multicall` as `vi.fn()`.
- `mockPools` (lines 11-15): Array of 3 hex addresses.
- `blockNumber` (line 17): `12345678n`.

**Test cases enumerated:**

| # | Test Name | Lines | What It Tests |
|---|-----------|-------|---------------|
| 1 | "should return correct ticks for successful multicall results" | 28-77 | Happy path: 3 pools all succeed, verifies correct tick extraction including negative tick (-200). |
| 2 | "should call multicall with correct parameters" | 79-102 | Verifies multicall is called with correct `blockNumber`, `allowFailure`, `multicallAddress`, and contracts array. |
| 3 | "should handle empty pools array" | 104-115 | Edge case: empty `pools` array returns `{}` and multicall receives empty contracts array. |
| 4 | "should handle single pool" | 117-133 | Edge case: single pool, verifies correct result. |
| 5 | "should convert pool addresses to lowercase" | 135-160 | Verifies uppercase hex address in input produces lowercase key in output. |
| 6 | "should skip pools with failed multicall results" | 164-189 | Partial failure: middle pool fails, first and third succeed. Failed pool omitted from result. |
| 7 | "should handle all calls failing" | 191-212 | All 3 pools fail. Returns empty `{}`. |
| 8 | "should propagate multicall errors" | 214-221 | `multicall` itself rejects (not individual call failures). Verifies the error propagates. |

---

## Coverage Gap Analysis

### A05-1: `getPoolsTick` (retry wrapper) has ZERO test coverage (CRITICAL)

**Location:** `src/liquidity.ts` lines 79-95
**Evidence:** `getPoolsTick` is not imported in `liquidity.test.ts` (line 2 only imports `getPoolsTickMulticall`). No test in `liquidity.test.ts` exercises this function. While `processor.test.ts` mocks `getPoolsTick` via `vi.mock('./liquidity')`, that means the actual implementation is **never tested anywhere** -- it is always replaced by a mock.

**What is untested:**
- The retry loop itself (lines 85-91).
- The fixed 10-second delay between retries (line 89).
- The `BigInt(blockNumber)` conversion from `number` to `bigint` (line 87).
- The behavior of throwing the original error after 3 failed attempts (line 90).
- The behavior of returning successfully on 1st, 2nd, or 3rd attempt.
- The unreachable fallback error on line 94.

**Impact:** The retry mechanism is a critical resilience feature for RPC calls to the Flare Network. Without tests, regressions in retry logic (e.g., changing `i >= 2` to `i >= 3`, removing the delay, breaking the re-throw) would go undetected. This is the only function that provides fault tolerance for blockchain queries in the liquidity module.

**Classification:** CRITICAL

---

### A05-2: No test for retry succeeding after initial failure(s) (HIGH)

**Location:** `src/liquidity.ts` lines 85-91
**Description:** There is no test verifying that `getPoolsTick` successfully returns data when the first call(s) to `getPoolsTickMulticall` fail but a subsequent retry succeeds. This is the core purpose of the retry mechanism -- transient RPC failures should be recovered from.

**Expected test scenarios:**
- First call fails, second call succeeds (1 retry needed).
- First two calls fail, third call succeeds (2 retries needed).
- All three calls fail, error is thrown (tested implicitly if A05-1 were addressed).

**Impact:** Cannot confirm the retry mechanism actually recovers from transient failures.

**Classification:** HIGH

---

### A05-3: No test for retry delay timing (MEDIUM)

**Location:** `src/liquidity.ts` line 89
**Description:** The 10-second delay (`setTimeout(() => resolve(""), 10_000)`) between retries is not tested. There is no verification that:
- A delay actually occurs between retries.
- The delay duration is correct (10 seconds).
- The delay uses the expected mechanism (`setTimeout`).

As noted in pass 1 finding A05-2, the documentation claims "exponential backoff" but the implementation uses a fixed delay. A test with fake timers (`vi.useFakeTimers()`) would document the actual behavior and catch regressions.

**Impact:** The delay behavior is entirely unverified. A change to the delay (or accidental removal) would not be caught.

**Classification:** MEDIUM

---

### A05-4: No test for `BigInt(blockNumber)` conversion edge cases (MEDIUM)

**Location:** `src/liquidity.ts` line 87
**Description:** `getPoolsTick` accepts `blockNumber` as a `number` and converts it to `bigint` via `BigInt(blockNumber)`. No tests verify behavior with:
- `NaN` (throws `TypeError`)
- `Infinity` (throws `TypeError`)
- Negative numbers (produces negative bigint -- likely causes RPC error)
- Non-integer floats like `1.5` (throws `RangeError`)
- Zero (may cause unexpected RPC behavior)
- Very large numbers near `Number.MAX_SAFE_INTEGER`

While callers currently provide valid values, these edge cases document the function's contract and guard against misuse.

**Impact:** No documentation of function behavior with invalid inputs. If this function is reused in new contexts, invalid inputs would produce confusing failures.

**Classification:** MEDIUM

---

### A05-5: No test verifying the error thrown after exhausting all retries (HIGH)

**Location:** `src/liquidity.ts` lines 88-91
**Description:** When all 3 retry attempts fail, the function should re-throw the **original error** from the last attempt (line 90: `throw error`). No test verifies:
- That the thrown error is the specific error from the 3rd (final) attempt.
- That exactly 3 attempts were made before the error is thrown.
- That the error message/type is preserved (not wrapped or transformed).

This is important because the caller (`processor.ts` line 485) may depend on the error type for its own error handling.

**Impact:** If the error re-throwing logic is broken (e.g., error is swallowed, or the wrong error is thrown, or more/fewer retries happen), it would go undetected.

**Classification:** HIGH

---

### A05-6: No test for the unreachable fallback error (INFO)

**Location:** `src/liquidity.ts` line 94
**Description:** `throw new Error("failed to get pools ticks")` on line 94 is unreachable code. The for-loop from lines 85-92 will always either:
- Return a successful result (line 87), or
- Throw the caught error (line 90 when `i >= 2`).

There is no path that exits the for-loop normally to reach line 94. While this cannot be tested (it is dead code), it is worth noting as:
- It may indicate the developer was uncertain about the control flow.
- A linter/coverage tool would flag it as uncovered.

**Impact:** No functional impact. The dead code is harmless but may cause confusion.

**Classification:** INFO

---

### A05-7: No test for duplicate pool addresses in input (LOW)

**Location:** `src/liquidity.ts` lines 59-73
**Description:** If the same pool address appears multiple times in the `pools` array, the function will make duplicate multicall calls and the later result will overwrite the earlier one in the `ticks` record (since the key is the lowercased address). No test verifies this behavior.

Additionally, if the same address appears with different casing (e.g., `0xABCD...` and `0xabcd...`), they would map to the same key after lowercasing, and the later result would win.

**Impact:** Minor. In practice, the caller should not pass duplicates. But documenting the behavior via a test would be valuable.

**Classification:** LOW

---

### A05-8: No test verifying multicall `allowFailure: true` resilience vs. `false` (LOW)

**Location:** `src/liquidity.ts` line 57
**Description:** The function relies on `allowFailure: true` to gracefully handle individual pool call failures. The test on line 94 verifies the parameter is passed correctly, and tests 6-7 verify the behavior when individual results have `status: 'failure'`. However, there is no test contrasting the behavior when the multicall itself throws (test 8 partially covers this), and there is no test for what happens if `allowFailure` were accidentally changed to `false` (the multicall would throw on any individual failure rather than returning per-call status).

**Impact:** The existing tests adequately cover the current behavior. This is more of a defensive testing suggestion.

**Classification:** LOW

---

## Summary

| ID | Severity | Title |
|----|----------|-------|
| A05-1 | CRITICAL | `getPoolsTick` (retry wrapper) has ZERO test coverage |
| A05-2 | HIGH | No test for retry succeeding after initial failure(s) |
| A05-3 | MEDIUM | No test for retry delay timing |
| A05-4 | MEDIUM | No test for `BigInt(blockNumber)` conversion edge cases |
| A05-5 | HIGH | No test verifying the error thrown after exhausting all retries |
| A05-6 | INFO | No test for the unreachable fallback error (dead code) |
| A05-7 | LOW | No test for duplicate pool addresses in input |
| A05-8 | LOW | No test verifying `allowFailure: true` resilience behavior |

**Total findings:** 8 (1 CRITICAL, 2 HIGH, 2 MEDIUM, 2 LOW, 1 INFO)

**Overall assessment:** The test file provides solid coverage for `getPoolsTickMulticall` with good happy-path tests, empty/single array edge cases, address lowercasing, partial failures, total failures, and error propagation. However, the entire `getPoolsTick` retry wrapper function (lines 79-95) -- which is the function actually called by `processor.ts` -- has **zero direct test coverage**. It is always mocked in `processor.test.ts`, meaning its retry logic, delay behavior, error re-throwing, and `BigInt` conversion are completely untested. This is the most significant coverage gap in the module.
