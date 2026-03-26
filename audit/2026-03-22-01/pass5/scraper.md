# Pass 5: Correctness / Intent Verification — `src/scraper.ts`

**Auditor:** A08
**Date:** 2026-03-22
**Scope:** `src/scraper.ts` (335 lines) and `src/scraper.test.ts` (318 lines)

## Evidence of Thorough Reading

### scraper.ts (335 lines)
- Lines 1-14: Module imports (graphql-request, fs/promises, types, constants, dotenv, assert) and `config()` call
- Lines 17-19: `SUBGRAPH_URL` constant and `BATCH_SIZE = 1000`
- Lines 21-25: Module-level `END_SNAPSHOT` assertion and `UNTIL_SNAPSHOT = parseInt(process.env.END_SNAPSHOT) + 1`
- Lines 28-37: `SubgraphTransfer` interface (nested from/to objects, string blockNumber/blockTimestamp)
- Lines 40-69: `SubgraphLiquidityChangeBase`, `SubgraphLiquidityChangeV2`, `SubgraphLiquidityChangeV3`, discriminated union
- Line 71: `VALID_CHANGE_TYPES` array for runtime changeType validation
- Lines 74-78: `parseIntStrict` — uses `parseInt` with NaN guard
- Lines 82-84: `validateNumericString` — regex `/^\d+$/`
- Lines 87-89: `validateIntegerString` — regex `/^-?\d+$/`
- Lines 96-110: `mapSubgraphTransfer` — validates addresses and value, flattens from/to, parses blockNumber/blockTimestamp
- Lines 117-151: `mapSubgraphLiquidityChange` — validates addresses, changeType, numeric strings; discriminates V2/V3 by `__typename`; V3 branch validates and parses extra fields
- Lines 158-231: `scrapeTransfers` — paginated GraphQL fetch, maps via `mapSubgraphTransfer`, writes chunked JSONL
- Lines 237-326: `scrapeLiquidityChanges` — paginated GraphQL fetch, collects V3 pool addresses, writes JSONL and pools.dat
- Lines 329-334: `main` — sequential scrape of transfers then liquidity changes

### scraper.test.ts (318 lines)
- Lines 1-2: Sets `END_SNAPSHOT` before import to satisfy module-level assert
- Lines 14-23: `VALID_SUBGRAPH_TRANSFER` fixture
- Lines 26-38: `VALID_V2_LIQUIDITY` fixture
- Lines 41-58: `VALID_V3_LIQUIDITY` fixture
- Lines 60-130: 11 tests for `mapSubgraphTransfer` (flatten, parse, passthrough, exclusion, zero edge, 5 error paths)
- Lines 132-304: 22 tests for `mapSubgraphLiquidityChange` (V2 mapping, V3 fields, negative ticks, V2-no-V3-fields, owner flatten, WITHDRAW, TRANSFER, passthrough strings, tick boundaries, zero ticks, 10 error paths, negative accepted, tokenId error)
- Lines 307-318: 1 test for END_SNAPSHOT NaN validation via module reimport

## Verification by Named Item

### 1. `mapSubgraphTransfer` — does it correctly flatten the subgraph response?

**Claim (JSDoc line 91-95):** "Maps a raw subgraph transfer event to the internal Transfer type. Flattens nested from/to objects and parses numeric strings. Throws on invalid data."

**Verification:**
- Flattening: `t.from.id` -> `from`, `t.to.id` -> `to` — **correct**. The subgraph nests addresses under `{id: string}` objects; the internal `Transfer` type uses flat strings.
- Numeric parsing: `blockNumber` and `blockTimestamp` go through `parseIntStrict` — **functions as documented** (NaN rejected, but lax on trailing garbage per prior findings).
- Validation: `tokenAddress`, `from`, `to` validated via `validateAddress`; `value` via `validateNumericString`. **All address-like and value fields validated before return.**
- Exclusion: The subgraph `id` field is deliberately not mapped. Test confirms this.
- `transactionHash`: Passed through without validation (previously noted, INFO-level).

**Verdict:** Correctly implements its documented intent. The only gap is that `parseIntStrict` is laxer than its name implies (prior finding, not new).

### 2. `mapSubgraphLiquidityChange` — does it correctly discriminate V2 vs V3?

**Claim (JSDoc line 112-116):** "Discriminates V2/V3 by __typename, adding V3-specific fields when present. Throws on invalid data."

**Verification:**
- Discrimination: Line 137 checks `t.__typename === "LiquidityV3Change"`. If true, V3-specific fields (`tokenId`, `poolAddress`, `fee`, `lowerTick`, `upperTick`) are validated and included. Otherwise, only base fields are returned.
- V3 address validation: `poolAddress` validated, `tokenId` validated as numeric string. `fee`, `lowerTick`, `upperTick` parsed via `parseIntStrict`.
- V2 path: Returns `{ __typename: t.__typename, ...base }` — no V3 fields present. Test confirms V3 keys absent from V2 result.
- changeType validation: Line 121 checks against `VALID_CHANGE_TYPES` array. All three enum values tested.
- `liquidityChange` and `depositedBalanceChange`: Validated via `validateIntegerString` (allows negative). Test confirms negative values accepted.

