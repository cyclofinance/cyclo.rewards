# Pass 4: Code Quality Review — `src/processor.ts`

**Auditor:** A07
**Date:** 2026-03-22
**File:** `src/processor.ts` (656 lines)

## Evidence of Thorough Reading

**Class:** `Processor` (line 33)

**Fields (lines 34-46):**
- `approvedSourceCache` (line 35) — `Map<string, boolean>`
- `accountBalancesPerToken` (line 37) — `Map<string, Map<string, AccountBalance>>`
- `client` (line 42) — `PublicClient`
- `lp3TrackList` (line 44) — `Record<number, Map<string, LpV3Position>>`
- `liquidityEvents` (line 46) — `Map<string, Map<string, Map<string, LiquidityChange>>>`

**Constructor:** lines 54-72

**Methods (12 total):**
1. `isApprovedSource` (line 81) — async, public
2. `updateSnapshots` (line 147) — private
3. `processTransfer` (line 162) — async, public
4. `transferIsDeposit` (line 241) — public
5. `transferIsWithdraw` (line 264) — public
6. `getUniqueAddresses` (line 286) — public
7. `getEligibleBalances` (line 309) — async, public
8. `calculateTotalEligibleBalances` (line 386) — public
9. `getTokensWithBalance` (line 408) — public
10. `calculateRewardsPoolsPerToken` (line 426) — public
11. `calculateRewards` (line 477) — async, public
12. `organizeLiquidityPositions` (line 513) — public
13. `processLiquidityPositions` (line 545) — public
14. `processLpRange` (line 618) — async, public

**Constants imported:**
- `ONE_18` from constants.ts (used line 444)
- `BOUNTY_PERCENT` from constants.ts (used line 357)
- `RETRY_BASE_DELAY_MS` from constants.ts (used line 130)
- `REWARDS_SOURCES` from config.ts (used line 88)
- `FACTORIES` from config.ts (used line 110)
- `CYTOKENS` from config.ts (used lines 63, 164, 292, 314, 343, 365, 391, 411, 433, 459, 490, 515, 547)
- `isSameAddress` from config.ts (used lines 88, 112)
- `scaleTo18` from config.ts (used line 374)

---

## Findings

### P4-PROC-01: Inconsistent semicolon usage

**Severity:** LOW

**Lines:** Throughout the file, semicolons are used inconsistently. Most statements end with semicolons, but many lines omit them. Examples of missing semicolons:

- Line 202: `const lpWithdraw = this.transferIsWithdraw(transfer)`
- Line 215: `const lpDeposit = this.transferIsDeposit(transfer)`
- Line 218: `fromBalance.transfersInFromApproved += value`
- Line 242-244: all three `const` declarations
- Line 247, 250, 253: `if` early returns with no semicolons
- Line 255-256: return statements
- Line 265-267, 270, 273, 276, 278-279: same pattern
- Line 524-525, 528, 530-531, 537: in `organizeLiquidityPositions`
- Line 604: `prev.value += depositedBalanceChange`

The file is roughly split: the first ~140 lines and the reward calculation methods (lines 286-506) consistently use semicolons, while the liquidity-related methods (lines 200-280, 513-610) largely omit them. This suggests the two sections were written at different times or by different contributors with different linting settings.

---

### P4-PROC-02: Duplicated AccountBalance initialization pattern

**Severity:** LOW

**Lines:** 180-195, 565-572

The `AccountBalance` object literal `{ transfersInFromApproved: 0n, transfersOut: 0n, netBalanceAtSnapshots: new Array(this.snapshots.length).fill(0n), currentNetBalance: 0n }` is constructed identically in `processTransfer` (lines 181-186 and 189-195) and `processLiquidityPositions` (lines 566-571). This is three separate occurrences of the same 6-line object literal. A private factory method (e.g. `newAccountBalance()`) would eliminate the duplication and ensure any future field additions are reflected consistently.

---

