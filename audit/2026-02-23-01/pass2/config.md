# Audit 2026-02-23-01 / Pass 2 (Test Coverage) / config.ts

**Agent:** A01
**Source file:** `src/config.ts` (77 lines)
**Test file:** `src/config.test.ts` (43 lines)

## Evidence of Thorough Reading

### Source file — functions/methods (with line numbers)

| Line | Name | Signature |
|------|------|-----------|
| 40-42 | `isSameAddress` | `(a: string, b: string): boolean` |
| 50-76 | `generateSnapshotBlocks` | `(seed: string, start: number, end: number): number[]` |

### Source file — constants/types exported

| Line | Name | Kind |
|------|------|------|
| 5-12 | `REWARDS_SOURCES` | `string[]` (6 DEX router/orderbook addresses) |
| 14-19 | `FACTORIES` | `string[]` (4 factory addresses) |
| 21-36 | `CYTOKENS` | `CyToken[]` (2 entries: cysFLR, cyWETH) |
| 38 | `RPC_URL` | `string` |

### Test file — every test case

| Line | Test name |
|------|-----------|
| 8-11 | `should generate correct number of blocks` |
| 13-19 | `should be deterministic - same seed produces same results` |
| 21-26 | `should produce different results with different seeds` |
| 28-34 | `should return blocks in ascending order` |
| 36-42 | `should generate blocks within the epoch range` |

---

## Findings

### A01-1 — HIGH — `isSameAddress` has zero test coverage

The function `isSameAddress` (line 40-42) is exported and used elsewhere in the codebase for case-insensitive address comparison, but no test exercises it at all. It is not even imported in the test file. This function underpins security-critical logic (determining whether a transfer source is an approved DEX router), so its correctness should be verified. Test cases should include:

- Both addresses identical (same case)
- Both addresses identical but different case (mixed, upper, lower)
- Two different addresses
- Empty string inputs
- Addresses with and without `0x` prefix (to confirm current behavior, which does no prefix normalization)

### A01-2 — MEDIUM — `generateSnapshotBlocks` not tested with `start === end` (zero-range boundary)

When `start === end`, the range is 1 and the function should still produce 30 blocks all equal to `start`. This is a degenerate but valid boundary condition. The current test uses `start = 5000, end = 9000` exclusively. The assertion at line 67-70 would still pass but the sorting check in the test (line 31-33 using `toBeGreaterThan` i.e. strict inequality) would fail, revealing that the test itself assumes no duplicate values. This boundary exposes an implicit assumption about uniqueness that is never tested or documented.

### A01-3 — MEDIUM — `generateSnapshotBlocks` not tested with `start > end` (inverted range)

If `start > end`, then `range = end - start + 1` is zero or negative and `Math.floor(rng() * range) + start` will produce values outside any sensible range. There is no guard or assertion for this precondition. A test should verify whether the function throws or returns a meaningful error for inverted inputs.

### A01-4 — MEDIUM — `generateSnapshotBlocks` not tested with adjacent blocks (`end === start + 1`)

With a range of only 2, all 30 snapshots must be either `start` or `start + 1`. This minimal non-degenerate case is an important boundary that verifies the `Math.floor(rng() * range) + start` arithmetic works correctly at the smallest useful range. No test exercises this.

### A01-5 — LOW — `generateSnapshotBlocks` not tested with empty seed string

The function accepts any string as a seed, but no test verifies behavior when the seed is an empty string `""`. While `seedrandom("")` is technically valid, this is an edge case worth documenting through a test.

### A01-6 — LOW — No tests verify the ascending sort invariant holds when duplicate blocks are generated

The test at line 28-34 uses strict greater-than (`toBeGreaterThan`) to check ordering, which implicitly asserts all blocks are unique. However, with a small range (e.g., `start = 0, end = 5`) collisions are virtually guaranteed. The sort at line 73 uses `(a, b) => a - b` which is stable for duplicates, but the test would fail. There should be a test with a very small range that uses `toBeGreaterThanOrEqual` to verify sorting with duplicates, and a separate consideration of whether duplicates are acceptable behavior.

### A01-7 — LOW — Exported constants `REWARDS_SOURCES`, `FACTORIES`, `CYTOKENS`, `RPC_URL` have no structural tests

While these are static configuration values, there are no tests that verify:

- All addresses in `REWARDS_SOURCES` and `FACTORIES` are valid Ethereum addresses (40 hex chars after `0x`)
- `CYTOKENS` entries have all required fields populated and non-empty
- `RPC_URL` is a well-formed URL
- No duplicate entries exist in `REWARDS_SOURCES` or `FACTORIES`

These are not high-priority since the values are hard-coded, but structural validation tests serve as a safety net against copy-paste errors during maintenance.

### A01-8 — INFO — Test describe block name is misleading

The describe block is named `'Test generateSnapshotTimestampForEpoch'` (line 4) but the function under test is `generateSnapshotBlocks`. The `Epoch` type is imported in the source file but not used by `generateSnapshotBlocks`. This suggests the function was renamed at some point but the test description was not updated. This is a readability issue, not a coverage gap.

### A01-9 — MEDIUM — `generateSnapshotBlocks` not tested with very large range values

No test exercises behavior with large block numbers (e.g., `start = 0, end = Number.MAX_SAFE_INTEGER`) where `Math.floor(rng() * range) + start` could lose precision due to floating-point arithmetic. Since `rng()` returns a float in [0,1) and `range` could be up to ~9e15, the multiplication may lose precision beyond 2^53. Block numbers on Flare are currently in the tens of millions, so this is unlikely in practice, but a test documenting the safe operating range would be valuable.

### A01-10 — INFO — `Epoch` type is imported but unused in `config.ts`

Line 2 imports `Epoch` from `./types` but no function or constant in `config.ts` uses it. This is a dead import. While not a test coverage issue per se, it suggests there may have been a function that was removed or moved without cleaning up imports.
