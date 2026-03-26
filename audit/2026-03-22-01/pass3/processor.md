# Pass 3: Documentation Review — `src/processor.ts`

**Agent:** A07
**Date:** 2026-03-22
**File:** `src/processor.ts` (656 lines)

---

## Evidence of Thorough Reading

### Module-level JSDoc
- **Lines 1-4:** Module-level block comment describing the core reward calculation engine.

### Class: `Processor` (line 33)
- **Lines 29-32:** Class-level JSDoc present.

### Private Fields (with documentation status)
| Field | Line | JSDoc |
|---|---|---|
| `approvedSourceCache` | 35 | Yes — inline `/** ... */` |
| `accountBalancesPerToken` | 37 | Yes — inline `/** ... */` |
| `client` | 42 | Yes — inline `/** ... */` |
| `lp3TrackList` | 44 | Yes — inline `/** ... */` |
| `liquidityEvents` | 46 | Yes — inline `/** ... */` |

### Constructor
- **Line 54:** `constructor` (line 54-72) — JSDoc with `@param` for all 4 parameters (lines 48-53).

### Public Methods
| Method | Line | JSDoc Present | `@param` | `@returns` |
|---|---|---|---|---|
| `isApprovedSource` | 81 | Yes (74-80) | Yes (`source`, `retries`) | Yes |
| `processTransfer` | 162 | Yes (157-161) | Yes (`transfer`) | No (void implied) |
| `transferIsDeposit` | 241 | Yes (236-240) | Yes (`transfer`) | Yes |
| `transferIsWithdraw` | 264 | Yes (259-263) | Yes (`transfer`) | Yes |
| `getUniqueAddresses` | 286 | Yes (282-285) | No (no params) | Yes |
| `getEligibleBalances` | 309 | Yes (304-308) | No (no params) | Yes |
| `calculateTotalEligibleBalances` | 386 | Yes (381-385) | Yes (`balances`) | Yes |
| `getTokensWithBalance` | 408 | Yes (403-407) | Yes (`balances`) | Yes |
| `calculateRewardsPoolsPerToken` | 426 | Yes (419-425) | Yes (`balances`, `rewardPool`) | Yes |
| `calculateRewards` | 477 | Yes (471-476) | Yes (`rewardPool`) | Yes |
| `organizeLiquidityPositions` | 513 | Yes (508-512) | Yes (`liquidityChangeEvent`) | No (void implied) |
| `processLiquidityPositions` | 545 | Yes (540-544) | Yes (`liquidityChangeEvent`) | No (void implied) |
| `processLpRange` | 618 | Yes (613-617) | No (no params) | No (void implied) |

### Private Methods
| Method | Line | JSDoc Present |
|---|---|---|
| `updateSnapshots` | 147 | Yes (143-146) |

### Constants / Imports Referenced
- `ONE_18` from `./constants` (line 26)
- `BOUNTY_PERCENT` from `./constants` (line 26)
- `RETRY_BASE_DELAY_MS` from `./constants` (line 26)
- `getPoolsTick` from `./liquidity` (line 27)
- `REWARDS_SOURCES`, `FACTORIES`, `isSameAddress`, `CYTOKENS`, `scaleTo18` from `./config` (lines 8-13)

---

## Findings

### DOC-PROC-01: `transferIsDeposit` visibility mismatch with JSDoc [INFO]

**Lines:** 241
**Description:** `transferIsDeposit` has no explicit access modifier, making it implicitly public in TypeScript. The method's JSDoc describes it as checking "if a transfer corresponds to an LP deposit" but does not indicate this is primarily an internal helper called from `processTransfer`. The same applies to `transferIsWithdraw` (line 264). Both are called only from `processTransfer` internally, suggesting they should be `private` — or if intentionally public (e.g. for testing), the JSDoc should note that.

**Severity:** INFO — no functional impact, but the public surface is larger than necessary.

---

### DOC-PROC-02: `getEligibleBalances` JSDoc says "Three passes" but describes only two concerns [LOW]

**Lines:** 304-308
**Description:** The JSDoc says "Three passes: (1) average snapshot balances, (2) penalties/bounties, (3) final balances scaled to 18 decimals." This is accurate to the implementation, which does run three `for (const token of CYTOKENS)` loops (lines 314, 343, 365). However, the JSDoc `@returns` says `Token address -> user address -> TokenBalances` which is correct but does not mention that `final` can be negative if penalty exceeds average + bounty (there is no clamping to zero in the third pass at line 373). This is a documentation gap — a reader would expect `final` to be non-negative for "eligible balances," but the code allows negative values.

**Severity:** LOW — the downstream `calculateRewards` would produce negative reward amounts for penalized accounts, which may or may not be the intended design, but the JSDoc does not document this edge case.

---

### DOC-PROC-03: `getUniqueAddresses` JSDoc inaccurate — method is not async but JSDoc says nothing about return type [INFO]

**Lines:** 282-286
**Description:** The method signature is `getUniqueAddresses(): Set<string>` (synchronous), but at line 310 in `getEligibleBalances`, it is called as `await this.getUniqueAddresses()`. Using `await` on a non-Promise value is a no-op in JavaScript/TypeScript (it just wraps/unwraps the value), so this is functionally harmless but misleading. The JSDoc itself is accurate.

