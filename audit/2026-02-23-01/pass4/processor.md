# Code Quality Audit - processor.ts

**Agent:** A06
**Date:** 2026-02-23
**Pass:** 4 (Code Quality)
**Audit:** 2026-02-23-01
**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/processor.ts`

---

## Findings

### A06-1 -- CRITICAL -- Inconsistent case normalization on `tokenAddress` map lookups causes silent data loss

**Lines:** 130, 160-162, 416, 423-426

In `processTransfer()`, line 130 compares token addresses case-insensitively:

```typescript
if (!CYTOKENS.some((v) => v.address.toLowerCase() === transfer.tokenAddress.toLowerCase())) {
```

But lines 160-162 perform the `accountBalancesPerToken` map lookup using the raw (un-normalized) `transfer.tokenAddress`:

```typescript
const accountBalances = this.accountBalancesPerToken.get(
  transfer.tokenAddress
);
```

The constructor (line 55) stores map keys lowercased: `token.address.toLowerCase()`. If `transfer.tokenAddress` arrives in mixed case (e.g., matching the CYTOKENS config which uses mixed-case addresses like `"0x19831cfB53A0dbeAD9866C43557C1D48DfF76567"`), the eligibility check passes (both sides lowercased) but the map lookup returns `undefined`, and the method throws on line 165.

The identical issue exists in `processLiquidityPositions()` at lines 423-426, where `liquidityChangeEvent.tokenAddress` is used raw for the map lookup.

This is mitigated in production because the scraper appears to lowercase addresses before writing to `.dat` files, but the code is fragile -- any change to the data pipeline that preserves original casing would silently break reward calculations.

**Recommendation:** Normalize `tokenAddress` to lowercase at method entry. For example, add `const tokenAddress = transfer.tokenAddress.toLowerCase();` and use it consistently throughout.

---

### A06-2 -- HIGH -- `processLpRange()` has O(snapshots * tokens * accounts * lpPositions) complexity with string matching

**Lines:** 478-515

For each snapshot, the method iterates all tokens, then all accounts per token, then all LP positions in the track list, using `key.startsWith(idStart)` to filter:

```typescript
for (const [token, account] of this.accountBalancesPerToken) {
  for (const [owner, balance] of account) {
    for (const [key, lp] of lpTrackList) {
      const idStart = `${token.toLowerCase()}-${owner.toLowerCase()}-${pool}`;
      if (!key.startsWith(idStart)) continue;
```

This is an O(n^3) per-snapshot approach. For every account, the entire LP track list is scanned even when the vast majority of entries do not match. The string-based key matching with `startsWith` adds further overhead and is semantically fragile (it depends on the composite key format not containing stray hyphens in component values -- though Ethereum addresses and token IDs should not).

**Recommendation:** Restructure `lp3TrackList` to use a nested map indexed by `token-owner` as the first key, allowing O(1) lookup instead of linear scan. Alternatively, group LP positions by token+owner during `processLiquidityPositions()`.

---

### A06-3 -- MEDIUM -- `accountTransfers` is a write-only field (dead code)

**Lines:** 29, 138-158

The private field `accountTransfers` (line 29) is populated during `processTransfer()` (lines 138-158), building per-account `transfersIn` and `transfersOut` arrays. However, this map is never read by any method in the `Processor` class, nor is it exposed through any public API. There is no getter, no method references it after writing, and no external consumer accesses it.

This represents approximately 20 lines of dead code that runs on every transfer, allocating objects and pushing to arrays for no purpose. It also imports `AccountTransfers` from types.ts solely for this unused tracking.

**Recommendation:** Remove the `accountTransfers` field and all code that populates it (lines 29, 138-158), as well as the `AccountTransfers` import. If this tracking is intended for future use, move it behind a feature flag or add a comment explaining the planned purpose.

---

### A06-4 -- MEDIUM -- Constructor parameter `epochLength` is redundant with `snapshots.length`

**Lines:** 39-40, 173, 182, 256, 437

The constructor accepts both `snapshots: number[]` and `epochLength: number`. In every call site across the codebase, `epochLength` is always passed as `snapshots.length`:

- `index.ts:70`: `new Processor(SNAPSHOTS, SNAPSHOTS.length, ...)`
- `processor.test.ts:31`: `new Processor(SNAPSHOTS, SNAPSHOTS.length, ...)`
- `processor.test.ts:169`: `new Processor(SNAPSHOTS, SNAPSHOTS.length, ...)`
- `processor.test.ts:213`: `new Processor(SNAPSHOTS, SNAPSHOTS.length, ...)`
- `processor.test.ts:653`: `new Processor(snapshots, epochLength, ...)`

The `epochLength` value is used to initialize `netBalanceAtSnapshots` arrays (lines 173, 182, 256, 437). If these two values ever diverge, arrays will be sized incorrectly relative to the actual number of snapshots, causing out-of-bounds writes or missing snapshot data. No validation enforces their equality.

**Recommendation:** Remove `epochLength` and derive it internally as `this.snapshots.length`. If there is a legitimate reason they could differ, add an assertion in the constructor: `assert(epochLength === snapshots.length)`.

---

### A06-5 -- MEDIUM -- Constructor parameter `reports` uses inline type instead of existing `Report` interface

**Lines:** 41

The constructor defines:

```typescript
private reports: { reporter: string; cheater: string }[] = [],
```

But `types.ts` (lines 30-33) already defines an identical interface:

```typescript
export interface Report {
  reporter: string;
  cheater: string;
}
```

The `Report` interface is not imported in `processor.ts`. This inline type duplicates the definition. If the `Report` interface is extended in the future, the constructor signature will not track the change, creating a silent divergence.

**Recommendation:** Import `Report` from `./types` and declare the parameter as `private reports: Report[] = []`.

---

### A06-6 -- MEDIUM -- Constructor parameter `client` is typed as `any`, bypassing type safety

**Lines:** 30, 42

The field declaration on line 30 has no type annotation:

```typescript
private client;
```

And the constructor parameter on line 42 explicitly opts out:

```typescript
client?: any,
```

This means all RPC calls via `this.client.readContract()` (line 79) have no type checking. Invalid ABI definitions, wrong function names, or incorrect parameter types will not be caught at compile time. The `liquidity.ts` module correctly types its client parameter as `PublicClient` from viem.

**Recommendation:** Type the field and parameter as `PublicClient` from viem, or at minimum `ReturnType<typeof createPublicClient>`, to get compile-time verification of RPC calls.

---

### A06-7 -- MEDIUM -- `isApprovedSource` permanently caches `false` on transient RPC failures

**Lines:** 118-121

After exhausting all retry attempts, the method caches `false` permanently:

```typescript
console.log(`Failed to check factory after ${retries} attempts:`, e);
this.approvedSourceCache.set(source.toLowerCase(), false);
return false;
```

If the RPC node is temporarily unreachable (rate limit, network blip), a legitimate approved source (a pool deployed by an approved factory) gets permanently marked as unapproved in the cache. Subsequent transfers from that source will be treated as ineligible for the remainder of the processing run, causing affected users to lose rewards.

**Recommendation:** Either do not cache the result when retries are exhausted (so a later call to `isApprovedSource` for the same address will retry), or throw an error to halt processing when the approved status cannot be determined.

---

### A06-8 -- MEDIUM -- Penalty calculation allows negative `final` balance via double-penalization

**Lines:** 272-304

In `getEligibleBalances()`, the penalty loop accumulates without bound:

```typescript
cheaterBalance.penalty += penalty;
```

If the same cheater address appears in multiple reports, the penalty exceeds their average balance. The final calculation on line 302:

```typescript
balance.final = balance.average - balance.penalty + balance.bounty;
```

can produce a negative `final` value. This negative balance then flows into `calculateRewards()` where it is used in division-based reward calculation, potentially producing negative rewards or distorting the reward distribution for other users.

**Recommendation:** Clamp `final` to `>= 0n` in the third pass, or cap cumulative penalty at the cheater's average balance, or validate that each cheater appears at most once in reports.

---

### A06-9 -- MEDIUM -- Duplicated snapshot balance update logic across three locations

**Lines:** 194-199, 211-216, 446-472

The same pattern appears three times with minor variations:

```typescript
const val = balance.currentNetBalance < 0n ? 0n : balance.currentNetBalance;
for (let i = 0; i < this.snapshots.length; i++) {
  if (event.blockNumber <= this.snapshots[i]) {
    balance.netBalanceAtSnapshots[i] = val;
  }
}
```

Occurrences:
1. `processTransfer()` lines 194-199 (receiver, approved transfers)
2. `processTransfer()` lines 211-216 (sender)
3. `processLiquidityPositions()` lines 446-472 (owner, with LP tracking additions)

The variable name is inconsistent (`val` vs `value`). If the clamping logic or snapshot update semantics need to change, all three locations must be updated in lockstep. A future maintainer could easily miss one.

**Recommendation:** Extract a private method like `updateSnapshotBalances(balance: AccountBalance, blockNumber: number)` for the common pattern. The LP-specific tracking in occurrence 3 can be handled via an optional callback or a separate post-update step.

---

### A06-10 -- MEDIUM -- Redundant `async` on methods that perform no awaits

**Lines:** 221, 239

`getUniqueAddresses()` (line 221) and `getEligibleBalances()` (line 239) are marked `async` but contain zero `await` expressions. They execute entirely synchronously but force all callers to `await` them. This obscures the performance characteristics -- callers (and code reviewers) assume these methods may perform I/O when they do not.

**Recommendation:** Remove `async` from these methods if synchronous behavior is intended. If the `async` is intentional for future-proofing, add a brief comment explaining why.

---

### A06-11 -- LOW -- Duplicated balance initialization pattern

**Lines:** 170-175, 177-183, 433-439

The `AccountBalance` initialization object is repeated three times:

```typescript
{
  transfersInFromApproved: 0n,
  transfersOut: 0n,
  netBalanceAtSnapshots: new Array(this.epochLength).fill(0n),
  currentNetBalance: 0n,
}
```

**Recommendation:** Extract into a private `createDefaultBalance(): AccountBalance` factory method to eliminate repetition and ensure consistency.

---

### A06-12 -- LOW -- `lp3TrackList` inline type definition is complex and anonymous

**Lines:** 31-36

The field declaration uses a deeply nested anonymous type:

```typescript
private lp3TrackList: Record<number, Map<string, {
  pool: string;
  value: bigint;
  lowerTick: number;
  upperTick: number;
}>> = {};
```

This same shape is reconstructed in `processLiquidityPositions()` (lines 462-467). It represents a V3 LP position and would benefit from being a named interface for documentation, reuse, and IDE support.

**Recommendation:** Define an `LpV3Position` interface in `types.ts` and reference it.

---

### A06-13 -- LOW -- `calculateRewardsPoolsPertoken` has a typo in the method name

**Line:** 337

The method is named `calculateRewardsPoolsPertoken` with a lowercase `t` in `token`. TypeScript camelCase convention and the rest of the codebase use full capitalization for multi-word identifiers (e.g., `getTokensWithBalance`, `calculateTotalEligibleBalances`).

**Recommendation:** Rename to `calculateRewardsPoolsPerToken`.

---

### A06-14 -- LOW -- `console.log` in library class for operational output

**Lines:** 119, 376

The `Processor` class directly emits console output:

```typescript
console.log(`Failed to check factory after ${retries} attempts:`, e);  // line 119
console.log(`Total rewards for ${token.name}: ${tokenReward}`);         // line 376
```

Core business logic classes should not have direct I/O side effects. This makes unit testing noisier (log output intermixed with test results) and prevents callers from controlling output destinations.

**Recommendation:** Accept an optional logger interface in the constructor, or remove these log statements and let the caller (e.g., `index.ts`) handle logging based on return values.

---

### A06-15 -- LOW -- Magic number `10n` / `100n` for bounty percentage

**Line:** 286

The bounty is calculated as:

```typescript
const bounty = (penalty * 10n) / 100n;
```

The `10n` and `100n` are magic numbers representing a 10% bounty rate. This business rule is embedded in computation code with no named constant or comment explaining the rate.

**Recommendation:** Define a named constant like `BOUNTY_RATE_PERCENT = 10n` and `PERCENT_DENOMINATOR = 100n` (or `BOUNTY_BPS = 1000n` and `BPS_DENOMINATOR = 10000n`), and reference them here.

---

### A06-16 -- LOW -- Magic number `500` for retry backoff base delay

**Line:** 113

The exponential backoff delay is calculated as:

```typescript
const delay = Math.pow(2, attempt) * 500; // 500ms, 1s, 2s, etc.
```

The base delay of 500ms is a magic number. While the inline comment explains the progression, the value is not configurable or named.

**Recommendation:** Extract to a named constant like `RETRY_BASE_DELAY_MS = 500`.

---

### A06-17 -- INFO -- Redundant `Map.set()` after mutating reference values

**Lines:** 201, 218, 474

After retrieving an object reference from a Map and mutating it in place, the code calls `.set()` to store it back:

```typescript
const toBalance = accountBalances.get(transfer.to)!;
toBalance.transfersInFromApproved += value;
// ...mutations...
accountBalances.set(transfer.to, toBalance);  // line 201 - no-op, same reference
```

Since JavaScript Maps store references, not copies, the `.set()` call is functionally a no-op. It does not cause a bug but adds visual noise and may mislead readers into thinking a new object is being stored.

**Recommendation:** Remove the redundant `.set()` calls, or add a brief comment indicating they are intentional for clarity.

---

### A06-18 -- INFO -- Trailing semicolon after closing brace in for-of loop

**Line:** 508

```typescript
          };
```

A semicolon appears after the closing brace of a `for...of` loop body. This is syntactically valid but inconsistent with the rest of the file, which does not use semicolons after block closers.

**Recommendation:** Remove the trailing semicolon for style consistency.

---

### A06-19 -- INFO -- `Address` import from viem used only for type assertion

**Line:** 1, 91

`Address` is imported on line 1 and used only as a type assertion on line 91: `as Address`. The cast could use viem's native template literal type `` `0x${string}` `` instead, which is more idiomatic in the viem ecosystem. This is a minor style note -- the import is technically used but the pattern could be cleaner.

---

### A06-20 -- INFO -- No validation on constructor inputs

**Lines:** 38-62

The constructor performs no validation on its inputs:
- `snapshots` could be empty, unsorted, or contain duplicates
- `epochLength` could be 0, negative, or mismatched with `snapshots.length`
- `pools` could contain invalid addresses

An empty `snapshots` array would cause division-by-zero in `getEligibleBalances()` (line 257) when computing `BigInt(snapshots.length)`.

**Recommendation:** Add assertions for at minimum: `snapshots.length > 0`, `epochLength === snapshots.length` (or remove `epochLength` per A06-4), and that snapshots are sorted in ascending order.

---

## Summary

| Severity | Count | IDs |
|----------|-------|-----|
| CRITICAL | 1 | A06-1 |
| HIGH | 1 | A06-2 |
| MEDIUM | 7 | A06-3, A06-4, A06-5, A06-6, A06-7, A06-8, A06-9, A06-10 |
| LOW | 6 | A06-11, A06-12, A06-13, A06-14, A06-15, A06-16 |
| INFO | 4 | A06-17, A06-18, A06-19, A06-20 |

**Total findings: 20**

The most critical issue is **A06-1** (inconsistent case normalization on `tokenAddress` map lookups), which creates a latent data-loss path if the upstream data pipeline ever changes its casing behavior. The high-severity item **A06-2** (cubic complexity in `processLpRange`) is a performance concern that will scale poorly as the number of LP positions grows.

The medium-severity findings cluster into three themes:
1. **Dead/redundant code** -- `accountTransfers` is write-only (A06-3), `epochLength` duplicates `snapshots.length` (A06-4)
2. **Type safety gaps** -- `any`-typed client (A06-6), inline type instead of `Report` interface (A06-5)
3. **Defensive programming** -- silent failure caching on RPC errors (A06-7), unbounded penalty accumulation (A06-8), duplicated mutable logic (A06-9), misleading `async` markers (A06-10)

The low-severity findings are primarily about code hygiene: magic numbers (A06-15, A06-16), repeated patterns (A06-11), naming inconsistency (A06-13), and direct console output in a library class (A06-14).
