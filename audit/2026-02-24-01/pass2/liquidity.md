# Pass 2: Test Coverage -- liquidity.ts

**Auditor:** A05
**Date:** 2026-02-24
**Source:** `/Users/thedavidmeister/Code/cyclo.rewards/src/liquidity.ts` (109 lines)
**Test:** `/Users/thedavidmeister/Code/cyclo.rewards/src/liquidity.test.ts` (257 lines)

---

## 1. Evidence of Thorough Reading

### Source file (`liquidity.ts`)

- **Lines 1-47:** Imports `PublicClient` from viem. Defines a local `abi` constant (not exported) for the Uniswap V3 `slot0` function, returning 7 fields: `sqrtPriceX96`, `tick`, `observationIndex`, `observationCardinality`, `observationCardinalityNext`, `feeProtocol`, `unlocked`.
- **Lines 49-90:** `getPoolsTickMulticall` -- exported async function. Takes `(client, pools, blockNumber: bigint)`. Calls `client.multicall` with `allowFailure: true` against hardcoded multicall3 address `0xcA11bde05977b3631167028862bE2a173976CA11`. Iterates results; for `status === "success"`, stores `result[1]` (the tick) keyed by lowercased pool address. Then identifies missing pools (those not in ticks). For each missing pool, calls `client.getCode` to check deployment. If `code && code !== "0x"`, the pool is considered deployed but failed -- these are collected as `realFailures`. If any `realFailures` exist, throws. Otherwise returns `ticks` (silently omitting undeployed pools).
- **Lines 92-109:** `getPoolsTick` -- exported async function. Takes `(client, pools, blockNumber: number)` (note: `number`, not `bigint`). Wraps `getPoolsTickMulticall` with retry logic: up to 3 attempts (loop `i = 0..2`), converting `blockNumber` to `BigInt`. On error, waits 10 seconds (`setTimeout` with 10_000ms), then retries. On the third failure (`i >= 2`), rethrows the error. A final unreachable `throw` on line 108 acts as a TypeScript safety net.

### Test file (`liquidity.test.ts`)

- **Lines 1-9:** Imports only `getPoolsTickMulticall` from `./liquidity`. Does NOT import `getPoolsTick`. Creates a mock `PublicClient` with `multicall` and `getCode` as vi.fn().
- **Lines 11-16:** Sets up `mockPools` array with 3 hex addresses and `blockNumber = 12345678n`.
- **Lines 20-26:** `beforeEach` clears mocks, `afterEach` restores mocks.
- **Lines 28-170:** `describe('Happy paths')` with 5 tests:
  - Lines 29-78: Returns correct ticks including a negative tick (-200).
  - Lines 80-111: Verifies multicall called with correct parameters (blockNumber, allowFailure, multicallAddress, contracts array).
  - Lines 113-124: Empty pools array returns `{}`.
  - Lines 126-142: Single pool returns correct tick.
  - Lines 144-169: Mixed-case pool addresses are lowercased in output keys.
- **Lines 172-256:** `describe('Error handling')` with 4 tests:
  - Lines 173-198: Failed pool with `getCode` returning `"0x"` (not deployed) is silently skipped.
  - Lines 200-222: Failed pool with `getCode` returning bytecode throws error.
  - Lines 224-246: All pools failed but none deployed returns `{}`.
  - Lines 248-255: Multicall rejection propagates.

---

## 2. Exported Function Coverage

### `getPoolsTickMulticall` -- TESTED

| Scenario | Tested? | Test Location |
|---|---|---|
| All pools succeed, returns correct ticks | Yes | Line 29 |
| Multicall called with correct params | Yes | Line 80 |
| Empty pools array | Yes | Line 113 |
| Single pool | Yes | Line 126 |
| Pool addresses lowercased in output | Yes | Line 144 |
| Failed pool, not deployed (code=0x), silently skipped | Yes | Line 173 |
| Failed pool, deployed (has code), throws | Yes | Line 200 |
| All pools fail, none deployed | Yes | Line 224 |
| Multicall throws (not allowFailure, but full rejection) | Yes | Line 248 |
| Negative tick value (-200) | Yes | Line 75 (in first happy path test) |
| Tick at zero | No | **GAP** |
| Duplicate pool addresses in input | No | **GAP** |
| `getCode` returns `undefined` vs `"0x"` | No | **GAP** |

