# Pass 5: Correctness / Intent Verification — `src/index.ts`

**Auditor:** A04
**Date:** 2026-03-22
**File:** `src/index.ts` (182 lines)

## Evidence of Thorough Reading

- Verified every import against its source module (`config.ts`, `constants.ts`, `pipeline.ts`, `types.ts`, `processor.ts`)
- Traced the full pipeline orchestration: env parse -> snapshot generation -> mkdir -> file reads -> Processor construction -> organize liquidity -> process transfers -> process liquidity -> processLpRange -> getEligibleBalances -> summarize & verify -> calculateRewards -> aggregate -> sort -> format CSVs -> write -> tolerance check
- Confirmed `parseJsonl` returns `any[]` and is cast to `Transfer[]`/`LiquidityChange[]` by type annotation only (no runtime validation)
- Confirmed `TRANSFER_FILE_COUNT` is 10 in constants.ts, loop reads `transfers1.dat` through `transfers10.dat`
- Confirmed `REWARD_POOL` in constants.ts is `500_000_000_000_000_000_000_000n` (500k tokens at 18 decimals)
- Confirmed `calculateRewards()` internally calls `getEligibleBalances()`, meaning balances are computed twice in `main()`
- Confirmed `summarizeTokenBalances` verification logic in pipeline.ts matches the invariant described in the log message
- Confirmed the tolerance check `REWARD_POOL / 1000n` equals 0.1% of the pool
- Traced the flow of `rewardsPerToken` through `aggregateRewardsPerAddress` -> `sortAddressesByReward` -> `filterZeroRewards` -> `formatRewardsCsv`

---

## Findings

### P5-IDX-1: `getEligibleBalances()` computed twice — redundant work

**Severity:** LOW

**Location:** Lines 113 and 133

Line 113 calls `processor.getEligibleBalances()` directly. Line 133 calls `processor.calculateRewards(REWARD_POOL)`, which internally calls `getEligibleBalances()` again (processor.ts line 478). Both calls produce the same result since all transfer/liquidity processing is complete. However, `getEligibleBalances()` performs three full passes over all addresses and tokens (average, penalties/bounties, final), so calling it twice is wasteful.

The `balances` computed on line 113 is used only for balance verification (lines 116-129) and CSV formatting (line 143). The `rewardsPerToken` from `calculateRewards` uses its own internally-computed balances. The verification at lines 116-129 validates the balances from the first call, but rewards are computed from the second call. If the two calls were ever to diverge (e.g., due to mutation introduced during a future refactor), the verification would check different data than what rewards are based on.

**Impact:** Performance overhead (double computation), and a fragile design where verification operates on a different object instance than the reward calculation.

---

### P5-IDX-2: Misleading log message — "Snapshot blocks" prints range, not blocks

**Severity:** INFO

**Location:** Line 42

```typescript
console.log(`Snapshot blocks: ${START_SNAPSHOT}, ${END_SNAPSHOT}`);
```

This logs "Snapshot blocks:" followed by only the start and end block numbers. The actual 30 snapshot blocks are written to a file (line 36-39) but not logged. The message implies it is printing the snapshot blocks themselves. Should say "Snapshot range:" or "Start/End blocks:" to accurately describe the output.

---

### P5-IDX-3: Misleading log message — "Getting token balances" during verification

**Severity:** INFO

**Location:** Line 117

```typescript
console.log("Getting token balances for ", summary.name);
```

At this point balances have already been computed. The code is printing summaries and verifying an invariant, not "getting" anything. The log message should say "Verifying token balances for" or "Token balance summary for".

---

### P5-IDX-4: Transfer/liquidity data parsed with `any[]` type erasure

**Severity:** LOW

**Location:** Lines 49, 56

```typescript
transfers = [...transfers, ...parseJsonl(transfersData)]  // line 49
const liquidities: LiquidityChange[] = parseJsonl(liquidityData);  // line 56
```

