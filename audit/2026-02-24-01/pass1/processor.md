# Security Audit - Pass 1: processor.ts

**Auditor:** A06
**Date:** 2026-02-24
**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/processor.ts`
**Lines:** 1-613

---

## 1. Evidence of Thorough Reading

### Class Name
- `Processor` (line 25)

### Private Fields
| Field | Type | Line |
|-------|------|------|
| `approvedSourceCache` | `Map<string, boolean>` | 26 |
| `accountBalancesPerToken` | `Map<string, Map<string, AccountBalance>>` | 27-30 |
| `accountTransfers` | `Map<string, AccountTransfers>` | 31 |
| `client` | (inferred from `createPublicClient`) | 32 |
| `lp3TrackList` | `Record<number, Map<string, {pool, value, lowerTick, upperTick}>>` | 33-38 |
| `liquidityEvents` | `Map<string, Map<string, Map<string, LiquidityChange>>>` | 39 |
| `snapshots` (via constructor) | `number[]` | 42 |
| `epochLength` (via constructor) | `number` | 43 |
| `reports` (via constructor) | `{ reporter: string; cheater: string }[]` | 44 |
| `pools` (via constructor) | `` `0x${string}`[] `` | 46 |

### Constructor
- Lines 41-65
- Parameters: `snapshots: number[]`, `epochLength: number`, `reports` (default `[]`), `client?: any`, `pools` (default `[]`)
- Initializes `this.client` from parameter or creates a default viem public client
- Initializes `accountBalancesPerToken` maps for each `CYTOKEN` (lines 56-59)
- Initializes `lp3TrackList` with empty Map per snapshot (lines 62-64)

### Methods (with line numbers)
| Method | Visibility | Line | Async |
|--------|-----------|------|-------|
| `isApprovedSource(source, retries?)` | public (async) | 67 | Yes |
| `processTransfer(transfer)` | public (async) | 129 | Yes |
| `transferIsDeposit(transfer)` | public | 247 | No |
| `transferIsWithdraw(transfer)` | public | 265 | No |
| `getUniqueAddresses()` | public (async) | 283 | Yes |
| `getEligibleBalances()` | public (async) | 301 | Yes |
| `calculateTotalEligibleBalances(balances)` | public | 373 | No |
| `getTokensWithBalance(balances)` | public | 390 | No |
| `calculateRewardsPoolsPertoken(balances, rewardPool)` | public | 401 | No |
| `calculateRewards(rewardPool)` | public (async) | 447 | Yes |
| `organizeLiquidityPositions(liquidityChangeEvent)` | public (async) | 478 | Yes |
| `processLiquidityPositions(liquidityChangeEvent)` | public (async) | 506 | Yes |
| `processLpRange()` | public (async) | 575 | Yes |

---

## 2. Security Findings

### A06-1: Case normalization mismatch for account addresses in accountBalancesPerToken [HIGH]

**Severity:** HIGH

**Lines:** 139-140, 145, 151-152, 157, 170-171, 178-179, 188, 211, 243-244 vs. 317, 525-526, 535, 571

**Description:** In `processTransfer()`, the `transfer.to` and `transfer.from` values are used as map keys in `accountBalancesPerToken` **without** `.toLowerCase()` normalization (lines 170, 171, 178, 179, 188, 211, 243, 244). However, in `getEligibleBalances()` (line 317), addresses are looked up with `.toLowerCase()`. Similarly, in `processLiquidityPositions()`, the owner is stored with `.toLowerCase()` (line 525, 571).

If the subgraph ever returns mixed-case (EIP-55 checksummed) addresses, or if different events for the same account arrive with different casing, this would cause:
1. Duplicate entries in the balance map for the same account (one lowercase, one mixed-case)
2. `getEligibleBalances()` at line 317 would only find the lowercase entry, silently losing the mixed-case entry's balance
3. An account's rewards could be partially or completely lost

The `accountTransfers` map (lines 139-140, 151-152) also uses raw `transfer.to`/`transfer.from` without normalization, creating the same fragmentation risk, though `accountTransfers` is not used in reward calculations.

**Recommendation:** Normalize `transfer.to` and `transfer.from` to lowercase at the top of `processTransfer()` before any map operations, or add a guard that normalizes at the point of map insertion. For example:
```typescript
const to = transfer.to.toLowerCase();
const from = transfer.from.toLowerCase();
```
Then use `to` and `from` throughout the method.

---

### A06-2: Case normalization mismatch in processLiquidityPositions - owner lookup uses raw value [HIGH]

**Severity:** HIGH

**Lines:** 525, 535, 571

**Description:** In `processLiquidityPositions()`, the `owner` variable is correctly set to `liquidityChangeEvent.owner.toLowerCase()` at line 525, and is used for the `.has()` check (line 526) and the final `.set()` (line 571). However, at line 535, the code retrieves the balance using the **raw, un-normalized** `liquidityChangeEvent.owner`:

```typescript
const owner = liquidityChangeEvent.owner.toLowerCase();  // line 525
if (!accountBalances.has(owner)) {                        // line 526 - uses normalized
  accountBalances.set(owner, { ... });                    // line 527 - uses normalized
}

