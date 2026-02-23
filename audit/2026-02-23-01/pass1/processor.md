# Audit Report: Pass 1 (Security) -- `src/processor.ts`

**Agent:** A06
**Date:** 2026-02-23
**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/processor.ts` (517 lines)

---

## Evidence of Thorough Reading

### Class

- `Processor` (line 23)

### Private Fields

- `approvedSourceCache`: `Map<string, boolean>` (line 24)
- `accountBalancesPerToken`: `Map<string, Map<string, AccountBalance>>` (lines 25-28)
- `accountTransfers`: `Map<string, AccountTransfers>` (line 29)
- `client`: viem `PublicClient` (line 30)
- `lp3TrackList`: `Record<number, Map<string, { pool, value, lowerTick, upperTick }>>` (lines 31-36)

### Constructor

- `constructor(snapshots, epochLength, reports, client?, pools?)` (lines 38-62)

### Methods (with line numbers)

| Method | Line | Visibility |
|--------|------|------------|
| `isApprovedSource(source, retries?)` | 64 | `async` public |
| `processTransfer(transfer)` | 128 | `async` public |
| `getUniqueAddresses()` | 221 | `async` public |
| `getEligibleBalances()` | 239 | `async` public |
| `calculateTotalEligibleBalances(balances)` | 309 | public |
| `getTokensWithBalance(balances)` | 326 | public |
| `calculateRewardsPoolsPertoken(balances, rewardPool)` | 337 | public |
| `calculateRewards(rewardPool)` | 383 | `async` public |
| `processLiquidityPositions(liquidityChangeEvent)` | 414 | `async` public |
| `processLpRange()` | 478 | `async` public |

### Types/Interfaces Imported

- From `./types`: `Transfer`, `AccountBalance`, `EligibleBalances`, `AccountTransfers`, `TokenBalances`, `RewardsPerToken`, `CyToken`, `LiquidityChange`
- From `./config`: `REWARDS_SOURCES`, `FACTORIES`, `RPC_URL`, `isSameAddress`, `CYTOKENS`
- From `./constants`: `ONE` (`BigInt(10 ** 18)`)
- From `viem`: `createPublicClient`, `http`, `Address`
- From `viem/chains`: `flare`
- From `./liquidity`: `getPoolsTick`

### Constants Referenced

- `ONE` = `BigInt(10 ** 18)` (from constants.ts:1)
- `REWARD_POOL` = `BigInt(1000000000000000000000000)` (1M tokens at 1e18, from constants.ts:2)

---

## Security Findings

---

### A06-1: Inconsistent Address Case Normalization in `processTransfer` Map Lookups

**Severity:** CRITICAL

**Location:** Lines 160-162 (`processTransfer`)

**Description:**

When looking up `accountBalancesPerToken`, the code uses `transfer.tokenAddress` directly without `.toLowerCase()`:

```typescript
const accountBalances = this.accountBalancesPerToken.get(
  transfer.tokenAddress   // <-- NOT lowercased
);
```

However, in the constructor (line 55) the map keys are set with `.toLowerCase()`:

```typescript
this.accountBalancesPerToken.set(token.address.toLowerCase(), balanceMap);
```

If `transfer.tokenAddress` arrives with mixed-case (e.g. EIP-55 checksummed addresses like `"0x19831cfB53A0dbeAD..."` from config), the `Map.get()` will not match the lowercased key, returning `undefined`. This would cause the subsequent `if (!accountBalances)` guard on line 164 to throw `"No account balances found for token"`, halting processing for valid transfers.

The early guard on line 130 does compare with `.toLowerCase()` on both sides, so the token filter itself is consistent. But after passing that filter, the lookup on line 160 omits the normalization, meaning a valid transfer that passed the filter would then fail the map lookup.

**Recommendation:** Change line 160-162 to:

```typescript
const accountBalances = this.accountBalancesPerToken.get(
  transfer.tokenAddress.toLowerCase()
);
```

---

### A06-2: Inconsistent Address Case Normalization in `processLiquidityPositions` Map Lookup

**Severity:** CRITICAL

**Location:** Lines 424-425 (`processLiquidityPositions`)

**Description:**

Same pattern as A06-1. The lookup uses `liquidityChangeEvent.tokenAddress` without `.toLowerCase()`:

```typescript
const accountBalances = this.accountBalancesPerToken.get(
  liquidityChangeEvent.tokenAddress   // <-- NOT lowercased
);
```

While the constructor stored keys lowercased. If liquidity events arrive with mixed-case token addresses (which pass the earlier filter on line 416 that does use `.toLowerCase()`), the map lookup silently fails and throws on line 429.

**Recommendation:** Change to `liquidityChangeEvent.tokenAddress.toLowerCase()`.

---

### A06-3: Inconsistent Address Case Normalization for `owner` in `processLiquidityPositions`

**Severity:** HIGH

**Location:** Lines 433-434, 442, 474 (`processLiquidityPositions`)

**Description:**

The `owner` field from `liquidityChangeEvent.owner` is used as a map key without lowercasing:

```typescript
if (!accountBalances.has(liquidityChangeEvent.owner)) {
  accountBalances.set(liquidityChangeEvent.owner, { ... });
}
const ownerBalance = accountBalances.get(liquidityChangeEvent.owner)!;
```

Meanwhile, in `processTransfer` (lines 169-184), `transfer.to` and `transfer.from` are used directly as keys. In `getEligibleBalances` (line 255), `address.toLowerCase()` is used for lookup. This means if account addresses in the `accountBalancesPerToken` inner map were stored with different cases by `processTransfer` vs `processLiquidityPositions`, they would become separate entries and their balances would not aggregate correctly. The balance for an LP position could be stored under a different key than the balance for direct transfers, resulting in incorrect reward calculations.

Whether this is exploitable depends on whether the upstream data (`scraper.ts`) normalizes addresses before feeding them to the processor. If the subgraph returns checksummed addresses for some events and lowercased for others, this is a real data-splitting bug.

**Recommendation:** Normalize all address keys to lowercase before using them as map keys in both `processTransfer` and `processLiquidityPositions`.

---

### A06-4: Division by Zero in `calculateRewardsPoolsPertoken` When `sumOfInverseFractions` is Zero

**Severity:** LOW

**Location:** Line 375

**Description:**

```typescript
const tokenReward =
  (tokenInverseFraction * rewardPool) / sumOfInverseFractions;
