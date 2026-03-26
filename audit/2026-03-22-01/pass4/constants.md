# Pass 4: Code Quality Review — `src/constants.ts`

**Auditor:** A02
**Date:** 2026-03-22
**Source file:** `src/constants.ts` (58 lines)

---

## Evidence of Reading — All Exports with Line Numbers

| Line | Symbol | Kind | Value |
|------|--------|------|-------|
| 7 | `ONE_18` | `const` (BigInt) | `10n ** 18n` |
| 10 | `REWARD_POOL` | `const` (BigInt) | `500_000_000_000_000_000_000_000n` |
| 12 | `DEC25_REWARD_POOL` | `const` (BigInt) | `1_000_000_000_000_000_000_000_000n` |
| 16 | `REWARDS_CSV_COLUMN_HEADER_ADDRESS` | `const` (string) | `"recipient address"` |
| 17 | `REWARDS_CSV_COLUMN_HEADER_REWARD` | `const` (string) | `"amount wei"` |
| 18 | `DIFF_CSV_COLUMN_HEADER_OLD` | `const` (string) | `"old"` |
| 19 | `DIFF_CSV_COLUMN_HEADER_NEW` | `const` (string) | `"new"` |
| 20 | `DIFF_CSV_COLUMN_HEADER_DIFF` | `const` (string) | `"diff"` |
| 22 | `VALID_ADDRESS_REGEX` | `const` (RegExp) | `/^0x[0-9a-fA-F]{40}$/` |
| 25-27 | `validateAddress(value, field)` | function | throws on invalid address |
| 30 | `BOUNTY_PERCENT` | `const` (BigInt) | `10n` |
| 33 | `RETRY_BASE_DELAY_MS` | `const` (number) | `500` |
| 36 | `DATA_DIR` | `const` (string) | `"data"` |
| 39 | `OUTPUT_DIR` | `const` (string) | `"output"` |
| 42 | `TRANSFERS_FILE_BASE` | `const` (string) | `"transfers"` |
| 45 | `LIQUIDITY_FILE` | `const` (string) | `"liquidity.dat"` |
| 48 | `POOLS_FILE` | `const` (string) | `"pools.dat"` |
| 51 | `BLOCKLIST_FILE` | `const` (string) | `"blocklist.txt"` |
| 54 | `TRANSFER_CHUNK_SIZE` | `const` (number) | `270000` |
| 57 | `TRANSFER_FILE_COUNT` | `const` (number) | `10` |

---

## Code Quality Review

### Style Consistency

The file has two commenting styles for exported constants:

1. **JSDoc (`/** */`):** Used for `ONE_18`, `validateAddress`, `BOUNTY_PERCENT`, `RETRY_BASE_DELAY_MS`, `DATA_DIR`, `OUTPUT_DIR`, `TRANSFERS_FILE_BASE`, `LIQUIDITY_FILE`, `POOLS_FILE`, `BLOCKLIST_FILE`, `TRANSFER_CHUNK_SIZE`, `TRANSFER_FILE_COUNT` (12 symbols).
2. **Inline `//` comments:** Used for `REWARD_POOL`, `DEC25_REWARD_POOL` (2 symbols).
3. **No per-export comment:** `REWARDS_CSV_COLUMN_HEADER_ADDRESS`, `REWARDS_CSV_COLUMN_HEADER_REWARD`, `DIFF_CSV_COLUMN_HEADER_OLD`, `DIFF_CSV_COLUMN_HEADER_NEW`, `DIFF_CSV_COLUMN_HEADER_DIFF`, `VALID_ADDRESS_REGEX` (6 symbols), though the CSV header group has a `//` comment with a spec URL on lines 14-15.

This inconsistency was already noted in Pass 3 (CONST-P3-02, CONST-P3-03). Not re-raised here.

### Naming Conventions

All constants use `UPPER_SNAKE_CASE`. The function `validateAddress` uses `camelCase`. Both follow standard TypeScript conventions. No issues.

### Dead Code

No dead code. Every export is imported by at least one other file (verified via grep).

### Magic Numbers

No magic numbers within this file. The `100n` used alongside `BOUNTY_PERCENT` in `processor.ts:357` is the implicit denominator that makes `BOUNTY_PERCENT = 10n` mean "10%". This is a cross-file concern reviewed under the processor audit, not a constants.ts issue.

---

## Findings

### CONST-P4-01 — `REWARD_POOL` and `DEC25_REWARD_POOL` use opaque hardcoded literals instead of derivation expressions

**Severity:** LOW
**Lines:** 10, 12

`REWARD_POOL` is `500_000_000_000_000_000_000_000n` and `DEC25_REWARD_POOL` is `1_000_000_000_000_000_000_000_000n`. The intended values are 500K and 1M tokens scaled by 1e18. Contrast with `ONE_18 = 10n ** 18n` on line 7, which uses an expression that is self-documenting.

The project's own `CLAUDE.md` states: "Include derivation logic in source for derived values -- hardcoded results are opaque without the derivation."

A reviewer must manually count 24 and 25 digits respectively to verify correctness. Using `500_000n * 10n ** 18n` and `1_000_000n * 10n ** 18n` would make the value immediately verifiable and consistent with `ONE_18`.

This was identified in Pass 1 (INFO-01) and Pass 3 (CONST-P3-01) but rated INFO. Elevating to LOW for the code quality pass because the project explicitly mandates derivation expressions for derived values, and this is a direct violation of that rule.

### CONST-P4-02 — `TRANSFER_FILE_COUNT` is an independent constant decoupled from `TRANSFER_CHUNK_SIZE`

**Severity:** LOW
**Lines:** 54, 57

The scraper (`scraper.ts:217`) dynamically computes the number of files: `Math.ceil(transfers.length / TRANSFER_CHUNK_SIZE)`. The reader (`index.ts:47`) uses a fixed cap of `TRANSFER_FILE_COUNT = 10` to iterate over files. These two values are not coupled in any way.

If the scraped data grows beyond `TRANSFER_CHUNK_SIZE * TRANSFER_FILE_COUNT` lines (2,700,000 transfers), the scraper will write more files than the reader will read, silently dropping data. Conversely, if data shrinks, the reader will attempt to read nonexistent files (handled by `.catch(() => "")` in index.ts, so no crash, but the intent is unclear).

The reader should derive its file count from the actual files on disk, or `TRANSFER_FILE_COUNT` should be documented as a hard upper bound with an assertion in the scraper that the dynamic count never exceeds it. Currently neither is done.

### CONST-P4-03 — Inconsistent comment style across exported constants

**Severity:** INFO
**Lines:** 9-12, 14-20, 22

The file mixes three documentation styles for exported constants: JSDoc (`/** */`), inline `//` comments, and no comments. The majority (12 of 19 symbols) use JSDoc, but the two most financially significant constants (`REWARD_POOL`, `DEC25_REWARD_POOL`) and the CSV header group use a different style.

Already noted in Pass 3 (CONST-P3-02, CONST-P3-03). Recorded here for the code quality record.

### CONST-P4-04 — `BOUNTY_PERCENT` encodes a percentage but the denominator `100n` lives only in the consumer

**Severity:** INFO
**Lines:** 30

`BOUNTY_PERCENT = 10n` represents 10%. The corresponding division by `100n` occurs in `processor.ts:357` (`(penalty * BOUNTY_PERCENT) / 100n`). The constant name includes "PERCENT" which implies the `/ 100n` semantics, so this is reasonably clear. However, an alternative design would encode the bounty as a fraction (numerator + denominator pair, or basis points) to make the constant self-contained. This is a minor design observation, not actionable.
