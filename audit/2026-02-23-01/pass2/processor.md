# Audit A06 -- Pass 2 (Test Coverage) -- processor.ts

## Evidence of Thorough Reading

### Source file: `src/processor.ts` (517 lines)

**Class:** `Processor` (line 23)

**Private fields (lines 24-36):**
- `approvedSourceCache` (line 24)
- `accountBalancesPerToken` (line 25)
- `accountTransfers` (line 29)
- `client` (line 30)
- `lp3TrackList` (line 31)

**Constructor** (lines 38-62): accepts `snapshots`, `epochLength`, `reports`, `client`, `pools`. Initializes `accountBalancesPerToken` for each CYTOKEN and `lp3TrackList` for each snapshot.

**Methods:**

| Method | Lines | Visibility |
|---|---|---|
| `isApprovedSource(source, retries?)` | 64-126 | public async |
| `processTransfer(transfer)` | 128-219 | public async |
| `getUniqueAddresses()` | 221-237 | public async |
| `getEligibleBalances()` | 239-307 | public async |
| `calculateTotalEligibleBalances(balances)` | 309-324 | public |
| `getTokensWithBalance(balances)` | 326-335 | public |
| `calculateRewardsPoolsPertoken(balances, rewardPool)` | 337-381 | public |
| `calculateRewards(rewardPool)` | 383-412 | public async |
| `processLiquidityPositions(liquidityChangeEvent)` | 414-475 | public async |
| `processLpRange()` | 478-515 | public async |

### Test file: `src/processor.test.ts` (1053 lines)

**Test cases:**

1. `Basic Transfer Processing` > `should track approved transfers correctly` (line 41)
2. `Basic Transfer Processing` > `should not track unapproved transfers` (line 71)
3. `Snapshot Timing` > `should handle transfers before snapshot 1` (line 92)
4. `Snapshot Timing` > `should handle transfers between snapshots` (line 115)
5. `Snapshot Timing` > `should handle transfers after snapshot 2` (line 140)
6. `Blocklist` > `should include blocklisted addresses with penalties` (line 168)
7. `Blocklist Penalties` > `should calculate bounties for reporters` (line 204)
8. `Reward Calculation` > `should calculate rewards proportionally for single token` (line 266)
9. `Reward Calculation` > `should treat negative balances as zero when calculating eligible amounts` (line 317)
10. `Reward Calculation with Multiple Tokens` > `should calculate rewards proportionally for multiple tokens` (line 461)
11. `Process Liquidity Position` > `should correctly factor in liquidity changes` (line 503)
12. `Test processLpRange()` > `Happy` > `should process LP positions correctly when they are out of range` (line 661)
13. `Test processLpRange()` > `Happy` > `should not deduct balance when LP position is in range` (line 711)
14. `Test processLpRange()` > `Happy` > `should handle multiple LP positions for same account` (line 751)
15. `Test processLpRange()` > `Happy` > `should handle multiple tokens and accounts` (line 802)
16. `Test processLpRange()` > `Unhappy` > `should skip processing when pool tick is undefined` (line 861)
17. `Test processLpRange()` > `Unhappy` > `should skip LP positions with zero or negative value` (line 900)
18. `Test processLpRange()` > `Unhappy` > `should skip non related LP positions` (line 949)
19. `Test processLpRange()` > `Unhappy` > `should handle getPoolsTick failures gracefully` (line 989)
20. `Test processLpRange()` > `Unhappy` > `should process different snapshots independently` (line 1010)

---

## Findings

### A06-1 -- HIGH -- `isApprovedSource` has no dedicated tests

The `isApprovedSource` method (lines 64-126) contains significant branching logic: cache hits (line 66), direct REWARDS_SOURCES match (line 71), factory contract call with retry loop (lines 77-123), three distinct error short-message checks (lines 101-104), exponential backoff retry (lines 111-116), and the exhausted-retries fallback (lines 118-121). None of these paths are exercised in the test file. Every test in `beforeEach` (line 32) replaces the real `isApprovedSource` with a trivial stub via `processor.isApprovedSource = async (source) => ...`. The real implementation, including its caching behavior, retry logic, and error classification, is never tested.

### A06-2 -- MEDIUM -- `processTransfer` does not test the "unknown tokenAddress" throw path

Line 164-166 throws `new Error("No account balances found for token")` when `accountBalances` is undefined. This happens if `transfer.tokenAddress` passes the CYTOKENS check (line 130) but fails the `accountBalancesPerToken.get()` lookup. While the constructor initializes maps for all CYTOKENS, a case-sensitivity mismatch between the CYTOKENS address (mixed case at line 24 of config) and the lowercased key stored at line 55 could trigger this. The test for non-CYTOKEN addresses (returning early at line 131) exists implicitly in the negative-balance test, but no test directly verifies the throw at line 165.

### A06-3 -- MEDIUM -- `processLiquidityPositions` does not test the "unknown tokenAddress" throw path

Line 428-429 throws `new Error("No account balances found for token")` when the token address is not found in `accountBalancesPerToken`. No test triggers this error. A liquidity event with a tokenAddress that passes the CYTOKENS check but has a case mismatch against the map keys would hit this path.

### A06-4 -- MEDIUM -- `processLiquidityPositions` with V3 events not tested through the public API

