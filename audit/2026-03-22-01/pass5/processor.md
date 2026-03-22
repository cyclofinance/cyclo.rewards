# Pass 5: Correctness / Intent Verification -- processor.ts

**Auditor:** A07
**Date:** 2026-03-22
**Files:** `src/processor.ts` (657 lines), `src/processor.test.ts` (1911 lines)

## Evidence of Thorough Reading

### processor.ts
- Class `Processor`: constructor (lines 54-72), fields `approvedSourceCache`, `accountBalancesPerToken`, `client`, `lp3TrackList`, `liquidityEvents`
- `isApprovedSource` (lines 81-141): cache lookup, direct REWARDS_SOURCES check, factory RPC call with exponential backoff, error classification (no-data/revert/invalid vs. transient)
- `updateSnapshots` (lines 147-154): forward-fill using `<=` comparison, negative-balance clamping
- `processTransfer` (lines 162-234): token eligibility filter, approved-source check, LP withdrawal adjustment, LP deposit adjustment (skips `transfersOut`), approved-source reversal for non-deposit/non-withdrawal transfers
- `transferIsDeposit` (lines 241-257) / `transferIsWithdraw` (lines 264-280): owner-token-txHash lookup in organized liquidity events
- `getUniqueAddresses` (lines 286-302): reporters + all token account holders
- `getEligibleBalances` (lines 309-379): three-pass: (1) average of snapshots, (2) penalty = average, bounty = penalty * 10 / 100, (3) final = average - penalty + bounty, final18 via scaleTo18
- `calculateTotalEligibleBalances` (lines 386-401): sum of final18 per token
- `calculateRewardsPoolsPerToken` (lines 426-469): inverse-fraction weighting across tokens with balance
- `calculateRewards` (lines 477-506): per-account reward = (final18 * tokenPoolShare) / tokenTotal
- `organizeLiquidityPositions` (lines 513-538): owner-token-txHash indexing with duplicate detection
- `processLiquidityPositions` (lines 545-611): balance updates for Transfer type only (Deposit/Withdraw handled by processTransfer), V3 position tracking in lp3TrackList
- `processLpRange` (lines 618-655): per-snapshot tick query, out-of-range deduction, negative-balance clamping

### processor.test.ts
- Verified all describe blocks: Constructor, Basic Transfer Processing (4 tests), Snapshot Timing (4 tests), Blocklist (1 test), Blocklist Penalties (1 test), Reward Calculation (2 tests), Reward Calculation with Multiple Tokens (1 test), organizeLiquidityPositions duplicate handling (1 test), Process Liquidity Position (6 tests), Mixed-case owner (1 test), processLpRange Happy/Unhappy (9 tests), updateSnapshots (6 tests), isApprovedSource (9 tests)

---

## Findings

### F5-01: Penalty redistribution leaks value from the reward pool [MEDIUM]

**Location:** `getEligibleBalances()` lines 342-376

**Description:**
When a cheater is penalized, their full average balance is deducted (`penalty = average`), but only 10% is given to the reporter as a bounty. The remaining 90% of the penalty is neither returned to the reward pool nor redistributed to other participants. It simply vanishes from the `final` balance totals.

This means the total of all `final18` balances is less than it would be without penalties, which in turn means `calculateRewards` divides a reward pool by a reduced total, effectively giving the remaining participants a proportionally larger share. The 90% is implicitly redistributed to all remaining participants proportionally, rather than being explicitly added back to the pool.

**Correctness Assessment:** This is an implicit redistribution, not a bug. The 90% goes to everyone else via the math: each person's `final18 / totalFinal18` fraction increases when the cheater's balance is removed. However, this behavior is not documented in the code comments or CLAUDE.md which states "remainder goes back to the reward pool." The implicit mechanism achieves the same mathematical outcome as explicit pool re-addition (both result in proportional distribution to all non-penalized participants), but the documentation is misleading.

**Impact:** The documented behavior ("remainder goes back to the reward pool") is consistent with the actual mathematical outcome, but a reader of the code might expect explicit re-addition logic. The implicit approach is actually correct and simpler.

**Classification:** MEDIUM -- The math is correct but the mechanism differs from what a reader might expect, which could cause confusion in future maintenance.

---

### F5-02: processTransfer double-updates snapshots on approved-source non-deposit transfers [LOW]

**Location:** `processTransfer()` lines 199-226

**Description:**
When `isApproved = true` and the transfer is not a withdrawal and not a deposit:
1. Lines 207-210: `toBalance.transfersInFromApproved += value`, then `updateSnapshots(toBalance, ...)`
2. Lines 220-225: `toBalance.transfersInFromApproved -= value`, then `updateSnapshots(toBalance, ...)`

