# Pass 3: Documentation Review — `src/constants.ts`

**Auditor:** A02
**Date:** 2026-03-22
**Source file:** `src/constants.ts` (58 lines)

---

## Evidence of Reading — All Exports with Line Numbers

| Line | Symbol | Kind | Has JSDoc? |
|------|--------|------|------------|
| 1-4 | *(module-level)* | module JSDoc | Yes (`/** Shared constants for reward pool amounts, CSV column headers, validation patterns, and data file paths ... */`) |
| 7 | `ONE_18` | `const` (BigInt) | Yes (`/** 1e18 as BigInt — the fixed-point unit for 18-decimal token arithmetic */`) |
| 10 | `REWARD_POOL` | `const` (BigInt) | Partial — `//` comment only: `// Jan 2026 epoch: 500,000 tokens (18 decimals)` |
| 12 | `DEC25_REWARD_POOL` | `const` (BigInt) | Partial — `//` comment only: `// Dec 2025 epoch: 1,000,000 tokens (18 decimals) — used by diffCalculator for reconciliation` |
| 16 | `REWARDS_CSV_COLUMN_HEADER_ADDRESS` | `const` (string) | No — group has a `//` comment on line 14-15 referencing the external spec URL, but no JSDoc per-export |
| 17 | `REWARDS_CSV_COLUMN_HEADER_REWARD` | `const` (string) | No |
| 18 | `DIFF_CSV_COLUMN_HEADER_OLD` | `const` (string) | No |
| 19 | `DIFF_CSV_COLUMN_HEADER_NEW` | `const` (string) | No |
| 20 | `DIFF_CSV_COLUMN_HEADER_DIFF` | `const` (string) | No |
| 22 | `VALID_ADDRESS_REGEX` | `const` (RegExp) | No |
| 25-27 | `validateAddress(value, field)` | function | Yes (`/** Validate that a string is a valid Ethereum address (0x + 40 hex chars) */`) |
| 30 | `BOUNTY_PERCENT` | `const` (BigInt) | Yes (`/** Percentage of a cheater's penalty paid to the reporter as a bounty (10%) */`) |
| 33 | `RETRY_BASE_DELAY_MS` | `const` (BigInt) | Yes (`/** Base delay in ms for exponential backoff on RPC retries */`) |
| 36 | `DATA_DIR` | `const` (string) | Yes (`/** Directory for scraped data files */`) |
| 39 | `OUTPUT_DIR` | `const` (string) | Yes (`/** Directory for output CSV files */`) |
| 42 | `TRANSFERS_FILE_BASE` | `const` (string) | Yes (`/** Base filename for transfer JSONL data (appended with 1-based index, e.g. transfers1.dat) */`) |
| 45 | `LIQUIDITY_FILE` | `const` (string) | Yes (`/** Filename for liquidity change JSONL data */`) |
| 48 | `POOLS_FILE` | `const` (string) | Yes (`/** Filename for V3 pool addresses JSON */`) |
| 51 | `BLOCKLIST_FILE` | `const` (string) | Yes (`/** Filename for penalty/bounty blocklist */`) |
| 54 | `TRANSFER_CHUNK_SIZE` | `const` (number) | Yes (`/** Max lines per transfer data file to stay under GitHub's 100MB file size limit */`) |
| 57 | `TRANSFER_FILE_COUNT` | `const` (number) | Yes (`/** Max number of transfer data files to read */`) |

---

## Systematic JSDoc Analysis

### Module-level JSDoc

Lines 1-4 provide a module-level JSDoc comment. It accurately describes the file's contents: reward pool amounts, CSV column headers, validation patterns, and data file paths. No issues.

### Per-export JSDoc Review

**Exports WITH JSDoc (11 of 18 exports):**

1. **`ONE_18` (line 6-7):** Accurate. Value is `10n ** 18n` which is indeed `1e18` as BigInt for 18-decimal arithmetic.
2. **`validateAddress` (line 24-25):** Accurate. Function validates a string is `0x` + 40 hex chars using the regex. JSDoc does not mention the `field` parameter or the throw behavior, but the single-line format is acceptable for this context.
3. **`BOUNTY_PERCENT` (line 29-30):** Accurate. Value is `10n`, and it is divided by `100n` in `processor.ts:357`, confirming 10%.
4. **`RETRY_BASE_DELAY_MS` (line 32-33):** Accurate. Used in `processor.ts:130` as `Math.pow(2, attempt) * RETRY_BASE_DELAY_MS`, confirming exponential backoff.
5. **`DATA_DIR` (line 35-36):** Accurate. Value is `"data"`.
6. **`OUTPUT_DIR` (line 38-39):** Accurate. Value is `"output"`.
7. **`TRANSFERS_FILE_BASE` (line 41-42):** Accurate. Value is `"transfers"`, used with 1-based index to form `transfers1.dat`, etc.
8. **`LIQUIDITY_FILE` (line 44-45):** Accurate. Value is `"liquidity.dat"`.
9. **`POOLS_FILE` (line 47-48):** Accurate. Value is `"pools.dat"`.
10. **`BLOCKLIST_FILE` (line 50-51):** Accurate. Value is `"blocklist.txt"`.
11. **`TRANSFER_CHUNK_SIZE` (line 53-54):** Accurate. Value is `270000`, used by scraper to split files.
12. **`TRANSFER_FILE_COUNT` (line 56-57):** Accurate. Value is `10`, used by index to cap file reads.

