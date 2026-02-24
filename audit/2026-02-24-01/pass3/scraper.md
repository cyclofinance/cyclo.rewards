# Pass 3 -- Documentation Audit: `src/scraper.ts`

**Auditor Agent:** A07
**Date:** 2026-02-24
**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/scraper.ts`

---

## 1. Inventory of Functions, Types, Constants, and Exports

### Module-Level Constants

| Line | Symbol | Kind | Exported |
|------|--------|------|----------|
| 9 | `SUBGRAPH_URL` | `const` (string) | No |
| 11 | `BATCH_SIZE` | `const` (number, 1000) | No |
| 16 | `UNTIL_SNAPSHOT` | `const` (number) | No |

### Types/Interfaces

| Line | Symbol | Kind | Exported |
|------|--------|------|----------|
| 18 | `SubgraphTransfer` | `interface` | No |
| 29 | `SubgraphLiquidityChangeBase` | `type` | No |
| 42 | `SubgraphLiquidityChangeV2` | `type` | No |
| 46 | `SubgraphLiquidityChangeV3` | `type` | No |
| 55 | `SubgraphLiquidityChange` | `type` (union) | Yes |

### Functions

| Line | Symbol | Kind | Exported |
|------|--------|------|----------|
| 57 | `scrapeTransfers()` | `async function` | No |
| 139 | `scrapeLiquidityChanges()` | `async function` | No |
| 249 | `main()` | `async function` | No |

---

## 2. Module-Level Documentation

**[A07-DOC-001] No module-level JSDoc or header comment.**
Severity: Low
The file is the data-fetching layer of the pipeline, responsible for scraping transfer and liquidity change events from a Goldsky-hosted subgraph and persisting them as JSONL files. There is no module-level documentation explaining this.

---

## 3. Type/Interface Documentation

### `SubgraphTransfer` (line 18)

**[A07-DOC-002] `SubgraphTransfer` interface is undocumented.**
Severity: Low
This interface represents the raw shape of a transfer event as returned by the Goldsky subgraph GraphQL API. It has nested objects (`from: { id: string }`, `to: { id: string }`) that differ from the flattened `Transfer` type in `types.ts`. No JSDoc explains this mapping relationship.

### `SubgraphLiquidityChangeBase` (line 29)

**[A07-DOC-003] `SubgraphLiquidityChangeBase` type is undocumented.**
Severity: Low
Represents the common fields of a liquidity change event from the subgraph. The `owner` field uses `{ address: string }` (nested object), which differs from the flattened `string` in the `LiquidityChange` type. This transformation is not documented.

### `SubgraphLiquidityChangeV2` (line 42)

**[A07-DOC-004] `SubgraphLiquidityChangeV2` type is undocumented.**
Severity: Low
Discriminated union member for Uniswap V2 liquidity changes. No documentation.

### `SubgraphLiquidityChangeV3` (line 46)

**[A07-DOC-005] `SubgraphLiquidityChangeV3` type is undocumented.**
Severity: Low
Discriminated union member for Uniswap V3 liquidity changes with additional fields (`tokenId`, `poolAddress`, `fee`, `lowerTick`, `upperTick`). No documentation.

### `SubgraphLiquidityChange` (line 55)

**[A07-DOC-006] `SubgraphLiquidityChange` exported type is undocumented.**
Severity: Low
This is the only exported type from this file. No JSDoc explains that it is a discriminated union of V2 and V3 liquidity change events from the subgraph.

---

## 4. Function-Level Documentation

### `scrapeTransfers()` (line 57)

**[A07-DOC-007] `scrapeTransfers()` has no JSDoc.**
Severity: Medium
This function performs paginated GraphQL queries to fetch all transfer events up to `UNTIL_SNAPSHOT`, transforms them from the subgraph format to the internal `Transfer` format, and writes the results to `data/transfers{N}.dat` as JSONL. Key undocumented behaviors:
- Pagination via `skip` / `BATCH_SIZE`
- File splitting at 270,000 records per file (to stay under GitHub's 100MB limit)
- Overwrites output files after each batch (progress saving)
- Ordering by `blockNumber` ascending
- The `+1` on `UNTIL_SNAPSHOT` to ensure inclusive boundary

### `scrapeLiquidityChanges()` (line 139)

**[A07-DOC-008] `scrapeLiquidityChanges()` has no JSDoc.**
Severity: Medium
This function performs paginated GraphQL queries to fetch all liquidity change events, transforms them, writes to `data/liquidity.dat`, and additionally collects V3 pool addresses into `data/pools.dat`. Key undocumented behaviors:
- Uses GraphQL inline fragments (`... on LiquidityV3Change`) for polymorphic data
- Collects V3 pool addresses as a side effect
- Writes pools as a JSON array (not JSONL)
- String-to-number conversions for `fee`, `lowerTick`, `upperTick`

### `main()` (line 249)

**[A07-DOC-009] `main()` has no JSDoc.**
Severity: Low
The function is two lines -- it calls `scrapeTransfers()` then `scrapeLiquidityChanges()`. The inline comment on line 248 (`// main entrypoint to capture transfers and liquidity changes`) is adequate for its simplicity, though a JSDoc would be more conventional.