const ownerBalance = accountBalances.get(liquidityChangeEvent.owner)!;  // line 535 - RAW!
```

If `liquidityChangeEvent.owner` has mixed case (e.g., checksummed), line 535 will fail to find the entry that was just inserted at line 527 with the lowercase key. The non-null assertion (`!`) would then produce `undefined`, and subsequent operations (`ownerBalance.currentNetBalance`) would throw a runtime error. More subtly, if a prior `processTransfer()` call already inserted the entry with the raw-cased key and `processLiquidityPositions` then inserts another entry with the lowercase key, there will be two entries for the same account.

**Recommendation:** Change line 535 to use the normalized `owner` variable:
```typescript
const ownerBalance = accountBalances.get(owner)!;
```

---

### A06-3: epochLength vs snapshots.length divergence risk [MEDIUM]

**Severity:** MEDIUM

**Lines:** 42-43, 174, 182, 318, 530

**Description:** The constructor accepts both `snapshots: number[]` and `epochLength: number` as separate parameters. `epochLength` is used to size `netBalanceAtSnapshots` arrays (lines 174, 182, 530), while `this.snapshots.length` is used to iterate over them (lines 203, 225, 237, 544, 577). If `epochLength !== snapshots.length`, then:
- If `epochLength < snapshots.length`: the loop at lines 203-207 writes beyond the array bounds (JavaScript silently extends arrays with sparse entries, which become `undefined` rather than `0n`, causing BigInt arithmetic to fail later)
- If `epochLength > snapshots.length`: extra array slots are never written and remain `0n`, diluting the average balance calculation at line 319

In practice, all call sites pass `SNAPSHOTS.length` as `epochLength`, so this is not currently exploitable. However, the API permits the mismatch and there is no assertion enforcing equality.

**Recommendation:** Either remove `epochLength` and derive it as `this.snapshots.length`, or add an assertion in the constructor:
```typescript
if (epochLength !== snapshots.length) {
  throw new Error(`epochLength (${epochLength}) must equal snapshots.length (${snapshots.length})`);
}
```

---

### A06-4: Division by zero in calculateRewardsPoolsPertoken when a token has zero total balance [MEDIUM]

**Severity:** MEDIUM

**Lines:** 418-420

**Description:** In `calculateRewardsPoolsPertoken()`, the code computes:
```typescript
const tokenInverseFraction =
  (sumOfAllBalances * ONE) /
  totalBalances.get(token.address.toLowerCase())!;
```

The `getTokensWithBalance()` filter (line 408) ensures only tokens with `> 0n` total balance are processed. However, `getTokensWithBalance` itself at line 394 uses a non-null assertion on `totalBalances.get(...)!` which could fail if the map somehow does not contain that token. More critically, if `sumOfInverseFractions` at line 430 sums to `0n` (theoretically possible if all tokenInverseFractions are `0n`, which would only happen if `sumOfAllBalances` is `0n`), then line 439 divides by zero:
```typescript
const tokenReward = (tokenInverseFraction * rewardPool) / sumOfInverseFractions;
```

In practice, if `sumOfAllBalances` is `0n`, then `tokensWithBalance` would be empty and the loop at line 434 would not execute. So this is effectively guarded, but the guard is indirect and fragile. A refactor could break it.

**Recommendation:** Add an explicit guard:
```typescript
if (sumOfAllBalances === 0n) return new Map();
```

---

### A06-5: Division by zero in calculateRewards when total balance for a token is zero [MEDIUM]

**Severity:** MEDIUM

**Lines:** 468-469

**Description:** In `calculateRewards()`, the reward per address is calculated as:
```typescript
const reward =
  (balance.final18 * totalRewardsPerToken.get(...)!) /
  totalBalances.get(token.address.toLowerCase())!;
