# Pass 3 -- Documentation Audit: `src/scraper.ts`

**Auditor:** A07
**Date:** 2026-02-23
**Audit ID:** 2026-02-23-01
**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/scraper.ts` (245 lines)

---

## Evidence of Thorough Reading

The file was read in its entirety (lines 1-245). Cross-referenced against `src/types.ts`, `src/config.ts`, `CLAUDE.md`, and `package.json` for documentation accuracy.

---

## Complete Inventory of Functions, Exported Types, and Constants

### Constants

| Name | Line(s) | Scope | Value / Description |
|------|---------|-------|---------------------|
| `SUBGRAPH_URL` | 9-10 | Module-private | Hardcoded Goldsky GraphQL endpoint: `https://api.goldsky.com/api/public/project_cm4zggfv2trr301whddsl9vaj/subgraphs/cyclo-flare/2025-12-30-6559/gn` |
| `BATCH_SIZE` | 11 | Module-private | `1000` |
| `UNTIL_SNAPSHOT` | 16 | Module-private | `parseInt(process.env.END_SNAPSHOT) + 1` |

### Types and Interfaces

| Name | Line(s) | Exported? | Kind | Documentation |
|------|---------|-----------|------|---------------|
| `SubgraphTransfer` | 18-26 | No | `interface` | None |
| `SubgraphLiquidityChangeBase` | 28-38 | No | `type` | None |
| `SubgraphLiquidityChangeV2` | 40-42 | No | `type` (intersection) | None |
| `SubgraphLiquidityChangeV3` | 44-51 | No | `type` (intersection) | None |
| `SubgraphLiquidityChange` | 53 | **Yes** | `type` (exported union) | None |

### Functions

| Name | Line(s) | Exported? | Async? | Documentation |
|------|---------|-----------|--------|---------------|
| `scrapeTransfers` | 55-129 | No | Yes | None |
| `scrapeLiquidityChanges` | 131-236 | No | Yes | None |
| `main` | 239-242 | No | Yes | Single inline comment on line 238 |

### Top-Level Side Effects

| Line | Effect | Documentation |
|------|--------|---------------|
| 7 | `config()` -- loads `.env` | None |
| 13-14 | Comment explaining `END_SNAPSHOT` assertion purpose | Inline comment |
| 15 | `assert(process.env.END_SNAPSHOT, ...)` -- fails if env var missing | Error message only |
| 16 | `UNTIL_SNAPSHOT` computation with `+1` | Inline comment: `// +1 to make sure every transfer is gathered` |
| 244 | `main().catch(console.error)` -- entry point | None |

### Inline Comments

| Line(s) | Comment Text |
|---------|-------------|
| 13-14 | `// ensure END_SNAPSHOT env is set for deterministic transfers.dat, as we will fetch transfers up until the end of the snapshot block numbers` |
| 16 | `// +1 to make sure every transfer is gathered` |
| 62 | `console.log` message (progress logging, not documentation) |
| 117 | `// Save progress after each batch` |
| 123 | `// Log progress` |
| 136 | Comment on `v3Pools` set: `// gather all v3 pools address` |
| 204 | `// add to v3 pools list` |
| 228 | `// save v3 pools list` |
| 238 | `// main entrypoint to capture transfers and liquidity changes` |

---

## Documentation Findings

### A07-1 -- MEDIUM -- No JSDoc or block comment on `scrapeTransfers()` function

**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/scraper.ts`, lines 55-129

**Description:**
The `scrapeTransfers()` function (75 lines) is one of two primary functions in the module and performs the entire transfer scraping pipeline: GraphQL pagination, response mapping, JSONL serialization, and file writing. It has no documentation of any kind -- no JSDoc block, no preceding comment, no inline description of its purpose, parameters, return value, side effects, or error behavior.

The function performs a critical data transformation (lines 100-107) that flattens nested subgraph objects, renames fields (`blockTimestamp` to `timestamp`, `from.id` to `from`), and parses strings to integers. None of these mapping decisions are documented, making it unclear whether the field renaming is intentional design or accidental, and providing no guidance to maintainers on what downstream consumers expect.

**Recommendation:**
Add a JSDoc comment documenting: purpose, data source (subgraph URL), output file path and format (JSONL), pagination strategy, field mapping rationale, and side effects (file writes to `data/transfers.dat`).

---

### A07-2 -- MEDIUM -- No JSDoc or block comment on `scrapeLiquidityChanges()` function

**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/scraper.ts`, lines 131-236

