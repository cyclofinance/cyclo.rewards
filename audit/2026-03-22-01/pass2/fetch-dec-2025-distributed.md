# Pass 2: Test Coverage Review — `scripts/fetch-dec-2025-distributed.sh`

**Auditor:** A10
**Date:** 2026-03-22
**File:** `scripts/fetch-dec-2025-distributed.sh` (61 lines)

## Evidence of Reading

### Script structure (re-verified from Pass 1)
- Lines 1-2: shebang + `set -euo pipefail`
- Line 9: `RPC_URL` env var requirement
- Line 10: `OUTPUT="output/dec-2025-distributed.csv"` relative path
- Lines 13-14: Two hardcoded transaction hashes (TX1, TX2)
- Lines 16-50: `decode_tx()` function — calls `cast tx`, does bash substring ABI decoding, uses `python3` for hex-to-decimal, emits CSV rows
- Lines 52-60: Main body — writes header, calls `decode_tx` for each TX, appends to output, reports line count to stderr

### Test files examined
- `src/diffCalculatorOutput.test.ts` (lines 178-206): `describe('on-chain distribution verification')` reads `./output/dec-2025-distributed.csv` and validates:
  - Line count equals `DISTRIBUTED_COUNT` (100)
  - On-chain addresses match first 100 entries of old rewards CSV
  - On-chain amounts match first 100 entries of old rewards CSV
  - On-chain addresses do not overlap with covered CSV
- `src/diffCalculator.test.ts`: Tests the `calculateDiff` function with unit-level inputs; does not test the shell script or its output.

### CI workflows examined
- `.github/workflows/git-clean.yaml` (line 31): Runs the script with `RPC_URL` from secrets. Output is committed and verified via `git diff --exit-code --cached` (line 41). This serves as an integration test: if the script produces different output than what is committed, CI fails.
- `.github/workflows/test.yaml`: Runs `npm run test` but does **not** run the fetch script. Tests read the committed CSV file from `output/dec-2025-distributed.csv`.

### Output file examined
- `output/dec-2025-distributed.csv`: 101 lines (1 header + 100 data rows). Header: `recipient address,amount wei`. Each row: lowercase address, integer amount in wei.

---

## Coverage Analysis

### What IS covered

| Aspect | Coverage mechanism |
|---|---|
| Output row count (100 recipients) | `diffCalculatorOutput.test.ts` line 184: asserts `onchain.length === DISTRIBUTED_COUNT` |
| Output addresses match expected rewards | `diffCalculatorOutput.test.ts` lines 187-191: compares against old rewards CSV |
| Output amounts match expected rewards | `diffCalculatorOutput.test.ts` lines 194-198: compares each amount against old rewards CSV |
| No overlap with covered addresses | `diffCalculatorOutput.test.ts` lines 201-206 |
| Deterministic output (no regressions) | `git-clean.yaml` line 41: `git diff --exit-code --cached` ensures committed CSV is reproducible |
| Script runs without error in CI | `git-clean.yaml` line 31: script is executed every push |

### What is NOT covered

| Gap | Severity | Details |
|---|---|---|
| No unit tests for ABI decoding logic | LOW | The `decode_tx()` function does manual ABI decoding via bash substring arithmetic. There are no tests that verify the decoding logic against known calldata. The output is only validated indirectly by comparing against the old rewards CSV. |
| No test for CSV header format | LOW | Tests use `parseCsv()` which strips the header with `lines.slice(1)`. The actual header content `"recipient address,amount wei"` is never asserted. If the header changes, downstream consumers could break without test detection. |
| No test for address casing/format | LOW | The script produces lowercase addresses (line 41: `0x${data:...}`). The test `parseCsv()` calls `.toLowerCase()` on addresses, masking any casing issues. If the script started producing mixed-case or checksummed addresses, the tests would not detect the change (though `git diff` would). |
| Error path: missing `cast` binary | INFO | If `cast` is not available in the environment, the script fails at line 18. No test verifies this produces a useful error message. Mitigated by `set -e` and nix environment. |
| Error path: missing `python3` binary | INFO | If `python3` is not available, the script fails at line 46. Same mitigation as above. |
| Error path: RPC failure mid-decode | INFO | If TX1 succeeds but TX2 fails (RPC timeout, rate limit), the output file will contain a header + TX1 rows but no TX2 rows. `set -e` will abort the script, but the partial output file remains on disk. The test would catch this via row count mismatch, but only if tests run after the failed script. |

---

## Findings

### A10-PASS2-1 — LOW — No unit test for ABI decoding logic

**Location:** `scripts/fetch-dec-2025-distributed.sh` lines 16-50

**Issue:** The `decode_tx()` function implements manual ABI decoding using bash substring arithmetic (fixed offsets at 256, 192, 320, etc.). This is the most complex and error-prone part of the script, yet it has no dedicated unit test. Coverage is entirely indirect: the output CSV is compared against another CSV (old rewards) that was independently computed by TypeScript code.

If both the script and the TypeScript processor had a matching bug in their ABI interpretation, the tests would not detect it. While this is unlikely for the specific hardcoded transactions, the lack of a direct test for the decoding logic means any future modification to `decode_tx()` would have no safety net beyond the `git diff` check.

**Proposed test approach:** A test could provide known calldata (hex string) and verify that `decode_tx` produces the expected address/amount pairs. This could be a bats test or a simple bash script that stubs `cast tx` with pre-recorded output and asserts on the decoded CSV.

### A10-PASS2-2 — LOW — CSV header content is never asserted

**Location:** `scripts/fetch-dec-2025-distributed.sh` line 52; `src/diffCalculatorOutput.test.ts` line 179

**Issue:** The script writes `"recipient address,amount wei"` as the CSV header (line 52). The test suite's `parseCsv()` function silently skips the header line with `lines.slice(1)`, so the actual header content is never validated. If the header were changed or corrupted, tests would still pass, but downstream consumers that depend on the header (e.g., on-chain distribution tools, manual review) could break.

### A10-PASS2-3 — LOW — `parseCsv` toLowerCase masks address format regressions

**Location:** `src/diffCalculatorOutput.test.ts` line 11

**Issue:** The `parseCsv()` helper normalizes all addresses to lowercase before comparison: `address: address.toLowerCase()`. This means the test cannot detect if the script starts producing addresses in a different format (e.g., EIP-55 checksummed, uppercase, or missing `0x` prefix). The `git diff --exit-code` check in CI would catch such a change, but the test suite itself would not.

### A10-PASS2-4 — INFO — Partial output file on mid-script failure

**Location:** `scripts/fetch-dec-2025-distributed.sh` lines 52-58

**Issue:** Line 52 truncates and writes the header with `>`. Lines 55 and 58 append with `>>`. If the script fails after TX1 but before TX2 completes (e.g., RPC timeout on second call), the output file will contain a header + TX1 rows only. Since `set -e` aborts the script, the partial file remains on disk. In CI, the subsequent `npm run test` would detect the row count mismatch (expected 100, got ~50). For local usage, the partial file could be mistaken for valid output.

This is mitigated by the deterministic CI check (`git diff --exit-code`) and the row count assertion in tests.
