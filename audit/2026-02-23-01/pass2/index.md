# Audit Pass 2 — Test Coverage — `src/index.ts`
**Agent:** A04
**Date:** 2026-02-23

## Evidence of Thorough Reading

### Functions / Async Functions
| Name | Line | Description |
|------|------|-------------|
| `main` | 13 | Async function: orchestrates the entire pipeline — reads env vars, generates snapshots, reads data files, processes transfers and liquidity, computes balances and rewards, writes CSV outputs, verifies totals |

### Constants / Variables (module-level)
| Name | Line | Description |
|------|------|-------------|
| `START_SNAPSHOT` | 10 | Parsed from `process.env.START_SNAPSHOT`, defaults to `0` |
| `END_SNAPSHOT` | 11 | Parsed from `process.env.END_SNAPSHOT`, defaults to `0` |

### Imports
| Module | Line | Imports |
|--------|------|---------|
| `fs/promises` | 1 | `readFile`, `writeFile`, `mkdir` |
| `./processor.js` | 2 | `Processor` |
| `dotenv` | 3 | `config` |
| `./config` | 4 | `CYTOKENS`, `generateSnapshotBlocks` |
| `./constants` | 5 | `REWARD_POOL`, `REWARDS_CSV_COLUMN_HEADER_ADDRESS`, `REWARDS_CSV_COLUMN_HEADER_REWARD` |

### Side Effects
| Line | Description |
|------|-------------|
| 8 | `config()` — loads `.env` into `process.env` |
| 233-236 | `main().catch(...)` — invokes `main` and exits with code 1 on error |

### Test Files Found
No test file exists for `src/index.ts`. The existing test files are:
- `src/config.test.ts`
- `src/liquidity.test.ts`
- `src/processor.test.ts`
- `src/diffCalculator.test.ts`
- `src/diffCalculatorOutput.test.ts`

No test file imports from or references `index.ts`.

---

## Findings

### A04-1 — LOW — No test file exists for `src/index.ts`

There is no `src/index.test.ts` or any test that imports from `src/index.ts`. The file is the main pipeline entry point and is entirely untested.

This is rated LOW rather than higher because `index.ts` is a top-level orchestration script (the `main()` function) that glues together other modules (`Processor`, `generateSnapshotBlocks`, file I/O) which are themselves tested individually. Entry-point scripts are commonly left untested in favor of testing their constituent parts. However, the logic within `main()` is non-trivial and several specific gaps follow.

### A04-2 — MEDIUM — File parsing logic in `main()` is untested (lines 31-65)

The `main()` function contains inline parsing logic for four data files:

1. **transfers.dat** (lines 31-35): Split by newline, filter empty, JSON.parse each line.
2. **liquidity.dat** (lines 40-44): Same pattern.
3. **pools.dat** (lines 49-50): Single JSON.parse of entire file content.
4. **blocklist.txt** (lines 55-65): Split by newline, filter empty, split each line by space into `{reporter, cheater}` with `.toLowerCase()`.

None of this parsing is tested. The blocklist parsing in particular has a subtle behavior: it splits on a single space character and only takes the first two tokens. If a line has extra whitespace or different delimiters, the behavior is undefined. There is no validation that addresses are well-formed.

### A04-3 — MEDIUM — CSV output generation logic is untested (lines 144-218)

The `main()` function constructs two CSV files inline:

1. **balances CSV** (lines 144-195): Dynamically generates column headers from `CYTOKENS` and `SNAPSHOTS`, iterates all addresses sorted by total rewards, and builds rows with snapshot values, averages, penalties, bounties, finals, and per-token rewards.
2. **rewards CSV** (lines 207-218): Generates rows with address and total reward.

This CSV generation logic is not extracted into a testable function and has no test coverage. Bugs in CSV column alignment, missing values, or incorrect sorting would go undetected.

### A04-4 — LOW — Zero-reward address filtering uses `splice` with potential bug (lines 202-206)

The code iterates over `totalRewardsPerAddress` entries and uses `addresses.splice(addresses.indexOf(address), 1)` to remove zero-reward addresses. This modifies the `addresses` array that was previously used for balance output (meaning balances CSV includes zero-reward addresses but rewards CSV does not), and mutates an array by index lookup during iteration over a different collection. While not a direct bug, this pattern is fragile and untested. If `indexOf` returns `-1` (address not found), `splice(-1, 1)` would remove the last element of the array, which would be a silent data corruption bug.

### A04-5 — LOW — Reward total verification is log-only and untested (lines 222-228)

Lines 222-228 compute `totalRewards` and compare it to `REWARD_POOL`, but only log the difference. There is no assertion or error thrown if the difference is unacceptable. This verification logic is not tested, and a significant rounding error or calculation bug would only appear in console output, not as a pipeline failure.

### A04-6 — LOW — Balance verification logic is log-only and untested (lines 128-139)

The per-token balance verification (lines 128-139) checks `totalAverage - totalPenalties + totalBounties === totalFinal` but only logs a checkmark or cross. A failing verification does not cause the pipeline to error. This is untested.

### A04-7 — LOW — Snapshot file is written before output directory is created (lines 18-27)

Line 18-21 writes the snapshots file to `output/snapshots-...txt`, but the `mkdir("output", ...)` call happens on line 27. If the `output` directory does not exist on the first run, the snapshot write will fail before the directory is created. This ordering issue is not covered by any test.

### A04-8 — LOW — Environment variable handling defaults are untested (lines 10-11, 15)

`START_SNAPSHOT` and `END_SNAPSHOT` default to `0` when environment variables are missing. `process.env.SEED` is used with the non-null assertion operator (`!`) on line 15, meaning it will pass `undefined` to `generateSnapshotBlocks` if not set, which may cause a runtime error. None of these edge cases are tested at the integration level.
