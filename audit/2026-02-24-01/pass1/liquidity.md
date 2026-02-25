# Security Audit Pass 1 -- `src/liquidity.ts`

**Auditor:** A05
**Date:** 2026-02-24
**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/liquidity.ts`
**Lines:** 109

---

## 1. Evidence of Thorough Reading

### Module

`src/liquidity.ts` -- Queries Uniswap V3 pool tick data via multicall at historical blocks. Imported by `src/processor.ts` at line 23.

### Imports

| Import | Source | Line |
|---|---|---|
| `PublicClient` | `viem` | 1 |

### ABI Definition

Lines 3-47: A single-function ABI constant (`abi`, typed `as const`) for the Uniswap V3 `slot0()` view function. Returns a 7-element tuple: `sqrtPriceX96` (uint160), `tick` (int24), `observationIndex` (uint16), `observationCardinality` (uint16), `observationCardinalityNext` (uint16), `feeProtocol` (uint8), `unlocked` (bool).

### Constants

| Constant | Line | Description |
|---|---|---|
| `0xcA11bde05977b3631167028862bE2a173976CA11` | 58 | Multicall3 canonical contract address (hardcoded) |
| `10_000` (ms) | 103 | Fixed retry delay between attempts |
| `3` (iterations) | 99 | Maximum number of attempts in retry loop |

### Exported Functions

| Function | Line | Signature | Description |
|---|---|---|---|
| `getPoolsTickMulticall` | 49 | `(client: PublicClient, pools: 0x${string}[], blockNumber: bigint) => Promise<Record<string, number>>` | Single-attempt multicall of `slot0()` across all pools, followed by `getCode` check on failures to distinguish undeployed pools from real errors. |
| `getPoolsTick` | 93 | `(client: PublicClient, pools: 0x${string}[], blockNumber: number) => Promise<Record<string, number>>` | Retry wrapper around `getPoolsTickMulticall`. Up to 3 attempts with a fixed 10-second delay. |

---

## 2. Security Findings

### A05-1: Fixed Retry Delay, Not Exponential Backoff (INFO)

**Severity:** INFO
**Location:** Line 103

**Description:** The `CLAUDE.md` project documentation states "3 retries with exponential backoff," but the actual implementation uses a fixed 10-second delay between retries (`setTimeout` with `10_000` ms). This is a documentation inaccuracy rather than a code bug. A fixed delay is acceptable for this use case (querying historical chain state that is deterministic and unlikely to change between retries), though exponential backoff would be more resilient against rate-limited or overloaded RPC providers.

**Impact:** Low. The fixed delay still provides meaningful spacing between retries. The primary risk is hammering a rate-limited RPC endpoint at a constant rate instead of backing off.

**Recommendation:** Either update `CLAUDE.md` to say "fixed 10-second delay" or implement actual exponential backoff (e.g., 5s, 10s, 20s).

---

### A05-2: Sequential `getCode` Calls for Missing Pools (LOW)

**Severity:** LOW
**Location:** Lines 78-83

**Description:** When multicall results contain failures, the code checks each missing pool sequentially with `await client.getCode(...)` in a `for` loop. If many pools fail simultaneously (e.g., an RPC issue causing all multicalls to return failure), this creates N sequential RPC calls with no parallelism and no individual timeout or retry logic. Each `getCode` call depends on viem's default timeout behavior.

**Impact:** If there are many pools and the multicall fails broadly (e.g., 50+ pools), this becomes a serial chain of RPC calls that could take a long time. Since the outer `getPoolsTick` has a retry loop, a slow sequence of `getCode` calls compounds the total wait time (up to 3 x (slow getCode chain + 10s)).

**Recommendation:** Use `Promise.all` to parallelize `getCode` calls:
```typescript
const codeResults = await Promise.all(
  missingPools.map(pool =>
    client.getCode({ address: pool, blockNumber }).then(code => ({ pool, code }))
  )
);
const realFailures = codeResults
  .filter(({ code }) => code && code !== "0x")
  .map(({ pool }) => pool);