**Description:**
The `scrapeLiquidityChanges()` function (106 lines) is the more complex of the two scraping functions and has no documentation. It handles:
- GraphQL pagination of liquidity change events
- A discriminated union mapping (V2 vs V3 changes) with conditional field inclusion (lines 197-206)
- Collection of V3 pool addresses into a separate `Set` (lines 136, 205)
- Two output files: `data/liquidity.dat` (JSONL) and `data/pools.dat` (JSON array)

None of these behaviors are documented. The dual-output behavior is particularly notable -- writing both `liquidity.dat` and `pools.dat` -- but there is no documentation explaining why `pools.dat` exists, what consumes it, or why V3 pool addresses need to be collected separately.

The only inline comments are terse single-line notes: `// gather all v3 pools address` (line 136), `// add to v3 pools list` (line 204), `// save v3 pools list` (line 228). These describe the "what" but not the "why."

**Recommendation:**
Add a JSDoc comment documenting: purpose, both output files and their formats, the V2/V3 discriminated union handling, the reason for collecting V3 pool addresses separately, and the relationship to downstream consumers (`processor.ts`, `liquidity.ts`).

---

### A07-3 -- MEDIUM -- Exported type `SubgraphLiquidityChange` has no documentation

**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/scraper.ts`, line 53

**Description:**
`SubgraphLiquidityChange` is the only exported symbol from this module (a union type of `SubgraphLiquidityChangeV2 | SubgraphLiquidityChangeV3`). It has no JSDoc, no comment, and no documentation explaining:
- What subgraph entity it represents
- Why it is exported (what external consumer needs it)
- How it differs from the internal `LiquidityChange` type defined in `types.ts`
- The semantic difference between V2 and V3 variants

Notably, a grep across the codebase confirms that no other file imports `SubgraphLiquidityChange`. This raises the question of whether the export is intentional or accidental, but the lack of documentation makes it impossible to determine the author's intent.

**Recommendation:**
Either (a) add JSDoc documentation explaining the type's purpose and intended consumers, or (b) if it has no external consumers, remove the `export` keyword to reduce the module's public API surface.

---

### A07-4 -- MEDIUM -- CLAUDE.md omits `data/pools.dat` from scraper description

**File:** `/Users/thedavidmeister/Code/cyclo.rewards/CLAUDE.md`, line 33

**Description:**
The CLAUDE.md architecture section describes `scraper.ts` as: "Fetches transfer and liquidity events from Goldsky GraphQL subgraph up to END_SNAPSHOT block. Writes JSONL to `data/transfers.dat` and `data/liquidity.dat`."

However, `scrapeLiquidityChanges()` also writes `data/pools.dat` (line 229-232), a JSON array of V3 pool addresses. This third output file is omitted from the scraper's description. The Data Files section of CLAUDE.md (line 59) does mention `data/pools.dat` in the listing, but attributes it generically to "Cached JSONL from subgraph" alongside `transfers.dat` and `liquidity.dat`.

This is inaccurate in two ways:
1. `pools.dat` is not JSONL -- it is a single JSON array.
2. The scraper description does not mention producing `pools.dat`.

**Recommendation:**
Update CLAUDE.md line 33 to: "Writes JSONL to `data/transfers.dat` and `data/liquidity.dat`, and a JSON array of V3 pool addresses to `data/pools.dat`." Also correct line 59 to distinguish the format of `pools.dat` from the JSONL files.

---

### A07-5 -- MEDIUM -- `UNTIL_SNAPSHOT` off-by-one has insufficient documentation

**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/scraper.ts`, line 16

**Description:**
Line 16 computes `UNTIL_SNAPSHOT = parseInt(process.env.END_SNAPSHOT) + 1` with the comment `// +1 to make sure every transfer is gathered`. This is used in both GraphQL queries as `blockNumber_lte: $untilSnapshot` (lines 72, 149).

The comment explains the intent ("make sure every transfer is gathered") but does not explain the reasoning. Combined with `_lte` (less than or equal), this means transfers up to and including block `END_SNAPSHOT + 1` are fetched -- one block beyond the stated end snapshot. Questions left unanswered by the documentation:

1. Is the `+1` compensating for an exclusive boundary that does not actually exist (since `_lte` is already inclusive)?
2. Is it intentionally fetching one extra block as a safety margin?
3. Does the downstream processor filter out transfers beyond `END_SNAPSHOT`, making the over-fetch harmless?
4. Or does this result in transfers from block `END_SNAPSHOT + 1` being included in reward calculations, which would be a semantic error?

