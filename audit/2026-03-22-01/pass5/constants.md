# Pass 5: Correctness / Intent Verification -- `src/constants.ts`

**Auditor:** A02
**Date:** 2026-03-22
**Source file:** `src/constants.ts` (58 lines)
**Test file:** `src/constants.test.ts` (36 lines)

---

## Evidence of Thorough Reading

### Source file -- all 19 exported symbols with line numbers

| Line | Symbol | Kind | Declared Value |
|------|--------|------|----------------|
| 7 | `ONE_18` | `const` (BigInt) | `10n ** 18n` |
| 10 | `REWARD_POOL` | `const` (BigInt) | `500_000_000_000_000_000_000_000n` |
| 12 | `DEC25_REWARD_POOL` | `const` (BigInt) | `1_000_000_000_000_000_000_000_000n` |
| 16 | `REWARDS_CSV_COLUMN_HEADER_ADDRESS` | `const` (string) | `"recipient address"` |
| 17 | `REWARDS_CSV_COLUMN_HEADER_REWARD` | `const` (string) | `"amount wei"` |
| 18 | `DIFF_CSV_COLUMN_HEADER_OLD` | `const` (string) | `"old"` |
| 19 | `DIFF_CSV_COLUMN_HEADER_NEW` | `const` (string) | `"new"` |
| 20 | `DIFF_CSV_COLUMN_HEADER_DIFF` | `const` (string) | `"diff"` |
| 22 | `VALID_ADDRESS_REGEX` | `const` (RegExp) | `/^0x[0-9a-fA-F]{40}$/` |
| 25-27 | `validateAddress(value, field)` | function | throws `Error` on regex mismatch |
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

### Test file -- all test cases with line numbers

| Lines | Describe Block | Test Name | What It Asserts |
|-------|---------------|-----------|-----------------|
| 5-7 | `constants` | `ONE_18 is exactly 1e18` | `ONE_18 === 10n ** 18n` |
| 9-11 | `constants` | `REWARD_POOL is exactly 500_000 tokens in wei` | `REWARD_POOL === 500_000n * 10n ** 18n` |
| 16 | `VALID_ADDRESS_REGEX` | `matches valid 40-hex-char addresses` | lowercase + uppercase valid addresses pass |
| 20-22 | `VALID_ADDRESS_REGEX` | `rejects addresses without 0x prefix` | bare hex rejected |
| 24-27 | `VALID_ADDRESS_REGEX` | `rejects addresses with wrong length` | too short (4 hex) + too long (42 hex) rejected |
| 29-31 | `VALID_ADDRESS_REGEX` | `rejects non-hex characters` | `G` chars rejected |
| 33-35 | `VALID_ADDRESS_REGEX` | `rejects empty string` | empty string rejected |

---

## Correctness Verification -- Per-Symbol Analysis

### 1. `ONE_18 = 10n ** 18n` (line 7)

**Verdict: CORRECT**

The expression `10n ** 18n` evaluates to `1000000000000000000n` (19 digits), which is exactly 1e18. The name `ONE_18` clearly communicates "one unit in 18-decimal fixed-point". Used as a scaling factor for token arithmetic throughout the codebase. The test on line 6 directly asserts `ONE_18 === 10n ** 18n`.

### 2. `REWARD_POOL = 500_000_000_000_000_000_000_000n` (line 10)

**Verdict: CORRECT**

Independently verified: `500_000n * 10n ** 18n === 500_000_000_000_000_000_000_000n` (true). The value has 24 digits: 6 digits for 500,000 + 18 zeros. The comment says "500,000 tokens (18 decimals)" which matches. The test on line 10 asserts `REWARD_POOL === 500_000n * 10n ** 18n`.

### 3. `DEC25_REWARD_POOL = 1_000_000_000_000_000_000_000_000n` (line 12)

**Verdict: CORRECT**

Independently verified: `1_000_000n * 10n ** 18n === 1_000_000_000_000_000_000_000_000n` (true). The value has 25 digits: 7 digits for 1,000,000 + 18 zeros. The comment says "1,000,000 tokens (18 decimals)" which matches. No direct unit test asserts this value (noted in Pass 2 as CONST-P2-02). It is used as a ceiling bound in `diffCalculatorOutput.test.ts` but never asserted for equality.

### 4. CSV Column Headers (lines 16-20)

**Verdict: CORRECT**

- `REWARDS_CSV_COLUMN_HEADER_ADDRESS = "recipient address"` -- matches the Flare rNat distribution tool spec at the GitHub URL on line 15. Verified via web fetch: the spec requires `"recipient address"` and `"amount wei"`.
- `REWARDS_CSV_COLUMN_HEADER_REWARD = "amount wei"` -- matches the spec.
- `DIFF_CSV_COLUMN_HEADER_OLD = "old"`, `DIFF_CSV_COLUMN_HEADER_NEW = "new"`, `DIFF_CSV_COLUMN_HEADER_DIFF = "diff"` -- these are internal to the diff calculator, no external spec to match. Names are descriptive and consistent with usage in `diffCalculator.ts:161`.

