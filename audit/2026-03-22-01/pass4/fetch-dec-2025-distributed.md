# Pass 4: Code Quality Review — `scripts/fetch-dec-2025-distributed.sh`

**Auditor:** A10
**Date:** 2026-03-22
**File:** `scripts/fetch-dec-2025-distributed.sh` (61 lines)

---

## Evidence of Reading

### Shell Configuration (lines 1-2)
- **Line 1:** `#!/usr/bin/env bash` — portable shebang
- **Line 2:** `set -euo pipefail` — strict mode (exit-on-error, undefined-var-error, pipefail)

### Header Comment (lines 4-7)
- **Lines 4-5:** Purpose statement: "Fetches the two on-chain December 2025 distribution transactions and outputs recipient addresses and amounts as CSV."
- **Line 7:** Usage example: `RPC_URL=https://... nix develop -c bash scripts/fetch-dec-2025-distributed.sh`

### Variables (lines 9-14)
- **Line 9:** `: "${RPC_URL:?RPC_URL environment variable must be set}"` — env var validation with custom error message
- **Line 10:** `OUTPUT="output/dec-2025-distributed.csv"` — relative output path
- **Line 12:** Comment documenting block numbers `(block 54051127, 54051138)`
- **Line 13:** `TX1="0x1e2ee309..."` — first distribution tx hash (64 hex chars)
- **Line 14:** `TX2="0x74770c94..."` — second distribution tx hash (64 hex chars)

### Function `decode_tx()` (lines 16-50)
- **Lines 17-18:** `local input; input=$(cast tx "$1" --rpc-url "$RPC_URL" input)` — fetches full calldata
- **Line 21:** `local data="${input:10}"` — strips `0x` prefix (2 chars) + 4-byte selector (8 chars) = 10 chars
- **Lines 23-25:** Block comment: ABI layout description (`word0=param1, word1=param2, word2=offset_addrs, word3=offset_amounts`)
- **Line 28:** `local addr_count_hex="${data:256:64}"` — word4 (256 hex chars in = 128 bytes offset), 64 hex chars = 1 word
- **Line 29:** `local addr_count=$((16#${addr_count_hex}))` — hex-to-decimal via bash arithmetic
- **Line 32:** `local amount_offset_hex="${data:192:64}"` — word3 (192 hex chars in = 96 bytes offset)
- **Line 33:** `local amount_offset=$(( 16#${amount_offset_hex} * 2 ))` — byte offset to hex-char offset
- **Line 36:** `local amount_start=$(( amount_offset + 64 ))` — skip the length word
- **Line 38:** `for i in $(seq 0 $((addr_count - 1))); do` — loop over all entries
- **Line 40:** `local addr_offset=$(( 320 + i * 64 ))` — word5+i (320 = 5 * 64)
- **Line 41:** `local addr="0x${data:$((addr_offset + 24)):40}"` — skip 12 bytes zero-padding (24 hex chars), take 20-byte address (40 hex chars)
- **Line 44:** `local amt_offset=$(( amount_start + i * 64 ))` — offset for amount i
- **Line 45:** `local amt_hex="${data:$amt_offset:64}"` — extract 32-byte amount word
- **Line 46:** `local amt=$(python3 -c "print(int('$amt_hex', 16))")` — hex-to-decimal via python3 (required because amounts overflow bash 64-bit arithmetic)
- **Line 48:** `echo "${addr},${amt}"` — emit CSV row to stdout

### Main Body (lines 52-60)
- **Line 52:** `echo "recipient address,amount wei" > "$OUTPUT"` — write CSV header (truncates file)
- **Line 54:** `echo "Fetching tx1: $TX1" >&2` — progress to stderr
- **Line 55:** `decode_tx "$TX1" >> "$OUTPUT"` — append TX1 decoded rows
- **Line 57:** `echo "Fetching tx2: $TX2" >&2` — progress to stderr
- **Line 58:** `decode_tx "$TX2" >> "$OUTPUT"` — append TX2 decoded rows
- **Line 60:** `echo "Wrote $(wc -l < "$OUTPUT" | tr -d ' ') lines (including header) to $OUTPUT" >&2` — summary line count to stderr

