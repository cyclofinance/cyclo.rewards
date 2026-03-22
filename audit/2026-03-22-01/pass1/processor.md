# Pass 1: Security Review of `src/processor.ts`

**Auditor:** A07
**Date:** 2026-03-22
**File:** `src/processor.ts` (656 lines)

## Evidence of Reading

**Module:** `Processor` class (exported) -- core reward calculation engine that replays transfer and liquidity events to compute per-account eligible balances at snapshot blocks and distributes the reward pool.

### Imports (lines 6-27)
- `Address`, `PublicClient` from `viem`
- `REWARDS_SOURCES`, `FACTORIES`, `isSameAddress`, `CYTOKENS`, `scaleTo18` from `./config`
- `Transfer`, `AccountBalance`, `EligibleBalances`, `TokenBalances`, `RewardsPerToken`, `CyToken`, `LiquidityChange`, `LiquidityChangeType`, `LpV3Position`, `BlocklistReport` from `./types`
- `ONE_18`, `BOUNTY_PERCENT`, `RETRY_BASE_DELAY_MS` from `./constants`
- `getPoolsTick` from `./liquidity`

### Class Fields (lines 34-46)
- `approvedSourceCache`: `Map<string, boolean>` -- line 35
- `accountBalancesPerToken`: `Map<string, Map<string, AccountBalance>>` -- line 37
- `client`: `PublicClient` -- line 42
- `lp3TrackList`: `Record<number, Map<string, LpV3Position>>` -- line 44
- `liquidityEvents`: `Map<string, Map<string, Map<string, LiquidityChange>>>` -- line 46

### Constructor (lines 54-72)
- Parameters: `snapshots: number[]`, `reports: BlocklistReport[]`, `client: PublicClient`, `pools: 0x${string}[]`
- Initializes `accountBalancesPerToken` for each CYTOKEN (lines 63-66)
- Initializes `lp3TrackList` for each snapshot (lines 69-71)

### Methods
| Method | Line | Visibility | Async |
|--------|------|-----------|-------|
| `isApprovedSource(source, retries)` | 81 | public | yes |
| `updateSnapshots(balance, blockNumber)` | 147 | private | no |
| `processTransfer(transfer)` | 162 | public | yes |
| `transferIsDeposit(transfer)` | 241 | public | no |
| `transferIsWithdraw(transfer)` | 264 | public | no |
| `getUniqueAddresses()` | 286 | public | no |
| `getEligibleBalances()` | 309 | public | yes |
| `calculateTotalEligibleBalances(balances)` | 386 | public | no |
| `getTokensWithBalance(balances)` | 408 | public | no |
| `calculateRewardsPoolsPerToken(balances, rewardPool)` | 426 | public | no |
| `calculateRewards(rewardPool)` | 477 | public | yes |
| `organizeLiquidityPositions(liquidityChangeEvent)` | 513 | public | no |
| `processLiquidityPositions(liquidityChangeEvent)` | 545 | public | no |
| `processLpRange()` | 618 | public | yes |

### Constants/Types Used
- `ONE_18` = `10n ** 18n`
- `BOUNTY_PERCENT` = `10n`
- `RETRY_BASE_DELAY_MS` = `500`
- `CYTOKENS`: array of 3 tokens (cysFLR 18 dec, cyWETH 18 dec, cyFXRP 6 dec)

---

## Findings

### F-01: Address case normalization inconsistency in `processTransfer` [MEDIUM]

**Location:** Lines 180-181, 188-189, 198, 214, 232-233

**Description:** `processTransfer` uses `transfer.to` and `transfer.from` as Map keys without calling `.toLowerCase()`. In contrast, `processLiquidityPositions` (line 564) normalizes `owner` to lowercase, `transferIsDeposit` (line 244) and `transferIsWithdraw` (line 267) normalize to lowercase, and `getEligibleBalances` (line 325) looks up balances via `address.toLowerCase()`.

If a transfer arrives with a mixed-case address (e.g., EIP-55 checksummed), the balance would be stored under the mixed-case key. Then:
1. `processLiquidityPositions` would create a SEPARATE entry under the lowercase key for the same account.
2. `getEligibleBalances` line 325 would look up `address.toLowerCase()` which would not find the mixed-case key, silently zeroing that account's balance.

