# Pass 2: Test Coverage Review — `src/scraper.ts`

**Agent:** A08
**Date:** 2026-03-22
**Source file:** `src/scraper.ts` (335 lines)
**Test file:** `src/scraper.test.ts` (319 lines)

---

## Evidence of Thorough Reading

### Source file: `src/scraper.ts`

| Item | Kind | Line(s) |
|------|------|---------|
| `SUBGRAPH_URL` | const | 17-18 |
| `BATCH_SIZE` | const | 19 |
| `UNTIL_SNAPSHOT` | const (derived from env) | 24 |
| `SubgraphTransfer` | interface (exported) | 28-37 |
| `SubgraphLiquidityChangeBase` | type (exported) | 40-51 |
| `SubgraphLiquidityChangeV2` | type (exported) | 54-56 |
| `SubgraphLiquidityChangeV3` | type (exported) | 59-66 |
| `SubgraphLiquidityChange` | type (exported) | 69 |
| `VALID_CHANGE_TYPES` | const | 71 |
| `parseIntStrict(value, field)` | function (private) | 74-78 |
| `validateNumericString(value, field)` | function (private) | 82-84 |
| `validateIntegerString(value, field)` | function (private) | 87-89 |
| `mapSubgraphTransfer(t)` | function (exported) | 96-110 |
| `mapSubgraphLiquidityChange(t)` | function (exported) | 117-151 |
| `scrapeTransfers()` | async function (private) | 158-231 |
| `scrapeLiquidityChanges()` | async function (private) | 237-326 |
| `main()` | async function (private) | 329-332 |
| Module-level `assert(process.env.END_SNAPSHOT, ...)` | assertion | 23 |
| Module-level `assert(!isNaN(UNTIL_SNAPSHOT), ...)` | assertion | 25 |
| `config()` (dotenv) | side effect | 14 |
| `main().catch(...)` | side effect | 334 |

### Test file: `src/scraper.test.ts`

| Item | Kind | Line(s) |
|------|------|---------|
| `VALID_SUBGRAPH_TRANSFER` | test fixture | 14-23 |
| `VALID_V2_LIQUIDITY` | test fixture | 26-38 |
| `VALID_V3_LIQUIDITY` | test fixture | 41-58 |
| `describe("mapSubgraphTransfer")` | test suite | 60-130 |
| - flatten from/to | test | 61-65 |
| - parse blockNumber/timestamp | test | 67-71 |
| - passthrough fields | test | 73-78 |
| - no id in output | test | 80-83 |
| - zero blockNumber/timestamp | test | 85-94 |
| - throw non-numeric blockNumber | test | 96-99 |
| - throw non-numeric blockTimestamp | test | 101-104 |
| - throw invalid from address | test | 106-109 |
| - throw invalid to address | test | 110-114 |
| - throw invalid tokenAddress | test | 116-119 |
| - throw non-numeric value | test | 121-124 |
| - accept valid numeric value "0" | test | 126-129 |
| `describe("mapSubgraphLiquidityChange")` | test suite | 132-305 |
| - V2 correct __typename + fields | test | 133-140 |
| - V3 specific fields | test | 142-152 |
| - negative tick values | test | 154-165 |
| - V2 has no V3 fields | test | 167-174 |
| - owner from nested address | test | 176-179 |
| - WITHDRAW change type | test | 181-188 |
| - TRANSFER change type | test | 190-197 |
| - passthrough liquidityChange/depositedBalanceChange | test | 199-203 |
| - tick boundary values | test | 205-216 |
| - zero tick value | test | 218-229 |
| - throw non-numeric blockNumber | test | 231-234 |
| - throw non-numeric blockTimestamp | test | 236-239 |
| - throw invalid owner address | test | 241-244 |
| - throw invalid tokenAddress | test | 246-249 |
| - throw invalid lpAddress | test | 251-254 |
| - throw unknown liquidityChangeType | test | 256-259 |
| - throw non-numeric V3 fee | test | 261-264 |
| - throw non-numeric V3 lowerTick | test | 266-269 |
| - throw non-numeric V3 upperTick | test | 270-274 |
| - throw invalid V3 poolAddress | test | 276-279 |
| - throw non-numeric liquidityChange | test | 281-284 |
| - throw non-numeric depositedBalanceChange | test | 286-289 |
| - accept negative liquidityChange | test | 291-294 |
| - accept negative depositedBalanceChange | test | 296-299 |
| - throw non-numeric V3 tokenId | test | 301-304 |
| `describe("END_SNAPSHOT validation")` | test suite | 307-318 |
| - error if END_SNAPSHOT is not a valid number | test | 308-317 |

---

## Coverage Analysis

### Well-covered

- **`mapSubgraphTransfer`**: All validation paths (address validation for tokenAddress/from/to, numeric string validation for value, parseIntStrict for blockNumber/blockTimestamp), happy-path field mapping, zero edge case, output shape verification (no `id` field). **Good coverage.**
- **`mapSubgraphLiquidityChange`**: V2 happy path, V3 happy path, V3-specific field discrimination, all three changeType values (DEPOSIT/TRANSFER/WITHDRAW), negative tick values, tick boundary values, zero tick, all validation error paths (addresses, numeric fields, unknown changeType). **Good coverage.**
- **Module-level END_SNAPSHOT NaN assertion**: Tested via dynamic import with `vi.resetModules()`.

