# Code Quality Audit - processor.ts

**Agent:** A12
**Date:** 2026-02-22
**Pass:** 4 (Code Quality)
**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/processor.ts`

---

## Evidence of Thorough Reading

**Module:** `Processor` (class-based, single export)

### Imports (lines 1-21)
- `createPublicClient`, `http`, `Address` from `viem`
- `REWARDS_SOURCES`, `FACTORIES`, `RPC_URL`, `isSameAddress`, `CYTOKENS` from `./config`
- `Transfer`, `AccountBalance`, `EligibleBalances`, `AccountTransfers`, `TokenBalances`, `RewardsPerToken`, `CyToken`, `LiquidityChange` from `./types`
- `ONE` from `./constants`
- `flare` from `viem/chains`
- `getPoolsTick` from `./liquidity`

### Class: `Processor` (line 23-516)

**Private Fields (lines 24-36):**
- `approvedSourceCache`: `Map<string, boolean>` (line 24)
- `accountBalancesPerToken`: `Map<string, Map<string, AccountBalance>>` (lines 25-28)
- `accountTransfers`: `Map<string, AccountTransfers>` (line 29)
- `client`: untyped (`any` implicit) (line 30)
- `lp3TrackList`: `Record<number, Map<string, { pool, value, lowerTick, upperTick }>>` (lines 31-36)

**Constructor (lines 38-62):**
- Parameters: `snapshots: number[]`, `epochLength: number`, `reports`, `client?: any`, `pools`
- Initializes `accountBalancesPerToken` maps for each CYTOKEN
- Initializes `lp3TrackList` with empty maps for each snapshot

**Methods:**
| Method | Line | Visibility | Returns |
|--------|------|-----------|---------|
| `isApprovedSource(source, retries?)` | 64 | `async` public | `Promise<boolean>` |
| `processTransfer(transfer)` | 128 | `async` public | `Promise<void>` (implicit) |
| `getUniqueAddresses()` | 221 | `async` public | `Promise<Set<string>>` |
| `getEligibleBalances()` | 239 | `async` public | `Promise<EligibleBalances>` |
| `calculateTotalEligibleBalances(balances)` | 309 | public (sync) | `Map<string, bigint>` |
| `getTokensWithBalance(balances)` | 326 | public (sync) | `CyToken[]` |
| `calculateRewardsPoolsPertoken(balances, rewardPool)` | 337 | public (sync) | `Map<string, bigint>` |
| `calculateRewards(rewardPool)` | 383 | `async` public | `Promise<RewardsPerToken>` |
| `processLiquidityPositions(liquidityChangeEvent)` | 414 | `async` public | `Promise<void>` (implicit) |
| `processLpRange()` | 478 | `async` public | `Promise<void>` (implicit) |

### Types/Constants used from other modules:
- `Transfer`, `AccountBalance`, `EligibleBalances`, `AccountTransfers`, `TokenBalances`, `RewardsPerToken`, `CyToken`, `LiquidityChange` (from types.ts)
- `ONE` constant (from constants.ts)
- `REWARDS_SOURCES`, `FACTORIES`, `CYTOKENS`, `RPC_URL`, `isSameAddress` (from config.ts)

---

## Findings

### A12-1: Inconsistent case normalization of `tokenAddress` causes silent data loss

**Severity:** CRITICAL

In `processTransfer()` (line 130), the token address is compared using `.toLowerCase()` on both sides:
```typescript
if (!CYTOKENS.some((v) => v.address.toLowerCase() === transfer.tokenAddress.toLowerCase())) {
```

But on line 160-162, the `accountBalancesPerToken` map is looked up using the raw `transfer.tokenAddress` without lowercasing:
```typescript
const accountBalances = this.accountBalancesPerToken.get(
  transfer.tokenAddress
);
```

The constructor (line 55) stores keys lowercased: `token.address.toLowerCase()`. If `transfer.tokenAddress` is not already lowercase, this lookup will return `undefined` and throw the error on line 165. However, the CYTOKENS config contains mixed-case addresses (e.g., `"0x19831cfB53A0dbeAD9866C43557C1D48DfF76567"`). If a transfer arrives with the mixed-case address, it passes the eligibility check on line 130 (both sides are lowercased), but the map lookup on line 160 fails because the key was stored lowercase.

The same issue exists in `processLiquidityPositions()` at line 423-426: `liquidityChangeEvent.tokenAddress` is used raw for the map lookup, but the constructor stored keys lowercased.

In practice this is mitigated because the scraper appears to lowercase addresses, but the code is fragile and inconsistent -- the guard check at the top normalizes but the subsequent lookup does not.

**Recommendation:** Normalize `transfer.tokenAddress` to lowercase at the start of `processTransfer()` and `processLiquidityPositions()`, or use a local variable that is consistently lowercased.

---

### A12-2: Constructor parameter `reports` uses inline type instead of the defined `Report` interface

**Severity:** MEDIUM

Line 41 defines the constructor parameter as:
```typescript
private reports: { reporter: string; cheater: string }[] = [],
```

But `types.ts` (line 30-33) already defines:
```typescript
export interface Report {
  reporter: string;
  cheater: string;
}
```

The `Report` type is imported nowhere in `processor.ts`. This is a missed abstraction -- the type exists but is not used, leading to duplication. If `Report` gains additional fields in the future, the constructor signature would not automatically track the change.

**Recommendation:** Import and use the `Report` interface from `types.ts`.

---

### A12-3: Constructor parameter `client` is typed as `any`

**Severity:** MEDIUM

Line 42:
```typescript
client?: any,
```

And the field declaration on line 30:
```typescript
private client;
```

This completely bypasses TypeScript's type safety for all RPC calls. Viem provides `PublicClient` which is the correct type. The `liquidity.ts` module correctly types its client parameter as `PublicClient`. This inconsistency means type errors in contract calls will not be caught at compile time.

**Recommendation:** Type `client` as `PublicClient` from viem, matching the pattern in `liquidity.ts`.

---

### A12-4: `lp3TrackList` inline type definition is complex and anonymous

**Severity:** LOW

Lines 31-36 define an inline record type:
```typescript
private lp3TrackList: Record<number, Map<string, {
  pool: string;
  value: bigint;
  lowerTick: number;
  upperTick: number;
}>> = {};
```

This anonymous object type is reconstructed in the `processLiquidityPositions` method (lines 462-467) and conceptually matches V3 LP position data. It should be extracted into a named interface in `types.ts` for clarity and reuse.

**Recommendation:** Define a `LpV3Position` interface in `types.ts` and reference it.

---

### A12-5: Redundant `async` on methods that perform no awaits

**Severity:** LOW

`getUniqueAddresses()` (line 221) and `getEligibleBalances()` (line 239) are marked `async` but contain no `await` expressions. They return values that are automatically wrapped in a resolved Promise. This is misleading -- callers must `await` them even though they execute synchronously.

While not a bug, it adds unnecessary overhead and hides the synchronous nature of these computations.

**Recommendation:** Remove `async` from methods that do not use `await`, returning the value directly. Or if the intent is to keep a consistent async API for future-proofing, add a comment explaining why.

---

### A12-6: Duplicated snapshot balance update logic

**Severity:** MEDIUM

The pattern for updating snapshot balances appears three times in the file with minor variations:

1. `processTransfer()` lines 194-199 (for the `to` address when approved):
```typescript
const val = toBalance.currentNetBalance < 0n ? 0n : toBalance.currentNetBalance;
for (let i = 0; i < this.snapshots.length; i++) {
  if (transfer.blockNumber <= this.snapshots[i]) {
    toBalance.netBalanceAtSnapshots[i] = val;
  }
}
```

2. `processTransfer()` lines 211-216 (for the `from` address):
```typescript
const val = fromBalance.currentNetBalance < 0n ? 0n : fromBalance.currentNetBalance;
for (let i = 0; i < this.snapshots.length; i++) {
  if (transfer.blockNumber <= this.snapshots[i]) {
    fromBalance.netBalanceAtSnapshots[i] = val;
  }
}
```

3. `processLiquidityPositions()` lines 446-472 (similar loop with LP tracking additions):
```typescript
const value = ownerBalance.currentNetBalance < 0n ? 0n : ownerBalance.currentNetBalance;
for (let i = 0; i < this.snapshots.length; i++) {
  if (liquidityChangeEvent.blockNumber <= this.snapshots[i]) {
    ownerBalance.netBalanceAtSnapshots[i] = value;
    // ...lp3 tracking logic
  }
}
```

This repetition increases the risk of inconsistency if the logic needs to change. The variable name is also inconsistent (`val` vs `value`).

**Recommendation:** Extract a private `updateSnapshotBalances(balance: AccountBalance, blockNumber: number)` method. The LP-specific tracking could be handled via an optional callback or by separating the LP tracking update.

---

### A12-7: Duplicated balance initialization pattern

**Severity:** LOW

The `AccountBalance` initialization pattern is repeated three times (lines 170-175, 177-183, 433-439):
```typescript
{
  transfersInFromApproved: 0n,
  transfersOut: 0n,
  netBalanceAtSnapshots: new Array(this.epochLength).fill(0n),
  currentNetBalance: 0n,
}
```

**Recommendation:** Extract into a private `createDefaultBalance(): AccountBalance` method.

---

### A12-8: `processLpRange()` has O(tokens * accounts * lpPositions) complexity per snapshot

**Severity:** HIGH

In `processLpRange()` (lines 478-515), for each snapshot, the method iterates over all tokens, then all accounts under each token, then all LP positions in the track list:

```typescript
for (const [token, account] of this.accountBalancesPerToken) {
  for (const [owner, balance] of account) {
    for (const [key, lp] of lpTrackList) {
      // string matching via startsWith
```

The inner loop uses `key.startsWith(idStart)` to filter LP positions matching the current token+owner. This is an O(n^3) approach when it could be O(n) by directly looking up positions by token+owner prefix. With many accounts and many LP positions, this becomes a performance bottleneck.

**Recommendation:** Restructure `lp3TrackList` to be indexed by `token-owner` as the first level key, allowing direct lookup instead of iterating all positions and string-matching.

---

### A12-9: `calculateRewardsPoolsPertoken` has a typo in the method name

**Severity:** LOW

Line 337: `calculateRewardsPoolsPertoken` -- the `t` in `token` is not capitalized. The TypeScript convention for camelCase would be `calculateRewardsPoolsPerToken`. This is inconsistent with the rest of the codebase which uses proper camelCase (e.g., `getTokensWithBalance`, `calculateTotalEligibleBalances`).

**Recommendation:** Rename to `calculateRewardsPoolsPerToken` (capital T).

---

### A12-10: `console.log` used for operational output in a library class

**Severity:** LOW

Line 119 and 376:
```typescript
console.log(`Failed to check factory after ${retries} attempts:`, e);
```
```typescript
console.log(`Total rewards for ${token.name}: ${tokenReward}`);
```

A core business logic class should not directly emit console output. This makes the class harder to test cleanly and impossible to redirect output. The caller (`index.ts`) already does extensive console logging.

**Recommendation:** Accept an optional logger in the constructor, or remove these log statements and let the caller handle logging using the return values.

---

### A12-11: Redundant `Map.set()` after mutating reference values

**Severity:** INFO

Lines 201, 218, and 474 all follow a pattern of getting an object reference from a Map, mutating it, then setting it back:
```typescript
const toBalance = accountBalances.get(transfer.to)!;
toBalance.transfersInFromApproved += value;
// ...mutations...
accountBalances.set(transfer.to, toBalance);  // Unnecessary - toBalance is already the same reference
```

Since JavaScript Maps store references, not copies, the `.set()` call is a no-op when the object was retrieved from the same Map. It does not cause a bug, but it adds visual noise and could mislead readers into thinking a new object is being stored.

**Recommendation:** Remove the redundant `.set()` calls after mutations, or add a comment explaining they are intentional for clarity.

---

### A12-12: `epochLength` constructor parameter is redundant with `snapshots.length`

**Severity:** MEDIUM

The constructor takes both `snapshots: number[]` and `epochLength: number` (lines 39-40). In every call site in the codebase, `epochLength` is always passed as `snapshots.length`:

- `index.ts:75`: `new Processor(SNAPSHOTS, SNAPSHOTS.length, ...)`
- `processor.test.ts:31`: `new Processor(SNAPSHOTS, SNAPSHOTS.length, ...)`
- `processor.test.ts:169`: `new Processor(SNAPSHOTS, SNAPSHOTS.length, ...)`

The `epochLength` is used only to initialize snapshot arrays (lines 173, 182, 256, 437). If `epochLength` ever differed from `snapshots.length`, it would create arrays of a different size than the actual snapshots, leading to out-of-bounds access or missing data. This parameter is a source of potential bugs because the two values must always be identical but are not enforced to be.

**Recommendation:** Remove `epochLength` and derive it from `this.snapshots.length` internally. Or, if there is a reason they could differ, add a validation assertion in the constructor.

---

### A12-13: No validation on constructor inputs

**Severity:** MEDIUM

The constructor performs no validation:
- `snapshots` could be empty, unsorted, or contain duplicates
- `epochLength` could be 0 or negative
- `pools` could contain invalid addresses

An empty `snapshots` array would cause division-by-zero in `getEligibleBalances()` (line 257) when computing `BigInt(snapshots.length)`.

**Recommendation:** Add assertions or validation for at minimum: `snapshots.length > 0` and `epochLength === snapshots.length` (or remove `epochLength` per A12-12).

---

### A12-14: Semicolons after block statements are inconsistent

**Severity:** INFO

Line 508 has a trailing semicolon after a closing brace in a for-of loop:
```typescript
          };
```

This is syntactically valid but stylistically inconsistent with the rest of the file, which does not use semicolons after block closers.

**Recommendation:** Remove the trailing semicolon for consistency.

---

### A12-15: `isApprovedSource` silently returns `false` on exhausted retries

**Severity:** MEDIUM

Lines 118-121: After exhausting all retry attempts for an unrecognized RPC error, the method logs a warning and returns `false`, caching this result permanently:
```typescript
console.log(`Failed to check factory after ${retries} attempts:`, e);
this.approvedSourceCache.set(source.toLowerCase(), false);
return false;
```

This means a transient network failure (e.g., the RPC node being down for a period) can permanently mark an approved source as unapproved in the cache. Since this is a financial rewards calculation, silently excluding an approved source due to transient errors could cause users to lose rewards.

**Recommendation:** Either do not cache the result on exhausted retries (so it can be retried on subsequent calls), or throw an error to halt processing when an approved source cannot be definitively determined.

---

### A12-16: Penalty calculation does not prevent double-penalization

**Severity:** MEDIUM

In `getEligibleBalances()`, the penalty loop (lines 272-291) iterates over `this.reports` and accumulates penalties:
```typescript
cheaterBalance.penalty += penalty;
```

If the same cheater appears in multiple reports (reported by different reporters), their average balance is penalized multiple times. With two reports against the same cheater, the penalty would be `2 * average`, exceeding their actual balance. The final balance calculation (line 302) `average - penalty + bounty` could go negative.

While the current `blocklist.txt` may not contain duplicates, the code does not guard against this, and the `final` value is not clamped to zero.

**Recommendation:** Either cap the cumulative penalty at the cheater's average balance, or clamp `final` to `>= 0n` in the third pass, or validate that each cheater appears at most once in the reports.

---

### A12-17: Unused import `Address` from viem

**Severity:** INFO

`Address` is imported on line 1 but only used in a type assertion on line 91 (`as Address`). The `source as Address` cast on line 79 could use the template literal type `` `0x${string}` `` instead, which is viem's native address type. However, `Address` is technically used, so this is informational only -- the import is valid but the cast pattern could be improved.

---

## Summary

| Severity | Count | IDs |
|----------|-------|-----|
| CRITICAL | 1 | A12-1 |
| HIGH | 1 | A12-8 |
| MEDIUM | 6 | A12-2, A12-3, A12-6, A12-12, A12-13, A12-15, A12-16 |
| LOW | 4 | A12-4, A12-5, A12-7, A12-9, A12-10 |
| INFO | 3 | A12-11, A12-14, A12-17 |

**Total findings: 17**

The most critical issue is A12-1 (inconsistent case normalization on token address lookups) which could cause silent data loss if transfer data arrives with non-lowercase addresses. The high-severity item A12-8 (cubic complexity in `processLpRange`) is a performance concern that will scale poorly. The medium-severity findings cluster around two themes: (1) insufficient input validation and defensive programming (A12-12, A12-13, A12-15, A12-16), and (2) code duplication and missed abstractions (A12-2, A12-3, A12-6).
