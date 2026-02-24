# Pass 1 -- Security Audit: `src/index.ts`

**Auditor:** A04
**Date:** 2026-02-24
**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/index.ts` (247 lines)
**Module:** Main pipeline entry point (no named module export; executes `main()` at top level)

---

## 1. Evidence of Thorough Reading

### Imports (lines 1-5)

| Import | Source | Line |
|--------|--------|------|
| `readFile`, `writeFile`, `mkdir` | `fs/promises` | 1 |
| `Processor` | `./processor.js` | 2 |
| `config` | `dotenv` | 3 |
| `CYTOKENS`, `generateSnapshotBlocks` | `./config` | 4 |
| `REWARD_POOL`, `REWARDS_CSV_COLUMN_HEADER_ADDRESS`, `REWARDS_CSV_COLUMN_HEADER_REWARD` | `./constants` | 5 |

### Functions

| Function | Line | Description |
|----------|------|-------------|
| `main` (async) | 13 | Full pipeline: reads env vars, reads data files, processes transfers/liquidity, calculates rewards, writes CSV outputs |
| *(top-level call)* | 243 | `main().catch(...)` -- invokes the pipeline and exits on error |

### Key Variables (module scope)

| Variable | Line | Description |
|----------|------|-------------|
| `START_SNAPSHOT` | 10 | Parsed from `process.env.START_SNAPSHOT`, defaults to `"0"` |
| `END_SNAPSHOT` | 11 | Parsed from `process.env.END_SNAPSHOT`, defaults to `"0"` |

---

## 2. Security Findings

### A04-1: Non-null assertion on `process.env.SEED` -- no validation (HIGH)

**Location:** Line 15
```typescript
const SNAPSHOTS = generateSnapshotBlocks(process.env.SEED!, START_SNAPSHOT, END_SNAPSHOT);
```

**Issue:** `process.env.SEED` is accessed with the TypeScript non-null assertion operator (`!`). If the `SEED` environment variable is not set, `process.env.SEED` is `undefined`. The `!` operator only suppresses the TypeScript compiler warning; at runtime, `undefined` is passed to `generateSnapshotBlocks(seed: string, ...)`. The `seedrandom` library accepts `undefined` and silently falls back to a time-based random seed. This means:

1. The pipeline will not crash, it will silently produce non-deterministic output.
2. The entire determinism guarantee of the system (which CI enforces) is silently broken if the env var is missing.
3. Different runs without `SEED` produce different snapshot blocks, leading to different reward distributions.

**Recommendation:** Add an explicit check that `SEED` is a non-empty string before use. Fail fast with a clear error message:
```typescript
const SEED = process.env.SEED;
if (!SEED) throw new Error("SEED environment variable is required");
```

---

### A04-2: `START_SNAPSHOT` and `END_SNAPSHOT` default to 0 silently (MEDIUM)

**Location:** Lines 10-11
```typescript
const START_SNAPSHOT = parseInt(process.env.START_SNAPSHOT || "0");
const END_SNAPSHOT = parseInt(process.env.END_SNAPSHOT || "0");
```

**Issue:** If `START_SNAPSHOT` or `END_SNAPSHOT` are not set, they default to `0`. There is no validation that these are positive, sensible block numbers, or that `END_SNAPSHOT > START_SNAPSHOT`. Consequences:

- With both at 0, `generateSnapshotBlocks` computes `range = 0 - 0 + 1 = 1`, so all 30 snapshots resolve to block 0. The processor would run on block 0 data, producing meaningless results.
- If `END_SNAPSHOT < START_SNAPSHOT`, `range` becomes negative. `Math.floor(rng() * negativeRange) + start` produces blocks before the start, which is logically invalid.
- `parseInt` with no radix is acceptable in modern engines (defaults to base 10), but non-numeric strings like `"abc"` produce `NaN`, which would propagate silently through arithmetic.

**Recommendation:** Validate both values are positive integers and that `END_SNAPSHOT > START_SNAPSHOT`. Fail fast if not:
```typescript
if (isNaN(START_SNAPSHOT) || isNaN(END_SNAPSHOT))
  throw new Error("START_SNAPSHOT and END_SNAPSHOT must be valid integers");