**Severity:** INFO — the `await` on a synchronous call at line 310 is a code quality issue (not a JSDoc issue per se), but a documentation audit should flag that the call-site implies the method is async when it is not.

---

### DOC-PROC-04: `processTransfer` JSDoc does not document non-deposit unapproved-source reversal logic [LOW]

**Lines:** 157-234
**Description:** The JSDoc for `processTransfer` (lines 157-161) says "Only credits the receiver if the sender is an approved source." and "Handles LP deposit/withdraw adjustments via linked liquidity events." However, the implementation at lines 220-226 contains a non-obvious reversal: when a transfer is NOT a deposit AND the source IS approved, the code *subtracts* the value from the receiver's `transfersInFromApproved` and recalculates the balance. This happens in the `else` branch after the deposit check for the sender's accounting. This reversal logic — which effectively "un-credits" the receiver when tracking the sender's outflow — is a critical part of the double-entry bookkeeping but is not documented in the JSDoc.

**Severity:** LOW — the un-crediting reversal at lines 220-226 is the most counterintuitive part of the transfer processing algorithm and should be documented.

---

### DOC-PROC-05: `processLiquidityPositions` JSDoc omits that only `Transfer`-type changes update `currentNetBalance` [LOW]

**Lines:** 540-611
**Description:** The JSDoc says "Processes a liquidity change event, updating the owner's balance and snapshot records." However, the implementation at lines 577-579 only updates `ownerBalance.currentNetBalance` when `changeType === LiquidityChangeType.Transfer`. For `Deposit` and `Withdraw` types, the `currentNetBalance` is NOT modified here — those are handled indirectly via `processTransfer` when the corresponding ERC-20 transfer is processed. This distinction is important for understanding the interplay between the two processing functions but is not documented.

**Severity:** LOW — the conditional balance update is a key design decision that should be documented to prevent misunderstanding.

---

### DOC-PROC-06: `processLpRange` JSDoc does not describe the quadruple-nested iteration or O(positions * accounts * tokens * snapshots) complexity [INFO]

**Lines:** 613-655
**Description:** The JSDoc for `processLpRange` says it "Deducts out-of-range V3 LP positions from snapshot balances" and "Queries on-chain pool ticks at each snapshot block," which is accurate. However, the method iterates over all snapshots, then all tokens, then all accounts, then all tracked LP positions (lines 620-653) — a quadruple-nested loop. The matching is done by string prefix comparison of a composite key (line 642). For a documentation review this is informational — the complexity and matching strategy could be noted.

**Severity:** INFO

---

### DOC-PROC-07: Constructor JSDoc says "Sorted array of 30 block numbers" but does not validate [INFO]

**Lines:** 48-49
**Description:** The `@param snapshots` documentation states "Sorted array of 30 block numbers to sample balances at." The constructor does not validate that the array is sorted or has exactly 30 elements. While `generateSnapshotBlocks()` in config.ts guarantees this, the constructor's JSDoc makes a claim it does not enforce. This is informational — the validation belongs at the call site, but documenting the requirement without enforcing it could mislead someone constructing `Processor` directly.

**Severity:** INFO

---

### DOC-PROC-08: `calculateRewardsPoolsPerToken` JSDoc describes "inverse-fraction weighting" but does not explain the formula [LOW]

**Lines:** 419-425
**Description:** The JSDoc says "Splits the reward pool across tokens using inverse-fraction weighting. Tokens with smaller total balances receive a larger share of rewards." While directionally correct, the actual formula is: for each token, compute `inverseFraction = (sumOfAllBalances * ONE_18) / tokenBalance`, then each token's share is `(inverseFraction * rewardPool) / sumOfInverseFractions`. This is a proportional-to-inverse-balance allocation. The JSDoc does not mention the fixed-point scaling via `ONE_18` or the normalization step. For a financial calculation, the formula should be documented.

**Severity:** LOW — financial formulas in reward distribution code benefit from precise documentation of the mathematics.

---

### DOC-PROC-09: `updateSnapshots` JSDoc does not document the forward-fill semantics [INFO]

**Lines:** 143-154
**Description:** The JSDoc says "Updates snapshot balances for an account at all snapshots at or after the given block." This is accurate. It also notes "Clamps negative balances to zero." This is accurate for the clamping of `currentNetBalance` at line 148. However, it does not explicitly state the forward-fill semantics: once a balance is set at snapshot N, it is also set at snapshots N+1, N+2, etc. until a later call overwrites them. This is the intended design (latest balance carries forward) but could be made more explicit.

**Severity:** INFO

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH | 0 |
| MEDIUM | 0 |
| LOW | 4 |
| INFO | 5 |

Overall, the documentation in `processor.ts` is thorough. Every public method, private method, private field, the constructor, and the class/module all have JSDoc comments. The JSDoc is broadly accurate. The LOW findings relate to edge cases and non-obvious implementation details that are undocumented in the JSDoc (negative final balances, un-crediting reversal logic, conditional `currentNetBalance` updates, and the inverse-fraction formula). No CRITICAL, HIGH, or MEDIUM documentation issues were found.
