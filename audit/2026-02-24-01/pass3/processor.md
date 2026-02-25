# Pass 3 -- Documentation Audit: `src/processor.ts`

**Auditor Agent:** A06
**Date:** 2026-02-24
**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/processor.ts`

---

## 1. Inventory of Functions, Constants, Fields, and Exports

### Class: `Processor` (line 25, exported)

#### Private Fields

| Line | Symbol | Kind |
|------|--------|------|
| 26 | `approvedSourceCache` | `Map<string, boolean>` |
| 27 | `accountBalancesPerToken` | `Map<string, Map<string, AccountBalance>>` |
| 31 | `accountTransfers` | `Map<string, AccountTransfers>` |
| 32 | `client` | PublicClient (viem) |
| 33 | `lp3TrackList` | `Record<number, Map<string, {...}>>` |
| 39 | `liquidityEvents` | `Map<string, Map<string, Map<string, LiquidityChange>>>` |

#### Constructor

| Line | Symbol | Kind |
|------|--------|------|
| 41 | `constructor(snapshots, epochLength, reports, client?, pools)` | Constructor |

#### Methods

| Line | Symbol | Kind | Exported (public) |
|------|--------|------|-------------------|
| 67 | `isApprovedSource(source, retries?)` | `async` method | Yes |
| 129 | `processTransfer(transfer)` | `async` method | Yes |
| 247 | `transferIsDeposit(transfer)` | method | Yes |
| 265 | `transferIsWithdraw(transfer)` | method | Yes |
| 283 | `getUniqueAddresses()` | `async` method | Yes |
| 301 | `getEligibleBalances()` | `async` method | Yes |
| 373 | `calculateTotalEligibleBalances(balances)` | method | Yes |
| 390 | `getTokensWithBalance(balances)` | method | Yes |
| 401 | `calculateRewardsPoolsPertoken(balances, rewardPool)` | method | Yes |
| 447 | `calculateRewards(rewardPool)` | `async` method | Yes |
| 478 | `organizeLiquidityPositions(liquidityChangeEvent)` | `async` method | Yes |
| 506 | `processLiquidityPositions(liquidityChangeEvent)` | `async` method | Yes |
| 575 | `processLpRange()` | `async` method | Yes |

**Total: 13 public methods + 1 constructor + 6 private fields**

---

## 2. Module-Level Documentation

**[A06-DOC-001] No module-level JSDoc or header comment.**
Severity: Low
This is the core processing engine of the entire rewards system. There is no module-level documentation explaining that this file contains the `Processor` class responsible for replaying transfer and liquidity events, computing snapshot balances, applying penalties/bounties, and calculating reward distributions.

---

## 3. Class-Level Documentation

**[A06-DOC-002] `Processor` class (line 25) has no JSDoc.**
Severity: Medium
The `Processor` class is the central data structure of the application. It holds all state (balances, transfers, liquidity positions, caches) and orchestrates the multi-step reward calculation. There is no class-level JSDoc describing:
- Its overall responsibility
- The expected call order (construct -> organizeLiquidityPositions -> processTransfer -> processLiquidityPositions -> processLpRange -> getEligibleBalances -> calculateRewards)
- The relationship between its internal maps and the pipeline stages
- Thread safety considerations (none, single-threaded)

---

## 4. Method-Level Documentation

**[A06-DOC-003] None of the 13 public methods have JSDoc.**
Severity: High
Every public method on the `Processor` class lacks JSDoc documentation. This is the most critical documentation gap in the codebase. Specific concerns for each method:

| Method | Line | Missing Documentation |
|--------|------|-----------------------|
| `isApprovedSource` | 67 | Purpose, caching behavior, retry logic with exponential backoff, when it throws vs returns false |
| `processTransfer` | 129 | Side effects on internal state, how approved vs unapproved transfers are handled differently, LP deposit/withdraw special casing |
| `transferIsDeposit` | 247 | Return semantics (returns the matching LiquidityChange or undefined) |
| `transferIsWithdraw` | 265 | Return semantics (returns the matching LiquidityChange or undefined) |
| `getUniqueAddresses` | 283 | Why reporters are included even without balances |
| `getEligibleBalances` | 301 | Three-pass algorithm (base balances, penalties/bounties, final balances), return type semantics |
| `calculateTotalEligibleBalances` | 373 | Uses `final18` (scaled to 18 decimals) not `final` |
| `getTokensWithBalance` | 390 | Filters to tokens with non-zero total balance |
| `calculateRewardsPoolsPertoken` | 401 | Inverse-fraction weighting algorithm for splitting reward pool across tokens |
| `calculateRewards` | 447 | End-to-end reward calculation, calls getEligibleBalances internally (meaning it recalculates) |
| `organizeLiquidityPositions` | 478 | Populates `liquidityEvents` map structure, must be called before processTransfer |
| `processLiquidityPositions` | 506 | Updates snapshot balances for LP positions, handles V3 tick tracking |
| `processLpRange` | 575 | Deducts out-of-range V3 LP positions from snapshot balances |

---

## 5. Naming Issue

**[A06-DOC-004] Method name `calculateRewardsPoolsPertoken` (line 401) has inconsistent casing.**
Severity: Low
The method name uses `Pertoken` with a lowercase `t`, inconsistent with standard camelCase convention which would be `calculateRewardsPoolsPerToken`. This makes the method harder to find via search and violates TypeScript naming conventions.

---

## 6. Inline Comment Accuracy

### [A06-DOC-005] Line 55: `// Initialize token balances maps` -- accurate.
Severity: None