### 5. `VALID_ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/` (line 22)

**Verdict: CORRECT**

The regex anchors (`^`, `$`) prevent partial matches. It requires:
- Literal `0x` prefix (lowercase only)
- Exactly 40 hex characters (`[0-9a-fA-F]{40}`)
- No trailing content

Edge cases verified by execution:
- Valid lowercase/uppercase/mixed addresses: accepted
- `0X` (uppercase X) prefix: rejected -- correct, Ethereum canonical form uses lowercase `0x`
- 39 hex chars: rejected
- 41 hex chars: rejected
- Trailing newline: rejected
- Leading space: rejected
- Non-hex chars (`G`): rejected
- Empty string: rejected
- No `g` flag, so no `lastIndex` statefulness

The test file covers all these categories except `0X` prefix and trailing whitespace, but those are correctly handled by the anchored regex.

### 6. `validateAddress(value, field)` (lines 25-27)

**Verdict: CORRECT**

The function tests `value` against `VALID_ADDRESS_REGEX` and throws `Error` with message `Invalid ${field}: "${value}" is not a valid address` on mismatch. The JSDoc says "Validate that a string is a valid Ethereum address (0x + 40 hex chars)" which accurately describes the behavior.

The function is called in `scraper.ts` (lines 97-99, 118-120, 138), `config.ts` (lines 63-64), and `pipeline.ts` (lines 117-118). All call sites pass a descriptive `field` string.

### 7. `BOUNTY_PERCENT = 10n` (line 30)

**Verdict: CORRECT**

The JSDoc says "Percentage of a cheater's penalty paid to the reporter as a bounty (10%)". In `processor.ts:357`: `const bounty = (penalty * BOUNTY_PERCENT) / 100n` -- this computes `penalty * 10 / 100 = penalty * 0.10 = 10%`. The name, doc, and usage are all consistent.

### 8. `RETRY_BASE_DELAY_MS = 500` (line 33)

**Verdict: CORRECT**

The JSDoc says "Base delay in ms for exponential backoff on RPC retries". In `processor.ts:130`: `const delay = Math.pow(2, attempt) * RETRY_BASE_DELAY_MS` -- exponential backoff with base 500ms. Name, doc, and usage match.

### 9. File path constants (lines 36-51)

**Verdict: CORRECT**

- `DATA_DIR = "data"` -- matches the `data/` directory in the repo.
- `OUTPUT_DIR = "output"` -- matches the `output/` directory in the repo.
- `TRANSFERS_FILE_BASE = "transfers"` -- scraper writes `transfers1.dat`, `transfers2.dat`, etc. via `${DATA_DIR}/${TRANSFERS_FILE_BASE}${i + 1}.dat`.
- `LIQUIDITY_FILE = "liquidity.dat"` -- matches `data/liquidity.dat`.
- `POOLS_FILE = "pools.dat"` -- matches `data/pools.dat`.
- `BLOCKLIST_FILE = "blocklist.txt"` -- matches `data/blocklist.txt`.

All JSDoc descriptions accurately describe each file's purpose.

### 10. `TRANSFER_CHUNK_SIZE = 270000` (line 54)

**Verdict: CORRECT**

The JSDoc says "Max lines per transfer data file to stay under GitHub's 100MB file size limit". Used in `scraper.ts:217` for `Math.ceil(transfers.length / TRANSFER_CHUNK_SIZE)` and `scraper.ts:221` for slicing. The value 270,000 is reasonable: each JSONL line is roughly 200-400 bytes, so 270K lines would be approximately 54-108MB, close to the 100MB limit.

### 11. `TRANSFER_FILE_COUNT = 10` (line 57)

**Verdict: CORRECT but see CONST-P5-01**

The JSDoc says "Max number of transfer data files to read". Used in `index.ts:47` as the loop bound. The value 10 gives a theoretical capacity of 2,700,000 transfer lines. The decoupling from the scraper's dynamic file count was already raised in Pass 4 (CONST-P4-02).

---

## Test Assertions vs. Documented Behavior

### Tests that exist and are correct

| Test | Asserts | Matches Intent? |
|------|---------|-----------------|
| `ONE_18 is exactly 1e18` | `ONE_18 === 10n ** 18n` | Yes -- the expression is the definition itself, so this is tautological but still catches accidental edits |
| `REWARD_POOL is exactly 500_000 tokens in wei` | `REWARD_POOL === 500_000n * 10n ** 18n` | Yes -- uses derivation expression, matches the "500,000 tokens (18 decimals)" comment |
| Regex valid addresses | two valid addresses pass | Yes |
| Regex no 0x prefix | bare hex fails | Yes |
| Regex wrong length | short (4 hex) and long (42 hex) fail | Yes |
| Regex non-hex | `G` characters fail | Yes |
| Regex empty string | empty fails | Yes |

### Symbols with no direct test coverage

