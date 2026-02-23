# Security Audit Pass 1 - `src/index.ts`

**Auditor Agent:** A04
**Date:** 2026-02-22
**File:** `src/index.ts` (242 lines)

---

## Evidence of Thorough Reading

### Module Description

`index.ts` is the main entry point of the rewards calculator pipeline. It loads environment variables, reads data files (transfers, liquidity, pools, blocklist), instantiates a `Processor`, runs it through transfer processing, liquidity processing, LP range processing, then computes eligible balances and rewards, and writes CSV output files.

### Imports (Lines 1-5)

- `readFile`, `writeFile`, `mkdir` from `fs/promises`
- `Processor` from `./processor.js`
- `config` from `dotenv`
- `CYTOKENS`, `generateSnapshotBlocks` from `./config`
- `REWARD_POOL` from `./constants`

### Constants Defined

| Name | Line | Value/Description |
|------|------|-------------------|
| `START_SNAPSHOT` | 10 | `parseInt(process.env.START_SNAPSHOT \|\| "0")` |
| `END_SNAPSHOT` | 11 | `parseInt(process.env.END_SNAPSHOT \|\| "0")` |
| `REWARDS_CSV_COLUMN_HEADER_ADDRESS` | 15 | `"recipient address"` |
| `REWARDS_CSV_COLUMN_HEADER_REWARD` | 16 | `"amount wei"` |

### Functions

| Name | Line | Description |
|------|------|-------------|
| `main()` | 18-236 | Async main function containing the entire pipeline |
| (anonymous catch handler) | 238-241 | Top-level error handler calling `process.exit(1)` |

### Key Operations Within `main()`

- **Line 20:** Calls `generateSnapshotBlocks()` with `process.env.SEED!` (non-null assertion)
- **Lines 23-26:** Writes snapshot blocks to `output/snapshots-<start>-<end>.txt`
- **Line 32:** Creates `output/` directory
- **Lines 36-40:** Reads `data/transfers.dat`, parses JSONL
- **Lines 45-49:** Reads `data/liquidity.dat`, parses JSONL
- **Lines 54-55:** Reads `data/pools.dat`, parses as single JSON
- **Lines 60-70:** Reads `data/blocklist.txt`, parses reporter/reported pairs
- **Line 75:** Instantiates `Processor`
- **Lines 80-87:** Processes transfers in a loop with progress logging
- **Lines 92-99:** Processes liquidity changes in a loop with progress logging
- **Line 103:** Calls `processor.processLpRange()`
- **Line 108:** Gets eligible balances
- **Lines 111-145:** Logs per-token balance summaries with verification
- **Lines 149-200:** Constructs and writes `balances-<start>-<end>.csv`
- **Line 157:** Calls `processor.calculateRewards(REWARD_POOL)`
- **Lines 158-170:** Aggregates rewards per address across tokens
- **Lines 173-178:** Sorts addresses by total reward descending
- **Lines 207-211:** Removes zero-reward addresses from array
- **Lines 212-223:** Constructs and writes `rewards-<start>-<end>.csv`
- **Lines 227-233:** Verifies total rewards against reward pool

### Types Referenced

- `CyToken` (from `./types`)
- `bigint` (native)
- `Map<string, bigint>` for `totalRewardsPerAddress`

---

## Security Findings

### A04-1: Non-null Assertion on `process.env.SEED` Without Validation (MEDIUM)

**Line:** 20
**Code:**
```typescript
const SNAPSHOTS = generateSnapshotBlocks(process.env.SEED!, START_SNAPSHOT, END_SNAPSHOT);
```

**Description:** The `SEED` environment variable is accessed with a TypeScript non-null assertion (`!`) but is never validated at runtime. If `SEED` is undefined, the value `undefined` is passed as a string to `seedrandom()`. In seedrandom, `undefined` as an input produces a non-deterministic seed (it falls through to auto-seeding), which would silently break the determinism guarantee of the entire snapshot block selection system. This would produce different snapshot blocks on each run, making rewards non-reproducible.

**Impact:** The core determinism invariant of the system could be silently violated. Different runs would compute different snapshot blocks and therefore different reward distributions.

**Recommendation:** Add explicit runtime validation that `SEED` is a non-empty string before use:
```typescript
const SEED = process.env.SEED;
if (!SEED) {
  throw new Error("SEED environment variable is required");
}
```

---

