# Pass 3: Documentation Review -- `src/pipeline.ts`

**Auditor:** A06
**Date:** 2026-03-22
**Source:** `src/pipeline.ts` (125 lines, 1 interface, 8 exported functions)

## Evidence of Thorough Reading

| # | Kind | Name | Line | Has Module-Level JSDoc | Has JSDoc | Notes |
|---|------|------|------|------------------------|-----------|-------|
| 1 | interface | `TokenSummary` | 5-12 | -- | No | 6 fields: `name`, `totalAverage`, `totalPenalties`, `totalBounties`, `totalFinal`, `verified` |
| 2 | function | `summarizeTokenBalances` | 14-35 | -- | No | Params: `balances: EligibleBalances`, `cytokens: CyToken[]`. Returns `TokenSummary[]` |
| 3 | function | `aggregateRewardsPerAddress` | 37-45 | -- | No | Param: `rewardsPerToken: RewardsPerToken`. Returns `Map<string, bigint>` |
| 4 | function | `sortAddressesByReward` | 47-53 | -- | No | Param: `rewards: Map<string, bigint>`. Returns `string[]` |
| 5 | function | `filterZeroRewards` | 55-57 | -- | No | Params: `addresses: string[]`, `rewards: Map<string, bigint>`. Returns `string[]` |
| 6 | function | `formatRewardsCsv` | 59-65 | -- | No | Params: `addresses: string[]`, `rewards: Map<string, bigint>`. Returns `string[]` |
| 7 | function | `formatBalancesCsv` | 67-95 | -- | No | Params: `addresses`, `cytokens`, `snapshots`, `balances`, `rewardsPerToken`, `totalRewardsPerAddress`. Returns `string[]` |
| 8 | function | `parseJsonl` | 97-109 | -- | No | Param: `data: string`. Returns `any[]` |
| 9 | function | `parseBlocklist` | 111-124 | -- | No | Param: `data: string`. Returns `BlocklistReport[]` |

**Module-level JSDoc:** None. The file begins directly with `import` statements at line 1.

---

## Findings

### P3-PIPE-01 -- LOW -- No module-level JSDoc

**Lines 1-3.** The file has no module-level JSDoc comment describing its purpose. Other files in the codebase (`src/types.ts`, `src/constants.ts`) have module-level JSDoc. This file contains the core pipeline utility functions (balance summarization, reward aggregation, CSV formatting, JSONL/blocklist parsing) and should describe that role. A reader encountering this file for the first time cannot tell from the file itself what "pipeline" means in this context.

---

### P3-PIPE-02 -- LOW -- `TokenSummary` interface has no JSDoc

**Lines 5-12.** The exported interface has no JSDoc comment. Key undocumented aspects:

- What `TokenSummary` represents (aggregate balance statistics for a single cyToken across all accounts).
- The relationship between fields: `verified` is `true` when `totalAverage - totalPenalties + totalBounties === totalFinal` (line 31), but this invariant is not documented on the interface or the `verified` field.
- `totalAverage`, `totalPenalties`, `totalBounties`, `totalFinal` are all `bigint` values but their units (native token decimals) are not stated.
- None of the 6 fields have individual JSDoc comments.

---

### P3-PIPE-03 -- LOW -- `summarizeTokenBalances` has no JSDoc

**Lines 14-35.** No JSDoc on this exported function. Undocumented aspects:

- Purpose: computes per-token summary statistics by iterating over all accounts' `TokenBalances` and summing `average`, `penalty`, `bounty`, and `final` fields.
- The `verified` flag's invariant (`totalAverage - totalPenalties + totalBounties === totalFinal`) is a correctness check, but the function signature and body provide no documentation of why this check matters or what a `false` value implies.
- Tokens that have no entries in the `balances` map are silently skipped (line 18, `if (!tokenBalances) continue`). This behavior is not documented.

---

### P3-PIPE-04 -- LOW -- `aggregateRewardsPerAddress` has no JSDoc

**Lines 37-45.** No JSDoc. The function collapses per-token rewards into a single total reward per address. This cross-token aggregation is central to the reward pipeline but the function has no description of its purpose, inputs, or outputs.

---

### P3-PIPE-05 -- LOW -- `sortAddressesByReward` has no JSDoc

**Lines 47-53.** No JSDoc. The function sorts addresses in descending order by reward amount. The sort direction (descending) is not stated anywhere except by reading the comparator logic on line 51. A caller cannot determine the sort order from the function signature alone.

