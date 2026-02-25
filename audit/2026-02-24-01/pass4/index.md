# Audit Pass 4 -- Code Quality -- `src/index.ts`

Agent: A04
Date: 2026-02-24
File: `src/index.ts` (247 lines)

---

### A04-1 -- MEDIUM -- God function: `main()` spans ~230 lines handling I/O, processing, reporting, and CSV generation

The `main()` function (lines 13-241) is responsible for at least seven distinct concerns:

1. Reading and parsing four different data sources (transfers across 10 sharded files, liquidity, pools, blocklist)
2. Constructing and configuring the `Processor` instance
3. Running three processing phases (transfers, liquidity organization/processing, LP range)
4. Computing eligible balances and logging per-token summaries with verification
5. Calculating rewards and building a sorted address list
6. Constructing and writing a multi-column balances CSV
7. Filtering zero-reward addresses, writing a rewards CSV, and verifying totals

None of these phases are extracted into helper functions. This makes the function difficult to test in isolation, hard to navigate during review, and prone to introducing bugs when modifying one phase that inadvertently affects another. Extract at minimum `readInputFiles()`, `runProcessingPipeline()`, `writeBalancesCsv()`, and `writeRewardsCsv()`.

---

### A04-2 -- MEDIUM -- `any[]` type on transfers array defeats type safety for the entire processing pipeline

Line 31:

```typescript
let transfers: any[] = []
```

The `transfers` array is typed as `any[]`, meaning every element accessed throughout lines 85-91 has no type checking. The `Transfer` interface exists in `src/types.ts` and is already used in `scraper.ts`. The parsed JSONL data matches the `Transfer` shape (it was serialized from `Transfer` objects by the scraper). Using `any[]` here means a field rename or structural change in `Transfer` would not produce a compile error in `index.ts`, silently passing malformed data to `processor.processTransfer()`.

Similarly, `liquidities` (line 45) and `pools` (line 54) are implicitly `any[]` because `JSON.parse` returns `any`. These should be explicitly typed as `LiquidityChange[]` and `string[]` (or whatever the pools type is) respectively.

---

### A04-3 -- LOW -- Duplicated JSONL parsing pattern across three data sources

Lines 34-37, 45-48, and 60-68 all use the same `.split("\n").filter(Boolean).map(...)` pattern to parse line-delimited data:

```typescript
// Transfers (lines 34-37):
const transfersBatch = transfersData
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line));

// Liquidity (lines 45-48):
const liquidities = liquidityData
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line));

// Blocklist (lines 60-68) uses the same split/filter/map with a different mapper
```

A shared `readJsonl<T>(path: string): Promise<T[]>` utility would eliminate the repetition and provide a single place to add type annotations, error handling for malformed lines, or logging.

---

### A04-4 -- LOW -- Inconsistent import path style: `.js` extension on one import only

Line 2 uses `"./processor.js"` while lines 4-5 use bare specifiers without extensions:

```typescript
import { Processor } from "./processor.js";       // line 2 -- has .js
import { CYTOKENS, generateSnapshotBlocks } from "./config";  // line 4 -- no .js
import { REWARD_POOL, ... } from "./constants";               // line 5 -- no .js
```

The `tsconfig.json` uses `"moduleResolution": "bundler"`, which does not require the `.js` suffix. No other file in the codebase uses `.js` extensions on imports. This is a style inconsistency that should be normalized in one direction.

---

### A04-5 -- LOW -- Hardcoded file paths and magic numbers scattered throughout

All data file paths and output paths are string literals embedded in the function body:

- `data/transfers${i + 1}.dat` (line 33) -- the loop range `10` and base name are hardcoded
- `data/liquidity.dat` (line 44)
- `data/pools.dat` (line 53)
- `data/blocklist.txt` (line 59)
- `output/snapshots-...` (line 19)
- `output/balances-...` (line 203)
- `output/rewards-...` (line 226)

The number `10` in the transfer file loop (line 32) is a magic number that must stay in sync with the `270000` chunk size in `scraper.ts` line 123. Neither value references the other, and there is no shared constant or comment linking them. If the scraper produces fewer or more files, `index.ts` will silently read empty files (due to `.catch(() => "")` on line 33) or miss data.

---

### A04-6 -- LOW -- Misleading log messages reference wrong output filenames

Line 206 logs a filename that does not match the actual file written on line 202-204:

```typescript
// line 202-204: actual file includes block range
await writeFile(
  "output/balances-" + START_SNAPSHOT + "-" + END_SNAPSHOT + ".csv",
  balancesOutput.join("\n")
);
// line 206: log says "output/balances.csv" -- wrong
console.log(`Wrote ${addresses.length} balances to output/balances.csv`);
```

The same issue occurs on line 229, which logs `output/rewards.csv` but the actual file written on lines 225-228 is `output/rewards-${START_SNAPSHOT}-${END_SNAPSHOT}.csv`. A user investigating output issues will be misled by these logs.

---

### A04-7 -- LOW -- Mutating `addresses` array via `splice` + `indexOf` during iteration is O(n^2)

