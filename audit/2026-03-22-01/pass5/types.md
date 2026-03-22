# Pass 5: Correctness / Intent Verification -- `src/types.ts`

**Auditor:** A09
**Date:** 2026-03-22
**File:** `src/types.ts`

## Evidence of Thorough Reading

Every named export in `src/types.ts` was read and cross-referenced against its consumers:

1. **CyToken** (lines 6-17) -- verified against `src/config.ts` CYTOKENS definitions and usage in `src/processor.ts`, `src/pipeline.ts`
2. **Transfer** (lines 19-29) -- verified against `src/scraper.ts` mapSubgraphTransfer, `src/processor.ts` processTransfer, and test data
3. **AccountBalance** (lines 31-41) -- verified against all mutation sites in `src/processor.ts` (processTransfer lines 162-234, processLiquidityPositions lines 545-611, updateSnapshots lines 147-154)
4. **TokenBalances** (lines 43-60) -- verified against `src/processor.ts` getEligibleBalances three-pass logic (lines 309-379) and `src/pipeline.ts` formatBalancesCsv
5. **EligibleBalances** (line 63) -- verified against Map construction in getEligibleBalances and consumption in calculateTotalEligibleBalances, pipeline output
6. **RewardsPerToken** (line 66) -- verified against calculateRewards return type and aggregateRewardsPerAddress consumption
7. **LiquidityChangeType** enum (lines 69-73) -- verified against subgraph scraper mapping and processor branching
8. **LiquidityChangeBase** (lines 76-88) -- verified against scraper mapSubgraphLiquidityChange base object and processor consumers
9. **LiquidityChangeV2** (lines 91-93) -- verified __typename string literal against scraper and subgraph query
10. **LiquidityChangeV3** (lines 96-107) -- verified __typename and extra fields against scraper, processor V3 branching, and test data
11. **LiquidityChange** (line 110) -- verified discriminated union usage via __typename checks in processor.ts line 588 and scraper.ts line 137
12. **BlocklistReport** (lines 112-116) -- verified against `src/pipeline.ts` parseBlocklist and `src/processor.ts` penalty/bounty logic
13. **LpV3Position** (lines 118-125) -- verified against processor lp3TrackList accumulation and processLpRange deduction logic

---

## Findings

### T5-01: `currentNetBalance` JSDoc Invariant Is Violated by Liquidity Transfer Events [LOW]

**Location:** `src/types.ts` line 39

**JSDoc claim:**
```
/** Running net balance (transfersInFromApproved - transfersOut) */
currentNetBalance: bigint;
```

**Actual runtime behavior:** In `src/processor.ts` line 578, when processing a `LiquidityChangeType.Transfer` event, the code does:
```ts
ownerBalance.currentNetBalance += depositedBalanceChange;
```
This modifies `currentNetBalance` without updating either `transfersInFromApproved` or `transfersOut`. After this mutation, the invariant `currentNetBalance === transfersInFromApproved - transfersOut` no longer holds.

**Impact:** The JSDoc is misleading to future maintainers. Someone relying on the documented invariant to reason about correctness could introduce bugs. The actual semantics of `currentNetBalance` are: `transfersInFromApproved - transfersOut + sum(liquidity Transfer depositedBalanceChanges)`.

**No reward calculation impact:** The codebase does not rely on the algebraic invariant at runtime (it always recomputes `currentNetBalance` from the two accumulators after transfer processing, and directly mutates it for liquidity transfers). But the documentation is wrong.

---

### T5-02: `Transfer.value` JSDoc Uses Ambiguous Term "Decimal String" [INFO]

**Location:** `src/types.ts` line 24

**JSDoc claim:**
```
/** Transfer amount as a decimal string (not yet parsed to BigInt) */
value: string;
```

**Actual runtime behavior:** The value is a non-negative integer string in base-10 representing the raw token amount in the smallest unit (wei). The scraper validates it with `validateNumericString` which requires `/^\d+$/`. Test data uses values like `"1000000000000000000"`.

The term "decimal string" is technically correct (base-10), but in blockchain contexts it can be confused with "a string containing a decimal point" (e.g., `"1.5"`). The parenthetical "(not yet parsed to BigInt)" is accurate and helpful.

---

### T5-03: `depositedBalanceChange` JSDoc Omits Transfer-Type Event Semantics [LOW]

**Location:** `src/types.ts` line 83-84

**JSDoc claim:**
```
/** Change in deposited token balance as a decimal string (positive for deposits, negative for withdrawals) */
depositedBalanceChange: string;
```

**Actual runtime behavior:** The `LiquidityChangeType` enum has three variants: `Deposit`, `Withdraw`, and `Transfer`. The JSDoc only describes sign conventions for deposits and withdrawals. For `Transfer` events, `depositedBalanceChange` can be either positive (incoming LP transfer) or negative (outgoing LP transfer), as confirmed by test data at `processor.test.ts` lines 1029 and 1103.

