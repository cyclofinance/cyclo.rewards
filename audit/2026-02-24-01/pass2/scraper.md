# Pass 2 — Test Coverage: `scraper.ts`

**Auditor:** A07
**Date:** 2026-02-24
**File under review:** `/Users/thedavidmeister/Code/cyclo.rewards/src/scraper.ts`

## Summary

There is **no dedicated test file** for `scraper.ts`. A grep across all `*.test.*` and `*.spec.*` files for any reference to scraper identifiers (`scrapeTransfers`, `scrapeLiquidityChanges`, `UNTIL_SNAPSHOT`, `SubgraphTransfer`, `SubgraphLiquidityChange`, `SUBGRAPH_URL`, `BATCH_SIZE`) returned zero matches. The existing test files are:

- `src/config.test.ts`
- `src/diffCalculator.test.ts`
- `src/diffCalculatorOutput.test.ts`
- `src/liquidity.test.ts`
- `src/processor.test.ts`

None of these import from or reference `scraper.ts`.

The only automated exercise of the scraper is the CI pipeline in `.github/workflows/git-clean.yaml`, which runs `npm run start` (which invokes `npm run scrape` first, executing `tsx src/scraper.ts`). This is an integration-level reproducibility check that asserts the full pipeline produces no uncommitted changes. It does not constitute a unit or functional test of scraper logic.

---

## Findings

### A07-1: No unit tests for `scrapeTransfers()` data mapping logic

**Severity:** Medium
**Location:** `src/scraper.ts` lines 103-111

The `scrapeTransfers()` function maps `SubgraphTransfer` objects to internal `Transfer` objects. This mapping performs several transformations:

```typescript
const batchTransfers = response.transfers.map((t) => ({
  tokenAddress: t.tokenAddress,
  from: t.from.id,
  to: t.to.id,
  value: t.value,
  blockNumber: parseInt(t.blockNumber),
  timestamp: parseInt(t.blockTimestamp),
  transactionHash: t.transactionHash,
}));
```

Key concerns left untested:
- The subgraph returns `from` and `to` as nested objects (`{ id: string }`), and the scraper flattens them. If the subgraph schema changes (e.g., `from.address` instead of `from.id`), this would silently produce `undefined` values that propagate into the `.dat` files and corrupt downstream processing.
- `parseInt(t.blockNumber)` and `parseInt(t.blockTimestamp)` are called on string values. If the subgraph returns a hex string, a float, or an empty string, `parseInt` would silently produce incorrect or `NaN` results. No validation or assertion is performed on the parsed values.
- The `value` field is passed through as a raw string with no validation that it represents a valid uint256. A malformed value would only be caught much later in `processor.ts` when `BigInt()` is called on it.

### A07-2: No unit tests for `scrapeLiquidityChanges()` V2/V3 discrimination logic

**Severity:** Medium
**Location:** `src/scraper.ts` lines 194-218

The liquidity scraper performs a discriminated union mapping based on `__typename`:

```typescript
const base: any = {
  __typename: t.__typename,
  // ...common fields...
};
if (t.__typename === "LiquidityV3Change") {
  base.tokenId = t.tokenId;
  base.poolAddress = t.poolAddress;
  base.fee = parseInt(t.fee);
  base.lowerTick = parseInt(t.lowerTick);
  base.upperTick = parseInt(t.upperTick);
  v3Pools.add(t.poolAddress.toLowerCase());
}
return base as LiquidityChange;
```

Key concerns left untested:
- The use of `any` for the `base` variable defeats TypeScript's type safety. The `as LiquidityChange` cast is unchecked at runtime. If a V3 record arrives with `__typename` as a different casing or unexpected value (e.g., `"LiquidityV3change"`), it would be treated as V2 and silently lose the V3-specific fields (`tokenId`, `poolAddress`, `fee`, `lowerTick`, `upperTick`). This would result in V3 LP positions being excluded from range calculations, directly affecting reward distribution.
- `parseInt(t.fee)`, `parseInt(t.lowerTick)`, and `parseInt(t.upperTick)` have no validation. Negative ticks are valid in Uniswap V3 (ticks range from -887272 to 887272), and `parseInt` handles these correctly, but there are no tests confirming this path works end-to-end with representative V3 data.
- The `owner` field is mapped from `t.owner.address` (for liquidity changes), whereas in transfers it comes from `t.from.id` and `t.to.id`. This inconsistent subgraph schema access pattern is a risk surface that tests would help guard against.