The net effect on `toBalance` is zero (add then subtract), but `updateSnapshots` is called twice. Since the second call overwrites the same snapshot slots with the corrected (net-zero) value, this is not a correctness bug -- the final snapshot values are correct. However, calling `updateSnapshots` twice for a no-op change is wasteful and obscures the intent.

**Impact:** Performance overhead (minor -- two passes over the 30-snapshot array per such transfer). More importantly, the code is hard to reason about because it appears to credit then immediately un-credit the receiver.

**Classification:** LOW -- No correctness impact, but the control flow is confusing and could lead to future bugs if someone modifies only one of the two branches.

---

### F5-03: Reward calculation truncates toward zero, total rewards can be less than pool [LOW]

**Location:** `calculateRewards()` line 496-499, `calculateRewardsPoolsPerToken()` lines 463-464

**Description:**
BigInt division truncates toward zero in two places:
1. `tokenReward = (tokenInverseFraction * rewardPool) / sumOfInverseFractions` -- per-token pool split
2. `reward = (balance.final18 * tokenPoolShare) / tokenTotal` -- per-account reward

Each division loses up to 1 wei of precision. With N tokens and M accounts, the total distributed can be up to N + M wei less than the reward pool.

The test at line 748 acknowledges this: `expect(user1Reward! + user2Reward!).toBeGreaterThanOrEqual(rewardPool - 10n)`.

**Correctness Assessment:** Truncation is the standard approach for token distributions. Rounding down means the contract never overpays (no insolvency risk). The dust is tiny relative to the 500K-token pool.

**Impact:** Negligible dust loss (< 1 wei per account per token). The direction of rounding is correct (favors the protocol, not individual accounts).

**Classification:** LOW -- Economically negligible, and the truncation direction is the correct conservative choice.

---

### F5-04: processTransfer does not validate transfer ordering [INFO]

**Location:** `processTransfer()` lines 162-234

**Description:**
`processTransfer` does not enforce that transfers are processed in block-number order. If transfers arrive out of order, `updateSnapshots` would forward-fill incorrect intermediate balances. The code relies on the caller (the main pipeline) to provide pre-sorted transfers.

There is no runtime assertion or check verifying monotonic block numbers.

**Impact:** If transfers were ever processed out of order, snapshot balances would be wrong. The pipeline does sort by block number, but this invariant is implicit.

**Classification:** INFO -- The caller maintains this invariant. A defensive check would improve robustness.

---

### F5-05: processLpRange iterates all LP positions for every account -- O(tokens * accounts * positions) [INFO]

**Location:** `processLpRange()` lines 632-648

**Description:**
The inner loop iterates `lpTrackList` (all LP positions) for every `(token, account)` pair, using `key.startsWith(idStart)` to match. This is O(T * A * P) per snapshot where T = tokens, A = accounts, P = LP positions.

A more efficient approach would be to parse the LP position key to extract the token and owner, or to key the track list by token+owner.

**Impact:** Performance only. With the current data size (hundreds of accounts, handful of LP positions), this is not a practical issue.

**Classification:** INFO -- No correctness impact.

---

### F5-06: V3 in-range check uses `lowerTick <= tick <= upperTick` (inclusive both bounds) [MEDIUM]

**Location:** `processLpRange()` line 644

**Description:**
The in-range check is:
```typescript
if (lp.lowerTick <= tick && tick <= lp.upperTick) continue; // skip if in range
```

In Uniswap V3's actual implementation, a position is in range when `lowerTick <= currentTick < upperTick` (lower inclusive, upper exclusive). The code uses `<=` for the upper bound, meaning a position at exactly the upper tick is considered in-range when Uniswap V3 considers it out-of-range.

When `tick === upperTick`, the position has zero liquidity in the active range (all liquidity has been converted to the other token). The code incorrectly treats this as in-range and does NOT deduct the position value.

**Impact:** Positions at exactly the upper tick boundary retain their full reward credit when they should be deducted. In practice this is a rare edge case (the tick must land exactly on the upper boundary at the snapshot block), but when it occurs, the affected account receives undeserved rewards at others' expense.

**Classification:** MEDIUM -- Incorrect implementation of a well-documented Uniswap V3 invariant. Low probability of occurring at any given snapshot, but the error direction favors LP accounts over non-LP participants.

---

### F5-07: Test "should track approved transfers correctly" verifies zero balance -- name is misleading [LOW]

**Location:** `processor.test.ts` lines 57-86

**Description:**
The test name "should track approved transfers correctly" implies it verifies that approved transfers are credited. However, the test sends a transfer from APPROVED_SOURCE to NORMAL_USER_1 with no matching LP deposit/withdrawal, and asserts the result is `0n` for all snapshots and average.

This is actually testing the approved-source reversal logic (F5-02): a transfer from an approved source that is neither a deposit nor a withdrawal gets credited then immediately un-credited. The test name does not communicate this.