### Coverage Gaps

#### FINDING-1: `parseIntStrict` accepts trailing non-numeric characters (MEDIUM)

`parseIntStrict` (line 74-78) uses `parseInt()` which silently parses `"12abc"` as `12` and `"12.5"` as `12`. The function only rejects inputs where `parseInt()` returns `NaN` (e.g., `""`, `"abc"`). There is no test verifying that partially numeric strings like `"12abc"` or `"12.5"` are handled. Since `parseIntStrict` is used for `blockNumber`, `blockTimestamp`, `fee`, `lowerTick`, and `upperTick`, corrupt subgraph data with trailing garbage could silently produce incorrect integers.

The `validateNumericString` and `validateIntegerString` functions use strict regex (`/^\d+$/` and `/^-?\d+$/`) and do not have this issue, but they are only applied to `value`, `liquidityChange`, `depositedBalanceChange`, and `tokenId` -- not to the fields parsed by `parseIntStrict`.

**Test gap:** No test asserts behavior on inputs like `"12abc"`, `"12.5"`, or `"100 "` passed to fields using `parseIntStrict`. The current tests only check fully non-numeric inputs (`"abc"`, `"xyz"`, `""`).

#### FINDING-2: `scrapeTransfers` is untested (MEDIUM)

The `scrapeTransfers` function (line 158-231) is a private async function that:
- Paginates through subgraph results using skip/first
- Calls `mapSubgraphTransfer` on each batch
- Splits output into chunked files at `TRANSFER_CHUNK_SIZE`
- Implements crash recovery by rewriting all files after each batch
- Uses a `hasMore` loop termination when `batchTransfers.length < BATCH_SIZE`

None of these behaviors are tested. Key untested paths:
- Pagination logic (skip increments, termination condition)
- File chunking (correct split at TRANSFER_CHUNK_SIZE boundary)
- Crash recovery behavior (files written after each batch, not just at end)
- Empty response handling (what happens if first batch returns 0 results)
- GraphQL query construction correctness

This is rated MEDIUM rather than HIGH because (a) the function orchestrates I/O and external calls that are naturally harder to unit test, and (b) the CI determinism check (`git-clean.yaml`) provides integration-level coverage by asserting reproducible outputs.

#### FINDING-3: `scrapeLiquidityChanges` is untested (MEDIUM)

The `scrapeLiquidityChanges` function (line 237-326) is a private async function that:
- Paginates through subgraph results
- Collects V3 pool addresses into a `Set<string>` (lowercased)
- Writes liquidity JSONL after each batch
- Writes `pools.dat` as JSON array at the end

Untested paths:
- V3 pool address collection (lowercasing, deduplication via Set)
- `pools.dat` output correctness
- File writing after each batch (crash recovery)
- Pagination termination
- Mixed V2/V3 batches (only V3 entries should contribute pool addresses)

Same severity rationale as FINDING-2.

#### FINDING-4: Module-level `END_SNAPSHOT` undefined assertion is not tested (LOW)

The assertion at line 23 (`assert(process.env.END_SNAPSHOT, "undefined END_SNAPSHOT env variable")`) is not directly tested. The test file sets `process.env.END_SNAPSHOT = "99999999"` at line 2 before importing the module, which prevents this assertion from firing. The test at line 307-317 tests the NaN case (line 25) but not the undefined case (line 23).

Testing this would require a separate test module import with `END_SNAPSHOT` unset, which is awkward but possible with `vi.resetModules()`.

#### FINDING-5: `main()` error handling path is untested (LOW)

The `main().catch((e) => { console.error(e); process.exit(1); })` at line 334 is not tested. If `scrapeTransfers` or `scrapeLiquidityChanges` throws, the process should log the error and exit with code 1. This is standard boilerplate and low risk, but the error propagation path is unverified.

#### FINDING-6: Transfer `value` of `"-1"` (negative) is not explicitly tested (INFO)

The `validateNumericString` regex (`/^\d+$/`) correctly rejects negative values. While the test at line 126-129 checks that `"0"` is accepted, there is no explicit test that a negative transfer value like `"-1"` is rejected. The regex clearly handles this, but an explicit test would serve as documentation of the design intent that transfer values must be non-negative.

#### FINDING-7: Empty string `transactionHash` is not validated or tested (INFO)

`mapSubgraphTransfer` (line 96-110) and `mapSubgraphLiquidityChange` (line 117-151) pass `transactionHash` through without any validation. An empty string or malformed hash would be silently accepted. No test checks this. Since the transaction hash is used for traceability rather than computation, this is informational.

---

## Summary

| Severity | Count | Details |
|----------|-------|---------|
| CRITICAL | 0 | -- |
| HIGH | 0 | -- |
| MEDIUM | 3 | F1: parseIntStrict lax parsing; F2: scrapeTransfers untested; F3: scrapeLiquidityChanges untested |
| LOW | 2 | F4: END_SNAPSHOT undefined not tested; F5: main() error path untested |
| INFO | 2 | F6: negative value rejection not explicitly tested; F7: transactionHash not validated |

The exported mapping functions (`mapSubgraphTransfer`, `mapSubgraphLiquidityChange`) have strong test coverage for both happy paths and error paths. The main coverage gaps are in (1) a subtle laxness in `parseIntStrict` that no test exercises, and (2) the private async orchestration functions that handle pagination, file I/O, and crash recovery.
