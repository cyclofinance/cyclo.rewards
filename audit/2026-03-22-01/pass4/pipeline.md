# Pass 4: Code Quality Review -- `src/pipeline.ts`

**Auditor:** A06
**Date:** 2026-03-22
**File:** `src/pipeline.ts` (125 lines)

## Evidence of Thorough Reading

### Interfaces
| Name | Line | Description |
|------|------|-------------|
| `TokenSummary` | 5 | Summary of aggregated balances per token (average, penalties, bounties, final, verified flag) |

### Functions
| Name | Line | Description |
|------|------|-------------|
| `summarizeTokenBalances` | 14 | Aggregates per-account TokenBalances into per-token totals with a verification invariant |
| `aggregateRewardsPerAddress` | 37 | Sums rewards across all tokens per address |
| `sortAddressesByReward` | 47 | Returns addresses sorted descending by reward amount |
| `filterZeroRewards` | 55 | Removes addresses whose reward is zero |
| `formatRewardsCsv` | 59 | Produces CSV lines (header + data rows) for the rewards output |
| `formatBalancesCsv` | 67 | Produces CSV lines (header + data rows) for the balances output with per-token snapshot columns |
| `parseJsonl` | 97 | Parses newline-delimited JSON, returns array of parsed objects |
| `parseBlocklist` | 111 | Parses blocklist text (space-separated reporter/cheater pairs) into `BlocklistReport[]` |

### Imports (lines 1--3)
- `REWARDS_CSV_COLUMN_HEADER_ADDRESS`, `REWARDS_CSV_COLUMN_HEADER_REWARD` from `./constants`
- `validateAddress` from `./constants`
- `CyToken`, `EligibleBalances`, `RewardsPerToken`, `BlocklistReport` from `./types`

---

## Findings

### P4-PIPE-1: `parseJsonl` returns `any[]` -- weak return type

**Severity:** MEDIUM

**Location:** Lines 97--109

`parseJsonl` is typed as returning `any[]`. Every call site (`index.ts:49`, `index.ts:56`) then casts the result to a concrete type (`Transfer[]`, `LiquidityChange[]`) without any runtime validation. The `any` return type defeats TypeScript's type safety: if the subgraph schema changes or data files are corrupted, malformed objects propagate silently through the pipeline until they cause a runtime error far from the parsing point.

A generic overload or a schema-validation wrapper (e.g., zod) would push failures to the parsing boundary where they belong.

---

### P4-PIPE-2: Split imports from the same module

**Severity:** INFO

**Location:** Lines 1--2

```
import { REWARDS_CSV_COLUMN_HEADER_ADDRESS, REWARDS_CSV_COLUMN_HEADER_REWARD } from "./constants";
import { validateAddress } from "./constants";
```

Two separate import statements pull from `./constants`. These should be consolidated into one import statement. The same pattern appears in `scraper.ts` (lines 9--10), suggesting a codebase-wide inconsistency.

---

### P4-PIPE-3: Four redundant `Array.from(...).reduce()` iterations in `summarizeTokenBalances`

**Severity:** LOW

**Location:** Lines 20--23

```ts
const totalAverage = Array.from(tokenBalances.values()).reduce((sum, bal) => sum + bal.average, 0n);
const totalPenalties = Array.from(tokenBalances.values()).reduce((sum, bal) => sum + bal.penalty, 0n);
const totalBounties = Array.from(tokenBalances.values()).reduce((sum, bal) => sum + bal.bounty, 0n);
const totalFinal = Array.from(tokenBalances.values()).reduce((sum, bal) => sum + bal.final, 0n);
```

Each call to `Array.from(tokenBalances.values())` allocates a new array, and the map is iterated four times. A single loop accumulating all four sums simultaneously would be clearer and more efficient, especially as the number of accounts grows.

---

### P4-PIPE-4: No JSDoc comments on any exported function

**Severity:** INFO

**Location:** All exported functions (lines 14, 37, 47, 55, 59, 67, 97, 111)

Every other source file in the project (`config.ts`, `constants.ts`, `types.ts`, `processor.ts`) uses JSDoc comments on exported symbols. `pipeline.ts` has zero JSDoc comments on any of its 8 exported functions or the `TokenSummary` interface, making it an outlier in the codebase's documentation style.

---

### P4-PIPE-5: Non-null assertions on map lookups in `sortAddressesByReward`

**Severity:** LOW

**Location:** Lines 49--50

```ts
const valueB = rewards.get(b)!;
const valueA = rewards.get(a)!;
```

The `!` assertions are safe here because the sort comparator only receives keys that came from `rewards.keys()`, so the map is guaranteed to contain them. However, non-null assertions suppress TypeScript's safety checks. A defensive fallback (`?? 0n`) would be consistent with the pattern used in `filterZeroRewards` (line 56) and `formatRewardsCsv` (line 62), which both use `|| 0n` for the same kind of map lookup.

---

### P4-PIPE-6: `parseBlocklist` does not handle extra whitespace or tab separators

**Severity:** LOW

**Location:** Lines 116

```ts
const [reporter, reported] = line.split(" ");
```

`line.split(" ")` splits on a single space. If the blocklist file contains leading/trailing whitespace, multiple spaces, or tab characters between the reporter and cheater addresses, the split will produce incorrect results: `reporter` may be empty string or `reported` may contain trailing whitespace, both of which will then fail `validateAddress`. While `validateAddress` will catch the malformed values, the error message ("not a valid address") would be confusing -- it would not indicate that the real problem is whitespace formatting.

Using `line.trim().split(/\s+/)` would be more robust and produce clearer failures.

---

### P4-PIPE-7: `formatBalancesCsv` builds CSV by string interpolation without escaping

**Severity:** INFO

**Location:** Lines 74--95

All CSV formatting in both `formatRewardsCsv` and `formatBalancesCsv` uses raw string interpolation to produce CSV output. None of the current values (addresses, bigint numbers) contain commas, quotes, or newlines, so this is correct today. However, if token names or any other string fields were ever added to the CSV columns, the lack of CSV escaping would produce malformed output. This is noted for awareness only -- no current data triggers the issue.

---

### P4-PIPE-8: Inconsistent nullish-coalescing pattern (`|| 0n` vs `?? 0n`)

**Severity:** INFO

**Location:** Lines 41, 56, 62, 88, 91

The file uses `|| 0n` in five places for bigint map-lookup fallbacks. Since `0n` is falsy in JavaScript, `|| 0n` and `?? 0n` are functionally equivalent for bigint values. However, `?? 0n` (nullish coalescing) more precisely expresses the intent of "use 0n only when the value is undefined," and is the idiomatic modern pattern. The codebase uses both: line 88 uses `??` while lines 41, 56, 62, 91 use `||`.

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH | 0 |
| MEDIUM | 1 |
| LOW | 3 |
| INFO | 4 |

The file is well-structured with clean separation of concerns -- each function does one thing. The primary quality concern is the `any[]` return type on `parseJsonl`, which creates an untyped boundary that the rest of the pipeline trusts blindly. The remaining findings are minor style inconsistencies and defensive-coding improvements.
