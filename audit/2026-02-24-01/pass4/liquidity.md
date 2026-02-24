# Audit Report: src/liquidity.ts

**Audit ID:** 2026-02-24-01
**Pass:** 4 (Code Quality)
**Agent:** A05
**File:** `src/liquidity.ts` (109 lines)
**Date:** 2026-02-24

---

### A05-1 --- MEDIUM --- Fixed 10-second retry delay documented as "exponential backoff" in CLAUDE.md

**Location:** Line 103; `CLAUDE.md` line 35

`CLAUDE.md` states:

> `src/liquidity.ts` -- Queries Uniswap V3 pool tick data via multicall at specific blocks. Uses 3 retries with exponential backoff.

The actual implementation uses a constant 10-second delay on every retry:

```typescript
await new Promise((resolve) => setTimeout(() => resolve(""), 10_000)) // wait 10 secs and try again
```

The delay does not vary with the retry iteration index `i`. All retry waits are exactly 10 seconds. This is a fixed-interval retry, not exponential backoff. True exponential backoff would increase the delay geometrically (e.g., 10s, 20s, 40s).

This is a documentation accuracy issue. For a financial rewards distribution pipeline, accurate documentation of retry behavior matters because it affects how the system handles RPC node congestion or rate limiting. Under sustained load, fixed delays provide less recovery time than exponential backoff, where later retries wait progressively longer.

By contrast, `processor.ts` implements actual exponential backoff in its `isApprovedSource` method (line 115: `Math.pow(2, attempt) * 1000` ms), so the pattern exists in the codebase but was not applied here.

**Recommendation:** Either implement actual exponential backoff:
```typescript
const delay = 10_000 * Math.pow(2, i); // 10s, 20s, 40s
await new Promise((resolve) => setTimeout(resolve, delay));
```
Or correct `CLAUDE.md` to say "fixed 10-second delay between retries."

---

### A05-2 --- LOW --- JSDoc and inline comment overstate retry count: "3 retries" vs. 3 total attempts

**Location:** Lines 92, 98-99

```typescript
/** Tries to get pools ticks (with max 3 retries) */   // Line 92
export async function getPoolsTick(...) {
    // retry 3 times                                     // Line 98
    for (let i = 0; i < 3; i++) {                       // Line 99
```

The loop runs 3 iterations total: 1 initial attempt + 2 retries. The guard `if (i >= 2) throw error` on line 104 confirms the third iteration (i=2) is the final one. "3 retries" implies 4 total attempts (1 original + 3 retries), which does not match the code.

**Recommendation:** Update the JSDoc to `/** Tries to get pool ticks (up to 3 attempts) */` and the inline comment to `// up to 3 attempts`.

---

### A05-3 --- LOW --- Inconsistent `blockNumber` parameter type between `getPoolsTickMulticall` and `getPoolsTick`

**Location:** Line 52 vs. line 96

`getPoolsTickMulticall` accepts `blockNumber: bigint` (line 52). `getPoolsTick` accepts `blockNumber: number` (line 96) and converts via `BigInt(blockNumber)` on line 101. These are tightly coupled functions in the same module -- `getPoolsTick` is a thin retry wrapper around `getPoolsTickMulticall`.

The mismatch exists because the caller in `processor.ts` stores snapshot blocks as `number[]` (from `generateSnapshotBlocks` in `config.ts`). This is a design-level inconsistency: block numbers on Flare (currently in the 50M+ range) fit within JavaScript's safe integer range, so `number` works, but viem's API expects `bigint` for block numbers. The conversion happens at the boundary between these two conventions.

**Recommendation:** Standardize on one type. Accepting `bigint` in both functions and having the caller in `processor.ts` convert would be consistent with viem's conventions. Alternatively, accept `number` in both and convert only at the viem call site.

---

### A05-4 --- LOW --- Hardcoded Multicall3 contract address

**Location:** Line 58

```typescript
multicallAddress: "0xcA11bde05977b3631167028862bE2a173976CA11",
```

The Multicall3 contract address is hardcoded inline. This address is the canonical Multicall3 deployment (same address on all EVM chains including Flare), but other contract addresses in the project are centralized in `config.ts` (e.g., `REWARDS_SOURCES`, `FACTORIES`, `RPC_URL`). The viem client also has default multicall support when configured with a chain, so specifying the address manually may not be necessary if the client is properly chain-aware.

This is a minor consistency observation. The address is correct and will not change.

**Recommendation:** Consider moving the address to `config.ts` alongside other contract addresses for discoverability, or relying on viem's built-in multicall address resolution if the client is configured with the Flare chain definition.

---

### A05-5 --- INFO --- Unreachable `throw` statement at end of `getPoolsTick`

**Location:** Line 108

```typescript
    throw new Error("failed to get pools ticks");
```

This statement is unreachable. The `for` loop (lines 99-106) will always either `return` on success (line 101) or `throw error` on the final iteration when `i >= 2` (line 104). The loop cannot exit normally because every iteration either returns or throws (on the last one). This exists as a TypeScript safety net to satisfy the return type requirement.

