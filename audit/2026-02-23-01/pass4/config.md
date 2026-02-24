# Audit: `src/config.ts` -- Code Quality (Pass 4)

**Agent:** A01
**Date:** 2026-02-23
**Audit ID:** 2026-02-23-01
**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/config.ts` (77 lines)

## Inventory

### Imports
- `assert` from `"assert"` (Node built-in)
- `CyToken` from `"./types"` (used on line 21)
- `Epoch` from `"./types"` (UNUSED)
- `seedrandom` from `"seedrandom"` (used on line 55)

### Exports
| Name | Kind | Used In |
|------|------|---------|
| `REWARDS_SOURCES` | `const string[]` (6 entries) | `processor.ts` |
| `FACTORIES` | `const string[]` (4 entries) | `processor.ts` |
| `CYTOKENS` | `const CyToken[]` (2 entries) | `processor.ts`, `processor.test.ts`, `index.ts` |
| `RPC_URL` | `const string` | `processor.ts` |
| `isSameAddress` | `function(string, string): boolean` | `processor.ts` |
| `generateSnapshotBlocks` | `function(string, number, number): number[]` | `index.ts`, `config.test.ts` |

---

## Findings

### A01-1 -- LOW -- Unused import: `Epoch`

**Location:** Line 2

```typescript
import { CyToken, Epoch } from "./types";
```

`Epoch` is imported but never referenced anywhere in `config.ts`. The type is only used in `types.ts` itself (as a definition). This is dead code in the import list. The `tsconfig.json` does not enable `noUnusedLocals` or `noUnusedParameters`, so TypeScript does not flag this.

**Recommendation:** Remove `Epoch` from the import statement.

---

### A01-2 -- LOW -- Inconsistent address casing across configuration arrays

**Location:** Lines 5-36

Ethereum addresses in the configuration arrays use a mix of EIP-55 checksummed, fully-lowercase, and partially-mixed casing:

- `REWARDS_SOURCES`:
  - `"0xcee8cd002f151a536394e564b84076c41bbbcd4d"` -- fully lowercase (line 6)
  - `"0x0f3D8a38D4c74afBebc2c42695642f0e3acb15D3"` -- mixed/checksummed (line 7)
  - `"0x8c7ba8f245aef3216698087461e05b85483f791f"` -- fully lowercase (line 10)
  - Others are mixed-case checksummed

- `FACTORIES`: All entries are mixed-case checksummed (consistent within this array)

- `CYTOKENS`:
  - `underlyingAddress` for cysFLR: `"0x12e605bc104e93B45e1aD99F9e555f659051c2BB"` -- mixed
  - `underlyingAddress` for cyWETH: `"0x1502fa4be69d526124d453619276faccab275d3d"` -- fully lowercase

All comparisons in the codebase use `toLowerCase()` or `isSameAddress()`, so this is not a correctness bug. However, the inconsistency is a maintenance concern. If a future contributor adds an address comparison that omits case normalization, bugs could result.

**Recommendation:** Normalize all addresses to a single convention. Either use EIP-55 checksums throughout (provides built-in typo detection) or lowercase throughout (matches runtime normalization). EIP-55 checksummed addresses are preferable since they allow checksum validation.

---

### A01-3 -- INFO -- `isSameAddress` is underutilized; inline `.toLowerCase()` comparisons duplicate its logic

**Location:** Line 40-42

`isSameAddress` is defined in `config.ts` and correctly encapsulates case-insensitive address comparison:

```typescript
export function isSameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}
```

However, the codebase has multiple places that perform the same comparison inline rather than using this function:

- `processor.ts:130` -- `v.address.toLowerCase() === transfer.tokenAddress.toLowerCase()`
- `processor.ts:416` -- `v.address.toLowerCase() === liquidityChangeEvent.tokenAddress.toLowerCase()`
- `diffCalculator.ts:78` -- `v.address.toLowerCase() === oldItem.address.toLowerCase()`
- `processor.test.ts:34-35` -- `source.toLowerCase() === APPROVED_SOURCE.toLowerCase()`

This is a leaky abstraction: the function exists but the convention is not consistently followed.

**Recommendation:** Replace inline `.toLowerCase() === .toLowerCase()` comparisons throughout the codebase with calls to `isSameAddress` for consistency and to centralize the comparison logic.

---

### A01-4 -- LOW -- `generateSnapshotBlocks` does not deduplicate; duplicate snapshots are possible

**Location:** Lines 50-76

The function generates 28 random blocks and adds the `start` and `end` blocks. It asserts the array has length 30 and sorts it, but does not check for or remove duplicates. If `rng()` produces a value that maps to `start`, `end`, or another already-generated block, the resulting array will contain duplicate block numbers. With a narrow range (small `end - start`), this probability increases.

The test `should return blocks in ascending order` (config.test.ts:28) uses `toBeGreaterThan` (strict), which would fail if duplicates existed for the test seed, but this is not guaranteed for all seeds.

The downstream impact depends on how snapshots are consumed. In `processor.ts`, duplicate snapshots would cause a balance to be sampled twice at the same block, subtly skewing the average. This is a minor correctness concern but worth noting.

**Recommendation:** Either deduplicate the array (and document that fewer than 30 snapshots is acceptable), or use a `Set` to ensure uniqueness when generating random blocks.

---

### A01-5 -- INFO -- Magic number 30 (and 28) for snapshot count is not a named constant

**Location:** Lines 58-69

```typescript
const snapshots: number[] = [start, end];
// start + end + 28 = 30 snapshots
for (let i = 0; i < 28; i++) {
```

and:

```typescript
assert.ok(
  snapshots.length === 30,
  `failed to generated expected number of snapshots, expected: 30, got: ${snapshots.length}`
);
```

The snapshot count (30) and derived loop count (28) are hardcoded. While the comment on line 60 explains the relationship, extracting `30` to a named constant (e.g., `SNAPSHOT_COUNT`) would improve readability and make it easier to change the snapshot count in the future without risking inconsistency between the loop bound and the assertion.

**Recommendation:** Extract to a named constant such as `const SNAPSHOT_COUNT = 30` and derive the loop bound as `SNAPSHOT_COUNT - 2`.

---

### A01-6 -- INFO -- `RPC_URL` is hardcoded; not configurable via environment

**Location:** Line 38

```typescript
export const RPC_URL = "https://flare-api.flare.network/ext/C/rpc";
```

Other configuration values (`SEED`, `START_SNAPSHOT`, `END_SNAPSHOT`) are loaded from `.env` via `dotenv` in other files, but `RPC_URL` is hardcoded. This means switching RPC providers (e.g., for testing, rate limit fallback, or using a private node) requires a code change.

**Recommendation:** Consider loading `RPC_URL` from an environment variable with a fallback to the current hardcoded default.

---

### A01-7 -- INFO -- Minor typo in assertion message: "generated" should be "generate"

**Location:** Line 69

```typescript
`failed to generated expected number of snapshots, expected: 30, got: ${snapshots.length}`
```

Should read "failed to generate" (infinitive form after "failed to").

**Recommendation:** Fix the typo for clarity.

---

### A01-8 -- INFO -- No commented-out code detected

The file contains only legitimate inline comments (address labels and algorithm notes). No commented-out code was found.

---

## Summary

| ID | Severity | Title |
|----|----------|-------|
| A01-1 | LOW | Unused import: `Epoch` |
| A01-2 | LOW | Inconsistent address casing across configuration arrays |
| A01-3 | INFO | `isSameAddress` is underutilized; inline comparisons duplicate its logic |
| A01-4 | LOW | `generateSnapshotBlocks` does not deduplicate; duplicate snapshots are possible |
| A01-5 | INFO | Magic number 30 for snapshot count is not a named constant |
| A01-6 | INFO | `RPC_URL` is hardcoded; not configurable via environment |
| A01-7 | INFO | Minor typo in assertion message |
| A01-8 | INFO | No commented-out code detected |

**Overall Assessment:** The file is compact, well-structured, and serves its purpose as a central configuration module. No high-severity issues were found. The main actionable items are removing the unused `Epoch` import (A01-1), normalizing address casing (A01-2), and propagating consistent use of the `isSameAddress` abstraction (A01-3). The potential for duplicate snapshots (A01-4) is a low-probability edge case but worth addressing for correctness.
