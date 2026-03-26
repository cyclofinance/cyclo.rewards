# Pass 5: Correctness / Intent Verification -- `src/liquidity.ts`

**Agent:** A05
**Date:** 2026-03-22
**Audit ID:** 2026-03-22-01
**Source:** `src/liquidity.ts` (134 lines)
**Tests:** `src/liquidity.test.ts` (397 lines)

---

## Evidence of Thorough Reading

### Source file (`src/liquidity.ts`)

| # | Symbol | Kind | Line(s) | Verified |
|---|--------|------|---------|----------|
| 1 | `MULTICALL3_ADDRESS` | exported const | 8 | Correct canonical Multicall3 address |
| 2 | `abi` | module-level const | 11-55 | Verified against Uniswap V3 slot0 signature (see F-01) |
| 3 | `getPoolsTickMulticall` | exported async function | 65-106 | Multicall with failure classification (see F-02, F-03) |
| 4 | `getPoolsTick` | exported async function | 115-134 | Retry wrapper with validation (see F-04, F-05) |

### Test file (`src/liquidity.test.ts`)

| # | Test | Line(s) | Exercises claimed behavior? |
|---|------|---------|-----------------------------|
| 1 | `should return correct ticks for successful multicall results` | 29-78 | Yes -- verifies tick extraction from `result[1]` |
| 2 | `should call multicall with correct parameters` | 80-111 | Partially -- uses `expect.any(Array)` for ABI (see F-06) |
| 3 | `should handle empty pools array` | 113-124 | Yes |
| 4 | `should handle single pool` | 126-142 | Yes |
| 5 | `should convert pool addresses to lowercase` | 144-169 | Yes |
| 6 | `should skip pools not yet deployed (no code)` | 173-198 | Yes -- getCode returns "0x" |
| 7 | `should throw for deployed pool with failed slot0` | 200-222 | Yes -- getCode returns bytecode |
| 8 | `should skip all pools when none are deployed` | 224-246 | Yes |
| 9 | `should handle tick value of zero` | 248-267 | Yes -- guards against falsy-zero bugs |
| 10 | `should use last result when duplicate pool addresses` | 269-294 | Yes -- documents last-write-wins |
| 11 | `should skip pool when getCode returns undefined` | 296-321 | Yes |
| 12 | `should propagate multicall errors` | 323-330 | Yes |
| 13 | `returns on first success without retry` | 349-357 | Yes -- multicall called once |
| 14 | `converts blockNumber to BigInt` | 359-368 | Yes |
| 15 | `retries and succeeds on second attempt` | 370-381 | Yes -- multicall called twice |
| 16 | `throws after 3 failures` | 383-388 | Yes -- multicall called 3 times (see F-04) |
| 17 | `throws on NaN blockNumber` | 390-391 | Yes |
| 18 | `throws on negative blockNumber` | 394-395 | Yes |

---

## Correctness Verification

### 1. Does the retry logic actually perform 3 attempts as documented?

**Verdict: Yes, with a caveat.**

The JSDoc (line 109) says "3 attempts, 10s delay between retries." The loop `for (let i = 0; i < 3; i++)` runs iterations i=0, i=1, i=2, giving exactly 3 attempts. On success, line 126 returns immediately. On failure, the catch block at lines 127-130 sleeps 10 seconds then checks `if (i >= 2) throw error`. This means:

- Attempt 1 (i=0): try, fail, sleep 10s, continue
- Attempt 2 (i=1): try, fail, sleep 10s, continue
- Attempt 3 (i=2): try, fail, sleep 10s, throw

The test at line 383-388 confirms this: `mockRejectedValue` causes all calls to fail, and `toHaveBeenCalledTimes(3)` confirms 3 multicall invocations.

**The caveat (see F-04):** The sleep on the final attempt (i=2) is wasted -- 10 seconds of delay before rethrowing.

### 2. Does the multicall correctly call slot0 on each pool?

**Verdict: Yes.**