### P4-PROC-03: Redundant snapshot update logic (duplicated inline vs. helper)

**Severity:** LOW

**Lines:** 147-154, 582-608

`updateSnapshots` (lines 147-154) encapsulates the pattern of clamping negative balances to zero and setting snapshot values for all snapshots at or after a block number. However, `processLiquidityPositions` (lines 582-608) duplicates this exact logic inline instead of calling `updateSnapshots`. The inline version also adds V3 tracking, but the balance-clamping and snapshot-setting part is identical to `updateSnapshots`. This makes the two code paths drift independently and increases the chance of introducing a bug when modifying one but not the other.

---

### P4-PROC-04: `processLpRange` is O(snapshots * tokens * accounts * positions) — quadratic inner loop

**Severity:** MEDIUM

**Lines:** 618-655

`processLpRange` iterates all snapshots, then all tokens, then all accounts, then all tracked LP positions for that snapshot. The innermost loop (line 636) iterates the entire `lpTrackList` for every `(token, account)` pair and filters by `key.startsWith(idStart)`. This is effectively a nested scan that could be replaced by a keyed lookup.

The `lp3TrackList` keys have the format `${token}-${owner}-${pool}-${tokenId}`. A `Map<string, LpV3Position[]>` keyed by `${token}-${owner}` prefix would allow direct lookup instead of scanning every position for every account. For the current dataset size this may be tolerable, but it is an algorithmic smell that would cause severe slowdowns if the position set grows.

---

### P4-PROC-05: `calculateTotalEligibleBalances` called redundantly

**Severity:** LOW

**Lines:** 430, 485, 410

`calculateRewards` (line 477) calls:
1. `getEligibleBalances()` (line 478)
2. `calculateRewardsPoolsPerToken(balances, rewardPool)` (line 480) — internally calls `calculateTotalEligibleBalances` (line 430) and `getTokensWithBalance` (line 433, which calls it again at line 410)
3. `calculateTotalEligibleBalances(balances)` directly (line 485)
4. `getTokensWithBalance(balances)` (line 487) — internally calls `calculateTotalEligibleBalances` again (line 410)

Total: `calculateTotalEligibleBalances` is called **4 times** with the same input in a single `calculateRewards` invocation. The method iterates all tokens and all account balances each time. This is wasteful and obscures the data flow. A single call with the result passed through would be cleaner.

---

### P4-PROC-06: Unreachable `return false` at end of `isApprovedSource`

**Severity:** INFO

**Line:** 140

The `return false` at line 140 is unreachable. The `for` loop (lines 94-138) will either: (a) return a cached result, (b) return true/false from the factory check, (c) throw after exhausting retries. The loop always executes at least once (retries defaults to 8, minimum 1). This dead code could confuse readers into thinking there is a code path that falls through the loop without returning.

---

### P4-PROC-07: Inline ABI literal in `isApprovedSource`

**Severity:** LOW

**Lines:** 98-106

The ABI for the `factory()` function call is defined as an anonymous inline literal inside the retry loop. This is a 9-line constant that never changes. Extracting it to a module-level `const FACTORY_ABI` (similar to how `liquidity.ts` defines its `abi` constant at module level) would improve readability, reduce nesting depth in the method, and make the pattern consistent across the codebase.

---

### P4-PROC-08: Asymmetric null checking — `reporterBalance === undefined` vs. `!cheaterBalance`

**Severity:** INFO

**Lines:** 354

```ts
if (!cheaterBalance || reporterBalance === undefined) continue;
```

Two different null-check idioms are used in the same condition: falsy check (`!cheaterBalance`) for one variable and strict `=== undefined` for the other. Both variables have the same type (`TokenBalances | undefined`). Since `TokenBalances` is an object (always truthy when defined), both idioms are functionally equivalent, but using two different styles in one expression is a readability inconsistency.

---

### P4-PROC-09: `getUniqueAddresses` is not actually async but is `await`ed

**Severity:** INFO

**Line:** 310