`parseJsonl` returns `any[]`. The type annotations `Transfer[]` and `LiquidityChange[]` provide compile-time safety but no runtime validation. If the `.dat` files contain malformed or structurally incorrect JSON objects (e.g., missing `blockNumber`, wrong field names, strings where numbers are expected), the pipeline will silently process garbage data. The processor does not validate individual fields of these objects before using them.

This was likely flagged in prior passes. Noting here in the context of intent verification: the docstring claims the pipeline "reads scraped transfer/liquidity/pool data files" but there is no verification that the read data conforms to the expected schema.

---

### P5-IDX-5: Tolerance check is correct but asymmetric reasoning is implicit

**Severity:** INFO

**Location:** Line 171

```typescript
if (diff < 0n ? -diff > REWARD_POOL / 1000n : diff > REWARD_POOL / 1000n) {
```

The tolerance check correctly computes `|diff| > REWARD_POOL / 1000` (0.1% of the pool). The ternary handles the absolute value for BigInt (which has no built-in `abs()`). This is functionally correct.

Note: In practice, the total rewards should always be less than or equal to the pool due to integer division truncation in reward distribution. The `diff` (totalRewards - REWARD_POOL) should be non-positive. The positive branch of the tolerance check guards against a hypothetical overallocation, which could only occur if there were a bug in the reward calculation logic. This is good defensive programming.

---

### P5-IDX-6: Comment accuracy — docstring and inline comments are accurate

**Severity:** INFO

**Location:** Lines 1-4, 19-24

The module-level docstring ("Main pipeline entrypoint. Reads scraped data files, runs the reward processor, and writes balance/reward CSVs to the output directory.") accurately describes the file's purpose.

The `main()` docstring accurately describes:
- Loading env config (line 27)
- Reading transfer/liquidity/pool data (lines 44-63)
- Transfer file splitting convention (verified: `TRANSFER_FILE_COUNT=10`, `TRANSFERS_FILE_BASE="transfers"`)
- Blocklist format (verified against `parseBlocklist` in pipeline.ts: space-separated reporter+cheater)
- Processing through Processor and writing CSVs (lines 72-160)

All inline comments (lines 29, 35, 44, 54, 59, 65, 71, 76, 82, 95, 106, 111, 115, 131, 150, 153, 162) accurately describe the immediately following code.

---

### P5-IDX-7: Pipeline orchestration matches documented flow

**Severity:** INFO

**Location:** Full file

Per CLAUDE.md, the pipeline is: `scraper.ts -> processor.ts + liquidity.ts -> diffCalculator.ts`

`index.ts` is the entrypoint that orchestrates the middle phase (processor.ts + liquidity.ts). It does not invoke the scraper (that runs separately via `npm run scrape`) or the diffCalculator (that is a separate script). The pipeline flow in `main()` is:

1. Parse env, generate snapshots (config.ts)
2. Read data files (transfers, liquidity, pools, blocklist)
3. Construct Processor
4. Organize liquidity positions (index into lookup maps)
5. Process transfers (replay transfer events)
6. Process liquidity positions (replay liquidity events)
7. Process LP range (V3 in-range tick checks via liquidity.ts)
8. Get eligible balances and verify invariants
9. Calculate rewards and write CSVs
10. Tolerance check on total rewards vs pool

This matches the documented architecture.

---

## Summary

| ID | Severity | Title |
|----|----------|-------|
| P5-IDX-1 | LOW | `getEligibleBalances()` computed twice — redundant work and fragile verification |
| P5-IDX-2 | INFO | Misleading log "Snapshot blocks" prints range not blocks |
| P5-IDX-3 | INFO | Misleading log "Getting token balances" during verification |
| P5-IDX-4 | LOW | Transfer/liquidity data parsed with `any[]` type erasure, no runtime validation |
| P5-IDX-5 | INFO | Tolerance check is correct; absolute value handling via ternary is valid |
| P5-IDX-6 | INFO | Docstring and inline comments are accurate |
| P5-IDX-7 | INFO | Pipeline orchestration matches documented architecture |
