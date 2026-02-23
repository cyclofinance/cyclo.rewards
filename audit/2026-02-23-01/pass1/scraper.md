# Pass 1 — Security Audit: `src/scraper.ts`

**Auditor:** A07
**Date:** 2026-02-23
**File:** `src/scraper.ts` (245 lines)

---

## Evidence of Thorough Reading

### Module Identity

`src/scraper.ts` — Scrapes transfer and liquidity-change events from a Goldsky-hosted GraphQL subgraph and writes JSONL output to `data/transfers.dat`, `data/liquidity.dat`, and `data/pools.dat`.

### Imports (lines 1-5)

| Import | Source |
|--------|--------|
| `request`, `gql` | `graphql-request` |
| `writeFile` | `fs/promises` |
| `LiquidityChange`, `LiquidityChangeType`, `Transfer` | `./types` |
| `config` | `dotenv` |
| `assert` | `assert` |

### Constants Defined

| Name | Line | Value / Description |
|------|------|---------------------|
| `SUBGRAPH_URL` | 9-10 | Hardcoded Goldsky endpoint URL |
| `BATCH_SIZE` | 11 | `1000` |
| `UNTIL_SNAPSHOT` | 16 | `parseInt(process.env.END_SNAPSHOT) + 1` |

### Types / Interfaces Defined

| Name | Line(s) | Kind |
|------|---------|------|
| `SubgraphTransfer` | 18-26 | `interface` |
| `SubgraphLiquidityChangeBase` | 28-38 | `type` |
| `SubgraphLiquidityChangeV2` | 40-42 | `type` (intersection) |
| `SubgraphLiquidityChangeV3` | 44-51 | `type` (intersection) |
| `SubgraphLiquidityChange` | 53 | `type` (exported union) |

### Functions

| Name | Line | Exported | Async |
|------|------|----------|-------|
| `scrapeTransfers` | 55 | No | Yes |
| `scrapeLiquidityChanges` | 131 | No | Yes |
| `main` | 239 | No | Yes |

### Top-Level Side Effects

| Line | Effect |
|------|--------|
| 7 | `config()` — loads `.env` |
| 15 | `assert(process.env.END_SNAPSHOT, ...)` — fails if env var missing |
| 16 | `UNTIL_SNAPSHOT` computed from env |
| 244 | `main().catch(console.error)` — entry point |

---

## Security Findings

### A07-1 — GraphQL `skip` Pagination Ceiling (CRITICAL)

**Lines:** 56, 67, 94-95 (transfers); 132, 146, 179-180 (liquidity)

**Description:**
The Graph protocol (and most subgraph implementations including Goldsky) enforces a hard limit of `skip <= 5000` (some implementations cap at 5000, others at 6000). Once `skip` exceeds that ceiling the subgraph returns an error or silently returns zero results. The pagination loop increments `skip` unboundedly (`skip += batchTransfers.length` on line 115, and `skip += batchLiquidityChanges.length` on line 216). With `BATCH_SIZE = 1000`, any entity set larger than ~5000-6000 records will either:

1. Cause the subgraph to return an error that terminates the loop with incomplete data, or
2. Cause the subgraph to silently return an empty set, making `hasMore = false` and terminating the loop prematurely.

In either case the `.dat` file is written with truncated data, and because the file is overwritten on every batch (lines 118-121, 219-222), the truncated data becomes the canonical dataset. This is a **data integrity issue with direct financial impact** — missing transfers mean incorrect reward calculations.

**Recommendation:**
Replace `skip`-based pagination with cursor-based pagination using `id_gt` (the standard The Graph pattern for paginating beyond the 5000 skip limit). For example, track `lastId` and use `where: { blockNumber_lte: $untilSnapshot, id_gt: $lastId }` with `orderBy: id, orderDirection: asc`.

---

### A07-2 — Unbounded In-Memory Accumulation (MEDIUM)

**Lines:** 59, 109 (transfers array); 135, 210 (liquidityChanges array)

**Description:**
Both `scrapeTransfers` and `scrapeLiquidityChanges` accumulate all records in an in-memory array (`transfers` and `liquidityChanges` respectively) and re-serialize the entire array to disk on every batch iteration. For datasets with hundreds of thousands of records:

1. Memory consumption grows linearly with no upper bound, risking OOM on constrained environments.
2. The full-array `JSON.stringify` + `join("\n")` on every batch is O(n^2) in aggregate I/O cost.

**Recommendation:**
Use append-mode file writing (or a streaming writer). Write only the new batch to the file in each iteration instead of rewriting the entire dataset. Alternatively, write once at the end if the dataset is known to be bounded.

---

### A07-3 — Relative File Paths for Output (MEDIUM)

**Lines:** 118-121, 219-222, 229-232

**Description:**
File writes use relative paths (`"data/transfers.dat"`, `"data/liquidity.dat"`, `"data/pools.dat"`). The actual file written depends on the process's current working directory at runtime. If the script is invoked from a different directory (e.g., via a cron job, CI runner with a different `cwd`, or a symlink), data files could be written to an unintended location, potentially overwriting unrelated files or writing to a world-writable directory.

