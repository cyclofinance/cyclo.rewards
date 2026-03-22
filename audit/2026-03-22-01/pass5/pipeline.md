# Pass 5: Correctness / Intent Verification — `src/pipeline.ts`

**Auditor:** A06
**Date:** 2026-03-22
**Files:** `src/pipeline.ts` (125 lines), `src/pipeline.test.ts` (411 lines)

## Evidence of Thorough Reading

- Read all 8 exported functions in `pipeline.ts`: `summarizeTokenBalances`, `aggregateRewardsPerAddress`, `sortAddressesByReward`, `filterZeroRewards`, `formatRewardsCsv`, `formatBalancesCsv`, `parseJsonl`, `parseBlocklist`.
- Read all 41 test cases across 8 `describe` blocks in `pipeline.test.ts`.
- Read `src/types.ts` (126 lines) to verify `EligibleBalances`, `RewardsPerToken`, `TokenBalances`, `BlocklistReport` type definitions and documented invariants.
- Read `src/constants.ts` (58 lines) to verify `REWARDS_CSV_COLUMN_HEADER_ADDRESS`, `REWARDS_CSV_COLUMN_HEADER_REWARD`, `validateAddress`, `VALID_ADDRESS_REGEX`.
- Read `src/index.ts` (lines 100-170) to verify how pipeline functions are consumed in the actual pipeline.
- Read `data/blocklist.txt` (17 lines) to verify real data matches the expected format.
- Ran `vitest run src/pipeline.test.ts` — all 41 tests pass.
- Verified column count consistency in `formatBalancesCsv` header vs data rows for single-token and multi-token cases (both produce correct 16-column output for 2 tokens / 2 snapshots).
- Verified `sortAddressesByReward` comparator produces descending order by tracing through bigint comparison logic.
- Verified `parseBlocklist` handles edge cases (trailing newlines, empty lines, mixed-case addresses, single-address lines) safely via `validateAddress` guards.

## Findings

### P5-PIPELINE-01: `sortAddressesByReward` is non-deterministic for equal rewards [LOW]

**Location:** `src/pipeline.ts:47-53`

`sortAddressesByReward` returns `0` for equal-valued addresses, relying on the JS engine's sort stability. While V8 (Node.js) uses TimSort (stable since Node 10), the ECMAScript spec only guarantees stable sort since ES2019. More importantly, the output CSV order for tied addresses varies depending on insertion order of the `Map`, which depends on the order tokens and addresses are processed. If two addresses have exactly equal total rewards, the CSV row order for those addresses is not reproducible across different JS engine implementations or if the upstream processing order changes.

The test at line 166 correctly avoids asserting order for equal rewards, acknowledging the instability, but the function name `sortAddressesByReward` implies a deterministic ordering.

**Impact:** Cosmetic non-determinism in CSV output for tied addresses. The CI `git-clean.yaml` determinism check would catch any actual divergence. In practice this is unlikely to cause issues because the entire pipeline runs in a single Node.js version via nix.

**Recommendation:** Add a tiebreaker on address string to guarantee deterministic output regardless of engine:
```ts
return valueB > valueA ? 1 : valueB < valueA ? -1 : a.localeCompare(b);
```

---

### P5-PIPELINE-02: `parseBlocklist` uses `split(" ")` which fails silently on double spaces or tabs [LOW]

**Location:** `src/pipeline.ts:116`

`line.split(" ")` splits on a single space character only. If a blocklist line were to contain double spaces (`"0xAAA  0xBBB"`), the split produces `["0xAAA", "", "0xBBB"]`, so `reporter = "0xAAA"` and `reported = ""` (empty string). The `validateAddress` call would catch this (empty string fails the regex), so it does not silently produce wrong results. However, the error message would be misleading: `'Invalid cheater address: "" is not a valid address'` when the actual issue is formatting.

Similarly, tab-separated lines (`"0xAAA\t0xBBB"`) would produce `["0xAAA\t0xBBB"]`, making `reporter = "0xAAA\t0xBBB"` and `reported = undefined`. Again caught by validation but with a confusing error.

**Impact:** Low — the real `data/blocklist.txt` uses single spaces consistently. The validation layer catches malformed input. This is a robustness concern, not a correctness bug.

