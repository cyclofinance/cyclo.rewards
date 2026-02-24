# Audit A07 -- Pass 4 (Code Quality) -- `src/scraper.ts`

Auditor: A07
Date: 2026-02-23
File: `src/scraper.ts` (245 lines)

---

### A07-1 — LOW — Side effect on import: `config()` and `assert` execute at module load time

Lines 7 and 15-16 execute side effects as soon as the module is imported:

```ts
config();
// ...
assert(process.env.END_SNAPSHOT, "undefined END_SNAPSHOT env variable")
const UNTIL_SNAPSHOT = parseInt(process.env.END_SNAPSHOT) + 1;
```

`config()` mutates `process.env` and the `assert` will throw immediately on import if `END_SNAPSHOT` is not set. This means the module cannot be imported for testing, type-checking, or any purpose without the environment variable being present. Moving these into `main()` (or a lazy initializer) would make the module safer to import.

Note: `src/index.ts` follows the same pattern with `config()` at top level (line 8), so this is at least consistent across the codebase, but the unconditional `assert` at module scope in `scraper.ts` is more aggressive than `index.ts` which falls back to `parseInt("0")`.

---

### A07-2 — LOW — Structural duplication between `scrapeTransfers` and `scrapeLiquidityChanges`

Both functions follow an identical pagination pattern:

1. Initialize `skip`, `hasMore`, `totalProcessed`, accumulator array
2. Enter `while (hasMore)` loop
3. Log batch start
4. Build and execute a GraphQL query with `skip`, `first`, `untilSnapshot`
5. Map response to domain types
6. Push into accumulator
7. Log batch size
8. Update `totalProcessed`, `hasMore`, `skip`
9. Write accumulator to a `.dat` file as JSONL
10. Log total processed

This is approximately 30 lines of boilerplate duplicated verbatim. A generic `scrapePages<TRaw, TDomain>(...)` helper accepting the query, response key, and mapping function would eliminate the duplication and reduce maintenance burden if pagination logic ever needs to change (e.g., adding retry logic, rate limiting, or cursor-based pagination).

---

### A07-3 — LOW — Unsafe use of `any` type defeats TypeScript safety in liquidity mapping

Line 186:

```ts
const base: any = {
```

The `base` object is typed as `any` and then conditionally extended with V3 fields before being cast to `LiquidityChange` on line 207:

```ts
return base as LiquidityChange;
```

This `any` -> `as` pattern bypasses TypeScript's structural type checking entirely. If a field name is misspelled or a required field is omitted, the compiler will not catch it. A safer approach would be to construct V2 and V3 objects separately in each branch, each with an explicit type annotation, or to use a discriminated union builder pattern.

---

### A07-4 — INFO — Exported type `SubgraphLiquidityChange` is not imported anywhere

Line 53:

```ts
export type SubgraphLiquidityChange = SubgraphLiquidityChangeV2 | SubgraphLiquidityChangeV3
```

This type is exported but is not imported by any other module in the codebase. The only usage is internal to `scraper.ts` (line 175). Meanwhile, `SubgraphTransfer` (line 18) is correctly declared as a non-exported `interface`. The `export` on `SubgraphLiquidityChange` appears unnecessary and widens the module's public API for no reason.

---

### A07-5 — INFO — Inconsistent type declaration style: `interface` vs `type`

`SubgraphTransfer` (line 18) is declared with `interface`:

```ts
interface SubgraphTransfer {
```

`SubgraphLiquidityChangeBase` (line 28) and its variants are declared with `type`:

```ts
type SubgraphLiquidityChangeBase = {
```

Both are plain object shapes. Using `interface` for one and `type` for the other is a minor style inconsistency. The `type` usage for the liquidity types is motivated by the intersection (`&`) for discriminated union variants, which is a valid reason, but `SubgraphLiquidityChangeBase` itself could be an `interface` since it is only extended and never intersected directly. This is a minor point and arguably a matter of taste.

---

### A07-6 — INFO — Missing semicolons on some statements

Line 15 is missing a trailing semicolon:

```ts
assert(process.env.END_SNAPSHOT, "undefined END_SNAPSHOT env variable")
```

Line 38 is missing a trailing semicolon after the closing brace of `SubgraphLiquidityChangeBase`:

```ts
type SubgraphLiquidityChangeBase = {
  // ...
}
```

Lines 42 and 53 similarly lack semicolons. The rest of the file (and other source files like `config.ts`, `constants.ts`, `index.ts`) consistently uses semicolons. A linter/formatter (e.g., Prettier) would normalize this automatically.

---

### A07-7 — INFO — No error handling or retry logic for GraphQL requests

Both `scrapeTransfers` and `scrapeLiquidityChanges` call `request()` without any try/catch, retry, or backoff logic. A transient network failure or rate limit from the Goldsky subgraph will crash the entire scrape and lose all progress (the accumulator array is only in memory).

For comparison, `src/liquidity.ts` implements a 3-retry exponential backoff pattern for its RPC calls. The scraper would benefit from similar resilience, especially since it makes many sequential paginated requests.

---

### A07-8 — INFO — Accumulator grows unbounded in memory before each write

Both functions accumulate all results in an in-memory array (`transfers`, `liquidityChanges`) and rewrite the entire file after every batch:

```ts
transfers.push(...batchTransfers);
// ...
await writeFile(
  "data/transfers.dat",
  transfers.map((t) => JSON.stringify(t)).join("\n")
);
```

For large datasets, this means both the array and the serialized string are held in memory. An append-based write strategy (using `appendFile` for each batch) would reduce peak memory usage and also avoid re-serializing the entire dataset on every iteration.

---

## Summary

| ID    | Severity | Title |
|-------|----------|-------|
| A07-1 | LOW      | Side effect on import: `config()` and `assert` at module scope |
| A07-2 | LOW      | Structural duplication between the two scrape functions |
| A07-3 | LOW      | Unsafe `any` type in liquidity mapping defeats type safety |
| A07-4 | INFO     | Exported type `SubgraphLiquidityChange` unused externally |
| A07-5 | INFO     | Inconsistent `interface` vs `type` declaration style |
| A07-6 | INFO     | Missing semicolons on some statements |
| A07-7 | INFO     | No error handling or retry logic for GraphQL requests |
| A07-8 | INFO     | Accumulator grows unbounded in memory before each write |

No HIGH or CRITICAL findings. No commented-out code was found. No unused imports were found (all four imports on lines 1-5 are used within the file).
