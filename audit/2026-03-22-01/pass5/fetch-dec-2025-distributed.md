# Pass 5: Correctness / Intent Verification -- `scripts/fetch-dec-2025-distributed.sh`

**Auditor:** A10
**Date:** 2026-03-22
**File:** `scripts/fetch-dec-2025-distributed.sh` (61 lines)
**Scope:** Verify that every named item does what it claims. Focus on ABI decode correctness, offset arithmetic, address/amount extraction, and CSV output format.

---

## Evidence of Thorough Reading

### Shell setup (lines 1-2)
- Line 1: `#!/usr/bin/env bash` -- portable shebang.
- Line 2: `set -euo pipefail` -- strict mode. Verified: `-e` exits on error, `-u` errors on undefined vars, `-o pipefail` propagates pipe failures.

### Environment and constants (lines 9-14)
- Line 9: `: "${RPC_URL:?RPC_URL environment variable must be set}"` -- validated: bash parameter expansion with `:?` aborts with the message if RPC_URL is unset or empty.
- Line 10: `OUTPUT="output/dec-2025-distributed.csv"` -- relative path, 101 lines in committed output (1 header + 100 data rows = 50 per TX).
- Line 12: Comment says "block 54051127, 54051138" for the two transactions.
- Line 13: TX1 hash, 66 chars (0x + 64 hex). Verified: `0x1e2ee309ee621fc00f6143f2e317e2d07c2993f456b2b2ba3724f8d9c70e2803`.
- Line 14: TX2 hash, 66 chars. Verified: `0x74770c948c83b4d5c52530b2ec26dd56a772635c1b4afe60aa3e4d10999b443f`.

### `decode_tx()` function (lines 16-50) -- complete arithmetic trace

**Line 18:** `input=$(cast tx "$1" --rpc-url "$RPC_URL" input)` -- fetches full calldata as hex string starting with `0x`.

**Line 21:** `local data="${input:10}"` -- strips first 10 chars: `0x` (2 chars) + 4-byte function selector (8 chars) = 10. Result: ABI-encoded parameters only.

**Lines 23-25 (ABI layout comment):**
```
# Layout: word0=param1, word1=param2, word2=offset_addrs, word3=offset_amounts
# At offset_addrs: length (50), then 50 addresses
# At offset_amounts: length (50), then 50 amounts
```
This describes a 4-word head: 2 static parameters + 2 dynamic array offsets. This is NOT the standard 3-parameter `disperseToken(address token, address[] recipients, uint256[] values)` which has a 3-word head. The comment implies the function has 4 parameters.

**Line 28:** `local addr_count_hex="${data:256:64}"` -- reads 64 hex chars starting at offset 256.
- Verification: offset 256 hex chars = 128 bytes = word 4. For a 4-word head where word 2 = offset to addresses = 0x80 (128 bytes), the address array starts at byte 128. The first word of a dynamic array is its length. So `data[256:64]` reads the address array length. **Correct for 4-word head layout.**

**Line 29:** `local addr_count=$((16#${addr_count_hex}))` -- bash hex-to-decimal. For the expected value 50 (= 0x32), this fits in 64-bit integer. **Correct.**

**Line 32:** `local amount_offset_hex="${data:192:64}"` -- reads word 3.
- Verification: offset 192 hex chars = 96 bytes = word 3. For the 4-word head layout, word 3 contains the byte offset to the amounts array. **Correct for 4-word head layout.**

**Line 33:** `local amount_offset=$(( 16#${amount_offset_hex} * 2 ))` -- converts byte offset to hex-char offset.
- Verification: For 50 addresses, amount offset = 128 (head) + 32 (addr length) + 50*32 (addresses) = 1760 bytes = 0x6E0. Then `amount_offset = 0x6E0 * 2 = 3520` hex chars. The amount offset value fits in 64-bit integer. **Correct.**

**Line 36:** `local amount_start=$(( amount_offset + 64 ))` -- skips length word.
- Verification: `3520 + 64 = 3584`. This is the hex-char offset of amounts[0]. Cross-check: 128 (head) + 32 (addr length) + 50*32 (addresses) + 32 (amt length) = 1792 bytes = 3584 hex chars. **Correct.**

**Line 38:** `for i in $(seq 0 $((addr_count - 1))); do` -- iterates 0..49 inclusive = 50 iterations. **Correct.**

**Line 40:** `local addr_offset=$(( 320 + i * 64 ))` -- word (5+i).
- Verification: 320 hex chars = 160 bytes = word 5. For a 4-word head, the address array data starts at word 5 (head=4 words + length=1 word). For i=0: offset=320. For i=49: offset=320+49*64=3456. Last address ends at 3456+64=3520, which is exactly `amount_offset`. **Correct.**

**Line 41:** `local addr="0x${data:$((addr_offset + 24)):40}"` -- skip zero-padding, take address.
- Verification: ABI addresses are left-padded to 32 bytes: 12 bytes zeros + 20 bytes address. In hex: 24 chars zeros + 40 chars address. `addr_offset + 24` skips padding, `:40` takes the address. Total consumed: 24 + 40 = 64 = one full word. **Correct.**

