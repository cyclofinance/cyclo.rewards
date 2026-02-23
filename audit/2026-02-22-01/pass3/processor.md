# Documentation Audit -- Pass 3: `src/processor.ts`

**Auditor:** A06
**Date:** 2026-02-22
**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/processor.ts`
**Lines:** 517

---

## 1. Evidence of Thorough Reading

### Module

- **Module name:** `processor` (no explicit module declaration; single default export class `Processor`)
- **Exports:** One named export -- `class Processor` (line 23)

### Class: `Processor` (lines 23--516)

#### Private Fields (lines 24--36)

| Field | Type | Line |
|---|---|---|
| `approvedSourceCache` | `Map<string, boolean>` | 24 |
| `accountBalancesPerToken` | `Map<string, Map<string, AccountBalance>>` | 25--28 |
| `accountTransfers` | `Map<string, AccountTransfers>` | 29 |
| `client` | (inferred, untyped -- `any`) | 30 |
| `lp3TrackList` | `Record<number, Map<string, { pool, value, lowerTick, upperTick }>>` | 31--36 |

#### Constructor (lines 38--62)

Parameters:
- `snapshots: number[]` (private, line 39)
- `epochLength: number` (private, line 40)
- `reports: { reporter: string; cheater: string }[]` (private, default `[]`, line 41)
- `client?: any` (line 42)
- `pools: \`0x${string}\`[]` (private, default `[]`, line 43)

#### Methods

| Method | Visibility | Line | Async |
|---|---|---|---|
| `isApprovedSource(source: string, retries?: number): Promise<boolean>` | public (implicit) | 64--126 | yes |
| `processTransfer(transfer: Transfer): Promise<void>` | public (implicit) | 128--219 | yes |
| `getUniqueAddresses(): Promise<Set<string>>` | public (implicit) | 221--237 | yes |
| `getEligibleBalances(): Promise<EligibleBalances>` | public (implicit) | 239--307 | yes |
| `calculateTotalEligibleBalances(balances: EligibleBalances): Map<string, bigint>` | public (implicit) | 309--324 | no |
| `getTokensWithBalance(balances: EligibleBalances): CyToken[]` | public (implicit) | 326--335 | no |
| `calculateRewardsPoolsPertoken(balances: EligibleBalances, rewardPool: bigint): Map<string, bigint>` | public (implicit) | 337--381 | no |
| `calculateRewards(rewardPool: bigint): Promise<RewardsPerToken>` | public (implicit) | 383--412 | yes |
| `processLiquidityPositions(liquidityChangeEvent: LiquidityChange): Promise<void>` | public (implicit) | 414--475 | yes |
| `processLpRange(): Promise<void>` | public (implicit) | 478--515 | yes |

#### Imported Types Used

- `Transfer` (from `./types`)
- `AccountBalance` (from `./types`)
- `EligibleBalances` (from `./types`)
- `AccountTransfers` (from `./types`)
- `TokenBalances` (from `./types`)
- `RewardsPerToken` (from `./types`)
- `CyToken` (from `./types`)
- `LiquidityChange` (from `./types`)
- `Address` (from `viem`)

#### Imported Constants/Functions Used

- `REWARDS_SOURCES` (from `./config`)
- `FACTORIES` (from `./config`)
- `RPC_URL` (from `./config`)
- `isSameAddress` (from `./config`)
- `CYTOKENS` (from `./config`)
- `ONE` (from `./constants`)
- `flare` (from `viem/chains`)
- `getPoolsTick` (from `./liquidity`)
- `createPublicClient`, `http` (from `viem`)

#### Errors Thrown

- `"No account balances found for token"` -- line 165 (in `processTransfer`)
- `"No account balances found for token"` -- line 429 (in `processLiquidityPositions`)

#### Constants Referenced

- `ONE` (1e18 as BigInt, from `./constants`) -- used in `calculateRewardsPoolsPertoken` at line 355

---

## 2. Documentation Status of All Public Exports

### Class-Level Documentation

| Item | Has JSDoc? |
|---|---|
| `class Processor` | NO |

### Method-Level Documentation

| Method | Has JSDoc? | Has Inline Comments? |
|---|---|---|
| `constructor` | NO | Yes (lines 52, 58) |
| `isApprovedSource` | NO | Yes (lines 65--66, 70, 76, 99, 110--111, 118) |
| `processTransfer` | NO | Yes (lines 129, 137, 149, 168, 186, 193--194, 204) |
| `getUniqueAddresses` | NO | Yes (line 222) |
| `getEligibleBalances` | NO | Yes (lines 245, 271, 293) |
| `calculateTotalEligibleBalances` | NO | Yes (line 312) |
| `getTokensWithBalance` | NO | None |
| `calculateRewardsPoolsPertoken` | NO | Yes (lines 343, 351, 363, 368) |
| `calculateRewards` | NO | Yes (line 394) |
| `processLiquidityPositions` | NO | Yes (lines 415, 420--422, 445, 450--451) |
| `processLpRange` | YES (partial -- single-line comment, line 477) | Yes (lines 479, 483, 491, 493--495, 506) |

