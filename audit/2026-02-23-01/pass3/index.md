# Audit Pass 3 — Documentation Review: `src/index.ts`

**Agent:** A04
**Date:** 2026-02-23
**Audit ID:** 2026-02-23-01
**File:** `src/index.ts` (237 lines)

---

## Inventory

### Constants (module-level)

| Name | Line | Description | Documented |
|------|------|-------------|------------|
| `START_SNAPSHOT` | 10 | Parsed from env var `START_SNAPSHOT`, defaults to `0` | No |
| `END_SNAPSHOT` | 11 | Parsed from env var `END_SNAPSHOT`, defaults to `0` | No |

### Functions (module-level)

| Name | Line | Description | Documented |
|------|------|-------------|------------|
| `main()` | 13 | Async entry point: orchestrates the full reward-calculation pipeline | No |

### Imported Symbols

| Symbol | Source | Used |
|--------|--------|------|
| `readFile` | `fs/promises` | Yes (lines 31, 40, 49, 55) |
| `writeFile` | `fs/promises` | Yes (lines 18, 192, 215) |
| `mkdir` | `fs/promises` | Yes (line 27) |
| `Processor` | `./processor.js` | Yes (line 70) |
| `config` | `dotenv` | Yes (line 8) |
| `CYTOKENS` | `./config` | Yes (lines 106, 144, 155, 177) |
| `generateSnapshotBlocks` | `./config` | Yes (line 15) |
| `REWARD_POOL` | `./constants` | Yes (lines 152, 227) |
| `REWARDS_CSV_COLUMN_HEADER_ADDRESS` | `./constants` | Yes (line 208) |
| `REWARDS_CSV_COLUMN_HEADER_REWARD` | `./constants` | Yes (line 208) |

### Types (inline / not formally declared)

No explicit type declarations in this file. One inline generic annotation exists at line 153: `Map<string, bigint>`.

---

## Findings

### A04-1 — LOW — No JSDoc or file-level documentation on `main()`

The `main()` function (line 13-231) is the sole exported behavior of the entry point. It performs approximately 10 distinct pipeline stages (snapshot generation, file I/O, transfer processing, liquidity processing, LP range processing, balance retrieval, balance logging, CSV writing for balances, CSV writing for rewards, verification). There is no JSDoc comment, no summary comment, and no `@returns` or `@throws` annotation. Given that other files in the codebase (e.g., `config.ts` line 44, `diffCalculator.ts` line 6, `liquidity.ts` line 78) use JSDoc comments on their exported functions, this is inconsistent.

**Recommendation:** Add a JSDoc block to `main()` summarizing the pipeline stages and documenting that it reads from `data/*.dat`, `data/blocklist.txt`, and writes to `output/*.csv` and `output/snapshots-*.txt`.

---

### A04-2 — LOW — No documentation on module-level constants `START_SNAPSHOT` and `END_SNAPSHOT`

Lines 10-11 define `START_SNAPSHOT` and `END_SNAPSHOT` by parsing environment variables. There is no comment explaining what these block numbers represent, their valid ranges, or the consequence of the `"0"` default value. The inline comment on line 7 (`// Load environment variables`) covers the `config()` call but not the constants themselves.

**Recommendation:** Add brief inline or JSDoc comments clarifying that these are Flare Network block numbers defining the epoch range for snapshot generation, and noting that a default of `0` would likely produce invalid results.

---

### A04-3 — INFO — Inline comments are present but inconsistent in granularity

The file uses inline comments (`// generate snapshot blocks`, `// Read transfers file`, `// Process transfers`, etc.) on most logical sections, which is good for readability. However, the following sections lack any inline comment:

- Lines 144-148 (building the token column headers for the balances CSV) — This is moderately complex string interpolation with nested `.map()` and `.join()` calls.
- Lines 168-173 (sorting addresses by total rewards descending) — The sort comparator comment says "Convert comparison to a number" but does not note that the sort is descending by reward amount.

**Recommendation:** No action strictly required, but adding a brief comment on lines 144 and 168 would improve readability of the CSV assembly logic.

---

### A04-4 — LOW — Comment on line 196 is inaccurate

Line 196 reads:
```
console.log(`Wrote ${addresses.length} balances to output/balances.csv`);
```

