# Pass 2: Test Coverage Audit for processor.ts

**Auditor:** A06
**Date:** 2026-02-24
**Source:** `/Users/thedavidmeister/Code/cyclo.rewards/src/processor.ts` (613 lines)
**Test:** `/Users/thedavidmeister/Code/cyclo.rewards/src/processor.test.ts` (1410 lines)

---

## 1. Evidence of Thorough Reading

### 1.1 All Public/Exported Methods in processor.ts (Processor class)

| Line | Method | Signature |
|------|--------|-----------|
| 67 | `isApprovedSource` | `async isApprovedSource(source: string, retries = 8): Promise<boolean>` |
| 129 | `processTransfer` | `async processTransfer(transfer: Transfer)` |
| 247 | `transferIsDeposit` | `transferIsDeposit(transfer: Transfer): LiquidityChange \| undefined` |
| 265 | `transferIsWithdraw` | `transferIsWithdraw(transfer: Transfer): LiquidityChange \| undefined` |
| 283 | `getUniqueAddresses` | `async getUniqueAddresses(): Promise<Set<string>>` |
| 301 | `getEligibleBalances` | `async getEligibleBalances(): Promise<EligibleBalances>` |
| 373 | `calculateTotalEligibleBalances` | `calculateTotalEligibleBalances(balances: EligibleBalances): Map<string, bigint>` |
| 390 | `getTokensWithBalance` | `getTokensWithBalance(balances: EligibleBalances): CyToken[]` |
| 401 | `calculateRewardsPoolsPertoken` | `calculateRewardsPoolsPertoken(balances: EligibleBalances, rewardPool: bigint): Map<string, bigint>` |
| 447 | `calculateRewards` | `async calculateRewards(rewardPool: bigint): Promise<RewardsPerToken>` |
| 478 | `organizeLiquidityPositions` | `async organizeLiquidityPositions(liquidityChangeEvent: LiquidityChange)` |
| 506 | `processLiquidityPositions` | `async processLiquidityPositions(liquidityChangeEvent: LiquidityChange)` |
| 575 | `processLpRange` | `async processLpRange()` |

**Constructor** (line 41): Takes `snapshots`, `epochLength`, `reports`, optional `client`, optional `pools`. Initializes `accountBalancesPerToken` for each CYTOKEN and `lp3TrackList` for each snapshot.

### 1.2 All describe/it Blocks in processor.test.ts

```
describe("Processor")
  beforeEach: Creates processor with SNAPSHOTS=[100,200], mocks isApprovedSource

  describe("Basic Transfer Processing")
    it("should track approved transfers correctly")                    [line 41]
    it("should track approved deposit transfers correctly")            [line 72]
    it("should not track unapproved transfers")                        [line 127]

  describe("Snapshot Timing")
    it("should handle valid transfers before snapshot 1")              [line 149]
    it("should handle transfers between snapshots")                    [line 186]
    it("should handle transfers after snapshot 2")                     [line 225]

  describe("Blocklist")
    it("should include blocklisted addresses with penalties")          [line 254]

  describe("Blocklist Penalties")
    it("should calculate bounties for reporters")                      [line 304]

  describe("Reward Calculation")
    it("should calculate rewards proportionally for single token")     [line 394]
    it("should treat negative balances as zero when calculating eligible amounts") [line 474]

  describe("Reward Calculation with Multiple Tokens")
    it("should calculate rewards proportionally for multiple tokens")  [line 679]

  describe("Process Liquidity Position")
    it("should correctly factor in liquidity changes")                 [line 749]

  describe("Test processLpRange() method")
    beforeEach/afterEach: Creates processor with snapshots=[1000,2000,3000]

    describe("Happy")
      it("should process LP positions correctly when they are out of range")     [line 1002]
      it("should not deduct balance when LP position is in range")               [line 1052]
      it("should handle multiple LP positions for same account")                 [line 1092]
      it("should handle multiple tokens and accounts")                           [line 1143]

    describe("Unhappy")
      it("should skip processing when pool tick is undefined")                   [line 1202]
      it("should skip LP positions with zero or negative value")                 [line 1241]
      it("should skip non related LP positions")                                 [line 1290]
      it("should handle getPoolsTick failures gracefully")                       [line 1330]
      it("should process different snapshots independently")                     [line 1351]

  describe("isApprovedSource")
    it("should throw after exhausting retries on transient RPC errors")          [line 1396]
```