---

## 3. Findings

### A06-1: No JSDoc on the `Processor` class itself

**Severity:** HIGH

The `Processor` class is the single most important class in the entire codebase (per CLAUDE.md: "Core logic. Replays all transfers to compute per-account balances at each snapshot block"). It has no class-level documentation describing:
- Its purpose and responsibilities
- Its lifecycle (how it is constructed, fed data, and queried)
- The relationship between `processTransfer` / `processLiquidityPositions` / `processLpRange` (which must be called in order)
- What `epochLength` means and how it relates to `snapshots.length`

---

### A06-2: No JSDoc on `isApprovedSource`

**Severity:** MEDIUM

This method determines whether a transfer source address qualifies for rewards. It performs a multi-step check (direct source list, then on-chain factory lookup with retry/backoff) and caches results. The retry logic with exponential backoff (line 113: `Math.pow(2, attempt) * 500`) and the specific error-matching heuristics (lines 101--104) are non-trivial. No documentation explains what "approved source" means in the rewards context, nor documents the retry semantics or the default retry count of 8.

---

### A06-3: No JSDoc on `processTransfer`

**Severity:** HIGH

This is one of the two primary data-ingestion methods. It has complex behavior:
- Silently skips transfers for non-CYTOKEN addresses (line 130--132)
- Tracks both sender and receiver transfers (lines 137--158)
- Only credits the receiver's `transfersInFromApproved` when `isApproved` is true (lines 187--202), but always debits the sender's `transfersOut` (lines 204--218)
- Updates snapshot balances for all future snapshots (lines 195--199, 212--216)
- Clamps negative balances to 0n at snapshots (lines 194, 211)

Without documentation, a caller cannot know that:
1. Transfers must be fed in block-number order for snapshot logic to work correctly
2. The method mutates internal state
3. The `from` address is always debited regardless of approval status

---

### A06-4: No JSDoc on `getEligibleBalances`

**Severity:** MEDIUM

This method runs a three-pass calculation (base balances, penalties/bounties, final balances) and returns the complete `EligibleBalances` map. The three-pass structure (lines 244--306) is documented via inline comments ("First pass", "Second pass", "Third pass") which is helpful, but there is no JSDoc explaining:
- What "eligible" means in context
- The penalty model (100% of average is penalized, 10% bounty to reporter -- lines 286--287)
- That the method is idempotent and can be called multiple times (each call recalculates from scratch based on internal state)

---

### A06-5: No JSDoc on `calculateRewardsPoolsPertoken`

**Severity:** MEDIUM

This method implements inverse-weighted reward pool distribution across tokens. The algorithm is mathematically non-trivial:
- It computes inverse fractions (line 354--356): `(sumOfAllBalances * ONE) / tokenTotalBalance`
- It then divides the reward pool proportionally by those inverse fractions (line 374--375)

The effect is that tokens with smaller total balances get a proportionally larger share of the reward pool. This inverse-weighting strategy is entirely undocumented. A reviewer or maintainer could easily misunderstand this as a bug rather than intentional design.

**Note:** The method name contains a typo: `calculateRewardsPoolsPertoken` -- "Pertoken" should be "PerToken" (lowercase 't'). This is a minor style inconsistency.

---

### A06-6: No JSDoc on `processLiquidityPositions`

**Severity:** HIGH

This is the second primary data-ingestion method (alongside `processTransfer`). It handles Uniswap V2 and V3 liquidity change events. Key undocumented behaviors:
- `depositedBalanceChange` can be negative (for withdrawals), and the method adds it directly to `currentNetBalance` (line 443)
- For V3 positions, it tracks tick ranges in `lp3TrackList` for later out-of-range deduction in `processLpRange` (lines 452--469)
- The composite key format for V3 tracking is `{tokenAddress}-{owner}-{poolAddress}-{tokenId}` (lines 453--461)
- It accumulates values for the same key across events (line 468)
- It silently skips non-CYTOKEN addresses (lines 416--418)

---

### A06-7: No JSDoc on `processLpRange`

**Severity:** MEDIUM

This method has a single-line comment (line 477: "update each account's snapshots balances with lp v3 price range factored in") but no proper JSDoc. The comment is helpful but insufficient for documenting:
- That this method must be called after all `processLiquidityPositions` calls are complete
- That it makes external RPC calls via `getPoolsTick` for each snapshot
- That it deducts out-of-range V3 LP values from snapshot balances (line 507)
- That balances are clamped to 0n after deductions (lines 509--511)
- The tick range check semantics: `lowerTick <= tick <= upperTick` means "in range" (line 504)

---

### A06-8: No JSDoc on `calculateRewards`

**Severity:** MEDIUM

