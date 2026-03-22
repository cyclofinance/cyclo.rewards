# Pass 3: Documentation Review — `src/config.ts`

**Auditor:** A01
**Date:** 2026-03-22
**File:** `src/config.ts` (139 lines)

## Evidence of Thorough Reading

### Module Structure
- **No module-level JSDoc** (the file has no top-of-file doc comment)
- Imports: `assert` (line 1), `CyToken` from `./types` (line 2), `validateAddress` from `./constants` (line 3), `seedrandom` (line 4)

### Exports (constants + functions)

| Export | Kind | Line(s) | JSDoc? |
|---|---|---|---|
| `REWARDS_SOURCES` | `const string[]` | 7-14 | Yes (line 6) |
| `FACTORIES` | `const string[]` | 17-22 | Yes (line 16) |
| `CYTOKENS` | `const CyToken[]` | 25-50 | Yes (line 24) |
| `RPC_URL` | `const string` | 54 | Yes (line 53) |
| `isSameAddress(a, b)` | function | 62-66 | Yes (lines 56-61) |
| `generateSnapshotBlocks(seed, start, end)` | function | 75-105 | Yes (lines 68-74) |
| `scaleTo18(value, decimals)` | function | 113-124 | Yes (lines 107-112) |
| `parseEnv()` | function | 126-138 | **No** |

### Non-exported Side Effects
| Item | Line | JSDoc? |
|---|---|---|
| `assert(process.env.RPC_URL, ...)` | 52 | N/A (runtime assertion) |

---

## Findings

### P3-CFG-01: `parseEnv` has no JSDoc [LOW]

**Location:** Line 126
**Description:** `parseEnv` is a public exported function with no JSDoc comment. Every other exported function in the file has JSDoc. This function reads three environment variables (`SEED`, `START_SNAPSHOT`, `END_SNAPSHOT`), validates them, and returns a typed object. Users of this function cannot see at a glance what environment variables it requires or what it returns without reading the implementation.
**Recommendation:** Add a JSDoc comment documenting the purpose, the required environment variables, and the return shape.

---

### P3-CFG-02: No module-level JSDoc comment [LOW]

**Location:** Top of file (line 1)
**Description:** The file has no module-level JSDoc comment. Other files in the codebase (e.g., `src/types.ts` line 1-3, `src/constants.ts` line 1-4) have module-level documentation. `config.ts` is a key configuration module that defines approved sources, factories, token definitions, RPC URL, and utility functions. A module-level comment would orient readers.
**Recommendation:** Add a module-level JSDoc summarizing the module's role in the pipeline.

---

### P3-CFG-03: `isSameAddress` JSDoc omits validation side effect [INFO]

**Location:** Lines 56-61
**Description:** The JSDoc says "Case-insensitive comparison of two Ethereum addresses" but does not mention that the function throws if either argument fails `validateAddress` (lines 63-64). This is a behavioral contract that callers should be aware of — passing a non-address string will throw, not return false.
**Recommendation:** Add a `@throws` tag or note in the description that inputs are validated and invalid addresses throw.

---

### P3-CFG-04: `generateSnapshotBlocks` JSDoc says "inclusive" but start/end inclusion is conditional [INFO]

**Location:** Line 73 — `@returns Sorted array of 30 unique block numbers between start and end (inclusive)`
**Description:** The JSDoc claims the returned blocks are "between start and end (inclusive)". In practice, `start` and `end` are explicitly seeded into `snapshotSet` (line 86), so they are always included. The word "inclusive" is accurate here, but the stronger guarantee — that start and end are *always* present in the result — is not documented. This is relevant because callers may rely on the boundary blocks being present.
**Recommendation:** Clarify that start and end are always included in the returned array (not merely that they can be).

---

### P3-CFG-05: `scaleTo18` JSDoc `@param` descriptions are vague [INFO]

**Location:** Lines 109-110
**Description:** The `@param value` says "The value to scale to 18" and `@param decimals` says "The decimals of the value to scale to 18". These are tautological — they repeat the function name without adding information. A reader unfamiliar with fixed-point arithmetic would not understand that `value` is a raw token amount in its native precision and `decimals` is the token's decimal count.
**Recommendation:** Improve descriptions, e.g., `@param value - Raw token amount in its native fixed-point precision` and `@param decimals - Number of decimal places in the token's native representation (e.g., 6 for USDC, 18 for ETH)`.

---

## Summary

| Severity | Count |
|---|---|
| CRITICAL | 0 |
| HIGH | 0 |
| MEDIUM | 0 |
| LOW | 2 |
| INFO | 3 |

The file is well-documented overall. All exported constants have JSDoc, and 3 of 4 exported functions have JSDoc with accurate `@param`/`@returns` tags that match their signatures. The only LOW findings are the missing JSDoc on `parseEnv` and the missing module-level comment. The INFO items are minor accuracy/completeness improvements.