### A07-3: No tests for pagination logic and batch boundary behavior

**Severity:** Medium
**Location:** `src/scraper.ts` lines 63-133 (transfers), lines 146-246 (liquidity)

Both scraping functions use identical pagination logic:

```typescript
hasMore = batchTransfers.length === BATCH_SIZE;
skip += batchTransfers.length;
```

This pagination has an inherent limitation of GraphQL subgraphs: the `skip` parameter typically has a hard cap (often 5000 in The Graph protocol). For datasets exceeding `skip` = 5000, the scraper would silently stop paginating or receive errors. There are no tests verifying:
- Correct pagination across multiple batches.
- Behavior when a batch returns exactly `BATCH_SIZE` items (continuation) vs. fewer (termination).
- Behavior when a batch returns zero items.
- Behavior when the subgraph returns an error or partial response.
- Whether the `skip`-based pagination can actually reach all records, or if it hits a subgraph `skip` limit. (Note: the current `BATCH_SIZE` of 1000 means the 6th page would require `skip=5000`, which is the typical hard limit.)

### A07-4: No tests for file splitting logic in `scrapeTransfers()`

**Severity:** Low-Medium
**Location:** `src/scraper.ts` lines 123-129

The transfer scraper splits output across multiple files to stay under GitHub's 100MB limit:

```typescript
const fileCount = Math.ceil(transfers.length / 270000);
for (let i = 0; i < fileCount; i++) {
  await writeFile(
    `data/transfers${i + 1}.dat`,
    transfers.slice(270000 * i, 270000 * (i + 1)).map((t) => JSON.stringify(t)).join("\n")
  );
}
```

The consumer in `index.ts` reads these files back:

```typescript
for (let i = 0; i < 10; i++) {
  const transfersData = await readFile(`data/transfers${i + 1}.dat`, "utf8").catch(() => "");
  // ...
}
```

Key concerns left untested:
- The producer uses `Math.ceil(transfers.length / 270000)` to determine file count, but the consumer hardcodes a loop up to 10 files. There is no contract test verifying that the consumer can reassemble exactly what the producer wrote.
- The file naming convention (`transfers1.dat`, `transfers2.dat`, etc.) is implicitly coupled between scraper and index. A naming mismatch would cause silent data loss.
- Each batch write overwrites all files from the beginning. If a batch fails mid-write, some files could be from the current run while others are stale from a previous run, producing a corrupted dataset. No atomicity or consistency check is tested.
- The magic number 270000 is not derived from any measurable property (like actual file size). If the average serialized transfer size increases, the 100MB limit could still be exceeded.

### A07-5: No tests for `UNTIL_SNAPSHOT` calculation and module-level side effects

**Severity:** Low-Medium
**Location:** `src/scraper.ts` lines 13-16

```typescript
assert(process.env.END_SNAPSHOT, "undefined END_SNAPSHOT env variable")
const UNTIL_SNAPSHOT = parseInt(process.env.END_SNAPSHOT) + 1;
```

Key concerns left untested:
- The `assert` and `parseInt` execute at module load time (top-level), meaning importing `scraper.ts` in a test without `END_SNAPSHOT` set would throw immediately. This makes the module difficult to test in isolation and is likely a contributing reason why no test file exists.
- `parseInt` with no radix argument defaults to base 10 but could behave unexpectedly with leading zeros or whitespace in the env var. `parseInt("052974045")` returns `52974045` in base 10, which is correct, but this is an implicit assumption.
- The `+ 1` to `END_SNAPSHOT` to create `UNTIL_SNAPSHOT` (using `blockNumber_lte` in the query) means the query fetches transfers at block `END_SNAPSHOT` and also at block `END_SNAPSHOT + 1`. The comment says "to make sure every transfer is gathered," but this actually gathers transfers one block beyond the stated end. Whether this is intentional or a fencepost error is untested and undocumented beyond the inline comment.
- If `END_SNAPSHOT` is set to a non-numeric string, `parseInt` returns `NaN`, and `NaN + 1` is `NaN`. The `assert` only checks for truthiness (non-empty string), not numeric validity. The GraphQL query would then receive `NaN` as the `untilSnapshot` variable, with undefined behavior.

