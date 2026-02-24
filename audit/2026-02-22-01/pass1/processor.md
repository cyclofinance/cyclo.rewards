# Security Audit Pass 1 -- `src/processor.ts`

**Auditor Agent:** A06
**Date:** 2026-02-22
**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/processor.ts` (517 lines)

---

## Evidence of Thorough Reading

### Module

`Processor` class (exported), file: `src/processor.ts`

### Imports (lines 1--21)

- `createPublicClient`, `http`, `Address` from `viem`
- `REWARDS_SOURCES`, `FACTORIES`, `RPC_URL`, `isSameAddress`, `CYTOKENS` from `./config`
- `Transfer`, `AccountBalance`, `EligibleBalances`, `AccountTransfers`, `TokenBalances`, `RewardsPerToken`, `CyToken`, `LiquidityChange` from `./types`
- `ONE` from `./constants`
- `flare` from `viem/chains`
- `getPoolsTick` from `./liquidity`

### Class: `Processor` (line 23--516)

**Private fields (lines 24--36):**

| Field | Type | Line |
|---|---|---|
| `approvedSourceCache` | `Map<string, boolean>` | 24 |
| `accountBalancesPerToken` | `Map<string, Map<string, AccountBalance>>` | 25--28 |
| `accountTransfers` | `Map<string, AccountTransfers>` | 29 |
| `client` | (viem PublicClient, typed as `any`) | 30 |
| `lp3TrackList` | `Record<number, Map<string, {...}>>` | 31--36 |

**Constructor (lines 38--62):**
Parameters: `snapshots: number[]`, `epochLength: number`, `reports: { reporter: string; cheater: string }[]`, `client?: any`, `pools: \`0x${string}\`[]`

**Methods:**

| Method | Line | Visibility |
|---|---|---|
| `isApprovedSource(source: string, retries?: number): Promise<boolean>` | 64--126 | public (async) |
| `processTransfer(transfer: Transfer): Promise<void>` | 128--219 | public (async) |
| `getUniqueAddresses(): Promise<Set<string>>` | 221--237 | public (async) |
| `getEligibleBalances(): Promise<EligibleBalances>` | 239--307 | public (async) |
| `calculateTotalEligibleBalances(balances: EligibleBalances): Map<string, bigint>` | 309--324 | public |
| `getTokensWithBalance(balances: EligibleBalances): CyToken[]` | 326--335 | public |
| `calculateRewardsPoolsPertoken(balances: EligibleBalances, rewardPool: bigint): Map<string, bigint>` | 337--381 | public |
| `calculateRewards(rewardPool: bigint): Promise<RewardsPerToken>` | 383--412 | public (async) |
| `processLiquidityPositions(liquidityChangeEvent: LiquidityChange): Promise<void>` | 414--475 | public (async) |
| `processLpRange(): Promise<void>` | 478--515 | public (async) |

### Constants/Errors referenced

- `ONE` = `BigInt(10 ** 18)` (from `constants.ts`)
- `REWARD_POOL` = `BigInt(1000000000000000000000000)` (from `constants.ts`, 1M tokens * 1e18)
- `throw new Error("No account balances found for token")` (lines 165, 429)

---

## Security Findings

### A06-1 | MEDIUM | Division-by-zero when all eligible balances are zero or negative

**Location:** `calculateRewardsPoolsPertoken()`, lines 346--349 and 354--356.

**Description:** `sumOfAllBalances` is computed as the sum of all `totalBalances` values (line 346--349). If all tokens have a total eligible balance of zero (e.g., all users are penalized to zero, or no users hold any tokens), then `sumOfAllBalances` is `0n`. The code then divides by it at line 355:

```typescript
const tokenInverseFraction =
  (sumOfAllBalances * ONE) /
  totalBalances.get(token.address.toLowerCase())!;
```

Additionally, if a single token's total balance is `0n` but others are not, this specific line will also divide by zero. The `getTokensWithBalance` filter (line 344) only filters tokens where `totalBalances > 0n`, which protects against per-token zero. However, if `sumOfAllBalances` is zero, `tokensWithBalance` would be empty and the loop would not execute, so this specific path is safe in practice.

The more concrete risk is at line 375:

```typescript
const tokenReward =
  (tokenInverseFraction * rewardPool) / sumOfInverseFractions;
```

If `sumOfInverseFractions` were somehow zero (e.g., due to upstream bugs or unexpected edge cases), this would throw a BigInt division-by-zero error at runtime.

Similarly, in `calculateRewards()` at line 405:

```typescript
const reward =
  (balance.final *
    totalRewardsPerToken.get(token.address.toLowerCase())!) /
  totalBalances.get(token.address.toLowerCase())!;
```