**Recommendation:**
Resolve paths relative to the project root using `path.resolve(__dirname, '..', 'data', 'transfers.dat')` or equivalent, or validate the working directory at startup.

---

### A07-4 — No Validation of `END_SNAPSHOT` Numeric Value (MEDIUM)

**Lines:** 15-16

**Description:**
While the code asserts that `process.env.END_SNAPSHOT` is truthy, it does not validate that the value is a valid positive integer. `parseInt("")` returns `NaN`, and `parseInt("abc")` also returns `NaN`. `NaN + 1` is `NaN`, which when passed as a GraphQL `Int!` variable will either cause a runtime error or be serialized in an unexpected way. More subtly, `parseInt("12.5")` returns `12` (silent truncation), and `parseInt("-1")` returns `-1`, which is semantically invalid as a block number.

Additionally, `parseInt` without a radix parameter can produce surprising results with certain string prefixes (e.g., `"0x1A"` parses as 26 in hex under some legacy behaviors, though modern engines default to base-10).

**Recommendation:**
Add explicit validation: check that the parsed value is a finite positive integer, e.g.:
```ts
const endSnapshot = Number(process.env.END_SNAPSHOT);
assert(Number.isInteger(endSnapshot) && endSnapshot > 0, "END_SNAPSHOT must be a positive integer");
const UNTIL_SNAPSHOT = endSnapshot + 1;
```

---

### A07-5 — Error Handling: `main().catch(console.error)` Exits Silently with Code 0 (MEDIUM)

**Line:** 244

**Description:**
The top-level error handler `main().catch(console.error)` logs the error to stderr but does not set a non-zero exit code. This means:

1. CI pipelines that rely on the exit code to detect failure will treat a crashed scrape as successful.
2. Partial data files written before the crash will persist, and downstream pipeline steps may consume incomplete data as if it were complete.

**Recommendation:**
Replace with:
```ts
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

---

### A07-6 — No Integrity Check on Subgraph Response Shape (LOW)

**Lines:** 90-98, 175-183

**Description:**
The code assumes the subgraph response always contains a `transfers` or `liquidityChanges` array. If the subgraph returns an unexpected shape (e.g., `{ errors: [...] }`, or a renamed field due to schema migration), `response.transfers` or `response.liquidityChanges` would be `undefined`, and calling `.map()` on `undefined` would throw a runtime `TypeError` with a non-descriptive message.

**Recommendation:**
Add a guard after each response:
```ts
assert(Array.isArray(response.transfers), "Unexpected subgraph response: transfers field missing or not an array");
```

---

### A07-7 — Hardcoded Subgraph URL (LOW)

**Lines:** 9-10

**Description:**
The subgraph URL is hardcoded with a specific deployment version (`2025-12-30-6559`). This means:

1. If the subgraph endpoint is deprecated or rotated, the scraper silently fails or returns stale data.
2. The URL cannot be overridden for testing or pointing to a different deployment without code changes.

This is not a direct vulnerability, but it reduces operational flexibility and could lead to stale data being used if the endpoint becomes outdated.

**Recommendation:**
Make the URL configurable via an environment variable with the hardcoded value as a fallback default.

---

### A07-8 — No Rate Limiting or Backoff on Subgraph Requests (LOW)

**Lines:** 90-98, 175-183

**Description:**
The scraper loops through batches making sequential HTTP requests with no delay, retry logic, or exponential backoff. If the Goldsky API applies rate limiting (HTTP 429), the request will fail and propagate up through the `.catch(console.error)` handler, resulting in partial data. Unlike `src/liquidity.ts` (which per the CLAUDE.md uses 3 retries with exponential backoff), the scraper has no resilience to transient failures.

**Recommendation:**
Add retry logic with exponential backoff, consistent with the pattern already used in `src/liquidity.ts`.

---

### A07-9 — `any` Type Assertion Bypasses Type Safety (INFO)

**Line:** 186

**Description:**
In `scrapeLiquidityChanges`, the intermediate object is typed as `any` (`const base: any = { ... }`) and later cast to `LiquidityChange` via `return base as LiquidityChange`. This bypasses TypeScript's type checker entirely — if a required field is omitted or mistyped, it will not be caught at compile time. This is a code quality issue rather than a runtime security vulnerability, but it reduces the effectiveness of the type system as a safety net.

**Recommendation:**
Use a discriminated union builder pattern or type the intermediate object properly to retain compile-time checking.

---

## Summary

| ID | Severity | Title |
|----|----------|-------|
| A07-1 | CRITICAL | GraphQL `skip` pagination ceiling causes silent data truncation |
| A07-2 | MEDIUM | Unbounded in-memory accumulation / O(n^2) I/O |
| A07-3 | MEDIUM | Relative file paths for output |
| A07-4 | MEDIUM | No validation of `END_SNAPSHOT` numeric value |
| A07-5 | MEDIUM | Silent exit code 0 on fatal error |
| A07-6 | LOW | No integrity check on subgraph response shape |
| A07-7 | LOW | Hardcoded subgraph URL |
| A07-8 | LOW | No rate limiting or backoff on subgraph requests |
| A07-9 | INFO | `any` type assertion bypasses type safety |

**Critical findings: 1** | **High: 0** | **Medium: 4** | **Low: 3** | **Info: 1**
