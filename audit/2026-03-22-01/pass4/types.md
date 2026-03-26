# Pass 4 -- Code Quality Review: `src/types.ts`

**Auditor Agent:** A09
**Date:** 2026-03-22
**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/types.ts` (126 lines)

---

## 1. Evidence of Thorough Reading

Every interface, type alias, and enum in the file:

| Line | Symbol | Kind | Exported |
|------|--------|------|----------|
| 6 | `CyToken` | `interface` | Yes |
| 20 | `Transfer` | `interface` | Yes |
| 32 | `AccountBalance` | `interface` | Yes |
| 47 | `TokenBalances` | `interface` | Yes |
| 63 | `EligibleBalances` | `type` alias (`Map<string, Map<string, TokenBalances>>`) | Yes |
| 66 | `RewardsPerToken` | `type` alias (`Map<string, Map<string, bigint>>`) | Yes |
| 69 | `LiquidityChangeType` | `enum` (3 values) | Yes |
| 76 | `LiquidityChangeBase` | `interface` | Yes |
| 91 | `LiquidityChangeV2` | `type` (intersection: `LiquidityChangeBase & { __typename }`) | Yes |
| 96 | `LiquidityChangeV3` | `type` (intersection: `LiquidityChangeBase & { __typename, ... }`) | Yes |
| 110 | `LiquidityChange` | `type` (union: `LiquidityChangeV2 \| LiquidityChangeV3`) | Yes |
| 113 | `BlocklistReport` | `interface` | Yes |
| 119 | `LpV3Position` | `interface` | Yes |

**Total: 13 exported symbols (8 interfaces, 1 enum, 4 type aliases).**

All 42 fields across all interfaces were individually read and cross-referenced against consumer files (`processor.ts`, `scraper.ts`, `pipeline.ts`, `config.ts`, `index.ts`).

---

## 2. Code Quality Assessment

### Prior audit context

The 2026-02-23 and 2026-02-24 pass-4 audits (A08) identified 5 dead types (`Report`, `AccountSummary`, `TransferRecord`, `TransferDetail`, `AccountTransfers`) and one dead `Epoch` type. All have since been removed. The current file is substantially cleaner.

---

## 3. Findings

### A09-CQ-001 -- LOW -- `LiquidityChangeBase` is exported but never imported outside `types.ts`

**Location:** Line 76

**Description:** `LiquidityChangeBase` is declared as `export interface` but no file in `src/` imports it. It is only referenced within `types.ts` itself to compose `LiquidityChangeV2` and `LiquidityChangeV3` via intersection types. Verified by grep: zero matches for `import.*LiquidityChangeBase` across the entire codebase.

Exporting a base type that is only used for internal composition exposes an implementation detail and invites external consumers to depend on the base shape directly rather than the discriminated union `LiquidityChange`.

This was flagged in the prior audit (A08-8 on 2026-02-23, INFO severity). Elevating to LOW because all dead code from that era has been cleaned up, making this the only remaining unnecessarily exported symbol.

**Recommendation:** Remove the `export` keyword from `LiquidityChangeBase`, making it file-private.

---

### A09-CQ-002 -- LOW -- Inconsistent type definition keyword for `LiquidityChangeBase`

**Location:** Line 76

**Description:** `LiquidityChangeBase` is defined as `export interface LiquidityChangeBase { ... }`, which is a plain object shape -- consistent with how the other standalone object shapes are declared (`CyToken`, `Transfer`, `AccountBalance`, `TokenBalances`, `BlocklistReport`, `LpV3Position`).

However, the file uses `type` for:
- `LiquidityChangeV2` (line 91) -- intersection type, `type` is required
- `LiquidityChangeV3` (line 96) -- intersection type, `type` is required
- `LiquidityChange` (line 110) -- union type, `type` is required
- `EligibleBalances` (line 63) -- `Map` alias, `type` is required
- `RewardsPerToken` (line 66) -- `Map` alias, `type` is required

The current convention is actually consistent: `interface` for standalone object shapes, `type` for aliases/unions/intersections. This is the correct split. The prior audit (A08-4) flagged this when `LiquidityChangeBase` was a `type`; it has since been changed to `interface`, resolving that finding.

**Verdict: NO FINDING.** The current `interface` vs `type` usage follows a clear, defensible convention. Withdrawing this as a finding.

---

### A09-CQ-003 -- INFO -- `TokenBalances.final` uses a reserved word as a field name

**Location:** Line 57

**Description:** The field name `final` is a reserved word in Java and a "future reserved word" in ECMAScript strict mode specifications (though TypeScript and modern JS runtimes handle it as a property name without issues). Using it as a property name works correctly in TypeScript because property names in object literals and interfaces are not subject to reserved word restrictions. The code compiles and runs without error.

This is purely a readability/convention note. Some developers may find `final` surprising as a field name since it resembles a keyword. However, the name is semantically clear and well-documented with JSDoc: `/** Final reward-eligible balance in native token decimals: average - penalty + bounty */`.

**No action required.**

---

### A09-CQ-004 -- INFO -- Address fields use `string` rather than viem's `Address` branded type

**Location:** 13 fields across `CyToken`, `Transfer`, `LiquidityChangeBase`, `LiquidityChangeV3`, `BlocklistReport`, `LpV3Position`

**Description:** All address fields are typed as plain `string`. The processor imports viem's `Address` type (processor.ts line 6) and casts strings to `Address` at the point of use (e.g., `source as Address`). Using `Address` (`0x${string}`) in the type definitions would provide compile-time narrowing and eliminate casts in consumers.

However, the types represent data shapes that come from JSON deserialization (subgraph data stored in `.dat` files), where values arrive as plain strings. Runtime validation via `validateAddress` at the ingestion boundary is the correct mitigation. Adding `Address` to the type definitions would require the scraper to cast validated strings, moving complexity without eliminating it.

This was noted in prior pass-1 audit (A09, INFO-02) and the architectural decision is sound.

**No action required.**

---

### A09-CQ-005 -- INFO -- `LpV3Position.pool` uses a different name than the corresponding field in `LiquidityChangeV3`

**Location:** `LpV3Position.pool` (line 120) vs `LiquidityChangeV3.poolAddress` (line 100)

**Description:** In `LiquidityChangeV3`, the pool field is named `poolAddress`. In `LpV3Position`, the corresponding field is named `pool`. The processor maps between them at line 600: `pool: liquidityChangeEvent.poolAddress.toLowerCase()`. While both names are understandable, the inconsistency means a developer searching for "poolAddress" across the codebase would not find the `LpV3Position` usage, and vice versa.

This is a minor naming inconsistency. Both names are short and clear within their respective contexts (`poolAddress` is explicit about being an address; `pool` is concise for an internal tracking structure).

**No action required, but noted for awareness.**

---

### A09-CQ-006 -- LOW -- `LiquidityChangeBase.liquidityChange` field name stutters with the parent type name

**Location:** Line 82

**Description:** The field `liquidityChange` inside `LiquidityChangeBase` (and by extension `LiquidityChangeV2`/`V3`) creates a stutter: `event.liquidityChange` reads naturally, but the fully qualified concept is "liquidity change's liquidity change." This naming pattern occurs because the interface represents a liquidity change event, and this field represents the magnitude of that change.

A clearer name might be `liquidityDelta` or simply `liquidity` (with the JSDoc clarifying it is a delta). However, this field name appears to originate from the Goldsky subgraph schema, so it may be intentional to match the upstream data source.

Cross-referencing with `scraper.ts` line 40+: the `SubgraphLiquidityChangeBase` type also uses `liquidityChange` as the field name, confirming it mirrors the subgraph schema.

**Recommendation:** Accept the stutter since it mirrors the upstream subgraph field name. Renaming would introduce a mapping divergence between the subgraph schema and the internal types. No change needed.

**Verdict:** Downgrading to INFO -- the name matches the upstream schema intentionally.

---

## 4. Summary

| ID | Severity | Category | Description |
|----|----------|----------|-------------|
| A09-CQ-001 | LOW | Encapsulation | `LiquidityChangeBase` is exported but never imported outside `types.ts` |
| A09-CQ-003 | INFO | Naming | `TokenBalances.final` uses a reserved word as a field name |
| A09-CQ-004 | INFO | Type precision | Address fields use `string` rather than viem's `Address` branded type |
| A09-CQ-005 | INFO | Naming consistency | `LpV3Position.pool` vs `LiquidityChangeV3.poolAddress` naming divergence |
| A09-CQ-006 | INFO | Naming | `liquidityChange` field name stutters with parent type name (mirrors subgraph schema) |

---

## 5. Overall Assessment

The file is in good shape for code quality. The major cleanup since the 2026-02-23/24 audits (removing 6 dead types) has left a clean, focused type surface with 13 well-organized exported symbols. The `interface` vs `type` convention is now consistent (interface for object shapes, type for aliases/unions/intersections). JSDoc coverage is thorough (every interface/type/enum has a top-level doc comment, and most non-obvious fields have field-level docs).

The only actionable finding is A09-CQ-001 (un-exporting `LiquidityChangeBase`), which is a minor encapsulation improvement. All other observations are informational.