**Impact:** A maintainer adding logic that branches on sign + changeType could make incorrect assumptions about Transfer-type events. The JSDoc should mention the Transfer case.

---

### T5-04: `LiquidityChangeBase.liquidityChange` Has No JSDoc for Sign Convention [INFO]

**Location:** `src/types.ts` line 82

**JSDoc claim:**
```
/** Change in pool liquidity units as a decimal string */
liquidityChange: string;
```

**Actual runtime behavior:** The field is validated as a signed integer string (`validateIntegerString` in scraper.ts line 124, which accepts `/^-?\d+$/`). The JSDoc does not document the sign convention. In practice, the field is not used in reward calculations (only `depositedBalanceChange` matters), so the practical impact is low.

---

### T5-05: Discriminated Union Correctly Discriminates V2/V3 [INFO -- PASS]

**Location:** `src/types.ts` lines 91-110

The `__typename` literal types `"LiquidityV2Change"` and `"LiquidityV3Change"` correctly discriminate the union. TypeScript narrows the type when checking `__typename`:
- `src/processor.ts` line 588: `if (liquidityChangeEvent.__typename === "LiquidityV3Change")` correctly accesses V3-only fields (`poolAddress`, `tokenId`, `lowerTick`, `upperTick`).
- `src/scraper.ts` line 137: Same pattern for mapping subgraph data.

No issues found.

---

### T5-06: `LpV3Position.value` JSDoc Is Incomplete [INFO]

**Location:** `src/types.ts` line 122

**JSDoc claim:**
```
/** Deposited balance in the position */
value: bigint;
```

**Actual runtime behavior:** The `value` field is accumulated via `prev.value += depositedBalanceChange` at `processor.ts` line 604. Since `depositedBalanceChange` can be negative (for withdrawals and outgoing transfers), the `value` can decrease over time and could theoretically reach zero or go negative. The consumer at `processor.ts` line 643 (`if (lp.value <= 0n) continue;`) explicitly guards against non-positive values, skipping deduction. The JSDoc "Deposited balance in the position" suggests a static deposit amount rather than a running net of all liquidity changes for that position. More precise wording would be "Net cumulative balance change for this position" or similar.

---

### T5-07: `TokenBalances.final` Formula Is Accurate [INFO -- PASS]

**Location:** `src/types.ts` line 57

**JSDoc claim:**
```
/** Final reward-eligible balance in native token decimals: average - penalty + bounty */
```

**Verified at** `src/processor.ts` line 373:
```ts
balance.final = balance.average - balance.penalty + balance.bounty;
```

Exact match. No issues.

---

### T5-08: `AccountBalance.netBalanceAtSnapshots` JSDoc Says "30" Snapshots [INFO]

**Location:** `src/types.ts` line 38

**JSDoc claim:**
```
/** Balance snapshot at each of the 30 deterministic snapshot blocks */
```

**Actual runtime behavior:** The array length is `this.snapshots.length`, which is determined by `generateSnapshotBlocks()`. That function does assert exactly 30 snapshots in production, but tests use arbitrary lengths (e.g., 2 snapshots). The "30" in the JSDoc is correct for production but could mislead someone writing tests who wonders why their 2-element array works.

This is a documentation nit, not a correctness issue.

---

### T5-09: `BlocklistReport` JSDoc Phrasing Is Slightly Misleading [INFO]

**Location:** `src/types.ts` line 112

**JSDoc claim:**
```
/** Entry from data/blocklist.txt: a reporter who flagged a cheating account */
```

The phrase "a reporter who flagged a cheating account" reads as if the interface represents only the reporter. In reality it represents the (reporter, cheater) pair. Minor phrasing issue.

---

## Summary

| ID | Severity | Description |
|----|----------|-------------|
| T5-01 | LOW | `currentNetBalance` JSDoc invariant violated by liquidity Transfer events |
| T5-02 | INFO | `Transfer.value` JSDoc uses ambiguous "decimal string" |
| T5-03 | LOW | `depositedBalanceChange` JSDoc omits Transfer-type event sign semantics |
| T5-04 | INFO | `liquidityChange` field lacks sign convention documentation |
| T5-05 | INFO | Discriminated union correctly discriminates (PASS) |
| T5-06 | INFO | `LpV3Position.value` JSDoc understates that it is a running net, not a static deposit |
| T5-07 | INFO | `TokenBalances.final` formula is accurate (PASS) |
| T5-08 | INFO | `netBalanceAtSnapshots` JSDoc hardcodes "30" but array length is dynamic |
| T5-09 | INFO | `BlocklistReport` JSDoc phrasing implies single-field, not pair |

**No CRITICAL or HIGH findings. Two LOW findings with proposed fixes below.**
