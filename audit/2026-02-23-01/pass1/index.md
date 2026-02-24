# Audit Pass 1 (Security) -- `src/index.ts`

**Auditor:** A04
**Date:** 2026-02-23
**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/index.ts` (237 lines)

---

## Evidence of Thorough Reading

**Module:** `src/index.ts` -- Entry-point / orchestrator for the rewards pipeline.

**Imports (line 1-5):**
- `readFile`, `writeFile`, `mkdir` from `fs/promises`
- `Processor` from `./processor.js`
- `config` from `dotenv`
- `CYTOKENS`, `generateSnapshotBlocks` from `./config`
- `REWARD_POOL`, `REWARDS_CSV_COLUMN_HEADER_ADDRESS`, `REWARDS_CSV_COLUMN_HEADER_REWARD` from `./constants`

**Top-level statements:**
- `config()` -- dotenv load (line 8)
- `const START_SNAPSHOT` -- `parseInt(process.env.START_SNAPSHOT || "0")` (line 10)
- `const END_SNAPSHOT` -- `parseInt(process.env.END_SNAPSHOT || "0")` (line 11)

**Functions / methods:**
| Name | Line | Description |
|------|------|-------------|
| `main` (async) | 13-231 | Full pipeline orchestrator |
| `main().catch(...)` | 233-236 | Top-level error handler |

**Types / errors / constants defined in-file:**
- `const START_SNAPSHOT` (line 10) -- parsed env var, `number`
- `const END_SNAPSHOT` (line 11) -- parsed env var, `number`
- `const SNAPSHOTS` (line 15) -- `number[]`, deterministic snapshot blocks
- `const processor` (line 70) -- `Processor` instance
- `const rewardsPerToken` (line 152) -- `Map` of per-token rewards
- `const totalRewardsPerAddress` (line 153) -- `Map<string, bigint>`
- `const addresses` (line 168) -- sorted address array
- `const totalRewards` (line 222) -- verification sum

No custom types, errors, or exported constants are defined in this file.

---

## Security Findings

### A04-1 -- MEDIUM -- No validation of `SEED` environment variable (non-null assertion on potentially undefined value)

**Location:** Line 15
```typescript
const SNAPSHOTS = generateSnapshotBlocks(process.env.SEED!, START_SNAPSHOT, END_SNAPSHOT);
```

`process.env.SEED` is accessed with the TypeScript non-null assertion operator (`!`). If `SEED` is not set in the environment or `.env` file, `undefined` is passed to `generateSnapshotBlocks()` where it becomes the seed for `seedrandom`. The `seedrandom` library accepts `undefined` and will produce output (falling back to an entropy-based seed), which silently breaks the determinism guarantee of the pipeline. There is no runtime check, assertion, or error thrown when `SEED` is missing.

**Recommendation:** Add explicit validation before use:
```typescript
const SEED = process.env.SEED;
if (!SEED) throw new Error("SEED environment variable is required");
```

---

### A04-2 -- MEDIUM -- `START_SNAPSHOT` and `END_SNAPSHOT` silently default to 0 with no validation

**Location:** Lines 10-11
```typescript
const START_SNAPSHOT = parseInt(process.env.START_SNAPSHOT || "0");
const END_SNAPSHOT = parseInt(process.env.END_SNAPSHOT || "0");
```

If these environment variables are unset, misspelled, or contain non-numeric strings, they silently default to `0` (or `NaN` from `parseInt` on garbage input, since `parseInt("abc")` returns `NaN`). This could cause the pipeline to run with wrong block ranges, producing incorrect reward distributions. A `START_SNAPSHOT` of 0 and `END_SNAPSHOT` of 0 would yield a `range` of 1 in `generateSnapshotBlocks`, and all 30 snapshots would be block 0, which is meaningless.

Additionally, `parseInt` does not reject partial matches: `parseInt("12345abc")` returns `12345`, which could mask a configuration error.

**Recommendation:** Validate that both values are positive integers and that `END_SNAPSHOT > START_SNAPSHOT`:
```typescript
const START_SNAPSHOT = Number(process.env.START_SNAPSHOT);
const END_SNAPSHOT = Number(process.env.END_SNAPSHOT);
if (!Number.isInteger(START_SNAPSHOT) || START_SNAPSHOT <= 0)
  throw new Error("START_SNAPSHOT must be a positive integer");
if (!Number.isInteger(END_SNAPSHOT) || END_SNAPSHOT <= 0)
  throw new Error("END_SNAPSHOT must be a positive integer");
if (END_SNAPSHOT <= START_SNAPSHOT)
  throw new Error("END_SNAPSHOT must be greater than START_SNAPSHOT");
