# Audit 2026-02-23-01 / Pass 3 (Documentation) / Agent A01

**File:** `src/config.ts` (77 lines)

**Date:** 2026-02-23

---

## Evidence of Thorough Reading

### Exported Constants (with line numbers)

| Name | Line | Type |
|------|------|------|
| `REWARDS_SOURCES` | 5 | `string[]` (6 DEX router/orderbook addresses) |
| `FACTORIES` | 14 | `string[]` (4 DEX factory contract addresses) |
| `CYTOKENS` | 21 | `CyToken[]` (2 entries: cysFLR, cyWETH) |
| `RPC_URL` | 38 | `string` (Flare RPC endpoint) |

### Exported Functions (with line numbers)

| Name | Line | Signature | Has JSDoc? |
|------|------|-----------|------------|
| `isSameAddress` | 40 | `(a: string, b: string): boolean` | No |
| `generateSnapshotBlocks` | 50 | `(seed: string, start: number, end: number): number[]` | Yes (lines 44-49) |

### Imports (with line numbers)

| Import | Source | Line |
|--------|--------|------|
| `assert` | `"assert"` | 1 |
| `CyToken`, `Epoch` | `"./types"` | 2 |
| `seedrandom` | `"seedrandom"` | 3 |

---

## Findings

### A01-1 -- LOW -- `isSameAddress` function lacks JSDoc documentation

The exported function `isSameAddress` at line 40 has no JSDoc comment. While the function name is somewhat self-explanatory, it performs case-insensitive comparison of Ethereum addresses using `.toLowerCase()`. A JSDoc comment should describe:

- The purpose (case-insensitive Ethereum address comparison)
- Parameters (`a` and `b` as hex address strings)
- Return value (boolean indicating whether the two addresses are equivalent ignoring case)

This is relevant because Ethereum addresses can be represented in mixed-case (EIP-55 checksummed) or lowercase form, and the function's case-insensitive behavior is an important semantic detail that documentation should make explicit.

### A01-2 -- LOW -- Exported constants `REWARDS_SOURCES`, `FACTORIES`, `CYTOKENS`, and `RPC_URL` lack JSDoc documentation

None of the four exported constants have JSDoc comments. Each has inline comments identifying individual entries (e.g., `// orderbook`, `// Sparkdex Universal Router`, `// sFlr`), but there is no top-level documentation explaining:

- **`REWARDS_SOURCES`** (line 5): What makes a source "approved" and what the consequences of being in this list are (only transfers originating from these addresses are reward-eligible).
- **`FACTORIES`** (line 14): What role factory contracts play (used to identify and track Uniswap V2/V3 LP positions for reward eligibility).
- **`CYTOKENS`** (line 21): What a CyToken represents and the meaning of its fields (`address` vs `underlyingAddress` vs `receiptAddress`). The inline comments only label individual tokens, not the structure's purpose.
- **`RPC_URL`** (line 38): What the RPC endpoint is used for (on-chain queries for liquidity tick data, multicall, etc.).

### A01-3 -- INFO -- `generateSnapshotBlocks` JSDoc is accurate but omits return value description

The JSDoc for `generateSnapshotBlocks` (lines 44-49) correctly documents the three parameters (`seed`, `start`, `end`). However, it does not document:

- The return value: an array of 30 block numbers sorted in ascending order.
- The invariant that the returned array always contains exactly 30 elements (start block, end block, and 28 randomly generated blocks).
- That `start` and `end` are always included in the output.

The current documentation reads:

```
/**
 * Generates random snapshots between the given start/end numbers based on the given seed
 * @param seed - The seed phrase
 * @param start - The start block number
 * @param end - The end block number
 */
```

A `@returns` tag describing the sorted array of 30 snapshot block numbers (always including `start` and `end`) would improve completeness.

### A01-4 -- LOW -- Unused import: `Epoch` is imported but never referenced

At line 2, the type `Epoch` is imported from `"./types"` alongside `CyToken`, but `Epoch` is never used anywhere in `config.ts`. This is not strictly a documentation issue, but it is a code quality concern discovered during the documentation review. An unused import can mislead readers into thinking the file deals with epoch-related logic.

### A01-5 -- INFO -- Inline comments on constant array entries are helpful but inconsistent in casing convention

The addresses in `REWARDS_SOURCES` (lines 5-12) are written in mixed-case (EIP-55 checksummed) format for some entries (e.g., `0x0f3D8a38D4c74afBebc2c42695642f0e3acb15D3`) and lowercase for others (e.g., `0xcee8cd002f151a536394e564b84076c41bbbcd4d` on line 6, `0x8c7ba8f245aef3216698087461e05b85483f791f` on line 10). This inconsistency is cosmetic but worth noting since the codebase uses `isSameAddress` for case-insensitive comparison, meaning the mixed formats are functionally equivalent. Consistent formatting would improve readability.

---

## Summary

| Severity | Count |
|----------|-------|
| LOW | 3 |
| INFO | 2 |
| **Total** | **5** |

The file is small (77 lines) with a straightforward structure. The primary documentation gap is the absence of JSDoc on the exported constants and the `isSameAddress` function. The existing JSDoc on `generateSnapshotBlocks` is accurate but could be more complete with a `@returns` tag. An unused `Epoch` import was also identified.