| Symbol | Risk | Notes |
|--------|------|-------|
| `DEC25_REWARD_POOL` | LOW | Used as bound in output tests but value never asserted. Already raised as CONST-P2-02. |
| `validateAddress` | LOW | The regex it wraps is tested, but the function's throw behavior, error message format, and happy path are not directly tested. Already raised as CONST-P2-01. |
| `BOUNTY_PERCENT` | LOW | No test asserts its value. Already raised as CONST-P2-03. |
| `RETRY_BASE_DELAY_MS` | INFO | Operational constant, low risk if wrong. |
| `TRANSFER_CHUNK_SIZE` | INFO | Operational constant. |
| `TRANSFER_FILE_COUNT` | INFO | Operational constant. |
| All CSV headers | INFO | Used in test assertions indirectly (imported and used in expected strings). |
| All file path constants | INFO | Used transitively in integration tests via the full pipeline. |

---

## Findings

### CONST-P5-01 -- `VALID_ADDRESS_REGEX` rejects uppercase `0X` prefix but this is undocumented

**Severity:** INFO
**Lines:** 22

The regex `/^0x[0-9a-fA-F]{40}$/` requires a lowercase `0x` prefix. An address like `0X1234...abcd` will be rejected. This is correct behavior -- the Ethereum JSON-RPC spec and EIP-55 both use lowercase `0x`, and Goldsky subgraph data uses lowercase `0x`. However, neither the regex's implicit behavior nor the `validateAddress` JSDoc mentions this restriction. The test suite also does not include a case for `0X` prefix.

This is purely informational. The behavior is correct; only the documentation and test coverage could be improved.

### CONST-P5-02 -- `REWARD_POOL` and `DEC25_REWARD_POOL` are hardcoded literals instead of derivation expressions

**Severity:** LOW
**Lines:** 10, 12

Already raised in Pass 1 (INFO-01), Pass 3 (CONST-P3-01), and Pass 4 (CONST-P4-01). Re-confirmed in this pass with independent numeric verification:

- `500_000_000_000_000_000_000_000n === 500_000n * 10n ** 18n` -- verified true
- `1_000_000_000_000_000_000_000_000n === 1_000_000n * 10n ** 18n` -- verified true

Both values are numerically correct. The concern is solely readability and adherence to the project's own rule in `CLAUDE.md`: "Include derivation logic in source for derived values."

### CONST-P5-03 -- `DEC25_REWARD_POOL` has no direct value assertion test

**Severity:** LOW
**Lines:** 12

Already raised in Pass 2 (CONST-P2-02). The value `1_000_000_000_000_000_000_000_000n` (1M tokens * 1e18) is used in `diffCalculatorOutput.test.ts` as a ceiling (`<=`) but never directly asserted to equal `1_000_000n * 10n ** 18n`. An off-by-one-digit typo could go undetected if it only made the pool larger (ceiling tests would still pass). `REWARD_POOL` has a direct assertion test on `constants.test.ts:10`; `DEC25_REWARD_POOL` does not.

### CONST-P5-04 -- `validateAddress` function has no direct test coverage

**Severity:** LOW
**Lines:** 25-27

Already raised in Pass 2 (CONST-P2-01). The `VALID_ADDRESS_REGEX` is thoroughly tested, but `validateAddress` wraps it with throw behavior and a specific error message format (`Invalid ${field}: "${value}" is not a valid address`). Neither the throw on invalid input, the no-throw on valid input, nor the error message content are tested. This means:

1. If someone changes the function to return a boolean instead of throwing, no test would catch the regression.
2. If the error message format changes, consumers that pattern-match on it would break silently.

The function is called in 3 files (scraper.ts, config.ts, pipeline.ts) at 7 call sites, making it a key validation primitive.

### CONST-P5-05 -- `BOUNTY_PERCENT` has no direct test coverage

**Severity:** LOW
**Lines:** 30

Already raised in Pass 2 (CONST-P2-03). `BOUNTY_PERCENT = 10n` controls 10% of penalty redistribution. No test asserts its value. A typo changing it to `1n` (1%) or `100n` (100%) would silently alter reward distributions. The only guard is code review.

---

## Summary

| ID | Severity | Lines | Description |
|----|----------|-------|-------------|
| CONST-P5-01 | INFO | 22 | `0X` prefix rejection is undocumented and untested |
| CONST-P5-02 | LOW | 10, 12 | Reward pool constants use opaque literals instead of derivation expressions |
| CONST-P5-03 | LOW | 12 | `DEC25_REWARD_POOL` lacks a direct value assertion test |
| CONST-P5-04 | LOW | 25-27 | `validateAddress` function has no direct test coverage |
| CONST-P5-05 | LOW | 30 | `BOUNTY_PERCENT` has no direct test coverage |

No CRITICAL or HIGH findings. All constant values have been independently verified as numerically correct. The regex correctly validates Ethereum addresses. CSV headers match the external Flare rNat distribution tool spec. All findings are test coverage gaps and readability concerns.