---

### P3-PIPE-06 -- INFO -- `filterZeroRewards` has no JSDoc

**Lines 55-57.** No JSDoc. The function's name is self-descriptive (filters out addresses with zero rewards), and the implementation is a single line. The only subtlety is that addresses absent from the map are also filtered (via `|| 0n` fallback), which could be documented but is minor given the straightforward implementation.

---

### P3-PIPE-07 -- LOW -- `formatRewardsCsv` has no JSDoc

**Lines 59-65.** No JSDoc. Undocumented aspects:

- The CSV format it produces (header row using `REWARDS_CSV_COLUMN_HEADER_ADDRESS` and `REWARDS_CSV_COLUMN_HEADER_REWARD` constants, then one data row per address).
- That the return value is an array of strings (lines), not a single concatenated CSV string. A caller must know to join with newlines.
- That the output format must match the Flare RNAT distribution tool's expected structure (as noted in the comment on the constants in `constants.ts` lines 14-15), but this requirement is not documented on the function itself.

---

### P3-PIPE-08 -- MEDIUM -- `formatBalancesCsv` has no JSDoc and complex parameter list

**Lines 67-95.** No JSDoc. This is the most complex function in the file with 6 parameters and intricate column generation logic. Undocumented aspects:

- Purpose: generates a detailed balance breakdown CSV with per-token per-snapshot columns, averages, penalties, bounties, final balances, per-token rewards, and total rewards.
- The column naming convention (`{tokenName}_snapshot{N}`, `{tokenName}_average`, etc.) is only discoverable by reading the template string on line 77.
- The relationship between parameters is implicit: `addresses` determines the row set, `cytokens` determines the token columns, `snapshots` determines the snapshot count per token, `balances`/`rewardsPerToken`/`totalRewardsPerAddress` provide the data. None of these relationships are documented.
- The return type (`string[]`) is an array of CSV lines, not a single string. This matches `formatRewardsCsv` but is not documented.
- Missing data fallback behavior: tokens not in `balances`, addresses not in a token's balance map, missing rewards entries -- all produce zeros. These fallbacks (lines 85, 87, 88, 91) are undocumented.

---

### P3-PIPE-09 -- LOW -- `parseJsonl` has no JSDoc and uses `any` return type

**Lines 97-109.** No JSDoc. Undocumented aspects:

- Purpose: parses newline-delimited JSON (JSONL format) into an array of parsed objects.
- Empty lines are silently skipped (line 101). This tolerance behavior is not documented.
- Parse errors include the 1-based line number in the error message (line 105), which is a useful diagnostic feature but not documented.
- The return type is `any[]`, which provides no type safety. While a JSDoc `@returns` tag cannot fix the TypeScript type, it could document what shapes the caller should expect.

---

### P3-PIPE-10 -- LOW -- `parseBlocklist` has no JSDoc

**Lines 111-124.** No JSDoc. Undocumented aspects:

- Purpose: parses the `data/blocklist.txt` file format (one `reporter cheater` pair per line, space-separated).
- Addresses are validated via `validateAddress` (lines 117-118) and lowercased (lines 120-121). Neither the validation behavior nor the case normalization is documented.
- Empty lines are filtered (line 114), providing tolerance for trailing newlines. Not documented.
- The expected input format (two space-separated Ethereum addresses per line) is not documented on the function. A reader must read the implementation to understand the expected format.

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH | 0 |
| MEDIUM | 1 |
| LOW | 8 |
| INFO | 1 |
| **Total** | **10** |

The file contains **zero JSDoc comments** across 1 interface and 8 exported functions. There is no module-level documentation. Every exported symbol lacks a description, parameter documentation, and return type documentation.

The most significant gap is **P3-PIPE-08** (`formatBalancesCsv`) which is the most complex function in the file with 6 parameters, intricate column generation, and multiple fallback code paths -- all undocumented. The next most impactful is **P3-PIPE-02** (`TokenSummary`) where the `verified` invariant is central to correctness checking but not documented on the interface.

Compared to `src/types.ts` and `src/constants.ts` which have thorough JSDoc on all exports, `src/pipeline.ts` has received no documentation attention. The functions in this file are the primary building blocks of the reward calculation pipeline, so their contracts and behaviors should be formally documented.