If `totalBalances` for a token with balance is zero, this divides by zero. The `getTokensWithBalance` filter protects this path, but the protection relies on `getTokensWithBalance` and `calculateTotalEligibleBalances` being called consistently and returning consistent results. There is no explicit guard at the division sites.

**Impact:** Runtime crash (unhandled BigInt division-by-zero exception) during reward calculation, halting the pipeline. In a financial system, a crash at this stage could leave the system in a partial state or prevent distribution entirely.

**Recommendation:** Add explicit zero-checks before each BigInt division and handle the edge case gracefully (e.g., skip the token, or distribute zero rewards).

---

### A06-2 | MEDIUM | Token address case sensitivity mismatch between `processTransfer` and `accountBalancesPerToken` map lookup

**Location:** `processTransfer()`, lines 130 and 160--163.

**Description:** At line 130, the token filtering comparison lowercases both sides:

```typescript
if (!CYTOKENS.some((v) => v.address.toLowerCase() === transfer.tokenAddress.toLowerCase())) {
```

However, at line 160, the map lookup uses `transfer.tokenAddress` as-is (without lowercasing):

```typescript
const accountBalances = this.accountBalancesPerToken.get(
  transfer.tokenAddress
);
```

The map keys are initialized in the constructor (line 55) using `token.address.toLowerCase()`. If `transfer.tokenAddress` is not already lowercase, this lookup will fail and `accountBalances` will be `undefined`, causing the `throw new Error("No account balances found for token")` at line 165.

The same issue exists in `processLiquidityPositions()` at lines 416 and 424--426: the filter lowercases both sides, but the map lookup at line 425 uses `liquidityChangeEvent.tokenAddress` without lowercasing.

**Impact:** If transfer data arrives with mixed-case token addresses (which is common for Ethereum addresses), the processor would throw an error and halt. This could prevent reward calculations from completing. Whether this is exploitable depends on the data source (the scraper), but it represents a fragile assumption about input normalization.

**Recommendation:** Normalize `transfer.tokenAddress` and `liquidityChangeEvent.tokenAddress` to lowercase before any map lookups, or normalize once at the start of each method.

---

### A06-3 | MEDIUM | Penalty can exceed average balance, resulting in negative `final` balance included in reward calculations

**Location:** `getEligibleBalances()`, lines 285--289 and 302.

**Description:** In the penalty calculation (second pass), the penalty is set to the cheater's full `average`:

```typescript
const penalty = cheaterBalance.average;
```

And penalties accumulate:

```typescript
cheaterBalance.penalty += penalty;
```

If a cheater appears in multiple reports (reported by different reporters), the cumulative penalty will be `N * average`, where N is the number of reports. In the third pass (line 302):

```typescript
balance.final = balance.average - balance.penalty + balance.bounty;
```

This can produce a negative `final` value. Similarly, a cheater who is also a reporter for someone else could have a `bounty` that partially offsets, but the `final` can still go negative.

There is no floor of `0n` applied to `balance.final`. Negative final balances are then used in `calculateTotalEligibleBalances()` (line 317--320) and `calculateRewards()` (lines 401--406), which means:

1. The total eligible balance per token could be reduced by negative values, distorting reward distribution for all holders.
2. A user with negative `final` could receive a negative reward, which in BigInt arithmetic would produce a negative value in the output CSV -- potentially causing issues in on-chain distribution contracts.

**Impact:** Financial calculation corruption. Negative balances distort reward pools and could produce negative reward amounts in output CSVs. If the on-chain distribution contract does not handle negative values, this could cause transaction reverts or unexpected behavior.

**Recommendation:** Clamp `balance.final` to a minimum of `0n` after computing it. Consider also capping cumulative penalties at the cheater's average balance.

---

### A06-4 | LOW | Exhausted retries in `isApprovedSource` silently treats source as unapproved

**Location:** `isApprovedSource()`, lines 118--121.

**Description:** When all retry attempts are exhausted (e.g., due to persistent RPC issues), the method logs a message and returns `false`, caching the result:

```typescript
console.log(`Failed to check factory after ${retries} attempts:`, e);
this.approvedSourceCache.set(source.toLowerCase(), false);
return false;
```

This means a legitimate approved source (a pool created by an approved factory) would be permanently classified as unapproved for the rest of the processing run. All transfers from this source would be treated as ineligible, causing affected users to lose their reward eligibility.

The result is also cached, so even if the RPC recovers, subsequent calls for the same source will return `false` without re-checking.

**Impact:** Temporary RPC issues could cause legitimate approved sources to be permanently excluded, resulting in users losing reward eligibility for the entire epoch. This is a silent data integrity issue -- there is no error propagation to halt the pipeline or flag the issue.