**Verdict:** Correctly discriminates V2 vs V3 and validates appropriately.

### 3. `parseIntStrict` — does it actually reject invalid integers?

**Claim (JSDoc line 73):** "Parse a string to integer and throw if the result is NaN."

**Verification:**
- `parseInt("abc")` -> NaN -> throws. **Correct per claim.**
- `parseInt("")` -> NaN -> throws. **Correct per claim.**
- `parseInt("12abc")` -> 12 -> does NOT throw. **Inconsistent with the name "strict"** but consistent with the JSDoc which only claims NaN rejection.
- `parseInt("12.5")` -> 12 -> does NOT throw. Silent truncation.
- `parseInt("0x1a")` -> 26 -> does NOT throw. Parses as hex.

**Verdict:** The function does exactly what its JSDoc says (rejects NaN) but does NOT do what its name implies (strict integer parsing). The name `parseIntStrict` suggests it rejects all non-integer inputs, but it only rejects inputs where `parseInt` returns NaN. This is a name/behavior mismatch. **Prior finding, tracked across A08-PASS1-2, A08-PASS2-1, A08-PASS3-1, A01-PASS4-2.**

### 4. Do tests actually verify the behaviors their names describe?

**Detailed test-by-test verification:**

| Test Name | Verifies Claimed Behavior? | Notes |
|---|---|---|
| "should flatten from/to nested objects to plain addresses" | YES | Checks `result.from` and `result.to` are flat strings |
| "should parse blockNumber and timestamp from strings to numbers" | YES | Checks `typeof` via `toBe(number)` |
| "should pass through tokenAddress, value, and transactionHash unchanged" | YES | Direct equality with input |
| "should not include the subgraph id field in the output" | YES | `"id" in result` check |
| "should parse zero blockNumber and timestamp" | YES | Boundary case for parseIntStrict |
| "should throw on non-numeric blockNumber" | YES | Input `"abc"` -> throws |
| "should throw on non-numeric blockTimestamp" | YES | Input `"xyz"` -> throws |
| "should throw on invalid from address" | YES | `"not-an-address"` -> throws |
| "should throw on invalid to address" | YES | `"0xshort"` -> throws |
| "should throw on invalid tokenAddress" | YES | `"garbage"` -> throws |
| "should throw on non-numeric value" | YES | `"not-a-number"` -> throws |
| "should accept valid numeric value strings" | YES | `"0"` -> no throw |
| "should map V2 liquidity change with correct __typename" | YES | Checks typename, owner, changeType, blockNumber, timestamp |
| "should map V3 liquidity change with V3-specific fields" | YES | Checks all V3 fields including tokenId, poolAddress, fee, ticks |
| "should parse negative tick values correctly" | YES | `-100`, `-50` parsed correctly |
| "should not include V3 fields on V2 result" | YES | Checks 5 V3-specific keys absent |
| "should map owner from nested address field" | YES | Owner flattening verified |
| "should handle WITHDRAW change type" | YES | changeType mapping |
| "should handle TRANSFER change type" | YES | changeType mapping |
| "should pass through liquidityChange and depositedBalanceChange as strings" | YES | String passthrough verified |
| "should handle tick boundary values" | YES | Min/max Uniswap V3 ticks |
| "should handle zero tick value" | YES | Zero boundary |
| All error-path tests (11 total) | YES | Each checks the correct field name in the error message |
| "should accept negative liquidityChange" | YES | Negative string accepted |
| "should accept negative depositedBalanceChange" | YES | Negative string accepted |
| "should error if END_SNAPSHOT is not a valid number" | YES | Module reimport with `"abc"` env -> throws |

**Verdict:** All 34 tests accurately verify the behaviors described by their names. No test has a misleading name.

### 5. Are validation functions correctly applied?

| Function | Applied to | Correct? |
|---|---|---|
| `validateAddress` | `tokenAddress`, `from`, `to` (transfers); `tokenAddress`, `lpAddress`, `owner` (liquidity); `poolAddress` (V3 only) | YES — all address-type fields validated |
| `validateNumericString` | `value` (transfers); `tokenId` (V3) | YES — non-negative integer strings |
| `validateIntegerString` | `liquidityChange`, `depositedBalanceChange` | YES — signed integer strings for values that can be negative on withdraw |
| `parseIntStrict` | `blockNumber`, `blockTimestamp` (both); `fee`, `lowerTick`, `upperTick` (V3) | PARTIAL — validates NaN but not trailing garbage (prior finding) |
| `VALID_CHANGE_TYPES` check | `liquidityChangeType` | YES — runtime enum validation |

