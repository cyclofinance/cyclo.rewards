# Audit A05 -- Pass 2 (Test Coverage) -- `src/liquidity.ts`

**Auditor:** A05
**Date:** 2026-02-23
**Audit ID:** 2026-02-23-01
**Source file:** `src/liquidity.ts` (95 lines)
**Test file:** `src/liquidity.test.ts` (223 lines)

---

## Evidence of Thorough Reading

### Source file -- Functions and constants

| Name | Kind | Lines |
|------|------|-------|
| `abi` | const (ABI array for `slot0`) | 3--47 |
| `getPoolsTickMulticall` | exported async function | 49--76 |
| `getPoolsTick` | exported async function | 79--95 |

### Test file -- Test cases

| # | Test case name | Describe block |
|---|---------------|----------------|
| 1 | should return correct ticks for successful multicall results | Happy paths |
| 2 | should call multicall with correct parameters | Happy paths |
| 3 | should handle empty pools array | Happy paths |
| 4 | should handle single pool | Happy paths |
| 5 | should convert pool addresses to lowercase | Happy paths |
| 6 | should skip pools with failed multicall results | Error handling |
| 7 | should handle all calls failing | Error handling |
| 8 | should propagate multicall errors | Error handling |

**Only `getPoolsTickMulticall` is imported in the test file (line 2). `getPoolsTick` is never imported or tested.**

---

## Findings

### A05-1 -- HIGH -- `getPoolsTick` function is entirely untested

The function `getPoolsTick` (lines 79--95) is never imported in the test file and has zero test coverage. This function is the public-facing entry point that wraps `getPoolsTickMulticall` with retry logic (3 attempts, 10-second backoff). Since this is the function the rest of the codebase calls (per CLAUDE.md: "3 retries with exponential backoff"), having no tests for it means the retry contract is unverified.

Specific untested behaviors:
- Successful call on first attempt returns immediately without retrying.
- Failure on attempt 1 or 2 triggers a 10-second delay and retries.
- Failure on all 3 attempts re-throws the original error from the third attempt.
- The `blockNumber` parameter (type `number`) is correctly converted to `BigInt` before passing to `getPoolsTickMulticall`.

### A05-2 -- HIGH -- Retry-then-succeed path never tested

The retry logic in `getPoolsTick` (lines 85--92) has a path where the first or second call to `getPoolsTickMulticall` throws, a 10-second delay occurs, and then a subsequent call succeeds. No test exercises this recovery-after-failure path. This is a critical behavioral contract -- callers depend on transient RPC errors being silently retried.

### A05-3 -- MEDIUM -- Retry exhaustion and error re-throw never tested

When all 3 attempts in `getPoolsTick` fail (lines 88--90), the function should re-throw the error from the final attempt (`if (i >= 2) throw error`). No test verifies:
- That the thrown error is specifically the error from the 3rd attempt (not the 1st or 2nd).
- That exactly 3 calls were made before throwing.
- That the unreachable fallback `throw new Error("failed to get pools ticks")` at line 94 is indeed unreachable.

### A05-4 -- MEDIUM -- Retry delay timing is never asserted

The 10-second delay between retries (`setTimeout(..., 10_000)` on line 89) is never tested. There is no test using fake timers to verify that the delay is 10 seconds (not 0, not 100 seconds). If someone changes the delay to 0 or removes it entirely, no test would catch it.

### A05-5 -- LOW -- `BigInt` conversion of `blockNumber` in `getPoolsTick` is untested

`getPoolsTick` accepts `blockNumber` as `number` (line 82) and converts it to `BigInt` on line 87 (`BigInt(blockNumber)`). No test verifies this conversion. If someone changed the parameter type or removed the conversion, tests would not catch the mismatch between the `number` type in `getPoolsTick` and the `bigint` type in `getPoolsTickMulticall`.

### A05-6 -- LOW -- Negative tick value boundary not explicitly validated

The test "should return correct ticks for successful multicall results" does include a negative tick value (-200), which is good. However, there are no tests for extreme tick boundaries: the minimum tick (-887272) and maximum tick (887272) in Uniswap V3. Since these are `int24` values from the ABI, testing at the boundaries of that type (`-8388608` to `8388607`) would provide stronger confidence that the tick extraction works correctly for all valid on-chain values.

### A05-7 -- LOW -- Tick value at zero not tested

No test case includes a tick value of exactly `0`. While `0` is a valid and common tick (representing a 1:1 price ratio), no test verifies that a zero tick is correctly stored in the result record (as opposed to being accidentally filtered out by a falsy check).

### A05-8 -- LOW -- Duplicate pool addresses not tested

No test verifies behavior when the same pool address appears multiple times in the `pools` array. The current implementation would overwrite earlier results with later ones (since it uses `pools[i].toLowerCase()` as the key). This implicit last-write-wins behavior is untested.
