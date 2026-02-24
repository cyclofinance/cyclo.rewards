# Audit A06 - Pass 3 (Documentation) - `src/processor.ts`

**Auditor:** A06
**Date:** 2026-02-23
**Audit ID:** 2026-02-23-01
**File:** `src/processor.ts` (516 lines)

---

## Inventory

### Exported symbols from `src/processor.ts`

| Symbol | Kind | Has JSDoc/comment |
|--------|------|-------------------|
| `Processor` (class) | export class | No |
| `Processor.constructor` | constructor (5 params) | No |
| `Processor.isApprovedSource` | async method (public) | No (has inline comments only) |
| `Processor.processTransfer` | async method (public) | No (has inline comments only) |
| `Processor.getUniqueAddresses` | async method (public) | No (has inline comment) |
| `Processor.getEligibleBalances` | async method (public) | No |
| `Processor.calculateTotalEligibleBalances` | method (public) | No (has inline comment) |
| `Processor.getTokensWithBalance` | method (public) | No |
| `Processor.calculateRewardsPoolsPertoken` | method (public) | No |
| `Processor.calculateRewards` | async method (public) | No |
| `Processor.processLiquidityPositions` | async method (public) | No (has inline comments) |
| `Processor.processLpRange` | async method (public) Has single-line comment above (line 477) |

### Private fields

| Field | Has comment |
|-------|-------------|
| `approvedSourceCache` | No |
| `accountBalancesPerToken` | No |
| `accountTransfers` | No |
| `client` | No |
| `lp3TrackList` | No |

---

## Findings

### A06-1 --- LOW --- Class `Processor` has no JSDoc documentation

The `Processor` class is the core processing engine of the entire rewards system. It has no class-level JSDoc describing its purpose, responsibilities, lifecycle, or usage pattern. A consumer reading the code must infer from method names and the pipeline description in `CLAUDE.md` how the class is intended to be used (construct, feed transfers/liquidity events, then call `calculateRewards`).

**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/processor.ts`, line 23

**Recommendation:** Add a JSDoc block to the class describing its role in the pipeline, expected usage order (construct -> processTransfer/processLiquidityPositions -> processLpRange -> calculateRewards), and thread-safety considerations.

---

### A06-2 --- LOW --- Constructor parameters are undocumented

The constructor accepts five parameters (`snapshots`, `epochLength`, `reports`, `client`, `pools`) with no JSDoc explaining their purpose, expected values, or constraints. Notably:

- `epochLength` is not obviously related to `snapshots.length` (though they should presumably match, as `netBalanceAtSnapshots` is initialized with `this.epochLength` but indexed by `this.snapshots.length`).
- `reports` defaults to `[]` but the format `{ reporter: string; cheater: string }` is inline rather than using the `Report` type from `types.ts`.
- `client` is typed as `any`, losing type safety.
- `pools` is typed as `` `0x${string}`[] `` but its purpose (V3 pool addresses for tick queries) is unexplained.

**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/processor.ts`, lines 38-51

**Recommendation:** Add JSDoc with `@param` tags. Consider using the `Report` interface from `types.ts` instead of the inline type. Consider typing `client` as `PublicClient` from viem.

---

### A06-3 --- LOW --- No JSDoc on any of the 10 public methods

None of the 10 public methods on the `Processor` class have JSDoc documentation. While some have brief inline comments, these do not describe parameters, return values, error conditions, or side effects. The methods that would most benefit from documentation:

- `isApprovedSource` -- should document the caching behavior, retry logic, and the conditions under which `false` is returned silently after exhausting retries (line 119-121).
- `processTransfer` -- should document that it mutates internal state and must be called in block-order.
- `getEligibleBalances` -- should document the three-pass algorithm (base balances, penalties/bounties, final balances).
- `calculateRewardsPoolsPertoken` -- should document the inverse-fraction weighting algorithm for splitting the reward pool.
- `processLpRange` -- has a brief comment (line 477) but no `@param` or `@returns`.

**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/processor.ts`, throughout

**Recommendation:** Add JSDoc blocks to all public methods with `@param`, `@returns`, and `@throws` tags as appropriate.

---

### A06-4 --- INFO --- Inline comments are present but inconsistent

The file contains useful inline comments in some places but lacks them in others. Examples of good inline comments:

- Line 66: `// Check cache first`
- Line 71: `// Check direct sources`
- Line 99: `// Check if this is a "no data returned" error`
- Line 420-421: `// the value is positive if its deposit and negative if its withdraw or transfer out`
- Line 477: `// update each account's snapshots balances with lp v3 price range factored in`

Examples of areas lacking inline comments:

- Lines 309-324 (`calculateTotalEligibleBalances`): Has one comment but the aggregation logic is not explained.
- Lines 337-381 (`calculateRewardsPoolsPertoken`): The inverse-fraction algorithm is mathematically non-obvious. Lines 352-367 perform an inverse weighting calculation that should be explained with a formula comment.
- Lines 383-412 (`calculateRewards`): The division at line 403-405 is a proportional allocation but lacks explanation of precision/rounding behavior.

