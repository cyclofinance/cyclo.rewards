# Pass 3 -- Documentation Audit: `src/types.ts`

**Auditor Agent:** A09
**Date:** 2026-03-22
**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/types.ts`

---

## 1. Inventory of Types, Interfaces, and Enums

| Line | Symbol | Kind | Exported |
|------|--------|------|----------|
| 6 | `CyToken` | `interface` | Yes |
| 20 | `Transfer` | `interface` | Yes |
| 31 | `AccountBalance` | `interface` | Yes |
| 47 | `TokenBalances` | `interface` | Yes |
| 63 | `EligibleBalances` | `type` alias | Yes |
| 66 | `RewardsPerToken` | `type` alias | Yes |
| 69 | `LiquidityChangeType` | `enum` | Yes |
| 76 | `LiquidityChangeBase` | `interface` | Yes |
| 91 | `LiquidityChangeV2` | `type` (intersection) | Yes |
| 96 | `LiquidityChangeV3` | `type` (intersection) | Yes |
| 110 | `LiquidityChange` | `type` (union) | Yes |
| 113 | `BlocklistReport` | `interface` | Yes |
| 119 | `LpV3Position` | `interface` | Yes |

**Total: 13 exported types/interfaces/enums.**

---

## 2. Module-Level Documentation

Lines 1-3 contain:
```typescript
/**
 * Shared TypeScript interfaces and types for the Cyclo rewards pipeline.
 */
```

**Verdict:** Present and accurate. Correctly describes the file's purpose.

---

## 3. Type-by-Type Documentation Audit

### `CyToken` (line 6)

**JSDoc present (line 5):** `/** Cyclo token definition with contract addresses and decimal precision */`

Field-level JSDoc:
- `name` (line 7) -- **No JSDoc.** Self-explanatory but inconsistent with other fields.
- `address` (line 8) -- **No JSDoc.** Ambiguous: is this the vault contract? The ERC-20 token? Cross-referencing `config.ts` shows it is the cyToken contract address (e.g., the cysFLR contract).
- `underlyingAddress` (line 10) -- JSDoc present: `/** Address of the underlying asset (e.g., sFLR, WETH, FXRP) */` -- Accurate.
- `underlyingSymbol` (line 12) -- JSDoc present: `/** Symbol of the underlying asset (e.g., "sFLR", "WETH", "FXRP") */` -- Accurate.
- `receiptAddress` (line 14) -- JSDoc present: `/** Address of the receipt token issued on deposit */` -- Accurate.
- `decimals` (line 16) -- JSDoc present: `/** Number of decimal places for the token (e.g., 18 for cysFLR, 6 for cyFXRP) */` -- Accurate.

**[A09-DOC-001] `CyToken.name` and `CyToken.address` fields lack JSDoc.**
Severity: LOW
`name` is self-explanatory but `address` is ambiguous -- it could mean the underlying asset address, the receipt address, or the main contract address. The other 4 fields all have JSDoc, making the gap inconsistent.

### `Transfer` (line 20)

**JSDoc present (line 19):** `/** On-chain ERC-20 transfer event parsed from the subgraph */` -- Accurate.

Field-level JSDoc:
- `from` (line 21) -- No JSDoc. Self-explanatory.
- `to` (line 22) -- No JSDoc. Self-explanatory.
- `value` (line 24) -- JSDoc present: `/** Transfer amount as a decimal string (not yet parsed to BigInt) */` -- Accurate. This is an important note since the type is `string`, not `bigint`.
- `blockNumber` (line 25) -- No JSDoc. Self-explanatory.
- `timestamp` (line 26) -- No JSDoc. Self-explanatory.
- `tokenAddress` (line 27) -- No JSDoc. Self-explanatory.
- `transactionHash` (line 28) -- No JSDoc. Self-explanatory.

No findings. The JSDoc on `value` captures the most important non-obvious detail, and the rest are standard ERC-20 event fields.

### `AccountBalance` (line 31)

**JSDoc present (line 31):** `/** Per-account running balance for a single token, updated during transfer processing */` -- Accurate.

Field-level JSDoc:
- `transfersInFromApproved` (line 34) -- JSDoc: `/** Cumulative value received from approved sources (DEX routers, LP deposits) */` -- Accurate.
- `transfersOut` (line 36) -- JSDoc: `/** Cumulative value sent out */` -- Accurate.
- `netBalanceAtSnapshots` (line 38) -- JSDoc: `/** Balance snapshot at each of the 30 deterministic snapshot blocks */` -- Accurate.
- `currentNetBalance` (line 40) -- JSDoc: `/** Running net balance (transfersInFromApproved - transfersOut) */`

**[A09-DOC-002] `AccountBalance.currentNetBalance` JSDoc states an invariant that does not hold for LP transfer events.**
Severity: MEDIUM
The JSDoc says `currentNetBalance` equals `transfersInFromApproved - transfersOut`. This is true in `processTransfer()` (processor.ts lines 208-209, 222-223, 228-229) where every update recalculates `currentNetBalance = transfersInFromApproved - transfersOut`. However, in `processLiquidityPositions()` (processor.ts line 577-578), when `changeType === LiquidityChangeType.Transfer`, the code does:
```typescript
ownerBalance.currentNetBalance += depositedBalanceChange;
```
This directly mutates `currentNetBalance` without updating `transfersInFromApproved` or `transfersOut`, breaking the stated invariant. After an LP transfer event, `currentNetBalance != transfersInFromApproved - transfersOut`.

This is a documentation-vs-code mismatch. The documented invariant is misleading for anyone maintaining `processLiquidityPositions`.

### `TokenBalances` (line 47)

**JSDoc present (lines 43-46):**
```typescript
/**
 * Aggregated balance data for a single account and token after all transfers are processed.
 * `final` is in the token's native decimals; `final18` is scaled to 18 decimals for cross-token comparison.
 */