### `getPoolsTick` -- NOT TESTED

The function `getPoolsTick` is **not imported** in `liquidity.test.ts` and has **zero direct unit tests**.

In `processor.test.ts`, `getPoolsTick` is mocked via `vi.mock("./liquidity")`, so processor tests never exercise the actual retry logic. They only verify the processor's interaction with the mock.

| Scenario | Tested? | Notes |
|---|---|---|
| Succeeds on first attempt (no retry) | No | **GAP** |
| Fails once, then succeeds (retry-then-succeed) | No | **GAP** |
| Fails twice, then succeeds (two retries, then success) | No | **GAP** |
| Fails three times (retry exhaustion, rethrows) | No | **GAP** |
| Retry delay timing (10 second wait) | No | **GAP** |
| BigInt conversion of `blockNumber` (number -> bigint) | No | **GAP** |
| Correct error is rethrown (not the generic "failed to get pools ticks") | No | **GAP** |

---

## 3. Coverage Gaps

### Critical Gaps

**GAP-LIQ-01: `getPoolsTick` has zero unit tests.**
The retry wrapper function is entirely untested. This is a significant gap because:
- The retry logic (3 attempts with 10s delay) is non-trivial control flow.
- The `BigInt(blockNumber)` conversion at line 101 could silently produce incorrect values for edge-case numeric inputs (e.g., very large numbers exceeding safe integer range).
- The rethrow condition (`i >= 2`) at line 104 means only the third failure rethrows. The first two failures are swallowed. This behavior is untested.
- The 10-second delay per retry could cause 20+ seconds of wall-clock time in production failure scenarios. Without fake timers in tests, this is unverified.
- The unreachable `throw` at line 108 is dead code (the loop always returns or throws before reaching it). Tests would confirm this.

### Moderate Gaps

**GAP-LIQ-02: Tick value of zero not tested.**
The `slot0` ABI returns `int24` for tick. Zero is a valid and semantically significant tick value (represents price ratio of 1.0). No test verifies that tick=0 is correctly stored rather than being falsy-filtered.

**GAP-LIQ-03: Duplicate pool addresses in input not tested.**
If the same pool address appears twice in the `pools` array, the multicall will query it twice, but the `ticks` record will store only one entry (last write wins due to `toLowerCase()` keying). This could mask issues or produce unexpected behavior in callers.

**GAP-LIQ-04: `getCode` returning `undefined` not tested.**
Line 80 checks `if (code && code !== "0x")`. If `getCode` returns `undefined` (e.g., on some RPC edge cases), the pool would be treated as not deployed. This path is untested. Only `"0x"` and a bytecode string are tested.

### Minor Gaps

**GAP-LIQ-05: Hardcoded multicall3 address not validated.**
The multicall3 address `0xcA11bde05977b3631167028862bE2a173976CA11` is hardcoded. While the test at line 104 does verify it is passed through, there is no assertion that it matches the canonical multicall3 deployment on Flare.

---

## 4. Summary

| Function | Test Status | Coverage Assessment |
|---|---|---|
| `getPoolsTickMulticall` | Tested | Good coverage with minor gaps (tick=0, duplicates, getCode=undefined) |
| `getPoolsTick` | **Not tested** | **No coverage at all** -- retry logic, delay, BigInt conversion, error rethrow all untested |

**Overall assessment:** The core multicall function has reasonable test coverage. However, the retry wrapper `getPoolsTick` -- which is the function actually called by the processor in production -- has zero direct test coverage. All references to `getPoolsTick` in `processor.test.ts` use mocks, so the real implementation's retry behavior, timing, and error handling are completely unverified by any test.
