# Test Coverage Audit: processor.ts

**Agent:** A06
**Date:** 2026-02-22
**Pass:** 2
**Files under audit:**
- `/Users/thedavidmeister/Code/cyclo.rewards/src/processor.ts` (517 lines)
- `/Users/thedavidmeister/Code/cyclo.rewards/src/processor.test.ts` (1053 lines)

---

## 1. Evidence of Thorough Reading

### 1.1 processor.ts — Module Inventory

**Class:** `Processor` (line 23)

**Private fields:**
| Field | Line | Type |
|---|---|---|
| `approvedSourceCache` | 24 | `Map<string, boolean>` |
| `accountBalancesPerToken` | 25-28 | `Map<string, Map<string, AccountBalance>>` |
| `accountTransfers` | 29 | `Map<string, AccountTransfers>` |
| `client` | 30 | viem PublicClient (or injected mock) |
| `lp3TrackList` | 31-36 | `Record<number, Map<string, {pool, value, lowerTick, upperTick}>>` |

**Constructor:** lines 38-62
- Parameters: `snapshots: number[]`, `epochLength: number`, `reports`, `client?`, `pools`
- Initializes `accountBalancesPerToken` for each `CYTOKENS` entry
- Initializes empty `lp3TrackList` maps per snapshot

**Public methods:**

| Method | Lines | Signature |
|---|---|---|
| `isApprovedSource` | 64-126 | `async (source: string, retries?: number) => Promise<boolean>` |
| `processTransfer` | 128-219 | `async (transfer: Transfer) => Promise<void>` |
| `getUniqueAddresses` | 221-237 | `async () => Promise<Set<string>>` |
| `getEligibleBalances` | 239-307 | `async () => Promise<EligibleBalances>` |
| `calculateTotalEligibleBalances` | 309-324 | `(balances: EligibleBalances) => Map<string, bigint>` |
| `getTokensWithBalance` | 326-335 | `(balances: EligibleBalances) => CyToken[]` |
| `calculateRewardsPoolsPertoken` | 337-381 | `(balances, rewardPool) => Map<string, bigint>` |
| `calculateRewards` | 383-412 | `async (rewardPool: bigint) => Promise<RewardsPerToken>` |
| `processLiquidityPositions` | 414-475 | `async (liquidityChangeEvent: LiquidityChange) => Promise<void>` |
| `processLpRange` | 478-515 | `async () => Promise<void>` |

**Error paths / throw statements:**
- Line 165: `throw new Error("No account balances found for token")` in `processTransfer`
- Line 429: `throw new Error("No account balances found for token")` in `processLiquidityPositions`

**Error handling in `isApprovedSource`:**
- Lines 100-107: Catches `shortMessage` containing `'returned no data ("0x")'`, `"reverted"`, or `"invalid parameters"` and caches false
- Lines 110-116: For other errors, retries with exponential backoff
- Lines 118-121: After exhausting retries, logs error and returns false

**Constants/imports used:**
- `REWARDS_SOURCES`, `FACTORIES`, `RPC_URL`, `isSameAddress`, `CYTOKENS` from config
- `ONE` from constants (1e18 as BigInt)
- `getPoolsTick` from liquidity

### 1.2 processor.test.ts — Test Inventory

**Mocks:**
- Line 8-10: `vi.mock('./liquidity')` mocking `getPoolsTick`
- Line 26-28: `mockClient` with `readContract` stub returning zero address
- Line 32-37: `isApprovedSource` is **overridden** with a simple mock in `beforeEach`

**Test suites and cases:**

| Suite | Test | Lines |
|---|---|---|
| Basic Transfer Processing | should track approved transfers correctly | 41-69 |
| Basic Transfer Processing | should not track unapproved transfers | 71-88 |
| Snapshot Timing | should handle transfers before snapshot 1 | 92-113 |
| Snapshot Timing | should handle transfers between snapshots | 115-138 |
| Snapshot Timing | should handle transfers after snapshot 2 | 140-164 |
| Blocklist | should include blocklisted addresses with penalties | 168-201 |
| Blocklist Penalties | should calculate bounties for reporters | 204-262 |
| Reward Calculation | should calculate rewards proportionally for single token | 266-315 |
| Reward Calculation | should treat negative balances as zero | 317-457 |
| Reward Calculation with Multiple Tokens | should calculate rewards proportionally for multiple tokens | 461-499 |
| Process Liquidity Position | should correctly factor in liquidity changes | 503-634 |
| Test processLpRange() - Happy | should process LP positions correctly when they are out of range | 661-709 |
| Test processLpRange() - Happy | should not deduct balance when LP position is in range | 711-749 |
| Test processLpRange() - Happy | should handle multiple LP positions for same account | 751-800 |
| Test processLpRange() - Happy | should handle multiple tokens and accounts | 802-857 |
| Test processLpRange() - Unhappy | should skip processing when pool tick is undefined | 861-898 |
| Test processLpRange() - Unhappy | should skip LP positions with zero or negative value | 900-947 |
| Test processLpRange() - Unhappy | should skip non related LP positions | 949-987 |
| Test processLpRange() - Unhappy | should handle getPoolsTick failures gracefully | 989-1008 |
| Test processLpRange() - Unhappy | should process different snapshots independently | 1010-1050 |

