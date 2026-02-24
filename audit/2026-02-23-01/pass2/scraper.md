# Audit A07 — Pass 2 (Test Coverage) — `src/scraper.ts`

**Auditor:** A07
**Date:** 2026-02-23
**Audit ID:** 2026-02-23-01
**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/scraper.ts` (245 lines)

---

## Evidence of Thorough Reading

### Constants and module-level declarations

| Item | Line(s) | Description |
|------|---------|-------------|
| `SUBGRAPH_URL` | 9-10 | Goldsky subgraph endpoint (hardcoded string) |
| `BATCH_SIZE` | 11 | Fixed at 1000 |
| `UNTIL_SNAPSHOT` | 16 | `parseInt(process.env.END_SNAPSHOT) + 1` |
| `assert(process.env.END_SNAPSHOT, ...)` | 15 | Runtime assertion on env var |

### Types/Interfaces defined

| Type | Line(s) | Exported? |
|------|---------|-----------|
| `SubgraphTransfer` | 18-26 | No (private interface) |
| `SubgraphLiquidityChangeBase` | 28-38 | No (private type) |
| `SubgraphLiquidityChangeV2` | 40-42 | No (private type) |
| `SubgraphLiquidityChangeV3` | 44-51 | No (private type) |
| `SubgraphLiquidityChange` | 53 | **Yes** (exported union type) |

### Functions defined

| Function | Line(s) | Exported? | Async? |
|----------|---------|-----------|--------|
| `scrapeTransfers()` | 55-129 | No | Yes |
| `scrapeLiquidityChanges()` | 131-236 | No | Yes |
| `main()` | 239-242 | No | Yes |

### Imports

- `request`, `gql` from `graphql-request` (line 1)
- `writeFile` from `fs/promises` (line 2)
- `LiquidityChange`, `LiquidityChangeType`, `Transfer` from `./types` (line 3)
- `config` from `dotenv` (line 4)
- `assert` from `assert` (line 5)

### Side effects at module load

- `config()` called at line 7 (loads `.env`)
- `assert(process.env.END_SNAPSHOT, ...)` at line 15 (throws if env missing)
- `main().catch(console.error)` at line 244 (auto-executes on import)

---

## Test File Search Results

**No test file exists for `src/scraper.ts`.** Search evidence:

- Glob for `**/*scraper*` across the repo: found only the source file and prior audit documents.
- Grep for `scraper` and `scrape` across `**/*.test.*` and `**/*.spec.*`: zero matches.
- Grep for `SubgraphLiquidityChange`, `SubgraphTransfer`, `scrapeTransfers`, `scrapeLiquidityChanges` across `src/`: only found in `scraper.ts` itself.
- Existing test files are: `config.test.ts`, `liquidity.test.ts`, `processor.test.ts`, `diffCalculatorOutput.test.ts`, `diffCalculator.test.ts`. None reference scraper.

---

## Findings

### A07-1 — HIGH — No test file exists for `scraper.ts`

`src/scraper.ts` has zero test coverage. There is no `scraper.test.ts` or any other test file that imports from or exercises any code in this module. This is the only source file in the pipeline entry point (`npm run scrape`) and it has no tests at all, while every other major source file (`config.ts`, `processor.ts`, `liquidity.ts`, `diffCalculator.ts`) has a corresponding test file.

### A07-2 — HIGH — `scrapeTransfers()` data mapping logic is untested

The `scrapeTransfers()` function (lines 55-129) contains a mapping transformation (lines 100-107) that converts `SubgraphTransfer` objects to the internal `Transfer` type. This mapping:
- Renames `from.id` to `from` (flattening nested object)
- Renames `to.id` to `to` (flattening nested object)
- Parses `blockNumber` from string to int via `parseInt`
- Renames `blockTimestamp` to `timestamp` and parses from string to int

Any error in this mapping (e.g., wrong field name, missing field, incorrect parse) would silently corrupt the data pipeline. There are no tests verifying that the mapping produces correct `Transfer` objects from representative subgraph responses.

### A07-3 — HIGH — `scrapeLiquidityChanges()` data mapping logic is untested

The `scrapeLiquidityChanges()` function (lines 131-236) contains a more complex mapping transformation (lines 185-208) that:
- Uses `any` type cast (line 186) which bypasses TypeScript type safety
- Conditionally adds V3-specific fields (`tokenId`, `poolAddress`, `fee`, `lowerTick`, `upperTick`) based on `__typename` discriminator (lines 197-206)
- Parses `fee`, `lowerTick`, `upperTick` from strings to integers
- Calls `.toLowerCase()` on `poolAddress` (line 205)
- Collects V3 pool addresses into a `Set` (line 136, 205)

The `any` cast on line 186 is especially concerning because it disables compile-time type checking on the `base` object. A missing or misspelled field would not be caught by the compiler, and with no tests, would not be caught at runtime until the pipeline fails or produces wrong results.

### A07-4 — MEDIUM — Pagination/batching logic is untested

Both `scrapeTransfers()` (lines 61-125) and `scrapeLiquidityChanges()` (lines 138-226) implement identical pagination logic:
- `hasMore = batchResult.length === BATCH_SIZE` (lines 114, 215)
- `skip += batchResult.length` (lines 115, 216)

This logic determines whether all data has been fetched. If the subgraph returns exactly `BATCH_SIZE` items in the final batch, an unnecessary extra request will be made (minor). If the logic were inverted or broken, data would be silently truncated. No test verifies the loop terminates correctly for batches smaller than, equal to, or larger than `BATCH_SIZE`, or for empty responses.

### A07-5 — MEDIUM — File writing (JSONL serialization) is untested

Both functions write output to `.dat` files using a specific JSONL format: `items.map(t => JSON.stringify(t)).join("\n")` (lines 120-121, 221-222). The `scrapeLiquidityChanges()` function also writes pool data as a JSON array (lines 229-232). No test verifies:
- That the serialization format matches what downstream consumers (`processor.ts`) expect when they read these files.
- That the intermediate writes during pagination do not corrupt data (the file is rewritten on every batch iteration, not appended to).

### A07-6 — MEDIUM — `UNTIL_SNAPSHOT` off-by-one calculation is untested

Line 16 adds `+1` to `END_SNAPSHOT` with the comment "to make sure every transfer is gathered". This is used as `blockNumber_lte: $untilSnapshot` in the GraphQL query (lines 71-72, 148-149). The combination of `+1` and `_lte` means transfers up to block `END_SNAPSHOT + 1` are included, which is one block beyond the stated end snapshot. No test verifies whether this off-by-one is intentional and correct, or whether it over-fetches by one block.

### A07-7 — LOW — Module auto-executes on import, preventing unit testing

Line 244 calls `main().catch(console.error)` at module scope. This means any attempt to `import` from `scraper.ts` in a test file would trigger the full scraping pipeline (network requests, file writes, env var assertions). The module's side-effectful top-level execution makes it structurally untestable without mocking the entire module or refactoring to separate the executable entry point from the testable logic.

### A07-8 — LOW — Exported type `SubgraphLiquidityChange` has no consumer tests

The only export from this module is `SubgraphLiquidityChange` (line 53), a union type. Grep confirms no other file in `src/` imports this type. This is a dead export with no consumer and no test verifying its shape or compatibility with actual subgraph responses.

### A07-9 — LOW — Error handling for network failures and malformed responses is untested

Neither `scrapeTransfers()` nor `scrapeLiquidityChanges()` has explicit error handling for:
- Network failures or timeouts from the `request()` call
- Malformed or unexpected response shapes from the subgraph
- `parseInt` returning `NaN` for non-numeric strings

The only error handling is the `.catch(console.error)` on line 244, which swallows errors silently. No test verifies behavior under failure conditions.
