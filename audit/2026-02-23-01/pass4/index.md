# Audit Pass 4 — Code Quality — `src/index.ts`

Agent: A04
File: `/Users/thedavidmeister/Code/cyclo.rewards/src/index.ts` (237 lines)

---

### A04-1 — MEDIUM — God function: `main()` handles file I/O, parsing, processing, reporting, and CSV generation

The `main()` function (lines 13-231) is approximately 220 lines long and is responsible for:
1. Reading and parsing 4 different data files (transfers, liquidity, pools, blocklist)
2. Setting up and running the Processor through multiple phases (transfers, liquidity, LP range)
3. Computing eligible balances and logging per-token summaries
4. Constructing a complex multi-column balances CSV
5. Calculating rewards and building a rewards CSV
6. Removing zero-reward addresses (mutating the `addresses` array in-place)
7. Verifying totals

Each of these responsibilities could be extracted into helper functions (e.g., `readInputFiles()`, `processAllEvents()`, `writeBalancesCsv()`, `writeRewardsCsv()`), improving readability and testability.

---

### A04-2 — LOW — Duplicated JSONL parsing pattern

Lines 32-35 and 41-44 contain an identical `.split("\n").filter(Boolean).map(line => JSON.parse(line))` pattern for reading JSONL files. The blocklist parsing at lines 56-65 uses a similar split-filter-map pattern with a different mapper. This could be extracted into a shared `readJsonl(path)` utility function. A `readCsv` function already exists in `diffCalculator.ts`, suggesting the project is moving toward such helpers but has not yet refactored `index.ts` to use a similar pattern for JSONL.

```typescript
// Repeated at lines 32-35 and 41-44:
const data = await readFile("data/transfers.dat", "utf8");
const items = data
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line));
```

---

### A04-3 — LOW — Inconsistent import path style: `.js` extension on one import only

Line 2 uses `"./processor.js"` while lines 4-5 use `"./config"` and `"./constants"` without the `.js` extension. Every other file in the codebase uses extension-less imports. With `moduleResolution: "bundler"` in tsconfig.json, the `.js` suffix is not required. This should be made consistent.

```typescript
import { Processor } from "./processor.js";       // line 2 — has .js
import { CYTOKENS, generateSnapshotBlocks } from "./config";  // line 4 — no .js
import { REWARD_POOL, ... } from "./constants";               // line 5 — no .js
```

---

### A04-4 — LOW — Hardcoded file paths throughout

All data file paths (`"data/transfers.dat"`, `"data/liquidity.dat"`, `"data/pools.dat"`, `"data/blocklist.txt"`) and output paths (`"output/snapshots-..."`, `"output/balances-..."`, `"output/rewards-..."`) are string literals scattered across the function body. These would be better centralized as constants or derived from a configuration object, reducing the chance of path typos and making it easier to change the directory structure.

```typescript
// Examples of hardcoded paths at lines 18-19, 31, 40, 49, 55, 192-194, 215-217:
const transfersData = await readFile("data/transfers.dat", "utf8");
await writeFile("output/balances-" + START_SNAPSHOT + "-" + END_SNAPSHOT + ".csv", ...);
```

---

### A04-5 — LOW — Unsafe non-null assertion on `process.env.SEED`

Line 15 uses the non-null assertion operator `!` on `process.env.SEED`:

```typescript
const SNAPSHOTS = generateSnapshotBlocks(process.env.SEED!, START_SNAPSHOT, END_SNAPSHOT);
```

If `SEED` is not set in the environment, this will pass `undefined` to `generateSnapshotBlocks`, which will silently produce deterministic-but-wrong output (seedrandom accepts `undefined` without throwing). By contrast, `START_SNAPSHOT` and `END_SNAPSHOT` at least default to `"0"` (though `0` is also likely wrong). A runtime check or assertion that `SEED` is defined would be safer and more consistent.

---

### A04-6 — LOW — Misleading log messages reference wrong filenames

Line 196 logs `Wrote ${addresses.length} balances to output/balances.csv` but the actual file written on line 193 is `output/balances-${START_SNAPSHOT}-${END_SNAPSHOT}.csv`. Similarly, line 219 logs `Wrote ${addresses.length} rewards to output/rewards.csv` but the actual file is `output/rewards-${START_SNAPSHOT}-${END_SNAPSHOT}.csv`.

```typescript
// line 196 — says "output/balances.csv" but actual path includes block range
console.log(`Wrote ${addresses.length} balances to output/balances.csv`);
// line 219 — says "output/rewards.csv" but actual path includes block range
console.log(`Wrote ${addresses.length} rewards to output/rewards.csv`);
```

---

### A04-7 — LOW — Mutating `addresses` array in place via `splice` while iterating `totalRewardsPerAddress`

Lines 202-206 iterate `totalRewardsPerAddress` and use `splice` to remove zero-reward addresses from the `addresses` array. Using `splice` inside a `for...of` over a different collection is not directly broken, but the repeated `indexOf` lookups make this O(n^2). A simpler and more idiomatic approach would be to filter:

```typescript
// Current (lines 202-206):
for (const [address, reward] of totalRewardsPerAddress) {
  if (reward === 0n) {
    addresses.splice(addresses.indexOf(address), 1);
  }
}

// Suggested:
const nonZeroAddresses = addresses.filter(a => totalRewardsPerAddress.get(a) !== 0n);
```

---

### A04-8 — INFO — `mkdir("output")` called after writing to `output/` directory

Line 27 creates the `output/` directory, but lines 18-21 already write `output/snapshots-*.txt` before the `mkdir` call. If the `output/` directory does not exist, the `writeFile` on line 18 will fail before `mkdir` is reached.

```typescript
// line 18-21 — writes to output/ before mkdir
await writeFile(
  "output/snapshots-" + START_SNAPSHOT + "-" + END_SNAPSHOT + ".txt",
  SNAPSHOTS.join("\n")
);
// ...
// line 27 — mkdir happens after the write
await mkdir("output", { recursive: true });
```

---

### A04-9 — INFO — `parseInt` without radix and no validation on environment variables

Lines 10-11 use `parseInt` without an explicit radix parameter. While the default radix 10 is used when strings do not start with `0x`, passing the radix explicitly is a common best practice. Additionally, there is no validation that the parsed values are positive integers or that `END_SNAPSHOT > START_SNAPSHOT`.

```typescript
const START_SNAPSHOT = parseInt(process.env.START_SNAPSHOT || "0");
const END_SNAPSHOT = parseInt(process.env.END_SNAPSHOT || "0");
```

---

### A04-10 — INFO — Console logging uses Unicode checkmark/cross characters

Line 137 uses Unicode characters for verification output. While functional, this can render incorrectly in some terminal environments or log aggregators.

```typescript
`Verification: ${
  totalAverage - totalPenalties + totalBounties === totalFinal ? "\u2713" : "\u2717"
}`
```

---

## Summary

| Severity | Count |
|----------|-------|
| MEDIUM   | 1     |
| LOW      | 6     |
| INFO     | 3     |

The primary concern is the monolithic `main()` function (A04-1) which handles the entire pipeline in a single function body with no decomposition. This makes the code difficult to test in isolation and hard to follow. The remaining findings are lower severity — duplicated patterns, inconsistent style, hardcoded paths, and minor correctness issues with log messages and ordering of operations.
