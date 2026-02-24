# Pass 2: Test Coverage Audit for `src/config.ts`

**Auditor:** A01
**Date:** 2026-02-24
**Source file:** `src/config.ts` (102 lines)
**Test file:** `src/config.test.ts` (68 lines)

---

## 1. Evidence of Thorough Reading

### Source file: `src/config.ts` -- Exported Items Inventory

| # | Export | Kind | Lines | Description |
|---|--------|------|-------|-------------|
| 1 | `REWARDS_SOURCES` | `const string[]` | 5-12 | Array of 6 approved DEX router / orderbook addresses. |
| 2 | `FACTORIES` | `const string[]` | 14-19 | Array of 4 factory contract addresses (Sparkdex V2, V3, V3.1, Blazeswap). |
| 3 | `CYTOKENS` | `const CyToken[]` | 21-46 | Array of 3 CyToken definitions (cysFLR, cyWETH, cyFXRP) each with name, address, underlyingAddress, underlyingSymbol, receiptAddress, decimals. |
| 4 | `RPC_URL` | `const string` | 48 | Hardcoded Flare RPC URL `"https://flare-api.flare.network/ext/C/rpc"`. |
| 5 | `isSameAddress()` | `function (a: string, b: string) => boolean` | 50-52 | Case-insensitive address comparison via `toLowerCase()`. |
| 6 | `generateSnapshotBlocks()` | `function (seed, start, end) => number[]` | 60-86 | Generates 30 deterministic snapshot blocks using seedrandom. Always includes `start` and `end`; generates 28 additional random blocks in `[start, end]`. Asserts length === 30. Sorts ascending. |
| 7 | `scaleTo18()` | `function (value: bigint, decimals: number) => bigint` | 93-101 | Scales a value from arbitrary decimal precision to 18 decimals. Three branches: decimals === 18 (identity), decimals > 18 (divide), decimals < 18 (multiply). |

### Test file: `src/config.test.ts` -- Test Case Inventory

| # | Describe Block | Test Case | Lines | What It Tests |
|---|----------------|-----------|-------|---------------|
| 1 | `Test generateSnapshotTimestampForEpoch` | "should generate correct number of blocks" | 8-11 | Calls with seed `'test-seed'`, start=5000, end=9000. Asserts length === 30. |
| 2 | same | "should be deterministic - same seed produces same results" | 13-19 | Two calls with same seed/range produce identical arrays. |
| 3 | same | "should produce different results with different seeds" | 21-26 | Two calls with different seeds produce different arrays. |
| 4 | same | "should return blocks in ascending order" | 28-34 | Asserts each block is strictly greater than the previous (ascending + unique). |
| 5 | same | "should generate blocks within the epoch range" | 36-42 | Every block >= start and <= end. |
| 6 | `Test math functions` | "should test scale to 18" | 46-67 | Three sub-cases: decimals=3 (scale up), decimals=23 (scale down), decimals=18 (identity). |

**Imports in test file:** Only `generateSnapshotBlocks` and `scaleTo18` are imported. `isSameAddress`, `REWARDS_SOURCES`, `FACTORIES`, `CYTOKENS`, and `RPC_URL` are not imported and therefore have zero test coverage.

---

## 2. Coverage Matrix

| Exported Item | Tested? | Test Cases | Notes |
|---------------|---------|------------|-------|
| `REWARDS_SOURCES` | NO | -- | No structural validation tests. |
| `FACTORIES` | NO | -- | No structural validation tests. |
| `CYTOKENS` | NO | -- | No structural or schema validation tests. |
| `RPC_URL` | NO | -- | No tests. |
| `isSameAddress()` | NO | -- | Not imported in test file at all. |
| `generateSnapshotBlocks()` | YES (partial) | 5 tests | Core happy-path well covered. Missing edge cases (see findings). |
| `scaleTo18()` | YES (partial) | 1 test, 3 sub-cases | Three decimal branches covered. Missing edge cases (see findings). |

---

## 3. Findings

### A01-1: `isSameAddress()` has zero test coverage [HIGH]

**Severity:** HIGH

`isSameAddress()` is exported and used throughout the codebase (processor.ts relies on it to determine whether transfers are from approved sources, whether accounts match blocklist entries, and LP position matching). It is a critical utility in the reward-eligibility logic, yet it has no tests whatsoever.

**Missing test scenarios:**

- Basic case-insensitive match: mixed-case inputs that should match (e.g., `"0xAbC..."` vs `"0xabc..."`).
- Non-matching addresses should return false.
- Both addresses already lowercase.
- Both addresses already checksummed (EIP-55).
- Empty string inputs.
- Non-hex / non-address strings (defensive behavior).

**Risk:** A regression in this function (e.g., someone changes the comparison logic) would silently break all approved-source detection and blocklist matching, directly impacting reward distribution correctness.

---

### A01-2: `generateSnapshotBlocks()` missing edge case tests [MEDIUM]

**Severity:** MEDIUM

The existing 5 tests cover the happy path well (correct count, determinism, ordering, range bounds, seed variation). However, the following edge cases are not tested:

