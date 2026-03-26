# Pass 1: Security Review — `src/constants.ts`

**Auditor:** A02
**Date:** 2026-03-22

## Evidence of Reading

**Module:** `src/constants.ts` (58 lines)

### Constants (with line numbers)

| Name | Line | Type | Value |
|------|------|------|-------|
| `ONE_18` | 7 | `bigint` | `10n ** 18n` |
| `REWARD_POOL` | 10 | `bigint` | `500_000_000_000_000_000_000_000n` (500k tokens * 1e18) |
| `DEC25_REWARD_POOL` | 12 | `bigint` | `1_000_000_000_000_000_000_000_000n` (1M tokens * 1e18) |
| `REWARDS_CSV_COLUMN_HEADER_ADDRESS` | 16 | `string` | `"recipient address"` |
| `REWARDS_CSV_COLUMN_HEADER_REWARD` | 17 | `string` | `"amount wei"` |
| `DIFF_CSV_COLUMN_HEADER_OLD` | 18 | `string` | `"old"` |
| `DIFF_CSV_COLUMN_HEADER_NEW` | 19 | `string` | `"new"` |
| `DIFF_CSV_COLUMN_HEADER_DIFF` | 20 | `string` | `"diff"` |
| `VALID_ADDRESS_REGEX` | 22 | `RegExp` | `/^0x[0-9a-fA-F]{40}$/` |
| `BOUNTY_PERCENT` | 30 | `bigint` | `10n` |
| `RETRY_BASE_DELAY_MS` | 33 | `number` | `500` |
| `DATA_DIR` | 36 | `string` | `"data"` |
| `OUTPUT_DIR` | 39 | `string` | `"output"` |
| `TRANSFERS_FILE_BASE` | 42 | `string` | `"transfers"` |
| `LIQUIDITY_FILE` | 45 | `string` | `"liquidity.dat"` |
| `POOLS_FILE` | 48 | `string` | `"pools.dat"` |
| `BLOCKLIST_FILE` | 51 | `string` | `"blocklist.txt"` |
| `TRANSFER_CHUNK_SIZE` | 54 | `number` | `270000` |
| `TRANSFER_FILE_COUNT` | 57 | `number` | `10` |

### Functions (with line numbers)

| Name | Line | Signature |
|------|------|-----------|
| `validateAddress` | 25-27 | `(value: string, field: string): void` |

### Types / Errors / Interfaces

None defined in this file.

## Security Review

### Checklist Coverage

- **Input validation:** `validateAddress` uses anchored regex (`^...$`), no `g` flag (no `lastIndex` statefulness). Properly rejects partial matches. Well-tested in `constants.test.ts`.
- **Arithmetic safety:** All token amounts use `bigint` — no floating-point precision loss. `ONE_18` is derived via exponentiation (`10n ** 18n`), not a hardcoded literal.
- **Error handling:** `validateAddress` throws a descriptive `Error` with the field name and invalid value. Callers in `scraper.ts`, `pipeline.ts`, and `config.ts` use this correctly.
- **Injection:** No dynamic code execution (`eval`, `Function`, template injection). String constants are static literals. File path constants are plain relative paths without user-controlled segments.
- **Resource management:** No I/O, network, or resource allocation in this file.
- **Hardcoded secrets:** No secrets, API keys, or credentials.
- **Prototype pollution:** No object manipulation or dynamic property access.
- **Dependency vulnerabilities:** No imports (no dependencies at all).

### Findings

#### INFO-01: `REWARD_POOL` and `DEC25_REWARD_POOL` are hardcoded literals without inline derivation

**Lines:** 10, 12

`REWARD_POOL` is `500_000_000_000_000_000_000_000n` and `DEC25_REWARD_POOL` is `1_000_000_000_000_000_000_000_000n`. While the comments describe the intended values ("500,000 tokens" and "1,000,000 tokens"), the literals themselves are opaque. If someone needed to verify correctness, they would need to manually count digits.

The project's own `CLAUDE.md` states: "Include derivation logic in source for derived values -- hardcoded results are opaque without the derivation." `ONE_18` on line 7 follows this pattern (`10n ** 18n`), but the reward pool constants do not. The existing test in `constants.test.ts` (line 10) does verify `REWARD_POOL === 500_000n * 10n ** 18n`, which provides CI-level assurance. However, the source itself would be clearer with the derivation inline.

**Severity:** INFO -- the test catches any mismatch, so this is a readability/maintainability observation, not a security risk.

---

No security findings at LOW or above.