**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/processor.ts`

**Recommendation:** Add comments explaining the mathematical formulas used in reward pool splitting (inverse-fraction weighting) and per-address reward calculation.

---

### A06-5 --- LOW --- Method name `calculateRewardsPoolsPertoken` has inconsistent casing

The method `calculateRewardsPoolsPertoken` (line 337) uses inconsistent camelCase -- `Pertoken` should be `PerToken` to match standard TypeScript conventions and the type name `RewardsPerToken` used elsewhere.

**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/processor.ts`, line 337

**Recommendation:** Rename to `calculateRewardsPoolsPerToken` for consistency.

---

### A06-6 --- INFO --- Constructor `reports` parameter uses inline type instead of exported `Report` interface

The constructor parameter `reports` is typed as `{ reporter: string; cheater: string }[]` (line 42) while `types.ts` exports a `Report` interface with the identical shape (lines 30-33 of `types.ts`). This inline type is not imported or referenced.

**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/processor.ts`, line 42
**Related:** `/Users/thedavidmeister/Code/cyclo.rewards/src/types.ts`, lines 30-33

**Recommendation:** Import and use the `Report` type for documentation clarity and consistency.

---

### A06-7 --- MEDIUM --- Potential inconsistency between `epochLength` and `snapshots.length` is undocumented

The constructor accepts both `snapshots: number[]` and `epochLength: number` as separate parameters. The `epochLength` is used to initialize `netBalanceAtSnapshots` arrays (lines 173, 181, 256), while `snapshots.length` is used to iterate over them (lines 195, 211, 447, 480). If `epochLength !== snapshots.length`, this could lead to out-of-bounds access or uninitialized array slots. There is no assertion, runtime check, or documentation that these values must be equal.

**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/processor.ts`, lines 39-40

**Recommendation:** Either:
1. Add a constructor assertion that `epochLength === snapshots.length` and document the constraint, or
2. Remove `epochLength` and derive it from `snapshots.length`, or
3. Document explicitly why they can differ and how mismatches are handled.

---

### A06-8 --- LOW --- `processLpRange` comment does not describe side effects or calling order

The comment on line 477 (`// update each account's snapshots balances with lp v3 price range factored in`) is the only documentation for `processLpRange`. It does not explain:

- That this method must be called after all `processLiquidityPositions` calls have completed.
- That it mutates `netBalanceAtSnapshots` in place (deducting out-of-range V3 LP values).
- That it makes network calls (via `getPoolsTick`) to fetch on-chain tick data.
- That it clamps negative balances to zero (line 509-511).

**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/processor.ts`, lines 477-515

**Recommendation:** Replace the inline comment with a full JSDoc block documenting the prerequisites, side effects, and network dependency.

---

### A06-9 --- INFO --- `isApprovedSource` silently returns `false` after exhausting retries

At line 119-121, if all retries are exhausted for a non-deterministic error (e.g., rate limiting), the method logs a message and returns `false`, caching this result. The comment says `// If we've exhausted all retries, log and return false` which is accurate, but there is no JSDoc-level documentation warning callers that transient network failures can cause addresses to be permanently classified as non-approved for the lifetime of the `Processor` instance.

**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/processor.ts`, lines 117-122

**Recommendation:** Document this behavior in a JSDoc `@remarks` tag, noting that transient failures are cached as `false`.

---

### A06-10 --- INFO --- Private fields have no documentation

The five private fields (`approvedSourceCache`, `accountBalancesPerToken`, `accountTransfers`, `client`, `lp3TrackList`) have no comments explaining their structure, purpose, or lifecycle. While they are private, documenting them aids maintainability:

- `approvedSourceCache`: Caches approved-source lookups keyed by lowercase address.
- `accountBalancesPerToken`: Nested map of token address -> account address -> balance state.
- `accountTransfers`: Tracks raw transfer in/out records per account (appears unused outside of `processTransfer`).
- `client`: viem `PublicClient` for RPC calls, typed as `any`.
- `lp3TrackList`: Maps snapshot block numbers to V3 LP position tracking data.

**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/processor.ts`, lines 24-36

**Recommendation:** Add brief inline comments above each private field.

---

### A06-11 --- INFO --- `accountTransfers` field is populated but never read within `Processor`

The `accountTransfers` private field is populated in `processTransfer` (lines 138-158) but never accessed by any other method in the `Processor` class. There is no getter or public method to retrieve this data. If it is intended for external debugging or reporting, it should be documented and exposed. If it is dead code, it should be removed.

**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/processor.ts`, lines 29, 138-158

**Recommendation:** Either expose `accountTransfers` via a documented public getter, or remove the tracking if it serves no purpose. Document intent either way.

---

## Summary

| Severity | Count |
|----------|-------|
| MEDIUM   | 1     |
| LOW      | 4     |
| INFO     | 5     |

**Overall Assessment:** The `src/processor.ts` file has no JSDoc documentation on its class, constructor, or any of its 10 public methods. Inline comments are present but inconsistent and insufficient for a financial rewards calculation engine. The most concerning documentation gap is around the `epochLength` vs `snapshots.length` relationship (A06-7), which could mask a latent bug. The inverse-fraction reward weighting algorithm (A06-4) and the LP range processing lifecycle (A06-8) are the two areas where documentation would most improve maintainability and auditability.