---

## 2. Coverage Gap Analysis

### A06-1: `isApprovedSource` — No direct unit tests

**Severity: HIGH**

The `isApprovedSource` method (lines 64-126) is **never tested directly**. In every test, `beforeEach` replaces it with a trivial mock (lines 32-37):

```typescript
processor.isApprovedSource = async (source: string) => {
  return (
    source.toLowerCase() === APPROVED_SOURCE.toLowerCase() ||
    source.toLowerCase() === FACTORY_SOURCE.toLowerCase()
  );
};
```

This means no test exercises:
- The `approvedSourceCache` caching logic (lines 66-68)
- The `REWARDS_SOURCES` direct-match path (lines 71-74)
- The factory contract `readContract` call and `FACTORIES` check (lines 78-97)
- The error classification by `shortMessage` content (lines 100-107) for `"returned no data"`, `"reverted"`, `"invalid parameters"`
- The exponential backoff retry loop (lines 110-116)
- The retry-exhaustion fallback path (lines 118-121)
- The unreachable `return false` at line 125 (dead code after the for-loop)

This is especially concerning because `isApprovedSource` controls whether balances are eligible for rewards. A bug in caching, error handling, or factory checking could silently misclassify accounts. This is the primary gatekeeper for reward eligibility in a financial system.

### A06-2: `processTransfer` — Error path for unknown token address never tested

**Severity: HIGH**

Line 165: `throw new Error("No account balances found for token")` is triggered when `this.accountBalancesPerToken.get(transfer.tokenAddress)` returns `undefined`. The test at line 130 skips transfers for non-CYTOKENS tokens before reaching this path, but there is a subtle gap: if `transfer.tokenAddress` matches a CYTOKENS address in a case-sensitive comparison at line 130 (which does `.toLowerCase()` on both sides) but the `accountBalancesPerToken` map was keyed differently, the throw could occur.

More critically, there is **no test that verifies this throw statement fires** when it should. The early return on line 131 for non-CYTOKENS tokens is tested implicitly (the "should not track unapproved transfers" test uses a valid token address), but there is no test for the case where a transfer passes the CYTOKENS check but fails the map lookup.

### A06-3: `processLiquidityPositions` — Error path for unknown token never tested

**Severity: HIGH**

Line 429: `throw new Error("No account balances found for token")` in `processLiquidityPositions` has no test exercising it. Same pattern as A06-2: the early return at line 416 filters non-CYTOKENS tokens, but the throw at line 429 (if the token passes the CYTOKENS filter but is missing from `accountBalancesPerToken`) is never verified.

### A06-4: `processTransfer` — No test for non-CYTOKENS token (early return)

**Severity: MEDIUM**

Line 130-132: The early `return` when `transfer.tokenAddress` is not in `CYTOKENS` is not explicitly tested. No test sends a transfer with a completely invalid/unknown token address to verify it is silently ignored. While the logic is simple, for a financial system, explicit verification that unknown tokens are dropped is important.

### A06-5: `processLiquidityPositions` — No test for non-CYTOKENS token (early return)

**Severity: MEDIUM**

Line 416-418: Same gap as A06-4 but for liquidity position processing. No test sends a `LiquidityChange` event with a token address not in `CYTOKENS` to verify the early return.

### A06-6: `processLiquidityPositions` — LiquidityV3Change tracking logic not tested through the method

**Severity: HIGH**

Lines 452-469: When `liquidityChangeEvent.__typename === "LiquidityV3Change"`, the method builds an LP tracking ID and updates `lp3TrackList`. However, in the `processLiquidityPositions` tests (lines 502-634), **all test events use `__typename: "LiquidityV2Change"`**. The V3 branch including the composite key construction (`tokenAddress-owner-poolAddress-tokenId`), the `prev.value += depositedBalanceChange` accumulation, and the interaction between `processLiquidityPositions` and `processLpRange` through `lp3TrackList` is never tested through the public API.