Lines 71-82 construct the multicall with:
- `allowFailure: true` (so individual pool failures don't abort the entire batch)
- `multicallAddress: MULTICALL3_ADDRESS` (canonical Multicall3)
- Each pool mapped to `{ abi, address, functionName: "slot0" }`

The results are iterated (lines 83-89), extracting `res.result[1]` which is the `tick` field (second return value from slot0). This is correct per the ABI definition.

The test at line 80-111 verifies the multicall parameters (address, functionName, blockNumber, allowFailure, multicallAddress).

### 3. Do tests actually exercise the behavior their names describe?

**Verdict: Yes, all 18 tests exercise their named behaviors.** See the table above. Each test name accurately describes what it tests. No test is vacuous or testing something other than what its name claims.

### 4. Are the ABI definitions correct for Uniswap V3?

**Verdict: Correct for canonical Uniswap V3.** See F-01 for the detailed comparison. The ABI matches the canonical `IUniswapV3PoolState.slot0()` interface exactly.

---

## Findings

### F-A05-P5-1 --- INFO --- slot0 ABI matches canonical Uniswap V3; Sparkdex fork compatibility assumed

**Location:** Lines 11-55

The `abi` constant defines the Uniswap V3 `slot0()` function with 7 return values:

| # | Name | Type | Canonical V3 | Match |
|---|------|------|-------------|-------|
| 1 | sqrtPriceX96 | uint160 | uint160 | Yes |
| 2 | tick | int24 | int24 | Yes |
| 3 | observationIndex | uint16 | uint16 | Yes |
| 4 | observationCardinality | uint16 | uint16 | Yes |
| 5 | observationCardinalityNext | uint16 | uint16 | Yes |
| 6 | feeProtocol | uint8 | uint8 | Yes |
| 7 | unlocked | bool | bool | Yes |

This matches the canonical Uniswap V3 `IUniswapV3PoolState` interface. The pools come from Sparkdex V3 (`0xb3fb4...`) and Sparkdex V3.1 (`0x8a257...`) factories, which are Uniswap V3 forks on Flare. If either fork has modified the `slot0` return signature, the multicall would fail and the `getCode` fallback would classify it as a "real failure" (thrown error). This is a safe failure mode -- the system would halt rather than silently misread ticks.

---

### F-A05-P5-2 --- MEDIUM --- Downstream consumer uses inclusive upper tick bound, while Uniswap V3 uses exclusive

**Location:** `src/processor.ts:644` (consuming `liquidity.ts` output)

**Cross-file finding.** The tick values returned by `getPoolsTickMulticall` are consumed in `processor.ts` line 644:

```typescript
if (lp.lowerTick <= tick && tick <= lp.upperTick) continue; // skip if in range
```

Uniswap V3's actual in-range condition is `lowerTick <= currentTick < upperTick` (upper tick is **exclusive**). The code uses `tick <= lp.upperTick` (upper tick **inclusive**). This means when `currentTick === upperTick`, the position is treated as in-range by this code, but Uniswap V3 considers it out-of-range. The consequence: an out-of-range position at exactly the upper boundary would NOT have its value deducted from snapshot balances, giving the LP holder unearned reward credit.

This finding is about the correctness of how `liquidity.ts` results are interpreted, not about `liquidity.ts` itself. The tick value returned by `liquidity.ts` is correct; the comparison operator in the consumer is wrong.

**Impact:** An LP position whose pool tick sits exactly at `upperTick` would receive reward credit it should not receive. The probability of a pool tick landing exactly on a tick boundary is low but nonzero (ticks can only be multiples of the tick spacing, so boundary hits occur when price moves through a tick). For a rewards calculation, even rare over-crediting is a correctness concern.

---

### F-A05-P5-3 --- LOW --- `getPoolsTickMulticall` result[1] extraction assumes viem returns tuple in array-index order

**Location:** Line 87

```typescript
ticks[pool] = res.result[1];
```

The code accesses `res.result[1]` to get the `tick` field (the second output of `slot0`). This relies on viem returning multicall results as a positional tuple matching the ABI output order. This is correct for viem's current behavior -- with `as const` on the ABI, viem types the result as a tuple `[bigint, number, number, number, number, number, boolean]` and `result[1]` is the `tick` (int24 decoded as `number`).

However, the index `[1]` is a magic number with no comment explaining why index 1 corresponds to the tick. If the ABI outputs were ever reordered or a different function were used, this would silently extract the wrong field.

The tests verify this indirectly by checking the returned tick values match the mock `result[1]` values, but the mock data itself is constructed by the test author (who presumably placed tick at index 1), so the test is circular with respect to the ABI position.

---

### F-A05-P5-4 --- LOW --- Retry sleeps 10 seconds on the final failed attempt before rethrowing

**Location:** Lines 127-129

```typescript
} catch (error) {
    await new Promise((resolve) => setTimeout(() => resolve(""), 10_000)) // wait 10 secs and try again
    if (i >= 2) throw error;
}
```

On the final attempt (i=2), the code catches the error, sleeps 10 seconds, then checks `i >= 2` and throws. The sleep serves no purpose on the last iteration -- there is no subsequent retry. This wastes 10 seconds per permanently-failing call. Since `getPoolsTick` is called once per snapshot block (30 snapshots), a consistently failing RPC endpoint would add 5 minutes of unnecessary waiting (30 * 10s).

The intent ("wait 10 secs and try again") does not match the behavior on the last iteration -- there is no "try again."

Previously reported in Pass 1 (L-01) and Pass 4 (A05-PASS4-1). Persists.

---

### F-A05-P5-5 --- LOW --- Test retry delay mock does not verify the 10-second delay value

**Location:** `src/liquidity.test.ts:339-342`

```typescript
vi.spyOn(global, 'setTimeout').mockImplementation((fn: any) => {
    fn();
    return 0 as any;
});
```

The mock replaces `setTimeout` to execute callbacks immediately (necessary for fast tests), but never asserts the delay parameter. The test does not verify that `setTimeout` was called with `10_000` as the delay argument. If the delay were changed to 0 or any other value, all retry tests would still pass.

For a function whose documented contract includes "10s delay between retries," the delay value is part of the correctness claim. A mock that calls through immediately is fine, but should still assert the intended delay.

Previously reported in Pass 2 (F-02). Persists.

---

### F-A05-P5-6 --- LOW --- Test ABI verification uses `expect.any(Array)` instead of checking ABI contents

**Location:** `src/liquidity.test.ts:106`

```typescript
abi: expect.any(Array),
```

The test at line 80-111 ("should call multicall with correct parameters") verifies that multicall was called with the right blockNumber, multicallAddress, and pool addresses. However, the `abi` parameter is checked only as `expect.any(Array)`. This means:

1. If the ABI were accidentally changed (e.g., wrong function name, missing outputs), the test would still pass.
2. The function name `"slot0"` IS verified at line 108, which partially mitigates this.
3. But the ABI outputs (which determine how viem decodes the result) are never verified by any test.

The ABI is the critical link between the on-chain contract and the tick extraction at `result[1]`. If someone modified the ABI outputs, the test would not catch it. A snapshot assertion on the ABI or a check for the function name within the ABI would provide stronger regression protection.

---

### F-A05-P5-7 --- INFO --- All test mock data matches the slot0 return structure correctly

All 18 tests use mock result arrays with 7 elements in the correct order: `[sqrtPriceX96 (bigint), tick (number), observationIndex, observationCardinality, observationCardinalityNext, feeProtocol, unlocked (bool)]`. The tick values are at index 1 in all cases, consistent with the ABI and the `result[1]` extraction. No test has a malformed mock result that would mask a bug.

---

### F-A05-P5-8 --- INFO --- `getPoolsTickMulticall` failure classification logic is correct

The two-phase error handling (lines 83-103) correctly implements the documented intent:

1. **Phase 1 (lines 83-89):** Extract ticks from successful multicall results. Failures are skipped.
2. **Phase 2 (lines 91-103):** For each missing pool, check `getCode` at the same block:
   - No code (`"0x"` or `undefined`): pool not deployed yet -- silently skip (correct)
   - Has code: pool exists but slot0 failed -- throw error (correct)

This correctly distinguishes between pools that don't exist at a historical block and pools that exist but have a broken slot0. The tests cover all branches of this classification.

---

### F-A05-P5-9 --- INFO --- blockNumber validation in `getPoolsTick` is correct and complete

Line 120-122 validates `blockNumber` with:
```typescript
if (!Number.isInteger(blockNumber) || blockNumber < 0) {
    throw new Error(`Invalid blockNumber: ${blockNumber}`);
}
```

`Number.isInteger()` rejects: `NaN`, `Infinity`, `-Infinity`, fractional numbers, and non-number types (though TypeScript prevents the last case). The `< 0` check rejects negative integers. Together, these ensure `BigInt(blockNumber)` at line 126 will never throw. Block 0 is accepted, which is correct (genesis block). Tests cover `NaN` and `-1`.

---

## Summary

| ID | Severity | Title |
|----|----------|-------|
| F-A05-P5-1 | INFO | slot0 ABI matches canonical Uniswap V3; fork compatibility assumed |
| F-A05-P5-2 | MEDIUM | Downstream uses inclusive upper tick bound; Uniswap V3 uses exclusive |
| F-A05-P5-3 | LOW | result[1] magic index for tick extraction undocumented |
| F-A05-P5-4 | LOW | Retry sleeps 10s on final attempt before rethrowing (wasted time) |
| F-A05-P5-5 | LOW | Test retry delay mock never asserts the 10,000ms value |
| F-A05-P5-6 | LOW | Test ABI verification uses expect.any(Array) -- no ABI content check |
| F-A05-P5-7 | INFO | All test mock data correctly matches slot0 structure |
| F-A05-P5-8 | INFO | Failure classification logic (getCode check) is correct |
| F-A05-P5-9 | INFO | blockNumber validation is correct and complete |

**Total findings:** 9 (0 CRITICAL, 0 HIGH, 1 MEDIUM, 4 LOW, 4 INFO)

**Key correctness finding:** F-A05-P5-2 is the most significant discovery in this pass. While it technically resides in `processor.ts` (line 644), it directly concerns the correctness of how `liquidity.ts` tick data is consumed. The inclusive upper tick boundary comparison (`tick <= upperTick`) disagrees with Uniswap V3's exclusive upper bound convention (`tick < upperTick`), potentially over-crediting LP positions that sit exactly at the upper tick boundary.