The CLAUDE.md description says the scraper "Fetches transfer and liquidity events from Goldsky GraphQL subgraph up to END_SNAPSHOT block," which would imply `blockNumber_lte: END_SNAPSHOT` without the `+1`. The code contradicts the documentation.

**Recommendation:**
Add a more detailed comment explaining precisely why `+1` is needed given that `_lte` is already inclusive, and whether downstream processing handles the extra block. Update CLAUDE.md if the `+1` is intentional behavior.

---

### A07-6 -- LOW -- No module-level documentation or file header

**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/scraper.ts`

**Description:**
The file has no module-level documentation. There is no file header comment, no JSDoc `@module` tag, and no block comment describing the module's purpose, inputs, outputs, or relationship to the rest of the pipeline. The `main()` function has a single inline comment (line 238: `// main entrypoint to capture transfers and liquidity changes`) but this is the only description of the module's overall purpose within the file itself.

By contrast, the CLAUDE.md provides a reasonable one-line summary of the module's purpose, but this is external documentation that is not co-located with the code. A developer reading the source file must consult an external document to understand its role.

**Recommendation:**
Add a module-level JSDoc or block comment at the top of the file (after imports) describing: the module's role in the pipeline, its inputs (subgraph URL, `END_SNAPSHOT` env var), its outputs (three `.dat` files), and its execution model (standalone script invoked via `npm run scrape`).

---

### A07-7 -- LOW -- `SubgraphTransfer` interface has no documentation

**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/scraper.ts`, lines 18-26

**Description:**
The `SubgraphTransfer` interface represents the raw response shape from the Goldsky subgraph's `transfers` query. It has no JSDoc or inline comments explaining:
- That it mirrors the subgraph's GraphQL schema for transfer entities
- Why `from` and `to` are nested objects with an `id` field (this is the subgraph's representation of address entities)
- Why `value`, `blockNumber`, and `blockTimestamp` are strings (subgraph returns all values as strings)
- How it differs from the `Transfer` type in `types.ts` (which has parsed numeric fields and flattened address fields)

**Recommendation:**
Add a brief JSDoc comment indicating this represents the raw subgraph response shape and noting the key differences from the internal `Transfer` type.

---

### A07-8 -- LOW -- `SubgraphLiquidityChangeBase`, `SubgraphLiquidityChangeV2`, `SubgraphLiquidityChangeV3` types have no documentation

**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/scraper.ts`, lines 28-51

**Description:**
Three related types define the raw subgraph response shape for liquidity change entities, using a discriminated union pattern based on `__typename`. None have documentation explaining:
- The relationship between these types and the subgraph schema
- The meaning of the `__typename` discriminator (a GraphQL introspection field)
- Why V3 changes have additional fields (`tokenId`, `poolAddress`, `fee`, `lowerTick`, `upperTick`)
- How these differ from the corresponding `LiquidityChangeBase`, `LiquidityChangeV2`, `LiquidityChangeV3` types in `types.ts` (where `blockNumber` and `timestamp` are numbers, `fee`/`lowerTick`/`upperTick` are numbers, and `owner` is a string rather than a nested object)

**Recommendation:**
Add JSDoc comments to at least the base type and the V3 extension, noting the subgraph origin and the key differences from the internal types.

---

### A07-9 -- LOW -- `SUBGRAPH_URL` constant has no documentation

**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/scraper.ts`, lines 9-10

**Description:**
The `SUBGRAPH_URL` constant contains a hardcoded Goldsky endpoint URL with a versioned deployment identifier (`2025-12-30-6559`). There is no comment explaining:
- What subgraph deployment this points to
- When/why this specific version was chosen
- Whether the URL should be updated when the subgraph is redeployed
- Whether the version in the URL (`2025-12-30-6559`) has any relationship to the data freshness or schema version

The versioned deployment identifier embedded in the URL (`2025-12-30-6559`) suggests a specific deployment date, but this is not documented anywhere in the codebase.

**Recommendation:**
Add a comment documenting the subgraph name, deployment version rationale, and when/how to update it.

---

### A07-10 -- LOW -- `BATCH_SIZE` constant has no documentation

**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/scraper.ts`, line 11

**Description:**
The `BATCH_SIZE` constant is set to `1000` with no explanation of why this value was chosen. Relevant undocumented considerations include:
- Whether `1000` is the subgraph's maximum allowed `first` parameter (The Graph typically caps at 1000)
- Whether this value was chosen for performance or to stay within API limits
- Whether changing it would affect correctness (e.g., if it interacts with the `skip` pagination ceiling)