**Verdict:** Validation is correctly applied to the right fields with the right validators. The only gap is `parseIntStrict`'s laxness (prior finding) and `transactionHash` having no validation (prior finding, INFO-level).

## New Findings

### P5-SCRAPER-01: No runtime guard against unknown `__typename` values in `mapSubgraphLiquidityChange` [LOW]

**Location:** `src/scraper.ts` line 150

**Description:** The V2 fallback path at line 150 (`return { __typename: t.__typename, ...base }`) executes for any `__typename` that is not `"LiquidityV3Change"`. TypeScript's discriminated union constrains this at compile time to `"LiquidityV2Change"`, but at runtime (since the data comes from an external GraphQL API), an unexpected `__typename` value (e.g., a hypothetical `"LiquidityV4Change"`) would silently be treated as V2. Adding an explicit `else if` / `else throw` or an assertion that `t.__typename === "LiquidityV2Change"` would make the discrimination exhaustive at runtime.

**Impact:** Low. The subgraph schema is controlled by the project and unlikely to introduce new types without a corresponding code update. If it did, the V2 treatment would omit V4-specific fields, potentially causing incorrect reward calculations for those positions. The risk is mitigated by the fact that the subgraph URL is hardcoded and the data is committed.

### P5-SCRAPER-02: `parseIntStrict` name claims strictness its implementation does not provide [MEDIUM]

**Location:** `src/scraper.ts` lines 73-78

**Description:** This is a correctness/intent verification of a previously identified issue. The function is named `parseIntStrict` (implying strict rejection of invalid integers) but its JSDoc only claims NaN rejection, and its implementation matches the JSDoc but not the name. The disconnect between name and behavior constitutes a correctness/intent mismatch: a reader trusting the name "strict" would incorrectly believe inputs like `"12abc"`, `"12.5"`, and `"0x1a"` are rejected.

Fields affected: `blockNumber`, `blockTimestamp`, `fee`, `lowerTick`, `upperTick` — all parsed without prior regex validation.

**Prior references:** A08-PASS1-2, A08-PASS2-1, A08-PASS3-1, A01-PASS4-2.

**Risk in practice:** LOW — the subgraph returns well-formed integer strings. But the function name creates a false sense of security during code review.

### P5-SCRAPER-03: Test for `END_SNAPSHOT` NaN validation cannot test the missing-env case [INFO]

**Location:** `src/scraper.test.ts` lines 307-318

**Description:** The test file sets `process.env.END_SNAPSHOT = "99999999"` at line 2 (before import) to satisfy the module-level assert. The `END_SNAPSHOT validation` describe block only tests the NaN case (setting env to `"abc"`), not the missing-env case (unsetting the env). This is because unsetting the env would cause the first assert at line 23 to fire with a different error message ("undefined END_SNAPSHOT env variable"), making that a separate test case. The NaN test is correct and useful; the missing test is an additional edge case, not a flaw in the existing test.

### P5-SCRAPER-04: Redundant `+1` on `UNTIL_SNAPSHOT` fetches one extra block beyond stated intent [LOW]

**Location:** `src/scraper.ts` line 24

**Description:** Previously identified across multiple passes. `UNTIL_SNAPSHOT = parseInt(process.env.END_SNAPSHOT) + 1` combined with `blockNumber_lte` fetches transfers at `END_SNAPSHOT + 1`. The `_lte` operator already includes `END_SNAPSHOT` exactly. The extra block is harmless for reward calculation (processor only samples at snapshot blocks, max is `END_SNAPSHOT`) but contradicts CLAUDE.md ("fetches... up to END_SNAPSHOT block") and fetches unnecessary data.

**Prior references:** A07-5, A07-6 (audit 2026-02-24-01), pass4/scraper.md FINDING-3 (this audit).

## Summary

| ID | Severity | Description |
|---|---|---|
| P5-SCRAPER-01 | LOW | No runtime guard against unknown `__typename` in V2/V3 discrimination |
| P5-SCRAPER-02 | MEDIUM | `parseIntStrict` name/behavior mismatch (prior finding, reconfirmed) |
| P5-SCRAPER-03 | INFO | Missing test for undefined `END_SNAPSHOT` env (complement to existing NaN test) |
| P5-SCRAPER-04 | LOW | Redundant `+1` on `UNTIL_SNAPSHOT` (prior finding, reconfirmed) |

**Overall Assessment:** The mapping functions (`mapSubgraphTransfer`, `mapSubgraphLiquidityChange`) correctly implement their documented behavior. Validation is correctly applied to the right fields with the right validators. All 34 tests accurately verify their claimed behaviors. The two substantive findings (P5-SCRAPER-01, P5-SCRAPER-02) are both low practical risk given the controlled subgraph data source but represent defense-in-depth gaps.