**Current mitigation:** The Goldsky subgraph currently returns all-lowercase addresses, so this is a latent bug. However, the code does not enforce this invariant at the boundary (the scraper's `mapSubgraphTransfer` at scraper.ts:102-104 passes through addresses verbatim without normalizing).

**Impact:** If any data source returns mixed-case addresses, affected accounts would lose their reward eligibility entirely. Balances would be silently split across two Map entries.

**Recommendation:** Normalize `transfer.from` and `transfer.to` to lowercase at the start of `processTransfer`, or add normalization in the scraper's mapping functions.

---

### F-02: No floor clamp on `final` balance allows negative rewards [MEDIUM]

**Location:** Line 373

**Description:** `balance.final = balance.average - balance.penalty + balance.bounty` can produce a negative value when:
- The same cheater is reported by multiple reporters (penalty accumulates via `+=` at line 359)
- A reporter who received bounties is themselves penalized

There is no guard against `final` going negative. Negative `final` propagates to `final18` (line 374), then to per-address rewards (line 497). The `filterZeroRewards` function (pipeline.ts:55-56) only filters `=== 0n`, not `< 0n`, so negative rewards would appear in the output CSV.

**Current mitigation:** The current blocklist has no duplicate cheaters. But there is no programmatic enforcement -- `parseBlocklist` does not deduplicate, and the processor does not check for duplicate cheater entries.

**Impact:** A negative reward in the output CSV would cause undefined behavior in the downstream distribution tool. It could also reduce the total rewards distributed to honest participants (since negative values reduce the sum used in the tolerance check at index.ts:171).

**Recommendation:** Clamp `balance.final` to `0n` at line 373: `balance.final = max(0n, balance.average - balance.penalty + balance.bounty)`. Alternatively, add duplicate-cheater detection in `parseBlocklist` or at penalty application time.

---

### F-03: `getUniqueAddresses` does not normalize addresses from `accountBalancesPerToken` [LOW]

**Location:** Line 298

**Description:** `getUniqueAddresses` adds addresses from `accountBalancesPerToken` without `.toLowerCase()` (line 298), while reporter addresses from `this.reports` ARE normalized (line 290). If `processTransfer` stores a mixed-case key (per F-01), this mixed-case address enters `allAddresses`. Then `getEligibleBalances` at line 325 does `accountBalances.get(address.toLowerCase())`, which would not match the mixed-case key stored by `processTransfer`.

This is a downstream consequence of F-01 but represents a separate normalization gap.

**Impact:** Same as F-01 -- balance lookup misses for mixed-case addresses.

**Recommendation:** Normalize at line 298: `allAddresses.add(address.toLowerCase())`.

---

### F-04: Penalty redistribution leaks value from the reward pool [LOW]

**Location:** Lines 356-360

**Description:** When a cheater is penalized, `penalty = cheaterBalance.average` (100%) is deducted from their final balance, but only `bounty = penalty * 10n / 100n` (10%) is awarded to the reporter. The remaining 90% of the penalty is effectively removed from circulation -- it is not redistributed to other participants.

This is by design (per the CLAUDE.md: "A bounty portion goes to the reporter, remainder goes back to the reward pool"), but the "goes back to the reward pool" part only works implicitly: the penalty reduces the total eligible balance, which increases per-unit reward for everyone else. However, because the inverse-fraction weighting in `calculateRewardsPoolsPerToken` operates on token-level totals, the redistribution is not perfectly proportional -- it favors tokens where the penalized account had less balance.

**Impact:** Mild distortion of cross-token reward allocation when penalties are applied. Not a bug per se, but the "goes back to the reward pool" description in CLAUDE.md is imprecise.

**Recommendation:** Document the actual redistribution mechanism. Consider whether the distortion is acceptable given the current penalty magnitudes.

---

### F-05: `isApprovedSource` returns `false` without checking when `retries=0` [INFO]

**Location:** Line 140

**Description:** If `isApprovedSource` is called with `retries=0`, the for loop at line 94 never executes, and the function falls through to `return false` at line 140 without performing any factory check. The address would be cached as not-approved without verification.

**Current mitigation:** The default is `retries=8` and no caller overrides it. This is dead code in the current codebase.

**Impact:** None in practice. Theoretical silent under-crediting if a caller passes `retries=0`.

**Recommendation:** Add a guard: `if (retries < 1) throw new Error("retries must be >= 1")`.

---

### F-06: `getTokensWithBalance` non-null assertion on potentially missing map entry [INFO]

**Location:** Line 412

**Description:** `totalBalances.get(token.address.toLowerCase())!` uses a non-null assertion. If `calculateTotalEligibleBalances` did not set a value for a token (e.g., if `balances` is missing a token entry), this would be `undefined!`, and comparing `undefined > 0n` throws a TypeError at runtime.

**Current mitigation:** `getEligibleBalances` initializes entries for all CYTOKENS, so the key always exists in practice. `calculateTotalEligibleBalances` also iterates CYTOKENS, but skips tokens where `balances.get(...)` returns falsy, so a missing entry would not be set in `totalBalances`.

**Impact:** Would only manifest if `getTokensWithBalance` is called with a manually constructed `balances` map missing a token. Crash, not silent corruption.

**Recommendation:** Use `(totalBalances.get(token.address.toLowerCase()) ?? 0n) > 0n` for defensive safety.

---

### F-07: `processLpRange` skips out-of-range check when pool tick is unavailable [INFO]

**Location:** Line 639

**Description:** In `processLpRange`, if `poolsTicks[pool]` is `undefined` (pool not deployed at snapshot block, or multicall failure for a non-existent pool), the position is silently kept -- the account retains the LP balance in their snapshot even though the position's in-range status is unknown.

**Current mitigation:** `getPoolsTick` in `liquidity.ts` throws for pools that exist (have code) but fail to return tick data. It only silently skips pools with no deployed code. A pool with no code at a given block couldn't have had positions created against it, so this is a safe no-op.

**Impact:** None in normal operation. If a pool is deployed mid-epoch and has positions before the pool exists at earlier snapshots, those earlier snapshots would retain the balance rather than deducting it.

**Recommendation:** Consider logging when a tracked LP position references a pool with no tick data.