### A04-2: Environment Variable Defaults Silently Produce Invalid Block Range (MEDIUM)

**Lines:** 10-11
**Code:**
```typescript
const START_SNAPSHOT = parseInt(process.env.START_SNAPSHOT || "0");
const END_SNAPSHOT = parseInt(process.env.END_SNAPSHOT || "0");
```

**Description:** If `START_SNAPSHOT` or `END_SNAPSHOT` environment variables are missing, they default to `0`. A range of `[0, 0]` is passed to `generateSnapshotBlocks()`, which computes `range = 0 - 0 + 1 = 1`, meaning all 30 snapshots land on block 0. The pipeline then proceeds to process data with nonsensical snapshot blocks, producing a rewards output that looks valid but is based on block 0 only. There is no validation that the block range is sensible (e.g., `END > START > 0`).

Additionally, `parseInt` with no radix is used. While modern engines default to base 10, an explicit radix `parseInt(value, 10)` is best practice to avoid any ambiguity.

**Impact:** Misconfigured environment could silently produce incorrect reward distributions.

**Recommendation:** Validate both values are positive integers and that `END_SNAPSHOT > START_SNAPSHOT`:
```typescript
if (START_SNAPSHOT <= 0 || END_SNAPSHOT <= 0 || END_SNAPSHOT <= START_SNAPSHOT) {
  throw new Error(`Invalid snapshot range: ${START_SNAPSHOT} to ${END_SNAPSHOT}`);
}
```

---

### A04-3: Unsanitized Data in CSV Output (Path Traversal and CSV Injection) (MEDIUM)

**Lines:** 188-195, 215-218
**Code:**
```typescript
// Line 188
return `${tokenBalance.snapshots.join(",")},${tokenBalance.average},...`;
// Line 194
`${address},` + `${tokenValues},` + `${totalRewardsPerAddress.get(address) || 0n}`
// Line 217
`${address},${totalRewardsPerAddress.get(address) || 0n}`
```

**Description:** Addresses from the on-chain data are written directly into CSV without sanitization. While Ethereum addresses are hex strings in practice, the data passes through `JSON.parse()` from `.dat` files which are cached JSONL from a subgraph. If the data files are tampered with (or the subgraph returns malicious data), addresses could contain CSV-breaking characters (commas, newlines) or CSV injection payloads (e.g., `=CMD()`, `+CMD()`). The rewards CSV is consumed by the Flare distribution tool, so injected content could affect downstream processing.

**Impact:** If `.dat` files are compromised, malformed CSV output could cause incorrect reward distribution or downstream tool exploitation.

**Recommendation:** Validate that all addresses match the expected Ethereum address format (`/^0x[0-9a-f]{40}$/i`) before writing to CSV output. For defense in depth, quote CSV fields.

---

### A04-4: JSON.parse on Untrusted File Content Without Schema Validation (MEDIUM)

**Lines:** 40, 49, 55
**Code:**
```typescript
.map((line) => JSON.parse(line));   // lines 40, 49
const pools = JSON.parse(poolsData); // line 55
```

**Description:** Three data files are parsed from JSON with no schema validation. The parsed objects are passed directly into the `Processor` class. If the `.dat` files have been tampered with, corrupted, or if the subgraph returns unexpected data shapes, the application could behave unpredictably. For a financial distribution system, unexpected object shapes could lead to incorrect reward calculations (e.g., missing `blockNumber` causing sort issues, missing `value` defaulting to `NaN` in arithmetic).

**Impact:** Malformed input data could cause silent miscalculations in reward distribution.

**Recommendation:** Validate parsed objects against expected schemas (e.g., using zod or a manual check) before processing. At minimum, verify required fields exist and have expected types.

---

### A04-5: File Write Before Directory Creation (Race Condition) (LOW)

**Lines:** 23-26, 32
**Code:**
```typescript
// Line 23-26: writes to output/ directory
await writeFile("output/snapshots-" + START_SNAPSHOT + "-" + END_SNAPSHOT + ".txt", ...);
// Line 32: creates output/ directory
await mkdir("output", { recursive: true });
```

**Description:** The snapshot file is written to the `output/` directory (line 23) before the `mkdir` call that ensures the directory exists (line 32). If the `output/` directory does not exist, the `writeFile` call on line 23 will throw an `ENOENT` error.

**Impact:** On a fresh clone or after `output/` cleanup, the pipeline would fail at line 23 instead of running successfully.

