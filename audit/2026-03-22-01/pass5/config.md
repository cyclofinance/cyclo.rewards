# Pass 5: Correctness / Intent Verification -- `src/config.ts` + `src/config.test.ts`

**Auditor:** A01
**Date:** 2026-03-22
**Scope:** Every named item (function, constant, test, doc comment) in `config.ts` and `config.test.ts` -- verify that what is claimed matches what is implemented.

---

## Evidence of Thorough Reading

### `src/config.ts` (139 lines)
- **Lines 1-4:** Imports: `assert`, `CyToken` from `./types`, `validateAddress` from `./constants`, `seedrandom`.
- **Lines 6-14:** `REWARDS_SOURCES` -- 6 addresses with inline comments (orderbook, Sparkdex Universal Router, OpenOcean Exchange Proxy/Impl/Router, Sparkdex TWAP). Doc comment: "Approved DEX router and orderbook addresses whose transfers are reward-eligible."
- **Lines 16-22:** `FACTORIES` -- 4 addresses (Sparkdex V2, V3, V3.1, Blazeswap). Doc comment: "DEX factory contract addresses; transfers from pools created by these factories are reward-eligible."
- **Lines 24-50:** `CYTOKENS` -- 3 entries (cysFLR/18dec, cyWETH/18dec, cyFXRP/6dec). Doc comment: "Cyclo token definitions for reward calculation."
- **Lines 52-54:** `RPC_URL` -- asserts env var present, exports it. Doc comment: "Flare RPC endpoint URL for on-chain queries."
- **Lines 56-66:** `isSameAddress(a, b)` -- validates both args via `validateAddress`, then lowercases and compares. Doc comment: "Case-insensitive comparison of two Ethereum addresses."
- **Lines 68-105:** `generateSnapshotBlocks(seed, start, end)` -- uses seedrandom, pre-seeds set with `{start, end}`, fills to 30, sorts ascending, asserts length. Doc comment: "Generates random snapshots...Sorted array of 30 unique block numbers between start and end (inclusive)."
- **Lines 107-124:** `scaleTo18(value, decimals)` -- validates decimals, branches on `=18`, `>18` (divide), `<18` (multiply). Doc comment: "Scales a given value and its decimals to 18 fixed point decimals."
- **Lines 126-138:** `parseEnv()` -- asserts SEED/START_SNAPSHOT/END_SNAPSHOT env vars, `parseInt` both block numbers, asserts not NaN. No doc comment.

### `src/config.test.ts` (291 lines)
- **Lines 5-71:** `describe('Test generateSnapshotTimestampForEpoch')` -- 8 tests for `generateSnapshotBlocks`.
- **Lines 73-89:** `describe("RPC_URL")` -- 2 tests: exports from env, errors if unset.
- **Lines 91-142:** `describe("parseEnv")` -- 6 tests: happy path, missing SEED/START/END, non-numeric START/END.
- **Lines 144-167:** `describe("isSameAddress")` -- 5 tests: identical, case-insensitive match, different, invalid first, invalid second.
- **Lines 169-223:** `describe("Test math functions")` -- 7 tests for `scaleTo18`: upscale, downscale, identity, decimals=0, zero value, cyFXRP case, truncation to zero, negative/NaN/non-integer decimals.
- **Lines 225-249:** `describe("REWARDS_SOURCES")` and `describe("FACTORIES")` -- valid addresses, no duplicates.
- **Lines 251-281:** `describe("CYTOKENS")` -- valid addresses, no duplicate addresses, non-negative decimals, non-empty names.
- **Lines 283-290:** `describe("REWARDS_SOURCES and FACTORIES")` -- no overlap between the two sets.

---

## Findings

### P5-CFG-01: Test describe name does not match function under test [LOW]

**File:** `src/config.test.ts`, line 5
**Claim:** `describe('Test generateSnapshotTimestampForEpoch', ...)`
**Reality:** All 8 tests inside this describe block call `generateSnapshotBlocks`, not `generateSnapshotTimestampForEpoch`. No function named `generateSnapshotTimestampForEpoch` exists anywhere in the codebase.