### Pipelines and External Dependencies
- `cast tx "$1" --rpc-url "$RPC_URL" input` — foundry `cast` CLI, fetches tx calldata
- `python3 -c "print(int('$amt_hex', 16))"` — Python3, hex-to-decimal for 256-bit values
- `seq 0 $((addr_count - 1))` — POSIX seq for loop iteration
- `wc -l < "$OUTPUT" | tr -d ' '` — line count with whitespace strip (macOS `wc` pads with spaces)

---

## Findings

### A10-PASS4-1 — MEDIUM — `python3` invoked per-iteration inside loop (N external process spawns)

**Location:** Line 46, inside `for` loop (line 38)

**Issue:** The `decode_tx()` function spawns a new `python3` process for every array element to convert a single hex value to decimal:

```bash
for i in $(seq 0 $((addr_count - 1))); do
    ...
    local amt=$(python3 -c "print(int('$amt_hex', 16))")
    ...
done
```

For each transaction with ~50 recipients, this spawns ~50 python3 processes (100 total for both transactions). Each `python3` invocation has startup overhead (interpreter initialization, module loading). This is the dominant cost of the script after the two RPC calls.

A single python3 (or `bc`) invocation could convert all amounts in batch. Alternatively, all amounts could be collected and converted in one pass after the loop.

This is also the same code path flagged in Pass 1 (A10-PASS1-1) for injection risk. A batch approach would simultaneously eliminate the injection vector and the per-iteration process spawn.

**Severity: MEDIUM** — Unnecessary complexity and performance cost. The per-iteration external process spawn pattern is avoidable and makes the script ~50x slower than it needs to be for the hex conversion step.

### A10-PASS4-2 — LOW — Magic numbers in ABI offset arithmetic

**Location:** Lines 28, 32, 36, 40, 41, 44, 45

**Issue:** The function contains numerous hardcoded numeric constants for ABI decoding offsets:

| Constant | Line | Meaning |
|----------|------|---------|
| `10` | 21 | `0x` (2) + selector (8) |
| `256` | 28 | word4 offset in hex chars (4 * 64) |
| `64` | 28, 36, 40, 44, 45 | one ABI word in hex chars (32 bytes * 2) |
| `192` | 32 | word3 offset in hex chars (3 * 64) |
| `320` | 40 | word5 offset in hex chars (5 * 64) |
| `24` | 41 | address zero-padding in hex chars (12 bytes * 2) |
| `40` | 41 | address length in hex chars (20 bytes * 2) |

These numbers are used inline without being named. While the inline comments partially explain each, the relationship between them is not self-documenting. For example, `320` is `5 * 64` (word 5), but a reader must mentally verify this. Similarly, `256` is `4 * 64` (word 4), and `192` is `3 * 64` (word 3).

Named constants at the top of the function (e.g., `WORD_SIZE=64`, `ADDR_ARRAY_WORD=4`, `AMT_OFFSET_WORD=3`, `ADDR_PAD=24`, `ADDR_LEN=40`) would make the arithmetic self-verifying and reduce the chance of a copy-paste offset error.

### A10-PASS4-3 — LOW — Duplicated decode-and-append pattern for TX1 and TX2

**Location:** Lines 54-58

**Issue:** The main body repeats the same pattern for TX1 and TX2:

```bash
echo "Fetching tx1: $TX1" >&2
decode_tx "$TX1" >> "$OUTPUT"

echo "Fetching tx2: $TX2" >&2
decode_tx "$TX2" >> "$OUTPUT"
```

This is a two-element unrolled loop. If a third distribution transaction were added, a developer would need to copy-paste and update the variable name and label. A loop over an array would be more maintainable:

```bash
TX_HASHES=("$TX1" "$TX2")
for tx in "${TX_HASHES[@]}"; do
    echo "Fetching: $tx" >&2
    decode_tx "$tx" >> "$OUTPUT"
done
```

With only two transactions this is a minor style point, but the current pattern violates DRY and would not scale cleanly to more transactions.

### A10-PASS4-4 — LOW — `local` declaration inside loop body