Lines 212-216 iterate `totalRewardsPerAddress` and call `addresses.splice(addresses.indexOf(address), 1)` for each zero-reward address:

```typescript
for (const [address, reward] of totalRewardsPerAddress) {
  if (reward === 0n) {
    addresses.splice(addresses.indexOf(address), 1);
  }
}
```

Each `indexOf` is O(n) and `splice` is O(n) for shifting elements, making this loop O(n^2) in the number of addresses. Additionally, if `indexOf` returns `-1` (address not found), `splice(-1, 1)` silently removes the last element of the array -- an incorrect and hard-to-diagnose mutation. A simple filter replacement would be O(n) and side-effect free:

```typescript
const nonZeroAddresses = addresses.filter(a => (totalRewardsPerAddress.get(a) ?? 0n) !== 0n);
```

---

### A04-8 -- LOW -- Unsafe non-null assertion on `process.env.SEED`

Line 15:

```typescript
const SNAPSHOTS = generateSnapshotBlocks(process.env.SEED!, START_SNAPSHOT, END_SNAPSHOT);
```

The `!` operator asserts `SEED` is defined, but there is no runtime validation. If `SEED` is not set, `undefined` is passed to `seedrandom`, which accepts it without throwing and produces a deterministic but meaningless sequence. This would silently generate incorrect snapshot blocks. By contrast, `scraper.ts` uses an `assert` for `END_SNAPSHOT`. An equivalent guard should exist for `SEED`.

---

### A04-9 -- LOW -- `mkdir("output")` is called after the first write to `output/`

Line 18-21 writes `output/snapshots-*.txt` before line 27 creates the `output/` directory:

```typescript
// line 18-21: writes to output/ directory
await writeFile(
  "output/snapshots-" + START_SNAPSHOT + "-" + END_SNAPSHOT + ".txt",
  SNAPSHOTS.join("\n")
);
// ...
// line 27: mkdir happens AFTER the write
await mkdir("output", { recursive: true });
```

If the `output/` directory does not exist, the `writeFile` on line 18 will throw before `mkdir` is reached. The `mkdir` call should be moved above the first write operation.

---

### A04-10 -- INFO -- Module-level side effects: `config()` executes on import

Line 8:

```typescript
config();
```

The `dotenv` `config()` call runs as a module-level side effect, mutating `process.env` as soon as `index.ts` is imported. Lines 10-11 then read from `process.env` at module scope. This prevents importing the module in a test harness or tool without triggering environment loading. While this is the standard `dotenv` pattern and is consistent with `scraper.ts`, it does make the module harder to use in contexts other than direct execution.

---

### A04-11 -- INFO -- `parseInt` without explicit radix parameter

Lines 10-11:

```typescript
const START_SNAPSHOT = parseInt(process.env.START_SNAPSHOT || "0");
const END_SNAPSHOT = parseInt(process.env.END_SNAPSHOT || "0");
```

`parseInt` is called without a radix. The default behavior (radix 10 for decimal strings) is correct here, but passing `10` explicitly is a common best practice that eliminates ambiguity and satisfies most lint rules. There is also no validation that the parsed values are positive integers or that `END_SNAPSHOT > START_SNAPSHOT`.

---

### A04-12 -- INFO -- Inefficient array spreading in transfer accumulation loop

Line 38:

```typescript
transfers = [...transfers, ...transfersBatch]
```

Inside a loop that runs up to 10 times, this creates a new array and copies all existing elements on each iteration. With ~500K+ transfers, this means copying the growing array repeatedly. Using `transfers.push(...transfersBatch)` or pre-allocating would be more efficient, though for 10 iterations the practical impact is limited.

---

## Summary

| ID     | Severity | Title |
|--------|----------|-------|
| A04-1  | MEDIUM   | God function: `main()` handles entire pipeline in ~230 lines |
| A04-2  | MEDIUM   | `any[]` type on transfers defeats type safety |
| A04-3  | LOW      | Duplicated JSONL parsing pattern |
| A04-4  | LOW      | Inconsistent `.js` extension on one import |
| A04-5  | LOW      | Hardcoded file paths and magic numbers with no shared constants |
| A04-6  | LOW      | Misleading log messages reference wrong filenames |
| A04-7  | LOW      | `splice` + `indexOf` mutation is O(n^2) and has a `-1` edge case |
| A04-8  | LOW      | Unsafe non-null assertion on `process.env.SEED` |
| A04-9  | LOW      | `mkdir` called after first write to `output/` |
| A04-10 | INFO     | Module-level side effects from `config()` |
| A04-11 | INFO     | `parseInt` without explicit radix |
| A04-12 | INFO     | Inefficient array spreading in accumulation loop |

The two MEDIUM findings are the monolithic `main()` function (A04-1) and the pervasive `any` typing that undermines TypeScript's value (A04-2). The LOW findings cover a mix of correctness risks (A04-6 misleading logs, A04-7 splice edge case, A04-9 ordering bug) and maintainability concerns (duplicated patterns, hardcoded paths, missing validation). The INFO items are stylistic or low-impact.