```

The denominator `totalBalances.get(token.address.toLowerCase())` could be `0n` if all accounts for a token have zero final balance. The `getTokensWithBalance()` filter on line 457 only includes tokens with a positive total, which guards against this. But both the non-null assertion and the implicit dependency on the filter being correct make this fragile.

**Recommendation:** Add explicit zero-check before division, or assert that `totalBalances.get(...)` is positive.

---

### A06-6: Non-null assertions on Map.get() throughout [MEDIUM]

**Severity:** MEDIUM

**Lines:** 70, 145, 157, 188, 211, 394, 420, 436-437, 468-469, 535

**Description:** The code uses the non-null assertion operator (`!`) extensively after `Map.get()` calls. While most of these are immediately preceded by a `.has()` check or a `.set()`, several are not obviously safe:

- Line 70: `this.approvedSourceCache.get(source.toLowerCase())!` -- safe, preceded by `.has()` on line 69
- Line 394: `totalBalances.get(token.address.toLowerCase())!` -- could be undefined if `calculateTotalEligibleBalances` skips a token due to missing `tokenBalances`
- Line 420: `totalBalances.get(token.address.toLowerCase())!` -- same concern
- Line 436: `tokenInverseFractions.get(token.address.toLowerCase())!` -- safe within the same loop that sets it
- Lines 468-469: `totalRewardsPerToken.get(...)!` and `totalBalances.get(...)!` -- depend on consistent iteration

If any of these produce `undefined`, BigInt arithmetic on `undefined` throws a TypeError at runtime, which would halt the entire rewards calculation silently (no partial output).

**Recommendation:** Replace non-null assertions with explicit checks and meaningful error messages, or use a helper function that throws a descriptive error.

---

### A06-7: Negative final balance possible from penalty exceeding average [LOW]

**Severity:** LOW

**Lines:** 348-352, 365

**Description:** In the penalty/bounty calculation (lines 348-352), `penalty` is set to `cheaterBalance.average`, and `penalty` is accumulated via `+=`. If the same cheater appears in multiple reports, their total penalty could exceed their average balance. At line 365:
```typescript
balance.final = balance.average - balance.penalty + balance.bounty;
```

This could produce a negative `final` value. BigInt arithmetic does not underflow/wrap -- it produces a negative BigInt. This negative value is then scaled at line 366 (`scaleTo18`) and used in reward calculations. A negative `final18` would reduce the total eligible balance and distort reward distribution for all participants.

**Recommendation:** Clamp `final` to `0n` minimum:
```typescript
balance.final = balance.average - balance.penalty + balance.bounty;
if (balance.final < 0n) balance.final = 0n;
balance.final18 = scaleTo18(balance.final, token.decimals);
```

---

### A06-8: Approved source cache could be poisoned by transient RPC errors [LOW]

**Severity:** LOW

**Lines:** 101-123

**Description:** The `isApprovedSource()` method caches results in `approvedSourceCache`. The caching logic is generally sound: it caches `true` for known sources, and caches `false` for contracts that provably don't have a `factory()` function (the "returned no data", "reverted", "invalid parameters" cases at lines 103-110). If retries are exhausted for transient errors, it throws (line 122), which prevents caching an incorrect result.

However, the error message matching at lines 105-107 is fragile. If the RPC provider changes its error message format (e.g., a different JSON-RPC implementation), a genuine "contract doesn't have this function" error might not match any of the checked strings. In that case, the code would retry 8 times and then throw, which is the safe-but-expensive fallback. This is not a direct vulnerability but a maintenance concern.

**Recommendation:** Consider matching on error codes rather than string messages where possible, or add a broader catch for known contract-interaction failures.

---

### A06-9: processTransfer double-accounting when transfer is from an approved source that is NOT an LP deposit [LOW]

**Severity:** LOW

**Lines:** 189-228

**Description:** When `isApproved` is true and the transfer is NOT a deposit, the code at lines 189-208 first adds `value` to `toBalance.transfersInFromApproved` and updates snapshot balances. Then at lines 217-229, when `lpDeposit` is falsy and `isApproved` is true, it subtracts `value` back from `toBalance.transfersInFromApproved` and updates snapshots again. This results in the net effect being zero change from the approved-source add/remove. The actual crediting then happens through `fromBalance.transfersOut` at line 230.

This sequence is confusing but mathematically correct for the non-LP, non-deposit, approved-source case: the two operations on `toBalance.transfersInFromApproved` cancel out. However, the double snapshot update is wasteful and the logic flow is difficult to follow, increasing the risk of introducing bugs during future modifications.

When the transfer IS from an approved source AND is a withdrawal (`lpWithdraw` at line 192), the `depositedBalanceChange` is added to `toBalance.transfersInFromApproved` at line 194, and then `value` is added at line 197. Then at lines 217-229, `value` is subtracted again. The net effect on `toBalance.transfersInFromApproved` is `depositedBalanceChange`. This appears intentional but the round-trip add-then-subtract of `value` is confusing.

**Recommendation:** Refactor the logic to avoid the add-then-subtract pattern. Consider restructuring as mutually exclusive branches that directly compute the final state.

---

### A06-10: lp3TrackList accumulates depositedBalanceChange without bounds checking [LOW]

**Severity:** LOW

**Lines:** 559-566

**Description:** In `processLiquidityPositions()`, V3 LP positions are tracked per snapshot in `lp3TrackList`. The `depositedBalanceChange` (which can be negative for withdrawals) is accumulated at line 565:
```typescript
prev.value += depositedBalanceChange
```

If a withdrawal's `depositedBalanceChange` is a large negative number, `prev.value` could become negative. Later in `processLpRange()` at line 600, there is a check `if (lp.value <= 0n) continue;` which skips negative-value positions. However, a negative tracked value means the deduction at line 604 won't fire, which is correct. But the negative accumulation path is not explicitly documented.

Additionally, the `lowerTick` and `upperTick` are taken from the first event that creates the entry (line 562-563) and never updated. If a position modifies its tick range (which does not happen in Uniswap V3 without burning and re-minting, so this is safe in practice), the tracked ticks would be stale.

**Recommendation:** Document that V3 positions cannot change tick ranges without a new tokenId, confirming this is safe by design.

---

### A06-11: organizeLiquidityPositions silently drops duplicate events per (owner, token, txhash) [LOW]

**Severity:** LOW

**Lines:** 499-503

**Description:** In `organizeLiquidityPositions()`, if an event already exists for a given `(owner, token, txhash)` triple (line 499), the new event is silently ignored (line 503 is empty -- control falls through to the end of the function). If the subgraph emits duplicate or multiple events per transaction for the same owner and token, all but the first are dropped.

This could be correct if the subgraph guarantees one liquidity event per (owner, token, tx), but if multiple events are possible (e.g., multiple positions affected in one transaction), data would be lost.

**Recommendation:** Validate that the subgraph data model guarantees uniqueness for this triple, or log/warn on duplicates.

---

### A06-12: Unreachable code after exhausted retry loop [INFO]

**Severity:** INFO

**Line:** 126

**Description:** The `return false;` at line 126 is unreachable. The `for` loop from line 80-124 will either:
1. Return `true` or `false` on success (lines 100, 110)
2. Continue to next iteration on transient error
3. Throw on final retry exhaustion (line 122)

Since all paths within the loop either return or throw, control never reaches line 126. TypeScript requires this for type-checking completeness, but it indicates dead code.

**Recommendation:** Add a comment noting this is for TypeScript's exhaustiveness checking, or restructure to make the control flow clearer.

---

### A06-13: client parameter typed as `any` [INFO]

**Severity:** INFO

**Line:** 45

**Description:** The constructor parameter `client` is typed as `any`, bypassing TypeScript's type safety. This means any object can be passed, and errors from incorrect client implementations would only surface at runtime. The test file (processor.test.ts line 27) passes a minimal mock object, which works but does not enforce the contract interface.

**Recommendation:** Type `client` as the return type of `createPublicClient` or a suitable interface that includes `readContract`.

---

### A06-14: getUniqueAddresses and getEligibleBalances are unnecessarily async [INFO]

**Severity:** INFO

**Lines:** 283, 301

**Description:** `getUniqueAddresses()` and `getEligibleBalances()` are declared `async` but contain no `await` expressions. They return Promises unnecessarily. This has no security impact but is a code quality observation.

**Recommendation:** Remove `async` keyword if no awaited operations are needed, or keep it if the intention is to allow future async operations.

---

## 3. Summary

| ID | Severity | Title |
|----|----------|-------|
| A06-1 | HIGH | Case normalization mismatch for account addresses in accountBalancesPerToken |
| A06-2 | HIGH | Case normalization mismatch in processLiquidityPositions - owner lookup uses raw value |
| A06-3 | MEDIUM | epochLength vs snapshots.length divergence risk |
| A06-4 | MEDIUM | Division by zero in calculateRewardsPoolsPertoken when sumOfInverseFractions is zero |
| A06-5 | MEDIUM | Division by zero in calculateRewards when total balance for a token is zero |
| A06-6 | MEDIUM | Non-null assertions on Map.get() throughout |
| A06-7 | LOW | Negative final balance possible from penalty exceeding average |
| A06-8 | LOW | Approved source cache error matching is fragile |
| A06-9 | LOW | processTransfer double-accounting pattern is confusing |
| A06-10 | LOW | lp3TrackList accumulates depositedBalanceChange without bounds checking |
| A06-11 | LOW | organizeLiquidityPositions silently drops duplicate events |
| A06-12 | INFO | Unreachable code after exhausted retry loop |
| A06-13 | INFO | client parameter typed as `any` |
| A06-14 | INFO | getUniqueAddresses and getEligibleBalances are unnecessarily async |

**HIGH:** 2 | **MEDIUM:** 4 | **LOW:** 5 | **INFO:** 3