This is a stale name from a prior refactor. While it does not affect test execution, it violates the "test names match what they actually test" criterion. A maintainer reading test output would see a describe block referencing a nonexistent function.

**Previously flagged:** Yes (multiple earlier passes). Not yet fixed.

---

### P5-CFG-02: `parseEnv` accepts garbage numeric strings via `parseInt` without radix or strict validation [MEDIUM]

**File:** `src/config.ts`, lines 131-135
**Claim:** Error messages say "START_SNAPSHOT must be a valid number" / "END_SNAPSHOT must be a valid number"
**Reality:** `parseInt` without radix accepts:
- `"123abc"` -> 123 (silently ignores trailing garbage)
- `"0x1F4"` -> 500 (parses as hex)
- `"1.5"` -> 1 (silently truncates)
- `"  42  "` -> 42 (silently trims whitespace)

None of these trigger the `isNaN` check on lines 134-135. The error message claims to validate "a valid number" but the implementation silently accepts malformed input. A block number should be a strictly positive integer in base 10.

**Impact:** An operator setting `START_SNAPSHOT="52974045abc"` or `END_SNAPSHOT="0xFF"` would get unexpected block numbers without any warning.

**Previously flagged:** Yes (pass1 LOW-01, pass4 P4-CFG-02). Not yet fixed.

---

### P5-CFG-03: `parseEnv` does not validate `start < end` or non-negative values [LOW]

**File:** `src/config.ts`, lines 126-138
**Claim:** The function parses and returns snapshot block numbers for use in `generateSnapshotBlocks`.
**Reality:** There is no check that `startSnapshot < endSnapshot`, nor that either value is non-negative. While `generateSnapshotBlocks` does assert `range >= 30`, it would accept `start=-100, end=-70` (negative block numbers) or `start=2000, end=1000` (inverted range, which would fail the range check with an unhelpful "range must be at least 30" message rather than "start must be less than end").

**Impact:** Confusing error messages on misconfiguration. Low severity since the downstream assertion catches inverted/too-small ranges, just with a misleading error.

---

### P5-CFG-04: `generateSnapshotBlocks` doc comment omits that `start` and `end` are always included [INFO]

**File:** `src/config.ts`, lines 68-74
**Claim:** `@returns Sorted array of 30 unique block numbers between start and end (inclusive)`
**Reality:** The implementation explicitly seeds the set with `{start, end}` on line 86, guaranteeing both endpoints are always present in the output. The doc says "between start and end (inclusive)" which correctly describes the range but does not communicate the guarantee that both endpoints are always included. This is a design choice that callers might rely on (e.g., ensuring the first and last blocks of an epoch are always sampled).

**Impact:** Documentation incompleteness. No functional issue.

---

### P5-CFG-05: `isSameAddress` doc comment does not mention input validation / throwing behavior [INFO]

**File:** `src/config.ts`, lines 56-66
**Claim:** Doc says "Case-insensitive comparison of two Ethereum addresses" and `@returns True if addresses match`.
**Reality:** The function also calls `validateAddress` on both inputs, throwing an `Error` on invalid addresses. The doc comment does not mention `@throws` behavior. A caller reading only the doc would not know the function has validation side effects.

**Impact:** Documentation incompleteness. No functional issue -- the throwing behavior is beneficial.

---

### P5-CFG-06: `scaleTo18` test name is generic ("Test math functions") rather than specific [INFO]

**File:** `src/config.test.ts`, line 169
**Claim:** `describe("Test math functions", ...)`
**Reality:** All 7 tests inside exclusively test `scaleTo18`. The describe name implies a broader scope. If additional math functions are added to config.ts in the future, the grouping would make sense, but currently it is slightly misleading about scope.

**Impact:** Minor readability issue.

---