**Total: 19 test cases across 9 describe blocks.**

---

## 2. Per-Method Coverage Analysis

### 2.1 `isApprovedSource` (line 67)

**Paths in source:**
1. Cache hit (lines 69-71)
2. Direct REWARDS_SOURCES match (lines 74-77)
3. Factory contract call succeeds, factory is approved (lines 82-100)
4. Factory contract call succeeds, factory is NOT approved (lines 96-100)
5. Contract call returns "no data"/"reverted"/"invalid parameters" -- returns false (lines 103-111)
6. Transient error with retries remaining -- exponential backoff retry (lines 114-119)
7. All retries exhausted -- throws Error (lines 122-123)
8. Unreachable `return false` at line 126

**Tests covering:**
- "should throw after exhausting retries on transient RPC errors" -- covers path 7

**Gaps:**
- **UNTESTED: Cache hit path** (path 1). No test calls `isApprovedSource` twice with the same address to verify caching.
- **UNTESTED: Direct REWARDS_SOURCES match** (path 2). The `beforeEach` in most tests replaces `isApprovedSource` with a mock that hardcodes approved addresses, completely bypassing the real implementation's REWARDS_SOURCES check.
- **UNTESTED: Factory call returning an approved factory** (path 3).
- **UNTESTED: Factory call returning a non-approved factory** (path 4).
- **UNTESTED: "no data returned" / "reverted" / "invalid parameters" short circuit** (path 5).
- **UNTESTED: Retry with exponential backoff** (path 6 -- only indirectly tested via path 7 with `retries=1`).

**Severity: HIGH.** The real `isApprovedSource` is almost entirely untested since most tests mock it away. Only the retry-exhaustion throw is tested with the real implementation.

### 2.2 `processTransfer` (line 129)

**Paths in source:**
1. Token not in CYTOKENS list -- early return (lines 131-133)
2. Approved source transfer to new account (lines 188-208)
3. Transfer is a deposit (via `transferIsDeposit`) -- adjusts `transfersInFromApproved` for sender (lines 214-215)
4. Transfer is NOT a deposit AND from approved source -- reverts `toBalance` credit, adds to `fromBalance.transfersOut` (lines 217-231)
5. Transfer is NOT a deposit AND from unapproved source -- adds to `fromBalance.transfersOut` only (line 230)
6. Transfer is a withdraw (via `transferIsWithdraw`) -- adds `depositedBalanceChange` to `toBalance` (lines 192-195)
7. Snapshot boundary update: `transfer.blockNumber <= this.snapshots[i]` (lines 203-207, 224-228, 237-240)
8. Negative balance clamped to 0n (lines 202, 225, 236)
9. `accountBalances` not found for token -- throws Error (lines 165-167)

**Tests covering:**
- "should track approved transfers correctly" -- path 2, but note: result is 0n because approved->user followed by the else branch (line 217) reverting the credit since the transfer is not a deposit. This tests a subtle interaction.
- "should track approved deposit transfers correctly" -- paths 2, 3, 6 in combination
- "should not track unapproved transfers" -- path 5
- "should handle valid transfers before snapshot 1" -- path 7 (blockNumber < all snapshots)
- "should handle transfers between snapshots" -- path 7 (blockNumber between snapshots)
- "should handle transfers after snapshot 2" -- path 7 (blockNumber > all snapshots)
- "should correctly factor in liquidity changes" -- multi-step deposit/withdraw integration including paths 2, 3, 6, 7
- "should treat negative balances as zero" -- path 8

