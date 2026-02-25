# Security Audit Pass 1 -- `src/types.ts`

**Auditor:** A08
**Date:** 2026-02-24
**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/types.ts`
**Scope:** Type safety, validation boundaries, address handling

---

## 1. Evidence of Thorough Reading

### Complete Inventory of Types

| # | Name | Kind | Lines | Fields |
|---|------|------|-------|--------|
| 1 | `CyToken` | interface | 1-8 | `name: string`, `address: string`, `underlyingAddress: string`, `underlyingSymbol: string`, `receiptAddress: string`, `decimals: number` |
| 2 | `Transfer` | interface | 10-18 | `from: string`, `to: string`, `value: string`, `blockNumber: number`, `timestamp: number`, `tokenAddress: string`, `transactionHash: string` |
| 3 | `TransferDetail` | interface | 20-23 | `value: string`, `fromIsApprovedSource: boolean` |
| 4 | `AccountBalance` | interface | 25-30 | `transfersInFromApproved: bigint`, `transfersOut: bigint`, `netBalanceAtSnapshots: bigint[]`, `currentNetBalance: bigint` |
| 5 | `Report` | interface | 32-35 | `reporter: string`, `cheater: string` |
| 6 | `AccountSummary` | interface | 37-58 | `address: string`, `balanceAtSnapshot1: string`, `balanceAtSnapshot2: string`, `averageBalance: string`, `penalty: string`, `bounty: string`, `finalBalance: string`, `reports: { asReporter: { cheater: string, penalizedAmount: string, bountyAwarded: string }[], asCheater: { reporter: string, penalizedAmount: string, bountyAwarded: string }[] }`, `transfers: AccountTransfers` |
| 7 | `TokenBalances` | interface | 60-67 | `snapshots: bigint[]`, `average: bigint`, `penalty: bigint`, `bounty: bigint`, `final: bigint`, `final18: bigint` |
| 8 | `EligibleBalances` | type alias | 69 | `Map<string, Map<string, TokenBalances>>` (token address -> user address -> balances) |
| 9 | `RewardsPerToken` | type alias | 71 | `Map<string, Map<string, bigint>>` (token address -> user address -> reward) |
| 10 | `TransferRecord` | interface | 73-81 | `from: string`, `to: string`, `value: string`, `blockNumber: number`, `timestamp: number`, `fromIsApprovedSource?: boolean`, `transactionHash: string` |
| 11 | `AccountTransfers` | interface | 83-86 | `transfersIn: TransferDetail[]`, `transfersOut: { value: string }[]` |
| 12 | `LiquidityChangeType` | enum | 88-92 | `Deposit = 'DEPOSIT'`, `Transfer = 'TRANSFER'`, `Withdraw = 'WITHDRAW'` |
| 13 | `LiquidityChangeBase` | type alias | 94-104 | `tokenAddress: string`, `lpAddress: string`, `owner: string`, `changeType: LiquidityChangeType`, `liquidityChange: string`, `depositedBalanceChange: string`, `blockNumber: number`, `timestamp: number`, `transactionHash: string` |
| 14 | `LiquidityChangeV2` | type alias | 106-108 | `LiquidityChangeBase & { __typename: "LiquidityV2Change" }` |
| 15 | `LiquidityChangeV3` | type alias | 110-117 | `LiquidityChangeBase & { __typename: "LiquidityV3Change", tokenId: string, poolAddress: string, fee: number, lowerTick: number, upperTick: number }` |
| 16 | `LiquidityChange` | type alias (union) | 119 | `LiquidityChangeV2 | LiquidityChangeV3` |
| 17 | `Epoch` | type alias | 121-127 | `length: number`, `timestamp: number`, `date?: string` |

**Total: 17 types/interfaces/enums, 128 lines.**

---

## 2. Security Findings

### A08-1: Unbranded `string` Type for All Ethereum Addresses

**Severity:** MEDIUM

**Location:** Lines 2-4 (`CyToken`), lines 11-12, 16 (`Transfer`), line 33 (`Report`), line 38 (`AccountSummary`), lines 74-75 (`TransferRecord`), lines 95-96 (`LiquidityChangeBase`), line 113 (`LiquidityChangeV3`), line 69 (`EligibleBalances`), line 71 (`RewardsPerToken`)

**Description:** Every Ethereum address throughout the type system is typed as plain `string`. This includes at least 15 distinct address fields across 8 types, plus the Map keys in `EligibleBalances` and `RewardsPerToken`. There is no branded/opaque type (e.g., `type Address = string & { __brand: 'Address' }`) or use of viem's `Address` type (`0x${string}`) to distinguish addresses from arbitrary strings.

**Impact:** The type system cannot prevent:
- Passing a non-address string (e.g., a transaction hash, a token name) where an address is expected.
- Mixing up checksummed vs. lowercased addresses -- the codebase calls `.toLowerCase()` pervasively (observed 100+ call sites in `processor.ts`, `index.ts`, `scraper.ts`, `diffCalculator.ts`), but this normalization is ad-hoc and not enforced at the type level. A single missed `.toLowerCase()` call would create a Map key mismatch, causing an account to silently lose rewards or receive duplicate rewards.
- Confusing `from`/`to` fields since they share the same type.

**Evidence of real risk:** The processor code (processor.ts) imports viem's `Address` type on line 1 (`import { ..., Address } from "viem"`) and uses it for `pools` parameter (`0x${string}[]`) but does not use it for any of the types defined in `types.ts`. This inconsistency confirms the gap.

**Recommendation:** Introduce a branded address type or use viem's `Address` type for all address fields. Normalize addresses at the type boundary (parse time) and remove scattered `.toLowerCase()` calls from business logic.

---

### A08-2: Numeric String Fields Without Runtime Validation Guarantees at Type Boundary

**Severity:** MEDIUM

**Location:**
- `Transfer.value` (line 13) -- `string`
- `TransferDetail.value` (line 21) -- `string`
- `TransferRecord.value` (line 76) -- `string`
- `LiquidityChangeBase.liquidityChange` (line 99) -- `string`
- `LiquidityChangeBase.depositedBalanceChange` (line 100) -- `string`
- `LiquidityChangeV3.tokenId` (line 112) -- `string`
- `AccountSummary` fields: `balanceAtSnapshot1`, `balanceAtSnapshot2`, `averageBalance`, `penalty`, `bounty`, `finalBalance` (lines 39-44) -- all `string`

**Description:** These fields represent numeric values (token amounts, balances) stored as `string` because they exceed JavaScript's `Number.MAX_SAFE_INTEGER`. They are later converted to `bigint` via `BigInt(transfer.value)` (processor.ts:136), `BigInt(lpWithdraw.depositedBalanceChange)` (processor.ts:194), `BigInt(liquidityChangeEvent.depositedBalanceChange)` (processor.ts:514), and `BigInt(rewardStr)` (diffCalculator.ts:40). However, the types provide no compile-time or parse-time guarantee that these strings contain valid numeric representations.

**Impact:** If a malformed or malicious value string (e.g., `"abc"`, `""`, `"1e18"`, `"-0x1"`) reaches `BigInt()`, it will throw a runtime `SyntaxError`, crashing the entire pipeline. More subtly, `BigInt("0x...")` accepts hex strings, so a hex-encoded value from the subgraph would be silently interpreted differently than a decimal string, producing incorrect reward calculations. The scraper does no validation on `t.value` from the subgraph response (scraper.ts:107).

**Recommendation:** Either: (a) introduce a branded `NumericString` type with a validation constructor that asserts the string is a valid non-negative decimal integer, or (b) convert to `bigint` at the parse boundary (in the scraper) and carry `bigint` through the type system, eliminating the string-to-bigint conversion risk at the point of use.

---

### A08-3: `Transfer` and `TransferRecord` Are Near-Duplicates Creating Confusion Risk

**Severity:** LOW

**Location:** `Transfer` (lines 10-18), `TransferRecord` (lines 73-81)

**Description:** `Transfer` and `TransferRecord` have nearly identical shapes:

| Field | `Transfer` | `TransferRecord` |
|-------|-----------|-----------------|
| `from` | `string` | `string` |
| `to` | `string` | `string` |
| `value` | `string` | `string` |
| `blockNumber` | `number` | `number` |
| `timestamp` | `number` | `number` |
| `tokenAddress` | `string` | -- |
| `transactionHash` | `string` | `string` |
| `fromIsApprovedSource` | -- | `boolean?` |

The only differences are: `Transfer` has `tokenAddress`, `TransferRecord` has optional `fromIsApprovedSource`, and `TransferRecord` lacks `tokenAddress`. These are structurally compatible in TypeScript (structural typing), so one can be silently passed where the other is expected, potentially dropping the `tokenAddress` field.

**Impact:** A function expecting `Transfer` could receive a `TransferRecord` (which lacks `tokenAddress`), and TypeScript would not flag it as long as only shared fields are accessed. If `tokenAddress` is accessed on a `TransferRecord`, it would be `undefined` at runtime, not a compile error (since TypeScript allows extra properties in structural checks but not missing ones -- actually this would be caught). The real risk is maintainability confusion: developers may use the wrong type, leading to subtle bugs.

**Recommendation:** Consolidate into a single type with optional fields, or make `TransferRecord` explicitly extend `Transfer` with `Omit`/`Pick` to clarify the relationship.

---

### A08-4: No Readonly Modifiers on Data Structures Used in Financial Calculations

**Severity:** LOW

**Location:** All interfaces and type aliases, particularly:
- `AccountBalance.netBalanceAtSnapshots: bigint[]` (line 28)
- `TokenBalances.snapshots: bigint[]` (line 61)
- `EligibleBalances` Map (line 69)
- `RewardsPerToken` Map (line 71)

**Description:** None of the arrays or Map structures are marked as `readonly`. The `netBalanceAtSnapshots` and `snapshots` arrays can be mutated (e.g., via `.push()`, direct index assignment, `.splice()`) by any consumer that holds a reference. Similarly, the nested Maps in `EligibleBalances` and `RewardsPerToken` can have entries added, deleted, or overwritten.

**Impact:** In a financial calculation system, accidental mutation of balance snapshots or reward Maps could cause incorrect reward distributions. While the current codebase appears to handle this correctly through disciplined coding, the type system does not enforce immutability, so future changes could introduce mutation bugs silently.

**Recommendation:** Use `readonly bigint[]`, `ReadonlyMap`, and `Readonly<>` wrappers for data structures that should not be mutated after construction, particularly for the return types of `getEligibleBalances()` and `calculateRewards()`.

---

### A08-5: `AccountBalance.currentNetBalance` Can Be Negative Without Type-Level Constraint

**Severity:** LOW

**Location:** `AccountBalance.currentNetBalance: bigint` (line 29)

**Description:** The `currentNetBalance` field is typed as `bigint`, which allows negative values. In processor.ts:202, there is an explicit floor to zero: `const val = toBalance.currentNetBalance < 0n ? 0n : toBalance.currentNetBalance;`. This confirms that negative balances are an expected intermediate state, but the type does not communicate this invariant.

**Impact:** The floor-to-zero logic in processor.ts correctly handles this, but the pattern is fragile. If another code path reads `currentNetBalance` without applying the floor, it could use a negative balance in reward calculations. The type system gives no hint that this field may be negative or that a floor is required.

**Recommendation:** Document the invariant in a JSDoc comment on the field. Alternatively, consider splitting into a raw field and a clamped accessor. At minimum, add a comment to the interface.

---

### A08-6: `AccountSummary` Interface Appears Unused

**Severity:** INFO

**Location:** `AccountSummary` (lines 37-58)

**Description:** A search of the codebase for usage of `AccountSummary` outside of its definition in `types.ts` yields no results. The interface defines a rich structure with nested `reports` arrays and `transfers`, but it does not appear to be instantiated, consumed, or exported to external consumers anywhere in the codebase.

**Evidence:** Grep for `AccountSummary` across `src/` returns only the type definition itself in `types.ts`.

**Impact:** Dead code increases maintenance burden and can mislead auditors about the system's actual data model. If this type was intended to be used for output validation or API responses, its absence from the implementation represents a gap.

**Recommendation:** Remove if unused, or implement if it represents a desired output format.

---

### A08-7: `LiquidityChangeV3.fee` and Tick Fields Are `number`, Risking Precision Loss for Large Values

**Severity:** LOW

**Location:** `LiquidityChangeV3` (lines 114-116): `fee: number`, `lowerTick: number`, `upperTick: number`

**Description:** These fields are typed as `number`. In the subgraph schema (scraper.ts:50-52), `fee`, `lowerTick`, and `upperTick` are originally `string` and are converted via `parseInt()`. Uniswap V3 ticks range from -887272 to 887272 (well within safe integer range), and fees are small integers (100, 500, 3000, 10000), so precision loss is unlikely for current data. However, `number` type does not enforce integer constraints, and `parseInt` of a non-numeric string returns `NaN`, which propagates silently through arithmetic.

**Impact:** If the subgraph ever returns a non-numeric string for these fields, `parseInt` would produce `NaN`, which would silently corrupt tick range calculations in the liquidity processing logic (processor.ts), potentially marking out-of-range positions as in-range or vice versa, affecting reward eligibility.

**Recommendation:** Add runtime validation after `parseInt` to assert the result is a finite integer (e.g., `Number.isInteger()`), or use a schema validation library at the parse boundary.

---

### A08-8: Map Key Type Erosion in `EligibleBalances` and `RewardsPerToken`

**Severity:** MEDIUM

**Location:** Lines 69 and 71

```typescript
export type EligibleBalances = Map<string, Map<string, TokenBalances>>;
export type RewardsPerToken = Map<string, Map<string, bigint>>;
```

**Description:** Both nested Maps use `string` keys for both the outer (token address) and inner (user address) dimensions. The inline comments indicate the intended semantics (`// token address -> user address -> balances`), but the type system does not distinguish the two key types. A developer could accidentally swap the lookup order (user address first, then token address) and the code would compile without error.