The error message `"failed to get pools ticks"` differs from the actual error that would be thrown (the caught RPC error), which could be confusing during debugging if it were ever somehow reached.

**Recommendation:** Add a clarifying comment: `// unreachable -- satisfies TypeScript return type requirement`. This is acceptable as-is.

---

### A05-6 --- INFO --- Promise resolve value `""` in retry delay is unused

**Location:** Line 103

```typescript
await new Promise((resolve) => setTimeout(() => resolve(""), 10_000))
```

The empty string passed to `resolve("")` is never used. The idiomatic pattern is:

```typescript
await new Promise((resolve) => setTimeout(resolve, 10_000));
```

This is a trivial stylistic point with no functional impact.

---

### A05-7 --- INFO --- Inline ABI definition occupies 44 of 109 lines (40% of the file)

**Location:** Lines 3-47

The `slot0` ABI is defined as an inline constant. It is the only ABI in the file and is used only by `getPoolsTickMulticall`. While functional, this 44-line JSON-like block makes the file harder to scan at a glance. Other projects extract ABIs into dedicated files or use viem's `parseAbi` for compact inline definitions:

```typescript
const abi = parseAbi([
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)'
]);
```

**Recommendation:** This is a minor stylistic observation. Acceptable as-is for a single-ABI file.

---

### A05-8 --- INFO --- No test coverage for `getPoolsTick` retry wrapper

**Location:** `src/liquidity.test.ts`

The test file imports and tests only `getPoolsTickMulticall`. The `getPoolsTick` function -- the public API that the rest of the codebase calls (imported in `processor.ts` line 23) -- has no dedicated tests. The following behaviors are untested:

1. Successful return on first attempt (no retry triggered).
2. Failure on first attempt, success on second attempt.
3. Failure on all 3 attempts with error propagation.
4. The 10-second delay between retries.
5. The `number`-to-`bigint` conversion of `blockNumber`.

In `processor.test.ts`, `getPoolsTick` is mocked entirely (`vi.mock("./liquidity")`), so the processor tests do not exercise the retry logic either.

**Recommendation:** Add unit tests for `getPoolsTick` using `vi.useFakeTimers()` and a mock of `getPoolsTickMulticall` to verify retry behavior, delay timing, and error propagation.

---

### A05-9 --- INFO --- Silent skip of failed pool calls with no logging

**Location:** Lines 67-73

```typescript
for (let i = 0; i < results.length; i++) {
    const res = results[i];
    const pool = pools[i].toLowerCase();
    if (res.status === "success") {
        ticks[pool] = res.result[1];
    }
}
```

When a pool's multicall result has a non-success status, it is silently omitted from the result. The subsequent check (lines 75-87) correctly distinguishes between "not yet deployed" pools (no code at that block) and "deployed but failed" pools, throwing only for the latter. However, the "not yet deployed" case produces no log output. In a rewards context, if a pool is unexpectedly not deployed at a given block, this could affect LP range calculations downstream without any diagnostic trace.

**Recommendation:** Consider logging skipped pools at debug/info level for operational observability.

---

### A05-10 --- INFO --- No commented-out code or dead code detected (positive observation)

The file contains no commented-out code, no unused imports, no unused functions, and no dead branches. Both exported functions are actively consumed by the codebase. The `abi` constant is used exactly once. This is clean.

---

## Summary

| ID | Severity | Title |
|----|----------|-------|
| A05-1 | MEDIUM | Fixed 10-second delay documented as "exponential backoff" |
| A05-2 | LOW | JSDoc and inline comment overstate retry count |
| A05-3 | LOW | Inconsistent `blockNumber` parameter type (`number` vs `bigint`) |
| A05-4 | LOW | Hardcoded Multicall3 contract address |
| A05-5 | INFO | Unreachable throw statement (TypeScript safety net) |
| A05-6 | INFO | Unused promise resolve value `""` in delay |
| A05-7 | INFO | Inline ABI definition (40% of file) |
| A05-8 | INFO | No test coverage for `getPoolsTick` retry wrapper |
| A05-9 | INFO | Silent skip of failed pool calls with no logging |
| A05-10 | INFO | No commented-out code or dead code (positive) |

**Total findings:** 10 (0 HIGH, 1 MEDIUM, 3 LOW, 6 INFO)

**Overall Assessment:** The file is compact, focused, and functionally correct. At 109 lines it has a single responsibility: querying Uniswap V3 pool tick data via multicall with retry logic. The most substantive finding is the documentation mismatch between the claimed "exponential backoff" and the actual fixed-delay retry (A05-1), which is a recurring finding across audit passes. The inconsistent `blockNumber` type (A05-3) is a minor design-level concern that reflects a broader tension between the codebase's use of `number` for block numbers and viem's expectation of `bigint`. No commented-out code, dead code, or import side effects were found.
