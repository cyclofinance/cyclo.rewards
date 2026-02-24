# Security Audit - Pass 1: `src/liquidity.ts`

**Auditor Agent:** A05
**Date:** 2026-02-23
**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/liquidity.ts`
**Lines:** 95

---

## Evidence of Thorough Reading

### Module Summary

`liquidity.ts` is a small module responsible for querying Uniswap V3 pool `slot0` data via the Multicall3 contract at specific historical block numbers on Flare Network. It returns a `Record<string, number>` mapping lowercased pool addresses to their current tick values. Called by `processor.ts` in `processLpRange()` to determine whether V3 LP positions are in-range at each snapshot block.

### Imports

| Import | Source | Line |
|--------|--------|------|
| `PublicClient` | `viem` | 1 |

### Constants

| Name | Type | Line(s) | Description |
|------|------|---------|-------------|
| `abi` | `const` ABI array | 3-47 | Uniswap V3 pool `slot0` function ABI. Returns tuple of: `sqrtPriceX96` (uint160), `tick` (int24), `observationIndex` (uint16), `observationCardinality` (uint16), `observationCardinalityNext` (uint16), `feeProtocol` (uint8), `unlocked` (bool). |

### Hardcoded Addresses

| Address | Line | Purpose |
|---------|------|---------|
| `0xcA11bde05977b3631167028862bE2a173976CA11` | 58 | Multicall3 canonical contract address |

### Exported Functions

| Function | Line(s) | Signature |
|----------|---------|-----------|
| `getPoolsTickMulticall` | 49-76 | `(client: PublicClient, pools: \`0x${string}\`[], blockNumber: bigint) => Promise<Record<string, number>>` |
| `getPoolsTick` | 79-95 | `(client: PublicClient, pools: \`0x${string}\`[], blockNumber: number) => Promise<Record<string, number>>` |

### Types/Errors/Interfaces Defined

None. This module defines no custom types, interfaces, enums, or error classes.

### Line-by-Line Summary

- **Line 1:** Import `PublicClient` from viem.
- **Lines 3-47:** Constant `abi` -- the ABI for Uniswap V3 pool `slot0()` view function, marked `as const` for strict typing.
- **Lines 49-76:** `getPoolsTickMulticall` -- performs a single batched multicall to query `slot0` on all provided pool addresses at a specific historical block. Uses `allowFailure: true` (line 57). Iterates results (lines 67-73), lowercasing pool addresses (line 69), and only records ticks for results with `status === "success"` (line 70). Returns a `Record<string, number>`.
- **Lines 79-95:** `getPoolsTick` -- wrapper around `getPoolsTickMulticall` that converts `blockNumber` from `number` to `bigint` (line 87), adds retry logic: loop of 3 attempts (line 85), 10-second fixed delay on failure (line 89), rethrows on final attempt (line 90). Unreachable final `throw` at line 94 as a safety net.

---

## Security Findings

### A05-1: Silent Omission of Failed Pool Tick Queries Affects Reward Accuracy (MEDIUM)

**Location:** Lines 57, 67-73
**Category:** Error Handling / Data Integrity

**Description:**
The multicall is configured with `allowFailure: true` (line 57), and individual pool call failures are silently absorbed -- the pool is simply omitted from the returned `ticks` record. No log, warning, or counter is emitted.

In the consuming code (`processor.ts`, lines 498-499), when a pool's tick is `undefined`, the corresponding LP position check is skipped via `continue`. This means positions are NOT deducted from the snapshot balance even if they are actually out-of-range. In other words, a failed tick lookup causes the system to assume all V3 positions in that pool are in-range, which inflates the eligible balance for those users at that snapshot.

This is the opposite direction from what might initially be assumed: silence here benefits LP holders in affected pools (they keep full balance credit) rather than penalizing them. An attacker who can induce RPC failures for a specific pool's `slot0` query at a specific block could inflate their rewards.

In practice the risk is constrained because: (a) the retry logic in `getPoolsTick` retries the entire multicall batch, not individual failures, and (b) `allowFailure: true` means the multicall itself succeeds even if one pool reverts -- so retries only trigger on transport-level failures. An individual pool that reverts at a specific block would silently fail on every retry.

**Impact:** Inflated rewards for V3 LP holders if a pool's `slot0` reverts at a snapshot block. No operator visibility into the failure.

**Recommendation:** Log a warning when any pool result has `status !== "success"`. Consider whether individual pool failures should cause the batch to be flagged for manual review rather than silently proceeding.

---

### A05-2: Retry Logic Uses Fixed Delay, Not Exponential Backoff as Documented (LOW)

**Location:** Lines 84-94
**Category:** Resilience / Documentation Accuracy

**Description:**
The `CLAUDE.md` documentation states the module "Uses 3 retries with exponential backoff." The actual implementation uses a fixed 10-second delay for all retry attempts (line 89: `setTimeout(() => resolve(""), 10_000)`). The delay is constant regardless of retry iteration `i`.

A fixed delay provides less resilience against transient RPC congestion compared to exponential backoff, where later retries wait progressively longer to allow the endpoint to recover.

**Impact:** Reduced resilience under sustained RPC pressure. Documentation mismatch could give false confidence.

**Recommendation:** Either implement exponential backoff (e.g., `10_000 * Math.pow(2, i)`) or correct the documentation. If the 10-second fixed delay is intentional and considered sufficient, update `CLAUDE.md` accordingly.

---

### A05-3: No Validation of `blockNumber` Parameter (LOW)

**Location:** Lines 49-53 (`getPoolsTickMulticall`), Lines 79-83 (`getPoolsTick`)
**Category:** Input Validation

**Description:**
Neither function validates its `blockNumber` parameter. In `getPoolsTick`, `blockNumber` is typed as `number` and converted via `BigInt(blockNumber)` on line 87. Problematic inputs:

- `BigInt(NaN)` throws `TypeError`
- `BigInt(Infinity)` throws `TypeError`
- `BigInt(1.5)` throws `RangeError`
- `BigInt(-1)` produces `-1n` -- a negative block number that would likely cause an RPC error
- `BigInt(0)` produces `0n` -- block 0 may or may not be valid depending on chain

In `getPoolsTickMulticall`, `blockNumber` is already `bigint` so the conversion issue does not apply, but negative values could still pass through.

In the actual call path from `processor.ts`, block numbers originate from `generateSnapshotBlocks()` which uses `Math.floor(rng() * range) + start` with positive start/end values, so invalid inputs are unlikely in practice.

**Impact:** Confusing runtime errors if the function were reused with unexpected inputs. Minimal risk in current usage.

**Recommendation:** Add a precondition assertion in `getPoolsTick`: `if (!Number.isInteger(blockNumber) || blockNumber <= 0) throw new Error(...)`.

---

### A05-4: No Pool Address Format Validation (LOW)

**Location:** Lines 59-65
**Category:** Input Validation

**Description:**
The `pools` parameter is typed as `` `0x${string}`[] ``, which is a viem convention but only enforced at compile time. At runtime, any string starting with `0x` would be accepted, including malformed addresses (wrong length, invalid hex characters). These would be passed directly to the multicall contract call.

The multicall with `allowFailure: true` would likely return a failure status for invalid addresses, and per finding A05-1 those failures would be silently skipped. The net effect is that malformed pool addresses would be ignored without any diagnostic output.

In practice, pool addresses originate from on-chain event data parsed during scraping, so they should always be valid.

**Impact:** Minimal in current usage. Malformed addresses would silently produce no results.

**Recommendation:** No immediate action needed. If this function were exposed more broadly, consider validating address format with `isAddress()` from viem.

---

### A05-5: Unbounded Pool Array Could Cause Oversized RPC Request (LOW)

**Location:** Lines 49-66
**Category:** Resource Management / DoS

**Description:**
The `pools` array is passed directly to `client.multicall()` without any size limit. An extremely large array could produce an oversized RPC request that exceeds the node's request size limits or causes excessive memory usage during response parsing.

The Multicall3 contract on-chain has block gas limits that bound execution, but the HTTP layer has separate constraints. Some RPC providers reject payloads above certain sizes (commonly 100KB-1MB).

In practice, the pool array comes from tracked V3 pools discovered during transfer processing on Flare Network, which is a small number (likely fewer than 50).

**Impact:** Theoretical DoS if pool list grows very large. Not exploitable in current usage.

**Recommendation:** No immediate action required. If the pool list could grow unbounded in future, consider batching into chunks of a configurable size (e.g., 100 pools per multicall).

---

### A05-6: Hardcoded Multicall3 Contract Address (INFO)

**Location:** Line 58
**Category:** Configuration Management

**Description:**
The Multicall3 contract address `0xcA11bde05977b3631167028862bE2a173976CA11` is hardcoded in the function body. This is the canonical Multicall3 address deployed at the same address across virtually all EVM chains (verified for Flare C-chain). It is correct.

Hardcoding means a code change would be required to target a different multicall deployment or chain. Given this project is specifically for Flare Network and the address is a well-known constant, this is purely informational.

**Impact:** None for current use.

**Recommendation:** No action required.

---

### A05-7: Unreachable Error Throw as Dead Code (INFO)

**Location:** Line 94
**Category:** Code Quality

**Description:**
The `throw new Error("failed to get pools ticks")` at line 94 is unreachable code. The for-loop (lines 85-92) has three possible exit paths:
1. Successful return on line 87 (the `return await getPoolsTickMulticall(...)`)
2. Rethrow on line 90 when `i >= 2` (third and final retry)
3. Continue loop on catch when `i < 2`

After the loop exhausts all iterations, path 2 will have thrown, so line 94 can never execute. TypeScript requires it for type completeness (the function must return or throw in all code paths), making it a necessary but dead code guard.

**Impact:** None. The throw serves as a type-system safety net.

**Recommendation:** No action required. The dead code is harmless and satisfies the type checker. A comment such as `// unreachable: satisfies TypeScript return type` could improve clarity.

---

## Summary

| ID | Severity | Title |
|----|----------|-------|
| A05-1 | MEDIUM | Silent omission of failed pool tick queries inflates rewards |
| A05-2 | LOW | Fixed retry delay, not exponential backoff as documented |
| A05-3 | LOW | No validation of `blockNumber` parameter |
| A05-4 | LOW | No pool address format validation |
| A05-5 | LOW | Unbounded pool array could cause oversized RPC request |
| A05-6 | INFO | Hardcoded Multicall3 contract address |
| A05-7 | INFO | Unreachable error throw as dead code |

**Total findings:** 7 (0 CRITICAL, 0 HIGH, 1 MEDIUM, 3 LOW, 2 INFO)