### A07-6: No tests for `main()` orchestration and error handling

**Severity:** Low
**Location:** `src/scraper.ts` lines 249-254

```typescript
async function main() {
  await scrapeTransfers();
  await scrapeLiquidityChanges();
}

main().catch(console.error);
```

Key concerns left untested:
- If `scrapeTransfers()` fails, `scrapeLiquidityChanges()` is never called, but stale `.dat` files from a previous run may remain on disk. The CI pipeline (`git-clean.yaml`) would then compare against stale data without detecting the partial scrape failure, since `main().catch(console.error)` swallows the error (it logs but does not set a non-zero exit code).
- There is no cleanup of old `transfers*.dat` files before writing new ones. If a previous run produced 3 files (`transfers1.dat` through `transfers3.dat`) and the current run only produces 2, `transfers3.dat` would remain and the consumer in `index.ts` would include stale data from the previous run.
- The `pools.dat` file is only written at the end of `scrapeLiquidityChanges()` (line 239-242), outside the pagination loop. If the process crashes before reaching that point, `pools.dat` could be stale while `liquidity.dat` is partially updated, creating an inconsistent state.

### A07-7: No tests for V3 pool address collection side effect

**Severity:** Low
**Location:** `src/scraper.ts` lines 144, 214-215, 239-242

The `scrapeLiquidityChanges()` function accumulates V3 pool addresses into a `Set<string>` as a side effect of the mapping logic:

```typescript
v3Pools.add(t.poolAddress.toLowerCase());
```

This set is then written to `pools.dat` as a JSON array. There are no tests verifying:
- That `toLowerCase()` normalization is applied consistently (the rest of the mapping does not normalize addresses).
- That the JSON array format in `pools.dat` matches what the consumer expects (the consumer in `index.ts` line 54 does `JSON.parse(poolsData)` expecting an array).
- That duplicate pool addresses are correctly deduplicated by the `Set`.

---

## Structural Testability Assessment

The scraper module is currently **difficult to unit test** due to several design choices:

1. **Module-level side effects:** The `assert` and `parseInt` on `process.env.END_SNAPSHOT` execute at import time, preventing test files from importing the module without setting the env var first.
2. **Non-exported functions:** `scrapeTransfers()` and `scrapeLiquidityChanges()` are not exported, so they cannot be called individually from tests.
3. **Hard-coded dependencies:** The subgraph URL, batch size, and file paths are all hard-coded constants rather than injected parameters.
4. **Tightly coupled I/O:** GraphQL network calls and filesystem writes are interleaved within the same functions, making it impossible to test the data mapping logic without mocking both the network and filesystem layers.

To enable testing, the module would need to be refactored to separate the data transformation logic (mapping `SubgraphTransfer` to `Transfer`, mapping `SubgraphLiquidityChange` to `LiquidityChange`) from the I/O concerns (fetching from subgraph, writing to disk).

---

## Risk Summary

| ID | Finding | Severity | Risk if Untested |
|----|---------|----------|-----------------|
| A07-1 | Transfer data mapping untested | Medium | Silent data corruption from subgraph schema changes |
| A07-2 | V2/V3 discrimination untested | Medium | V3 positions misclassified, rewards miscalculated |
| A07-3 | Pagination logic untested | Medium | Incomplete data fetch beyond skip limits |
| A07-4 | File splitting logic untested | Low-Medium | Data loss or duplication across split files |
| A07-5 | UNTIL_SNAPSHOT calculation untested | Low-Medium | Off-by-one or NaN propagation into queries |
| A07-6 | main() orchestration untested | Low | Stale data from partial failures goes undetected |
| A07-7 | V3 pool collection untested | Low | Inconsistent pool list affecting range calculations |
