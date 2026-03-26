# Pass 2: Test Coverage — `src/constants.ts`

**Auditor:** A02
**Date:** 2026-03-22
**Source file:** `src/constants.ts` (58 lines)
**Test file:** `src/constants.test.ts` (37 lines)

---

## Evidence of Reading — Source (`src/constants.ts`)

| Line | Symbol | Kind |
|------|--------|------|
| 7 | `ONE_18` | `const` (BigInt `10n ** 18n`) |
| 10 | `REWARD_POOL` | `const` (BigInt `500_000_000_000_000_000_000_000n`) |
| 12 | `DEC25_REWARD_POOL` | `const` (BigInt `1_000_000_000_000_000_000_000_000n`) |
| 16 | `REWARDS_CSV_COLUMN_HEADER_ADDRESS` | `const` (string `"recipient address"`) |
| 17 | `REWARDS_CSV_COLUMN_HEADER_REWARD` | `const` (string `"amount wei"`) |
| 18 | `DIFF_CSV_COLUMN_HEADER_OLD` | `const` (string `"old"`) |
| 19 | `DIFF_CSV_COLUMN_HEADER_NEW` | `const` (string `"new"`) |
| 20 | `DIFF_CSV_COLUMN_HEADER_DIFF` | `const` (string `"diff"`) |
| 22 | `VALID_ADDRESS_REGEX` | `const` (RegExp `/^0x[0-9a-fA-F]{40}$/`) |
| 25-27 | `validateAddress(value, field)` | function — throws `Error` when regex fails |
| 30 | `BOUNTY_PERCENT` | `const` (BigInt `10n`) |
| 33 | `RETRY_BASE_DELAY_MS` | `const` (number `500`) |
| 36 | `DATA_DIR` | `const` (string `"data"`) |
| 39 | `OUTPUT_DIR` | `const` (string `"output"`) |
| 42 | `TRANSFERS_FILE_BASE` | `const` (string `"transfers"`) |
| 45 | `LIQUIDITY_FILE` | `const` (string `"liquidity.dat"`) |
| 48 | `POOLS_FILE` | `const` (string `"pools.dat"`) |
| 51 | `BLOCKLIST_FILE` | `const` (string `"blocklist.txt"`) |
| 54 | `TRANSFER_CHUNK_SIZE` | `const` (number `270000`) |
| 57 | `TRANSFER_FILE_COUNT` | `const` (number `10`) |

## Evidence of Reading — Tests (`src/constants.test.ts`)

| Line | Test | What it covers |
|------|------|----------------|
| 5-7 | `"ONE_18 is exactly 1e18"` | Asserts `ONE_18 === 10n ** 18n` |
| 9-11 | `"REWARD_POOL is exactly 500_000 tokens in wei"` | Asserts `REWARD_POOL === 500_000n * 10n ** 18n` |
| 15-18 | `"matches valid 40-hex-char addresses"` | Two valid addresses (lowercase and uppercase hex) |
| 20-22 | `"rejects addresses without 0x prefix"` | Missing `0x` prefix |
| 24-27 | `"rejects addresses with wrong length"` | Too short (4 hex) and too long (42 hex) |
| 29-31 | `"rejects non-hex characters"` | `G` characters |
| 33-35 | `"rejects empty string"` | Empty string |

---

## Coverage Analysis

### Tested

| Symbol | Coverage | Notes |
|--------|----------|-------|
| `ONE_18` | Full | Value assertion |
| `REWARD_POOL` | Full | Value assertion via derivation (`500_000n * 10n ** 18n`) |
| `VALID_ADDRESS_REGEX` | Full | Valid, no-prefix, wrong-length, non-hex, empty |

### Not Tested

| Symbol | Tested? | Notes |
|--------|---------|-------|
| `validateAddress` | No | The function itself is never called in any test file. The regex it wraps is tested, but the throw path, the error message, and the happy path of the function are not. |
| `DEC25_REWARD_POOL` | Partial | Used as a ceiling in `diffCalculatorOutput.test.ts`, but never directly asserted to equal `1_000_000n * 10n ** 18n`. |
| `BOUNTY_PERCENT` | No | No test asserts its value or uses it. |
| `REWARDS_CSV_COLUMN_HEADER_ADDRESS` | No | |
| `REWARDS_CSV_COLUMN_HEADER_REWARD` | No | |
| `DIFF_CSV_COLUMN_HEADER_OLD` | No | |
| `DIFF_CSV_COLUMN_HEADER_NEW` | No | |
| `DIFF_CSV_COLUMN_HEADER_DIFF` | No | |
| `RETRY_BASE_DELAY_MS` | No | |
| `DATA_DIR` | No | |
| `OUTPUT_DIR` | No | |
| `TRANSFERS_FILE_BASE` | No | |
| `LIQUIDITY_FILE` | No | |
| `POOLS_FILE` | No | |
| `BLOCKLIST_FILE` | No | |
| `TRANSFER_CHUNK_SIZE` | No | |
| `TRANSFER_FILE_COUNT` | No | |

---

## Findings

### CONST-P2-01 — `validateAddress` has zero test coverage

**Severity:** MEDIUM

`validateAddress` (line 25-27) is the only function in the file and it has no direct tests at all. While `VALID_ADDRESS_REGEX` is tested, the function itself wraps that regex and throws an `Error` with a specific message format. Neither the happy path (no throw on valid input) nor the error path (throws with correct message containing the `field` parameter) are tested.

This function is used in `scraper.ts`, `pipeline.ts`, and `config.ts` to validate addresses at runtime. A regression in the error message format or throw behavior would go unnoticed.

**Missing tests:**
- Happy path: valid address does not throw
- Error path: invalid address throws `Error` with message containing field name and the bad value
- Edge: empty string throws
- Edge: correct `field` parameter appears in message

### CONST-P2-02 — `DEC25_REWARD_POOL` value not directly asserted

**Severity:** LOW

`DEC25_REWARD_POOL` (line 12) is used in `diffCalculatorOutput.test.ts` as a ceiling bound, but no test asserts its value equals the intended `1_000_000n * 10n ** 18n`. If the constant were accidentally modified, the diff calculator tests might still pass (they only check `<=`).

### CONST-P2-03 — `BOUNTY_PERCENT` not tested

**Severity:** LOW

`BOUNTY_PERCENT` (line 30, value `10n`) controls what fraction of penalties go to bounty reporters. A typo (e.g. `100n` or `1n`) would silently change reward distributions. No test asserts its value.

### CONST-P2-04 — String/path constants not tested

**Severity:** INFO

The CSV column header constants (lines 16-20), directory paths (lines 36-39), and file name constants (lines 42-57) have no direct tests. These are simple string literals. Regression risk is low since any mismatch would likely surface in integration tests or CI's `git-clean` check. Documenting for completeness.
