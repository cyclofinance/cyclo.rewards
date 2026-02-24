# Audit Report: `src/liquidity.ts` — Pass 3 (Documentation)

**Agent:** A05
**Date:** 2026-02-23
**Audit ID:** 2026-02-23-01
**File:** `src/liquidity.ts` (96 lines)

---

## Inventory of Exports

| Export | Kind | Has JSDoc/Comment |
|---|---|---|
| `getPoolsTickMulticall` | async function | No |
| `getPoolsTick` | async function | Yes (partial) |

**Non-exported module-level declarations:**

| Declaration | Kind | Has JSDoc/Comment |
|---|---|---|
| `abi` | const (Uniswap V3 `slot0` ABI) | No |

---

## Findings

### A05-1 — LOW — `getPoolsTickMulticall` has no documentation at all

The exported function `getPoolsTickMulticall` (lines 49-76) has no JSDoc comment or inline documentation explaining its purpose, parameters, or return value.

- `client: PublicClient` -- no description of what chain/RPC the client should be configured for.
- `pools: \`0x${string}\`[]` -- no description of what these pool addresses represent (Uniswap V3 pools whose current tick is needed).
- `blockNumber: bigint` -- no description that this is the historical block at which to query.
- Return type `Promise<Record<string, number>>` -- no description that the keys are lowercased pool addresses and the values are the current tick at that block.

The function also silently omits pools whose multicall sub-call failed (status !== "success") without any logging or documentation of this behavior. A consumer would need to read the implementation to know that missing keys mean failed queries rather than tick value 0 or undefined.

### A05-2 — LOW — `getPoolsTick` JSDoc is incomplete and partially inaccurate

The existing comment on line 78 reads:
```
/** Tries to get pools ticks (with max 3 retries) */
```

Issues:
1. **Parameter documentation is absent.** The function accepts `client`, `pools`, and `blockNumber` but none are documented with `@param` tags.
2. **Return type is not documented.** No `@returns` tag.
3. **"3 retries" is misleading.** The loop runs `for (let i = 0; i < 3; i++)`, meaning there is 1 initial attempt plus 2 retries (3 total attempts). Saying "max 3 retries" implies up to 4 total attempts. The comment should say "up to 3 attempts" or "with max 2 retries."
4. **Retry delay is undocumented.** The function waits 10 seconds between retries (line 89), which is operationally significant but not mentioned.
5. **Error propagation behavior is undocumented.** On the third failure, the caught error is re-thrown. The unreachable `throw new Error("failed to get pools ticks")` on line 94 is also undocumented (see A05-5).

### A05-3 — INFO — CLAUDE.md incorrectly describes retry strategy as "exponential backoff"

`CLAUDE.md` line 35 states:
> `src/liquidity.ts` -- Queries Uniswap V3 pool tick data via multicall at specific blocks. Uses 3 retries with exponential backoff.

The actual implementation uses a fixed 10-second delay (`setTimeout(..., 10_000)`) on every retry, not exponential backoff. This is a documentation accuracy issue in the project-level documentation.

### A05-4 — LOW — `abi` constant is undocumented

The module-level `abi` constant (lines 3-47) defines the Uniswap V3 pool `slot0` function ABI but has no comment explaining:
- That it is the Uniswap V3 pool `slot0` function ABI.
- Which fields from the return tuple are actually used (only index 1, the `tick` field).
- Why only `slot0` is included (the module only needs the current tick to determine if V3 LP positions are in range).

While the ABI itself is somewhat self-documenting via field names, a brief comment would aid maintainability.

### A05-5 — INFO — Unreachable code on line 94

Line 94 contains:
```typescript
throw new Error("failed to get pools ticks");
```

This statement is unreachable. The `for` loop either returns on success (line 87) or re-throws the caught error when `i >= 2` (line 90). After the loop completes all 3 iterations, one of those two paths will always have been taken. TypeScript does not flag this because it cannot prove the loop body always executes a return/throw. This dead code is undocumented and could confuse readers into thinking there is a fourth failure path.

### A05-6 — INFO — Type mismatch between `getPoolsTick` and `getPoolsTickMulticall` for `blockNumber` parameter

`getPoolsTickMulticall` accepts `blockNumber: bigint` (line 52), while `getPoolsTick` accepts `blockNumber: number` (line 82) and converts it via `BigInt(blockNumber)` on line 87. This inconsistency is not documented anywhere. The caller in `processor.ts` (line 485-488) passes a `number`, so the `getPoolsTick` wrapper is the intended public API. However, `getPoolsTickMulticall` is also exported and consumers might not realize they need to pass a `bigint` to that function but a `number` to `getPoolsTick`. A comment or consistent parameter type would improve clarity.

### A05-7 — LOW — Hardcoded multicall address is undocumented

Line 58 hardcodes the Multicall3 contract address:
```typescript
multicallAddress: "0xcA11bde05977b3631167028862bE2a173976CA11",
```

There is no comment explaining that this is the canonical Multicall3 contract address (deployed at the same address across many EVM chains including Flare). Given that `config.ts` documents other contract addresses with inline comments, this address should receive the same treatment.

---

## Summary

| Severity | Count |
|---|---|
| LOW | 4 |
| INFO | 3 |

The file is small (96 lines) and functionally straightforward, but documentation coverage is sparse. Only one of two exported functions has any documentation, and that documentation is incomplete and partially inaccurate (retry count description, missing parameter/return tags). The project-level CLAUDE.md also contains an inaccuracy about the retry strategy (claims exponential backoff, actual is fixed delay). The hardcoded Multicall3 address and the `slot0` ABI constant lack explanatory comments that would be consistent with the commenting style used in `config.ts`.
