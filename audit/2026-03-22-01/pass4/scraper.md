# Pass 4: Code Quality Review — `src/scraper.ts`

**Auditor:** A08
**Date:** 2026-03-22
**File:** `src/scraper.ts` (335 lines)

---

## Evidence of Thorough Reading

### Module-level

| Item | Kind | Line(s) |
|------|------|---------|
| Module-level JSDoc | comment | 1-4 |
| `request`, `gql` import | import | 6 |
| `writeFile` import | import | 7 |
| `LiquidityChange`, `LiquidityChangeType`, `Transfer` import | import | 8 |
| `DATA_DIR`, `LIQUIDITY_FILE`, `POOLS_FILE`, `TRANSFER_CHUNK_SIZE`, `TRANSFERS_FILE_BASE` import | import | 9 |
| `validateAddress` import | import | 10 |
| `config` (dotenv) import | import | 11 |
| `assert` import | import | 12 |
| `config()` call | side effect | 14 |
| `SUBGRAPH_URL` | const | 17-18 |
| `BATCH_SIZE` | const | 19 |
| Module-level `assert(process.env.END_SNAPSHOT, ...)` | assertion | 23 |
| `UNTIL_SNAPSHOT` | const (derived) | 24 |
| Module-level `assert(!isNaN(UNTIL_SNAPSHOT), ...)` | assertion | 25 |

### Exported Types

| Name | Kind | Line(s) |
|------|------|---------|
| `SubgraphTransfer` | interface | 28-37 |
| `SubgraphLiquidityChangeBase` | type | 40-51 |
| `SubgraphLiquidityChangeV2` | type | 54-56 |
| `SubgraphLiquidityChangeV3` | type | 59-66 |
| `SubgraphLiquidityChange` | type | 69 |

### Constants (non-exported)

| Name | Kind | Line(s) |
|------|------|---------|
| `VALID_CHANGE_TYPES` | const array | 71 |

### Functions (non-exported)

| Name | Kind | Line(s) |
|------|------|---------|
| `parseIntStrict(value, field)` | function | 74-78 |
| `validateNumericString(value, field)` | function | 82-84 |
| `validateIntegerString(value, field)` | function | 87-89 |
| `scrapeTransfers()` | async function | 158-231 |
| `scrapeLiquidityChanges()` | async function | 237-326 |
| `main()` | async function | 329-332 |

### Functions (exported)

| Name | Kind | Line(s) |
|------|------|---------|
| `mapSubgraphTransfer(t)` | function | 96-110 |
| `mapSubgraphLiquidityChange(t)` | function | 117-151 |

### Entrypoint

| Item | Line |
|------|------|
| `main().catch(...)` | 334 |

---

## Findings

### FINDING-1: `VALID_CHANGE_TYPES` duplicates the `LiquidityChangeType` enum values [MEDIUM]

**Lines:** 71, 121-123 (scraper.ts); 69-73 (types.ts)

**Description:** The `VALID_CHANGE_TYPES` array manually lists `["DEPOSIT", "TRANSFER", "WITHDRAW"]`, duplicating the values already defined in the `LiquidityChangeType` enum in `types.ts`. The enum is imported (line 8) but only used for the `as LiquidityChangeType` type assertion on line 130. The validation on line 121 uses the hand-written string array instead of deriving the valid set from the enum.

If a new change type is added to the `LiquidityChangeType` enum, `VALID_CHANGE_TYPES` must be updated separately, and nothing enforces that they stay in sync. This is a classic "two sources of truth" problem. The enum already provides the canonical set of valid values.

**Recommended fix:** Replace the hand-written array with `Object.values(LiquidityChangeType)` to derive valid types from the single source of truth.

**Severity:** MEDIUM — A desynchronization between the enum and the validation array would silently reject valid change types or accept invalid ones.

---

### FINDING-2: Duplicate import statement for `./constants` [LOW]

**Lines:** 9-10

**Description:** Two separate import lines pull from `./constants`:
```
import { DATA_DIR, LIQUIDITY_FILE, POOLS_FILE, TRANSFER_CHUNK_SIZE, TRANSFERS_FILE_BASE } from "./constants";
import { validateAddress } from "./constants";
```

These should be consolidated into a single import statement. Every other file in the codebase uses a single import per module (e.g., `processor.ts` line 26 imports multiple items from `./constants` in one statement; `config.ts` line 3 imports `validateAddress` from `./constants` in one statement).

**Severity:** LOW — Style inconsistency; no functional impact.

---

### FINDING-3: Redundant `+ 1` on `UNTIL_SNAPSHOT` given `blockNumber_lte` query filter [LOW]

**Lines:** 24, 175, 255

**Description:** `UNTIL_SNAPSHOT` is computed as `parseInt(process.env.END_SNAPSHOT) + 1` with the comment "to make sure every transfer is gathered". However, both GraphQL queries use the `blockNumber_lte` (less-than-or-equal) filter, which already includes transfers at the exact `END_SNAPSHOT` block. The `+ 1` makes the query fetch transfers at block `END_SNAPSHOT + 1`, which is one block beyond the snapshot range.

