# Security Audit - Pass 1: `src/liquidity.ts`

**Auditor Agent:** A05
**Date:** 2026-02-22
**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/liquidity.ts`
**Lines:** 96

---

## Evidence of Thorough Reading

### Module Summary

`liquidity.ts` queries Uniswap V3 pool `slot0` data via the Multicall3 contract at specific historical block numbers. It returns a mapping of pool addresses (lowercased) to their current tick values. Used by `processor.ts` to determine whether V3 LP positions are in-range at each snapshot block.

### Imports

| Import | Source | Line |
|--------|--------|------|
| `PublicClient` | `viem` | 1 |

### Constants

| Name | Type | Line(s) | Description |
|------|------|---------|-------------|
| `abi` | ABI array (const) | 3-47 | Uniswap V3 pool `slot0` function ABI definition. Returns `sqrtPriceX96`, `tick`, `observationIndex`, `observationCardinality`, `observationCardinalityNext`, `feeProtocol`, `unlocked`. |

### Functions

| Function | Exported | Line(s) | Signature |
|----------|----------|---------|-----------|
| `getPoolsTickMulticall` | Yes | 49-76 | `(client: PublicClient, pools: \`0x${string}\`[], blockNumber: bigint) => Promise<Record<string, number>>` |
| `getPoolsTick` | Yes | 79-95 | `(client: PublicClient, pools: \`0x${string}\`[], blockNumber: number) => Promise<Record<string, number>>` |

### Types/Errors Defined

No custom types, interfaces, or error classes are defined in this module.

### Hardcoded Addresses

| Address | Line | Purpose |
|---------|------|---------|
| `0xcA11bde05977b3631167028862bE2a173976CA11` | 58 | Multicall3 contract address |

---

## Security Findings

### A05-1: Silent Omission of Failed Pool Tick Queries (MEDIUM)

**Location:** Lines 67-73
**Category:** Error Handling / Data Integrity

**Description:**
When `allowFailure: true` is set on the multicall (line 57), individual pool calls that fail are silently skipped -- the pool is simply absent from the returned `ticks` record. In `processor.ts` (line 499), if a tick is `undefined` the LP position is skipped with `continue`, meaning the position's balance contribution is excluded from the snapshot entirely.

For a financial rewards calculation system, silently dropping a pool's tick data means that all V3 LP positions in that pool are treated as if they contribute zero eligible balance for that snapshot. This could systematically undercount rewards for affected users. An attacker who can cause the RPC node to fail on specific pool queries (e.g., via targeted DoS or by exploiting an edge-case pool state at a particular block) could suppress legitimate rewards.

**Impact:** Users with V3 LP positions in a pool that fails to return tick data would receive reduced rewards. The system provides no warning or logging that this has occurred.

**Recommendation:** Log a warning when a pool call fails within the multicall results. Consider whether failed pool lookups should cause the entire snapshot to retry or fail rather than silently proceeding with incomplete data. At minimum, emit a visible log so operators can detect and investigate missed pools.

---

### A05-2: Fixed Retry Delay Without Exponential Backoff (LOW)

**Location:** Line 89
**Category:** Resource Management / Resilience

**Description:**
The CLAUDE.md project documentation states the module "Uses 3 retries with exponential backoff," but the actual implementation uses a fixed 10-second delay between retries (line 89: `setTimeout(() => resolve(""), 10_000)`). All three retry attempts wait exactly 10 seconds. This is not exponential backoff.

While not a direct security vulnerability, a fixed delay is less resilient against transient RPC node issues compared to true exponential backoff (e.g., 2s, 4s, 8s or 10s, 20s, 40s). Under sustained RPC pressure, fixed delays may not provide sufficient recovery time for later retries.

**Impact:** Reduced resilience against transient RPC failures. Documentation mismatch could lead to false confidence in the retry strategy.

**Recommendation:** Either implement actual exponential backoff (e.g., `10_000 * 2**i` ms) or update the documentation to accurately reflect the fixed-delay retry strategy.

---

### A05-3: Hardcoded Multicall3 Contract Address (INFO)

**Location:** Line 58
**Category:** Configuration Management

**Description:**
The Multicall3 contract address `0xcA11bde05977b3631167028862bE2a173976CA11` is hardcoded directly in the function body. This is the canonical Multicall3 address deployed across many EVM chains (including Flare), so it is correct and well-known.

However, hardcoding it means that if the system ever needed to target a different chain or a custom multicall deployment, a code change would be required. Given that this project is specifically for Flare Network and the address is a widely-used constant, this is purely informational.

**Impact:** None for current use. Minor maintainability consideration.

**Recommendation:** No action required. If multi-chain support is ever needed, consider extracting this to config.

---

### A05-4: No Validation of `blockNumber` Parameter (LOW)

**Location:** Lines 49-53, 79-83
**Category:** Input Validation

**Description:**
Neither `getPoolsTickMulticall` nor `getPoolsTick` validates that the `blockNumber` is positive, non-zero, or within a reasonable range. In `getPoolsTick`, the `blockNumber` parameter is a `number` that gets converted to `bigint` via `BigInt(blockNumber)` on line 87.

If a negative number, `NaN`, `Infinity`, or non-integer is passed:
- `BigInt(NaN)` throws a `TypeError`
- `BigInt(Infinity)` throws a `TypeError`
- `BigInt(-1)` produces `-1n` (a negative block number, which would likely cause the RPC to return an error)
- `BigInt(1.5)` throws a `RangeError`

The TypeScript type system provides `number`, but there is no runtime guard. In the actual call path from `processor.ts`, the block numbers originate from `generateSnapshotBlocks()` which produces valid positive integers, so this is low risk in practice.

**Impact:** Minimal in current usage since callers provide valid block numbers. Could cause confusing errors if the function were reused with unexpected inputs.

**Recommendation:** Consider adding a runtime assertion that `blockNumber` is a positive integer, e.g., `if (!Number.isInteger(blockNumber) || blockNumber <= 0) throw new Error(...)`.

---

### A05-5: Potential Denial of Service via Unbounded Pool Array (LOW)

**Location:** Lines 49-66
**Category:** Resource Management

**Description:**
The `pools` array is passed directly into the multicall without any size limit. If an extremely large array of pool addresses were provided, it could result in an oversized RPC request that might be rejected by the node or cause excessive memory usage. The multicall contract itself has gas limits that would bound execution, but the HTTP request payload and response parsing could still be problematic.

In practice, the `pools` array comes from tracked V3 pools discovered during transfer processing, and the number of relevant pools on Flare Network is small (likely fewer than 100). This is a theoretical concern.

**Impact:** Theoretical DoS if pool list grows very large. Not exploitable in current usage.

**Recommendation:** No immediate action needed. If the pool list could grow unbounded in the future, consider batching the multicall into chunks.

---

## Summary

| ID | Severity | Title |
|----|----------|-------|
| A05-1 | MEDIUM | Silent omission of failed pool tick queries |
| A05-2 | LOW | Fixed retry delay without exponential backoff (documentation mismatch) |
| A05-3 | INFO | Hardcoded Multicall3 contract address |
| A05-4 | LOW | No validation of `blockNumber` parameter |
| A05-5 | LOW | Potential denial of service via unbounded pool array |

**Total findings:** 5 (0 CRITICAL, 0 HIGH, 1 MEDIUM, 3 LOW, 1 INFO)
