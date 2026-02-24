# Pass 3 -- Documentation Audit: `src/index.ts`

**Auditor Agent:** A04
**Date:** 2026-02-24
**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/index.ts`

---

## 1. Inventory of Functions, Constants, and Exports

| Line | Symbol | Kind | Exported |
|------|--------|------|----------|
| 10 | `START_SNAPSHOT` | `const` (module-level) | No |
| 11 | `END_SNAPSHOT` | `const` (module-level) | No |
| 13 | `main()` | `async function` | No |
| 243 | (top-level) `main().catch(...)` | Entry-point invocation | N/A |

---

## 2. Module-Level Documentation

**[A04-DOC-001] No module-level JSDoc or header comment.**
Severity: Low
The file has no top-level comment describing its purpose as the pipeline orchestrator (scrape data -> process -> output CSVs). The single inline comment on line 7 (`// Load environment variables`) is the only orientation provided. A brief module-level JSDoc block would help future readers understand that this file is the main entry point for the reward calculation pipeline.

---

## 3. Function-Level Documentation

### `main()` (line 13)

**[A04-DOC-002] `main()` has no JSDoc documentation.**
Severity: Medium
This is the primary orchestration function for the entire pipeline. It performs at least 10 distinct steps (read data files, instantiate processor, process transfers, process liquidity, compute balances, compute rewards, write CSVs, verify totals). A JSDoc block describing the pipeline stages, the environment variables it depends on (`SEED`, `START_SNAPSHOT`, `END_SNAPSHOT`), the files it reads (`data/transfers*.dat`, `data/liquidity.dat`, `data/pools.dat`, `data/blocklist.txt`), and the files it writes (`output/balances-*.csv`, `output/rewards-*.csv`, `output/snapshots-*.txt`) would significantly improve maintainability.

---

## 4. Inline Comment Accuracy

### [A04-DOC-003] Line 206: Log message says `output/balances.csv` but file is written to a dynamic name.
Severity: Medium
Line 202-204 writes to `"output/balances-" + START_SNAPSHOT + "-" + END_SNAPSHOT + ".csv"`, but line 206 logs:
```typescript
console.log(`Wrote ${addresses.length} balances to output/balances.csv`);
```
The logged filename `output/balances.csv` does not match the actual output path `output/balances-{START}-{END}.csv`. This is misleading when debugging or auditing logs.

### [A04-DOC-004] Line 229: Log message says `output/rewards.csv` but file is written to a dynamic name.
Severity: Medium
Same issue as above. Line 225-227 writes to `"output/rewards-" + START_SNAPSHOT + "-" + END_SNAPSHOT + ".csv"`, but line 229 logs:
```typescript
console.log(`Wrote ${addresses.length} rewards to output/rewards.csv`);
```

### [A04-DOC-005] Line 14: Comment `// generate snapshot blocks` is redundant.
Severity: Info
The comment merely restates what the function call `generateSnapshotBlocks(...)` already communicates. Not harmful, but adds noise.

### [A04-DOC-006] Line 26: Comment `// Create output directory if it doesn't exist` is accurate.
Severity: None
This comment correctly describes the `mkdir("output", { recursive: true })` call.

### [A04-DOC-007] Lines 72, 76, 82, 94, 106, 111: Inline comments are accurate.
Severity: None
Comments such as `// Setup processor with snapshot blocks and blocklist`, `// Organize liquidity changes`, `// Process transfers`, `// Process liquidity changes`, `// Process liquidity v3 price range`, `// Get eligible balances` all accurately describe their respective code blocks.

---

## 5. Other Documentation Gaps

### [A04-DOC-008] No documentation on the `transfers` splitting logic (lines 32-39).
Severity: Low
The loop reads `transfers1.dat` through `transfers10.dat` and concatenates them. There is no comment explaining why transfers are split across 10 files (to avoid GitHub's 100MB file size limit, as noted in the scraper). A brief comment here would prevent confusion.

### [A04-DOC-009] No documentation on the `blocklist.txt` file format (lines 59-69).
Severity: Low
The parsing logic assumes each line is `"reporter reported"` separated by a space, but there is no inline comment or JSDoc explaining this expected format.

### [A04-DOC-010] The `any[]` type on line 31 suppresses type safety.
Severity: Low (documentation-adjacent)
`let transfers: any[] = []` loses type information. While not strictly a documentation issue, the lack of typing means the code itself cannot serve as documentation for the data shape.

---

## 6. Summary

| ID | Severity | Description |
|----|----------|-------------|
| A04-DOC-001 | Low | No module-level JSDoc |
| A04-DOC-002 | Medium | `main()` has no JSDoc |
| A04-DOC-003 | Medium | Log on line 206 says `balances.csv` but actual filename is `balances-{START}-{END}.csv` |
| A04-DOC-004 | Medium | Log on line 229 says `rewards.csv` but actual filename is `rewards-{START}-{END}.csv` |
| A04-DOC-005 | Info | Redundant inline comment on line 14 |
| A04-DOC-006 | None | Accurate comment on line 26 |
| A04-DOC-007 | None | Accurate comments on lines 72, 76, 82, 94, 106, 111 |
| A04-DOC-008 | Low | No comment explaining multi-file transfer split |
| A04-DOC-009 | Low | No comment documenting blocklist.txt format |
| A04-DOC-010 | Low | `any[]` type hides data shape documentation |
