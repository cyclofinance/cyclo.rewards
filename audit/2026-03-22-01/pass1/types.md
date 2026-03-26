# Pass 1: Security Review — `src/types.ts`

**Agent:** A09
**Date:** 2026-03-22
**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/types.ts` (126 lines)

## Evidence of Reading

**Module-level doc comment:** Line 1-3 — "Shared TypeScript interfaces and types for the Cyclo rewards pipeline."

| Name | Kind | Line |
|---|---|---|
| `CyToken` | interface | 6 |
| `Transfer` | interface | 20 |
| `AccountBalance` | interface | 32 |
| `TokenBalances` | interface | 47 |
| `EligibleBalances` | type alias | 63 |
| `RewardsPerToken` | type alias | 66 |
| `LiquidityChangeType` | enum | 69 |
| `LiquidityChangeBase` | interface | 76 |
| `LiquidityChangeV2` | type (intersection) | 91 |
| `LiquidityChangeV3` | type (intersection) | 96 |
| `LiquidityChange` | type (union) | 110 |
| `BlocklistReport` | interface | 113 |
| `LpV3Position` | interface | 119 |

**Fields reviewed:** All 42 fields across all interfaces/types were inspected for type soundness. No `any` types found. No unused exports detected in the file itself.

## Findings

### INFO-01: `blockNumber` and `timestamp` typed as `number` — safe for current usage

**Location:** `Transfer.blockNumber` (line 25), `Transfer.timestamp` (line 26), `LiquidityChangeBase.blockNumber` (line 85), `LiquidityChangeBase.timestamp` (line 86)

**Details:** These fields use JavaScript `number` (IEEE 754 double, safe integer limit ~9 quadrillion). Flare block numbers are currently in the ~55M range, and Unix timestamps are ~1.7 billion. Both are well within `Number.MAX_SAFE_INTEGER` (9,007,199,254,740,991). The upstream parser `parseIntStrict` in `scraper.ts` uses `parseInt()` which also stays safe at these magnitudes.

**Risk:** None for the foreseeable future. Block numbers would need to exceed 9 quadrillion before precision loss occurs.

**Classification:** INFO

---

### INFO-02: `address` fields are bare `string` — no branded/opaque type

**Location:** `CyToken.address` (line 8), `CyToken.underlyingAddress` (line 10), `CyToken.receiptAddress` (line 14), `Transfer.from` (line 21), `Transfer.to` (line 22), `Transfer.tokenAddress` (line 27), `LiquidityChangeBase.tokenAddress` (line 77), `LiquidityChangeBase.lpAddress` (line 78), `LiquidityChangeBase.owner` (line 79), `LiquidityChangeV3.poolAddress` (line 100), `BlocklistReport.reporter` (line 114), `BlocklistReport.cheater` (line 115), `LpV3Position.pool` (line 120)

**Details:** All 13 address fields are typed as plain `string`. A branded type (e.g., `type Address = string & { __brand: "Address" }`) would make it a compile-time error to pass an unvalidated string where an address is expected. However, runtime validation is already performed at the ingestion boundary (`validateAddress` in `scraper.ts` and `constants.ts` checks `0x` + 40 hex chars). The processor also consistently calls `.toLowerCase()` when using addresses as map keys.

**Risk:** Minimal. The runtime validation at the boundary is the correct mitigation. A branded type would be a defense-in-depth improvement but is not a security gap given current validation.

**Classification:** INFO

---

### INFO-03: `Transfer.value` and `LiquidityChangeBase.liquidityChange`/`depositedBalanceChange` are `string` not `bigint`

**Location:** `Transfer.value` (line 24), `LiquidityChangeBase.liquidityChange` (line 82), `LiquidityChangeBase.depositedBalanceChange` (line 84)

**Details:** These fields carry numeric values as strings. The comment on line 23 explicitly documents this: "Transfer amount as a decimal string (not yet parsed to BigInt)". The scraper validates these with `validateNumericString` (for `value`) and `validateIntegerString` (for liquidity fields) before storing. Downstream code in `processor.ts` converts to `BigInt()` at point of use.

**Risk:** None. This is a deliberate design decision — strings are the natural type for subgraph output and BigInt conversion happens at the consumption site with validation at the boundary.

**Classification:** INFO

---

### INFO-04: `LpV3Position.lowerTick` and `upperTick` are `number`, ticks can be large signed integers

**Location:** `LpV3Position.lowerTick` (line 123), `LpV3Position.upperTick` (line 124), `LiquidityChangeV3.lowerTick` (line 105), `LiquidityChangeV3.upperTick` (line 106), `LiquidityChangeV3.fee` (line 102)

**Details:** Uniswap V3 ticks range from -887272 to 887272. Fee tiers are small integers (100, 500, 3000, 10000). All are well within safe integer range. `parseIntStrict` handles the conversion from string to number.

**Risk:** None.

**Classification:** INFO

---

### INFO-05: `CyToken.decimals` typed as `number` without constraint, validated downstream

**Location:** `CyToken.decimals` (line 16)

**Details:** The `decimals` field is a bare `number` with no type-level constraint. However, `scaleTo18()` in `config.ts` validates at runtime that decimals is a non-negative integer before performing arithmetic. The `CYTOKENS` array in `config.ts` uses hardcoded values (18, 18, 6). Test coverage in `config.test.ts` verifies rejection of negative, NaN, and non-integer decimals.

**Risk:** None given current validation.

**Classification:** INFO

---

## Summary

No CRITICAL, HIGH, MEDIUM, or LOW findings. The types file is well-structured:

- No `any` types anywhere
- All numeric string fields are explicitly documented as such
- Runtime validation exists at ingestion boundaries for addresses, numeric strings, and enum values
- All `number`-typed fields are used for values well within safe integer range
- The discriminated union for `LiquidityChange` (V2 vs V3) uses `__typename` literals correctly

The file defines a clean, minimal type surface appropriate for a data pipeline. Security is enforced at runtime boundaries (scraper validation) rather than at the type level, which is a reasonable approach for a TypeScript project processing external subgraph data.

No fixes required.
