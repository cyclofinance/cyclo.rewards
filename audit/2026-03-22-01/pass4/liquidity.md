# Audit Pass 4 -- Code Quality -- `src/liquidity.ts`

**Agent:** A05
**Date:** 2026-03-22
**Audit ID:** 2026-03-22-01
**File:** `src/liquidity.ts` (134 lines)

---

## Evidence of Thorough Reading

Every exported symbol, function, constant, and notable code structure:

| Symbol | Line | Kind | Description |
|--------|------|------|-------------|
| `MULTICALL3_ADDRESS` | 8 | exported const | Canonical Multicall3 address (as const) |
| `abi` | 11-55 | module-level const | Uniswap V3 pool `slot0` ABI (as const) |
| `getPoolsTickMulticall` | 65-106 | exported async function | Multicall for pool ticks at a block; distinguishes undeployed pools from real failures via `getCode` |
| `getPoolsTick` | 115-134 | exported async function | Retry wrapper (3 attempts, fixed 10s delay) around `getPoolsTickMulticall` |

Imports: `PublicClient` from `viem` (line 5).

---

## Findings

### A05-PASS4-1 --- MEDIUM --- Fixed 10-second retry delay; CLAUDE.md previously documented as "exponential backoff"

**Location:** Line 128

```typescript
await new Promise((resolve) => setTimeout(() => resolve(""), 10_000)) // wait 10 secs and try again
```

The retry delay is a constant 10 seconds on every attempt. CLAUDE.md has since been corrected to say "fixed 10-second delay between retries," so the documentation mismatch from prior audits (2026-02-23-01 A05-3, 2026-02-24-01 A05-1) is resolved. However, the underlying design concern remains: a fixed-interval retry provides no progressive backoff under sustained RPC congestion, unlike `processor.ts` which uses `Math.pow(2, attempt) * 500` (actual exponential backoff via `RETRY_BASE_DELAY_MS`). For a financial rewards pipeline, exponential backoff is the more robust strategy.

Additionally, the retry count (3) and delay (10000ms) are magic numbers. `constants.ts` already defines `RETRY_BASE_DELAY_MS = 500` for the processor's retry logic. This module ignores that constant and uses its own hardcoded 10-second value.

---

### A05-PASS4-2 --- LOW --- Misleading comment: "retry 3 times" is actually 3 total attempts (2 retries)

**Location:** Lines 109, 123-124

```typescript
/**
 * Fetches pool ticks with retry logic (3 attempts, 10s delay between retries).
 ```

The JSDoc on line 109 now correctly says "3 attempts" (fixed since the prior audit). However, the inline comment on line 124 still reads:

```typescript
    // retry 3 times
    for (let i = 0; i < 3; i++) {
```

"retry 3 times" implies 3 retries = 4 total attempts. The loop runs 3 total iterations, so there are at most 2 retries. The inline comment contradicts the now-accurate JSDoc.

---

### A05-PASS4-3 --- LOW --- Inconsistent `blockNumber` parameter type between the two exported functions

**Location:** Line 68 vs. line 118

`getPoolsTickMulticall` accepts `blockNumber: bigint` (line 68). `getPoolsTick` accepts `blockNumber: number` (line 118) and converts via `BigInt(blockNumber)` on line 126. These are tightly coupled functions in the same 134-line module -- the second is a thin retry wrapper around the first.

The mismatch forces the boundary conversion `BigInt(blockNumber)` to exist inside `getPoolsTick`. The caller in `processor.ts` (line 625) passes a `number` from the snapshot blocks array. viem's convention is `bigint` for block numbers. The codebase should pick one convention at this interface boundary.

---

### A05-PASS4-4 --- LOW --- Promise `resolve("")` passes an unused empty string

**Location:** Line 128

```typescript
await new Promise((resolve) => setTimeout(() => resolve(""), 10_000))
```

The `resolve("")` passes an empty string that is never used. The idiomatic pattern is `await new Promise(resolve => setTimeout(resolve, 10_000))`. This is a minor style issue, but it is the only `Promise` construction in the codebase that passes a value to `resolve` for a delay pattern. `setTimeout(resolve, delay)` is the standard idiom.

---

### A05-PASS4-5 --- LOW --- Magic numbers for retry count and delay

**Location:** Lines 124, 128, 129

