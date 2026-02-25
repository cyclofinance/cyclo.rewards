# Pass 3 -- Documentation Audit: `src/types.ts`

**Auditor Agent:** A08
**Date:** 2026-02-24
**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/types.ts`

---

## 1. Inventory of Types, Interfaces, and Enums

| Line | Symbol | Kind | Exported |
|------|--------|------|----------|
| 1 | `CyToken` | `interface` | Yes |
| 10 | `Transfer` | `interface` | Yes |
| 20 | `TransferDetail` | `interface` | Yes |
| 25 | `AccountBalance` | `interface` | Yes |
| 32 | `Report` | `interface` | Yes |
| 37 | `AccountSummary` | `interface` | Yes |
| 60 | `TokenBalances` | `interface` | Yes |
| 69 | `EligibleBalances` | `type` alias | Yes |
| 71 | `RewardsPerToken` | `type` alias | Yes |
| 73 | `TransferRecord` | `interface` | Yes |
| 83 | `AccountTransfers` | `interface` | Yes |
| 88 | `LiquidityChangeType` | `enum` | Yes |
| 94 | `LiquidityChangeBase` | `type` | Yes |
| 106 | `LiquidityChangeV2` | `type` | Yes |
| 110 | `LiquidityChangeV3` | `type` | Yes |
| 119 | `LiquidityChange` | `type` (union) | Yes |
| 121 | `Epoch` | `type` | Yes |

**Total: 17 exported types/interfaces/enums.**

---

## 2. Module-Level Documentation

**[A08-DOC-001] No module-level JSDoc or header comment.**
Severity: Low
This file defines all shared TypeScript types for the rewards calculator. There is no module-level comment explaining that this is the central type definition file or providing an overview of the domain model.

---

## 3. Type-by-Type Documentation Audit

### `CyToken` (line 1)

**[A08-DOC-002] `CyToken` interface has no JSDoc.**
Severity: Medium
This is a core domain type representing a Cyclo token (cysFLR, cyWETH). Its fields are not documented:
- `name` -- human-readable token name
- `address` -- the cyToken contract address
- `underlyingAddress` -- the underlying asset address (e.g., sFLR for cysFLR)
- `underlyingSymbol` -- symbol of the underlying asset
- `receiptAddress` -- unclear purpose without documentation; likely the receipt/vault token address
- `decimals` -- token decimal places

The `receiptAddress` field in particular needs documentation as its purpose is not self-evident.

### `Transfer` (line 10)

**[A08-DOC-003] `Transfer` interface has no JSDoc.**
Severity: Low
Represents a token transfer event after flattening from the subgraph format. Fields are self-explanatory from names, but the relationship to `SubgraphTransfer` in `scraper.ts` is not documented.

### `TransferDetail` (line 20)

**[A08-DOC-004] `TransferDetail` interface has no JSDoc.**
Severity: Low
Used to track individual incoming transfers with their approved-source status. The `value` field is a `string` (not `bigint`), which is a design choice that should be documented.

### `AccountBalance` (line 25)

**[A08-DOC-005] `AccountBalance` interface has no JSDoc.**
Severity: Medium
This is a key data structure for the balance tracking logic. Fields need explanation:
- `transfersInFromApproved` -- cumulative value of incoming transfers from approved sources (DEX routers)
- `transfersOut` -- cumulative value of outgoing transfers
- `netBalanceAtSnapshots` -- balance sampled at each deterministic snapshot block
- `currentNetBalance` -- running balance derived from `transfersInFromApproved - transfersOut`

The relationship between these fields (particularly that `currentNetBalance = transfersInFromApproved - transfersOut`) is a critical invariant that is only discoverable by reading `processor.ts`.

### `Report` (line 32)

**[A08-DOC-006] `Report` interface has no JSDoc.**
Severity: Low
Represents a blocklist entry. Fields are self-explanatory. Note: this type is defined but does not appear to be used directly in `processor.ts`, which instead uses an inline `{ reporter: string; cheater: string }` type. This redundancy could be documented or resolved.

### `AccountSummary` (line 37)

**[A08-DOC-007] `AccountSummary` interface has no JSDoc.**
Severity: Low
A detailed summary of an account's reward status including nested report structures. This type appears to be unused in the current codebase (not referenced in `processor.ts`, `index.ts`, or `scraper.ts`). If it is legacy or reserved for future use, that should be documented.

### `TokenBalances` (line 60)

**[A08-DOC-008] `TokenBalances` interface has no JSDoc.**
Severity: Medium
Represents the computed balance breakdown for one account for one token. The distinction between `final` (native decimals) and `final18` (scaled to 18 decimals) is a critical detail that is not documented. Fields:
- `snapshots` -- balance at each snapshot block
- `average` -- mean of snapshot balances
- `penalty` -- amount deducted due to blocklist
- `bounty` -- amount awarded for reporting
- `final` -- `average - penalty + bounty` (native token decimals)
- `final18` -- `final` scaled to 18 decimal places

### `EligibleBalances` (line 69)

**[A08-DOC-009] `EligibleBalances` type alias has partial inline documentation.**
Severity: Low
The type is defined as:
```typescript
export type EligibleBalances = Map<string, Map<string, TokenBalances>>; // token address -> user address -> balances
```
The trailing comment provides a key mapping explanation. This is helpful but not JSDoc -- it will not appear in IDE tooltips or generated documentation.

### `RewardsPerToken` (line 71)

**[A08-DOC-010] `RewardsPerToken` type alias has partial inline documentation.**
Severity: Low
Same pattern as `EligibleBalances`:
```typescript
export type RewardsPerToken = Map<string, Map<string, bigint>>; // token address -> user address -> reward
```
Helpful trailing comment, but not JSDoc.

### `TransferRecord` (line 73)

**[A08-DOC-011] `TransferRecord` interface has no JSDoc.**
Severity: Low
Very similar to `Transfer` but adds an optional `fromIsApprovedSource` field. The distinction between `Transfer` and `TransferRecord` is unclear without documentation. This type does not appear to be used in the core pipeline.

### `AccountTransfers` (line 83)

**[A08-DOC-012] `AccountTransfers` interface has no JSDoc.**
Severity: Low
Tracks incoming and outgoing transfers per account. The asymmetry between `transfersIn: TransferDetail[]` (includes approval status) and `transfersOut: { value: string }[]` (anonymous type, no approval status) is a design choice that should be documented.

### `LiquidityChangeType` (line 88)

**[A08-DOC-013] `LiquidityChangeType` enum has no JSDoc.**
Severity: Low
Enum with three values: `Deposit`, `Transfer`, `Withdraw`. The semantics of each value in the context of Uniswap V2/V3 LP operations are not documented. In particular, the distinction between a `Transfer` (LP token transfer between accounts) and the other types is domain-specific knowledge that warrants documentation.

### `LiquidityChangeBase` (line 94)

**[A08-DOC-014] `LiquidityChangeBase` type has no JSDoc.**
Severity: Low
Base type for liquidity change events. The `depositedBalanceChange` field name is somewhat confusing -- it represents the change in the user's deposited token balance (which can be positive or negative), not only deposits. This should be documented.

### `LiquidityChangeV2` (line 106)

**[A08-DOC-015] `LiquidityChangeV2` type has no JSDoc.**
Severity: Low
Discriminated union member for Uniswap V2 liquidity changes. No additional fields beyond base.

### `LiquidityChangeV3` (line 110)

**[A08-DOC-016] `LiquidityChangeV3` type has no JSDoc.**
Severity: Low
Discriminated union member for Uniswap V3 liquidity changes. Additional fields (`tokenId`, `poolAddress`, `fee`, `lowerTick`, `upperTick`) are specific to V3 concentrated liquidity positions and need documentation explaining their role in price-range eligibility checks.

### `LiquidityChange` (line 119)

**[A08-DOC-017] `LiquidityChange` union type has no JSDoc.**
Severity: Low
Union of V2 and V3 types. No documentation.

### `Epoch` (line 121)

**[A08-DOC-018] `Epoch` type has partial inline documentation.**
Severity: Low
The `Epoch` type has inline comments on its fields:
```typescript
export type Epoch = {
  // number of days in the epoch
  length: number;
  // epoch timestamp
  timestamp: number;
  date?: string;
};
```
These inline comments are accurate. However, the type itself has no JSDoc, and it does not appear to be used anywhere in the current codebase (`index.ts`, `processor.ts`, `scraper.ts`, `liquidity.ts`). If it is unused/legacy, that should be noted.

---

## 4. Inline Comment Accuracy

### [A08-DOC-019] Line 69: `// token address -> user address -> balances` -- accurate.
Severity: None