**Recommendation:**
Add a brief comment noting the rationale (e.g., `// Maximum allowed by The Graph protocol's first parameter`).

---

### A07-11 -- LOW -- `main()` function has minimal documentation

**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/scraper.ts`, lines 238-242

**Description:**
The `main()` function has a single inline comment: `// main entrypoint to capture transfers and liquidity changes` (line 238). While this describes the purpose, it does not document:
- That it runs scraping functions sequentially (transfers first, then liquidity changes)
- That this ordering matters (or does not matter)
- That the function is auto-invoked at module scope (line 244)
- The error handling behavior (errors are caught and logged but do not set a non-zero exit code)

**Recommendation:**
Expand the comment or convert to JSDoc to note the execution order, auto-invocation, and error handling.

---

### A07-12 -- LOW -- Inline comments use inconsistent terminology

**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/scraper.ts`, various lines

**Description:**
The inline comments use inconsistent and sometimes imprecise terminology:
- Line 117: `// Save progress after each batch` -- the word "progress" is misleading because the entire accumulated array is rewritten, not appended. The file does not represent "progress" in the incremental sense; it represents the complete dataset gathered so far.
- Line 136: `// gather all v3 pools address` -- grammatically should be "addresses" (plural). Also, "gather" is imprecise -- the set is being populated as a side effect of the liquidity change mapping.
- Lines 13-14 reference "deterministic transfers.dat" but do not explain what makes it deterministic (the `END_SNAPSHOT` bound).

These are minor issues individually but collectively reduce documentation clarity.

**Recommendation:**
Revise comments for accuracy and consistency. For example, line 117 could read `// Overwrite data file with all transfers gathered so far` to accurately describe the behavior.

---

### A07-13 -- INFO -- Data mapping transformations lack inline documentation

**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/scraper.ts`, lines 100-107 and 185-208

**Description:**
The two mapping transformations that convert subgraph response objects to internal types contain no inline comments explaining the field renaming and parsing decisions:
- `from.id` is flattened to `from` (line 102) -- no comment
- `to.id` is flattened to `to` (line 103) -- no comment
- `blockTimestamp` is renamed to `timestamp` (line 106) -- no comment
- `owner.address` is flattened to `owner` (line 190) -- no comment
- `liquidityChangeType` is cast to `LiquidityChangeType` enum with `as` (line 191) -- no comment explaining the unsafe cast
- `poolAddress` is lowercased (line 205) but `tokenAddress` and `lpAddress` are not -- no comment explaining the inconsistency

The lack of documentation on the `.toLowerCase()` applied only to `poolAddress` (line 205) is particularly notable. The asymmetric normalization -- lowercasing `poolAddress` but leaving `tokenAddress`, `lpAddress`, and `owner.address` in their original casing -- is either intentional (and should be documented why) or a bug.

**Recommendation:**
Add inline comments at the mapping transformations explaining the field renaming rationale and the address normalization strategy.

---

## Summary

| ID | Severity | Title |
|----|----------|-------|
| A07-1 | MEDIUM | `scrapeTransfers()` function has no documentation |
| A07-2 | MEDIUM | `scrapeLiquidityChanges()` function has no documentation |
| A07-3 | MEDIUM | Exported type `SubgraphLiquidityChange` has no documentation |
| A07-4 | MEDIUM | CLAUDE.md omits `data/pools.dat` from scraper description and mischaracterizes its format |
| A07-5 | MEDIUM | `UNTIL_SNAPSHOT` off-by-one has insufficient documentation; contradicts CLAUDE.md |
| A07-6 | LOW | No module-level documentation or file header |
| A07-7 | LOW | `SubgraphTransfer` interface has no documentation |
| A07-8 | LOW | `SubgraphLiquidityChangeBase`/V2/V3 types have no documentation |
| A07-9 | LOW | `SUBGRAPH_URL` constant has no documentation |
| A07-10 | LOW | `BATCH_SIZE` constant has no documentation |
| A07-11 | LOW | `main()` function has minimal documentation |
| A07-12 | LOW | Inline comments use inconsistent terminology |
| A07-13 | INFO | Data mapping transformations lack inline documentation for field renaming and selective lowercasing |

**Critical: 0** | **High: 0** | **Medium: 5** | **Low: 7** | **Info: 1**