**Recommendation:** Either throw an error to halt the pipeline when a factory check fails after all retries (making the failure explicit), or mark the cache entry as "uncertain" and retry on next access. At minimum, log at a warning/error level rather than `console.log`.

---

### A06-5 | LOW | `client` parameter typed as `any` bypasses type safety

**Location:** Constructor, line 42.

**Description:** The `client` parameter in the constructor is typed as `any`:

```typescript
client?: any,
```

This means any object can be passed as the client, and no type checking is performed on method calls to it (e.g., `this.client.readContract()` at line 79). A malicious or misconfigured client could return arbitrary data from `readContract`, potentially causing `isApprovedSource` to return incorrect results.

**Impact:** In production, the client is created internally from `RPC_URL` and this is low risk. In testing scenarios, a mock client with incorrect behavior could silently pass type checks. The broader concern is that the `any` type disables TypeScript's type safety guarantees for all interactions with the RPC client throughout the class.

**Recommendation:** Type the `client` parameter as `PublicClient` (from viem) or a suitable interface.

---

### A06-6 | LOW | `processLiquidityPositions` does not update `transfersInFromApproved` for LP positions

**Location:** `processLiquidityPositions()`, lines 442--443.

**Description:** When processing liquidity positions, only `currentNetBalance` is updated:

```typescript
ownerBalance.currentNetBalance += depositedBalanceChange;
```

But `transfersInFromApproved` and `transfersOut` are not updated. This means that `currentNetBalance` becomes decoupled from the formula used in `processTransfer` (line 191):

```typescript
toBalance.currentNetBalance =
  toBalance.transfersInFromApproved - toBalance.transfersOut;
```

If a liquidity event and a transfer event are both processed for the same account, the `processTransfer` method recalculates `currentNetBalance` from `transfersInFromApproved - transfersOut`, which would overwrite the liquidity adjustment. The correctness depends on the ordering guarantee that all transfers for a given token/account are processed before or after all liquidity events, and that `processTransfer`'s recalculation does not undo liquidity adjustments.

**Impact:** If event ordering assumptions are violated, liquidity position values could be silently dropped from balance calculations, leading to incorrect reward distributions. The severity depends on whether the pipeline guarantees correct ordering.

**Recommendation:** Document the ordering requirement explicitly, or refactor so that `currentNetBalance` is always computed from a single source of truth that includes both transfer and liquidity data.

---

### A06-7 | INFO | Quadratic iteration pattern in `processLpRange`

**Location:** `processLpRange()`, lines 478--515.

**Description:** The method iterates over all snapshots (30), then all tokens, then all accounts, then all LP v3 tracked positions:

```typescript
for (let i = 0; i < this.snapshots.length; i++) {       // 30
  for (const [token, account] of this.accountBalancesPerToken) {  // ~2 tokens
    for (const [owner, balance] of account) {              // N accounts
      for (const [key, lp] of lpTrackList) {               // M LP positions
```

The innermost loop uses `key.startsWith(idStart)` to match positions to account/token combos. This is O(snapshots * tokens * accounts * positions). For large numbers of accounts and LP positions, this could become a performance bottleneck. While not a security vulnerability per se, excessive runtime in a financial pipeline could be a denial-of-service concern or lead to timeouts.

**Impact:** Performance degradation with large datasets. Not a direct security issue but could affect pipeline reliability.

**Recommendation:** Consider indexing LP positions by `token-owner-pool` prefix in a nested map structure rather than doing string prefix matching in a flat iteration.

---

### A06-8 | INFO | Bounty percentage is hardcoded

**Location:** `getEligibleBalances()`, line 286.

**Description:** The bounty rate is hardcoded as 10%:

```typescript
const bounty = (penalty * 10n) / 100n;
```

This is not configurable and is embedded in business logic. While not a security issue, changes to the bounty rate would require code changes and redeployment.

**Impact:** No security impact. Noted for completeness as a maintainability observation.

---

## Summary

| ID | Severity | Title |
|----|----------|-------|
| A06-1 | MEDIUM | Division-by-zero when all eligible balances are zero or negative |
| A06-2 | MEDIUM | Token address case sensitivity mismatch in map lookups |
| A06-3 | MEDIUM | Negative `final` balance from excessive penalties distorts rewards |
| A06-4 | LOW | Exhausted retries silently treats approved source as unapproved |
| A06-5 | LOW | `client` parameter typed as `any` bypasses type safety |
| A06-6 | LOW | Liquidity positions and transfers use divergent balance tracking |
| A06-7 | INFO | Quadratic iteration pattern in `processLpRange` |
| A06-8 | INFO | Bounty percentage is hardcoded |

**Total findings: 8** (0 CRITICAL, 0 HIGH, 3 MEDIUM, 3 LOW, 2 INFO)