However, the actual file written (line 193) is `output/balances-{START_SNAPSHOT}-{END_SNAPSHOT}.csv`, not `output/balances.csv`. Similarly, line 219 logs `output/rewards.csv` but the actual file is `output/rewards-{START_SNAPSHOT}-{END_SNAPSHOT}.csv`.

**Recommendation:** Fix the log messages to reflect the actual filenames including the snapshot range suffix.

---

### A04-5 — LOW — Import path inconsistency: `./processor.js` vs `./config` and `./constants`

Line 2 imports from `"./processor.js"` (with `.js` extension), while lines 4-5 import from `"./config"` and `"./constants"` (without extension). This is not a documentation issue per se, but it creates confusion about the module resolution strategy. There is no comment explaining why the extension is included for one import but not others.

**Recommendation:** Either standardize all import paths to include or exclude the `.js` extension, or add a comment explaining the inconsistency if it is intentional (e.g., ESM resolution requirements).

---

### A04-6 — MEDIUM — No documentation on the blocklist file format

Lines 55-65 parse `data/blocklist.txt` by splitting each line on a space character into `[reporter, reported]`. This parsing logic implicitly defines a file format (space-separated, two addresses per line, reporter first, reported second). There is no comment in this file documenting the expected format, and neither the variable names in the destructured assignment (`reporter`, `reported`) nor the resulting object properties (`reporter`, `cheater`) use consistent terminology ("reported" vs "cheater").

**Recommendation:** Add a comment above line 56 documenting the expected file format: `<reporter_address> <cheater_address>`, one pair per line. The naming inconsistency between `reported` (line 60) and `cheater` (line 62) should also be addressed for clarity.

---

### A04-7 — INFO — No file-level module documentation

The file has no top-level comment or module documentation explaining its role as the CLI entry point for the rewards pipeline. Other source files in the project similarly lack file-level documentation, so this is consistent with the codebase style, but as the main entry point it would benefit most from a brief module-level comment.

**Recommendation:** Consider adding a brief file-level comment (1-2 lines) identifying this as the CLI entry point that orchestrates scraping, processing, and output generation.

---

### A04-8 — INFO — Snapshot file written before output directory is created

Line 18-21 writes `output/snapshots-*.txt`, but the `mkdir("output", { recursive: true })` call does not happen until line 27. If the `output/` directory does not already exist, the write on line 18 will throw an error. This is a logic issue rather than strictly a documentation issue, but the surrounding comments do not call attention to the ordering dependency.

**Recommendation:** Either move the `mkdir` call to before the snapshot file write, or document why the current ordering is acceptable (e.g., the directory is guaranteed to exist from a prior run).

---

### A04-9 — INFO — `processedCount` variable (line 74) is unused outside the loop

The `processedCount` variable is incremented and logged but never used after the loop completes. Same for `liquidityProcessedCount` (line 87). This is minor but the variables could be removed and replaced with an index-based approach or the loop counter itself. No documentation issue, but mentioning for completeness.

---

### A04-10 — LOW — The non-null assertion on `process.env.SEED!` (line 15) is undocumented

Line 15 uses `process.env.SEED!` with a TypeScript non-null assertion. If `SEED` is not set in the environment, this will pass `undefined` to `generateSnapshotBlocks()`, which would then use `undefined` as the seed string. There is no comment or runtime check guarding against a missing `SEED` variable, unlike `START_SNAPSHOT` and `END_SNAPSHOT` which at least have fallback defaults.

**Recommendation:** Add either a runtime assertion (e.g., `assert(process.env.SEED, "SEED environment variable is required")`) or a comment documenting that `SEED` must be set.

---

## Summary

| Severity | Count |
|----------|-------|
| MEDIUM | 1 |
| LOW | 5 |
| INFO | 4 |
| **Total** | **10** |

The file is a procedural entry point with no exported API surface. Inline comments cover most logical sections adequately. The primary gaps are: (1) no JSDoc on `main()`, (2) inaccurate log messages referencing wrong filenames, (3) undocumented blocklist file format, and (4) an undocumented non-null assertion on a required environment variable. The ordering issue where the snapshots file is written before `mkdir` is called (A04-8) straddles documentation and correctness concerns.
