# Security Audit - Pass 1: `src/scraper.ts`

**Auditor Agent:** A07
**Date:** 2026-02-22
**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/scraper.ts` (245 lines)

---

## Evidence of Thorough Reading

### Module Purpose
Scrapes transfer and liquidity change events from a Goldsky GraphQL subgraph, paginating with a skip/first pattern, and writes JSONL output to `data/transfers.dat`, `data/liquidity.dat`, and `data/pools.dat`.

### Imports (lines 1-5)
- `request`, `gql` from `graphql-request`
- `writeFile` from `fs/promises`
- `LiquidityChange`, `LiquidityChangeType`, `Transfer` from `./types`
- `config` from `dotenv`
- `assert` from `assert`

### Constants (lines 9-16)
- `SUBGRAPH_URL` (line 9-10): Hardcoded Goldsky subgraph endpoint URL
- `BATCH_SIZE` (line 11): `1000`
- `UNTIL_SNAPSHOT` (line 16): `parseInt(process.env.END_SNAPSHOT) + 1`

### Types Defined (lines 18-53)
- `SubgraphTransfer` (interface, line 18): id, tokenAddress, from.id, to.id, value, blockNumber, blockTimestamp
- `SubgraphLiquidityChangeBase` (type, line 28): id, owner.address, tokenAddress, lpAddress, liquidityChangeType, liquidityChange, depositedBalanceChange, blockNumber, blockTimestamp
- `SubgraphLiquidityChangeV2` (type, line 40): extends base with `__typename: "LiquidityV2Change"`
- `SubgraphLiquidityChangeV3` (type, line 44): extends base with `__typename: "LiquidityV3Change"`, tokenId, poolAddress, fee, lowerTick, upperTick
- `SubgraphLiquidityChange` (exported type, line 53): union of V2 and V3

### Functions (lines 55-244)
- `scrapeTransfers()` (async, line 55): Paginates through `transfers` query, maps `SubgraphTransfer` to `Transfer`, writes to `data/transfers.dat`
- `scrapeLiquidityChanges()` (async, line 131): Paginates through `liquidityChanges` query, maps `SubgraphLiquidityChange` to `LiquidityChange`, writes to `data/liquidity.dat` and `data/pools.dat`
- `main()` (async, line 239): Calls `scrapeTransfers()` then `scrapeLiquidityChanges()`

### Entry Point (line 244)
- `main().catch(console.error)` - top-level invocation

### Assertions
- Line 15: `assert(process.env.END_SNAPSHOT, "undefined END_SNAPSHOT env variable")` - ensures env var is set

---

## Security Findings

### A07-1: Unbounded Memory Growth from In-Memory Accumulation [MEDIUM]

**Location:** Lines 59, 109 (`scrapeTransfers`) and lines 135, 210 (`scrapeLiquidityChanges`)

**Description:** Both scraping functions accumulate all results in memory arrays (`transfers` and `liquidityChanges`) for the full duration of pagination. Each batch appends to these arrays, and every iteration re-serializes the entire accumulated array to disk (lines 118-121, 219-222). For a large number of events (hundreds of thousands or millions), this causes:

1. Unbounded memory growth -- the entire dataset lives in memory.
2. O(n^2) total serialization work -- on each batch, the entire accumulated array is re-serialized.

**Impact:** Denial-of-service via memory exhaustion (OOM) if the subgraph returns a very large dataset. In practice, the dataset is bounded by the block range, but there is no explicit cap.

**Recommendation:** Write each batch in append mode (using `appendFile` or a write stream) instead of re-serializing the entire array on each iteration. This would also remove the need to hold all records in memory.

---

### A07-2: Subgraph `skip` Pagination Limit (5000) May Cause Silent Data Truncation [HIGH]

**Location:** Lines 56, 114-115 (`scrapeTransfers`) and lines 132, 215-216 (`scrapeLiquidityChanges`)

**Description:** The Graph protocol (and Goldsky subgraphs built on it) enforces a hard limit of `skip <= 5000`. When `skip` exceeds 5000, the subgraph typically returns an empty result set or an error, which will cause the `hasMore` check to become `false`, silently terminating pagination.

With `BATCH_SIZE = 1000`, only the first 6 batches (6000 records) can be retrieved via skip-based pagination. Any remaining records beyond the 6000th will be silently dropped.

For transfers, the `orderBy: blockNumber, orderDirection: asc` combined with a `where: { blockNumber_lte: $untilSnapshot }` filter means that if there are more than ~5000+BATCH_SIZE transfers in the block range, the tail end will be silently missing from `data/transfers.dat`. The same applies to liquidity changes.

**Impact:** Silent loss of transfer and liquidity data, leading to incorrect reward calculations. This is a correctness issue with direct financial impact -- accounts whose transfers appear only after the 6000th record would receive incorrect (likely zero) rewards.

**Recommendation:** Replace skip-based pagination with cursor-based pagination using the `id` field (e.g., `where: { id_gt: $lastId, blockNumber_lte: $untilSnapshot }`) which has no upper bound. Alternatively, paginate using `blockNumber_gt` with the last seen block number (handling ties carefully).

**Note:** If the actual dataset for the configured block range is confirmed to always be under 5000 total records, this finding is mitigated in practice, but the code contains no guard or assertion against this failure mode.

---

### A07-3: `parseInt` Without Validation on Subgraph Response Fields [LOW]

**Location:** Lines 105-106 (`scrapeTransfers`), lines 194-195, 200-202 (`scrapeLiquidityChanges`), and line 16 (env var)

**Description:** `parseInt()` is called on string fields from the subgraph response (`t.blockNumber`, `t.blockTimestamp`, `t.fee`, `t.lowerTick`, `t.upperTick`) without validation. If the subgraph returns malformed data (empty string, non-numeric, or very large values), `parseInt` will return `NaN` or potentially lose precision for values exceeding `Number.MAX_SAFE_INTEGER` (2^53 - 1).

- Line 16: `parseInt(process.env.END_SNAPSHOT)` -- if `END_SNAPSHOT` is set but non-numeric (e.g., `"abc"`), `UNTIL_SNAPSHOT` becomes `NaN`, which would propagate silently into the GraphQL query variable.

**Impact:** `NaN` values would propagate through the pipeline. For `UNTIL_SNAPSHOT`, a `NaN` query variable could cause the subgraph to return all records or no records (depending on subgraph implementation), leading to incorrect outputs.

**Recommendation:** Add explicit validation after `parseInt` calls, e.g., `assert(!isNaN(UNTIL_SNAPSHOT) && UNTIL_SNAPSHOT > 0)`. For block numbers, consider using `Number()` with explicit NaN checks, or `BigInt` for very large block numbers if applicable.

---

### A07-4: Hardcoded Subgraph URL Prevents Verification of Data Source [INFO]

**Location:** Lines 9-10

**Description:** The subgraph URL is hardcoded to a specific Goldsky endpoint. While this avoids injection or tampering via environment variables, it also means:
- No TLS certificate pinning or integrity check on the response.
- If the Goldsky endpoint is compromised or returns manipulated data, there is no verification mechanism.
- The subgraph version (`2025-12-30-6559`) is baked into the URL, which could become stale.

**Impact:** If the subgraph is compromised, manipulated transfer/liquidity data would flow through the entire rewards pipeline. The determinism check in CI (git-clean assertion) mitigates this for production, as any data change would be caught.

**Recommendation:** This is informational only. The CI determinism check provides a strong mitigation. Consider documenting the expected subgraph version and adding a health check or record count assertion after scraping.

---

### A07-5: No Retry Logic or Timeout on Network Requests [LOW]

**Location:** Lines 90-98 (`scrapeTransfers`), lines 175-183 (`scrapeLiquidityChanges`)

**Description:** The `graphql-request` `request()` calls have no retry logic, timeout configuration, or rate limiting. A transient network failure, subgraph outage, or slow response will cause the entire scraping process to fail with an unhandled rejection (caught only by `main().catch(console.error)` at line 244).

The sibling module `src/liquidity.ts` is documented as having "3 retries with exponential backoff," but `scraper.ts` has no such resilience.

**Impact:** A transient network issue during scraping causes a complete failure. Since the file is partially written (progress saved after each batch), a restart would overwrite partial data. This is more of a reliability concern than a direct security issue.

**Recommendation:** Add retry logic with exponential backoff to the `request()` calls, consistent with the pattern already used in `liquidity.ts`. Consider also adding a request timeout.

---

### A07-6: Relative File Paths for Output Files [LOW]

**Location:** Lines 118-121, 219-222, 229-232

**Description:** Output files are written using relative paths (`"data/transfers.dat"`, `"data/liquidity.dat"`, `"data/pools.dat"`). The actual file location depends on the current working directory at runtime. If the process is launched from an unexpected directory, data files could be written to (or overwrite files in) an unintended location.

**Impact:** Low risk in practice since the project uses npm scripts which run from the project root, and CI enforces determinism. However, this could cause confusion or data loss if run from a different directory.

**Recommendation:** Use `path.resolve(__dirname, ...)` or similar to construct absolute paths relative to the source file or project root.

---

### A07-7: Use of `any` Type Bypasses TypeScript Safety [INFO]

**Location:** Line 186 (`scrapeLiquidityChanges`)

**Description:** The intermediate variable `base` is typed as `any` (line 186), then conditionally extended with V3-specific fields (lines 198-205), and finally cast to `LiquidityChange` (line 207). This bypasses TypeScript's type checking for the mapping logic.

If the subgraph response is missing a field or has an unexpected shape, the `any` type will silently allow it through, potentially producing malformed `LiquidityChange` objects that cause downstream errors.

**Impact:** No direct security impact. A correctness/maintainability concern. Malformed data from the subgraph would not be caught at the mapping stage.

**Recommendation:** Use a discriminated union builder pattern or explicit type narrowing to avoid the `any` cast. For example, construct `LiquidityChangeV2` and `LiquidityChangeV3` objects separately in an if/else branch.

---

### A07-8: No GraphQL Injection Risk (Confirmed Safe) [INFO]

**Location:** Lines 64-88, 141-173

**Description:** Both GraphQL queries use parameterized variables (`$skip`, `$first`, `$untilSnapshot`) passed through the `variables` argument of `graphql-request`'s `request()` function. The `gql` tag parses the query at build time. No user-controlled strings are interpolated into the query template.

The only inputs flowing into variables are:
- `skip`: internally incremented integer
- `BATCH_SIZE`: hardcoded constant (1000)
- `UNTIL_SNAPSHOT`: derived from `parseInt(process.env.END_SNAPSHOT) + 1`

**Impact:** No GraphQL injection risk. The parameterized query pattern is the correct approach.

---

## Summary

| ID | Severity | Title |
|----|----------|-------|
| A07-1 | MEDIUM | Unbounded memory growth from in-memory accumulation |
| A07-2 | HIGH | Subgraph `skip` pagination limit (5000) may cause silent data truncation |
| A07-3 | LOW | `parseInt` without validation on subgraph response fields |
| A07-4 | INFO | Hardcoded subgraph URL prevents verification of data source |
| A07-5 | LOW | No retry logic or timeout on network requests |
| A07-6 | LOW | Relative file paths for output files |
| A07-7 | INFO | Use of `any` type bypasses TypeScript safety |
| A07-8 | INFO | No GraphQL injection risk (confirmed safe) |

**Critical:** 0 | **High:** 1 | **Medium:** 1 | **Low:** 3 | **Info:** 3