**Gaps:**
- **UNTESTED: Non-CYTOKEN tokenAddress early return** (path 1). No test passes a `tokenAddress` that is not in CYTOKENS to verify the early return.
- **UNTESTED: `throw new Error("No account balances found for token")`** (path 9, line 166). This would require a token address that passes the CYTOKENS check but has no corresponding entry in `accountBalancesPerToken`, which should be impossible given constructor initialization. Still, no explicit test verifies this throw path.
- **UNTESTED: Transfer at exact snapshot boundary** (`blockNumber === snapshots[i]`). The `<=` boundary condition at line 204 is covered by tests where `blockNumber < snapshots[i]`, but no test explicitly sets `blockNumber` to equal a snapshot value (e.g., blockNumber=100 when snapshot is 100). This is a critical edge case for financial correctness.

**Severity: MEDIUM.** The non-CYTOKEN early return and exact snapshot boundary are important edge cases. The throw path is defensive and likely unreachable, so lower priority.

### 2.3 `transferIsDeposit` (line 247)

**Paths in source:**
1. No owner events in liquidityEvents -- returns undefined (line 253)
2. No token events for owner -- returns undefined (line 256)
3. No txhash events for owner+token -- returns undefined (line 259)
4. Event exists and is `Deposit` type -- returns the event (line 261)
5. Event exists but is NOT `Deposit` type -- returns undefined (line 262)

**Tests covering:**
- Tested indirectly via `processTransfer` in "should track approved deposit transfers correctly" and multiple liquidity position tests. These tests exercise path 4 by setting up matching deposit events.
- Tested indirectly for path 1 (no matching event) in "should track approved transfers correctly" where no liquidity events are organized.

**Gaps:**
- **UNTESTED: Path 5 explicitly** -- an event exists at the matching key but has a `Withdraw` or `Transfer` type. This is tested only implicitly in the integrated flow where withdraw events happen on the `transferIsWithdraw` side.
- **No direct unit tests.** All coverage is indirect through `processTransfer` integration.

**Severity: LOW.** The method is simple lookup logic, but direct unit tests would improve confidence.

### 2.4 `transferIsWithdraw` (line 265)

**Paths in source:**
1. No owner events -- returns undefined (line 271)
2. No token events -- returns undefined (line 274)
3. No txhash events -- returns undefined (line 277)
4. Event exists and is `Withdraw` type -- returns the event (line 279)
5. Event exists but is NOT `Withdraw` type -- returns undefined (line 280)

**Tests covering:**
- Tested indirectly via "should correctly factor in liquidity changes" test where a withdraw event (type `Withdraw`) is organized then processTransfer is called with matching txhash. This exercises path 4.

**Gaps:**
- **UNTESTED: Path 5 explicitly** -- event exists but is not Withdraw type.
- **No direct unit tests.** Same concern as `transferIsDeposit`.

**Severity: LOW.**

### 2.5 `getUniqueAddresses` (line 283)

**Paths in source:**
1. Collect reporter addresses from reports (lines 286-288)
2. Collect all addresses from accountBalancesPerToken (lines 289-298)
3. Combined set returned

**Tests covering:**
- Tested indirectly through `getEligibleBalances` in every test that calls it. The blocklist tests exercise path 1 (reporters added even if they have no balance from transfers).

**Gaps:**
- **No direct unit test.** Always tested through `getEligibleBalances`.
- **UNTESTED: Reporter-only address with no balance entries.** The "should calculate bounties for reporters" test does give the reporter a balance, so a reporter with zero transfers is not explicitly tested for inclusion.

**Severity: LOW.** Simple aggregation logic.

### 2.6 `getEligibleBalances` (line 301)

**Paths in source:**
1. First pass: calculate base balances and averages (lines 306-332)
2. Second pass: calculate penalties and bounties from reports (lines 335-354)
3. Third pass: calculate final = average - penalty + bounty, scale to 18 decimals (lines 357-368)
4. Address with no balance entry defaults to zero-filled snapshots (line 318)
5. Division by `snapshots.length` to compute average (line 319)
6. `scaleTo18` applied to final balance (line 366)

