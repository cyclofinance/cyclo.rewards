# Pass 3: Documentation Review — `scripts/fetch-dec-2025-distributed.sh`

**Auditor:** A10
**Date:** 2026-03-22
**File:** `scripts/fetch-dec-2025-distributed.sh` (61 lines)

## Evidence of Reading

### Shell Configuration (lines 1-2)
- **Line 1:** `#!/usr/bin/env bash` — shebang, no accompanying comment
- **Line 2:** `set -euo pipefail` — strict mode, no comment explaining what each flag does

### Script-level header comment (lines 4-7)
- **Line 4-5:** `# Fetches the two on-chain December 2025 distribution transactions` / `# and outputs recipient addresses and amounts as CSV.` — purpose statement
- **Line 7:** `# Usage: RPC_URL=https://... nix develop -c bash scripts/fetch-dec-2025-distributed.sh` — usage example

### Variables (lines 9-14)
- **Line 9:** `: "${RPC_URL:?RPC_URL environment variable must be set}"` — env var validation with error message, no comment
- **Line 10:** `OUTPUT="output/dec-2025-distributed.csv"` — output path, no comment
- **Line 12:** `# The two December 2025 distribution transactions (block 54051127, 54051138)` — comment documenting the block numbers for the two transactions
- **Line 13:** `TX1="0x1e2ee309..."` — first transaction hash
- **Line 14:** `TX2="0x74770c94..."` — second transaction hash

### Function `decode_tx()` (lines 16-50)
- **Line 16:** `decode_tx() {` — no function-level doc comment explaining parameters, return value, or the ABI layout being decoded
- **Line 18:** `input=$(cast tx "$1" --rpc-url "$RPC_URL" input)` — no comment explaining what `cast tx ... input` returns (the full calldata hex)
- **Line 20:** `# Strip 0x + 4-byte selector` — accurate inline comment
- **Line 21:** `local data="${input:10}"` — the substring offset 10 = 2 chars (`0x`) + 8 chars (4-byte selector). Comment is accurate.
- **Lines 23-25:** Three-line block comment explaining the ABI layout:
  ```
  # Layout: word0=param1, word1=param2, word2=offset_addrs, word3=offset_amounts
  # At offset_addrs: length (50), then 50 addresses
  # At offset_amounts: length (50), then 50 amounts
  ```
  - **Accuracy issue:** The comment says "50 addresses" and "50 amounts," but the code dynamically reads `addr_count` from the data rather than hardcoding 50. The actual count may or may not be 50. The comment should either say "N" or document the actual expected count.
  - **Accuracy issue:** The comment says `word0=param1, word1=param2` without explaining what param1 and param2 are. This is the ABI encoding of a function call; param1 and param2 are the first two non-dynamic parameters but their meaning (e.g., token address, distribution ID) is never documented.
- **Line 27:** `# Address array starts at word 4 (offset 0x80 = 128 bytes from data start)` — accurate, since 128 bytes = 256 hex chars, matching the substring offset on line 28
- **Line 28:** `local addr_count_hex="${data:256:64}"` — no inline comment (the block comment above covers intent)
- **Line 29:** `local addr_count=$((16#${addr_count_hex}))` — no comment; hex conversion idiom may be unfamiliar
- **Line 32:** `local amount_offset_hex="${data:192:64}"` — comment on line 23 says `word3=offset_amounts` but the inline comment `# Amount array offset is word 3` is on line 31. Accurate: word3 is at char offset 3*64=192.
- **Line 33:** `local amount_offset=$(( 16#${amount_offset_hex} * 2 ))` — inline comment `# convert bytes to hex chars` is accurate and helpful
- **Line 35:** `# Amount array: first word is length, then amounts` — accurate inline comment
- **Line 36:** `local amount_start=$(( amount_offset + 64 ))` — inline comment `# skip length word` is accurate
- **Line 38:** `for i in $(seq 0 $((addr_count - 1))); do` — no comment
- **Line 39:** `# Address: word 5+i, take last 40 hex chars` — accurate: addresses are left-padded to 32 bytes, last 20 bytes (40 hex chars) are the address
- **Line 40:** `local addr_offset=$(( 320 + i * 64 ))` — 320 = 5*64, consistent with "word 5+i" comment
- **Line 41:** `local addr="0x${data:$((addr_offset + 24)):40}"` — 24 chars padding skipped (12 bytes of zero padding). No explicit comment explaining the +24 offset, but the comment on line 39 says "take last 40 hex chars" which covers it implicitly.
- **Line 43:** `# Amount: convert from hex` — brief comment, accurate
- **Line 44-46:** Amount extraction and python3 conversion. No comment explaining why python3 is used instead of bash arithmetic (answer: bash arithmetic overflows on 256-bit values)

### Main body (lines 52-60)
- **Line 52:** `echo "recipient address,amount wei" > "$OUTPUT"` — no comment explaining this is the CSV header
- **Lines 54-55:** `echo "Fetching tx1: $TX1" >&2` then `decode_tx "$TX1" >> "$OUTPUT"` — progress message to stderr, output appended. No comment.
- **Lines 57-58:** Same for TX2.
- **Line 60:** `echo "Wrote $(wc -l < "$OUTPUT" | tr -d ' ') lines (including header) to $OUTPUT" >&2` — summary to stderr. Self-documenting.

---

## Documentation Inventory

