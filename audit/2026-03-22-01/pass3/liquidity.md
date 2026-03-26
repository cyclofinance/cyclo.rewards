# Pass 3: Documentation Review - `src/liquidity.ts`

**Agent:** A05
**Date:** 2026-03-22
**File:** `src/liquidity.ts` (135 lines)

## Evidence of Thorough Reading

| # | Symbol | Kind | Line(s) | Exported |
|---|--------|------|---------|----------|
| 1 | Module-level JSDoc | doc comment | 1-3 | N/A |
| 2 | `MULTICALL3_ADDRESS` | `const` | 8 | Yes |
| 3 | `abi` | `const` (slot0 ABI) | 11-55 | No |
| 4 | `getPoolsTickMulticall` | `async function` | 65-106 | Yes |
| 5 | `getPoolsTick` | `async function` | 115-134 | Yes |

## JSDoc Assessment

### Module-level JSDoc (lines 1-3)

```
/**
 * Queries Uniswap V3 pool tick data via multicall for in-range LP position calculations.
 */
```

**Verdict:** Present and accurate. Concisely describes the module's purpose.

### `MULTICALL3_ADDRESS` (line 8)

```
/** Multicall3 canonical deployment address (same on all EVM chains) */
```

**Verdict:** Present and accurate. Notes the cross-chain canonical nature of the address.

### `abi` (lines 10-55, not exported)

```
/** Uniswap V3 pool slot0 ABI -- returns current tick and other pool state */
```

**Verdict:** Present and accurate. Not exported, so lower priority, but documented.

### `getPoolsTickMulticall` (lines 57-106)

```
/**
 * Fetches current tick for each pool via a single multicall at the given block.
 * Pools that don't exist at the block (no code deployed) are silently skipped.
 * @param client - Viem public client
 * @param pools - Array of pool contract addresses
 * @param blockNumber - Block number to query at
 * @returns Map of lowercase pool address to current tick value
 */
```

**Verdict:** Present, mostly accurate. All three `@param` tags and `@returns` are present and match the actual signature. The description of "silently skipped" for undeployed pools is accurate (lines 91-103 check `getCode` and only throw for deployed pools). However, the JSDoc says "silently skipped" but the function actually _throws_ for deployed pools that fail slot0 -- this distinction is documented by implication but could be more explicit.

### `getPoolsTick` (lines 108-134)

```
/**
 * Fetches pool ticks with retry logic (3 attempts, 10s delay between retries).
 * @param client - Viem public client
 * @param pools - Array of pool contract addresses
 * @param blockNumber - Block number to query at
 * @returns Map of lowercase pool address to current tick value
 */
```

**Verdict:** Present and largely accurate. All `@param` tags and `@returns` match the signature. The retry description (3 attempts, 10s delay) matches the implementation (loop of 3, 10_000ms setTimeout). However:

1. The `@param blockNumber` does not note that the type is `number` (not `bigint`) and gets converted internally via `BigInt()`. This is a meaningful distinction vs. `getPoolsTickMulticall` which takes `bigint`.
2. The JSDoc does not document the input validation (throws on NaN/negative) at lines 120-122.
3. The `@throws` tag is missing entirely -- the function can throw on invalid input or after exhausting retries.

## Findings

### F-A05-P3-1: Missing `@throws` documentation on `getPoolsTick`

**Severity:** LOW
**Location:** `src/liquidity.ts:108-114`
**Description:** `getPoolsTick` throws in two distinct scenarios: (1) invalid `blockNumber` (NaN or negative, line 120-122), and (2) after 3 failed retry attempts (line 129). Neither throw condition is documented in the JSDoc. Callers (e.g., `processor.ts:625`) need to know what exceptions to expect.

### F-A05-P3-2: `@param blockNumber` type difference undocumented between `getPoolsTick` and `getPoolsTickMulticall`

**Severity:** LOW
**Location:** `src/liquidity.ts:112` vs `src/liquidity.ts:62`
**Description:** `getPoolsTickMulticall` accepts `blockNumber: bigint` while `getPoolsTick` accepts `blockNumber: number` and converts internally via `BigInt()`. The JSDoc for `getPoolsTick` does not note this difference or the conversion. A developer reading the docs might not realize one is a convenience wrapper with a different type signature.

### F-A05-P3-3: Missing `@throws` documentation on `getPoolsTickMulticall`

**Severity:** LOW
**Location:** `src/liquidity.ts:57-64`
**Description:** `getPoolsTickMulticall` throws when a pool has deployed code but its slot0 call fails (line 100-102). The JSDoc says pools without code are "silently skipped" which is accurate, but the complementary throw behavior for deployed-but-failing pools is not documented. A `@throws` tag would make the error contract explicit.

### F-A05-P3-4: Unreachable dead code at line 133

**Severity:** INFO
**Location:** `src/liquidity.ts:133`
**Description:** The `throw new Error("failed to get pools ticks")` at line 133 is unreachable. The for-loop runs 3 iterations (i=0,1,2). On success, the function returns at line 126. On failure: for i=0 and i=1, it catches and continues; for i=2, it re-throws the original error at line 129. There is no path that exits the loop without returning or throwing. This is not a documentation finding per se, but the dead code could mislead readers of the function. This was reported previously in pass 1/2; noting here for completeness that the dead code also has no documentation indicating it is a defensive fallback.

## Summary

The documentation quality for `src/liquidity.ts` is good overall. The module has:
- A module-level JSDoc (present and accurate)
- JSDoc on all exports with `@param` and `@returns` tags
- JSDoc on the non-exported `abi` constant

The gaps are minor: missing `@throws` tags on both exported functions, and an undocumented type distinction between the two functions' `blockNumber` parameter. No CRITICAL or HIGH findings.

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH     | 0 |
| MEDIUM   | 0 |
| LOW      | 3 |
| INFO     | 1 |