if (END_SNAPSHOT <= START_SNAPSHOT)
  throw new Error("END_SNAPSHOT must be greater than START_SNAPSHOT");
```

---

### A04-3: Uncaught JSON parse errors in transfer/liquidity/pool file reading (MEDIUM)

**Location:** Lines 34-37, 45-48, 53-54

```typescript
// Transfers (line 37)
.map((line) => JSON.parse(line));

// Liquidity (line 48)
.map((line) => JSON.parse(line));

// Pools (line 54)
const pools = JSON.parse(poolsData);
```

**Issue:** `JSON.parse` throws a `SyntaxError` on malformed input. While the top-level `main().catch()` at line 243 will catch the error and exit with code 1, the error message from a raw `JSON.parse` failure is opaque (e.g., `"Unexpected token x in JSON at position 0"`). There is no indication of which file or which line number within the file caused the failure.

For transfers specifically, the `.catch(() => "")` on line 33 swallows file-not-found errors for individual batch files, and an empty string after `.split("\n").filter(Boolean)` yields an empty array, so this is safe. However, a partially corrupted file (valid file read, invalid JSON on one line) produces an unhelpful error.

**Recommendation:** Wrap JSON parsing in a try-catch that includes the source file name and line index in the error message, or use a helper function that annotates parse failures.

---

### A04-4: Relative file paths for all I/O operations (LOW)

**Location:** Lines 18-19, 27, 33, 44, 53, 59, 202-203, 225-226

```typescript
await writeFile("output/snapshots-" + START_SNAPSHOT + "-" + END_SNAPSHOT + ".txt", ...);
await mkdir("output", { recursive: true });
await readFile(`data/transfers${i + 1}.dat`, "utf8");
await readFile("data/liquidity.dat", "utf8");
await readFile("data/pools.dat", "utf8");
await readFile("data/blocklist.txt", "utf8");
await writeFile("output/balances-" + START_SNAPSHOT + "-" + END_SNAPSHOT + ".csv", ...);
await writeFile("output/rewards-" + START_SNAPSHOT + "-" + END_SNAPSHOT + ".csv", ...);
```

**Issue:** All file paths are relative to the current working directory (`cwd`). If the script is invoked from a different directory than the project root, it will read/write files in unexpected locations. This is not a direct vulnerability in the context of this project (CI and npm scripts set `cwd` correctly), but it reduces robustness.

**Recommendation:** Consider using `path.resolve(__dirname, ...)` or the `import.meta.url` equivalent for ES modules to anchor paths to the project root, or at minimum document the `cwd` requirement.

---

### A04-5: Write-before-mkdir race condition (LOW)

**Location:** Lines 18-21 vs. line 27

```typescript
// Line 18-21: write to output/ BEFORE mkdir
await writeFile("output/snapshots-" + START_SNAPSHOT + "-" + END_SNAPSHOT + ".txt", SNAPSHOTS.join("\n"));

