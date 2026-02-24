# Security Audit Pass 1 -- `src/types.ts`

**Auditor Agent:** A08
**Date:** 2026-02-22
**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/types.ts`
**Lines:** 123

---

## Evidence of Thorough Reading

### Module Summary

`src/types.ts` is a pure type-definition module. It exports interfaces, type aliases, and one enum. It contains no runtime logic, no functions, and no methods. All definitions are consumed by `scraper.ts`, `processor.ts`, `index.ts`, `diffCalculator.ts`, and associated tests.

### Exports Defined (with line numbers)

| Kind | Name | Lines |
|------|------|-------|
| interface | `CyToken` | 1-7 |
| interface | `Transfer` | 9-16 |
| interface | `TransferDetail` | 18-21 |
| interface | `AccountBalance` | 23-28 |
| interface | `Report` | 30-33 |
| interface | `AccountSummary` | 35-56 |
| interface | `TokenBalances` | 58-64 |
| type alias | `EligibleBalances` | 66 |
| type alias | `RewardsPerToken` | 68 |
| interface | `TransferRecord` | 70-77 |
| interface | `AccountTransfers` | 79-82 |
| enum | `LiquidityChangeType` | 84-88 |
| type alias | `LiquidityChangeBase` | 90-99 |
| type alias | `LiquidityChangeV2` | 101-103 |
| type alias | `LiquidityChangeV3` | 105-112 |
| type alias | `LiquidityChange` | 114 |
| type alias | `Epoch` | 116-122 |

### Functions/Methods

None. This file contains only type definitions.

### Constants

None defined directly. The enum `LiquidityChangeType` defines three string-valued members: `Deposit = 'DEPOSIT'`, `Transfer = 'TRANSFER'`, `Withdraw = 'WITHDRAW'`.

---

## Security Findings

### A08-1: Address fields lack branded/opaque typing -- address confusion risk (MEDIUM)

**Location:** Lines 2-6 (`CyToken`), 10-11 (`Transfer`), 31-32 (`Report`), 36 (`AccountSummary`), 70-71 (`TransferRecord`), 91-93 (`LiquidityChangeBase`)

**Description:** All address fields (`address`, `underlyingAddress`, `receiptAddress`, `from`, `to`, `owner`, `lpAddress`, `poolAddress`, `tokenAddress`, `reporter`, `cheater`) are typed as bare `string`. In a financial system with multiple categories of addresses (token contracts, user wallets, LP addresses, factory contracts, pool addresses), this creates a risk of passing the wrong address into the wrong context. TypeScript's structural typing means any `string` satisfies any of these fields without compile-time protection.

**Impact:** A developer could accidentally assign a user address to a `tokenAddress` field, or a pool address to an `owner` field, and the compiler would not catch it. In a rewards distribution system this could lead to misrouted funds.

**Recommendation:** Use branded types (also called nominal/opaque types) to distinguish address categories at compile time:

```typescript
type Address = string & { readonly __brand: unique symbol };
type TokenAddress = string & { readonly __brand: unique symbol };
```

This forces explicit casting at trust boundaries while preventing accidental mixing elsewhere.

---

### A08-2: Numeric value fields use `string` with no compile-time enforcement of format (MEDIUM)

**Location:** Lines 12 (`Transfer.value`), 19 (`TransferDetail.value`), 73 (`TransferRecord.value`), 81 (`AccountTransfers.transfersOut[].value`), 95-96 (`LiquidityChangeBase.liquidityChange`, `depositedBalanceChange`), and the `string` fields in `AccountSummary` (lines 37-42).

**Description:** Values representing token amounts are typed as `string` throughout. These strings are later passed to `BigInt()` for arithmetic (e.g., `processor.ts:135`: `const value = BigInt(transfer.value)`). The `string` type provides no compile-time guarantee that the value is a valid non-negative integer string. If a malformed value (e.g., `"0x..."` hex, `"-1"`, `"1.5"`, or empty string `""`) reaches `BigInt()`, it will either throw at runtime or produce an unexpected value. There is no validation at the deserialization boundary in `scraper.ts`.

**Impact:** A malformed or negative value from the subgraph could cause runtime crashes or incorrect reward calculations. Negative values passed to `BigInt()` would succeed silently and produce negative balances, potentially allowing an attacker with subgraph influence to manipulate reward distributions.

**Recommendation:** Either (a) convert to `bigint` at the deserialization boundary in the scraper and store `bigint` in the types, or (b) add a branded string type (e.g., `type Uint256String = string & { __uint256: true }`) with a validated constructor, or (c) add runtime validation (non-negative, integer, no hex prefix) when parsing in `scraper.ts`.

---

### A08-3: No `readonly` modifiers on any interface fields (LOW)

**Location:** All interfaces across the entire file (lines 1-122).

**Description:** None of the 18 exported types use `readonly` on any field. In a financial calculation pipeline, immutability of intermediate data is a defense against accidental mutation bugs. For example, `AccountBalance.netBalanceAtSnapshots` (line 26) is a mutable `bigint[]` -- any code with a reference could push, pop, or overwrite snapshot values after they have been computed, silently corrupting reward calculations.

**Impact:** Accidental mutation of balance arrays, transfer records, or address fields after construction could lead to incorrect reward distributions. The risk is mitigated by the deterministic CI pipeline that catches output drift, but the type system could provide earlier detection.

**Recommendation:** Mark all fields as `readonly` and use `readonly bigint[]` / `ReadonlyMap` for collection types. This provides compile-time protection against accidental mutation:

```typescript
export interface AccountBalance {
  readonly transfersInFromApproved: bigint;
  readonly transfersOut: bigint;
  readonly netBalanceAtSnapshots: readonly bigint[];
  readonly currentNetBalance: bigint;
}
```

---

### A08-4: `Transfer` and `TransferRecord` are near-duplicates with divergent optionality (LOW)

**Location:** `Transfer` (lines 9-16) vs `TransferRecord` (lines 70-77)

**Description:** `TransferRecord` duplicates all fields of `Transfer` and adds an optional `fromIsApprovedSource?: boolean` field. The two types are not related via `extends` or intersection, which means changes to one (e.g., adding a field) will not automatically propagate to the other. This creates a maintenance risk where the two types silently diverge.

**Impact:** If a field is added or renamed on `Transfer` but not on `TransferRecord` (or vice versa), serialization/deserialization of `.dat` files could silently drop data, potentially affecting reward calculations for historical data.

**Recommendation:** Define `TransferRecord` in terms of `Transfer`:

```typescript
export interface TransferRecord extends Transfer {
  fromIsApprovedSource?: boolean;
}
```

---

### A08-5: `blockNumber` and `timestamp` fields have no non-negative constraint (INFO)

**Location:** Lines 13-14 (`Transfer`), 74-75 (`TransferRecord`), 97-98 (`LiquidityChangeBase`), 120 (`Epoch.timestamp`)

**Description:** `blockNumber` and `timestamp` are typed as `number`. TypeScript's `number` type allows negative values, `NaN`, `Infinity`, and fractional values, all of which are invalid for block numbers and timestamps. These values originate from `parseInt()` calls on subgraph data in `scraper.ts` (lines 105-106), which returns `NaN` on invalid input.

**Impact:** If the subgraph returned a non-numeric string for `blockNumber` or `blockTimestamp`, `parseInt` would produce `NaN`, which would silently propagate through snapshot comparisons (`<`, `>`, `===` all return `false` with `NaN`), causing transfers to be silently skipped or misclassified. The likelihood is low given the subgraph data source, but the types provide no guard.

**Recommendation:** Add runtime validation after `parseInt` calls in `scraper.ts` to assert finite, non-negative integer results. A branded type (e.g., `type BlockNumber = number & { __blockNumber: true }`) would add compile-time protection.

---

### A08-6: `LiquidityChangeV3.fee` and tick fields allow non-integer and out-of-range values (INFO)

**Location:** Lines 109-111 (`LiquidityChangeV3`)

**Description:** `fee`, `lowerTick`, and `upperTick` are typed as `number`. Uniswap V3 fee tiers are constrained to specific values (100, 500, 3000, 10000), and ticks are integers in the range [-887272, 887272]. The type system does not encode these constraints.

**Impact:** An out-of-range tick or invalid fee from a malformed subgraph response would be silently accepted and could produce incorrect liquidity-in-range calculations, affecting reward distribution for LP positions.

**Recommendation:** Consider an enum or union type for `fee` (e.g., `fee: 100 | 500 | 3000 | 10000`) and runtime validation for tick bounds at the deserialization boundary.

---

### A08-7: `EligibleBalances` and `RewardsPerToken` use mutable `Map` with string keys and no address normalization guarantee (LOW)

**Location:** Lines 66, 68

**Description:** Both type aliases use `Map<string, Map<string, ...>>` where the string keys represent token addresses and user addresses. The types provide no guarantee that keys are lowercased (normalized). The consuming code in `processor.ts` manually calls `.toLowerCase()` on every access, but a single missed call would result in a silent Map miss, causing an account to receive zero rewards.

**Impact:** An address normalization inconsistency (e.g., one path stores a checksummed address, another looks up a lowercased address) would cause that account's rewards to silently drop to zero. The current code appears to lowercase consistently, but the type provides no compile-time enforcement.

**Recommendation:** Use a branded `LowercaseAddress` type that can only be produced by a normalizing constructor, ensuring Map keys are always normalized by construction.

---

## Summary

| ID | Severity | Title |
|----|----------|-------|
| A08-1 | MEDIUM | Address fields lack branded/opaque typing |
| A08-2 | MEDIUM | Numeric value fields use `string` with no format enforcement |
| A08-3 | LOW | No `readonly` modifiers on any interface fields |
| A08-4 | LOW | `Transfer` and `TransferRecord` near-duplication |
| A08-5 | INFO | `blockNumber`/`timestamp` fields allow invalid numeric values |
| A08-6 | INFO | `LiquidityChangeV3` fee/tick fields allow out-of-range values |
| A08-7 | LOW | `EligibleBalances`/`RewardsPerToken` Map keys lack normalization guarantee |

No CRITICAL or HIGH findings. The two MEDIUM findings relate to the absence of type-level distinctions that would prevent entire categories of bugs in a financial calculation pipeline. The LOW and INFO findings reflect defense-in-depth opportunities.
