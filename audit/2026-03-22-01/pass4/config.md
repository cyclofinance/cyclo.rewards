# Pass 4: Code Quality Review — `src/config.ts`

**Auditor:** A01
**Date:** 2026-03-22
**File:** `src/config.ts` (139 lines)

## Evidence of Thorough Reading

### Module Structure
- Imports: `assert` (line 1), `CyToken` from `./types` (line 2), `validateAddress` from `./constants` (line 3), `seedrandom` (line 4)
- No module-level JSDoc (noted in Pass 3)

### Exports (constants + functions)

| Export | Kind | Line(s) |
|---|---|---|
| `REWARDS_SOURCES` | `const string[]` | 7-14 |
| `FACTORIES` | `const string[]` | 17-22 |
| `CYTOKENS` | `const CyToken[]` | 25-50 |
| `RPC_URL` | `const string` | 54 |
| `isSameAddress(a: string, b: string): boolean` | function | 62-66 |
| `generateSnapshotBlocks(seed: string, start: number, end: number): number[]` | function | 75-105 |
| `scaleTo18(value: bigint, decimals: number): bigint` | function | 113-124 |
| `parseEnv(): { seed, startSnapshot, endSnapshot }` | function | 126-138 |

### Non-exported Side Effects
| Item | Line |
|---|---|
| `assert(process.env.RPC_URL, ...)` — module-level assertion | 52 |

---

## Findings

### P4-CFG-01: Magic number `30` repeated 4 times in `generateSnapshotBlocks` [LOW]

**Location:** Lines 84, 89, 97-98
**Description:** The number `30` appears four times in `generateSnapshotBlocks` — once in the range assertion (line 84), once in the while-loop condition (line 89), and twice in the length assertion (lines 97-98). This number represents the total snapshot count and is a key protocol parameter, but it is not defined as a named constant. It also appears in comments (line 88: "28 = 30 snapshots") and in test files and `types.ts`. The magic number `28` on line 88 is derived from `30 - 2` (start + end), adding another implicit dependency on the same value.

A change to the snapshot count would require updating all four occurrences in this function plus at least 8 references in test/type files. A named constant (e.g., `SNAPSHOT_COUNT` in `constants.ts`) would make the relationship explicit and reduce the surface area for errors.

**Severity rationale:** LOW because the value is stable (unlikely to change within an epoch), but a named constant improves maintainability and makes the protocol parameter discoverable.

---

### P4-CFG-02: `parseInt` called without radix parameter [MEDIUM]

**Location:** Lines 131-132
**Description:** `parseInt(process.env.START_SNAPSHOT)` and `parseInt(process.env.END_SNAPSHOT)` are called without a radix argument. While block numbers are expected to be decimal, `parseInt` without a radix has a well-known pitfall: strings like `"0x1A"` parse as hex (26) rather than being rejected as non-numeric. The `isNaN` check on lines 134-135 would not catch this since `parseInt("0x1A")` returns `26`, not `NaN`.

The same issue exists in `scraper.ts` line 24 (`parseInt(process.env.END_SNAPSHOT)`), but `scraper.ts` also defines a `parseIntStrict` helper (line 74) that similarly lacks a radix. The inconsistency is that `scraper.ts` has a dedicated strict-parsing helper while `config.ts` inlines the pattern — but neither uses a radix.

For `parseEnv`, a more robust approach is `parseInt(value, 10)` or `Number(value)` combined with `Number.isInteger()`.

**Severity rationale:** MEDIUM because block numbers from environment variables could theoretically contain hex prefixes, and the current validation would silently accept them as valid decimal values.

---

### P4-CFG-03: Inconsistent assertion style — `assert()` vs `assert.ok()` [LOW]

**Location:** Lines 52, 80, 84, 96, 127-129, 134-135
**Description:** The file uses two different assertion patterns for the same logical operation (asserting a truthy condition):
- `assert(...)` — lines 52, 127, 128, 129, 134, 135
- `assert.ok(...)` — lines 80, 84, 96

Both are functionally identical (`assert` is an alias for `assert.ok`), but mixing them within the same file is a style inconsistency. Within `generateSnapshotBlocks`, only `assert.ok` is used. Within `parseEnv` and the module-level RPC_URL check, only `assert` is used.

