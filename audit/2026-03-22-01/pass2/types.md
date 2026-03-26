# Pass 2: Test Coverage Review — `src/types.ts`

**Auditor:** A09
**Date:** 2026-03-22
**File:** `src/types.ts` (126 lines)

## Evidence of Thorough Reading

Every exported interface/type/enum in the file:

| Name | Kind | Line |
|------|------|------|
| `CyToken` | interface | 6 |
| `Transfer` | interface | 20 |
| `AccountBalance` | interface | 32 |
| `TokenBalances` | interface | 47 |
| `EligibleBalances` | type alias | 63 |
| `RewardsPerToken` | type alias | 66 |
| `LiquidityChangeType` | enum | 69 |
| `LiquidityChangeBase` | interface | 76 |
| `LiquidityChangeV2` | type alias (intersection) | 91 |
| `LiquidityChangeV3` | type alias (intersection) | 96 |
| `LiquidityChange` | type alias (union) | 110 |
| `BlocklistReport` | interface | 113 |
| `LpV3Position` | interface | 119 |

## Coverage Analysis

### No Dedicated Test File

There is no `src/types.test.ts`. This is acceptable for a pure types file **provided** the types are thoroughly exercised in consumer tests.

### Type-by-Type Coverage Assessment

| Type | Exercised in Tests? | Where |
|------|---------------------|-------|
| `CyToken` | Yes | `pipeline.test.ts` constructs CyToken objects (lines 253-260, 313-320) |
| `Transfer` | Yes | `processor.test.ts` constructs Transfer objects extensively |
| `AccountBalance` | Indirectly | Not constructed in tests; only read from `processor.getEligibleBalances()` output. Shape validated via snapshot/average assertions. |
| `TokenBalances` | Yes | `pipeline.test.ts` constructs TokenBalances objects (lines 280, 323, 355, 397) |
| `EligibleBalances` | Yes | `pipeline.test.ts` constructs EligibleBalances maps directly |
| `RewardsPerToken` | Yes | `pipeline.test.ts` constructs RewardsPerToken maps directly |
| `LiquidityChangeType` | Yes | `processor.test.ts` uses all 3 enum values (Deposit, Withdraw, Transfer) |
| `LiquidityChangeBase` | Indirectly | Never referenced directly; exercised through V2/V3 |
| `LiquidityChangeV2` | Yes | `processor.test.ts` constructs many V2 objects; `scraper.test.ts` validates mapping |
| `LiquidityChangeV3` | Yes | `processor.test.ts` line 1237; `scraper.test.ts` lines 41-52, 142-165 |
| `LiquidityChange` | Yes | Used as declared type for V2 and V3 objects in processor.test.ts and scraper.test.ts |
| `BlocklistReport` | Indirectly | `pipeline.test.ts` tests `parseBlocklist()` which returns `BlocklistReport[]`, validating shape via `.toEqual()` |
| `LpV3Position` | No | Never constructed or asserted in any test file. Only used internally in `processor.ts` (line 44). |

### Discriminated Union (V2/V3) Coverage

The `LiquidityChange = LiquidityChangeV2 | LiquidityChangeV3` discriminated union is tested:

1. **`scraper.test.ts`** — Verifies `__typename` is correctly set for both V2 and V3 mappings (lines 133-151). Uses narrowing guard `if (result.__typename === "LiquidityV3Change")` to access V3-specific fields (lines 145-151, 161-163). Also verifies V2 results do NOT have V3 fields (line 169).

2. **`processor.test.ts`** — Constructs both V2 (majority of tests) and V3 objects (line 1237) typed as `LiquidityChange`. The V3 path through `processor.ts` line 588 (`if (liquidityChangeEvent.__typename === "LiquidityV3Change")`) is exercised.

3. **Missing negative narrowing test**: No test verifies that TypeScript correctly narrows a `LiquidityChangeV2` to NOT have `tokenId`, `poolAddress`, `fee`, `lowerTick`, `upperTick` fields at the type level. The scraper test at line 169 (`expect("tokenId" in result).toBe(false)`) does a runtime check, but this is a JavaScript property test, not a compile-time type assertion.

## Findings

### T-01: `LpV3Position` has zero test coverage [LOW]

**Type:** `LpV3Position` (line 119)
**Severity:** LOW

The `LpV3Position` interface is used only internally by `Processor.lp3TrackList` (processor.ts line 44). No test constructs an `LpV3Position` directly or asserts its shape. The V3 position tracking logic in processor is tested (processor.test.ts line 1237+), but only through the `LiquidityChangeV3` entry point — the intermediate `LpV3Position` structure is never directly validated.

This means if the `LpV3Position` interface drifts from the shape the processor actually stores (e.g., a field rename), the compiler would catch it, but there's no test that documents the expected shape for future maintainers.

**Impact:** Low — TypeScript compiler provides structural enforcement. The risk is limited to documentation/maintenance clarity.

### T-02: `AccountBalance` shape never directly tested [INFO]

**Type:** `AccountBalance` (line 32)
**Severity:** INFO

Tests never construct an `AccountBalance` object. The shape is validated indirectly by reading `TokenBalances` from `getEligibleBalances()`. Since `AccountBalance` is an internal intermediate type (never exposed outside the processor), this is acceptable.

### T-03: V2/V3 discrimination is tested at runtime but lacks compile-time type assertion tests [INFO]

**Severity:** INFO

The `scraper.test.ts` checks `__typename` values at runtime and uses TypeScript narrowing guards. However, there are no `expectTypeOf` or `satisfies` assertions that would catch if the discriminant literal types changed. Since the discriminant values are string literals (`"LiquidityV2Change"`, `"LiquidityV3Change"`) and TypeScript enforces them at compile time, this is acceptable — a bad value would be a compile error. Noted for completeness.

### T-04: `LiquidityChangeType` enum value exhaustiveness not tested [INFO]

**Severity:** INFO

The `LiquidityChangeType` enum has 3 values (Deposit, Transfer, Withdraw). All three are exercised in processor.test.ts through various test cases. However, there is no exhaustiveness check (e.g., a switch with `never` default) in the test suite that would alert if a new enum value were added without corresponding test coverage.

## Summary

| ID | Severity | Description |
|----|----------|-------------|
| T-01 | LOW | `LpV3Position` has zero direct test coverage |
| T-02 | INFO | `AccountBalance` shape never directly tested (acceptable — internal type) |
| T-03 | INFO | No compile-time type assertion tests for discriminated union |
| T-04 | INFO | No exhaustiveness test for `LiquidityChangeType` enum |

Overall, test coverage for types.ts is **adequate**. All types are exercised through consumer tests. The only gap above INFO level is `LpV3Position` which has no direct test coverage, though the compiler provides structural enforcement. For a pure types file with no runtime logic, this level of coverage is reasonable.
