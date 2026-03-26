# Pass 1 — Security Review: `src/scraper.ts`

**Auditor:** A08
**Date:** 2026-03-22
**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/scraper.ts` (335 lines)

---

## Evidence of Reading

### Module-Level

| Item | Line(s) | Notes |
|------|---------|-------|
| Imports | 6-12 | `graphql-request` (request, gql), `fs/promises` (writeFile), local types, constants, dotenv, assert |
| `SUBGRAPH_URL` (const) | 17-18 | Hardcoded Goldsky endpoint |
| `BATCH_SIZE` (const) | 19 | 1000 |
| `UNTIL_SNAPSHOT` (const) | 24 | `parseInt(process.env.END_SNAPSHOT) + 1` |
| `VALID_CHANGE_TYPES` (const) | 71 | `["DEPOSIT", "TRANSFER", "WITHDRAW"]` |
| `dotenv.config()` call | 14 | Loads `.env` |
| Module-level asserts | 23, 25 | END_SNAPSHOT presence and NaN check |

### Exported Interfaces/Types

| Name | Line(s) |
|------|---------|
| `SubgraphTransfer` | 28-37 |
| `SubgraphLiquidityChangeBase` | 40-51 |
| `SubgraphLiquidityChangeV2` | 54-56 |
| `SubgraphLiquidityChangeV3` | 59-66 |
| `SubgraphLiquidityChange` | 69 |

### Functions

| Name | Line(s) | Exported |
|------|---------|----------|
| `parseIntStrict(value, field)` | 74-78 | No |
| `validateNumericString(value, field)` | 82-84 | No |
| `validateIntegerString(value, field)` | 87-89 | No |
| `mapSubgraphTransfer(t)` | 96-110 | Yes |
| `mapSubgraphLiquidityChange(t)` | 117-151 | Yes |
| `scrapeTransfers()` | 158-231 | No (async) |
| `scrapeLiquidityChanges()` | 237-326 | No (async) |
| `main()` | 329-332 | No (async) |

### Entrypoint

| Item | Line |
|------|------|
| `main().catch(...)` | 334 |

---

## Findings

### 1. MEDIUM — Skip-based pagination has a hard ceiling at 5000 on Graph Protocol subgraphs

**Lines:** 159, 198-201 (scrapeTransfers); 238, 283-289 (scrapeLiquidityChanges)

Both `scrapeTransfers()` and `scrapeLiquidityChanges()` use `skip`-based pagination with `skip` incrementing indefinitely. Graph Protocol (and Goldsky, which hosts The Graph-compatible subgraphs) enforces a maximum `skip` value of **5000**. Once `skip` exceeds 5000, the subgraph returns an error or an empty result, causing the scraper to silently stop fetching, believing pagination is complete (`hasMore = batchTransfers.length === BATCH_SIZE` would be false on an empty response).

With `BATCH_SIZE = 1000`, this means at most **6000 events** (skip 0..5000) can be fetched per entity type. If there are more than 6000 transfers or liquidity changes, the scraper silently drops everything beyond that point.

**Impact:** Missing transfer events directly affects reward calculations -- accounts that transacted after the 6000th event would receive incorrect rewards. This is a data-completeness issue that undermines the entire reward distribution.

**Mitigating factors:** The data files are committed to git and verified via CI's git-clean check, so if the scraper were re-run and hit this limit, results would differ from committed data, flagging the issue. However, if the original scrape itself hit the limit, the committed data is already incomplete and CI would not catch it.

**Note:** The codebase currently has committed `.dat` files. If total event counts already exceed 6000 (which they almost certainly do, given transfer files are split at 270k lines), the scraper must be using a Goldsky endpoint that relaxes the standard 5000 skip limit, or this is a latent bug that was masked by the endpoint's behavior at time of scraping. Regardless, relying on unbounded skip is fragile -- a subgraph redeployment or provider change could silently truncate data.

**Recommended pattern:** Cursor-based pagination using `where: { id_gt: $lastId }` with `orderBy: id, orderDirection: asc` eliminates the skip ceiling entirely and is the standard approach for Graph Protocol subgraphs.

---

### 2. LOW — `parseIntStrict` uses `parseInt` without radix and accepts non-integer strings

**Lines:** 74-78

`parseInt(value)` without an explicit radix defaults to base-10 for decimal strings but will parse hex strings prefixed with `0x`. More importantly, `parseInt("123.456")` returns `123` without error, silently truncating fractional parts. While block numbers and timestamps from the subgraph are expected to be integer strings, a malformed subgraph response with a float string would be silently truncated rather than rejected.

**Impact:** Low. The subgraph returns integer strings for block numbers and timestamps. But the validator `validateNumericString` rejects floats via its `/^\d+$/` regex, meaning the only fields going through `parseIntStrict` without prior numeric-string validation are `blockNumber`, `blockTimestamp`, `fee`, `lowerTick`, and `upperTick` -- none of which go through `validateNumericString` or `validateIntegerString` first.

---

### 3. LOW — `transactionHash` is not validated

**Lines:** 108, 135

`mapSubgraphTransfer` validates `tokenAddress`, `from`, `to`, and `value`. `mapSubgraphLiquidityChange` validates addresses, change types, and numeric fields. Neither validates `transactionHash`. While `transactionHash` is not used in reward calculations (it is carried through for traceability in JSONL output), accepting arbitrary strings from the subgraph response without validation means corrupted or malformed hashes would propagate silently into the data files.

**Impact:** Low. Transaction hashes are not used in computation, only for human auditing. A malformed hash would not affect rewards but could impede post-hoc forensic investigation.

---

### 4. LOW — No validation that subgraph response contains the expected top-level key

**Lines:** 194, 282

The `request<{ transfers: SubgraphTransfer[] }>()` and `request<{ liquidityChanges: SubgraphLiquidityChange[] }>()` calls use TypeScript generics for type assertion, but these are erased at runtime. If the subgraph returns `{ "data": null }` or an unexpected shape (e.g., a partial error response where `transfers` is undefined), `response.transfers.map(...)` would throw a runtime `TypeError: Cannot read properties of undefined`.

While this would crash the scraper (which is caught by the top-level `.catch()`), the error message would be opaque ("Cannot read properties of undefined") rather than a clear indication that the subgraph returned an unexpected response shape. An explicit check like `if (!response.transfers) throw new Error(...)` would provide clearer diagnostics.

**Impact:** Low. The scraper would crash rather than silently produce bad data, but the crash message would be unhelpful for debugging.

---

### 5. INFO — Unbounded in-memory accumulation of all events

**Lines:** 162, 206 (transfers); 241, 299 (liquidityChanges)

Both scrape functions accumulate all events in an in-memory array (`transfers: Transfer[]`, `liquidityChanges: LiquidityChange[]`) and rewrite the entire output file(s) after each batch. For very large datasets (hundreds of thousands of events), this means the full dataset is held in memory throughout the run. This is currently acceptable given the dataset sizes, but would not scale.

---

### 6. INFO — GraphQL injection is not a concern

The scraper uses parameterized GraphQL variables (`$skip`, `$first`, `$untilSnapshot`) passed through `graphql-request`'s `request()` function, which correctly separates the query template from variable values. The query string itself is a static `gql` tagged template literal. No user-controlled strings are interpolated into the query. GraphQL injection is not possible here.

---

### 7. INFO — File write paths use constants, no path traversal risk

File write paths are constructed from `DATA_DIR` and constant filenames (`TRANSFERS_FILE_BASE`, `LIQUIDITY_FILE`, `POOLS_FILE`). The only dynamic component is the chunk index `i + 1`, which is derived from array length arithmetic. No user input flows into file paths.

---

### 8. INFO — Hardcoded subgraph URL

**Line:** 17-18

The subgraph URL is hardcoded as a constant. This is appropriate for a reproducible pipeline -- it ensures the same subgraph version is always queried. The URL is for a public Goldsky endpoint (no API key embedded). No issue here.