**Impact:** A future developer reading test names to understand behavior would be confused. The behavior being tested is the non-obvious reversal of approved-source credits for non-LP transfers.

**Classification:** LOW -- Test passes and verifies correct behavior, but the name is misleading about what "correctly" means.

---

### F5-08: `sumOfAllBalances` in `calculateRewardsPoolsPerToken` includes zero-balance tokens [INFO]

**Location:** `calculateRewardsPoolsPerToken()` lines 435-438

**Description:**
`sumOfAllBalances` is computed from `totalBalances` which includes entries for all CYTOKENS, including those with zero total balance. However, the subsequent loop only iterates `tokensWithBalance` (non-zero tokens), and the inverse fraction calculation uses each token's own total as the denominator. The sum including zero-balance tokens does not affect the final result because:

- `tokenInverseFraction = sumOfAllBalances * ONE_18 / tokenTotal`
- The `sumOfAllBalances` includes zero-balance token totals (which are 0n, so adding them doesn't change the sum)

Wait -- zero-balance tokens contribute 0n to the sum, so including them is a no-op. This is not a bug.

**Classification:** INFO -- No impact. The code is slightly redundant but mathematically correct.

---

### F5-09: No test for multi-cheater penalty stacking [LOW]

**Location:** `processor.test.ts` -- Blocklist tests

**Description:**
There is no test where a single account is reported by multiple reporters. In that case, `getEligibleBalances` would apply `penalty += average` for each report, potentially making `penalty > average` and causing `final = average - penalty + bounty` to go negative. The code does not clamp `final` to zero.

If account X has average balance 100 and is reported twice, penalty = 200, final = 100 - 200 + 0 = -100. This negative `final` would then be scaled to `final18` and used in reward calculation, potentially causing underflow in other accounts' rewards via the `totalBalances` sum.

**Impact:** A negative `final18` reduces the total eligible balance denominator, which inflates other accounts' reward shares. If the negative is large enough, it could cause a division-by-zero or negative total.

**Classification:** LOW -- The blocklist data is manually curated and unlikely to contain duplicates in practice, but the code lacks a guard.

---

### F5-10: `calculateRewardsPoolsPerToken` does not handle single-token case efficiently [INFO]

**Location:** `calculateRewardsPoolsPerToken()` lines 426-469

**Description:**
The inverse-fraction weighting is designed for multi-token scenarios. When only one token has balance, the entire calculation (inverse fractions, sum of inverses, per-token share) collapses to giving that token the full pool. The math is correct but the machinery is unnecessary for the single-token case.

**Classification:** INFO -- No impact on correctness.

---

### F5-11: Inverse-fraction weighting correctness verification [INFO]

**Location:** `calculateRewardsPoolsPerToken()` lines 440-468

**Description:**
The inverse-fraction formula is:
```
tokenInverseFraction_i = (sumOfAllBalances * 1e18) / tokenTotal_i
tokenShare_i = (tokenInverseFraction_i * rewardPool) / sumOfInverseFractions
```

Verification: For two tokens with totals A and B:
- inverseFraction_A = (A+B) * 1e18 / A
- inverseFraction_B = (A+B) * 1e18 / B
- sumOfInverses = (A+B) * 1e18 * (1/A + 1/B) = (A+B) * 1e18 * (A+B) / (A*B)
- shareA = [(A+B)*1e18/A * pool] / [(A+B)^2 * 1e18 / (A*B)] = pool * B / (A+B)

So token A (with total A) gets `pool * B / (A+B)` -- the share is proportional to the OTHER token's total. Smaller tokens get larger shares. This implements inverse-fraction weighting correctly.

**Classification:** INFO -- Verified correct.

---

## Summary

| ID | Severity | Title |
|----|----------|-------|
| F5-01 | MEDIUM | Penalty redistribution mechanism is implicit, differs from documentation |
| F5-02 | LOW | processTransfer double-updates snapshots on approved non-deposit transfers |
| F5-03 | LOW | Reward calculation truncates toward zero, total < pool |
| F5-04 | INFO | processTransfer does not validate transfer ordering |
| F5-05 | INFO | processLpRange has O(T*A*P) complexity per snapshot |
| F5-06 | MEDIUM | V3 in-range check uses inclusive upper bound (should be exclusive) |
| F5-07 | LOW | Test name misleading for approved-source reversal behavior |
| F5-08 | INFO | sumOfAllBalances includes zero-balance tokens (harmless) |
| F5-09 | LOW | No test for multi-cheater penalty stacking; negative final possible |
| F5-10 | INFO | Single-token case handled by unnecessary inverse-fraction machinery |
| F5-11 | INFO | Inverse-fraction weighting verified correct |