**Tests covering:**
- Tested extensively in almost every test case.
- Penalty and bounty calculation tested in "Blocklist" and "Blocklist Penalties" describes.
- Average calculation tested in "should correctly factor in liquidity changes".
- Negative-to-zero clamping tested in "should treat negative balances as zero".

**Gaps:**
- **UNTESTED: Empty snapshots (epochLength = 0).** If `snapshots` is empty, `BigInt(snapshots.length)` would be `0n` at line 319, causing a division-by-zero error. No test verifies this edge case or that the system correctly rejects it.
- **UNTESTED: Single snapshot.** No test uses `epochLength = 1` to verify correct average calculation with a single snapshot.
- **UNTESTED: scaleTo18 with non-18-decimal tokens in this context.** The config has cyFXRP with 6 decimals, but no test processes transfers for cyFXRP to verify the scaling path in `getEligibleBalances`.
- **UNTESTED: `cheaterBalance` being undefined (line 346) or `reporterBalance` being undefined (line 346).** The `continue` guard is not explicitly tested.

**Severity: MEDIUM.** Division by zero with empty snapshots is a potential crash. The scaleTo18 gap matters because cyFXRP has 6 decimals.

### 2.7 `calculateTotalEligibleBalances` (line 373)

**Paths in source:**
1. Sum all `final18` values per token (lines 381-383)
2. Token has no balances map -- `continue` (line 380)

**Tests covering:**
- Tested indirectly through `calculateRewards` and `calculateRewardsPoolsPertoken` in multiple reward calculation tests.

**Gaps:**
- **No direct unit test.**
- **UNTESTED: Token with no balances map** (the `continue` path at line 380).

**Severity: LOW.** Simple aggregation.

### 2.8 `getTokensWithBalance` (line 390)

**Paths in source:**
1. Returns tokens where total balance > 0n (lines 393-398)
2. Tokens with zero total balance are excluded

**Tests covering:**
- Tested indirectly through `calculateRewards`. The "should treat negative balances as zero" test creates a scenario where one token for one user is zero, exercising this filtering.

**Gaps:**
- **No direct unit test.**
- **UNTESTED: Token where ALL users have zero balance.** No test verifies that a token with zero total balance is correctly excluded.

**Severity: LOW-MEDIUM.** If a token has zero total balance and is not excluded, it would cause division by zero in `calculateRewardsPoolsPertoken`.

### 2.9 `calculateRewardsPoolsPertoken` (line 401)

**Paths in source:**
1. Calculate inverse fractions for harmonic-mean-style pool splitting (lines 416-425)
2. Sum inverse fractions (lines 428-430)
3. Calculate each token's share (lines 433-443)
4. Implicit: `sumOfAllBalances` is 0 if no tokens have balance -- would cause division by zero at line 419

**Tests covering:**
- "should calculate rewards proportionally for single token" -- but only one token has balance
- "should treat negative balances as zero" -- two tokens each with one user having balance
- "should calculate rewards proportionally for multiple tokens" -- single token with two users

**Gaps:**
- **UNTESTED: Division by zero when `totalBalances.get(token)` is 0n** (line 420). The `getTokensWithBalance` filter should prevent this, but no test verifies the guard works.
- **UNTESTED: Division by zero when `sumOfAllBalances` is 0n** (line 419). If all tokens have zero balance, this would crash.
- **UNTESTED: `sumOfInverseFractions` being 0n** (line 439). Should be prevented by the `tokensWithBalance` filter but not explicitly tested.

**Severity: MEDIUM.** Division by zero scenarios in financial calculations deserve explicit edge-case tests.

### 2.10 `calculateRewards` (line 447)

**Paths in source:**
1. Get balances, pools, totals, then compute per-address shares (lines 448-475)
2. Division: `balance.final18 * totalRewardsPerToken / totalBalances` (lines 467-469)
3. Only processes `tokensWithBalance` (line 460)