`getEligibleBalances` calls `await this.getUniqueAddresses()` at line 310, but `getUniqueAddresses` (line 286) is a synchronous method returning `Set<string>`, not a `Promise`. The `await` is harmless (it wraps the value in a resolved promise) but is misleading — it suggests the method does async work when it does not.

---

### P4-PROC-10: String-key-based ID construction for V3 position tracking is fragile

**Severity:** MEDIUM

**Lines:** 589-597, 641

V3 position IDs are constructed by string interpolation: `${token}-${owner}-${pool}-${tokenId}`. Later, in `processLpRange` (line 641), positions are matched by `key.startsWith(idStart)` where `idStart = ${token}-${owner}-${pool}`. This prefix-matching approach is fragile because:

1. If any component (token address, owner, pool address) contains a `-` character, the prefix match could produce false positives. Ethereum addresses are hex strings and don't contain `-`, but `tokenId` is a free-form string from the subgraph.
2. The ID construction is duplicated across two methods with no shared constant or helper, so the two halves of the convention could diverge.

A structured key (e.g., a composite `Map` or a helper function that produces both the full key and the prefix) would be more robust.

---

### P4-PROC-11: `processTransfer` god method — complex branching with interleaved deposit/withdraw logic

**Severity:** MEDIUM

**Lines:** 162-234

`processTransfer` is 72 lines with deeply interleaved conditional logic:
- It conditionally credits the receiver (lines 199-211)
- Inside that branch, it checks for LP withdraw adjustments (lines 202-205)
- Then separately checks for LP deposit (lines 215-227)
- The deposit branch *reverses* the approved-source credit that was just applied (lines 220-225)
- The non-deposit branch applies a different transfer-out adjustment (line 226)

The "credit then undo" pattern (approve credit at line 207, then reverse it at line 221 if the transfer-to is a deposit to a non-approved source) makes the logic hard to follow. The method effectively handles four distinct cases (approved+deposit, approved+withdraw, approved+normal, non-approved+normal) but expresses them as nested if/else branches that modify state and then conditionally un-modify it.

Extracting the four cases into named helper methods or using an early-categorization approach would significantly improve readability.

---

### P4-PROC-12: `100n` magic number in bounty calculation

**Severity:** INFO

**Line:** 357

```ts
const bounty = (penalty * BOUNTY_PERCENT) / 100n;
```

`BOUNTY_PERCENT` is already extracted as a named constant, but the divisor `100n` representing "percent denominator" is a raw literal. This is minor since the meaning is self-evident from the variable name `BOUNTY_PERCENT`, but for full consistency a `PERCENT_DENOMINATOR = 100n` constant could be used.

---

## Summary

| ID | Severity | Category | Description |
|----|----------|----------|-------------|
| P4-PROC-01 | LOW | Style consistency | Inconsistent semicolons across file sections |
| P4-PROC-02 | LOW | Duplication | AccountBalance init literal repeated 3 times |
| P4-PROC-03 | LOW | Duplication | Snapshot update logic duplicated inline vs. helper |
| P4-PROC-04 | MEDIUM | Complexity | O(n^2) scan in processLpRange inner loop |
| P4-PROC-05 | LOW | Redundant computation | calculateTotalEligibleBalances called 4 times |
| P4-PROC-06 | INFO | Dead code | Unreachable return false in isApprovedSource |
| P4-PROC-07 | LOW | Consistency | Inline ABI literal vs. module-level pattern in liquidity.ts |
| P4-PROC-08 | INFO | Style consistency | Asymmetric null check idioms in same expression |
| P4-PROC-09 | INFO | Misleading code | Synchronous method called with await |
| P4-PROC-10 | MEDIUM | Fragile abstraction | String-concatenation ID with prefix matching |
| P4-PROC-11 | MEDIUM | Method complexity | processTransfer god method with credit-then-undo pattern |
| P4-PROC-12 | INFO | Magic number | 100n percent denominator not named |