### [A08-DOC-020] Line 71: `// token address -> user address -> reward` -- accurate.
Severity: None

### [A08-DOC-021] Lines 122-125: Epoch field comments -- accurate.
Severity: None
The comments `// number of days in the epoch` and `// epoch timestamp` correctly describe the fields.

---

## 5. Potentially Unused Types

**[A08-DOC-022] Several types may be unused in the active codebase.**
Severity: Info
The following types are defined but may not be actively used in the core pipeline files:
- `Report` (line 32) -- `processor.ts` uses an inline type `{ reporter: string; cheater: string }` instead
- `AccountSummary` (line 37) -- not referenced in any of the five audited files
- `TransferRecord` (line 73) -- not referenced in any of the five audited files
- `Epoch` (line 121) -- not referenced in any of the five audited files

These may be used elsewhere (tests, other tooling) or may be legacy. Either way, their status should be documented.

---

## 6. Summary

| ID | Severity | Description |
|----|----------|-------------|
| A08-DOC-001 | Low | No module-level JSDoc |
| A08-DOC-002 | Medium | `CyToken` interface undocumented; `receiptAddress` purpose unclear |
| A08-DOC-003 | Low | `Transfer` interface undocumented |
| A08-DOC-004 | Low | `TransferDetail` interface undocumented |
| A08-DOC-005 | Medium | `AccountBalance` interface undocumented; field invariant not documented |
| A08-DOC-006 | Low | `Report` interface undocumented; possibly redundant with inline type in processor |
| A08-DOC-007 | Low | `AccountSummary` interface undocumented; possibly unused |
| A08-DOC-008 | Medium | `TokenBalances` interface undocumented; `final` vs `final18` distinction critical |
| A08-DOC-009 | Low | `EligibleBalances` has inline comment but no JSDoc |
| A08-DOC-010 | Low | `RewardsPerToken` has inline comment but no JSDoc |
| A08-DOC-011 | Low | `TransferRecord` undocumented; overlap with `Transfer` unclear |
| A08-DOC-012 | Low | `AccountTransfers` undocumented; asymmetric field types |
| A08-DOC-013 | Low | `LiquidityChangeType` enum undocumented |
| A08-DOC-014 | Low | `LiquidityChangeBase` undocumented; `depositedBalanceChange` name misleading |
| A08-DOC-015 | Low | `LiquidityChangeV2` undocumented |
| A08-DOC-016 | Low | `LiquidityChangeV3` undocumented; V3-specific fields need explanation |
| A08-DOC-017 | Low | `LiquidityChange` union type undocumented |
| A08-DOC-018 | Low | `Epoch` has inline field comments but no JSDoc; possibly unused |
| A08-DOC-019 | None | Line 69 inline comment accurate |
| A08-DOC-020 | None | Line 71 inline comment accurate |
| A08-DOC-021 | None | Lines 122-125 inline comments accurate |
| A08-DOC-022 | Info | Several types (`Report`, `AccountSummary`, `TransferRecord`, `Epoch`) may be unused |