### [A06-DOC-006] Line 61: `// start empty list` -- accurate but vague.
Severity: Info
Could be more specific: "Initialize empty LP v3 tracking lists for each snapshot block."

### [A06-DOC-007] Line 68: No comment explaining cache-first, direct-check, factory-check pipeline.
Severity: Low
The `isApprovedSource` method has three phases (cache lookup, direct source match, factory contract call) but the logic flow is only partially documented by sparse inline comments.

### [A06-DOC-008] Line 115: `// Add exponential backoff` -- accurate.
Severity: None
The code on line 116 does implement `Math.pow(2, attempt) * 500` which is genuine exponential backoff. This is accurate.

### [A06-DOC-009] Line 130-131: `// skip if the token is not in the eligible list` -- accurate.
Severity: None

### [A06-DOC-010] Line 191: `// handle if transfer is withdraw` -- accurate.
Severity: None

### [A06-DOC-011] Line 307: `// First pass - calculate base balances and penalties` -- partially inaccurate.
Severity: Low
This comment says "calculate base balances and penalties" but the first pass (lines 308-331) only calculates base balances (snapshots, average) and initializes penalty/bounty to 0n. Penalties are calculated in the second pass (line 334). The comment should say "calculate base balances" only.

### [A06-DOC-012] Line 334: `// Second pass - calculate bounties based on penalties` -- partially inaccurate.
Severity: Low
This pass calculates both penalties AND bounties (lines 348-352). The comment omits that penalties are also calculated here.

### [A06-DOC-013] Line 356: `// Third pass - calculate final balances` -- accurate.
Severity: None

### [A06-DOC-014] Line 415: `// Calculate the inverse fractions for each token` -- accurate.
Severity: None
The inverse-fraction weighting algorithm is a non-obvious mathematical approach. While the inline comment is accurate, a broader explanation of why inverse fractions are used (to weight rewards inversely to pool size, giving smaller pools proportionally more reward) would be valuable.

### [A06-DOC-015] Line 512-513: `// the value is positive if its deposit and negative if its withdraw or transfer out` -- accurate.
Severity: None

### [A06-DOC-016] Line 536-537: `// include the liquidity direct transfer to the net balance / as deposit and withdraws are handled in transfer processing function` -- accurate.
Severity: None

### [A06-DOC-017] Line 574: `// update each account's snapshots balances with lp v3 price range factored in` -- accurate.
Severity: None

---

## 7. Private Field Documentation

**[A06-DOC-018] None of the 6 private fields have documentation.**
Severity: Low
The nested map types (especially `liquidityEvents` on line 39: `Map<owner, Map<token, Map<txhash, LiquidityChange>>>`) are particularly opaque without documentation. The key structure of `lp3TrackList` (line 33-38) uses a composite string key format `{token}-{owner}-{pool}-{tokenId}` that is only discoverable by reading `processLiquidityPositions`.

---

## 8. Constructor Documentation

**[A06-DOC-019] Constructor has no JSDoc.**
Severity: Low
The constructor (line 41) takes 5 parameters, one optional. There is no documentation explaining:
- What `epochLength` represents (should equal `snapshots.length`)
- That `client` defaults to a viem PublicClient connected to Flare mainnet via `RPC_URL`
- That `pools` is the list of Uniswap V3 pool addresses for tick queries

---

## 9. Summary

| ID | Severity | Description |
|----|----------|-------------|
| A06-DOC-001 | Low | No module-level JSDoc |
| A06-DOC-002 | Medium | `Processor` class has no JSDoc |
| A06-DOC-003 | High | All 13 public methods lack JSDoc |
| A06-DOC-004 | Low | `calculateRewardsPoolsPertoken` inconsistent casing (lowercase `t`) |
| A06-DOC-005 | None | Line 55 comment accurate |
| A06-DOC-006 | Info | Line 61 comment vague |
| A06-DOC-007 | Low | `isApprovedSource` three-phase pipeline undocumented |
| A06-DOC-008 | None | Line 115 exponential backoff comment accurate |
| A06-DOC-009 | None | Line 130-131 comment accurate |
| A06-DOC-010 | None | Line 191 comment accurate |
| A06-DOC-011 | Low | Line 307 "first pass" comment says penalties but pass does not calculate them |
| A06-DOC-012 | Low | Line 334 "second pass" comment omits penalty calculation |
| A06-DOC-013 | None | Line 356 comment accurate |
| A06-DOC-014 | None | Line 415 comment accurate |
| A06-DOC-015 | None | Line 512-513 comment accurate |
| A06-DOC-016 | None | Line 536-537 comment accurate |
| A06-DOC-017 | None | Line 574 comment accurate |
| A06-DOC-018 | Low | No private field documentation |
| A06-DOC-019 | Low | Constructor has no JSDoc |