The `processLpRange` tests do populate `lp3TrackList` directly via `(processor as any).lp3TrackList`, bypassing `processLiquidityPositions`. This means the integration path V3 liquidity event -> `processLiquidityPositions` -> `lp3TrackList` population -> `processLpRange` deduction is untested end-to-end.

### A06-7: `getUniqueAddresses` — No direct test

**Severity: LOW**

Lines 221-237: `getUniqueAddresses` is tested only indirectly through `getEligibleBalances`. There are no tests verifying:
- That reporter addresses are included even when they have no transfers
- Behavior with empty `reports` array and empty `accountBalancesPerToken`
- Case normalization (`.toLowerCase()` on reporter addresses at line 225)

The blocklist test at line 168 does pass a reporter who has no pre-existing balance, which partially covers this, but the test does not assert on the address set itself.

### A06-8: `getTokensWithBalance` — No direct test

**Severity: LOW**

Lines 326-335: `getTokensWithBalance` is only invoked indirectly through `calculateRewards` and `calculateRewardsPoolsPertoken`. There is no test verifying:
- Behavior when no tokens have any balance (returns empty array)
- Behavior when only some tokens have balance

### A06-9: `calculateTotalEligibleBalances` — No direct test

**Severity: LOW**

Lines 309-324: `calculateTotalEligibleBalances` is tested only indirectly. There is no test verifying:
- Correct summation of `final` balances across all accounts for a token
- Behavior with empty balance maps
- That tokens with all-zero `final` values produce a total of `0n`

### A06-10: `calculateRewardsPoolsPertoken` — Division by zero when all balances are zero

**Severity: CRITICAL**

Lines 337-381: If `sumOfAllBalances` is `0n` (all tokens have zero total eligible balance), then line 355:
```typescript
const tokenInverseFraction = (sumOfAllBalances * ONE) / totalBalances.get(token.address.toLowerCase())!;
```
would compute `0n / 0n` which throws a `RangeError: Division by zero` in JavaScript BigInt arithmetic. However, `getTokensWithBalance` on line 344 would filter to an empty list, so the loop at line 353 would not execute.

But there is a more subtle case: if exactly one token has balance and that balance is positive, then `sumOfAllBalances > 0n`, but if a different token somehow gets through `getTokensWithBalance` with a zero total (possible if `final` values cancel out), the division at line 355 would divide by zero.

Additionally, there is **no test** for `calculateRewardsPoolsPertoken` with:
- A zero `rewardPool`
- All balances being zero
- Only one token having balance

The only test that calls it directly is the negative-balance test (line 434), which always has positive balances for at least one token.

### A06-11: `calculateRewards` — No test for zero reward pool

**Severity: MEDIUM**

Lines 383-412: No test calls `calculateRewards(0n)` to verify behavior when the reward pool is zero. With `rewardPool = 0n`, line 375 would produce `tokenReward = 0n`, which is mathematically correct, but line 405 would then divide by the total balance which could produce unexpected results if any individual balance is also zero.

### A06-12: `getEligibleBalances` — Penalty can exceed average, making `final` negative

**Severity: HIGH**

Lines 293-304: The formula at line 302:
```typescript
balance.final = balance.average - balance.penalty + balance.bounty;
```

If a cheater is reported multiple times (multiple reports with the same cheater), `penalty` accumulates (line 288: `cheaterBalance.penalty += penalty`), and could exceed `average`. This would make `final` negative. There is **no test for multiple reports against the same cheater**, and **no test verifying whether negative `final` values are handled downstream** (e.g., in `calculateRewards` where negative `final` would reduce the total balance and distort reward shares for others).

### A06-13: `processTransfer` — Transfer at exact snapshot block boundary

**Severity: MEDIUM**

Lines 196 and 213: The condition `transfer.blockNumber <= this.snapshots[i]` means a transfer AT the snapshot block IS included. While the "before snapshot" and "between snapshots" tests cover transfers strictly before/between, there is **no test for a transfer whose `blockNumber` equals a snapshot block number exactly**. This boundary condition is important for deterministic financial calculations.

### A06-14: `processLiquidityPositions` — Liquidity event at exact snapshot block boundary

**Severity: MEDIUM**

Line 448: Same boundary condition as A06-13 but for liquidity events. `liquidityChangeEvent.blockNumber <= this.snapshots[i]` — no test places an event at exactly a snapshot block number.