### P5-CFG-07: `parseEnv` has no doc comment [INFO]

**File:** `src/config.ts`, line 126
**Claim:** N/A (no documentation)
**Reality:** Every other exported function and constant in `config.ts` has a JSDoc comment. `parseEnv` is the sole exception. Its return type annotation `{ seed: string; startSnapshot: number; endSnapshot: number }` partially self-documents, but the assertion behavior (throws on missing/invalid env vars) is undocumented.

**Impact:** Inconsistency with the rest of the file's documentation style.

---

### P5-CFG-08: `scaleTo18` math verified correct for all branches [INFO -- POSITIVE]

Verified all three branches:
- `decimals === 18`: identity return -- correct.
- `decimals > 18` (e.g., 23): `value / 10n ** BigInt(23 - 18)` = `value / 100000n` -- correct downscale with truncation.
- `decimals < 18` (e.g., 3): `value * 10n ** BigInt(18 - 3)` = `value * 1000000000000000n` -- correct upscale.

Test expected values independently verified:
- `scaleTo18(123456789n, 3)` = `123456789 * 10^15` = `123456789000000000000000n` -- correct.
- `scaleTo18(123456789n, 23)` = `123456789 / 10^5` = `1234n` (BigInt truncation) -- correct.
- `scaleTo18(1_000_000n, 6)` = `1_000_000 * 10^12` = `1_000_000_000_000_000_000n` = 1e18 -- correct (1 FXRP = 1e18 scaled).

---

### P5-CFG-09: `generateSnapshotBlocks` algorithm verified correct [INFO -- POSITIVE]

- `seedrandom` returns values in `[0, 1)` (verified empirically with 1M samples).
- `Math.floor(rng() * range) + start` with `range = end - start + 1` produces values in `[start, end]` inclusive -- correct.
- Set ensures uniqueness. Pre-seeding with `{start, end}` plus 28 random draws = 30 total.
- Loop uses `while (snapshotSet.size < 30)` which handles collisions by drawing again -- correct.
- Post-loop assertion `snapshots.length === 30` is redundant (Set.size was already checked) but harmless -- belt-and-suspenders.
- `sort((a, b) => a - b)` is correct numeric ascending sort.

---

### P5-CFG-10: All constant address arrays verified for format consistency [INFO -- POSITIVE]

- All addresses in `REWARDS_SOURCES`, `FACTORIES`, and `CYTOKENS` are lowercase 0x-prefixed 40-hex-char strings.
- Tests verify format via `VALID_ADDRESS_REGEX` (`/^0x[0-9a-fA-F]{40}$/`).
- Tests verify no duplicates within each array (case-insensitive).
- Tests verify no overlap between `REWARDS_SOURCES` and `FACTORIES`.

---

## Summary

| ID | Severity | Description |
|----|----------|-------------|
| P5-CFG-01 | LOW | Test describe name `generateSnapshotTimestampForEpoch` does not match tested function `generateSnapshotBlocks` |
| P5-CFG-02 | MEDIUM | `parseEnv` accepts garbage numeric strings; error message claims "valid number" but `parseInt` is lax |
| P5-CFG-03 | LOW | `parseEnv` does not validate `start < end` or non-negative block numbers |
| P5-CFG-04 | INFO | `generateSnapshotBlocks` doc omits guarantee that `start` and `end` are always included |
| P5-CFG-05 | INFO | `isSameAddress` doc omits throwing behavior on invalid addresses |
| P5-CFG-06 | INFO | "Test math functions" describe name is overly generic for `scaleTo18`-only tests |
| P5-CFG-07 | INFO | `parseEnv` is the only exported function without a doc comment |
| P5-CFG-08 | INFO+ | `scaleTo18` math independently verified correct for all branches |
| P5-CFG-09 | INFO+ | `generateSnapshotBlocks` algorithm independently verified correct |
| P5-CFG-10 | INFO+ | All constant address arrays verified for format and uniqueness |
