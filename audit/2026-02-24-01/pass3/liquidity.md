# Pass 3 -- Documentation Audit: `src/liquidity.ts`

**Auditor Agent:** A05
**Date:** 2026-02-24
**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/liquidity.ts`

---

## 1. Inventory of Functions, Constants, and Exports

| Line | Symbol | Kind | Exported |
|------|--------|------|----------|
| 3 | `abi` | `const` (module-level ABI array) | No |
| 49 | `getPoolsTickMulticall()` | `async function` | Yes |
| 93 | `getPoolsTick()` | `async function` | Yes |

---

## 2. Module-Level Documentation

**[A05-DOC-001] No module-level JSDoc or header comment.**
Severity: Low
The file has no top-level documentation explaining its purpose: querying Uniswap V3 pool `slot0` data via multicall to retrieve current tick values at specific block heights. A brief module header would orient readers.

---

## 3. Constant Documentation

### `abi` (line 3)

**[A05-DOC-002] ABI constant is undocumented.**
Severity: Low
The `abi` constant (lines 3-47) defines the Uniswap V3 pool `slot0` function ABI. There is no comment explaining:
- What contract this ABI fragment belongs to (Uniswap V3 Pool)
- Why only `slot0` is included (only the current tick is needed)
- What the return values represent (sqrtPriceX96, tick, observationIndex, etc.)

A single-line comment such as `// Uniswap V3 Pool slot0 ABI -- used to read current tick at a given block` would suffice.

---

## 4. Function-Level Documentation

### `getPoolsTickMulticall()` (line 49)

**[A05-DOC-003] `getPoolsTickMulticall()` has no JSDoc documentation.**
Severity: Medium
This is an exported function performing a multicall to read `slot0` from multiple Uniswap V3 pools at a specific block number. It also includes failure-handling logic that distinguishes between pools that do not yet exist at the queried block (acceptable) and pools that exist but whose `slot0` call failed (throws an error). None of this behavior is documented.

Recommended JSDoc should describe:
- Parameters: `client` (viem PublicClient), `pools` (array of pool addresses), `blockNumber` (block at which to query)
- Return value: Record mapping lowercase pool address to its current tick
- Error behavior: throws if any deployed pool's `slot0` call fails
- The hardcoded multicall address `0xcA11bde05977b3631167028862bE2a173976CA11` (Multicall3 on Flare)

### `getPoolsTick()` (line 93)

**[A05-DOC-004] JSDoc on `getPoolsTick()` is inaccurate -- claims "exponential backoff" but uses fixed 10-second delay.**
Severity: Medium
Line 92 contains:
```typescript
/** Tries to get pools ticks (with max 3 retries) */
```
While the JSDoc correctly states "max 3 retries", the CLAUDE.md project documentation claims "3 retries with exponential backoff". Neither claim matches the actual implementation. The retry loop on lines 99-106 uses a fixed 10-second delay:
```typescript
await new Promise((resolve) => setTimeout(() => resolve(""), 10_000)) // wait 10 secs and try again
```
This is a **fixed delay** of 10 seconds, not exponential backoff. The JSDoc and project documentation should be updated to say "fixed 10-second retry delay" or the code should be changed to actually implement exponential backoff.

Additionally, the existing JSDoc is minimal. It does not describe:
- Parameters
- Return type
- Error behavior (throws after 3 failed attempts)
- The fact that `blockNumber` is converted from `number` to `bigint` internally

---

## 5. Inline Comment Accuracy

### [A05-DOC-005] Line 98: `// retry 3 times` is slightly misleading.
Severity: Info
The loop runs `for (let i = 0; i < 3; i++)`, which means the function makes up to 3 total attempts (1 initial + 2 retries). The comment says "retry 3 times" which implies 4 total attempts. The behavior is actually "try up to 3 times" or "retry up to 2 times". The distinction is minor but could cause confusion.

### [A05-DOC-006] Line 103: Inline comment is accurate.
Severity: None
```typescript
// wait 10 secs and try again
```
This correctly describes the fixed 10-second delay.

---

## 6. Additional Observations

### [A05-DOC-007] Hardcoded multicall address (line 58) is undocumented.
Severity: Low
The address `0xcA11bde05977b3631167028862bE2a173976CA11` is the well-known Multicall3 contract address deployed on many EVM chains including Flare. A brief comment identifying this would be helpful.

### [A05-DOC-008] Type signature discrepancy between `getPoolsTick` and `getPoolsTickMulticall`.
Severity: Info (documentation-adjacent)
`getPoolsTickMulticall` accepts `blockNumber: bigint` while `getPoolsTick` accepts `blockNumber: number` and converts internally via `BigInt(blockNumber)`. This inconsistency is not documented and could surprise callers.

---

## 7. Summary

| ID | Severity | Description |
|----|----------|-------------|
| A05-DOC-001 | Low | No module-level JSDoc |
| A05-DOC-002 | Low | ABI constant undocumented |
| A05-DOC-003 | Medium | `getPoolsTickMulticall()` has no JSDoc |
| A05-DOC-004 | Medium | `getPoolsTick()` JSDoc inaccurately implies exponential backoff; code uses fixed 10s delay |
| A05-DOC-005 | Info | "retry 3 times" comment slightly misleading (3 total attempts, not 3 retries) |
| A05-DOC-006 | None | Line 103 inline comment is accurate |
| A05-DOC-007 | Low | Hardcoded Multicall3 address undocumented |
| A05-DOC-008 | Info | `number` vs `bigint` blockNumber discrepancy between the two functions is undocumented |