```
Accurate. Correctly distinguishes `final` vs `final18` semantics.

Field-level JSDoc:
- `snapshots` (line 49) -- JSDoc: `/** Balance at each snapshot block */` -- Accurate.
- `average` (line 51) -- JSDoc: `/** Mean of snapshot balances */` -- Accurate.
- `penalty` (line 53) -- JSDoc: `/** Amount penalized (blocklisted accounts forfeit their average) */` -- Accurate; verified at processor.ts line 356.
- `bounty` (line 55) -- JSDoc: `/** Bounty received for reporting a blocklisted account */` -- Accurate.
- `final` (line 57) -- JSDoc: `/** Final reward-eligible balance in native token decimals: average - penalty + bounty */` -- Accurate; verified at processor.ts line 373.
- `final18` (line 59) -- JSDoc: `/** Final balance scaled to 18 decimal places */` -- Accurate; verified at processor.ts line 374.

No findings. This is well-documented.

### `EligibleBalances` (line 63)

**JSDoc present (line 62):** `/** Token address → user address → balances */` -- Accurate.

No findings. Properly uses JSDoc (improved from the inline comment noted in prior audit A08-DOC-009).

### `RewardsPerToken` (line 66)

**JSDoc present (line 65):** `/** Token address → user address → reward amount (wei) */` -- Accurate.

No findings. Properly uses JSDoc.

### `LiquidityChangeType` (line 69)

**JSDoc present (line 68):** `/** Type of liquidity position change event from the subgraph */` -- Accurate.

Enum values: `Deposit = 'DEPOSIT'`, `Transfer = 'TRANSFER'`, `Withdraw = 'WITHDRAW'` -- No per-value JSDoc.

**[A09-DOC-003] `LiquidityChangeType` enum values lack JSDoc explaining semantics.**
Severity: LOW
The distinction between these values has significant processing implications. `Deposit` and `Withdraw` are handled via the transfer processing path (matched against ERC-20 transfers), while `Transfer` is handled directly in `processLiquidityPositions` by modifying `currentNetBalance`. This semantic difference is non-obvious and warrants per-value documentation.

### `LiquidityChangeBase` (line 76)

**JSDoc present (line 75):** `/** Common fields for all liquidity change events (V2 and V3) */` -- Accurate.

Field-level JSDoc:
- `tokenAddress` (line 77) -- No JSDoc.
- `lpAddress` (line 78) -- No JSDoc.
- `owner` (line 79) -- No JSDoc.
- `changeType` (line 80) -- No JSDoc.
- `liquidityChange` (line 82) -- JSDoc: `/** Change in pool liquidity units as a decimal string */` -- Accurate.
- `depositedBalanceChange` (line 84) -- JSDoc: `/** Change in deposited token balance as a decimal string (positive for deposits, negative for withdrawals) */` -- Accurate; confirmed by processor.ts line 551-552.
- `blockNumber` (line 85) -- No JSDoc.
- `timestamp` (line 86) -- No JSDoc.
- `transactionHash` (line 87) -- No JSDoc.

**[A09-DOC-004] `LiquidityChangeBase.lpAddress` field is not documented.**
Severity: LOW
Unlike `tokenAddress` and `owner` which are standard terms, `lpAddress` is ambiguous -- it could refer to the LP token address, the liquidity pool address, or the LP provider's address. From usage in processor.ts, this appears to be the LP token/pool address. Should be clarified.

### `LiquidityChangeV2` (line 91)

**JSDoc present (line 90):** `/** Uniswap V2 liquidity change event */` -- Accurate.

Discriminant field: `__typename: "LiquidityV2Change"` -- No JSDoc but type literal is self-documenting.

No findings.

### `LiquidityChangeV3` (line 96)

**JSDoc present (line 95):** `/** Uniswap V3 liquidity change event with concentrated liquidity position data */` -- Accurate.

Field-level JSDoc:
- `__typename` (line 97) -- No JSDoc. Discriminant, self-documenting.
- `tokenId` (line 99) -- JSDoc: `/** NFT token ID identifying the V3 position */` -- Accurate.
- `poolAddress` (line 100) -- **No JSDoc.**
- `fee` (line 102) -- JSDoc: `/** Pool fee tier (e.g., 3000 = 0.3%) */` -- Accurate.
- `lowerTick` (line 104) -- JSDoc: `/** Lower tick boundary of the concentrated liquidity range */` -- Accurate.
- `upperTick` (line 106) -- JSDoc: `/** Upper tick boundary of the concentrated liquidity range */` -- Accurate.

**[A09-DOC-005] `LiquidityChangeV3.poolAddress` field lacks JSDoc.**
Severity: LOW
All other V3-specific fields have JSDoc. `poolAddress` is the only gap. While the name is reasonably self-explanatory, the inconsistency is notable. This field is important for V3 in-range tick calculations (used to group positions by pool for multicall queries).

### `LiquidityChange` (line 110)

**JSDoc present (line 109):** `/** Discriminated union of V2 and V3 liquidity change events */` -- Accurate. Correctly identifies the union pattern.

No findings.

### `BlocklistReport` (line 113)

**JSDoc present (line 112):** `/** Entry from data/blocklist.txt: a reporter who flagged a cheating account */` -- Accurate.

Field-level JSDoc:
- `reporter` (line 114) -- No JSDoc. Self-explanatory from interface-level doc.
- `cheater` (line 115) -- No JSDoc. Self-explanatory from interface-level doc.

No findings. The interface-level doc provides sufficient context.

### `LpV3Position` (line 119)

**JSDoc present (line 118):** `/** Tracked Uniswap V3 LP position for in-range tick calculations */` -- Accurate.

Field-level JSDoc:
- `pool` (line 121) -- No JSDoc. Self-explanatory.
- `value` (line 122) -- JSDoc: `/** Deposited balance in the position */` -- Partially accurate.
- `lowerTick` (line 123) -- No JSDoc. Same concept as in `LiquidityChangeV3`, documented there.
- `upperTick` (line 124) -- No JSDoc. Same concept as in `LiquidityChangeV3`, documented there.

**[A09-DOC-006] `LpV3Position.value` JSDoc is imprecise.**
Severity: LOW
The JSDoc says "Deposited balance in the position" but `value` is actually a running cumulative total of `depositedBalanceChange` across all liquidity events for the position (processor.ts line 604: `prev.value += depositedBalanceChange`). Since `depositedBalanceChange` can be negative (withdrawals), `value` is the *net* deposited balance, not merely "deposited balance." The distinction matters because this value is subtracted from snapshot balances during in-range checks (processor.ts line 647).

---

## 4. Summary

| ID | Severity | Description |
|----|----------|-------------|
| A09-DOC-001 | LOW | `CyToken.name` and `CyToken.address` fields lack JSDoc; `address` is ambiguous |
| A09-DOC-002 | MEDIUM | `AccountBalance.currentNetBalance` JSDoc states invariant `transfersInFromApproved - transfersOut` which is broken by LP transfer events in `processLiquidityPositions` |
| A09-DOC-003 | LOW | `LiquidityChangeType` enum values lack per-value JSDoc explaining processing semantics |
| A09-DOC-004 | LOW | `LiquidityChangeBase.lpAddress` is ambiguous without JSDoc |
| A09-DOC-005 | LOW | `LiquidityChangeV3.poolAddress` lacks JSDoc (inconsistent with other V3 fields) |
| A09-DOC-006 | LOW | `LpV3Position.value` JSDoc says "deposited balance" but it is actually the net cumulative balance |

**Overall assessment:** The file is well-documented compared to the prior audit (A08, 2026-02-24). The previous audit found zero JSDoc on any type; now every interface/type/enum has interface-level JSDoc and most critical fields have field-level JSDoc. The `TokenBalances` interface is particularly well-documented with the formula derivation. The one MEDIUM finding (A09-DOC-002) is a genuine documentation-code mismatch that could mislead maintainers.