**Location:** Lines 40-46 (inside `for` loop, lines 38-49)

**Issue:** Five `local` declarations appear inside the `for` loop body:

```bash
local addr_offset=$(( 320 + i * 64 ))
local addr="0x${data:$((addr_offset + 24)):40}"
local amt_offset=$(( amount_start + i * 64 ))
local amt_hex="${data:$amt_offset:64}"
local amt=$(python3 -c "print(int('$amt_hex', 16))")
```

In bash, `local` creates a function-scoped variable, not a block-scoped one. Declaring variables as `local` inside a loop does not create new scope per iteration -- it re-declares the same function-local variable each time. This is functionally harmless but misleading: a reader from a block-scoped language (C, JavaScript `let`) might assume each iteration has its own variable scope. In bash, the `local` declarations could be hoisted before the loop or the variables could simply be assigned without `local` on subsequent iterations.

This is a minor style inconsistency but worth noting as it can confuse readers unfamiliar with bash scoping.

### A10-PASS4-5 — LOW — Inconsistent variable naming: `addr_count_hex` vs `amount_offset_hex`

**Location:** Lines 28-29 vs 32-33

**Issue:** The script uses two hex-value variables with slightly inconsistent naming:

- `addr_count_hex` / `addr_count` (lines 28-29) — "addr" prefix, "count" descriptor
- `amount_offset_hex` / `amount_offset` (lines 32-33) — "amount" prefix, "offset" descriptor

The naming convention is not strictly inconsistent (the descriptors differ because the values represent different things), but the abbreviated `addr` vs full `amount` is a minor style inconsistency. The rest of the script uses `addr` (lines 40, 41), so `amt` would be the natural abbreviation for consistency (and indeed `amt_offset`, `amt_hex`, and `amt` are used in lines 44-46). Renaming `amount_offset_hex` to `amt_offset_hex` and `amount_offset` to `amt_offset_raw` (or similar) would align with the abbreviation pattern used in the loop body.

### A10-PASS4-6 — INFO — `seq` usage could be replaced with bash C-style for loop

**Location:** Line 38

```bash
for i in $(seq 0 $((addr_count - 1))); do
```

**Issue:** `seq` spawns an external process. Bash supports C-style for loops natively:

```bash
for (( i = 0; i < addr_count; i++ )); do
```

This is a minor style preference. The C-style loop avoids an external process spawn and is arguably more readable for readers familiar with C/JavaScript. Given that the script already uses bash-specific features (`local`, `$((...))`, `${var:offset:length}`), portability to non-bash shells is not a concern.

### A10-PASS4-7 — INFO — Positive: clean separation of concerns

The script has a clear structure: configuration at the top (env var, output path, tx hashes), a single function for the core logic (`decode_tx`), and a minimal main body that composes the function calls. The function outputs to stdout, allowing the caller to redirect as needed. Progress messages go to stderr, keeping stdout clean for data. This is well-structured for a bash script.

### A10-PASS4-8 — INFO — Positive: `set -euo pipefail` and env var validation

Line 2's strict mode and line 9's `RPC_URL` validation are good defensive practices. The `: "${RPC_URL:?...}"` idiom provides a clear error message on missing configuration, which is better than a cryptic failure deep in the script.

---

## Summary

| ID | Severity | Title |
|----|----------|-------|
| A10-PASS4-1 | MEDIUM | `python3` invoked per-iteration inside loop |
| A10-PASS4-2 | LOW | Magic numbers in ABI offset arithmetic |
| A10-PASS4-3 | LOW | Duplicated decode-and-append pattern for TX1/TX2 |
| A10-PASS4-4 | LOW | `local` declaration inside loop body |
| A10-PASS4-5 | LOW | Inconsistent variable naming (`addr` vs `amount`) |
| A10-PASS4-6 | INFO | `seq` could be replaced with C-style for loop |
| A10-PASS4-7 | INFO | Positive: clean separation of concerns |
| A10-PASS4-8 | INFO | Positive: strict mode and env var validation |

**Total findings:** 8 (0 CRITICAL, 0 HIGH, 1 MEDIUM, 4 LOW, 3 INFO)
