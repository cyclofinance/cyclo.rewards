# Audit Report: `src/types.ts` — Documentation Review

**Audit ID:** 2026-02-23-01
**Pass:** 3 (Documentation)
**Agent:** A08
**File:** `src/types.ts` (123 lines)

## Inventory

The file contains the following exported type definitions, **none of which have any JSDoc comments**:

| # | Kind | Name | Fields | Has JSDoc | Has Field Docs |
|---|------|------|--------|-----------|----------------|
| 1 | interface | `CyToken` | 5 | No | No |
| 2 | interface | `Transfer` | 6 | No | No |
| 3 | interface | `TransferDetail` | 2 | No | No |
| 4 | interface | `AccountBalance` | 4 | No | No |
| 5 | interface | `Report` | 2 | No | No |
| 6 | interface | `AccountSummary` | 7 (with nested objects) | No | No |
| 7 | interface | `TokenBalances` | 5 | No | No |
| 8 | type alias | `EligibleBalances` | N/A (Map) | No | Inline comment |
| 9 | type alias | `RewardsPerToken` | N/A (Map) | No | Inline comment |
| 10 | interface | `TransferRecord` | 6 | No | No |
| 11 | interface | `AccountTransfers` | 2 | No | No |
| 12 | enum | `LiquidityChangeType` | 3 members | No | No |
| 13 | type alias | `LiquidityChangeBase` | 8 | No | No |
| 14 | type alias | `LiquidityChangeV2` | 1 (+ base) | No | No |
| 15 | type alias | `LiquidityChangeV3` | 5 (+ base) | No | No |
| 16 | type alias | `LiquidityChange` | N/A (union) | No | No |
| 17 | type alias | `Epoch` | 3 | No | Inline comments on 2 of 3 fields |

---

## Findings

### A08-1 — LOW — `CyToken` interface has no documentation

**Lines 1-7.** The `CyToken` interface has no JSDoc comment describing what it represents (a cyToken definition on the Flare Network) and none of its five fields (`name`, `address`, `underlyingAddress`, `underlyingSymbol`, `receiptAddress`) have descriptions. In particular:

- The distinction between `address` and `underlyingAddress` is not documented. A reader must consult `config.ts` to understand that `address` is the cyToken contract address while `underlyingAddress` is the address of the underlying asset (e.g., WFLR, WETH).
- `receiptAddress` has no explanation of what "receipt" means in this context.

### A08-2 — LOW — `Transfer` interface has no documentation

**Lines 9-16.** The `Transfer` interface has no JSDoc comment. It represents a raw ERC-20 transfer event scraped from the subgraph, but this is not stated. Fields `from`, `to`, `value`, `blockNumber`, `timestamp`, and `tokenAddress` are self-explanatory by name but lack any formal documentation. Notably, `value` is typed as `string` (presumably a stringified BigInt) but there is no comment explaining the encoding or units.

### A08-3 — LOW — `TransferDetail` interface has no documentation

**Lines 18-21.** No JSDoc. The relationship between `TransferDetail` and `Transfer` is unclear from the type definition alone. `fromIsApprovedSource` is a domain-critical concept (approved DEX routers) that deserves a brief description.

### A08-4 — LOW — `AccountBalance` interface has no documentation

**Lines 23-28.** No JSDoc. This interface tracks the evolving balance state for an account during snapshot processing. Key fields lack explanations:

- `transfersInFromApproved` — Not documented that this only counts inflows from approved DEX sources.
- `transfersOut` — Not documented whether this counts all outflows or only certain ones.
- `netBalanceAtSnapshots` — Not documented that this is an array of 30 entries corresponding to snapshot blocks.
- `currentNetBalance` — Not documented as the running balance between snapshots.

### A08-5 — LOW — `Report` interface has no documentation

**Lines 30-33.** No JSDoc. The interface represents a blocklist penalty/bounty entry but this is not stated. The terms `reporter` and `cheater` are domain-specific and should be explained (e.g., from `data/blocklist.txt`).

### A08-6 — MEDIUM — `AccountSummary` interface has no documentation and contains complex nested structure

**Lines 35-56.** No JSDoc. This is the most complex interface in the file with deeply nested objects inside `reports.asReporter[]` and `reports.asCheater[]`. None of the following are documented:

