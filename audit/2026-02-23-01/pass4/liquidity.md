# Audit Pass 4 — Code Quality — `src/liquidity.ts`

**Agent:** A05
**Date:** 2026-02-23
**Audit ID:** 2026-02-23-01
**File:** `src/liquidity.ts` (96 lines)

---

### A05-1 — LOW — JSDoc comment says "max 3 retries" but the logic performs 3 total attempts (2 retries)

**Location:** Line 78 and line 84-85

The JSDoc on line 78 says "with max 3 retries" and the inline comment on line 84 says "retry 3 times." However, the loop `for (let i = 0; i < 3; i++)` executes the call 3 times total (1 initial attempt + 2 retries), not 3 retries. The `throw` guard on line 91 (`if (i >= 2) throw error`) confirms the third attempt is the last. The terminology is ambiguous/misleading: "3 retries" implies 4 total attempts, while the actual behavior is 3 total attempts.

```typescript
/** Tries to get pools ticks (with max 3 retries) */  // Says "3 retries"
export async function getPoolsTick(...) {
    // retry 3 times                                    // Says "3 times"
    for (let i = 0; i < 3; i++) {                      // Actually 3 attempts total
```

**Recommendation:** Clarify the comment to say "with up to 3 attempts" or "with up to 2 retries," or change the loop to match the documented intent.

---

### A05-2 — LOW — Inconsistent parameter type: `blockNumber` is `number` in `getPoolsTick` but `bigint` in `getPoolsTickMulticall`

**Location:** Lines 52 and 82

`getPoolsTickMulticall` accepts `blockNumber: bigint` (line 52), while `getPoolsTick` accepts `blockNumber: number` (line 82) and converts it via `BigInt(blockNumber)` on line 87. The caller in `processor.ts` passes a `number` to `getPoolsTick`. This inconsistency is not a bug, but it creates an unnecessary type mismatch between two tightly coupled functions in the same module.

```typescript
// getPoolsTickMulticall signature
export async function getPoolsTickMulticall(
    client: PublicClient,
    pools: `0x${string}`[],
    blockNumber: bigint,          // bigint
): Promise<Record<string, number>> {

// getPoolsTick signature
export async function getPoolsTick(
    client: PublicClient,
    pools: `0x${string}`[],
    blockNumber: number,          // number
): Promise<Record<string, number>> {
```

**Recommendation:** Standardize on one type. Either accept `bigint` in both (and have the caller convert) or accept `number` in both (and convert internally in `getPoolsTickMulticall`).

---

### A05-3 — LOW — Fixed 10-second delay without exponential backoff despite CLAUDE.md stating exponential backoff is used

**Location:** Line 89

The `CLAUDE.md` project documentation states: "Uses 3 retries with exponential backoff." However, the actual implementation uses a fixed 10-second delay on every retry iteration:

```typescript
await new Promise((resolve) => setTimeout(() => resolve(""), 10_000)) // wait 10 secs and try again
```

This is a constant backoff, not exponential. True exponential backoff would increase the delay with each retry (e.g., 10s, 20s, 40s).

**Recommendation:** Either implement actual exponential backoff (e.g., `10_000 * 2 ** i`) or correct the documentation in `CLAUDE.md`.

---

### A05-4 — INFO — Redundant unreachable `throw` statement at end of `getPoolsTick`

**Location:** Line 94

The `throw new Error("failed to get pools ticks")` on line 94 is unreachable. The loop from lines 85-92 will always either `return` on success or `throw error` on the final iteration (when `i >= 2`). The only way to exit the loop normally would be if the loop body neither returned nor threw, but the `try` block always returns on success, and the `catch` block always throws when `i >= 2`. TypeScript likely requires this for type-checking (the function must return or throw), but the error message is distinct from the actual error that would be thrown on line 91, which could be confusing if it were ever somehow reached.

```typescript
    for (let i = 0; i < 3; i++) {
        try {
            return await getPoolsTickMulticall(client, pools, BigInt(blockNumber))
        } catch (error) {
            await new Promise((resolve) => setTimeout(() => resolve(""), 10_000))
            if (i >= 2) throw error;
        }
    }

    throw new Error("failed to get pools ticks");  // unreachable
```

**Recommendation:** This is acceptable as a TypeScript exhaustiveness guard. Consider adding a comment such as `// unreachable — satisfies TypeScript return type` for clarity.

---

### A05-5 — INFO — Inline ABI definition rather than separate constant or import

**Location:** Lines 3-47

The `slot0` ABI is defined as an inline constant at the module top level. This is a 44-line block that dominates the file. While functional, other files in the project (e.g., `config.ts`) keep configuration data in dedicated modules. The ABI is a static configuration artifact and could be extracted.

**Recommendation:** This is a minor stylistic observation. For a single-ABI file this is acceptable. If more ABIs are needed in the future, consider extracting to an `abis/` directory or a shared `abi.ts` module.

---

### A05-6 — INFO — Promise resolve value `""` in retry delay is unnecessary

**Location:** Line 89

```typescript
await new Promise((resolve) => setTimeout(() => resolve(""), 10_000))
```

The `resolve("")` passes an empty string as the resolution value, but this value is never used. The idiomatic pattern is:

```typescript
await new Promise((resolve) => setTimeout(resolve, 10_000))
```

This is a trivial stylistic inconsistency with no functional impact.

---

### A05-7 — INFO — No test coverage for `getPoolsTick` retry wrapper

**Location:** `src/liquidity.test.ts`

The test file only covers `getPoolsTickMulticall`. The `getPoolsTick` function, which contains the retry logic, has no dedicated tests. Retry behavior (correct number of attempts, delay between retries, error propagation on final attempt) is untested.

**Recommendation:** Add tests for `getPoolsTick` that verify: (a) it returns successfully on first attempt, (b) it retries on failure and succeeds on a subsequent attempt, (c) it throws the underlying error after all attempts are exhausted, and (d) it calls the delay between retries.

---

### A05-8 — INFO — Silent failure for individual pool calls with no logging

**Location:** Lines 67-73

When a pool's multicall result has a non-success status, it is silently skipped:

```typescript
for (let i = 0; i < results.length; i++) {
    const res = results[i];
    const pool = pools[i].toLowerCase();
    if (res.status === "success") {
        ticks[pool] = res.result[1];
    }
}
```

There is no logging or warning when a pool call fails. In a rewards distribution context, silently missing tick data for a pool could lead to incorrect LP position range calculations downstream, potentially affecting reward amounts. The caller has no way to distinguish "no pools responded" from "all pools have no data."

**Recommendation:** Consider logging a warning when `res.status !== "success"` to aid debugging, or returning metadata about which pools failed.

---

## Summary

| ID | Severity | Title |
|----|----------|-------|
| A05-1 | LOW | Misleading retry count in comments |
| A05-2 | LOW | Inconsistent `blockNumber` parameter types |
| A05-3 | LOW | Fixed delay documented as exponential backoff |
| A05-4 | INFO | Unreachable throw statement |
| A05-5 | INFO | Inline ABI definition |
| A05-6 | INFO | Unnecessary resolve value in delay promise |
| A05-7 | INFO | No test coverage for retry wrapper |
| A05-8 | INFO | Silent failure for individual pool calls |

**Overall Assessment:** The file is compact (96 lines), focused, and functionally correct. The main substantive concerns are the misleading retry-count comments (A05-1), the inconsistency between documented and actual backoff behavior (A05-3), and the lack of test coverage for the retry wrapper (A05-7). No commented-out code was found. Naming conventions are consistent with the rest of the codebase.