**Recommendation:** Use `line.trim().split(/\s+/)` to handle any whitespace delimiter and leading/trailing whitespace, or add a comment documenting the expected format contract.

---

### P5-PIPELINE-03: `filterZeroRewards` does not guard against negative rewards [INFO]

**Location:** `src/pipeline.ts:55-57`

The filter condition `(rewards.get(address) || 0n) !== 0n` will pass through negative reward values. While negative rewards should never occur (processor clamps negative balances to zero, and the reward formula `final18 * pool / totalBalance` produces non-negative results), there is no defensive check.

**Impact:** None in current code. The rewards output test (`src/rewardsOutput.test.ts:47-49`) independently verifies no negative values appear in the final CSV.

**No action required.** Informational only.

---

### P5-PIPELINE-04: No test for `parseBlocklist` with extra fields on a line [INFO]

**Location:** `src/pipeline.test.ts`

There is no test for a line containing more than two space-separated values (e.g., `"0xAAA 0xBBB 0xCCC"`). JavaScript array destructuring silently ignores extra elements, so this would parse as `reporter=0xAAA, cheater=0xBBB` and silently discard `0xCCC`. Both addresses would pass validation.

**Impact:** None in current data (all lines have exactly two addresses). If the format were ever extended, extra fields would be silently dropped. Unlikely to matter given the stable, well-defined blocklist format.

**No action required.** Informational only.

---

### P5-PIPELINE-05: `summarizeTokenBalances` skips tokens with no balance data instead of reporting them [INFO]

**Location:** `src/pipeline.ts:18-19`

When a token in `cytokens` has no corresponding entry in the `balances` map, the function silently `continue`s. The caller in `index.ts` (line 116) iterates the returned summaries and verifies each, but never notices missing tokens. If a token is misconfigured (wrong address casing, typo), it would silently produce no summary rather than flagging the issue.

**Impact:** Low in practice — the pipeline also calculates rewards per token and logs totals, so a fully missing token would produce visibly zero rewards. But the verification step (`summarizeTokenBalances`) is specifically meant to catch problems and could be more assertive.

**No action required.** Informational — the pipeline has other checks that would surface a fully missing token.

---

## Verification Summary

| Function | Claimed Behavior | Verified? | Notes |
|---|---|---|---|
| `summarizeTokenBalances` | Verifies `average - penalties + bounties === final` | YES | Invariant is mathematically correct (sum distributes over arithmetic). Tests cover pass, fail, missing token, multi-token cases. |
| `aggregateRewardsPerAddress` | Sums rewards across tokens per address | YES | Straightforward accumulation. Tests cover multi-token, single-token, disjoint addresses, empty input. |
| `sortAddressesByReward` | Sorts descending by reward | YES | Comparator logic is correct for descending order. Non-deterministic for ties (P5-PIPELINE-01). |
| `filterZeroRewards` | Removes zero-reward addresses | YES | Correct. Tests cover mixed, all-zero, all-nonzero, empty, order-preservation. |
| `formatRewardsCsv` | Produces `address,amount` CSV | YES | Header matches constants. Row formatting correct. Tests verify header, data, ordering. |
| `formatBalancesCsv` | Produces snapshot+summary columns per token | YES | Column count verified for 1-token and 2-token cases. Header and data columns align. Fallback zeros are correct length. |
| `parseJsonl` | Parses newline-delimited JSON | YES | Handles empty lines, single line, arrays, errors with line numbers. |
| `parseBlocklist` | Parses `reporter cheater` per line | YES | Lowercases, skips empty lines, validates addresses. Minor robustness concern with whitespace (P5-PIPELINE-02). |

## Test Coverage Assessment

All 8 exported functions have dedicated test suites. Tests exercise:
- Happy path with representative data
- Empty/zero inputs
- Single-element inputs
- Multi-element inputs
- Error paths (invalid JSON, invalid addresses)
- Edge cases (trailing newlines, multiple empty lines, equal values)

**Missing coverage (minor):**
- No test for `sortAddressesByReward` with negative reward values
- No test for `parseBlocklist` with extra space-separated fields
- No test for `formatBalancesCsv` with zero snapshots (would produce degenerate header)

Overall test quality is high. Tests accurately exercise the behavior their names describe.