- What `AccountSummary` represents as a whole (a per-account output summary for CSV generation).
- What `balanceAtSnapshot1` and `balanceAtSnapshot2` mean — the names are misleading because there are 30 snapshots, not 2. A reader cannot determine from the type alone what "snapshot 1" and "snapshot 2" refer to.
- The nested `reports` structure with its `asReporter` and `asCheater` arrays and their respective `penalizedAmount` and `bountyAwarded` fields.
- Whether string-typed numeric fields (`balanceAtSnapshot1`, `averageBalance`, `penalty`, `bounty`, `finalBalance`) are formatted for human readability or are raw BigInt strings.

### A08-7 — LOW — `TokenBalances` interface has no documentation

**Lines 58-64.** No JSDoc. Represents per-token balance aggregation results but this is not stated. The `snapshots` array, `average`, `penalty`, `bounty`, and `final` fields have no descriptions. The relationship between `penalty`, `bounty`, and `final` (i.e., that `final = average - penalty + bounty`) is not documented.

### A08-8 — INFO — `EligibleBalances` and `RewardsPerToken` have inline comments but no JSDoc

**Lines 66 and 68.** These type aliases have trailing inline comments (`// token address -> user address -> balances` and `// token address -> user address -> reward`) which provide useful information. However, they lack formal JSDoc documentation. The inline comments are adequate for understanding, making this informational rather than a deficiency.

### A08-9 — LOW — `TransferRecord` interface has no documentation and overlaps with `Transfer`

**Lines 70-77.** No JSDoc. This interface is nearly identical to `Transfer` but adds an optional `fromIsApprovedSource` field. The reason for having both `Transfer` and `TransferRecord` as separate types is not documented. A reader cannot tell when to use one versus the other without tracing through the codebase.

### A08-10 — LOW — `AccountTransfers` interface has no documentation

**Lines 79-82.** No JSDoc. Represents the transfer history for an account (inflows and outflows) but this is not stated. The asymmetry between `transfersIn: TransferDetail[]` (which includes `fromIsApprovedSource`) and `transfersOut: { value: string }[]` (an anonymous inline type with only `value`) is not explained.

### A08-11 — LOW — `LiquidityChangeType` enum has no documentation

**Lines 84-88.** No JSDoc. The three members (`Deposit`, `Transfer`, `Withdraw`) are self-explanatory but the enum itself has no description of what kind of liquidity changes these represent (Uniswap V2/V3 LP position changes).

### A08-12 — LOW — `LiquidityChangeBase`, `LiquidityChangeV2`, `LiquidityChangeV3`, and `LiquidityChange` have no documentation

**Lines 90-114.** No JSDoc on any of these four type definitions. Key undocumented aspects:

- `LiquidityChangeBase`: The fields `lpAddress`, `liquidityChange`, and `depositedBalanceChange` are domain-specific and not self-explanatory. `liquidityChange` as a string (presumably a BigInt) is not documented in terms of units or encoding.
- `LiquidityChangeV2`: The `__typename` discriminant field pattern (matching GraphQL response shapes) is not explained.
- `LiquidityChangeV3`: The V3-specific fields (`tokenId`, `poolAddress`, `fee`, `lowerTick`, `upperTick`) are Uniswap V3 concepts that would benefit from brief descriptions. In particular, `fee` could be documented as the pool fee tier, and `lowerTick`/`upperTick` as the concentrated liquidity range boundaries.
- `LiquidityChange`: The union type has no documentation explaining it as a discriminated union on `__typename`.

### A08-13 — LOW — `Epoch` type alias has partial inline documentation

**Lines 116-122.** The `Epoch` type has inline comments on `length` ("number of days in the epoch") and `timestamp` ("epoch timestamp") but not on `date` (which is optional and appears to be a human-readable date string). There is no JSDoc on the type itself explaining what an Epoch represents in the reward distribution context.

---

## Summary

| Severity | Count |
|----------|-------|
| MEDIUM   | 1     |
| LOW      | 11    |
| INFO     | 1     |
| **Total** | **13** |

The file contains **zero JSDoc comments** across 17 exported type definitions. Every interface, type alias, and enum lacks a top-level description. Only 3 out of approximately 60 total fields/properties have any form of documentation (inline comments on `EligibleBalances`, `RewardsPerToken`, and two fields of `Epoch`).

The most significant documentation gap is **A08-6** (`AccountSummary`) which is the most complex type in the file with nested structures and ambiguously named fields (`balanceAtSnapshot1`, `balanceAtSnapshot2`) that do not self-document.

The file also exhibits a structural documentation issue: the relationship and distinction between `Transfer`, `TransferDetail`, `TransferRecord`, and `AccountTransfers` is not documented anywhere in the type definitions, requiring a reader to trace usage through the codebase to understand the data flow.
