# Pass 2: Test Coverage Review — `src/liquidity.ts`

**Auditor:** A05
**Date:** 2026-03-22
**Source:** `src/liquidity.ts` (135 lines)
**Tests:** `src/liquidity.test.ts` (397 lines)

## Source Inventory

### Constants
| Name | Line | Tested |
|------|------|--------|
| `MULTICALL3_ADDRESS` | 8 | Yes (imported and used in parameter assertion, line 104) |
| `abi` (slot0 ABI, not exported) | 11-55 | Indirectly (via `expect.any(Array)` — not structurally verified) |

### Functions
| Name | Line | Tested |
|------|------|--------|
| `getPoolsTickMulticall` | 65-106 | Yes |
| `getPoolsTick` | 115-134 | Yes |

## Branch Coverage Analysis

### `getPoolsTickMulticall` (lines 65-106)

| Branch | Line | Test Coverage |
|--------|------|---------------|
| `res.status === "success"` — true | 86-88 | Covered (test line 29) |
| `res.status === "success"` — false (skipped) | 86 | Covered (test line 173) |
| `missingPools.length > 0` — true | 92 | Covered (test lines 173, 200, 224, 296) |
| `missingPools.length > 0` — false | 92 | Covered (test line 29, all succeed) |
| `code && code !== "0x"` — true (real failure) | 96 | Covered (test line 200) |
| `code && code !== "0x"` — false (code is "0x") | 96 | Covered (test line 173) |
| `code && code !== "0x"` — false (code is undefined) | 96 | Covered (test line 296) |
| `realFailures.length > 0` — true | 100-102 | Covered (test line 200) |
| `realFailures.length > 0` — false | 100 | Covered (test line 173) |
| multicall itself throws | 71-82 | Covered (test line 323) |

### `getPoolsTick` (lines 115-134)

| Branch | Line | Test Coverage |
|--------|------|---------------|
| Invalid blockNumber (NaN) | 120-122 | Covered (test line 390) |
| Invalid blockNumber (negative) | 120-122 | Covered (test line 394) |
| Success on first try | 126 | Covered (test line 349) |
| Fail then succeed (retry) | 127-128 | Covered (test line 370) |
| Fail 3 times, rethrow | 129 | Covered (test line 383) |
| Unreachable final throw | 133 | Not tested (see F-01) |
| BigInt conversion of blockNumber | 126 | Covered (test line 359) |

## Findings

### F-01: Unreachable code at line 133 is not tested and masks potential logic bugs [LOW]

**Line:** 133
**Branch:** `throw new Error("failed to get pools ticks")`

The `throw` on line 133 is unreachable. The for loop (lines 124-131) always either returns (line 126) or rethrows (line 129 when `i >= 2`). TypeScript does not flag this because it cannot prove the loop always terminates via those paths. While unreachable code is typically INFO-level, here it masks the fact that the retry logic relies on `i >= 2` for correctness — if someone changes the loop bound from 3 to a variable, line 133 could become reachable and would throw a generic error hiding the actual cause.

No test can reach this line under the current implementation, but a test asserting on the error message from line 129 (vs line 133) would serve as a regression guard if the retry logic is ever refactored.

**Severity:** LOW

---

### F-02: `getPoolsTick` retry delay (10s setTimeout) is mocked but delay duration is never asserted [LOW]

**Lines:** 128, 339-342
**Branch:** Retry delay behavior

The test mocks `setTimeout` to execute the callback immediately (line 339-342), which is necessary to avoid slow tests. However, the mock never asserts that `setTimeout` was called with the expected 10,000ms delay. If someone changes the delay to 0ms or removes it, the tests would still pass. For a function whose docstring explicitly specifies "10s delay between retries," the delay value is part of the contract.

**Severity:** LOW

---

### F-03: `getPoolsTick` — fractional blockNumber not tested [LOW]

**Line:** 120
**Branch:** `!Number.isInteger(blockNumber)` — fractional values

The validation guard checks `Number.isInteger(blockNumber)` which rejects `NaN`, `Infinity`, and fractional numbers. Tests cover `NaN` and negative integers but not fractional numbers like `100.5`. Since `Number.isInteger` is the primary check for non-integer input and `BigInt()` would throw on fractional values anyway, this is a minor gap, but completeness warrants a test.

**Severity:** LOW

---

### F-04: `getPoolsTick` — success on third (final) attempt not tested [LOW]

**Lines:** 124-131
**Branch:** Fail twice, succeed on third attempt

The retry logic has tests for: (1) succeed on first try, (2) fail once then succeed, (3) fail three times. The case of failing twice and succeeding on the third (final) attempt is not tested. This is the boundary case where `i === 2` and the try block succeeds just before the rethrow would trigger.

**Severity:** LOW

---

### F-05: `getPoolsTickMulticall` — `getCode` throwing is not tested [MEDIUM]

**Lines:** 95-98
**Branch:** `client.getCode()` throws an error

When a pool fails the multicall (lines 91-103), the code calls `client.getCode()` for each missing pool. If `getCode` itself throws (e.g., RPC timeout), that error propagates uncaught. No test verifies this behavior. In production, an RPC failure during the `getCode` check could surface as an unhandled error with a confusing stack trace rather than the expected "Failed to get ticks for pools" message.

**Severity:** MEDIUM — This is a real error path that can occur in production (RPC failures) and the behavior is not verified by any test.

---

### F-06: `getPoolsTickMulticall` — multiple real failures error message content not tested [INFO]

**Lines:** 100-102
**Branch:** `realFailures.length > 0` with multiple addresses

The test at line 200 tests a single real failure. The error message at line 101 joins failures with `, `. No test verifies the message format when multiple pools fail simultaneously (e.g., that both addresses appear in the error).

**Severity:** INFO

---

### F-07: `MULTICALL3_ADDRESS` constant value not asserted [INFO]

**Line:** 8

The test imports `MULTICALL3_ADDRESS` and passes it through as a parameter check, but never asserts its actual value. If the constant were accidentally changed, existing tests would still pass because the mock doesn't actually call the address. This is acceptable for unit tests but worth noting.

**Severity:** INFO

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH     | 0 |
| MEDIUM   | 1 |
| LOW      | 4 |
| INFO     | 2 |

Overall test coverage is strong. The main gap is F-05 (getCode throwing during the failure-classification path), which represents a real production scenario. The LOW findings are minor completeness gaps that would improve regression safety.