**Tests covering:**
- "should calculate rewards proportionally for single token" -- basic proportional split
- "should treat negative balances as zero" -- multi-token with negative balances
- "should calculate rewards proportionally for multiple tokens" -- multi-token split

**Gaps:**
- **UNTESTED: Division by zero when `totalBalances.get(token)` is 0n** (line 469). Same guard as `calculateRewardsPoolsPertoken`, but the division here is separate.
- **UNTESTED: rewardPool = 0n.** No test verifies behavior when the reward pool is zero.
- **UNTESTED: All accounts have zero eligible balance** (empty reward scenario).

**Severity: MEDIUM.**

### 2.11 `organizeLiquidityPositions` (line 478)

**Paths in source:**
1. Token not in CYTOKENS -- early return (lines 480-482)
2. Owner has no events yet -- creates full nested map structure (lines 487-491)
3. Owner has events but not for this token -- adds token map (lines 493-496)
4. Owner+token exists but not this txhash -- adds txhash entry (lines 499-502)
5. Owner+token+txhash already exists -- does nothing (implicit at line 503)

**Tests covering:**
- Tested indirectly in many tests that set up liquidity events before transfers. The "should track approved deposit transfers correctly" test exercises path 2 (first event for an owner). Multiple events in "should correctly factor in liquidity changes" exercise paths 3-4.

**Gaps:**
- **UNTESTED: Non-CYTOKEN tokenAddress early return** (path 1). No test passes a non-eligible token.
- **UNTESTED: Duplicate txhash** (path 5). No test calls `organizeLiquidityPositions` twice with the same owner+token+txhash to verify idempotence/silently-ignored behavior.

**Severity: LOW-MEDIUM.** The duplicate txhash behavior (silently ignoring subsequent events) could mask data issues.

### 2.12 `processLiquidityPositions` (line 506)

**Paths in source:**
1. Token not in CYTOKENS -- early return (lines 508-510)
2. Account balances not found -- throws Error (lines 520-522)
3. Owner not yet initialized -- creates default balance (lines 526-533)
4. `LiquidityChangeType.Transfer` -- modifies `currentNetBalance` directly (lines 538-540)
5. `LiquidityChangeType.Deposit` or `Withdraw` -- does NOT modify `currentNetBalance` (line 538 guard)
6. Snapshot update with `blockNumber <= snapshots[i]` (lines 544-546)
7. V3 event (`__typename === "LiquidityV3Change"`) -- updates `lp3TrackList` (lines 549-566)
8. Negative balance clamped to 0n (line 543)

**Tests covering:**
- "should correctly factor in liquidity changes" -- covers deposit, withdraw, and transfer change types (paths 4, 5), snapshot updates (path 6)
- processLpRange tests indirectly exercise path 7 by setting up lp3TrackList via private property access rather than through `processLiquidityPositions`

**Gaps:**
- **UNTESTED: Non-CYTOKEN tokenAddress early return** (path 1).
- **UNTESTED: `throw new Error("No account balances found for token")`** (path 2, line 521). Similar to processTransfer, likely unreachable given constructor initialization.
- **UNTESTED: V3 liquidity event through `processLiquidityPositions`** (path 7). The processLpRange tests set up `lp3TrackList` directly via private property access. No test passes a `LiquidityChangeV3` event through `processLiquidityPositions` to verify that `lp3TrackList` is correctly populated by the method itself.
- **UNTESTED: Owner initialization for new account** (path 3) in isolation. Tested only in combination with other operations.

**Severity: HIGH.** The V3 path through `processLiquidityPositions` is untested end-to-end. The `lp3TrackList` population logic at lines 549-566 (constructing the compound ID, accumulating `depositedBalanceChange`, setting tick bounds) has zero test coverage through the public API. All processLpRange tests bypass this by setting the private field directly.

### 2.13 `processLpRange` (line 575)