**Exports WITHOUT JSDoc (7 of 18 exports):**

1. **`REWARD_POOL` (line 10):** Has a `//` inline comment but no `/** */` JSDoc. The inline comment is accurate ("Jan 2026 epoch: 500,000 tokens (18 decimals)").
2. **`DEC25_REWARD_POOL` (line 12):** Has a `//` inline comment but no `/** */` JSDoc. The inline comment is accurate ("Dec 2025 epoch: 1,000,000 tokens (18 decimals) — used by diffCalculator for reconciliation").
3. **`REWARDS_CSV_COLUMN_HEADER_ADDRESS` (line 16):** No per-export JSDoc. Group `//` comment on lines 14-15 references the external spec URL.
4. **`REWARDS_CSV_COLUMN_HEADER_REWARD` (line 17):** No per-export JSDoc. Covered by the group comment.
5. **`DIFF_CSV_COLUMN_HEADER_OLD` (line 18):** No JSDoc.
6. **`DIFF_CSV_COLUMN_HEADER_NEW` (line 19):** No JSDoc.
7. **`DIFF_CSV_COLUMN_HEADER_DIFF` (line 20):** No JSDoc.
8. **`VALID_ADDRESS_REGEX` (line 22):** No JSDoc. The immediately following `validateAddress` function JSDoc partially covers its purpose by mentioning "0x + 40 hex chars".

---

## Findings

### CONST-P3-01 — `REWARD_POOL` derivation not shown in source

**Severity:** LOW

`REWARD_POOL` (line 10) is a hardcoded literal `500_000_000_000_000_000_000_000n`. The `//` comment says "500,000 tokens (18 decimals)" but the value is not expressed as a derivation (e.g., `500_000n * 10n ** 18n`). Per project rules, derived values should include derivation logic in source so the result is not opaque. The test in `constants.test.ts:10` asserts the derivation, but the source itself does not express it. Contrast with `ONE_18 = 10n ** 18n` on line 7, which does express the derivation.

This also applies to `DEC25_REWARD_POOL` on line 12 (`1_000_000_000_000_000_000_000_000n` vs. `1_000_000n * 10n ** 18n`).

### CONST-P3-02 — CSV column header constants and `VALID_ADDRESS_REGEX` lack JSDoc

**Severity:** INFO

Seven exported constants (lines 16-20, 22) have no `/** */` JSDoc comments. Lines 16-17 are covered by a group `//` comment with a spec URL, which is useful but not machine-parseable JSDoc. Lines 18-20 (`DIFF_CSV_COLUMN_HEADER_*`) and line 22 (`VALID_ADDRESS_REGEX`) have no documentation at all.

For a 58-line file where 12 of 19 symbols already have JSDoc, consistency would be improved by adding JSDoc to the remaining 7. However, the values are self-documenting string literals, and the risk from missing JSDoc is minimal.

### CONST-P3-03 — `REWARD_POOL` and `DEC25_REWARD_POOL` use `//` comments instead of `/** */` JSDoc

**Severity:** INFO

Both reward pool constants use inline `//` comments rather than `/** */` JSDoc. This is inconsistent with the rest of the file where 12 other exports use JSDoc. Tooling that extracts JSDoc (IDE hover, documentation generators) will not surface these comments.

### CONST-P3-04 — CLAUDE.md references stale constant names and values

**Severity:** LOW

The project's `CLAUDE.md` file describes `src/constants.ts` as containing `ONE` (1e18 as BigInt) and `REWARD_POOL` (1M tokens as BigInt). Both are inaccurate:
- The constant is named `ONE_18`, not `ONE`.
- `REWARD_POOL` is 500K tokens (Jan 2026 epoch), not 1M tokens. The 1M value is `DEC25_REWARD_POOL`.

This stale documentation could mislead developers or AI assistants working with the codebase.
