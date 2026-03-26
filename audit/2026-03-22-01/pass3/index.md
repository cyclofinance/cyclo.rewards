# Pass 3: Documentation Review — `src/index.ts`

**Auditor:** A04
**Date:** 2026-03-22
**File:** `src/index.ts` (182 lines)

## Evidence of Thorough Reading

### Module Structure
- **Module-level JSDoc:** Yes (lines 1-4) — `"Main pipeline entrypoint. Reads scraped data files, runs the reward processor, and writes balance/reward CSVs to the output directory."`
- Imports: lines 6-14 (8 import statements covering `fs/promises`, `viem`, `dotenv`, local modules)

### Exports, Functions, and Key Statements

| Item | Kind | Line(s) | JSDoc? |
|---|---|---|---|
| Module-level comment | JSDoc | 1-4 | Yes |
| `config()` | top-level side effect | 17 | Inline comment only (`// Load environment variables`) |
| `main()` | async function (not exported) | 26-176 | Yes (lines 19-25) |
| `main().catch(...)` | entry point | 178-181 | No |

### Inline Comments Within `main()`

| Line(s) | Comment |
|---|---|
| 29 | `// generate snapshot blocks` |
| 32 | `// Create output directory if it doesn't exist` |
| 35 | `// write generated snapshots` |
| 44 | `// Read transfers file` |
| 53 | `// Read liquidity file` |
| 59 | `// Read pools file` |
| 65 | `// Read blocklist` |
| 71 | `// Setup processor with snapshot blocks and blocklist` |
| 76 | `// Organize liquidity changes` |
| 82 | `// Process transfers` |
| 94 | `// Process liquidity changes` |
| 106 | `// Process liquidity v3 price range` |
| 111 | `// Get eligible balances` |
| 115 | `// Add per-token balance logging` |
| 131 | `// Write balances with per-token data` |
| 150 | `// Calculate and write rewards` |
| 153 | `// remove any addresses with no rewards` |
| 162 | `// Verify total rewards equals reward pool` |

---

## Findings

### P3-IDX-01: `main()` JSDoc does not document thrown errors [LOW]

**Location:** Lines 19-25

```typescript
/**
 * Orchestrates the full reward calculation pipeline:
 * loads env config, reads scraped transfer/liquidity/pool data files
 * (transfers split across data/transfers1.dat–transfers10.dat to stay under GitHub's 100MB limit),
 * reads blocklist (space-separated "reporter cheater" pairs, one per line),
 * processes all events through the Processor, and writes output CSVs.
 */
```

**Description:** The `main()` function has two explicit `throw` statements that halt the pipeline on detected invariant violations:

1. Line 126: `throw new Error(`Balance verification failed for ${summary.name}: ...`)` — thrown when token balance arithmetic is inconsistent.
2. Line 172: `throw new Error(`Reward pool difference too large: ${diff}`)` — thrown when total distributed rewards diverge more than 0.1% from the reward pool.

Neither is documented in the JSDoc. These are not incidental errors — they are safety-critical invariants that intentionally halt the pipeline. A `@throws` tag (or descriptive note) for each would alert maintainers to the conditions under which the pipeline is designed to abort.

**Recommendation:** Add `@throws` documentation for both invariant checks.

---

### P3-IDX-02: `main()` JSDoc does not document output files [LOW]

**Location:** Lines 19-25

**Description:** The JSDoc says `main()` "writes output CSVs" but does not specify which files are written. The function writes three output files:

1. `output/snapshots-{start}-{end}.txt` (line 37) — the 30 snapshot block numbers
2. `output/balances-{start}-{end}.csv` (line 144) — per-address per-token balance breakdown
3. `output/rewards-{start}-{end}.csv` (line 157) — final reward amounts per address

Since this is the pipeline entrypoint, a reader needs to know what outputs to expect. The input files are documented (transfers, liquidity, blocklist) but the outputs are only described generically as "output CSVs."

**Recommendation:** List the output file names and their contents in the JSDoc, or add a `@produces` or descriptive note.

---

### P3-IDX-03: `main()` JSDoc does not mention the pools data file [LOW]

**Location:** Lines 19-25

**Description:** The JSDoc describes the input files: "transfer/liquidity/pool data files" and "blocklist." However, the pools file (`data/pools.dat`, read at line 61) is only mentioned in the compound noun "transfer/liquidity/pool data files" — it is easy to miss. The JSDoc explicitly calls out the transfer file splitting and the blocklist format, but says nothing about the pools file format (JSON array of `0x`-prefixed addresses). For consistency with the other input file descriptions, pools deserves its own mention.

**Recommendation:** Add an explicit note about `pools.dat` and its format (JSON array of hex addresses).

---

### P3-IDX-04: Module-level JSDoc is accurate but minimal [INFO]

**Location:** Lines 1-4

```typescript
/**
 * Main pipeline entrypoint. Reads scraped data files, runs the reward processor,
 * and writes balance/reward CSVs to the output directory.
 */
```

**Description:** The module-level JSDoc is present and accurate. It correctly identifies the file as the entrypoint and summarizes the pipeline flow. It could be enhanced by mentioning the environment variable dependencies (`SEED`, `START_SNAPSHOT`, `END_SNAPSHOT`, `RPC_URL`) since this is the file where `dotenv` is loaded and `parseEnv()` is called, but this is a minor enhancement — the current text is not wrong.

---

### P3-IDX-05: Entry point `main().catch(...)` has no documentation [INFO]

**Location:** Lines 178-181

```typescript
main().catch((error) => {
  console.error("Error occurred:", error);
  process.exit(1);
});
```

**Description:** The top-level invocation and error handler has no JSDoc or inline comment. This is a standard Node.js pattern and largely self-documenting. The `// Load environment variables` comment on line 16 sets a precedent for documenting top-level side effects, so a brief comment here would be consistent, but this is very minor.

---

### P3-IDX-06: Inline comment "Add per-token balance logging" is misleading [INFO]

**Location:** Line 115

```typescript
// Add per-token balance logging
for (const summary of summarizeTokenBalances(balances, CYTOKENS)) {
```

**Description:** The comment says "Add per-token balance logging" but the block does more than log: it also throws on verification failure (lines 125-127). The comment suggests this is purely a logging step, which undersells its role as a safety invariant check. A reader skimming comments could mistake this section as optional/removable.

**Recommendation:** Reword to something like `// Verify per-token balance invariants and log summaries`.

---

### P3-IDX-07: Inline comment "Calculate and write rewards" is stale [INFO]

**Location:** Line 150

```typescript
// Calculate and write rewards
console.log("Calculating rewards...");
```

**Description:** The comment says "Calculate and write rewards" but rewards were already calculated at line 133 (`processor.calculateRewards`). This block only filters, formats, and writes the rewards CSV. The comment is a holdover from before the calculation was moved earlier. It is slightly misleading — a reader might look here expecting to find the reward calculation logic.

**Recommendation:** Reword to `// Filter and write rewards CSV` or similar.

---

## Summary

| Severity | Count |
|---|---|
| CRITICAL | 0 |
| HIGH | 0 |
| MEDIUM | 0 |
| LOW | 3 |
| INFO | 4 |

The file has good top-level documentation: both the module-level JSDoc and the `main()` function JSDoc are present and broadly accurate. The JSDoc on `main()` provides useful detail about input file formats (transfer splitting, blocklist format) but omits the thrown error conditions (P3-IDX-01), the specific output files produced (P3-IDX-02), and the pools input file (P3-IDX-03). The inline comments are thorough — nearly every pipeline step has one — but two are misleading about the actual behavior of their code blocks (P3-IDX-06, P3-IDX-07).
