# Documentation Audit - Pass 3: `src/config.ts`

**Agent:** A01
**Date:** 2026-02-22
**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/config.ts`
**Lines:** 77

---

## Evidence of Thorough Reading

### Module
- **Module name:** `config` (src/config.ts)
- **Imports:** `assert` (node built-in), `CyToken` and `Epoch` from `./types`, `seedrandom` from `seedrandom`

### Exports (functions, constants, types) with line numbers

| Export | Kind | Line(s) |
|---|---|---|
| `REWARDS_SOURCES` | `const` (string array) | 5-12 |
| `FACTORIES` | `const` (string array) | 14-19 |
| `CYTOKENS` | `const` (CyToken array) | 21-36 |
| `RPC_URL` | `const` (string) | 38 |
| `isSameAddress(a, b)` | function | 40-42 |
| `generateSnapshotBlocks(seed, start, end)` | function | 50-76 |

### Inline comments observed
- Each entry in `REWARDS_SOURCES` has an inline comment identifying the protocol/contract (e.g., `// orderbook`, `// Sparkdex Universal Router`).
- Each entry in `FACTORIES` has an inline comment identifying the DEX version (e.g., `// Sparkdex V2`, `// Blazeswap`).
- Each entry in `CYTOKENS` has inline comments for underlying token symbols where the address alone is ambiguous (e.g., `// sFlr`, `// weth`).
- `generateSnapshotBlocks` has internal comments: `// start + end + 28 = 30 snapshots` (line 60), `// making sure we have correct length` (line 66), `// sort asc` (line 72).

---

## Findings

### A01-1: Unused import of `Epoch` type

**Severity:** LOW

**Location:** Line 2

**Description:** The type `Epoch` is imported from `./types` but is never referenced anywhere in `config.ts`. This is dead code. While not a documentation issue per se, it is a code hygiene finding discovered during the audit.

**Evidence:**
```typescript
import { CyToken, Epoch } from "./types";
```
`Epoch` does not appear anywhere else in the file.

---

### A01-2: No documentation on exported constant `REWARDS_SOURCES`

**Severity:** MEDIUM

**Location:** Lines 5-12

**Description:** `REWARDS_SOURCES` is a critical constant that defines which on-chain addresses are considered approved sources for reward-eligible transfers. It has no JSDoc or block comment explaining its role, how it is consumed by the processor, or what criteria determine inclusion. Inline comments identify each address but do not explain the constant's purpose.

---

### A01-3: No documentation on exported constant `FACTORIES`

**Severity:** MEDIUM

**Location:** Lines 14-19

**Description:** `FACTORIES` is an exported constant listing factory contract addresses used for Uniswap V2/V3 LP position tracking. It has no JSDoc or block comment explaining its role in the pipeline, how it relates to LP position detection, or what adding/removing an entry implies.

---

### A01-4: No documentation on exported constant `CYTOKENS`

**Severity:** MEDIUM

**Location:** Lines 21-36

**Description:** `CYTOKENS` defines the cyToken configurations (cysFLR and cyWETH) including their addresses, underlying token addresses, and receipt addresses. It has no JSDoc or block comment explaining the structure, why these particular tokens are included, or the meaning of `receiptAddress` vs `address` vs `underlyingAddress` at this level (the `CyToken` type in `types.ts` also lacks documentation on its fields, but that is out of scope for this file-level audit).

---

### A01-5: No documentation on exported constant `RPC_URL`

**Severity:** LOW

**Location:** Line 38

**Description:** `RPC_URL` is an exported constant pointing to the Flare Network RPC endpoint. It has no JSDoc comment. The purpose is relatively self-evident from the name, but there is no documentation on when/where it is used or whether it can be overridden via environment variable.

---

### A01-6: No documentation on exported function `isSameAddress`

**Severity:** MEDIUM

**Location:** Lines 40-42

**Description:** `isSameAddress` is a public utility function that performs case-insensitive address comparison. It has no JSDoc comment. While the implementation is simple, there is no documentation explaining that it performs a case-insensitive comparison (relevant for Ethereum mixed-case checksummed addresses), nor any note about edge cases (e.g., it does not validate that inputs are valid addresses, does not handle `undefined`/`null`).

**Implementation:**
```typescript
export function isSameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}
```

---

### A01-7: `generateSnapshotBlocks` JSDoc is accurate but incomplete

**Severity:** LOW

**Location:** Lines 44-49

**Description:** `generateSnapshotBlocks` is the only function in this file with a JSDoc comment. The existing documentation is accurate in describing the parameters and general purpose. However, it omits several important behavioral details:

1. **Return value not documented** -- no `@returns` tag describing what is returned (a sorted array of 30 block numbers).
2. **No mention that the output always contains exactly 30 blocks** -- this is a critical invariant enforced by an assertion on line 67-70.
3. **No mention that `start` and `end` are always included** in the output (line 58).
4. **No mention that the output is sorted in ascending order** (line 73).
5. **No mention of the assertion** that will throw at runtime if the snapshot count is not 30 (defensive check).

**Existing JSDoc:**
```typescript
/**
 * Generates random snapshots between the given start/end numbers based on the given seed
 * @param seed - The seed phrase
 * @param start - The start block number
 * @param end - The end block number
 */
```

---

### A01-8: No module-level documentation

**Severity:** LOW

**Location:** Top of file (line 1)

**Description:** There is no module-level JSDoc or file header comment explaining the purpose of `config.ts` as a whole. Given that this module serves as the central configuration hub for the entire rewards pipeline (defining approved sources, factory contracts, token definitions, RPC endpoint, and snapshot generation), a brief module overview would aid maintainability.

---

## Summary

| Severity | Count |
|---|---|
| CRITICAL | 0 |
| HIGH | 0 |
| MEDIUM | 4 |
| LOW | 4 |
| INFO | 0 |
| **Total** | **8** |

The file has minimal documentation. Only one of six exports (`generateSnapshotBlocks`) has any JSDoc, and even that documentation is incomplete (missing `@returns`, invariants about output size and sort order, and the inclusion of start/end in the output). The four exported constants (`REWARDS_SOURCES`, `FACTORIES`, `CYTOKENS`, `RPC_URL`) and the utility function `isSameAddress` are entirely undocumented beyond inline address-identification comments. One unused import (`Epoch`) was also identified.