This is the top-level reward calculation entry point, tying together `getEligibleBalances`, `calculateRewardsPoolsPertoken`, and `calculateTotalEligibleBalances`. No documentation describes:
- That it returns per-address rewards broken down by token
- That it only includes tokens with non-zero total balances
- The formula: `reward = (userFinalBalance * tokenRewardPool) / tokenTotalBalance` (lines 402--405)

---

### A06-9: No JSDoc on `getUniqueAddresses` and `getTokensWithBalance`

**Severity:** LOW

These are utility/helper methods. `getUniqueAddresses` includes reporter addresses (line 224--226) which is a subtle but important behavior. `getTokensWithBalance` is straightforward. Neither is documented.

---

### A06-10: No JSDoc on `calculateTotalEligibleBalances`

**Severity:** LOW

Sums the `final` field of all `TokenBalances` for each token. Straightforward but undocumented. Returns a `Map<string, bigint>` keyed by lowercase token address.

---

### A06-11: `processLpRange` comment accuracy (line 477)

**Severity:** INFO

The inline comment on line 477 reads: "update each account's snapshots balances with lp v3 price range factored in". This is accurate but could be more precise -- it specifically *deducts* out-of-range positions rather than generically "factoring in" the range. The current wording could be interpreted as also adjusting in-range positions, which it does not.

---

### A06-12: Inline comments in `processTransfer` are accurate

**Severity:** INFO

The inline comments within `processTransfer` (e.g., "skip if the token is not in the eligible list" at line 129, "Track transfers for receiver" at line 137, "Always track transfers out" at line 204) are accurate relative to the implementation. No misleading inline comments were found.

---

### A06-13: Inline comments in `getEligibleBalances` pass structure are accurate

**Severity:** INFO

The "First pass", "Second pass", "Third pass" comments (lines 245, 271, 293) accurately describe the computation stages. The penalty/bounty calculation at lines 286--287 (`penalty = average`, `bounty = 10% of penalty`) matches the implementation.

---

### A06-14: Constructor `epochLength` parameter relationship to `snapshots` is undocumented

**Severity:** MEDIUM

The constructor accepts both `snapshots: number[]` and `epochLength: number` as separate parameters (lines 39--40). In practice, `epochLength` should equal `snapshots.length` (the test file consistently passes `SNAPSHOTS.length` as `epochLength` -- e.g., test line 31). However, there is no validation that these are consistent, and no documentation explaining why they are separate parameters rather than deriving `epochLength` from `snapshots.length`. If a caller passes mismatched values, `netBalanceAtSnapshots` arrays would have a different length than the snapshot iteration range, causing silent data corruption (snapshot values could be written to out-of-bounds indices, or valid snapshots could be missed).

---

### A06-15: `client` parameter typed as `any`

**Severity:** LOW

The constructor's `client` parameter (line 42) is typed as `any` rather than using a proper viem `PublicClient` type. This is a documentation/type-safety concern: callers receive no guidance on what interface the client must satisfy. The inline comment does not explain this design choice.

---

### A06-16: Inline comment in `isApprovedSource` about error handling is accurate

**Severity:** INFO

Lines 99 ("Check if this is a 'no data returned' error"), 110 ("For other errors (like rate limits), retry"), and 118 ("If we've exhausted all retries") accurately describe the control flow.

---

### A06-17: Missing documentation on ordering requirements between methods

**Severity:** HIGH

There is no documentation anywhere in the file explaining the required calling order:
1. `processTransfer()` for all transfers (in block order)
2. `processLiquidityPositions()` for all liquidity events (in block order)
3. `processLpRange()` once after all liquidity events
4. `getEligibleBalances()` / `calculateRewards()` after processing is complete

This ordering is critical for correct behavior. Processing events out of block order would produce incorrect snapshot balances, and calling `processLpRange` before all liquidity events are processed would produce incomplete deductions. This is the single most important piece of missing documentation given the class's role as the core calculation engine.

---

## 4. Summary

| Severity | Count | Finding IDs |
|---|---|---|
| CRITICAL | 0 | -- |
| HIGH | 4 | A06-1, A06-3, A06-6, A06-17 |
| MEDIUM | 5 | A06-2, A06-4, A06-5, A06-7, A06-8 |
| LOW | 3 | A06-9, A06-10, A06-15 |
| INFO | 5 | A06-11, A06-12, A06-13, A06-14, A06-16 |

**Total findings:** 17

**Overall assessment:** The `processor.ts` file contains zero JSDoc comments across 10 public methods and the class itself. While inline comments exist and are generally accurate, the complete absence of formal API documentation on the most complex and critical module in the codebase is a significant gap. The most impactful missing documentation relates to method ordering requirements (A06-17), the inverse-weighted reward pool algorithm (A06-5), and the two primary data-ingestion methods (A06-3, A06-6) whose side effects and preconditions are non-obvious from signatures alone.