// Line 27: mkdir happens AFTER the first write
await mkdir("output", { recursive: true });
```

**Issue:** The snapshots file is written to `output/` on line 18, but `mkdir("output", ...)` does not happen until line 27. If the `output/` directory does not exist, the `writeFile` on line 18 will throw `ENOENT`. The `mkdir` call should be moved before the first write.

**Recommendation:** Move the `mkdir("output", { recursive: true })` call to before line 18.

---

### A04-6: `transfers` typed as `any[]` -- no schema validation (MEDIUM)

**Location:** Line 31

```typescript
let transfers: any[] = []
```

**Issue:** Transfer data parsed from JSON is typed as `any[]` with no runtime validation against the `Transfer` or `TransferRecord` interface. Malformed or adversarially crafted data files could introduce unexpected values (e.g., non-numeric `blockNumber`, missing `from`/`to` fields) that propagate silently through the processor. The same applies to `liquidities` (line 48) and `pools` (line 54), which also lack runtime type validation.

In a reward distribution system, corrupted input data could lead to incorrect reward calculations. Since the data files are committed to the repo and CI enforces determinism, this is mitigated in practice, but the code has no defense-in-depth against data corruption.

**Recommendation:** Add runtime schema validation (e.g., using `zod` or manual checks) for parsed data, or at minimum type the parsed data as the expected interface and validate required fields.

---

### A04-7: Mutating `addresses` array while iterating by index with `splice` (LOW)

**Location:** Lines 212-216

```typescript
for (const [address, reward] of totalRewardsPerAddress) {
  if (reward === 0n) {
    addresses.splice(addresses.indexOf(address), 1);
  }
}
```

**Issue:** This code iterates over `totalRewardsPerAddress` (a Map) and calls `splice` on the `addresses` array. While this does not mutate the Map being iterated, `indexOf` has O(n) complexity per call, making the overall operation O(n^2) for large address sets. More importantly, if an address is in `totalRewardsPerAddress` but not in `addresses` (which should not happen given the construction, but is not enforced), `indexOf` returns `-1`, and `splice(-1, 1)` removes the last element of the array -- a silent data corruption bug.

**Recommendation:** Use `filter` to create a new array instead:
```typescript
const filteredAddresses = addresses.filter(
  (addr) => (totalRewardsPerAddress.get(addr) ?? 0n) !== 0n
);
```

---

### A04-8: Non-null assertions on Map lookups in sort comparator (INFO)

**Location:** Lines 179-180

```typescript
const valueB = totalRewardsPerAddress.get(b)!;
const valueA = totalRewardsPerAddress.get(a)!;
```

**Issue:** Non-null assertions (`!`) are used on Map lookups. Since `addresses` is constructed from `totalRewardsPerAddress.keys()` on line 178, every key is guaranteed to exist in the map, making the assertion safe in practice. However, the non-null assertion pattern suppresses compiler safety checks and would fail silently (producing `undefined` compared as a BigInt) if the code were refactored such that the invariant no longer held.

**Recommendation:** This is safe as-is given current code structure. For robustness, consider a fallback: `totalRewardsPerAddress.get(b) ?? 0n`.

---

### A04-9: Blocklist parsing does not validate address format (LOW)

**Location:** Lines 63-68

```typescript
const [reporter, reported] = line.split(" ");
return {
  reporter: reporter.toLowerCase(),
  cheater: reported.toLowerCase(),
};
```

**Issue:** The blocklist is parsed by splitting on a single space. There is no validation that:
- Each line contains exactly two space-separated tokens.
- Each token is a valid Ethereum address (40 hex chars, `0x` prefix).

If a line has only one word, `reported` is `undefined`, and `undefined.toLowerCase()` throws a `TypeError` at runtime. If a line has extra spaces or fields, only the first two tokens are used and the rest are silently ignored.

**Recommendation:** Validate that each line splits into exactly two non-empty tokens and that both match an Ethereum address pattern.

---

### A04-10: Silent swallowing of missing transfer batch files (INFO)

**Location:** Line 33

```typescript
const transfersData = await readFile(`data/transfers${i + 1}.dat`, "utf8").catch(() => "");
```

**Issue:** If a transfer batch file (e.g., `data/transfers5.dat`) is missing, the error is silently caught and treated as an empty file. This is by design (not all 10 batch files may exist), but it means that a genuinely missing or inaccessible file (e.g., due to permissions) produces no warning. The pipeline would proceed with incomplete data and calculate incorrect rewards.

**Recommendation:** Distinguish between "file does not exist" (`ENOENT`) and other errors. Only swallow `ENOENT`; rethrow permission errors or other I/O failures.

---

## 3. Summary Table

| ID | Severity | Title |
|----|----------|-------|
| A04-1 | HIGH | Non-null assertion on `process.env.SEED` -- no validation |
| A04-2 | MEDIUM | `START_SNAPSHOT` / `END_SNAPSHOT` default to 0 silently |
| A04-3 | MEDIUM | Uncaught JSON parse errors produce opaque messages |
| A04-6 | MEDIUM | `transfers` typed as `any[]` -- no schema validation |
| A04-4 | LOW | Relative file paths for all I/O operations |
| A04-5 | LOW | Write-before-mkdir race condition |
| A04-7 | LOW | `splice` with `indexOf` can silently remove wrong element |
| A04-9 | LOW | Blocklist parsing does not validate address format |
| A04-8 | INFO | Non-null assertions on Map lookups in sort comparator |
| A04-10 | INFO | Silent swallowing of missing transfer batch files |
