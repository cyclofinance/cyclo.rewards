# Pass 1: Security Review -- `src/liquidity.ts`

**Auditor:** A05
**Date:** 2026-03-22
**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/liquidity.ts` (135 lines)

---

## Evidence of Reading

**Module purpose:** Queries Uniswap V3 pool tick data via multicall for in-range LP position calculations.

### Exports

| Name | Kind | Line |
|------|------|------|
| `MULTICALL3_ADDRESS` | `const` (address literal) | 8 |
| `getPoolsTickMulticall` | `async function` | 65 |
| `getPoolsTick` | `async function` | 115 |

### Non-exported declarations

| Name | Kind | Line |
|------|------|------|
| `abi` | `const` (slot0 ABI array) | 11 |

### Imports

| Import | From | Line |
|--------|------|------|
| `PublicClient` | `viem` | 5 |

### Constants

- `MULTICALL3_ADDRESS` (line 8): `"0xcA11bde05977b3631167028862bE2a173976CA11"` -- canonical Multicall3 address.

### Function signatures and logic

1. **`getPoolsTickMulticall(client, pools, blockNumber)`** (lines 65-106)
   - Parameters: `client: PublicClient`, `pools: \`0x${string}\`[]`, `blockNumber: bigint`
   - Returns: `Promise<Record<string, number>>` -- lowercase pool address to tick
   - Calls `client.multicall` with `allowFailure: true` (line 73)
   - Iterates results, extracts `result[1]` (tick) for successful calls (lines 83-89)
   - For missing pools, checks `client.getCode` to distinguish undeployed pools from real failures (lines 91-103)
   - Throws if any deployed pool fails slot0 (line 101)

2. **`getPoolsTick(client, pools, blockNumber)`** (lines 115-134)
   - Parameters: `client: PublicClient`, `pools: \`0x${string}\`[]`, `blockNumber: number`
   - Returns: `Promise<Record<string, number>>`
   - Validates `blockNumber` is a non-negative integer (line 120-122)
   - Retry loop: 3 attempts with 10-second delay between retries (lines 124-131)
   - Converts `blockNumber` from `number` to `bigint` before calling `getPoolsTickMulticall` (line 126)
   - Throws original error after 3 failures (line 129)
   - Unreachable final throw at line 133 as safety net

---

## Findings

### L-01: Retry sleeps even on the final failed attempt before rethrowing [LOW]

**Location:** Lines 127-129

```typescript
} catch (error) {
    await new Promise((resolve) => setTimeout(() => resolve(""), 10_000)) // wait 10 secs and try again
    if (i >= 2) throw error;
}
```

The 10-second sleep executes on every caught error, including the third and final attempt (`i === 2`). The code sleeps for 10 seconds, then immediately throws. This means the final failure always costs an unnecessary 10-second delay before the error propagates. The sleep should be skipped when `i >= 2` (or equivalently, the throw should come before the sleep on the last iteration).

**Impact:** Operational delay only. Adds 10 seconds to every permanently-failing query. Not exploitable, but wasteful and could cascade when called across multiple snapshot blocks (30 snapshots * 10s = 5 minutes of unnecessary waiting if all fail).

**Severity:** LOW

---

### L-02: No input validation on `pools` array in `getPoolsTickMulticall` [LOW]

**Location:** Lines 65-68

`getPoolsTickMulticall` accepts `pools: \`0x${string}\`[]` but does not validate:
- That the array is not excessively large (could cause RPC/multicall gas limits to be exceeded)
- That individual addresses are valid 42-character hex addresses (the TypeScript template literal type `\`0x${string}\`` accepts `"0x"` or `"0xGARBAGE"`)

The caller `getPoolsTick` similarly passes pools through without validation.

In practice, the `pools` array comes from `data/pools.dat` (loaded in `src/index.ts`), which is committed data. The viem multicall will likely reject malformed addresses at the RPC level. However, the function is `export`ed and could be called with invalid inputs from other contexts.

**Impact:** Malformed addresses would cause RPC errors that manifest as pool failures. The getCode fallback would then query getCode for the malformed address, potentially causing confusing error messages. No financial impact since this is a read-only query.

**Severity:** LOW

---

### I-01: `getPoolsTick` blockNumber type narrowing from `number` to `bigint` [INFO]

**Location:** Line 118 vs line 68

`getPoolsTick` accepts `blockNumber: number` and converts to `bigint` at line 126 via `BigInt(blockNumber)`. The inner function `getPoolsTickMulticall` accepts `blockNumber: bigint` directly. The validation at line 120 guards against NaN and negative numbers, but JavaScript `number` loses precision above `Number.MAX_SAFE_INTEGER` (2^53 - 1). For Flare block numbers this is not a practical concern (current blocks are in the ~50M-60M range, far below 2^53).

**Severity:** INFO

---

### I-02: Duplicate pool addresses produce last-write-wins behavior [INFO]

**Location:** Lines 83-89

If the `pools` array contains duplicate addresses (potentially with different casing), the loop writes to `ticks[pool]` with `pool = pools[i].toLowerCase()`. The last entry wins. This is documented in tests (line 269-294 of `liquidity.test.ts`) and is benign for this use case since duplicates would return the same tick. The getCode fallback at lines 91-103 also handles this correctly since the tick would be present from the first successful call.

**Severity:** INFO

---

### I-03: Unreachable code at line 133 [INFO]

**Location:** Line 133

```typescript
throw new Error("failed to get pools ticks");
```

This line is unreachable. The for-loop at line 124 runs exactly 3 iterations (i=0,1,2). On each iteration, either the `return` at line 126 exits the function, or the `catch` block runs. On the third iteration (i=2), the catch block's `if (i >= 2) throw error` always throws. The loop can never complete normally to reach line 133.

This is a defensive safety net and not a bug, but it indicates the retry logic could be structured more clearly.

**Severity:** INFO

---

### Security Checklist Summary

| Category | Status |
|----------|--------|
| Input validation | Partial -- blockNumber validated in `getPoolsTick`; pool addresses rely on TypeScript types only |
| Arithmetic safety | N/A -- no arithmetic beyond `BigInt()` conversion |
| Error handling | Adequate -- multicall failures distinguished from undeployed pools; retries with rethrow |
| Injection | Not applicable -- no string interpolation into queries; viem handles ABI encoding |
| Resource management | No open handles; setTimeout resolves correctly |
| Hardcoded secrets | None -- only contains canonical Multicall3 address |
| Prototype pollution | Not applicable -- uses `Record<string, number>` with string keys from `.toLowerCase()` |
| Unsafe eval/Function | None |
| Swallowed promises | None -- all promises are awaited |
| Dependency vulnerabilities | Relies on `viem` for RPC interaction; no known issues |