```

---

### A05-3: No Timeout on Individual RPC Calls (LOW)

**Severity:** LOW
**Location:** Lines 55-66, 79

**Description:** Neither the `multicall` invocation (line 55) nor the `getCode` calls (line 79) specify an explicit timeout. They rely entirely on the viem `PublicClient`'s default transport timeout configuration. If the RPC node hangs or is unresponsive, these calls could block indefinitely (or until the transport-level timeout fires, which may be very long depending on configuration).

The 10-second retry delay (line 103) is independent of the call itself -- it only fires after the call completes or throws.

**Impact:** A hanging RPC node could stall the entire rewards pipeline indefinitely. The retry logic in `getPoolsTick` does not protect against calls that never resolve.

**Recommendation:** Ensure the viem `PublicClient` is configured with a reasonable transport timeout (e.g., 30 seconds), or wrap the multicall in a `Promise.race` with an explicit timeout. This is more of a configuration concern at the call site rather than in this module directly.

---

### A05-4: `getCode` Returns `undefined` May Pass Deployed Check (LOW)

**Severity:** LOW
**Location:** Line 80

**Description:** The check `if (code && code !== "0x")` treats falsy values (`undefined`, `null`, `""`) and the string `"0x"` as indicators of an undeployed contract. According to viem's documentation, `getCode` returns `Hex | undefined`. The current check handles all known return values correctly:
- `undefined` -> falsy -> not a real failure (skipped)
- `"0x"` -> explicitly checked -> not a real failure (skipped)
- Any bytecode string -> truthy and not `"0x"` -> real failure

This is correct as written. However, if a viem version changes the return value semantics (e.g., returns `null`), the check would still be safe because `null` is falsy.

**Impact:** None currently. This is defensive and correct.

**Recommendation:** No action required. Noting for completeness.

---

### A05-5: Unreachable Error on Line 108 (INFO)

**Severity:** INFO
**Location:** Line 108

**Description:** The `throw new Error("failed to get pools ticks")` at line 108 is unreachable code. The `for` loop from lines 99-106 will always either: (a) return successfully from line 101, or (b) re-throw the caught error at line 104 when `i >= 2`. There is no code path that exits the loop without returning or throwing.

TypeScript may not detect this as unreachable because the loop's control flow analysis is not exhaustive for this pattern. The dead code is harmless but indicates the developer may not have fully reasoned through the loop's exit conditions.

**Impact:** None. The line is never executed.

**Recommendation:** Remove the unreachable line or add a comment explaining it exists as a TypeScript type-system satisfier (to ensure the function always returns or throws from TypeScript's perspective).

---

### A05-6: No Validation of `blockNumber` Parameter in `getPoolsTick` (LOW)

**Severity:** LOW
**Location:** Line 96, 101

**Description:** `getPoolsTick` accepts `blockNumber` as `number` and converts it to `BigInt` at line 101 via `BigInt(blockNumber)`. There is no validation that `blockNumber` is a positive integer. If called with:
- A negative number: `BigInt(-1)` would query a nonsensical block.
- A non-integer float: `BigInt(1.5)` throws a `RangeError` at runtime ("The number 1.5 cannot be converted to a BigInt because it is not an integer").
- `NaN`: `BigInt(NaN)` throws a `RangeError`.
- `Infinity`: `BigInt(Infinity)` throws a `RangeError`.

The caller (`processor.ts` line 582) passes `block` which is a snapshot block number from `this.snapshots`, an array of numbers produced by `generateSnapshotBlocks()` in config. These are expected to always be valid positive integers derived from `START_SNAPSHOT` and `END_SNAPSHOT` environment variables.

**Impact:** Low. The caller is trusted and expected to provide valid block numbers. Invalid inputs would cause a runtime crash with a somewhat confusing `RangeError` rather than a descriptive error message.

**Recommendation:** No change strictly required given the trusted call site. Optionally, add a guard:
```typescript
if (!Number.isInteger(blockNumber) || blockNumber < 0) {
  throw new Error(`Invalid block number: ${blockNumber}`);
}
```

---

### A05-7: Type Mismatch Between `getPoolsTickMulticall` and `getPoolsTick` (INFO)

**Severity:** INFO
**Location:** Lines 52, 96

**Description:** `getPoolsTickMulticall` accepts `blockNumber: bigint` while `getPoolsTick` accepts `blockNumber: number` and converts with `BigInt(blockNumber)`. This inconsistency means:
1. Callers using `getPoolsTick` are limited to `Number.MAX_SAFE_INTEGER` (2^53 - 1) for block numbers, which is astronomically large and not a practical concern for any blockchain.
2. The two exported functions have different type signatures for the same conceptual parameter, which is a minor API design inconsistency.

**Impact:** None in practice. Block numbers on any existing blockchain are well within safe integer range.

**Recommendation:** Consider making both functions accept the same type for consistency. Low priority.

---

### A05-8: Multicall Address Hardcoded Rather Than Configurable (INFO)

**Severity:** INFO
**Location:** Line 58

**Description:** The Multicall3 contract address `0xcA11bde05977b3631167028862bE2a173976CA11` is hardcoded in the function body. This is the canonical Multicall3 address deployed at the same CREATE2 address across virtually all EVM chains, including Flare. The address is correct.

However, it is not defined in `config.ts` alongside other contract addresses (like `REWARDS_SOURCES`, `FACTORIES`, etc.), which is a minor inconsistency in where contract addresses are managed.

**Impact:** None. The address is immutable and universally deployed.

**Recommendation:** Optionally move to `config.ts` for consistency. Very low priority.

---

### A05-9: No Rate Limiting or Concurrency Control on RPC Calls (LOW)

**Severity:** LOW
**Location:** Lines 55, 79

**Description:** This module makes RPC calls without any rate limiting. The `multicall` on line 55 is a single batched call (good), but the `getCode` follow-up calls on line 79 are sequential (see A05-2). Neither path has any concurrency control or rate limiting mechanism.

In the broader pipeline context, `getPoolsTick` is called once per snapshot block in `processor.ts` (line 582), and there are 30 snapshot blocks. Each call may trigger a multicall plus multiple `getCode` calls. If the RPC provider enforces rate limits, the pipeline could encounter 429 errors that are not handled with any backoff strategy (only the coarse 3-retry with 10-second delay).

**Impact:** Moderate risk of RPC rate-limit errors during pipeline execution if the provider is restrictive. The retry logic provides some resilience, but the fixed delay may not be sufficient for aggressive rate limiters.

**Recommendation:** Consider implementing rate-aware retry logic or configuring the viem transport with built-in rate limiting.

---

## 3. Summary

| ID | Severity | Title |
|---|---|---|
| A05-1 | INFO | Fixed retry delay, not exponential backoff (documentation mismatch) |
| A05-2 | LOW | Sequential `getCode` calls for missing pools |
| A05-3 | LOW | No timeout on individual RPC calls |
| A05-4 | LOW | `getCode` return value handling (correct, noted for completeness) |
| A05-5 | INFO | Unreachable error on line 108 |
| A05-6 | LOW | No validation of `blockNumber` parameter |
| A05-7 | INFO | Type mismatch between exported functions |
| A05-8 | INFO | Multicall address hardcoded rather than in config |
| A05-9 | LOW | No rate limiting or concurrency control on RPC calls |

**Overall Assessment:** The module is well-structured and reasonably defensive. It correctly uses `allowFailure: true` on multicall to avoid a single pool failure from crashing the entire batch, and it correctly differentiates undeployed pools from genuine slot0 call failures via `getCode`. No CRITICAL or HIGH severity issues were found. The findings are primarily LOW and INFO, relating to robustness improvements (parallelizing getCode, adding timeouts, input validation) and minor inconsistencies (documentation, types, config location). The core logic for fetching and returning tick data is correct.