The test at line 503 (`should correctly factor in liquidity changes`) only uses `__typename: "LiquidityV2Change"` events. The V3-specific code path in `processLiquidityPositions` (lines 452-469) that populates `lp3TrackList` is never exercised through `processLiquidityPositions` directly. The `processLpRange` tests set up `lp3TrackList` by directly manipulating private state. There is no integration test that feeds a `LiquidityV3Change` event through `processLiquidityPositions` and then calls `processLpRange` to verify the end-to-end flow.

### A06-5 -- MEDIUM -- `processLiquidityPositions` skipping ineligible tokens not tested

Line 416-418 returns early if the `tokenAddress` is not in CYTOKENS. No test verifies that a `LiquidityChange` event with an unrecognized token address is silently skipped.

### A06-6 -- MEDIUM -- `processTransfer` skipping ineligible tokens not tested

Line 130-132 returns early if the `tokenAddress` is not in CYTOKENS. No test provides a transfer with a token address outside the configured CYTOKENS list to verify this guard clause.

### A06-7 -- LOW -- `getUniqueAddresses` not independently tested

The method at lines 221-237 is invoked indirectly via `getEligibleBalances`, but there is no standalone test for it. Specifically, the behavior of including reporter addresses (line 225) even when they have no transfer history is not directly verified. The blocklist test at line 168 creates a processor with reports but only tests penalties/bounties, not the address set composition itself.

### A06-8 -- LOW -- `calculateTotalEligibleBalances` not independently tested

The method at lines 309-324 is only tested indirectly through `calculateRewards` and `calculateRewardsPoolsPertoken`. No test directly verifies its output for edge cases like all-zero balances or a single-token scenario.

### A06-9 -- LOW -- `getTokensWithBalance` not independently tested

The method at lines 326-335 filters tokens by checking if their total eligible balance is positive. No test directly verifies this filtering. Edge case: a token with exactly 0n total balance should be excluded, but this is not tested.

### A06-10 -- HIGH -- `calculateRewardsPoolsPertoken` division by zero when all balances are zero

At line 355, the method divides `sumOfAllBalances * ONE` by `totalBalances.get(token.address.toLowerCase())!`. If `getTokensWithBalance` returns a token (because its total balance passes the `> 0n` check), but `totalBalances` returns 0n for it (which should not happen given the filter, but the filter and total are computed separately), a division-by-zero would occur. More critically, if `sumOfInverseFractions` at line 366 is 0n (no tokens with balance), the division at line 375 would divide by zero. There is no test exercising the case where `rewardPool > 0` but all token balances are zero.

### A06-11 -- MEDIUM -- No test for transfer exactly at snapshot block number (boundary)

The snapshot condition at line 196 is `transfer.blockNumber <= this.snapshots[i]`. Tests cover blockNumber 50 (before snapshot 100), 150 (between 100 and 200), and 250 (after 200). But no test uses blockNumber exactly equal to a snapshot value (100 or 200) to verify the `<=` boundary condition. This is the critical off-by-one boundary.

### A06-12 -- MEDIUM -- No test for liquidity event exactly at snapshot block number (boundary)

Same as A06-11 but for `processLiquidityPositions` at line 448: `liquidityChangeEvent.blockNumber <= this.snapshots[i]`. No test uses a block number that exactly matches a snapshot value.

### A06-13 -- LOW -- No test for empty snapshots array

The constructor accepts `snapshots: number[]`. If an empty array is passed, `epochLength` would be 0, and `getEligibleBalances` at line 257 would attempt `0n / BigInt(0)` (division by zero) when computing the average. No test covers this edge case.

### A06-14 -- LOW -- No test for single snapshot

With a single snapshot, the average at line 257 divides by `BigInt(1)`, which works but represents a degenerate case. No test verifies this scenario.

### A06-15 -- LOW -- Multiple reports against same cheater not tested

The penalty loop at lines 272-291 iterates over all reports. If two reports target the same cheater, the penalty would be applied twice (doubling the average). No test exercises this edge case, which could result in a negative `final` balance (`average - 2*penalty + bounty`).

### A06-16 -- LOW -- Reporter who is also a cheater not tested

If an address appears as both a reporter (receiving bounty) and a cheater (receiving penalty) across different reports, both penalty and bounty would be applied. No test covers this overlap scenario.

### A06-17 -- LOW -- `processLpRange` clamping to zero not tested

Line 509-511 clamps `netBalanceAtSnapshots[i]` to zero if it goes negative after LP deductions. No test produces a scenario where the out-of-range LP value exceeds the snapshot balance, forcing the clamp to activate.

### A06-18 -- LOW -- `accountTransfers` tracking never verified

Lines 137-158 track per-account transfers (both `transfersIn` and `transfersOut`) in the `accountTransfers` map. No test ever reads or verifies the contents of this map. While it is a private field, the tracking logic is non-trivial and could silently break.

### A06-19 -- LOW -- `calculateRewards` with penalty-reduced balances not tested

`calculateRewards` (line 383) computes per-address reward shares from `balance.final` which includes penalties and bounties. No test combines a blocklist scenario with reward calculation to verify that penalized users receive zero rewards and bounty recipients receive increased rewards.

### A06-20 -- LOW -- No test for `processLiquidityPositions` with withdrawal exceeding balance (negative clamp)

Line 446 clamps `currentNetBalance` to zero if it goes negative. A scenario where a large withdrawal makes the net balance negative is not tested through `processLiquidityPositions`. The negative-balance tests only exist for `processTransfer`.
