# Audit Pass 4 -- Code Quality -- `src/scraper.ts`

Agent: A07
Date: 2026-02-24
File: `src/scraper.ts` (255 lines)

---

### A07-1 -- LOW -- Module-level side effects: `config()` and `assert` execute on import

Lines 7 and 15-16 execute immediately when the module is loaded:

```typescript
config();
// ...
assert(process.env.END_SNAPSHOT, "undefined END_SNAPSHOT env variable")
const UNTIL_SNAPSHOT = parseInt(process.env.END_SNAPSHOT) + 1;
```

`config()` mutates `process.env` and the `assert` throws if `END_SNAPSHOT` is missing. This means the module cannot be imported for type-checking, testing, or tooling purposes without the environment variable being set. While `index.ts` follows the same `config()` pattern, the unconditional `assert` at module scope in `scraper.ts` is more aggressive -- `index.ts` at least falls back to `parseInt("0")`.

Moving both `config()` and the `assert` + `UNTIL_SNAPSHOT` initialization into `main()` would make the module safe to import in any context.

---

### A07-2 -- LOW -- Structural duplication between `scrapeTransfers` and `scrapeLiquidityChanges`

Both functions implement an identical pagination pattern:

1. Initialize `skip = 0`, `hasMore = true`, `totalProcessed = 0`, accumulator array
2. Enter `while (hasMore)` loop
3. Log batch offset
4. Build a GraphQL query with `$skip`, `$first`, `$untilSnapshot`
5. Execute `request()` and map response items to domain types
6. Push into accumulator, update `totalProcessed`
7. Set `hasMore = batchResults.length === BATCH_SIZE` and `skip += batchResults.length`
8. Serialize and write the full accumulator to a `.dat` file
9. Log progress

This is approximately 70 lines of nearly identical structure in each function (lines 57-137 for transfers, 139-246 for liquidity). A generic helper would eliminate this:

```typescript
async function scrapePaginated<TRaw, TDomain>(
  queryStr: string,
  responseKey: string,
  mapper: (raw: TRaw) => TDomain,
  outputPath: string,
): Promise<TDomain[]> { ... }
```

This would also provide a single point for adding retry logic, rate limiting, or cursor-based pagination if the subgraph API changes.

---

### A07-3 -- LOW -- Unsafe `any` type in liquidity change mapping defeats type safety

Lines 195-217:

```typescript
const base: any = {
  __typename: t.__typename,
  tokenAddress: t.tokenAddress,
  // ... more fields
};
if (t.__typename === "LiquidityV3Change") {
  base.tokenId = t.tokenId;
  base.poolAddress = t.poolAddress;
  // ... more V3 fields
}
return base as LiquidityChange;
```

The `any` intermediate type followed by `as LiquidityChange` cast completely bypasses TypeScript's structural checking. If a field is misspelled, omitted, or has the wrong type, the compiler will not catch it. The `LiquidityChange` discriminated union (`LiquidityChangeV2 | LiquidityChangeV3`) is well-defined in `types.ts` and can be used directly:

```typescript
if (t.__typename === "LiquidityV3Change") {
  const result: LiquidityChangeV3 = {
    __typename: "LiquidityV3Change",
    tokenAddress: t.tokenAddress,
    // ... all V3 fields explicitly typed
  };
  return result;
} else {
  const result: LiquidityChangeV2 = {
    __typename: "LiquidityV2Change",
    tokenAddress: t.tokenAddress,
    // ... all V2 fields explicitly typed
  };
  return result;
}
```

This ensures the compiler validates every field assignment.

---

### A07-4 -- LOW -- Hardcoded magic number `270000` for file splitting with no shared constant

Lines 123 and 127:

```typescript
const fileCount = Math.ceil(transfers.length / 270000);
for (let i = 0; i < fileCount; i++) {
  await writeFile(
    `data/transfers${i + 1}.dat`,
    transfers.slice(270000 * i, 270000 * (i + 1)).map((t) => JSON.stringify(t)).join("\n")
  );
}
```

The value `270000` is a magic number that determines how many transfer records go into each shard file. In `index.ts`, the reader loop hardcodes `10` as the maximum number of shard files (line 32: `for (let i = 0; i < 10; i++)`). These two values are coupled -- if the number of transfers exceeds `270000 * 10 = 2,700,000`, the scraper will produce more files than `index.ts` reads, silently losing data. Neither file references the other's constant. Both values should be extracted to a shared configuration.

---

### A07-5 -- LOW -- Full accumulator rewritten on every batch iteration

Lines 125-129 (transfers) and 229-232 (liquidity) rewrite the entire dataset after each batch:

```typescript
// Transfers -- rewrites ALL accumulated transfers every batch
await writeFile(
  `data/transfers${i + 1}.dat`,
  transfers.slice(270000 * i, 270000 * (i + 1)).map((t) => JSON.stringify(t)).join("\n")
);
```

