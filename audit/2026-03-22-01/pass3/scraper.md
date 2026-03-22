# Pass 3: Documentation Review — `src/scraper.ts`

**Auditor:** A08
**Date:** 2026-03-22
**File:** `src/scraper.ts` (335 lines)

## Evidence of Thorough Reading

### Module-level JSDoc
- Lines 1-4: Module-level JSDoc present. Describes purpose (subgraph scraper), data fetched (ERC-20 transfer and liquidity change events), endpoint (Goldsky), output (JSONL to `data/*.dat`).

### Imports (lines 6-12)
- `request`, `gql` from `graphql-request`
- `writeFile` from `fs/promises`
- `LiquidityChange`, `LiquidityChangeType`, `Transfer` from `./types`
- `DATA_DIR`, `LIQUIDITY_FILE`, `POOLS_FILE`, `TRANSFER_CHUNK_SIZE`, `TRANSFERS_FILE_BASE` from `./constants`
- `validateAddress` from `./constants`
- `config` from `dotenv`
- `assert` from `assert`

### Constants
- Line 14: `config()` — dotenv initialization (no JSDoc, side-effect call — INFO)
- Line 17: `SUBGRAPH_URL` — JSDoc on line 16. Describes "Goldsky-hosted Cyclo subgraph endpoint for the current epoch".
- Line 19: `BATCH_SIZE = 1000` — No JSDoc.
- Line 23-25: `UNTIL_SNAPSHOT` — Inline comment on lines 21-22 describes purpose. No JSDoc.
- Line 71: `VALID_CHANGE_TYPES` — No JSDoc.

### Types (exported)
- Lines 28-37: `SubgraphTransfer` (exported interface) — JSDoc on line 27. Describes "Raw transfer event shape from the Goldsky subgraph GraphQL response". No per-field JSDoc.
- Lines 40-51: `SubgraphLiquidityChangeBase` (exported type) — JSDoc on line 39. "Common fields for V2/V3 liquidity change events from the subgraph". No per-field JSDoc.
- Lines 54-56: `SubgraphLiquidityChangeV2` (exported type) — JSDoc on line 53. "Uniswap V2 liquidity change from the subgraph".
- Lines 59-66: `SubgraphLiquidityChangeV3` (exported type) — JSDoc on line 58. "Uniswap V3 liquidity change from the subgraph, with concentrated position data".
- Line 69: `SubgraphLiquidityChange` (exported type) — JSDoc on line 68. "Discriminated union of V2 and V3 subgraph liquidity change events".

### Functions (non-exported)
- Lines 74-78: `parseIntStrict` — JSDoc on line 73. "Parse a string to integer and throw if the result is NaN".
- Lines 82-84: `validateNumericString` — JSDoc on line 81. "Validate that a string is a non-negative integer (for token values)".
- Lines 87-89: `validateIntegerString` — JSDoc on line 86. "Validate that a string is a valid signed integer (for BigInt-convertible fields)".
- Lines 158-231: `scrapeTransfers` — JSDoc on lines 153-157.
- Lines 237-326: `scrapeLiquidityChanges` — JSDoc on lines 233-236.
- Lines 329-332: `main` — JSDoc on line 328.

### Functions (exported)
- Lines 96-110: `mapSubgraphTransfer` (exported) — JSDoc on lines 91-95. Multi-line, describes mapping, flattening, parsing, and error behavior.
- Lines 117-151: `mapSubgraphLiquidityChange` (exported) — JSDoc on lines 112-116. Multi-line, describes mapping, V2/V3 discrimination, and error behavior.

### Top-level statements
- Line 334: `main().catch(...)` — No JSDoc (appropriate for an entry point invocation).

---

## Findings

### FINDING-1: `BATCH_SIZE` constant lacks JSDoc [INFO]

**Line:** 19
**Description:** `BATCH_SIZE = 1000` has no JSDoc comment. While its name is self-explanatory, a one-liner stating it controls the GraphQL pagination page size would be consistent with the documentation style of other constants in the codebase (e.g., `TRANSFER_CHUNK_SIZE` in `constants.ts` has JSDoc).

**Severity:** INFO

---

### FINDING-2: `VALID_CHANGE_TYPES` constant lacks JSDoc [INFO]

**Line:** 71
**Description:** `VALID_CHANGE_TYPES` array has no JSDoc. A brief comment describing its role in validation would help readers understand why it exists separately from the `LiquidityChangeType` enum in `types.ts`.

