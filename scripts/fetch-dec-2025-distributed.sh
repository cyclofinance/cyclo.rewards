#!/usr/bin/env bash
set -euo pipefail

# Fetches the two on-chain December 2025 distribution transactions
# and outputs recipient addresses and amounts as CSV.
#
# Usage: RPC_URL=https://... nix develop -c bash scripts/fetch-dec-2025-distributed.sh

: "${RPC_URL:?RPC_URL environment variable must be set}"
OUTPUT="output/dec-2025-distributed.csv"

# The two December 2025 distribution transactions (block 54051127, 54051138)
TX1="0x1e2ee309ee621fc00f6143f2e317e2d07c2993f456b2b2ba3724f8d9c70e2803"
TX2="0x74770c948c83b4d5c52530b2ec26dd56a772635c1b4afe60aa3e4d10999b443f"

decode_tx() {
  local input
  input=$(cast tx "$1" --rpc-url "$RPC_URL" input)

  # Strip 0x + 4-byte selector
  local data="${input:10}"

  # Layout: word0=param1, word1=param2, word2=offset_addrs, word3=offset_amounts
  # At offset_addrs: length (50), then 50 addresses
  # At offset_amounts: length (50), then 50 amounts

  # Address array starts at word 4 (offset 0x80 = 128 bytes from data start)
  local addr_count_hex="${data:256:64}"
  local addr_count=$((16#${addr_count_hex}))

  # Amount array offset is word 3
  local amount_offset_hex="${data:192:64}"
  local amount_offset=$(( 16#${amount_offset_hex} * 2 )) # convert bytes to hex chars

  # Amount array: first word is length, then amounts
  local amount_start=$(( amount_offset + 64 )) # skip length word

  for i in $(seq 0 $((addr_count - 1))); do
    # Address: word 5+i, take last 40 hex chars
    local addr_offset=$(( 320 + i * 64 ))
    local addr="0x${data:$((addr_offset + 24)):40}"

    # Amount: convert from hex
    local amt_offset=$(( amount_start + i * 64 ))
    local amt_hex="${data:$amt_offset:64}"
    local amt=$(python3 -c "print(int('$amt_hex', 16))")

    echo "${addr},${amt}"
  done
}

echo "recipient address,amount wei" > "$OUTPUT"

echo "Fetching tx1: $TX1" >&2
decode_tx "$TX1" >> "$OUTPUT"

echo "Fetching tx2: $TX2" >&2
decode_tx "$TX2" >> "$OUTPUT"

echo "Wrote $(wc -l < "$OUTPUT" | tr -d ' ') lines (including header) to $OUTPUT" >&2
