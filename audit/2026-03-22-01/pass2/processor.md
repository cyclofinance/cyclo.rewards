# Pass 2: Test Coverage — `src/processor.ts`

**Auditor:** A07
**Date:** 2026-03-22
**Files:**
- `/Users/thedavidmeister/Code/cyclo.rewards/src/processor.ts` (657 lines)
- `/Users/thedavidmeister/Code/cyclo.rewards/src/processor.test.ts` (1911 lines)

---

## Evidence of Thorough Reading

### processor.ts — Functions/Methods (all lines read)

| Method | Line | Visibility | Tested? |
|---|---|---|---|
| `constructor` | 54-72 | public | Yes (L47-54) |
| `isApprovedSource` | 81-141 | public async | Yes (L1795-1910, 10 tests) |
| `updateSnapshots` | 147-154 | private | Yes (L1719-1793, 6 tests) |
| `processTransfer` | 162-234 | public async | Yes (L56-183, L186-327, partial) |
| `transferIsDeposit` | 241-257 | public | Indirect only (via processTransfer) |
| `transferIsWithdraw` | 264-280 | public | Indirect only (via processTransfer) |
| `getUniqueAddresses` | 286-302 | public | Indirect only (via getEligibleBalances) |
| `getEligibleBalances` | 309-379 | public async | Yes (indirect via many tests) |
| `calculateTotalEligibleBalances` | 386-401 | public | Indirect only (via calculateRewards) |
| `getTokensWithBalance` | 408-417 | public | Indirect only (via calculateRewards) |
| `calculateRewardsPoolsPerToken` | 426-469 | public | Partial (L728 single call) |
| `calculateRewards` | 477-506 | public async | Yes (L469-821, 3 tests) |
| `organizeLiquidityPositions` | 513-538 | public | Yes (L824-861, 1 test + indirect) |
| `processLiquidityPositions` | 545-611 | public | Yes (L863-1268, 6 tests) |
| `processLpRange` | 618-655 | public async | Yes (L1303-1717, 8 tests) |

### processor.ts — Types/Constants Referenced

- Imports: `Address`, `PublicClient`, `REWARDS_SOURCES`, `FACTORIES`, `isSameAddress`, `CYTOKENS`, `scaleTo18`, `Transfer`, `AccountBalance`, `EligibleBalances`, `TokenBalances`, `RewardsPerToken`, `CyToken`, `LiquidityChange`, `LiquidityChangeType`, `LpV3Position`, `BlocklistReport`, `ONE_18`, `BOUNTY_PERCENT`, `RETRY_BASE_DELAY_MS`, `getPoolsTick`
- Internal state: `approvedSourceCache` (L35), `accountBalancesPerToken` (L37), `client` (L42), `lp3TrackList` (L44), `liquidityEvents` (L46)

### processor.test.ts — Test Suites

| Suite | Lines | Test Count |
|---|---|---|
| Constructor | 47-54 | 1 |
| Basic Transfer Processing | 56-183 | 4 |
| Snapshot Timing | 186-327 | 4 |
| Blocklist | 329-377 | 1 |
| Blocklist Penalties | 379-467 | 1 |
| Reward Calculation | 469-751 | 2 |
| Reward Calculation with Multiple Tokens | 754-821 | 1 |
| organizeLiquidityPositions duplicate handling | 824-861 | 1 |
| Process Liquidity Position | 863-1268 | 6 |
| Mixed-case owner address in liquidity positions | 1270-1301 | 1 |
| Test processLpRange() Happy | 1325-1523 | 4 |
| Test processLpRange() Unhappy | 1525-1717 | 4 |
| updateSnapshots | 1719-1793 | 6 |
| isApprovedSource | 1795-1910 | 10 |

**Total: 46 tests**

---

## Findings

### F-01: `transferIsDeposit` and `transferIsWithdraw` lack direct unit tests [MEDIUM]

**Location:** `processor.ts` L241-280, `processor.test.ts` (no direct tests)

These two public methods are only tested indirectly through `processTransfer`. They have 4 early-return branches each (owner not found, token not found, txhash not found, wrong changeType). None of these branches are directly asserted. If the methods are refactored or their lookup logic changes, regressions could go undetected.

Specific untested paths:
- `transferIsDeposit` returning `undefined` when owner has events but for a different token
- `transferIsDeposit` returning `undefined` when owner+token has events but for a different txHash
- `transferIsDeposit` returning `undefined` when event exists but changeType is `Withdraw`
- Same three paths for `transferIsWithdraw` plus changeType `Deposit` guard

---

### F-02: `getUniqueAddresses` has no direct test [LOW]

**Location:** `processor.ts` L286-302, `processor.test.ts` (no direct test)

`getUniqueAddresses` is only exercised indirectly through `getEligibleBalances`. The method has specific logic: it adds reporter addresses from blocklist entries and all addresses from accountBalancesPerToken. No test verifies:
- That reporter-only addresses (no transfers) are included in the set
- That addresses are deduplicated correctly
- That the returned set is lowercased

---

### F-03: `calculateTotalEligibleBalances` has no direct test [LOW]

**Location:** `processor.ts` L386-401, `processor.test.ts` (no direct test)