---

## 5. Inline Comment Accuracy

### [A07-DOC-010] Line 13-14: `// ensure END_SNAPSHOT env is set...` -- accurate and helpful.
Severity: None
```typescript
// ensure END_SNAPSHOT env is set for deterministic transfers.dat,
// as we will fetch transfers up until the end of the snapshot block numbers
```
This correctly explains the purpose of the assertion on line 15.

### [A07-DOC-011] Line 16: `// +1 to make sure every transfer is gathered` -- accurate.
Severity: None
The GraphQL query uses `blockNumber_lte: $untilSnapshot`, so adding 1 ensures transfers at exactly `END_SNAPSHOT` are included.

### [A07-DOC-012] Line 121-122: `// Save progress after each batch / split into 2 files to avoid github 100MB file size limit` -- partially inaccurate.
Severity: Low
The comment says "split into 2 files" but the code splits into `Math.ceil(transfers.length / 270000)` files, which could be more than 2. The comment should say "split into multiple files" or be updated to reflect the actual splitting logic.

### [A07-DOC-013] Line 228: `// Save progress after each batch` -- accurate.
Severity: None

### [A07-DOC-014] Line 238: `// save v3 pools list` -- accurate.
Severity: None

### [A07-DOC-015] Line 248: `// main entrypoint to capture transfers and liquidity changes` -- accurate.
Severity: None

---

## 6. Constant Documentation

### [A07-DOC-016] `SUBGRAPH_URL` (line 9) is undocumented.
Severity: Low
The URL points to a specific Goldsky-hosted subgraph deployment (`cyclo-flare/2026-02-13-78a0`). The version identifier in the URL suggests this is a pinned deployment. No comment explains this or notes when it was last updated.

### [A07-DOC-017] `BATCH_SIZE` (line 11) is undocumented.
Severity: Info
The value 1000 is the GraphQL query page size. Self-explanatory from context, but a brief comment could note any subgraph-imposed limits.

---

## 7. Summary

| ID | Severity | Description |
|----|----------|-------------|
| A07-DOC-001 | Low | No module-level JSDoc |
| A07-DOC-002 | Low | `SubgraphTransfer` interface undocumented |
| A07-DOC-003 | Low | `SubgraphLiquidityChangeBase` type undocumented |
| A07-DOC-004 | Low | `SubgraphLiquidityChangeV2` type undocumented |
| A07-DOC-005 | Low | `SubgraphLiquidityChangeV3` type undocumented |
| A07-DOC-006 | Low | `SubgraphLiquidityChange` exported type undocumented |
| A07-DOC-007 | Medium | `scrapeTransfers()` has no JSDoc |
| A07-DOC-008 | Medium | `scrapeLiquidityChanges()` has no JSDoc |
| A07-DOC-009 | Low | `main()` has no JSDoc |
| A07-DOC-010 | None | Line 13-14 comment accurate |
| A07-DOC-011 | None | Line 16 comment accurate |
| A07-DOC-012 | Low | Line 121-122 says "split into 2 files" but code splits into N files |
| A07-DOC-013 | None | Line 228 comment accurate |
| A07-DOC-014 | None | Line 238 comment accurate |
| A07-DOC-015 | None | Line 248 comment accurate |
| A07-DOC-016 | Low | `SUBGRAPH_URL` constant undocumented |
| A07-DOC-017 | Info | `BATCH_SIZE` constant undocumented |