**Severity:** INFO

---

### FINDING-3: `UNTIL_SNAPSHOT` has inline comment but no JSDoc [INFO]

**Line:** 24
**Description:** `UNTIL_SNAPSHOT` is documented via inline comments on lines 21-22 but lacks a formal JSDoc tag. The inline style is adequate for a non-exported module-scoped constant. No change required.

**Severity:** INFO

---

### FINDING-4: `parseIntStrict` JSDoc is inaccurate — does not document the full rejection scope [LOW]

**Line:** 73
**Description:** The JSDoc says "Parse a string to integer and throw if the result is NaN". However, `parseInt` in JavaScript accepts strings like `"12abc"` and `"12.5"`, returning `12` in both cases without producing NaN. The JSDoc implies the function is stricter than it actually is. This is already tracked as a code-level bug in A08-PASS2-1, but independently the JSDoc is misleading about the function's current behavior.

If the code fix from A08-PASS2-1 is applied (adding a regex pre-check), the JSDoc should be updated to reflect the new stricter behavior. If the code fix is not applied, the JSDoc should be corrected to say "throw if the input is entirely non-numeric (NaN)" to accurately describe the `parseInt`-only path.

**Severity:** LOW — Misleading documentation about validation strictness could cause callers to rely on guarantees the function does not provide.

---

### FINDING-5: `SubgraphTransfer` interface has no per-field JSDoc [LOW]

**Line:** 28-37
**Description:** The `SubgraphTransfer` exported interface has a module-level JSDoc but none of its 7 fields have individual JSDoc. The corresponding internal type `Transfer` in `types.ts` has field-level JSDoc for `value` (line 24 of types.ts). The subgraph type would benefit from similar annotations, particularly for:
- `value` — should note it is a decimal string, not BigInt
- `from`/`to` — should note the nested `{ id: string }` shape (non-obvious)
- `blockNumber`/`blockTimestamp` — should note they are string-typed despite being numeric values

**Severity:** LOW — Exported interface used by tests and potentially external consumers; field semantics are non-obvious (nested objects, string-typed numbers).

---

### FINDING-6: `SubgraphLiquidityChangeBase` has no per-field JSDoc [LOW]

**Line:** 40-51
**Description:** The `SubgraphLiquidityChangeBase` exported type has 10 fields with no individual JSDoc. Several fields have non-obvious semantics:
- `owner` is `{ address: string }` (nested object, unlike the flat `string` in `LiquidityChangeBase` in types.ts)
- `liquidityChange` and `depositedBalanceChange` are strings but represent signed integers
- `liquidityChangeType` is a string union, not the `LiquidityChangeType` enum

The corresponding internal type `LiquidityChangeBase` in `types.ts` has per-field JSDoc for `liquidityChange` and `depositedBalanceChange`.

**Severity:** LOW — Exported type with non-obvious field shapes that differ from the internal types they map to.

---

### FINDING-7: `scrapeTransfers` JSDoc says "270k lines" but actual value is imported constant [INFO]

**Line:** 155
**Description:** The JSDoc says "split at 270k lines" which matches the current value of `TRANSFER_CHUNK_SIZE` (270000 in constants.ts). However, hardcoding the number in the doc creates a maintenance risk if the constant changes. The JSDoc could reference `TRANSFER_CHUNK_SIZE` instead.

**Severity:** INFO — Minor documentation staleness risk.

---

### FINDING-8: `SUBGRAPH_URL` JSDoc says "current epoch" but URL contains a specific deployment slug [LOW]

**Line:** 16-18
**Description:** The JSDoc says "for the current epoch" but the URL itself contains `2026-02-13-78a0`, a deployment-specific slug. The JSDoc does not note that this URL must be updated when the subgraph is redeployed for a new epoch. Given that epoch transitions are already documented in CLAUDE.md as requiring manual updates, it would be valuable to add a note here or at least reference the deployment date.

**Severity:** LOW — Omitting the update-required note could cause a future epoch transition to use stale subgraph data.

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 0     |
| HIGH     | 0     |
| MEDIUM   | 0     |
| LOW      | 4     |
| INFO     | 4     |

Overall, `src/scraper.ts` has good documentation coverage. Every exported function and type has JSDoc. The module-level JSDoc accurately describes the file's role. The findings are limited to field-level JSDoc gaps on exported interfaces and minor inaccuracies in existing documentation.