```

If `tokensWithBalance` is empty (no tokens have positive balances), the loop on lines 353-361 never executes, and `sumOfInverseFractions` from line 364-366 would be `0n` (the initial value of `reduce`). BigInt division by `0n` throws a `RangeError`. However, this scenario is partially guarded because `tokensWithBalance` being empty means the loop on lines 370-378 also never executes, so division never occurs. But if `sumOfInverseFractions` were zero due to some other edge case (e.g., all individual inverse fractions being zero, which is impossible given the math), the division would throw.

The real risk is marginal here because the code path is protected by the empty-array case, but there is no explicit guard against it.

**Recommendation:** Add an early return if `tokensWithBalance` is empty or `sumOfInverseFractions` is `0n`.

---

### A06-5: Division by Zero in `calculateRewards` When `totalBalances` for a Token is Zero

**Severity:** MEDIUM

**Location:** Lines 402-405

**Description:**

```typescript
const reward =
  (balance.final *
    totalRewardsPerToken.get(token.address.toLowerCase())!) /
  totalBalances.get(token.address.toLowerCase())!;
```

The denominator `totalBalances.get(token.address.toLowerCase())` could be `0n` if all `final` balances for a token sum to zero (e.g., all accounts have their full balance penalized). The `getTokensWithBalance` method (line 330) guards with `> 0n`, but it checks `totalBalance > 0n`, which sums all `final` values. If penalties cause all individual `final` values to become zero or negative, the total could be zero. The method `getEligibleBalances` does not clamp `final` to a minimum of `0n` (line 302: `balance.final = balance.average - balance.penalty + balance.bounty`), so negative final values are possible.

If negative finals sum to exactly zero (or a token has all-zero finals), this is a division by zero.

**Recommendation:** Clamp `balance.final` to `0n` minimum in `getEligibleBalances`, or add an explicit zero-check before division in `calculateRewards`.

---

### A06-6: Negative `final` Balance in `getEligibleBalances` Causes Negative Rewards

**Severity:** HIGH

**Location:** Line 302

**Description:**

```typescript
balance.final = balance.average - balance.penalty + balance.bounty;
```

If a cheater has a large penalty applied (penalty = average, from line 285), and the cheater is also reported multiple times by different reporters, `penalty` accumulates (line 288: `cheaterBalance.penalty += penalty`), while `bounty` might be smaller. This means `balance.final` can become negative.

A negative `final` balance flows into:
1. `calculateTotalEligibleBalances` (line 319) -- reducing the total eligible balance for the token.
2. `calculateRewards` (line 403) -- producing a negative `reward` for the cheater address.

Negative rewards are nonsensical and could cause downstream issues in CSV output and on-chain distribution. Additionally, the negative values reduce the total eligible balance, inflating rewards for all other participants beyond the intended pool.

**Recommendation:** Clamp `balance.final` to `max(0n, ...)` on line 302.

---

### A06-7: Multiple Reports Against Same Cheater Cause Excessive Penalty

**Severity:** MEDIUM

**Location:** Lines 272-291

**Description:**

The penalty loop iterates over all reports. If the same cheater appears in multiple reports (e.g., reported by two different reporters), the penalty is applied additively each time:

```typescript
const penalty = cheaterBalance.average;
cheaterBalance.penalty += penalty;
```

With two reports, the cheater's penalty becomes `2 * average`, and their `final` = `average - 2*average + bounty` which is deeply negative. This compounds with A06-6. While this may be intentional design (severe punishment for multiple reports), combined with the lack of clamping it creates negative balances that distort the reward pool math.

**Recommendation:** Document whether multiple-report additive penalties are intentional. If not, use `cheaterBalance.penalty = cheaterBalance.average` (idempotent). Either way, clamp `final` to `0n`.

---

### A06-8: `transfer.to` and `transfer.from` Used Without Normalization in `accountTransfers` Map

**Severity:** LOW

**Location:** Lines 138-158 (`processTransfer`)

**Description:**

The `accountTransfers` map uses `transfer.to` and `transfer.from` as keys without `.toLowerCase()`. If the same address appears with different casing across different transfers, they would be stored as separate entries. This map is used for `AccountTransfers` tracking (transfer-in/transfer-out details), which feeds into account summaries. This is a data consistency issue rather than a direct security issue, but could lead to incomplete transfer records for an account.

**Recommendation:** Normalize to `.toLowerCase()` when using addresses as map keys.

---

### A06-9: Non-null Assertion on Potentially Missing Map Entries

**Severity:** LOW

**Location:** Lines 330, 356, 371-372, 404-405

**Description:**

Multiple non-null assertions (`!`) are used on `Map.get()` results:

- Line 330: `totalBalances.get(token.address.toLowerCase())!` -- could be `undefined` if `calculateTotalEligibleBalances` did not set an entry for this token.
- Line 356: `totalBalances.get(token.address.toLowerCase())!` -- same.
- Line 404: `totalRewardsPerToken.get(token.address.toLowerCase())!`
- Line 405: `totalBalances.get(token.address.toLowerCase())!`

While the current control flow makes these unlikely to be `undefined` (the methods iterate over the same `CYTOKENS` array), any future change to the iteration logic or filtering could introduce `undefined` dereferences that would throw at runtime without helpful error messages.

**Recommendation:** Replace `!` assertions with explicit checks or use a helper that throws a descriptive error.

---

### A06-10: `isApprovedSource` Silently Returns `false` After Exhausting Retries

**Severity:** MEDIUM

**Location:** Lines 119-121

**Description:**

When all retries are exhausted due to transient errors (e.g., RPC rate limiting), the method caches and returns `false`:

```typescript
console.log(`Failed to check factory after ${retries} attempts:`, e);
this.approvedSourceCache.set(source.toLowerCase(), false);
return false;
```

This means transfers from a legitimate approved source (a pool created by an approved factory) could be marked as non-approved due to transient RPC failures. Once cached as `false`, the source will never be rechecked. This causes the recipient's eligible balance to not credit the transfer, permanently reducing their rewards for the epoch.

The consequence is silent under-accounting of rewards for affected users. Since the cache persists for the lifetime of the `Processor` instance, this cannot self-heal.

**Recommendation:** Consider not caching the `false` result on transient failures, or throwing an error to halt processing rather than silently under-crediting.

---

### A06-11: `epochLength` Parameter Not Validated Against `snapshots.length`

**Severity:** MEDIUM

**Location:** Lines 39-40 (constructor), line 173, line 256

**Description:**

The constructor accepts `snapshots: number[]` and `epochLength: number` as independent parameters. The `epochLength` is used to allocate `netBalanceAtSnapshots` arrays (line 173: `new Array(this.epochLength).fill(0n)`), while `this.snapshots.length` is used to iterate over them (line 195: `for (let i = 0; i < this.snapshots.length; i++)`).

If `epochLength < snapshots.length`, the array is too short and writes at index `i` (line 197) would go out-of-bounds, creating `undefined` entries (JavaScript does not throw on out-of-bounds array assignment, it extends the array with holes). Conversely, if `epochLength > snapshots.length`, extra array slots are never populated and remain `0n`, diluting the average calculation on line 257.

In `getEligibleBalances` (line 256), the fallback array is also sized to `epochLength`:
```typescript
const snapshots = balance?.netBalanceAtSnapshots ?? new Array<bigint>(this.epochLength).fill(0n);
```

And the average is computed as:
```typescript
const average = snapshots.reduce((acc, val) => acc + val, 0n) / BigInt(snapshots.length);
```

This uses the array's actual `.length` (which could differ from `this.snapshots.length` if out-of-bounds writes occurred).

**Recommendation:** Assert in the constructor that `epochLength === snapshots.length`, or eliminate `epochLength` entirely and derive it from `snapshots.length`.

---

### A06-12: `lp3TrackList` Keyed by Snapshot Block Number -- Potential Missing Key

**Severity:** LOW

**Location:** Lines 462, 482

**Description:**

`this.lp3TrackList` is a `Record<number, Map<...>>` initialized for each snapshot (lines 59-61). In `processLiquidityPositions` (line 462), it accesses `this.lp3TrackList[this.snapshots[i]]`, which will always exist because the constructor initialized it for all snapshot block numbers. In `processLpRange` (line 482), the same pattern is used.

However, if `snapshots` contains duplicate block numbers (possible since they are randomly generated), both entries would map to the same key in the `Record`, which is fine for `Record` semantics. No actual issue, but worth noting that duplicate snapshots are not explicitly prevented.

**Recommendation:** Consider deduplicating snapshots in the constructor, or documenting that duplicates are acceptable.

---

### A06-13: `processLpRange` Iterates All LP Positions for All Token/Account Combinations

**Severity:** INFO

**Location:** Lines 492-508

**Description:**

The `processLpRange` method has a 4-level nested loop: snapshots x tokens x accounts x LP positions. For each combination, it checks if the LP position key starts with a token-owner prefix (line 502). This is an O(S * T * A * L) operation where S=snapshots, T=tokens, A=accounts, L=LP positions. While this is not a security vulnerability, for large numbers of accounts and LP positions this could be slow and is architecturally fragile. A stale or incorrect prefix match could cause deductions to be applied to the wrong account/token combination.

**Recommendation:** Consider indexing LP positions by token and owner for direct lookup rather than prefix matching on string keys.

---

### A06-14: No Input Validation on `transfer.value` or `liquidityChangeEvent.depositedBalanceChange`

**Severity:** LOW

**Location:** Lines 135, 422

**Description:**

Both `BigInt(transfer.value)` (line 135) and `BigInt(liquidityChangeEvent.depositedBalanceChange)` (line 422) will throw a `SyntaxError` if the string is not a valid integer representation. While this is arguably correct fail-fast behavior, there is no graceful error handling or validation that the value is non-negative for `transfer.value` (a negative transfer value would be nonsensical and could manipulate balances).

**Recommendation:** Validate that `transfer.value` parses to a non-negative BigInt.

---

## Summary

| ID | Severity | Summary |
|----|----------|---------|
| A06-1 | CRITICAL | `processTransfer` looks up `accountBalancesPerToken` without lowercasing `tokenAddress` |
| A06-2 | CRITICAL | `processLiquidityPositions` same missing `.toLowerCase()` on token address lookup |
| A06-3 | HIGH | `processLiquidityPositions` uses `owner` without case normalization as map key |
| A06-4 | LOW | Potential division by zero if `sumOfInverseFractions` is `0n` |
| A06-5 | MEDIUM | Division by zero in `calculateRewards` if `totalBalances` for a token is `0n` |
| A06-6 | HIGH | `final` balance can go negative, producing negative rewards and inflating others' rewards |
| A06-7 | MEDIUM | Multiple reports against same cheater cause penalty > average, compounding A06-6 |
| A06-8 | LOW | `accountTransfers` map keys not case-normalized |
| A06-9 | LOW | Non-null assertions (`!`) on `Map.get()` with no defensive checks |
| A06-10 | MEDIUM | Transient RPC failures permanently cached as `false`, silently under-crediting rewards |
| A06-11 | MEDIUM | `epochLength` not validated against `snapshots.length`, enabling array mismatch |
| A06-12 | LOW | Duplicate snapshot block numbers not prevented |
| A06-13 | INFO | O(S*T*A*L) nested loops in `processLpRange` with string prefix matching |
| A06-14 | LOW | No validation that `transfer.value` is non-negative |

**Total findings:** 14
- CRITICAL: 2
- HIGH: 2
- MEDIUM: 4
- LOW: 5
- INFO: 1