1. **`start === end`** -- When the range is a single block, `range` is 1, and all 30 snapshots should be that single block. The current strict-ascending-order test (line 32: `toBeGreaterThan`) would actually *fail* for this case, since duplicates are inevitable. This reveals a latent behavioral question: is `start === end` a valid input? If so, the sort-ascending test expectations are wrong; if not, the function should reject it with an assertion.
2. **`start > end`** -- Produces a negative range. `Math.floor(rng() * negativeRange) + start` would generate blocks outside any sensible range. The function does not guard against this. No test verifies whether an error is thrown or what behavior results.
3. **Adjacent blocks (`end === start + 1`)** -- Range of 2, so all 30 blocks are either `start` or `start + 1`. The strict-ascending-order expectation would again fail here because duplicates are guaranteed among 30 picks from 2 values.
4. **Very large range** -- No test with a range spanning millions of blocks (matching production scale where START_SNAPSHOT and END_SNAPSHOT can differ by millions).
5. **Empty seed (`""`)** -- seedrandom accepts an empty string but it behaves differently from other seeds. No test validates this.

**Risk:** Edge cases 1-3 indicate that the function may silently produce incorrect or unexpected results for degenerate inputs. In production the range is always large, reducing immediate risk, but a missing guard means future misconfigurations could go undetected.

---

### A01-3: `scaleTo18()` missing edge case tests [MEDIUM]

**Severity:** MEDIUM

The three branches (identity, scale-down, scale-up) are each hit once. Missing edge cases:

1. **`decimals = 0`** -- Scales by 10^18. Valid but extreme. Not tested.
2. **`value = 0n`** -- Should return 0n regardless of decimals. Not tested.
3. **Negative decimals** -- `decimals = -1` would cause `"0".repeat(19)` in the else-branch and `"0".repeat(-19)` in the else-if branch; `String.prototype.repeat` throws `RangeError` for negative counts. The function has no guard. Not tested.
4. **Very large decimals** (e.g., `decimals = 77`) -- Would produce a very large divisor. Not tested for correctness.
5. **Precision loss in scale-down** -- The integer division truncates. E.g., `scaleTo18(99999n, 23)` yields `0n` due to truncation. Whether this truncation-to-zero is acceptable is not validated by any test.

**Risk:** The `decimals = 6` case used in production (cyFXRP) is tested indirectly via `decimals = 3` (same branch). A test with `decimals = 6` explicitly would improve confidence. Negative decimals are the most dangerous gap since the function would throw an unhandled error.

---

### A01-4: `REWARDS_SOURCES`, `FACTORIES`, `CYTOKENS` have no structural validation tests [MEDIUM]

**Severity:** MEDIUM

These three exported constants are the foundation of the entire reward system. They determine which transfers are eligible, which factories are recognized for LP tracking, and which tokens are processed. There are no tests that validate:

- **Array lengths** -- e.g., `REWARDS_SOURCES` has 6 entries, `FACTORIES` has 4, `CYTOKENS` has 3.
- **Address format** -- All addresses are valid Ethereum-style hex strings (42 chars, `0x` prefix).
- **No duplicates** -- No two entries in any array are the same (case-insensitive).
- **CYTOKENS schema** -- Each entry has all required fields (`name`, `address`, `underlyingAddress`, `underlyingSymbol`, `receiptAddress`, `decimals`), decimals is a non-negative integer, addresses are valid hex.
- **CYTOKENS uniqueness** -- No two CYTOKENS share the same `address`, `underlyingAddress`, or `receiptAddress`.

**Risk:** These are configuration constants, not computed values, so they change infrequently. However, when they do change (e.g., adding a new cyToken or router), there is no automated guardrail to catch typos, duplicate entries, or malformed addresses. Given that incorrect configuration directly corrupts reward distribution, structural tests would be a valuable safety net.

---

### A01-5: `RPC_URL` has no test coverage [LOW]

**Severity:** LOW

`RPC_URL` is a hardcoded string constant. Testing it provides minimal value since it is unlikely to regress accidentally. However, a simple smoke test asserting it starts with `https://` and is a well-formed URL would catch accidental corruption.

---

### A01-6: `generateSnapshotBlocks()` ascending-order test may mask duplicates [INFO]

**Severity:** INFO

The test on line 32 uses `toBeGreaterThan` (strict), which implicitly asserts no duplicates. This is a good property for the happy path (range=4001), but it is not explicitly documented as an intentional uniqueness check. The describe block name is "should return blocks in ascending order," not "should return unique blocks in ascending order." If the intent is to guarantee uniqueness, a dedicated test with an explicit `new Set(blocks).size === 30` assertion would make the contract clearer. Note: with a range of 4001 and only 30 picks, collisions are astronomically unlikely but not impossible. The function does not deduplicate.

---

### A01-7: Test describe block name is misleading [INFO]

**Severity:** INFO

The describe block on line 4 is named `'Test generateSnapshotTimestampForEpoch'` but it tests `generateSnapshotBlocks`. This appears to be a stale name from a refactor. It does not affect test behavior but reduces readability and could confuse future maintainers.

---

## 4. Summary

| Severity | Count | Finding IDs |
|----------|-------|-------------|
| CRITICAL | 0 | -- |
| HIGH | 1 | A01-1 |
| MEDIUM | 3 | A01-2, A01-3, A01-4 |
| LOW | 1 | A01-5 |
| INFO | 2 | A01-6, A01-7 |

**Overall assessment:** The two tested functions (`generateSnapshotBlocks` and `scaleTo18`) have reasonable happy-path coverage, but edge cases for degenerate inputs are absent. The most significant gap is the complete lack of tests for `isSameAddress()`, which is a small but security-critical utility used pervasively in reward-eligibility logic. The configuration constants (`REWARDS_SOURCES`, `FACTORIES`, `CYTOKENS`) lack any structural validation tests, meaning configuration errors introduced during maintenance would not be caught by the test suite.