**Paths in source:**
1. Iterate snapshots, fetch pool ticks (lines 577-586)
2. Iterate tokens and accounts (lines 589-591)
3. Iterate tracked LP positions (lines 593-605)
4. Pool tick undefined -- `continue` (line 596)
5. LP key does not match current token-owner -- `continue` (line 599)
6. LP value <= 0n -- `continue` (line 600)
7. LP position in range (lowerTick <= tick <= upperTick) -- `continue` (line 601)
8. LP position out of range -- deduct from snapshot balance (line 604)
9. Negative balance clamped to 0n after deductions (lines 606-608)

**Tests covering:**
- "should process LP positions correctly when they are out of range" -- path 8
- "should not deduct balance when LP position is in range" -- path 7
- "should handle multiple LP positions for same account" -- paths 7, 8 combined
- "should handle multiple tokens and accounts" -- path 8 across multiple tokens/accounts
- "should skip processing when pool tick is undefined" -- path 4
- "should skip LP positions with zero or negative value" -- path 6
- "should skip non related LP positions" -- path 5
- "should handle getPoolsTick failures gracefully" -- error propagation
- "should process different snapshots independently" -- different ticks per snapshot

**Gaps:**
- **UNTESTED: Negative balance clamping** (path 9, lines 606-608). No test creates a scenario where deductions exceed the snapshot balance, triggering the `< 0n` clamp. All tests have sufficient balance to remain positive after deductions.
- **UNTESTED: LP position at exact tick boundary** (lowerTick === tick or tick === upperTick). The `<=` comparison at line 601 means positions where tick equals lowerTick or upperTick are "in range." No test verifies this boundary.

**Severity: LOW-MEDIUM.** The negative balance clamping and boundary tick behavior are edge cases worth testing.

---

## 3. Summary of Coverage Gaps

### Critical Gaps (HIGH severity)

| # | Gap | Method | Risk |
|---|-----|--------|------|
| 1 | Real `isApprovedSource` logic almost entirely untested | `isApprovedSource` | Approval logic is the gatekeeper for all reward eligibility. The mock replaces it in nearly every test. Cache behavior, REWARDS_SOURCES matching, factory contract calls, and "no data" error handling have zero real test coverage. |
| 2 | V3 liquidity events never flow through `processLiquidityPositions` | `processLiquidityPositions` | The V3-specific `lp3TrackList` population code (lines 549-566) including the compound ID construction (`tokenAddress-owner-poolAddress-tokenId`), the tick bound recording, and value accumulation, is never exercised through the public API. All processLpRange tests inject data directly into the private field. A bug in ID construction or value accumulation would go undetected. |

### Significant Gaps (MEDIUM severity)

| # | Gap | Method | Risk |
|---|-----|--------|------|
| 3 | No test for empty snapshots (division by zero) | `getEligibleBalances` | `BigInt(0)` division at line 319 would crash the processor. |
| 4 | No test for single snapshot | `getEligibleBalances` | Edge case for average calculation. |
| 5 | No test for transfer at exact snapshot boundary | `processTransfer` | `blockNumber === snapshot` is included by `<=` but never explicitly tested. Financial correctness depends on this boundary. |
| 6 | No test with non-18-decimal token (cyFXRP with 6 decimals) | `getEligibleBalances` | `scaleTo18` path for `decimals < 18` is not tested in the context of the full processor pipeline. |
| 7 | Division by zero paths in reward calculation not tested | `calculateRewardsPoolsPertoken`, `calculateRewards` | If all balances are zero, multiple division-by-zero crashes are possible. |
| 8 | Token with ALL users at zero balance not tested | `getTokensWithBalance` | Guard against including zero-balance tokens in reward calculation. |

### Minor Gaps (LOW severity)