**Line 44:** `local amt_offset=$(( amount_start + i * 64 ))` -- offset for amount[i].
- Verification: amounts are 32-byte words. amount[0] starts at `amount_start`, amount[i] at `amount_start + i*64`. **Correct.**

**Line 45:** `local amt_hex="${data:$amt_offset:64}"` -- extract 32-byte amount word.
- Verification: takes exactly one 64-char word. **Correct.**

**Line 46:** `local amt=$(python3 -c "print(int('$amt_hex', 16))")` -- hex to decimal via python3.
- Verification: python3 handles arbitrary-precision integers. Amounts like `161832447748875935013721` exceed 2^64 (= 18446744073709551616), so bash `$((16#...))` would overflow. python3 is required. **Correct approach.**

**Line 48:** `echo "${addr},${amt}"` -- CSV row.
- Format: `0x<40 hex chars>,<decimal integer>`. Matches output file format. **Correct.**

### Main body (lines 52-60)

**Line 52:** `echo "recipient address,amount wei" > "$OUTPUT"` -- writes header, truncates file. The `>` ensures a clean file. **Correct.**

**Lines 54-55:** Fetch and decode TX1, append to output. `>>` appends. **Correct.**

**Lines 57-58:** Same for TX2. **Correct.**

**Line 60:** Reports line count to stderr. **Correct.**

### Output verification

The committed output has 101 lines (1 header + 100 data rows). With 50 recipients per TX and 2 TXs, this is 100 data rows. Consistent.

Spot-checked first row: `0x103ca065db4ed55afc29724fa2fdaddc71a0fc0f,161832447748875935013721`. Address is 42 chars (0x + 40 hex), lowercase. Amount is a decimal integer. Format is correct.

---

## Findings

### P5-FETCH-01: Undocumented function signature makes 4-word head layout unverifiable [MEDIUM]

**File:** `scripts/fetch-dec-2025-distributed.sh`, lines 23-25

**Claim:** The ABI layout comment says `word0=param1, word1=param2, word2=offset_addrs, word3=offset_amounts`, implying a function with 4 head-level parameters (2 static + 2 dynamic arrays).

**Correctness issue:** The well-known Disperse.app `disperseToken(address token, address[] recipients, uint256[] values)` has only 3 parameters and a 3-word head. The script's 4-word head assumption would be **incorrect** for the standard Disperse.app contract, since:
- Standard layout: word 0 = token, word 1 = offset to recipients, word 2 = offset to values (3-word head)
- Script layout: word 0 = param1, word 1 = param2, word 2 = offset to addresses, word 3 = offset to amounts (4-word head)

If this were the standard 3-param disperseToken, the script would read `data[256:64]` (word 4) for the address count -- which would actually be `recipients[0]`, not the length. And `data[192:64]` (word 3) for the amount offset -- which would actually be `recipients.length`.

Since the output is validated by CI (deterministic output check) and by `diffCalculatorOutput.test.ts` (matching against old rewards CSV), the 4-word layout must be correct for these transactions. This means the contract uses a **non-standard** function with 4 parameters (e.g., `disperseToken(address token, address param2, address[] recipients, uint256[] amounts)` or similar).

The function selector (first 4 bytes of calldata, stripped on line 21) is never documented. Without knowing the function signature, a reader cannot independently verify that the ABI layout comment is correct, that the offset arithmetic targets the right words, or that the contract was called with the expected function.

**Impact:** A correctness reviewer cannot fully verify the decoding logic without looking up the transaction calldata on a block explorer and reverse-engineering the function signature. The script claims to decode "distribution transactions" but never documents which function it is decoding.

**Previously noted:** Pass 3 (A10-PASS3-6) flagged the missing function signature as INFO. Elevating to MEDIUM in this correctness pass because it is the single fact required to verify all offset arithmetic.

---

### P5-FETCH-02: No validation that address and amount arrays have equal length [LOW]

**File:** `scripts/fetch-dec-2025-distributed.sh`, lines 28-29, 38

**Claim:** The loop iterates `addr_count` times and extracts both an address and an amount for each iteration, implying a 1:1 pairing.

**Correctness issue:** The script reads `addr_count` from the address array's length word (line 28-29) and uses it as the loop bound (line 38). It never reads the amount array's length word to verify it equals `addr_count`. If the amounts array were shorter than the addresses array, the script would read past the end of the amounts data, extracting garbage from whatever follows in the calldata (or from padding/zeros).

For these specific hardcoded transactions, the arrays are the same length (both 50), so this is not a runtime issue. But the code does not verify this invariant, meaning it silently produces wrong output if the invariant is violated.

**Impact:** Low for this script (hardcoded transactions, immutable calldata), but violates the principle that ABI decoding should validate structural invariants rather than assume them.

**Previously noted:** Pass 1 (A10-PASS1-4) flagged the lack of integrity verification as INFO. This finding is more specific: it identifies the exact missing check (amount array length == address array length).

---

### P5-FETCH-03: No validation that address zero-padding bytes are actually zero [LOW]

**File:** `scripts/fetch-dec-2025-distributed.sh`, line 41

