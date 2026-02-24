# Test Coverage Audit - config.ts

**Auditor:** A01
**Date:** 2026-02-22
**Pass:** 2
**Source file:** `/Users/thedavidmeister/Code/cyclo.rewards/src/config.ts`
**Test file:** `/Users/thedavidmeister/Code/cyclo.rewards/src/config.test.ts`

---

## Evidence of Thorough Reading

### Source: `config.ts` (77 lines)

| Item | Kind | Lines |
|------|------|-------|
| `seedrandom` | import | 3 |
| `assert` | import | 1 |
| `CyToken`, `Epoch` | type imports | 2 |
| `REWARDS_SOURCES` | exported constant (string[]) | 5-12 |
| `FACTORIES` | exported constant (string[]) | 14-19 |
| `CYTOKENS` | exported constant (CyToken[]) | 21-36 |
| `RPC_URL` | exported constant (string) | 38 |
| `isSameAddress(a, b)` | exported function | 40-42 |
| `generateSnapshotBlocks(seed, start, end)` | exported function | 50-76 |
| `assert.ok(snapshots.length === 30, ...)` | internal assertion (error path) | 67-70 |

**Note:** `Epoch` is imported on line 2 but never used anywhere in config.ts. This is a dead import.

### Test: `config.test.ts` (43 lines)

| Test | What it covers |
|------|----------------|
| "should generate correct number of blocks" (line 8) | Verifies 30 blocks returned |
| "should be deterministic - same seed produces same results" (line 13) | Determinism with identical seed |
| "should produce different results with different seeds" (line 21) | Different seeds diverge |
| "should return blocks in ascending order" (line 28) | Sort order (strict ascending via `toBeGreaterThan`) |
| "should generate blocks within the epoch range" (line 36) | All blocks in [start, end] |

Only `generateSnapshotBlocks` is imported and tested. No other export from `config.ts` is tested.

---

## Coverage Gaps

### A01-1 (HIGH) - `isSameAddress` has no unit test

**Function:** `isSameAddress(a: string, b: string): boolean` (line 40-42)

This function is used in production code (`processor.ts` lines 71, 94) for security-critical address comparison (determining approved reward sources and factory contracts). It has zero direct test coverage. Although `processor.test.ts` exercises code paths that call `isSameAddress` indirectly, the function itself is not tested in isolation.

**Missing cases:**
- Same address, same case -> `true`
- Same address, different case (mixed-case EIP-55 vs lowercase) -> `true`
- Different addresses -> `false`
- Empty strings -> behavior verification
- Non-hex / invalid address strings -> behavior verification

### A01-2 (MEDIUM) - `generateSnapshotBlocks` internal assertion never triggered

**Location:** lines 67-70

The `assert.ok(snapshots.length === 30, ...)` guard is structurally unreachable under normal execution because the function always pushes exactly 2 + 28 = 30 elements. There is no test that verifies the assertion message text or that modifying the internal logic (e.g., changing the loop bound) would trigger an assertion error. While the assertion itself is defensive coding, it has no test coverage for the failure path.

### A01-3 (MEDIUM) - Ascending order test assumes no duplicate snapshot blocks

**Location:** `config.test.ts` line 32

The test uses `toBeGreaterThan` (strict inequality), which asserts no two snapshot blocks are equal. With the test's range of `start=5000, end=9000` (range of 4001 possible values, picking 30), duplicates are extremely unlikely but theoretically possible from the RNG. If a duplicate were generated, the test would fail spuriously. More importantly, `generateSnapshotBlocks` uses `.sort()` without deduplication, so duplicates are valid output. The test implicitly asserts uniqueness without the function guaranteeing it.

### A01-4 (MEDIUM) - No edge-case testing for `generateSnapshotBlocks` boundary inputs

**Missing edge cases:**
- `start === end` (range of 1): All 30 blocks would be the same value. The current ascending-order test would fail on this input since it expects strict inequality. This reveals that the function's behavior on minimal range is untested and potentially inconsistent with test expectations.
- `start > end` (inverted range): `range` would be 0 or negative, causing `Math.floor(rng() * range) + start` to produce values outside [start, end] or equal to start. Behavior is undefined and untested.
- Very large ranges approaching `Number.MAX_SAFE_INTEGER`: potential floating-point precision issues in `Math.floor(rng() * range)`.
- Empty string seed: behavior is implicitly valid (seedrandom accepts it) but untested.

### A01-5 (LOW) - Exported constants `REWARDS_SOURCES`, `FACTORIES`, `CYTOKENS`, `RPC_URL` have no direct tests

These are static configuration arrays/values. While they are used indirectly in `processor.test.ts` (which imports `CYTOKENS`), there are no tests verifying:
- Array lengths or structure (e.g., `REWARDS_SOURCES` has the expected number of entries)
- Address format validity (all should be valid Ethereum addresses)
- No duplicate entries within each array
- `CYTOKENS` entries have all required fields populated with non-empty strings

These are low priority since they are static data, but structural validation tests could catch copy-paste errors or accidental deletions.

### A01-6 (INFO) - Dead import of `Epoch` type

**Location:** line 2

`Epoch` is imported from `./types` but never used in `config.ts`. This is a code hygiene issue, not a test coverage gap. TypeScript `--noUnusedLocals` would catch this if enabled.

---

## Summary

| ID | Severity | Description |
|----|----------|-------------|
| A01-1 | HIGH | `isSameAddress` has no unit test |
| A01-2 | MEDIUM | Internal assertion failure path never tested |
| A01-3 | MEDIUM | Ascending order test assumes no duplicate blocks |
| A01-4 | MEDIUM | No edge-case testing for boundary inputs (start===end, start>end) |
| A01-5 | LOW | Exported constants have no structural validation tests |
| A01-6 | INFO | Dead import of `Epoch` type |