```

---

### A04-3 -- MEDIUM -- Unchecked JSON.parse on every line of JSONL data files

**Location:** Lines 35, 44, 50
```typescript
.map((line) => JSON.parse(line));    // line 35 (transfers)
.map((line) => JSON.parse(line));    // line 44 (liquidity)
const pools = JSON.parse(poolsData); // line 50
```

`JSON.parse` will throw a `SyntaxError` on malformed input. While the top-level `.catch()` on line 233 will catch it, the error message will be generic and will not indicate which file or which line number caused the failure. More critically, if the `.dat` files are corrupted (e.g., truncated write, disk error, or a partial scraper run), the pipeline silently processes a partial dataset -- any lines before the bad line are parsed, but the entire `map` throws on the bad line, discarding all parsed results. This is an all-or-nothing failure with no partial-corruption detection.

**Recommendation:** Wrap parsing in a function that reports the file name and line number on failure, or validate file integrity (e.g., line count / checksum) before processing.

---

### A04-4 -- LOW -- File paths constructed from environment variable values without sanitization

**Location:** Lines 18-20, 192-194, 215-217
```typescript
"output/snapshots-" + START_SNAPSHOT + "-" + END_SNAPSHOT + ".txt"
"output/balances-" + START_SNAPSHOT + "-" + END_SNAPSHOT + ".csv"
"output/rewards-" + START_SNAPSHOT + "-" + END_SNAPSHOT + ".csv"
```

`START_SNAPSHOT` and `END_SNAPSHOT` are derived from environment variables via `parseInt`, which constrains them to numeric values (or `NaN`). Because `parseInt` strips non-numeric suffixes, path injection is not practically exploitable here -- the resulting string will be a number or `NaN`. However, if `parseInt` is ever replaced with a less restrictive parser (or if the values pass through as raw strings in a refactor), path traversal could become possible. The file paths also use relative paths, so behavior depends on the working directory.

**Recommendation:** Use `path.join()` with `path.resolve()` to construct output paths, and validate that final paths remain within the expected output directory.

---

### A04-5 -- LOW -- Race condition: output directory created after first file write attempt

**Location:** Lines 18-21 vs. line 27
```typescript
// Line 18-21: writes to output/ directory
await writeFile("output/snapshots-" + START_SNAPSHOT + "-" + END_SNAPSHOT + ".txt", ...);

// Line 27: creates output/ directory
await mkdir("output", { recursive: true });
```

The `writeFile` to `output/snapshots-*.txt` on line 18 occurs BEFORE `mkdir("output", ...)` on line 27. If the `output/` directory does not exist, the `writeFile` call will throw an `ENOENT` error. The `mkdir` should be moved before the first `writeFile`.

**Recommendation:** Move line 27 (`await mkdir(...)`) to before line 18, or at the very start of `main()`.

---

### A04-6 -- LOW -- Mutation of `addresses` array while iterating over `totalRewardsPerAddress`

**Location:** Lines 202-206
```typescript
for (const [address, reward] of totalRewardsPerAddress) {
  if (reward === 0n) {
    addresses.splice(addresses.indexOf(address), 1);
  }
}
```

Using `Array.splice` with `indexOf` inside a loop is O(n^2) and is fragile: if `indexOf` returns `-1` (address not found in the array), `splice(-1, 1)` removes the last element of the array, silently corrupting the output. While this specific scenario is unlikely given the data flow (addresses are derived from the same map), it is a dangerous pattern. Additionally, the iteration is over `totalRewardsPerAddress` which may contain addresses not present in the `addresses` array if any edge case arises.

**Recommendation:** Use `Array.filter` to create a new array:
```typescript
const nonZeroAddresses = addresses.filter(
  (addr) => (totalRewardsPerAddress.get(addr) || 0n) !== 0n
);
```

---

### A04-7 -- LOW -- Blocklist parsing does not validate address format

**Location:** Lines 56-65
```typescript
const reports = blocklistData
  .split("\n")
  .filter(Boolean)
  .map((line) => {
    const [reporter, reported] = line.split(" ");
    return {
      reporter: reporter.toLowerCase(),
      cheater: reported.toLowerCase(),
    };
  });
```

If a line in `blocklist.txt` contains only one token (no space), `reported` will be `undefined`, and `reported.toLowerCase()` will throw a `TypeError`. If a line has extra whitespace or more than two tokens, only the first two are used with no warning. There is no validation that the values are valid Ethereum addresses (0x-prefixed, 40 hex chars).

**Recommendation:** Validate each line has exactly two space-separated tokens and that both match an Ethereum address pattern.

---

### A04-8 -- INFO -- Relative file paths used throughout; behavior is working-directory-dependent

**Location:** Lines 18-20, 27, 31, 40, 49, 55, 192-194, 215-217

All file reads and writes use relative paths (`data/transfers.dat`, `output/balances-*.csv`, etc.). The program's behavior depends entirely on the current working directory at invocation time. If run from a different directory (e.g., by a CI system or an automated deployment), it will read/write incorrect locations.

**Recommendation:** Resolve paths relative to `__dirname` or a configurable base directory, using `path.resolve()`.

---

### A04-9 -- INFO -- No integrity verification of input data files

**Location:** Lines 31-51

The pipeline reads `transfers.dat`, `liquidity.dat`, `pools.dat`, and `blocklist.txt` without any integrity checks (checksums, expected record counts, schema validation). In a financial rewards distribution context, corrupted or tampered input data would produce incorrect reward calculations with no detection.

**Recommendation:** Consider adding checksum verification or at minimum schema validation on parsed records. The CI determinism check (git-clean assertion) partially mitigates this for committed data files, but does not protect against in-flight corruption or tampered local files.

---

### A04-10 -- INFO -- Console logging includes verification result but does not fail on mismatch

**Location:** Lines 136-139
```typescript
console.log(
  `Verification: ${
    totalAverage - totalPenalties + totalBounties === totalFinal ? "Y" : "X"
  }`
);
```

The balance verification check (average - penalties + bounties === final) is logged but does not throw or return a non-zero exit code on failure. A mismatch would indicate a serious accounting bug but would be silently continued past.

**Recommendation:** Throw an error or `process.exit(1)` if the verification fails.

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH | 0 |
| MEDIUM | 3 |
| LOW | 4 |
| INFO | 3 |
| **Total** | **10** |

The file is a straightforward pipeline orchestrator. The most significant concerns are around missing environment variable validation (A04-1, A04-2), which could silently produce incorrect reward distributions, and the `mkdir`-after-`writeFile` ordering bug (A04-5). The `splice(-1, 1)` pattern in A04-6 is a latent correctness risk. No critical or high-severity vulnerabilities were identified.