**Recommendation:** Move the `mkdir("output", { recursive: true })` call before the first `writeFile` to `output/`.

---

### A04-6: Blocklist Parsing Does Not Validate Address Format (LOW)

**Lines:** 63-70
**Code:**
```typescript
const [reporter, reported] = line.split(" ");
return {
  reporter: reporter.toLowerCase(),
  cheater: reported.toLowerCase(),
};
```

**Description:** The blocklist file is split on spaces with no validation. If a line has no space, `reported` is `undefined`, and `undefined.toLowerCase()` throws a runtime error. If a line has extra spaces, only the first two tokens are used, silently ignoring malformed input. There is no validation that the values are valid Ethereum addresses.

**Impact:** A malformed blocklist entry could crash the pipeline or silently produce an invalid `cheater` value of `"undefined"`, which would never match any real address -- meaning the intended penalty would not be applied.

**Recommendation:** Validate each blocklist line has exactly two valid Ethereum addresses.

---

### A04-7: Mutating Array While Iterating Over Map (Correctness Issue) (LOW)

**Lines:** 207-211
**Code:**
```typescript
for (const [address, reward] of totalRewardsPerAddress) {
  if (reward === 0n) {
    addresses.splice(addresses.indexOf(address), 1);
  }
}
```

**Description:** This iterates over the `totalRewardsPerAddress` map and uses `splice` with `indexOf` to remove entries from the `addresses` array. While not iterating the array itself (so mutation is safe in that narrow sense), `indexOf` has O(n) complexity making this O(n^2). More importantly, if an address exists in `totalRewardsPerAddress` with reward `0n` but is not in the `addresses` array, `indexOf` returns `-1`, and `splice(-1, 1)` removes the **last** element of the array -- silently deleting a legitimate reward entry.

**Impact:** If the data sets are inconsistent, a legitimate reward recipient could have their entry silently removed from the output.

**Recommendation:** Use `filter` to create a new array, or guard against `indexOf` returning `-1`:
```typescript
const filteredAddresses = addresses.filter(
  (addr) => (totalRewardsPerAddress.get(addr) ?? 0n) !== 0n
);
```

---

### A04-8: Relative File Paths Depend on Working Directory (LOW)

**Lines:** 24, 36, 45, 54, 60, 198, 221

**Description:** All file read/write operations use relative paths (e.g., `"data/transfers.dat"`, `"output/rewards-....csv"`). The correct behavior depends entirely on the process being launched from the project root directory. If the script is invoked from a different working directory, it will read from or write to the wrong location, potentially reading stale or unrelated data and writing results to unexpected locations.

**Impact:** Running from the wrong directory could silently process incorrect data or overwrite unrelated files.

**Recommendation:** Resolve paths relative to `__dirname` or the project root, or validate the working directory at startup.

---

### A04-9: No Integrity Check on Input Data Files (INFO)

**Lines:** 36, 45, 54, 60

**Description:** The pipeline reads four data files (`transfers.dat`, `liquidity.dat`, `pools.dat`, `blocklist.txt`) with no checksum or integrity verification. Since these files are committed to the repository and the CI verifies reproducibility via `git-clean.yaml`, there is some protection. However, a supply-chain attack modifying these files (or a corrupted git checkout) would go undetected by the application itself.

**Impact:** Tampered data files would produce incorrect reward distributions. The CI check mitigates this but only catches it post-execution.

**Recommendation:** Consider computing and verifying checksums of input data files at the start of the pipeline, or signing the data files.

---

### A04-10: Reward Pool Total Verification Is Log-Only, Not Enforced (INFO)

**Lines:** 227-233
**Code:**
```typescript
const totalRewards = Array.from(totalRewardsPerAddress.values()).reduce(...);
console.log(`\nTotal rewards: ${totalRewards}`);
console.log(`Reward pool: ${REWARD_POOL}`);
console.log(`Difference: ${totalRewards - REWARD_POOL}`);
```

**Description:** The verification that total distributed rewards approximately matches `REWARD_POOL` is performed only as a console log. The pipeline does not assert or fail if the difference is unexpectedly large. While some rounding difference is expected, an unbounded difference could indicate a calculation bug and should be caught.

**Impact:** A calculation error causing significant over- or under-distribution would not cause the pipeline to fail.

**Recommendation:** Add a threshold check and throw an error if the difference exceeds an acceptable tolerance (e.g., the number of recipients, which is the maximum rounding error with integer division).