```typescript
    for (let i = 0; i < 3; i++) {
        try {
            return await getPoolsTickMulticall(client, pools, BigInt(blockNumber))
        } catch (error) {
            await new Promise((resolve) => setTimeout(() => resolve(""), 10_000))
            if (i >= 2) throw error;
        }
    }
```

Three magic numbers: `3` (max attempts), `10_000` (delay ms), and `2` (last-attempt index, which is `3 - 1`). `constants.ts` already defines `RETRY_BASE_DELAY_MS = 500` for retry delays elsewhere, but this function ignores it. Extracting named constants (e.g., `LIQUIDITY_MAX_ATTEMPTS = 3`, `LIQUIDITY_RETRY_DELAY_MS = 10_000`) would make the retry policy self-documenting and centrally configurable.

The relationship between `3` in the loop guard and `2` in the throw guard is an implicit `MAX - 1` dependency that would break silently if someone changed one without the other.

---

### A05-PASS4-6 --- INFO --- Unreachable throw at end of `getPoolsTick`

**Location:** Line 133

```typescript
    throw new Error("failed to get pools ticks");
```

This is unreachable. The loop either returns on success or throws the caught error when `i >= 2`. The statement exists to satisfy TypeScript's return type analysis. The error message ("failed to get pools ticks") differs from the actual error that would propagate (the caught RPC error), which could mislead debugging if it were ever reached. A comment like `// unreachable -- satisfies TypeScript return type` would clarify intent.

---

### A05-PASS4-7 --- INFO --- Inline ABI definition occupies 45 of 134 lines (34% of the file)

**Location:** Lines 11-55

The `slot0` ABI is a 45-line JSON-style constant that dominates the file. It is used exactly once (line 77). viem's `parseAbi` would reduce this to a single line:

```typescript
const abi = parseAbi([
  'function slot0() view returns (uint160, int24, uint16, uint16, uint16, uint8, bool)'
]);
```

This is a stylistic observation. The current form is valid and provides named parameters, which is arguably more readable.

---

### A05-PASS4-8 --- INFO --- No logging for silently skipped undeployed pools

**Location:** Lines 91-103

When a pool has no code deployed at the queried block, it is silently excluded from the result. The `getCode` check (lines 94-98) correctly distinguishes undeployed pools from real failures, but produces no diagnostic output. In a rewards context, an unexpectedly undeployed pool could silently affect LP range calculations downstream.

The prior audits (2026-02-23-01 A05-8, 2026-02-24-01 A05-9) flagged this identically. The codebase generally does not use a logging framework, so adding `console.log` would be inconsistent unless a project-wide logging strategy is adopted.

---

### A05-PASS4-9 --- INFO --- Positive: no dead code, no commented-out code, no unused imports

The file has no dead code, no commented-out blocks, no unused imports, and no unused variables. Both exported functions are actively consumed (`getPoolsTick` by `processor.ts` line 27; `MULTICALL3_ADDRESS` by tests). The `abi` constant is used exactly once. JSDoc comments are present on all exported symbols. This is clean.

---

## Summary

| ID | Severity | Title |
|----|----------|-------|
| A05-PASS4-1 | MEDIUM | Fixed retry delay; no exponential backoff; magic delay value |
| A05-PASS4-2 | LOW | Inline comment "retry 3 times" contradicts JSDoc "3 attempts" |
| A05-PASS4-3 | LOW | Inconsistent `blockNumber` type (`number` vs `bigint`) |
| A05-PASS4-4 | LOW | Unused `resolve("")` value in delay promise |
| A05-PASS4-5 | LOW | Magic numbers for retry count and delay |
| A05-PASS4-6 | INFO | Unreachable throw statement |
| A05-PASS4-7 | INFO | Inline ABI definition (34% of file) |
| A05-PASS4-8 | INFO | Silent skip of undeployed pools (no logging) |
| A05-PASS4-9 | INFO | Positive: no dead code or unused imports |

**Total findings:** 9 (0 CRITICAL, 0 HIGH, 1 MEDIUM, 4 LOW, 4 INFO)

**Delta from prior audits:** The CLAUDE.md documentation mismatch (previously MEDIUM) has been corrected. The `blockNumber` validation guard (line 120-122) was added since the 2026-02-23 audit. `MULTICALL3_ADDRESS` was extracted to a named export (previously inline). The `getPoolsTick` retry wrapper now has test coverage in `liquidity.test.ts` (lines 334-397), resolving prior INFO findings. The remaining findings are persistent style/design issues that have carried through multiple audit passes.
