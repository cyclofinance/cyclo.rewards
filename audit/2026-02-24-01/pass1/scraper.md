# Pass 1 (Security) Audit: `src/scraper.ts`

**Auditor:** A07
**Date:** 2026-02-24
**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/scraper.ts`
**Lines:** 255

---

## 1. Evidence of Thorough Reading

### Constants

| Name | Line | Description |
|------|------|-------------|
| `SUBGRAPH_URL` | 9-10 | Hardcoded Goldsky subgraph URL |
| `BATCH_SIZE` | 11 | `1000` - page size for GraphQL pagination |
| `UNTIL_SNAPSHOT` | 16 | `parseInt(process.env.END_SNAPSHOT) + 1` |

### Interfaces / Types

| Name | Line | Description |
|------|------|-------------|
| `SubgraphTransfer` | 18-27 | Shape of a transfer record from subgraph |
| `SubgraphLiquidityChangeBase` | 29-40 | Common fields for V2/V3 liquidity changes |
| `SubgraphLiquidityChangeV2` | 42-44 | V2-specific discriminated union member |
| `SubgraphLiquidityChangeV3` | 46-53 | V3-specific fields: `tokenId`, `poolAddress`, `fee`, `lowerTick`, `upperTick` |
| `SubgraphLiquidityChange` | 55 | Exported union of V2 and V3 types |

### Functions

| Name | Line | Async | Exported | Description |
|------|------|-------|----------|-------------|
| `scrapeTransfers()` | 57-137 | Yes | No | Paginates transfers from subgraph, maps to `Transfer[]`, writes split JSONL to `data/transfers{N}.dat` |
| `scrapeLiquidityChanges()` | 139-246 | Yes | No | Paginates liquidity changes from subgraph, maps to `LiquidityChange[]`, writes JSONL to `data/liquidity.dat`, collects V3 pool addresses into `data/pools.dat` |
| `main()` | 249-252 | Yes | No | Entry point, calls `scrapeTransfers()` then `scrapeLiquidityChanges()` |

### Imports

| Module | Items | Line |
|--------|-------|------|
| `graphql-request` | `request`, `gql` | 1 |
| `fs/promises` | `writeFile` | 2 |
| `./types` | `LiquidityChange`, `LiquidityChangeType`, `Transfer` | 3 |
| `dotenv` | `config` | 4 |
| `assert` | default | 5 |

### Top-Level Side Effects

| Line | Description |
|------|-------------|
| 7 | `config()` - loads `.env` into `process.env` |
| 15-16 | Asserts `END_SNAPSHOT` exists, parses and computes `UNTIL_SNAPSHOT` |
| 254 | `main().catch(console.error)` - executes scraping on import |

---

## 2. Security Findings

### A07-1: GraphQL `skip` Pagination Hard Ceiling at 5000 (MEDIUM)

**Lines:** 58-119, 146-226

**Description:** The Graph protocol (and most subgraph implementations, including Goldsky) enforces a maximum `skip` value of 5000. When querying entities beyond the 5000th record, the subgraph will return an error or an empty result set, causing the scraper to silently stop paginating and believe it has fetched all records.

With `BATCH_SIZE = 1000` and `skip` incrementing by 1000 each iteration, after 5 batches (5000 records) the 6th batch at `skip=5000` will hit the limit. In practice, the data files show ~540,000 transfers, which means the code must be working -- likely because the Goldsky subgraph used here has a higher or no `skip` limit compared to The Graph hosted service. However, this is fragile: if the subgraph provider changes its limits, data will be silently truncated.

**Impact:** If the skip ceiling is enforced, records beyond the limit are silently dropped. The scraper would terminate early and report success, leading to incomplete reward calculations.

**Recommendation:** Replace skip-based pagination with cursor-based pagination using `id_gt` on the last-seen ID. This is the standard pattern for subgraph pagination and has no upper bound:
```graphql
transfers(first: $first, orderBy: id, orderDirection: asc, where: { id_gt: $lastId, blockNumber_lte: $untilSnapshot })
```

---

### A07-2: No Validation of Subgraph Response Data (MEDIUM)

**Lines:** 103-111, 194-218

**Description:** Data received from the subgraph is mapped directly into internal types without any validation:
- `t.blockNumber` and `t.blockTimestamp` are passed to `parseInt()` without checking for `NaN` results.
- `t.value` (a string representing a big integer) is passed through without verifying it is a valid numeric string. If the subgraph returned a malformed value, it would propagate silently through the pipeline.
- `t.from.id`, `t.to.id`, `t.owner.address` are used directly without validating they are valid Ethereum addresses.
- `t.liquidityChangeType` is cast to `LiquidityChangeType` (line 200) without verifying it is one of the expected enum values.
- The `fee`, `lowerTick`, `upperTick` fields (lines 210-212) are `parseInt()`-ed without NaN checks.

**Impact:** Corrupt or unexpected subgraph data would be serialized to `.dat` files and silently propagate to reward calculations, potentially causing incorrect distributions.

**Recommendation:** Add runtime validation for critical fields. At minimum: verify `parseInt()` results are not `NaN`, verify `value` fields match `/^\d+$/`, verify addresses match `/^0x[0-9a-fA-F]{40}$/`, and verify `liquidityChangeType` is a known enum value.

---

### A07-3: `parseInt(END_SNAPSHOT)` Returns `NaN` on Malformed Input Without Detection (LOW)

**Line:** 16

**Description:** `parseInt(process.env.END_SNAPSHOT)` will return `NaN` if `END_SNAPSHOT` is set but non-numeric (e.g., `"abc"`). The `assert` on line 15 only checks that `END_SNAPSHOT` is truthy, not that it parses to a valid number. `NaN + 1` evaluates to `NaN`, which would then be passed as the `$untilSnapshot` GraphQL variable. The subgraph may reject this, return all records, or behave unpredictably depending on how it handles `NaN`/null integer variables.

**Impact:** Misconfigured environment could lead to fetching incorrect data ranges without an explicit error message. In the worst case, all records could be returned or none.

**Recommendation:** Add a validation check after parsing:
```typescript
const UNTIL_SNAPSHOT = parseInt(process.env.END_SNAPSHOT) + 1;
assert(!isNaN(UNTIL_SNAPSHOT), "END_SNAPSHOT must be a valid integer");
```

---

### A07-4: Entire Transfer Array Held in Memory (LOW)

**Lines:** 61, 113

**Description:** `scrapeTransfers()` accumulates all transfer records into an in-memory `transfers` array (line 61), pushing each batch (line 113). With ~540,000 records, each containing multiple string fields, this consumes significant memory. The entire array is then re-serialized and rewritten to disk on every batch iteration (lines 124-129), which is O(n^2) I/O over the full scrape.

Similarly, `scrapeLiquidityChanges()` accumulates all records in memory (line 143) and rewrites the entire file every batch (lines 229-232).

**Impact:** For the current data volume this works, but it does not scale. Memory pressure could cause OOM on larger datasets or constrained environments. The repeated full-file rewrites are also wasteful.

**Recommendation:** Use an append-only file writing strategy. Write each batch as it arrives (append mode), and only hold the current batch in memory:
```typescript
await appendFile(`data/transfers.dat`, batchTransfers.map(t => JSON.stringify(t)).join("\n") + "\n");
```

---

### A07-5: File Split Logic May Lose Final Records on Non-Exact Boundaries (LOW)

**Lines:** 123-129

**Description:** The transfer file splitting logic computes `fileCount = Math.ceil(transfers.length / 270000)` and then writes slices of 270000. This is correct for splitting, but there is a subtle issue: on each batch iteration, ALL files are rewritten, including files whose content has not changed. More importantly, if this logic were ever to be called after the loop completes (e.g., for a final flush), it is only called inside the loop, so the final state of the files depends on the last loop iteration having triggered the write. Since the write happens on every iteration, the final iteration does produce the correct output -- this is not currently a bug, but the logic is fragile and easy to break if refactored.

**Impact:** Low risk currently, but the write-everything-every-iteration pattern is error-prone for maintenance.

**Recommendation:** Move the file-writing logic outside the pagination loop, executing it once after all transfers have been fetched.

---

### A07-6: `main()` Executes on Import -- No Module Isolation (LOW)

**Line:** 254

**Description:** `main().catch(console.error)` is called at module top level, meaning importing this module for testing or reuse would trigger the full scraping pipeline. There is no guard such as `if (import.meta.url === ...)` or similar.

**Impact:** This prevents unit testing of individual functions (`scrapeTransfers`, `scrapeLiquidityChanges`) in isolation without triggering the full pipeline. It also means any accidental import would initiate network requests and file writes.

**Recommendation:** Gate the execution:
```typescript
if (process.argv[1]?.includes('scraper')) {
  main().catch(console.error);
}
```
Or export functions for testability and use a separate entry point script.

---

### A07-7: GraphQL Injection is Not a Risk (INFO)

**Lines:** 66-91, 149-182

**Description:** The GraphQL queries use parameterized variables (`$skip`, `$first`, `$untilSnapshot`) passed through the `graphql-request` library's variable binding mechanism. All variable values are derived from integer constants or environment variables parsed to integers. The `gql` tagged template literal contains only static query text with no string interpolation of user input.

**Impact:** None. GraphQL injection is not possible here.

---

### A07-8: Hardcoded Subgraph URL (INFO)

**Lines:** 9-10

**Description:** The subgraph URL is hardcoded rather than configured via environment variable. This includes a project ID and subgraph version (`2026-02-13-78a0`). Changing the subgraph version requires a code change.

**Impact:** Operational inconvenience only. No security risk, and hardcoding actually prevents an attacker from redirecting queries to a malicious subgraph via environment variable manipulation.

---

### A07-9: Use of `any` Type Bypasses TypeScript Safety (INFO)

**Line:** 195

**Description:** In `scrapeLiquidityChanges()`, the `base` variable is typed as `any` (line 195) and then conditionally extended with V3 fields before being cast to `LiquidityChange` (line 217). This bypasses TypeScript's structural type checking and could allow malformed objects to pass through without compile-time detection.

**Impact:** No runtime security impact, but it weakens the type safety that would otherwise catch mapping errors at compile time.

**Recommendation:** Use a discriminated union builder pattern or conditional typing instead of `any`:
```typescript
if (t.__typename === "LiquidityV3Change") {
  return { ...baseFields, __typename: t.__typename, tokenId: t.tokenId, ... } satisfies LiquidityChangeV3;
} else {
  return { ...baseFields, __typename: t.__typename } satisfies LiquidityChangeV2;
}
```

---

### A07-10: Error Handling Swallows Failures Silently (LOW)

**Line:** 254

**Description:** `main().catch(console.error)` logs errors to stderr but exits with code 0 (success). If the scraper fails partway through (e.g., network error on batch 3 of transfers), it will:
1. Have already written partial data to `data/transfers1.dat`
2. Log the error
3. Exit successfully

A subsequent pipeline run (`npm run start`) would then use the partial/stale data files without any indication that the scrape was incomplete.

**Impact:** Partial data could silently propagate to reward calculations, leading to incorrect distributions.

**Recommendation:** Exit with a non-zero code on failure:
```typescript
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

---

## 3. Summary

| ID | Severity | Title |
|----|----------|-------|
| A07-1 | MEDIUM | GraphQL `skip` pagination hard ceiling at 5000 |
| A07-2 | MEDIUM | No validation of subgraph response data |
| A07-3 | LOW | `parseInt(END_SNAPSHOT)` NaN not detected |
| A07-4 | LOW | Entire transfer array held in memory with O(n^2) I/O |
| A07-5 | LOW | File split write-every-iteration pattern is fragile |
| A07-6 | LOW | `main()` executes on import with no module isolation |
| A07-7 | INFO | GraphQL injection is not a risk (parameterized variables) |
| A07-8 | INFO | Hardcoded subgraph URL |
| A07-9 | INFO | Use of `any` type bypasses TypeScript safety |
| A07-10 | LOW | Error handling swallows failures silently (exit code 0) |

**CRITICAL findings:** 0
**HIGH findings:** 0
**MEDIUM findings:** 2
**LOW findings:** 5
**INFO findings:** 3