If the intent is to include all transfers at `END_SNAPSHOT`, `blockNumber_lte: END_SNAPSHOT` already achieves this. If the intent is to capture transfers that might affect state *after* the last snapshot, that rationale should be documented explicitly, because it contradicts the CLAUDE.md description ("fetches... up to END_SNAPSHOT block").

This was not flagged in earlier passes because it straddles correctness and code quality. The `+ 1` is either unnecessary (if `_lte` is understood) or inadequately documented (if the extra block is intentional).

**Severity:** LOW — The extra block likely has no practical impact on rewards (snapshots are sampled at specific blocks, not at block ranges), but the discrepancy between comment intent and actual behavior is confusing.

---

### FINDING-4: `scrapeTransfers` and `scrapeLiquidityChanges` have heavily duplicated structure [LOW]

**Lines:** 158-231 vs. 237-326

**Description:** The two scrape functions share nearly identical structure:
1. Initialize `skip = 0`, `hasMore = true`, `totalProcessed = 0`, accumulator array
2. `while (hasMore)` loop with console log
3. Build a GraphQL query with `$skip`, `$first`, `$untilSnapshot`
4. Call `request<T>(SUBGRAPH_URL, query, { skip, first: BATCH_SIZE, untilSnapshot: UNTIL_SNAPSHOT })`
5. Map results through a transform function
6. Push to accumulator, update `totalProcessed`, check `hasMore`, increment `skip`
7. Write to file after each batch
8. Log progress and final count

The differences are: (a) the GraphQL query string, (b) the mapper function, (c) the file output logic, and (d) the V3 pool collection side-effect in `scrapeLiquidityChanges`.

This duplication means any change to the pagination logic, error handling, or retry behavior must be applied in two places. A generic paginated scrape helper parameterized on query, mapper, and writer would reduce this to a single implementation.

**Severity:** LOW — The file is 335 lines and the duplication is manageable. However, any future changes to pagination (e.g., switching to cursor-based pagination per Pass 1 FINDING-1) would need to be applied twice.

---

### FINDING-5: GraphQL queries are reconstructed inside the loop on every iteration [INFO]

**Lines:** 167-192, 247-279

**Description:** The `gql` tagged template literals for both queries are defined inside the `while (hasMore)` loop, meaning they are re-parsed on every batch iteration. Since the query is static (no dynamic interpolation), it could be hoisted outside the loop or to module scope. The `gql` tag from `graphql-request` parses the query string into a document AST, so this does redundant work on each iteration.

**Severity:** INFO — Negligible performance impact given the I/O-bound nature of the scraper. This is a minor style/efficiency observation.

---

### FINDING-6: Inconsistent `const` vs `let` usage for `skip` [INFO]

**Lines:** 159, 212, 238, 305

**Description:** `skip` is declared with `let` and mutated via `skip += batchTransfers.length`. This is correct and necessary. However, `totalProcessed` follows the same pattern, while the accumulators (`transfers`, `liquidityChanges`) are declared with `const` despite being mutated (via `.push()`). This is standard JavaScript (const prevents reassignment, not mutation), but the mixed mutation patterns could be cleaner if the loop were refactored to use a streaming/functional approach.

**Severity:** INFO — Standard JavaScript idiom, not a real issue.

---

### FINDING-7: `LiquidityChangeType` is imported but not used for validation [INFO]

**Lines:** 8, 130

**Description:** `LiquidityChangeType` is imported from `./types` but only used in the type assertion `as LiquidityChangeType` on line 130. It is not used for the actual runtime validation on line 121 (which uses `VALID_CHANGE_TYPES` instead). This is related to FINDING-1 but noted separately as an import cleanliness observation: if FINDING-1 is resolved by using `Object.values(LiquidityChangeType)`, the import becomes fully justified. If not, it is used only for a type cast.

**Severity:** INFO — The import is not dead (it is used for type narrowing), but its role is purely type-level rather than runtime.

---

### FINDING-8: Extra blank line between `parseIntStrict` and `validateNumericString` [INFO]

**Lines:** 79-80

**Description:** There is a double blank line between `parseIntStrict` (ending line 78) and the JSDoc for `validateNumericString` (starting line 81). The rest of the file uses single blank lines between functions. Minor style inconsistency.

**Severity:** INFO

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 0     |
| HIGH     | 0     |
| MEDIUM   | 1     |
| LOW      | 3     |
| INFO     | 4     |

The primary code quality concern is the duplicated source of truth for valid liquidity change types (FINDING-1), which creates a maintenance risk if the enum is extended. The remaining findings are minor: a split import, a potentially unnecessary `+ 1`, and structural duplication in the two scrape functions. Overall the file is well-organized with clear separation between data mapping (exported, tested) and I/O orchestration (private).
