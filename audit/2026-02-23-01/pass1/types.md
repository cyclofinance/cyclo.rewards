# Audit Report: Pass 1 (Security) -- `src/types.ts`

**Agent:** A08
**Date:** 2026-02-23
**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/types.ts`
**Lines:** 123

---

## Evidence of Thorough Reading

**Module:** `src/types.ts` (pure type-definition module; no runtime code, no constants)

### Interfaces (7)

| Name | Line |
|------|------|
| `CyToken` | 1 |
| `Transfer` | 9 |
| `TransferDetail` | 18 |
| `AccountBalance` | 23 |
| `Report` | 30 |
| `AccountSummary` | 35 |
| `TokenBalances` | 58 |
| `TransferRecord` | 70 |
| `AccountTransfers` | 79 |

### Type Aliases (5)

| Name | Line |
|------|------|
| `EligibleBalances` | 66 |
| `RewardsPerToken` | 68 |
| `LiquidityChangeBase` | 90 |
| `LiquidityChangeV2` | 101 |
| `LiquidityChangeV3` | 105 |
| `LiquidityChange` | 114 |
| `Epoch` | 116 |

### Enums (1)

| Name | Line |
|------|------|
| `LiquidityChangeType` | 84 |

### Constants Defined

None. This file exports only type-level constructs.

---

## Security Findings

### A08-1 -- Unbranded `string` for Ethereum Addresses

**Severity:** MEDIUM

**Description:** Every address field across all interfaces (`CyToken.address`, `CyToken.underlyingAddress`, `CyToken.receiptAddress`, `Transfer.from`, `Transfer.to`, `Transfer.tokenAddress`, `Report.reporter`, `Report.cheater`, `AccountSummary.address`, `LiquidityChangeBase.tokenAddress`, `LiquidityChangeBase.lpAddress`, `LiquidityChangeBase.owner`, `LiquidityChangeV3.poolAddress`) is typed as bare `string`. There is no branded/opaque type (e.g., `type Address = \`0x${string}\``) to enforce format constraints at the type level.

**Impact:** The codebase relies on scattered `.toLowerCase()` calls at usage sites (over 80 call sites observed in `processor.ts`, `index.ts`, `diffCalculator.ts`) to normalize case. Because there is no compile-time guarantee that an address has been normalized, a case mismatch between a Map key and a lookup would silently return `undefined`, causing an account to receive zero rewards. A branded `Address` type with a validated constructor would shift this class of bug from runtime to compile time.

---

### A08-2 -- Numeric Values Stored as `string` Without Parse Validation Guarantees

**Severity:** MEDIUM

**Description:** Multiple fields are typed `string` but carry numeric semantics:
- `Transfer.value` (line 12)
- `TransferDetail.value` (line 19)
- `TransferRecord.value` (line 73)
- `AccountTransfers.transfersOut[].value` (line 81)
- `LiquidityChangeBase.liquidityChange` (line 95)
- `LiquidityChangeBase.depositedBalanceChange` (line 96)
- `LiquidityChangeV3.tokenId` (line 107)
- `AccountSummary` sub-fields: `balanceAtSnapshot1`, `balanceAtSnapshot2`, `averageBalance`, `penalty`, `bounty`, `finalBalance`, `penalizedAmount`, `bountyAwarded` (lines 37-53)

These values are eventually parsed via `BigInt()` (confirmed at `processor.ts:135`). A non-numeric or empty string at that point would throw an unhandled exception at runtime. There is no type-level distinction between "arbitrary string" and "string known to be a valid bigint literal."

**Impact:** If the subgraph returned a malformed value (e.g., `""`, `"NaN"`, scientific notation like `"1e18"`), the pipeline would crash with an unhelpful `SyntaxError: Cannot convert ... to a BigInt`. A branded `NumericString` type or runtime validation at the deserialization boundary (scraper) would provide defense in depth.

---

### A08-3 -- `blockNumber` and `timestamp` as Unguarded `number`

**Severity:** LOW