Only tested as an internal call within `calculateRewardsPoolsPerToken` and `calculateRewards`. No test directly verifies the summing logic or that tokens with zero total balance return 0n.

---

### F-04: `getTokensWithBalance` has no direct test [LOW]

**Location:** `processor.ts` L408-417, `processor.test.ts` (no direct test)

Only tested indirectly through `calculateRewards`. No test verifies:
- That tokens with zero total balance are excluded
- That the returned array preserves CYTOKENS ordering

---

### F-05: No test for penalty/bounty across multiple tokens [MEDIUM]

**Location:** `processor.ts` L342-376 (second and third pass in `getEligibleBalances`), `processor.test.ts` L329-467

The penalty/bounty tests only use `CYTOKENS[0]`. The penalty loop in `getEligibleBalances` iterates over all CYTOKENS (L343), but no test verifies that a cheater with balances across multiple tokens gets penalized in each token, and that the reporter receives bounties in each token. A bug in the per-token iteration could go undetected.

---

### F-06: No test for `calculateRewardsPoolsPerToken` inverse-fraction weighting correctness [MEDIUM]

**Location:** `processor.ts` L426-469, `processor.test.ts` L728 (single indirect call)

The inverse-fraction weighting algorithm is critical to fair reward distribution. The only direct call to `calculateRewardsPoolsPerToken` is at L728, where the result is used to compute expected values for `calculateRewards` — it's a tautological check (the test verifies `calculateRewards` returns what `calculateRewardsPoolsPerToken` says it should, not that the weighting is correct).

No test verifies:
- That a token with smaller total balance gets a proportionally larger share of the pool (the inverse-fraction design intent)
- Specific expected numeric values for the per-token pool splits
- Behavior when all tokens have equal balances (should split evenly)
- Behavior with only one token having balance (should get entire pool)

---

### F-07: No test for `organizeLiquidityPositions` with ineligible token [LOW]

**Location:** `processor.ts` L514-517, `processor.test.ts` (untested path)

`organizeLiquidityPositions` has an early return for tokens not in CYTOKENS (L515). While `processLiquidityPositions` has a test for ineligible tokens (L1162-1184), `organizeLiquidityPositions` does not. A regression could silently store ineligible-token liquidity events.

---

### F-08: `processTransfer` error path for missing accountBalances map is untested [LOW]

**Location:** `processor.ts` L175-177

```typescript
if (!accountBalances) {
  throw new Error("No account balances found for token");
}
```

This throw path at L176 is unreachable in normal operation because the constructor initializes maps for all CYTOKENS, and ineligible tokens are filtered at L164. The test at L163-183 tests the ineligible-token early return but not this throw. Since it's a defensive guard, this is low severity.

---

### F-09: `processLiquidityPositions` error path for missing accountBalances map is untested [LOW]

**Location:** `processor.ts` L559-561

Same pattern as F-08. The `throw new Error("No account balances found for token")` at L560 is unreachable in normal operation for the same reasons. Defensive guard, low severity.

---

### F-10: No test for `processLpRange` clamping negative balance to zero [MEDIUM]

**Location:** `processor.ts` L649-651

```typescript
if (balance.netBalanceAtSnapshots[i] < 0n) {
  balance.netBalanceAtSnapshots[i] = 0n;
}
```

After deducting out-of-range LP positions, the code clamps negative snapshot balances to zero. No test verifies this clamping. The existing `processLpRange` tests all have initial balances of 500n with deductions of at most 200n, so the balance never goes negative. A scenario where the deduction exceeds the snapshot balance is untested.

---

### F-11: No test for `processTransfer` when both deposit and non-approved-source interact [INFO]

**Location:** `processor.ts` L215-227

When `transferIsDeposit` returns a deposit event, the sender's `transfersInFromApproved` is incremented by the transfer value (L218). But the `else` branch (L219-227) handles non-deposit transfers differently depending on `isApproved`. There is no test that verifies the interaction of a deposit transfer from a non-approved source — i.e., where `isApproved=false` but `transferIsDeposit` returns a deposit. This should not occur in production (deposits go to pool addresses, not from approved sources), but the code path exists.

---

### F-12: `processTransfer` double-subtraction pattern for approved-source non-deposit transfers lacks clarity test [INFO]

**Location:** `processor.ts` L199-226

When `isApproved=true` and the transfer is not a deposit, the code first adds the value to `toBalance.transfersInFromApproved` (L207), then in the else branch (L220-225) subtracts it back. This net-zero pattern is intentional (approved source that isn't a deposit/withdraw — e.g., a swap router returning tokens) but has no test that explicitly verifies the double-entry cancellation. The existing tests cover the integrated result but don't isolate this specific path.

---

## Summary

| Severity | Count | Finding IDs |
|---|---|---|
| CRITICAL | 0 | — |
| HIGH | 0 | — |
| MEDIUM | 3 | F-01, F-05, F-06 |
| LOW | 5 | F-02, F-03, F-04, F-07, F-08, F-09 |
| INFO | 2 | F-11, F-12 |

The test suite is thorough for the happy paths of the core pipeline. The main gaps are: (1) public methods tested only indirectly with no branch-level assertions, (2) the inverse-fraction reward weighting algorithm has no direct correctness test, and (3) penalty/bounty logic is only tested with a single token.