**Claim:** `local addr="0x${data:$((addr_offset + 24)):40}"` -- extracts a 20-byte address from the last 40 hex chars of a 32-byte word, after skipping 24 hex chars of "zero-padding."

**Correctness issue:** The script assumes the first 24 hex chars (12 bytes) of each address word are zeros. It does not verify this. In valid ABI-encoded calldata, addresses are left-padded with zeros. But if the calldata were malformed (non-zero padding), the script would silently extract a truncated address, discarding the high bytes without warning.

For example, if a word contained `0000000000000000000000FF103ca065db4ed55afc29724fa2fdaddc71a0fc0f`, the script would extract `103ca065db4ed55afc29724fa2fdaddc71a0fc0f` and silently discard the `FF` byte, producing a valid-looking but incorrect address.

**Impact:** Low -- the hardcoded transactions have valid ABI encoding. But this is a missing validation that could mask data corruption.

---

### P5-FETCH-04: Offset arithmetic is internally consistent and correct (given 4-word head assumption) [INFO]

**File:** `scripts/fetch-dec-2025-distributed.sh`, lines 21-48

Positive finding: I traced every offset calculation through the full ABI layout. Given the 4-word head assumption documented in the comment:

| Variable | Hex char offset | Byte offset | Word | Expected content | Verified |
|---|---|---|---|---|---|
| `data` start | 0 | 0 | 0 | After stripping 0x + selector | YES |
| `addr_count_hex` | 256 | 128 | 4 | Address array length | YES (= head_size for 4-word head) |
| `amount_offset_hex` | 192 | 96 | 3 | Byte offset to amounts | YES |
| `addr_offset` (i=0) | 320 | 160 | 5 | First address | YES (4 head + 1 length = word 5) |
| `addr_offset` (i=49) | 3456 | 1728 | 54 | Last address | YES |
| `amount_offset` | 3520 | 1760 | 55 | Amounts array header | YES (4 + 1 + 50 = word 55) |
| `amount_start` | 3584 | 1792 | 56 | First amount | YES (skip length) |
| `amount_start` (i=49) | 6720 | 3360 | 105 | Last amount | YES |

Total data size: 106 words * 64 hex chars = 6784 hex chars. Plus 10 chars for `0x` + selector = 6794 total input chars.

All offsets are mutually consistent. The `+24` / `:40` address extraction correctly targets the 20-byte address within a 32-byte ABI word. The `amount_offset * 2` byte-to-hexchar conversion is correct.

---

### P5-FETCH-05: CSV output format matches consumer expectations [INFO]

**File:** `scripts/fetch-dec-2025-distributed.sh`, lines 48, 52

Positive finding: The output format is:
- Header: `recipient address,amount wei`
- Rows: `<0x-prefixed lowercase 40-char hex address>,<decimal integer>`

The consumer (`src/diffCalculatorOutput.test.ts` line 179) reads this via `parseCsv('./output/dec-2025-distributed.csv')` which expects comma-separated `address,amount` rows. The header column names match the consumer's expectations. The address format (lowercase, 0x-prefixed) is consistent with how the rest of the codebase normalizes addresses.

The committed output file has 101 lines (1 header + 100 data rows), matching the `DISTRIBUTED_COUNT = 100` assertion in the test.

---

### P5-FETCH-06: python3 is correctly used for amounts that exceed 64-bit integer range [INFO]

**File:** `scripts/fetch-dec-2025-distributed.sh`, line 46

Positive finding: The first output amount is `161832447748875935013721`, which is approximately 1.6 * 10^23 and exceeds 2^64 (approximately 1.8 * 10^19). Bash arithmetic (`$((16#...))`) is limited to 64-bit signed integers and would silently wrap. The use of `python3` for hex-to-decimal conversion is necessary and correct.

This is the same logic flagged in Pass 4 (A10-PASS4-1) for performance and Pass 1 (A10-PASS1-1) for injection risk, but from a correctness standpoint, python3 is the right tool here.

---

## Summary

| ID | Severity | Title |
|----|----------|-------|
| P5-FETCH-01 | MEDIUM | Undocumented function signature makes 4-word head layout unverifiable |
| P5-FETCH-02 | LOW | No validation that address and amount arrays have equal length |
| P5-FETCH-03 | LOW | No validation that address zero-padding bytes are actually zero |
| P5-FETCH-04 | INFO | Offset arithmetic is internally consistent and correct (positive) |
| P5-FETCH-05 | INFO | CSV output format matches consumer expectations (positive) |
| P5-FETCH-06 | INFO | python3 correctly used for >64-bit amounts (positive) |

**Total findings:** 6 (0 CRITICAL, 0 HIGH, 1 MEDIUM, 2 LOW, 3 INFO)

**Overall correctness assessment:** The ABI decoding arithmetic is internally consistent and produces correct output for the two hardcoded transactions (verified by CI and test suite). The main correctness gap is that the assumed 4-word ABI head layout cannot be independently verified because the function signature is never documented. All offset calculations, substring arithmetic, and hex-to-decimal conversions are correct given the stated layout.