**Description:** `Transfer.blockNumber` (line 13), `Transfer.timestamp` (line 14), `TransferRecord.blockNumber` (line 74), `TransferRecord.timestamp` (line 75), `LiquidityChangeBase.blockNumber` (line 97), `LiquidityChangeBase.timestamp` (line 98) are all typed as `number`. These are parsed from strings via `parseInt()` in the scraper (`scraper.ts:194-195`). There is no type-level or runtime constraint that they must be non-negative integers. `parseInt` on an unexpected input returns `NaN`, which would silently pass through comparisons (`NaN < x` is always `false`), potentially causing transfers to be skipped or placed in incorrect snapshot buckets.

**Impact:** Low likelihood given the subgraph is the data source, but a defensive `assert(Number.isInteger(n) && n >= 0)` at the parse boundary would harden against future data source changes.

---

### A08-4 -- `LiquidityChangeV3.fee`, `lowerTick`, `upperTick` Accept Arbitrary `number`

**Severity:** LOW

**Description:** `fee` (line 109), `lowerTick` (line 110), and `upperTick` (line 111) are typed as `number`. Uniswap V3 fees are constrained to specific values (100, 500, 3000, 10000), and ticks have well-defined min/max bounds ([-887272, 887272]). The type system does not capture these constraints. Additionally, `lowerTick` should always be less than or equal to `upperTick`, but this invariant is not enforced at the type or construction level.

**Impact:** Malformed subgraph data with an inverted tick range or impossible fee tier would propagate silently through the system, potentially miscalculating in-range liquidity. This is mitigated by the subgraph itself enforcing Uniswap invariants, but an assertion at the deserialization boundary would provide additional safety.

---

### A08-5 -- `LiquidityChangeType` Enum Cast from Unvalidated String

**Severity:** LOW

**Description:** In `scraper.ts:191`, the subgraph's `liquidityChangeType` string field is cast directly: `t.liquidityChangeType as LiquidityChangeType`. TypeScript's `as` assertion provides no runtime guarantee. If the subgraph added a new change type (or returned an unexpected value), the cast would succeed silently, and downstream `switch`/`if` statements checking for `Deposit`/`Transfer`/`Withdraw` would fall through.

**Impact:** The type itself (defined at line 84-88) is correct, but the lack of runtime validation at the boundary where the enum is constructed means a new or malformed change type would not be caught. This is a finding about how the type is consumed, noted here because the enum definition does not include a mechanism (like exhaustive checking helper) to guard against unhandled variants.

---

### A08-6 -- `EligibleBalances` and `RewardsPerToken` Use Unkeyed `Map<string, ...>`

**Severity:** LOW

**Description:** `EligibleBalances` (line 66) is `Map<string, Map<string, TokenBalances>>` and `RewardsPerToken` (line 68) is `Map<string, Map<string, bigint>>`. Both outer and inner maps use plain `string` keys representing token addresses and user addresses respectively. The inline comments document the intended key semantics, but nothing in the type system distinguishes a token address key from a user address key.

**Impact:** It would be possible to accidentally use a user address where a token address is expected (or vice versa) when indexing into these maps, and TypeScript would not flag the error. Branded types for `TokenAddress` and `UserAddress` would eliminate this class of bug.

---

### A08-7 -- `AccountSummary.reports` Nested Object Not a Named Type

**Severity:** INFO

**Description:** The `reports` field on `AccountSummary` (lines 43-54) uses an anonymous inline type with nested arrays of anonymous objects. This is not a security issue per se, but the lack of named types for the report entries makes it harder to write validation functions or reuse the structure, increasing the risk that report data is constructed inconsistently across different code paths.

---

### A08-8 -- `Epoch.date` Optional Field Without Format Specification

**Severity:** INFO

**Description:** `Epoch.date` (line 121) is `string | undefined`. There is no indication of the expected format (ISO 8601, locale string, etc.). If this field is ever used for date comparisons or parsing, the lack of format constraint could lead to incorrect behavior.

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH | 0 |
| MEDIUM | 2 |
| LOW | 4 |
| INFO | 2 |

The file is a pure type-definition module with no runtime code, so it cannot itself introduce runtime vulnerabilities. The findings relate to **type-level gaps** that allow classes of bugs to go undetected by the TypeScript compiler. The two MEDIUM findings (A08-1 address normalization and A08-2 numeric string validation) represent the most impactful improvements, as they address error classes that are actively mitigated by runtime code scattered across multiple files rather than being enforced structurally.