For transfers, the final dataset is ~500K+ records. With a batch size of 1000, this means ~500+ iterations where the entire multi-hundred-MB dataset is re-serialized and rewritten. The liquidity file similarly rewrites all accumulated records on every batch.

Using an append strategy (`appendFile` per batch) or writing only when file boundaries are crossed would dramatically reduce I/O and serialization overhead. The current approach also holds both the in-memory array and the serialized string simultaneously, doubling peak memory usage.

---

### A07-6 -- INFO -- Exported type `SubgraphLiquidityChange` is not imported elsewhere

Line 55:

```typescript
export type SubgraphLiquidityChange = SubgraphLiquidityChangeV2 | SubgraphLiquidityChangeV3
```

This type is exported but only used within `scraper.ts` itself (line 184). `SubgraphTransfer` (line 18) is correctly declared as a non-exported `interface`. The `export` on `SubgraphLiquidityChange` unnecessarily widens the module's public API surface.

---

### A07-7 -- INFO -- Inconsistent type declaration style: `interface` vs `type`

`SubgraphTransfer` (line 18) uses `interface` while `SubgraphLiquidityChangeBase` (line 29) and its variants use `type`. Both are plain object shapes. The `type` usage for the liquidity variants is motivated by the `&` intersection for the discriminated union, which is valid. However, `SubgraphLiquidityChangeBase` itself is only extended via `&` and could equally be an `interface`. This is a minor consistency point.

---

### A07-8 -- INFO -- Missing semicolons on several statements

Line 15:
```typescript
assert(process.env.END_SNAPSHOT, "undefined END_SNAPSHOT env variable")
```

Line 40:
```typescript
}
```
(closing of `SubgraphLiquidityChangeBase` type alias)

Lines 44 and 55 similarly lack trailing semicolons on type alias declarations. The rest of the file and other source files (`config.ts`, `constants.ts`, `index.ts`) consistently use semicolons. A formatter such as Prettier would normalize this.

---

### A07-9 -- INFO -- No error handling or retry logic for GraphQL `request()` calls

Both `scrapeTransfers` (line 93) and `scrapeLiquidityChanges` (line 184) call `request()` without try/catch, retry, or backoff. A transient network error, rate limit, or subgraph timeout will crash the process and lose all accumulated progress.

For contrast, `src/liquidity.ts` implements a 3-retry exponential backoff pattern for its RPC calls. The scraper makes many sequential paginated requests over potentially minutes of wall time and would benefit from similar resilience. At minimum, catching a failed batch and retrying before giving up would prevent losing an entire scrape run due to a single transient failure.

---

### A07-10 -- INFO -- Hardcoded subgraph URL includes a version-specific path segment

Lines 9-10:

```typescript
const SUBGRAPH_URL =
  "https://api.goldsky.com/api/public/project_cm4zggfv2trr301whddsl9vaj/subgraphs/cyclo-flare/2026-02-13-78a0/gn";
```

The URL contains a version identifier (`2026-02-13-78a0`) that must be manually updated when the subgraph is redeployed. This is a hardcoded value that could be extracted to an environment variable or configuration constant, making it easier to update without modifying source code.

---

### A07-11 -- INFO -- `scraper.ts` main() error handler uses `console.error` without `process.exit`

Line 254:

```typescript
main().catch(console.error);
```

In contrast, `index.ts` line 243-246 uses:

```typescript
main().catch((error) => {
  console.error("Error occurred:", error);
  process.exit(1);
});
```

The scraper will log the error but exit with code 0 (success), which could mislead CI pipelines or calling scripts into thinking the scrape succeeded when it failed.

---

## Summary

| ID     | Severity | Title |
|--------|----------|-------|
| A07-1  | LOW      | Module-level side effects: `config()` and `assert` on import |
| A07-2  | LOW      | Structural duplication between the two scrape functions |
| A07-3  | LOW      | Unsafe `any` type in liquidity mapping bypasses type safety |
| A07-4  | LOW      | Magic number `270000` for file splitting, coupled to `index.ts` hardcoded `10` |
| A07-5  | LOW      | Full accumulator rewritten on every batch iteration |
| A07-6  | INFO     | Exported type `SubgraphLiquidityChange` unused externally |
| A07-7  | INFO     | Inconsistent `interface` vs `type` declaration style |
| A07-8  | INFO     | Missing semicolons on several statements |
| A07-9  | INFO     | No error handling or retry logic for GraphQL requests |
| A07-10 | INFO     | Hardcoded subgraph URL with version-specific path |
| A07-11 | INFO     | Error handler uses `console.error` without `process.exit(1)` |

No HIGH or CRITICAL findings. The LOW findings center on type safety erosion (A07-3), structural duplication (A07-2), a fragile implicit coupling between scraper file splitting and index file reading (A07-4), and I/O inefficiency (A07-5). The INFO items are stylistic inconsistencies and missing resilience patterns that do not affect correctness but reduce maintainability and operational robustness.