| Element | Has comment? | Comment accurate? |
|---|---|---|
| Script purpose (header) | YES (lines 4-5) | YES |
| Usage example | YES (line 7) | YES |
| `set -euo pipefail` | NO | N/A |
| `RPC_URL` validation | NO (self-documenting error message) | N/A |
| `OUTPUT` variable | NO | N/A |
| TX hashes + block numbers | YES (line 12) | YES |
| `decode_tx()` function purpose | NO | N/A |
| ABI layout explanation | YES (lines 23-25) | PARTIALLY — hardcodes "50" and leaves param1/param2 unnamed |
| `0x` + selector strip | YES (line 20) | YES |
| Address array start | YES (line 27) | YES |
| Byte-to-hex-char conversion | YES (line 33) | YES |
| Skip length word | YES (line 36) | YES |
| Address extraction | YES (line 39) | YES |
| Amount extraction | YES (line 43) | YES, but terse |
| Why python3 for hex conversion | NO | N/A |
| CSV header write | NO | N/A |
| Main body flow | NO (self-documenting) | N/A |

---

## Findings

### A10-PASS3-1 — LOW — `decode_tx()` lacks a function-level doc comment

**Location:** Line 16

**Issue:** The `decode_tx()` function is the core logic of the script. It takes a transaction hash, fetches calldata via `cast tx`, manually decodes ABI-encoded dynamic arrays, and emits CSV rows. There is no function-level comment explaining:
- What the function does
- What parameter it expects (a transaction hash)
- What it outputs (CSV lines to stdout in `address,amount` format)
- What ABI function signature it is decoding
- What external tools it depends on (`cast`, `python3`)

The block comment on lines 23-25 partially covers the ABI layout, but a reader must piece together the function's contract from scattered inline comments.

### A10-PASS3-2 — LOW — ABI layout comment hardcodes "50" but code is dynamic

**Location:** Lines 24-25

```bash
# At offset_addrs: length (50), then 50 addresses
# At offset_amounts: length (50), then 50 amounts
```

**Issue:** The comment states the arrays contain 50 elements. However, the code reads `addr_count` dynamically from the data (line 29) and iterates based on that count (line 38). The "50" in the comment is the actual value for these specific transactions, but the comment reads as if 50 is structurally required rather than an observed value. This creates confusion: is the code correct in handling non-50 arrays, or is 50 an invariant that should be asserted?

If 50 is the expected invariant, it should be asserted in code (related to Pass 1 finding A10-PASS1-4). If it is just the observed value, the comment should say "length (N)" or "length (e.g., 50 for these transactions)."

### A10-PASS3-3 — LOW — No comment explaining why python3 is used for hex-to-decimal conversion

**Location:** Line 46

```bash
local amt=$(python3 -c "print(int('$amt_hex', 16))")
```

**Issue:** This line uses an external `python3` invocation inside a loop to convert hex to decimal. This is an unusual choice in a bash script when `$(( 16#... ))` is available (and is used elsewhere in the script on lines 29, 33). The reason `python3` is needed here is that the amounts are 256-bit values that overflow bash's 64-bit arithmetic. This is a critical design decision that is not documented. A reader unfamiliar with bash arithmetic limits would reasonably ask: "Why not use `$(( 16#${amt_hex} ))` like the other conversions?"

A one-line comment explaining the overflow constraint would prevent future maintainers from "simplifying" this line into a silently truncating bash arithmetic expression.

### A10-PASS3-4 — INFO — ABI layout comment does not name param1 and param2

**Location:** Line 23

```bash
# Layout: word0=param1, word1=param2, word2=offset_addrs, word3=offset_amounts
```

**Issue:** The comment describes the ABI layout but refers to the first two words as "param1" and "param2" without explaining what they represent. These are the non-dynamic parameters of the function being decoded. Naming them (e.g., the token address and a distribution ID, or whatever the actual function signature is) would help a reader understand the full calldata structure. Without this, a reader cannot independently verify that the script is decoding the correct function.

### A10-PASS3-5 — INFO — No comment on the `+24` offset in address extraction

**Location:** Line 41

```bash
local addr="0x${data:$((addr_offset + 24)):40}"
```

**Issue:** The `+24` skips the 12 zero-padding bytes (24 hex chars) that left-pad a 20-byte Ethereum address in a 32-byte ABI word. The comment on line 39 says "take last 40 hex chars" which covers the intent, but the mechanics of the `+24` are left implicit. A brief inline note like `# skip 12 bytes of zero-padding` would improve clarity.

### A10-PASS3-6 — INFO — Script header comment does not mention the function signature being decoded

**Location:** Lines 4-5

**Issue:** The header comment says the script "fetches the two on-chain December 2025 distribution transactions and outputs recipient addresses and amounts as CSV." It does not mention what contract or function these transactions call. Since the entire script is built around decoding a specific ABI-encoded function call, documenting the function signature (e.g., `disperseToken(address token, address[] recipients, uint256[] amounts)` or similar) in the header would make the script self-contained and auditable without needing to look up the transactions on a block explorer.

### A10-PASS3-7 — INFO — Positive: inline comments on ABI offset arithmetic are accurate and helpful

**Location:** Lines 20, 27, 33, 35-36, 39, 43

Positive finding: The script has good inline comments on the most error-prone lines — the ABI offset calculations. Comments like `# Strip 0x + 4-byte selector`, `# convert bytes to hex chars`, `# skip length word`, and `# take last 40 hex chars` are concise, accurate, and directly aid comprehension of the fixed-offset arithmetic. This is well above average for a bash script doing manual ABI decoding.