| # | Gap | Method | Risk |
|---|-----|--------|------|
| 9 | Non-CYTOKEN tokenAddress early return untested | `processTransfer`, `organizeLiquidityPositions`, `processLiquidityPositions` | Three methods have the same guard; none are tested. |
| 10 | Duplicate txhash in `organizeLiquidityPositions` | `organizeLiquidityPositions` | Silent discard of duplicate events not verified. |
| 11 | `transferIsDeposit`/`transferIsWithdraw` wrong-type path untested | `transferIsDeposit`, `transferIsWithdraw` | Event exists but type does not match (e.g., Deposit event queried as Withdraw). |
| 12 | Negative balance clamping in `processLpRange` | `processLpRange` | Deduction exceeding balance triggers clamp to 0n. |
| 13 | LP position at exact tick boundary | `processLpRange` | `lowerTick === tick` or `tick === upperTick` boundary behavior. |
| 14 | `getUniqueAddresses` reporter with zero transfers | `getUniqueAddresses` | Reporter address included even with no balance entries. |
| 15 | `rewardPool = 0n` | `calculateRewards` | Zero reward pool edge case. |

---

## 4. Structural Observations

### 4.1 Mocking Strategy Concern

The `beforeEach` block at line 30-38 replaces `isApprovedSource` with a simple mock:
```typescript
processor.isApprovedSource = async (source: string) => {
  return (
    source.toLowerCase() === APPROVED_SOURCE.toLowerCase() ||
    source.toLowerCase() === FACTORY_SOURCE.toLowerCase()
  );
};
```
This means the actual `isApprovedSource` implementation (cache logic, RPC calls, factory checks, retry logic, error classification) is bypassed in 18 of 19 tests. Only the final `isApprovedSource` describe block (1 test) exercises the real method, and only for the retry-exhaustion path.

**Recommendation:** Add dedicated tests for `isApprovedSource` that exercise the real implementation with a controlled mock client returning specific factory addresses, "no data" errors, and sequences of transient failures followed by success.

### 4.2 processLpRange Tests Use Private Property Injection

All processLpRange tests set `lp3TrackList` via `(processor as any).lp3TrackList` rather than flowing data through `processLiquidityPositions`. This means the integration path from V3 liquidity event to processLpRange is completely untested.

**Recommendation:** Add at least one end-to-end test that calls `processLiquidityPositions` with a `LiquidityV3Change` event, then calls `processLpRange`, and verifies the final snapshot balances.

### 4.3 No Tests for the Third CYTOKEN (cyFXRP, 6 decimals)

All tests use `CYTOKENS[0]` (cysFLR, 18 decimals) or `CYTOKENS[1]` (cyWETH, 18 decimals). The `scaleTo18` function has different behavior for `decimals < 18`, but no test exercises this path through the processor.

### 4.4 Bug Risk: `processLiquidityPositions` Owner Lookup (line 535)

Line 525 lowercases the owner: `const owner = liquidityChangeEvent.owner.toLowerCase();`
Line 535 looks up with original case: `const ownerBalance = accountBalances.get(liquidityChangeEvent.owner)!;`

If `liquidityChangeEvent.owner` is not already lowercase, the `get` at line 535 will return undefined (the `set` at line 527 used the lowercased `owner`). The `!` non-null assertion would then crash. This is a potential bug that is masked because all test data uses lowercase addresses. This should be verified with a mixed-case address test.

---

## 5. Recommendations

1. **Add `isApprovedSource` unit tests** with the real implementation: test cache behavior, REWARDS_SOURCES match, factory match, factory non-match, "no data" error, retry+backoff, and retry exhaustion.
2. **Add V3 end-to-end integration test**: `processLiquidityPositions` with a `LiquidityV3Change` event followed by `processLpRange`.
3. **Add exact snapshot boundary test**: `blockNumber === snapshot[i]` in `processTransfer`.
4. **Add empty/single snapshot edge case tests** for `getEligibleBalances`.
5. **Add cyFXRP (6 decimal) token test** through the full processor pipeline.
6. **Add zero-total-balance token test** to verify `getTokensWithBalance` filtering prevents division by zero.
7. **Add non-CYTOKEN early return tests** for `processTransfer`, `organizeLiquidityPositions`, and `processLiquidityPositions`.
8. **Investigate potential bug at line 535** in `processLiquidityPositions` where owner case mismatch could cause a crash.
9. **Add negative balance clamping test** for `processLpRange` where deduction exceeds snapshot balance.