### A06-15: `processTransfer` — Zero-value transfer

**Severity: MEDIUM**

No test sends a transfer with `value: "0"`. While this would not break the math (adding/subtracting 0n), it would still create account entries in `accountBalancesPerToken` and `accountTransfers`. In a financial system, it is worth verifying that zero-value transfers do not create phantom entries that affect reward calculations.

### A06-16: `processLiquidityPositions` — Zero depositedBalanceChange

**Severity: LOW**

No test sends a liquidity change event with `depositedBalanceChange: "0"`. Similar to A06-15, this creates entries without changing balances.

### A06-17: Constructor — `epochLength` vs `snapshots.length` mismatch

**Severity: MEDIUM**

The constructor accepts both `snapshots: number[]` and `epochLength: number` separately. In `processTransfer` (line 173), `new Array(this.epochLength).fill(0n)` creates the snapshot array, while `this.snapshots.length` is used in loops (line 195). If `epochLength !== snapshots.length`, the snapshot balance array size would be inconsistent:
- `netBalanceAtSnapshots` would have `epochLength` entries
- But the loop at line 195 iterates `this.snapshots.length` times

There is **no test verifying behavior when `epochLength !== snapshots.length`**, and no validation in the constructor that they match. In all tests, they are consistent (`SNAPSHOTS.length` is passed as `epochLength`).

### A06-18: `getEligibleBalances` — Reporter without existing balance entry

**Severity: LOW**

Lines 248-266: When an address from `allAddresses` (which includes reporters) is not found in `accountBalances`, `balance` is `undefined` and `snapshots` defaults to a zero-filled array (line 256). The reporter then gets `average = 0n`, `penalty = 0n`, `bounty = (bounty amount)`, `final = bounty`. This path is partially tested by the blocklist tests but not asserted explicitly for the reporter-only-has-bounty scenario.

### A06-19: `processLpRange` — Balance goes negative from deductions, clamped to zero

**Severity: LOW**

Lines 507-511: After deducting out-of-range LP values, if `netBalanceAtSnapshots[i] < 0n`, it's clamped to `0n`. There is **no test** where the total LP deduction exceeds the snapshot balance, verifying the zero-clamping behavior.

### A06-20: `processTransfer` — `accountTransfers` tracking not tested

**Severity: MEDIUM**

Lines 138-158: The method builds an `accountTransfers` map tracking `transfersIn` and `transfersOut` for each address. No test asserts on the contents of `accountTransfers`. This tracking data appears to be used for reporting/auditing purposes but its correctness is never verified.

### A06-21: `processTransfer` — Sender balance from unapproved transfer

**Severity: MEDIUM**

Lines 204-218: When a transfer is NOT from an approved source, the sender's `transfersOut` is still incremented and `currentNetBalance` is updated. This means if user A sends tokens to user B from a non-approved source, user A's eligible balance is reduced even though user B gets no increase. This asymmetric behavior could cause eligible balances to go negative faster for senders. There is a test for unapproved transfers, but it only checks the receiver's average (line 87), not the sender's balance reduction.

---

## 3. Summary

| Severity | Count | IDs |
|---|---|---|
| CRITICAL | 1 | A06-10 |
| HIGH | 4 | A06-1, A06-2, A06-3, A06-6 |
| MEDIUM | 7 | A06-4, A06-5, A06-11, A06-13, A06-14, A06-15, A06-17 |
| LOW | 5 | A06-7, A06-8, A06-9, A06-16, A06-18 |
| INFO | 0 | |

**Total findings: 21** (including sub-items in A06-1 and A06-20/A06-21)

### Key Observations

1. **`isApprovedSource` is entirely mocked out** (A06-1). This is the single most critical function for reward eligibility and has zero direct test coverage for its caching, retry, error classification, and factory-checking logic.

2. **V3 liquidity integration path is untested end-to-end** (A06-6). While `processLpRange` is well-tested in isolation (with manually populated `lp3TrackList`), the V3 branch inside `processLiquidityPositions` that populates `lp3TrackList` is never exercised.

3. **Error/throw paths are untested** (A06-2, A06-3). Both `processTransfer` and `processLiquidityPositions` have `throw new Error("No account balances found for token")` that is never triggered by any test.

4. **Boundary conditions at snapshot blocks** (A06-13, A06-14) and **arithmetic edge cases** (A06-10, A06-12, A06-15) lack coverage, which is concerning for a deterministic financial calculation system.

5. **The `accountTransfers` tracking data** (A06-20) is built but never tested, making it impossible to verify its correctness for downstream consumers.
