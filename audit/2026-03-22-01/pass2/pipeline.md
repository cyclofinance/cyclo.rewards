# Pass 2: Test Coverage -- `src/pipeline.ts`

**Auditor:** A06
**Date:** 2026-03-22
**Source:** `src/pipeline.ts` (125 lines, 1 interface, 8 exported functions)
**Tests:** `src/pipeline.test.ts` (410 lines, 8 describe blocks, 40 tests)

## Source Inventory

| # | Name | Kind | Line | Branches / Error Paths |
|---|------|------|------|------------------------|
| 1 | `TokenSummary` | interface | 5 | -- |
| 2 | `summarizeTokenBalances` | function | 14 | `!tokenBalances` skip (L18), verified invariant check (L31) |
| 3 | `aggregateRewardsPerAddress` | function | 37 | `\|\| 0n` fallback for first-seen address (L41) |
| 4 | `sortAddressesByReward` | function | 47 | bigint three-way comparison (L51) |
| 5 | `filterZeroRewards` | function | 55 | `\|\| 0n` fallback for missing address (L56) |
| 6 | `formatRewardsCsv` | function | 59 | `\|\| 0n` fallback for missing reward (L62) |
| 7 | `formatBalancesCsv` | function | 67 | `!tokenBalances` (L85), `!tokenBalance` (L87), `?? 0n` reward lookup (L88), `\|\| 0n` total rewards (L91) |
| 8 | `parseJsonl` | function | 97 | empty-line skip (L101), JSON parse error with line number (L104-105) |
| 9 | `parseBlocklist` | function | 111 | empty-line filter (L114), validateAddress throws for reporter (L117), validateAddress throws for cheater (L118) |

## Test Inventory

| # | Describe Block | Tests | Lines |
|---|---------------|-------|-------|
| 1 | `parseBlocklist` | 9 | 6-80 |
| 2 | `parseJsonl` | 6 | 82-109 |
| 3 | `aggregateRewardsPerAddress` | 4 | 111-145 |
| 4 | `sortAddressesByReward` | 4 | 147-176 |
| 5 | `filterZeroRewards` | 5 | 180-218 |
| 6 | `formatRewardsCsv` | 3 | 220-250 |
| 7 | `formatBalancesCsv` | 5 | 252-339 |
| 8 | `summarizeTokenBalances` | 4 | 341-410 |

## Coverage Analysis

### Covered

Every exported function has at least one test. The following branches and paths are explicitly tested:

- `parseBlocklist`: happy path, lowercasing, empty lines, empty input, single entry, same reporter multiple cheaters, real data, consecutive empty lines, invalid reporter throws, invalid cheater throws
- `parseJsonl`: multi-line, empty lines, empty input, single line, arrays, malformed JSON throws with line number
- `aggregateRewardsPerAddress`: multi-token same address, address in one token only, empty input, single token
- `sortAddressesByReward`: descending sort, empty, single, equal values
- `filterZeroRewards`: zero removal, none zero, all zero, empty, order preservation
- `formatRewardsCsv`: happy path, empty, order preservation
- `formatBalancesCsv`: header format, data rows, missing balance (zeros), empty addresses, multi-token with partial data
- `summarizeTokenBalances`: totals, verified=false, no data skip, multiple tokens

### Gaps Found

---

### P2-PIPE-01: `filterZeroRewards` -- address not in map at all

**Severity: LOW**

`filterZeroRewards` (L56) uses `rewards.get(address) || 0n` which means an address in the `addresses` array but entirely absent from the `rewards` map is treated as zero and filtered out. No test passes an address that is in the addresses array but not in the rewards map. This is a distinct edge case from "address is in map with value 0n".

While the current fallback produces correct behavior (filters it out), the implicit assumption is untested.

---

### P2-PIPE-02: `formatRewardsCsv` -- address not in map

**Severity: LOW**

`formatRewardsCsv` (L62) uses `rewards.get(address) || 0n`. No test checks what happens when an address in the `addresses` array has no entry in the `rewards` map. It would produce `"0xaddr,0"` -- correct behavior, but untested.

---

### P2-PIPE-03: `formatBalancesCsv` -- token exists in balances but address has no entry

**Severity: LOW**

`formatBalancesCsv` has two fallback branches:
1. `!tokenBalances` (L85) -- token not in balances map at all: tested at line 294-303
2. `!tokenBalance` (L87) -- token exists in map but this specific address is not in it: **not tested**

These are distinct code paths (the first never reaches L86-87). A test should exercise the case where the token's balance map exists but does not contain the queried address.

---

### P2-PIPE-04: `formatBalancesCsv` -- `totalRewardsPerAddress` missing entry for address

**Severity: LOW**

Line 91 uses `totalRewardsPerAddress.get(address) || 0n` as a fallback. No test verifies this fallback: all existing tests either have the address in `totalRewards` or pass an empty addresses list. A test should pass an address in the addresses array while omitting it from `totalRewardsPerAddress`.

---

### P2-PIPE-05: `formatBalancesCsv` -- `rewardsPerToken` missing entry for address within a token

**Severity: LOW**

Line 88 uses `rewardsPerToken.get(token.address.toLowerCase())?.get(address) ?? 0n`. The `?.get(address)` optional chaining handles two sub-cases:
1. Token not in `rewardsPerToken` at all
2. Token exists but address missing

Only case (1) is implicitly tested (via multi-token test at line 312-338 where `rewardsPerToken` has no entry for token2). Case (2) -- token exists in rewardsPerToken map but this specific address is absent -- is not tested.

---

### P2-PIPE-06: `sortAddressesByReward` -- stability of equal-value sort

**Severity: INFO**

The equal-rewards test (line 166-175) only checks that both addresses are present, not their relative order. The sort uses a three-way comparison that returns `0` for equal values, making the order implementation-dependent. This is acceptable behavior but the test could be more specific by verifying deterministic behavior or explicitly documenting non-determinism.

---

### P2-PIPE-07: `parseBlocklist` -- line with extra whitespace or extra fields

**Severity: LOW**

`parseBlocklist` splits each line by a single space (`line.split(" ")`). If a line has extra spaces (e.g., trailing space, or three space-separated tokens), the destructured `[reporter, reported]` silently ignores extra fields and the code proceeds. If a line has a tab separator or multiple spaces between the two addresses, `reporter` or `reported` will be invalid and `validateAddress` will throw, but this behavior is untested. A test should verify that malformed lines (extra spaces, tabs, trailing whitespace) are handled as expected.

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH | 0 |
| MEDIUM | 0 |
| LOW | 6 |
| INFO | 1 |

Overall, test coverage is solid. All 8 functions are tested with happy paths and key edge cases. The gaps are exclusively around untested fallback branches where the code already behaves correctly -- the risk is that a future refactor could break these paths without test detection.
