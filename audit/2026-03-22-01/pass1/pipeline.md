# Pass 1: Security Review — `src/pipeline.ts`

**Auditor:** A06
**Date:** 2026-03-22
**File:** `src/pipeline.ts` (125 lines)

## Evidence of Reading

**Module:** `pipeline` — Pure data-transformation functions for the rewards pipeline (summarization, aggregation, sorting, filtering, CSV formatting, JSONL/blocklist parsing).

### Exports

| Name | Kind | Line |
|------|------|------|
| `TokenSummary` | interface | 5 |
| `summarizeTokenBalances` | function | 14 |
| `aggregateRewardsPerAddress` | function | 37 |
| `sortAddressesByReward` | function | 47 |
| `filterZeroRewards` | function | 55 |
| `formatRewardsCsv` | function | 59 |
| `formatBalancesCsv` | function | 67 |
| `parseJsonl` | function | 97 |
| `parseBlocklist` | function | 111 |

### Imports

- `REWARDS_CSV_COLUMN_HEADER_ADDRESS`, `REWARDS_CSV_COLUMN_HEADER_REWARD` from `./constants` (line 1)
- `validateAddress` from `./constants` (line 2)
- `CyToken`, `EligibleBalances`, `RewardsPerToken`, `BlocklistReport` from `./types` (line 3)

### Interface Fields (`TokenSummary`, lines 5-12)

- `name: string`
- `totalAverage: bigint`
- `totalPenalties: bigint`
- `totalBounties: bigint`
- `totalFinal: bigint`
- `verified: boolean`

---

## Findings

### FINDING-01 — `parseJsonl` returns `any[]` with no schema validation [MEDIUM]

**Location:** Lines 97-109

**Description:** `parseJsonl` calls `JSON.parse` on each line and returns `any[]`. The caller receives untyped, unvalidated objects. If the data files (`transfers*.dat`, `liquidity.dat`) are tampered with or corrupted, malformed objects will silently propagate through the pipeline. For example, a transfer record missing `value` or `blockNumber` would not be caught here and would surface as `undefined` arithmetic downstream.

This is distinct from JSON syntax errors (which *are* caught on line 104). The concern is syntactically valid JSON that does not conform to the expected `Transfer` or `LiquidityChange` schema.

**Impact:** Corrupted or tampered data files could produce silently wrong reward calculations. In a financial distribution system, wrong outputs lead to incorrect on-chain distributions.

**Severity:** MEDIUM — The data files are committed to the repo and CI runs a determinism check (`git-clean.yaml`), which provides a mitigating control. However, the function itself provides no defense-in-depth.

---

### FINDING-02 — `parseBlocklist` silently accepts extra fields/tokens per line [LOW]

**Location:** Lines 111-124

**Description:** The blocklist parser destructures only the first two space-separated tokens (`[reporter, reported] = line.split(" ")`). If a line contains additional tokens (e.g., `"0xAAA... 0xBBB... 0xCCC..."`), they are silently ignored. This could mask data-entry errors where a third address was intended to be on a separate line.

Additionally, if only one address is present on a line (no space), `reported` will be `undefined`, which will be caught by `validateAddress` — so that case is handled. But three-or-more tokens per line is silently tolerated.

**Impact:** A blocklist formatting error could cause a cheater address to be silently dropped, meaning penalties are not applied.

**Severity:** LOW — The blocklist is a small, manually curated file and is committed to the repo. The risk is limited to manual data-entry mistakes.

---

### FINDING-03 — Non-null assertion on Map.get in `sortAddressesByReward` [LOW]

**Location:** Lines 49-50

**Description:** `rewards.get(b)!` and `rewards.get(a)!` use non-null assertions. The function is called with `Array.from(rewards.keys())`, so the keys are guaranteed to exist in the map. However, the function signature accepts any `Map<string, bigint>` and any caller could pass keys not present in the map, in which case the `!` assertion would suppress the `undefined` and produce incorrect sort behavior (comparing `undefined` as if it were a bigint).

Since the only call site (via `index.ts`) passes `rewards.keys()` directly, the current usage is safe.

**Impact:** If the function were reused with mismatched arguments, sorting would silently break. No current exploitability.

**Severity:** LOW — Defensive coding concern. The `!` assertions are technically correct for the current call pattern.

---

### FINDING-04 — CSV injection via address field in `formatRewardsCsv` / `formatBalancesCsv` [INFO]

**Location:** Lines 59-65, 67-95

**Description:** Addresses are interpolated directly into CSV output without quoting. If an address somehow contained a comma, newline, or characters like `=`, `+`, `-`, `@` (CSV injection payloads), the CSV structure would be corrupted or could trigger formula execution in spreadsheet software.

Ethereum addresses are validated upstream via `validateAddress` (hex-only, 42 chars), so this vector is not reachable in practice for the rewards CSV. The balances CSV uses `token.name` in headers (line 77), which comes from hardcoded `CyToken` definitions in `config.ts` and is not user-controlled.

**Impact:** No practical impact given upstream validation and hardcoded token names.

**Severity:** INFO — Noting for completeness. No action needed.

---

### FINDING-05 — `summarizeTokenBalances` verification invariant is informational only [INFO]

**Location:** Line 31

**Description:** The `verified` field checks `totalAverage - totalPenalties + totalBounties === totalFinal`. If this is `false`, it indicates an accounting inconsistency. However, the function only *reports* the result; it does not throw or halt the pipeline. The caller (`index.ts`) is responsible for checking and acting on `verified === false`.

This is an observation, not a vulnerability. The caller does log and could potentially continue with bad data, but that is outside the scope of this file.

**Impact:** None within this file. The invariant check is correctly computed.

**Severity:** INFO

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH | 0 |
| MEDIUM | 1 |
| LOW | 2 |
| INFO | 2 |

No critical or high-severity issues. The file consists of pure functions with no I/O, no eval, no dynamic imports, no prototype pollution vectors, no hardcoded secrets, no resource leaks, and no swallowed promises. Arithmetic uses native BigInt (no overflow risk). The primary concern is the untyped `parseJsonl` return value, which relies on upstream data integrity rather than runtime validation.