**Impact:** A swapped lookup would return `undefined` from the Map, which in the current codebase is typically handled with optional chaining (`?.`) resulting in a silent `undefined` / `0n` -- meaning an account silently receives zero rewards. This is a correctness risk with financial impact that the type system should prevent.

**Evidence of risk pattern:** In index.ts:193, a deeply nested expression chains multiple `.get()` calls: `rewardsPerToken.get(token.address.toLowerCase())?.get(address) ?? 0n`. Swapping the two `.get()` arguments would compile and silently yield `0n`.

**Recommendation:** Use branded types or distinct type aliases for token addresses vs. user addresses as Map keys, e.g.:
```typescript
type TokenAddress = string & { __brand: 'TokenAddress' };
type UserAddress = string & { __brand: 'UserAddress' };
export type EligibleBalances = Map<TokenAddress, Map<UserAddress, TokenBalances>>;
```

---

## 3. Summary

| ID | Severity | Title |
|----|----------|-------|
| A08-1 | MEDIUM | Unbranded `string` type for all Ethereum addresses |
| A08-2 | MEDIUM | Numeric string fields without runtime validation at type boundary |
| A08-3 | LOW | `Transfer` and `TransferRecord` near-duplication creates confusion risk |
| A08-4 | LOW | No readonly modifiers on financial data structures |
| A08-5 | LOW | `currentNetBalance` can be negative without type-level constraint |
| A08-6 | INFO | `AccountSummary` interface appears unused |
| A08-7 | LOW | `parseInt` on tick/fee fields with no `NaN` guard |
| A08-8 | MEDIUM | Map key type erosion in `EligibleBalances` and `RewardsPerToken` |

**CRITICAL findings:** 0
**HIGH findings:** 0
**MEDIUM findings:** 3
**LOW findings:** 4
**INFO findings:** 1

---

*Note: No CRITICAL or HIGH findings were identified in the type definitions file itself. The MEDIUM findings relate to type-system weaknesses that create opportunities for bugs elsewhere in the codebase. The actual impact depends on the discipline of the code that consumes these types -- the current implementation appears to handle most of these gaps correctly through convention (pervasive `.toLowerCase()`, correct `BigInt()` usage), but the lack of type-level enforcement means these invariants are fragile against future changes.*