**Severity rationale:** LOW — no behavioral impact, but the inconsistency is noticeable and suggests the two functions may have been written at different times without a unified convention.

---

### P4-CFG-04: Module-level side effect — `RPC_URL` assertion executes on import [LOW]

**Location:** Lines 52-54
**Description:** The `assert(process.env.RPC_URL, ...)` on line 52 executes at import time, meaning any file that imports anything from `config.ts` (even just `scaleTo18` or `isSameAddress`) must have `RPC_URL` set in the environment or the import will crash. This is a leaky abstraction: callers importing pure utility functions are forced to satisfy an unrelated environment constraint.

By contrast, `parseEnv()` (lines 126-138) correctly defers its environment assertions to call time, so importing the function does not require the env vars to be set.

The test file (`config.test.ts`) works around this by ensuring `RPC_URL` is set in the test environment (via `.env` or vitest setup), but the coupling is conceptually unnecessary for tests that only exercise `scaleTo18` or `generateSnapshotBlocks`.

**Severity rationale:** LOW — in practice `RPC_URL` is always set via `.env`, but the coupling between pure utility functions and environment state is an architectural smell.

---

### P4-CFG-05: `parseEnv` validation does not reject non-integer numeric strings [LOW]

**Location:** Lines 131-135
**Description:** `parseInt("3.14")` returns `3` and passes `isNaN` — so `parseEnv` would accept `"3.14"` as a valid block number, silently truncating to `3`. Block numbers are always integers. The `scaleTo18` function (lines 113-116) demonstrates the project's convention for integer validation: `Number.isInteger(decimals)`. `parseEnv` does not apply the equivalent check.

**Severity rationale:** LOW because environment variables are set manually in `.env` and CI, so non-integer values are unlikely. But the asymmetry with `scaleTo18`'s stricter validation is a quality gap.

---

### P4-CFG-06: `scaleTo18` uses `18` as a magic number [INFO]

**Location:** Lines 117, 119, 120, 122
**Description:** The number `18` appears four times in `scaleTo18`. This is the standard ERC-20 decimal precision and is self-documenting in context (the function is literally named `scaleTo18`). The `constants.ts` file already defines `ONE_18 = 10n ** 18n` which encodes the same concept. However, extracting `18` itself as a constant (e.g., `TARGET_DECIMALS = 18`) could make the relationship between `ONE_18` in constants and `18` in `scaleTo18` more explicit.

**Severity rationale:** INFO — the function name provides sufficient context; extracting the constant is optional.

---

### P4-CFG-07: Duplicate environment parsing logic between `config.ts` and `scraper.ts` [LOW]

**Location:** `config.ts` lines 126-138 vs `scraper.ts` lines 21-25
**Description:** `scraper.ts` independently reads and parses `END_SNAPSHOT` from environment (lines 23-25) using the same `assert` + `parseInt` + `isNaN` pattern as `parseEnv`. It does not call `parseEnv()`, meaning the validation logic is duplicated. The scraper also uses a different error message format ("undefined END_SNAPSHOT env variable" vs "END_SNAPSHOT environment variable must be set").

This is a cross-file finding but it originates from `config.ts` not being designed as the single source of truth for environment parsing. If `parseEnv` were the canonical way to read snapshot parameters, `scraper.ts` could call it instead of re-implementing the same checks.

**Severity rationale:** LOW — the duplication is small and both copies are correct, but divergent error messages and duplicated logic are maintenance risks.

---

## Summary

| Severity | Count |
|---|---|
| CRITICAL | 0 |
| HIGH | 0 |
| MEDIUM | 1 |
| LOW | 5 |
| INFO | 1 |

The file is well-structured with clear separation between configuration constants and utility functions. The main quality issues are: (1) `parseInt` without radix allowing silent hex acceptance (MEDIUM), (2) the magic number `30` lacking a named constant, (3) mixed `assert`/`assert.ok` style, (4) module-level side effect coupling pure utilities to env state, and (5) duplicated env parsing logic with `scraper.ts`. None of these are correctness issues in the current deployment, but they represent maintainability and robustness gaps.
