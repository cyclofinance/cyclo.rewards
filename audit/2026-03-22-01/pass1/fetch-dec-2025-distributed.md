# Pass 1: Security Review — `scripts/fetch-dec-2025-distributed.sh`

**Auditor:** A10
**Date:** 2026-03-22
**File:** `scripts/fetch-dec-2025-distributed.sh` (61 lines)

## Evidence of Reading

### Shell Configuration
- **Line 1:** `#!/usr/bin/env bash` — portable shebang
- **Line 2:** `set -euo pipefail` — strict mode: exit on error (`-e`), undefined variable error (`-u`), pipe failure propagation (`pipefail`)

### Variables
- **Line 9:** `RPC_URL` — required env var, validated with `: "${RPC_URL:?...}"`
- **Line 10:** `OUTPUT="output/dec-2025-distributed.csv"` — hardcoded relative output path
- **Line 13:** `TX1="0x1e2ee309ee621fc00f6143f2e317e2d07c2993f456b2b2ba3724f8d9c70e2803"` — hardcoded tx hash
- **Line 14:** `TX2="0x74770c948c83b4d5c52530b2ec26dd56a772635c1b4afe60aa3e4d10999b443f"` — hardcoded tx hash

### Function `decode_tx()` (lines 16-50)
- **Line 17-18:** `local input; input=$(cast tx "$1" --rpc-url "$RPC_URL" input)` — external call to `cast tx`
- **Line 21:** `local data="${input:10}"` — strip `0x` + 4-byte selector via bash substring
- **Line 28:** `local addr_count_hex="${data:256:64}"` — extract address count from ABI-encoded data
- **Line 29:** `local addr_count=$((16#${addr_count_hex}))` — hex-to-decimal via arithmetic expansion
- **Line 32:** `local amount_offset_hex="${data:192:64}"` — extract amount offset
- **Line 33:** `local amount_offset=$(( 16#${amount_offset_hex} * 2 ))` — byte offset to hex-char offset
- **Line 36:** `local amount_start=$(( amount_offset + 64 ))` — skip length word
- **Line 38:** `for i in $(seq 0 $((addr_count - 1))); do` — iterate over entries
- **Line 40-41:** Address extraction via substring indexing
- **Line 44-45:** Amount hex extraction via substring indexing
- **Line 46:** `python3 -c "print(int('$amt_hex', 16))"` — hex-to-decimal via python3 string interpolation
- **Line 48:** `echo "${addr},${amt}"` — emit CSV row

### Main Body (lines 52-60)
- **Line 52:** `echo "recipient address,amount wei" > "$OUTPUT"` — write CSV header (truncate)
- **Lines 54-55:** Decode TX1, append to output
- **Lines 57-58:** Decode TX2, append to output
- **Line 60:** `wc -l < "$OUTPUT" | tr -d ' '` — count output lines, report to stderr

### CI Invocation (`git-clean.yaml` line 31-33)
- `nix develop -c bash scripts/fetch-dec-2025-distributed.sh` with `RPC_URL` from GitHub secret

---

## Findings

### A10-PASS1-1 — MEDIUM — Code injection via python3 string interpolation

**Location:** Line 46
```bash
local amt=$(python3 -c "print(int('$amt_hex', 16))")
```

**Issue:** The variable `$amt_hex` is interpolated directly into a python3 command string without sanitization. The value of `$amt_hex` is derived from on-chain transaction calldata fetched via `cast tx`. If a malicious or corrupted RPC endpoint returns crafted data (e.g., containing `', __import__('os').system('...'), '`), this becomes arbitrary code execution via python3.

**Mitigating factors:**
- `$amt_hex` is extracted via fixed-offset bash substring from the `cast tx` output. Under normal circumstances this will be hex digits only.
- The RPC URL comes from a GitHub secret in CI, reducing the attack surface to RPC compromise.
- `set -euo pipefail` is active, so some injection payloads that cause python3 syntax errors would abort the script rather than continue silently.

**Risk:** An attacker who controls or MITMs the RPC endpoint can achieve arbitrary code execution in the CI runner or developer machine. The attack requires compromising the RPC layer, which is a meaningful precondition.

**Severity: MEDIUM** — Code injection vector exists, but requires RPC compromise as a prerequisite.

### A10-PASS1-2 — LOW — Relative output path assumes working directory

**Location:** Line 10
```bash
OUTPUT="output/dec-2025-distributed.csv"
```

**Issue:** The output path is relative. If the script is executed from a directory other than the repository root, the file will be written to an unintended location. In CI this is controlled (checkout sets the working directory), but local developer usage could write to unexpected paths.

**Mitigating factors:**
- The usage comment on line 7 shows the intended invocation from the repo root.
- CI invocation via `git-clean.yaml` runs from the checkout directory.

**Severity: LOW** — Minor robustness issue; no security impact in the documented usage pattern.

### A10-PASS1-3 — LOW — No validation of `cast tx` output format

**Location:** Lines 18, 21, 28-29
```bash
input=$(cast tx "$1" --rpc-url "$RPC_URL" input)
local data="${input:10}"
local addr_count_hex="${data:256:64}"
local addr_count=$((16#${addr_count_hex}))
```

**Issue:** The script does not validate that `cast tx` returned valid hex data before performing substring operations and arithmetic expansion. If `cast` returns an error message, empty string, or truncated data:
- `${input:10}` could produce garbage or empty string
- `$((16#${addr_count_hex}))` with non-hex characters causes a bash arithmetic error (caught by `set -e`, but with an opaque error message)
- The `seq` loop could iterate an unexpected number of times if `addr_count` is abnormally large

**Mitigating factors:**
- `set -euo pipefail` means most failure modes will abort the script.
- The transaction hashes are hardcoded and immutable, so under normal RPC operation the data format is deterministic.

**Severity: LOW** — Defensive validation missing, but `set -e` provides a safety net.

### A10-PASS1-4 — INFO — No integrity verification of fetched data

**Location:** Lines 18, 55, 58

**Issue:** The script fetches transaction data from an RPC endpoint and trusts it completely. There is no checksum, hash verification, or cross-validation of the decoded data against known expected values (e.g., expected recipient count, expected total amount). Since the transaction hashes are immutable and the data is deterministic, a simple assertion (e.g., "expected 50 addresses in TX1") would detect RPC data corruption.

**Severity: INFO** — Defense-in-depth suggestion; the CI `git diff --exit-code` check partially compensates by detecting output changes.

### A10-PASS1-5 — INFO — `set -euo pipefail` is correctly configured

**Location:** Line 2

Positive finding: The script correctly enables strict mode. This is best practice and mitigates several classes of issues (silent failures, undefined variable use, broken pipe chains).
