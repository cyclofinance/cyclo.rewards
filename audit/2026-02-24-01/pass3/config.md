# Pass 3 -- Documentation Audit: `src/config.ts`

**Auditor:** A01
**Date:** 2026-02-24
**File:** `src/config.ts` (102 lines)

---

## 1. Evidence of Thorough Reading

Every exported function and constant identified in the file:

| # | Name | Kind | Line(s) | Exported |
|---|------|------|---------|----------|
| 1 | `Epoch` (import) | Type import | 2 | N/A (imported, not re-exported) |
| 2 | `CyToken` (import) | Type import | 2 | N/A (imported, used at line 21) |
| 3 | `seedrandom` (import) | Module import | 3 | N/A |
| 4 | `assert` (import) | Module import | 1 | N/A |
| 5 | `REWARDS_SOURCES` | `const string[]` | 5--12 | Yes |
| 6 | `FACTORIES` | `const string[]` | 14--19 | Yes |
| 7 | `CYTOKENS` | `const CyToken[]` | 21--46 | Yes |
| 8 | `RPC_URL` | `const string` | 48 | Yes |
| 9 | `isSameAddress` | Function | 50--52 | Yes |
| 10 | `generateSnapshotBlocks` | Function | 60--86 | Yes |
| 11 | `scaleTo18` | Function | 93--101 | Yes |

---

## 2. JSDoc and Parameter/Return Documentation

### `generateSnapshotBlocks` (lines 54--59 JSDoc, 60--86 body)

```typescript
/**
 * Generates random snapshots between the given start/end numbers based on the given seed
 * @param seed - The seed phrase
 * @param start - The start block number
 * @param end - The end block number
 */
export function generateSnapshotBlocks(seed: string, start: number, end: number): number[]
```

- **JSDoc present:** Yes.
- **All parameters documented:** Yes (`seed`, `start`, `end`).
- **Return value documented:** No. The JSDoc does not include a `@returns` tag. The return type `number[]` is declared in the TypeScript signature but there is no prose description of what the returned array represents (sorted array of 30 snapshot block numbers).

### `scaleTo18` (lines 88--92 JSDoc, 93--101 body)

```typescript
/**
 * Scales a given value and its decimals to 18 fixed point decimals
 * @param value - The value to scale to 18
 * @param decimals - The decimals of the value to scale to 18
 */
export function scaleTo18(value: bigint, decimals: number): bigint
```

- **JSDoc present:** Yes.
- **All parameters documented:** Yes (`value`, `decimals`).
- **Return value documented:** No `@returns` tag. The return type `bigint` is in the signature but there is no prose description.

### `isSameAddress` (lines 50--52)

```typescript
export function isSameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}
```

- **JSDoc present:** No.
- **Parameters documented:** No.
- **Return value documented:** No.

### Exported constants: `REWARDS_SOURCES`, `FACTORIES`, `CYTOKENS`, `RPC_URL`

- **JSDoc present:** None of the four exported constants have JSDoc documentation.
- Each entry in `REWARDS_SOURCES` and `FACTORIES` has an inline comment identifying the protocol. This is helpful but not a substitute for a top-level description of the constant's purpose.

---

## 3. Inline Comment Accuracy

### `REWARDS_SOURCES` (lines 5--12)

Each address has an inline comment identifying the protocol (orderbook, Sparkdex Universal Router, OpenOcean Exchange Proxy, OpenOcean Exchange Impl, OpenOcean Exchange Router, Sparkdex TWAP). These are descriptive labels. No inaccuracy detected relative to the code; they serve as identification only and do not make behavioral claims.

### `FACTORIES` (lines 14--19)

Each address has an inline comment (Sparkdex V2, Sparkdex V3, Sparkdex V3.1, Blazeswap). No inaccuracy detected.

### `CYTOKENS` entries (lines 21--46)

- Line 25: `// sFlr` beside `underlyingAddress` for cysFLR. The `underlyingSymbol` field on line 26 is `"sFLR"`. The comment uses mixed-case `sFlr` while the symbol is `sFLR`. Minor capitalization inconsistency but not a code bug.
- Line 33: `// weth` beside `underlyingAddress` for cyWETH. The `underlyingSymbol` field on line 34 is `"WETH"`. Comment uses lowercase `weth`. Minor capitalization inconsistency.
- Line 41: `// fxrp` beside `underlyingAddress` for cyFXRP. The `underlyingSymbol` field on line 42 is `"cyFXRP"`. This is **potentially incorrect**: the `underlyingSymbol` should describe the underlying token (FXRP), not the cyToken itself (cyFXRP). The other two entries follow the pattern where `underlyingSymbol` matches the underlying asset name (sFLR, WETH), but this entry names the cyToken wrapper instead.

### `generateSnapshotBlocks` inline comments

- Line 70: `// start + end + 28 = 30 snapshots` -- **Accurate.** Line 68 pushes `start` and `end` (2 elements), the loop on line 71 iterates 28 times, totalling 30.
- Line 76--80: `// making sure we have correct length` with assertion `snapshots.length === 30` -- **Accurate.** The assertion message is clear.
- Line 79: Assertion error message says `"failed to generated expected number"` -- minor grammatical error: `"generated"` should be `"generate"`.
- Line 82: `// sort asc` -- **Accurate.** The comparator `(a, b) => a - b` sorts ascending.

---

## 4. Findings

### A01-1: Unused `Epoch` Import (Line 2) -- Low / Code Quality

**Location:** Line 2
```typescript
import { CyToken, Epoch } from "./types";
```

The `Epoch` type is imported but never referenced anywhere else in `config.ts`. This is dead code. It should be removed to keep imports clean.

**Recommendation:** Remove `Epoch` from the import statement.

---

### A01-2: Missing JSDoc on `isSameAddress` (Lines 50--52) -- Low / Documentation

**Location:** Lines 50--52
```typescript
export function isSameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}
```

This is a public/exported utility function used in `processor.ts` (lines 74, 97) for case-insensitive address comparison. It has no JSDoc comment, no parameter descriptions, and no return description.

**Recommendation:** Add JSDoc:
```typescript
/**
 * Case-insensitive comparison of two Ethereum-style hex addresses.
 * @param a - First address
 * @param b - Second address
 * @returns true if the addresses match (case-insensitive)
 */
```

---

### A01-3: Missing `@returns` Tag on `generateSnapshotBlocks` JSDoc (Line 54--59) -- Low / Documentation

**Location:** Lines 54--59

The JSDoc documents all three parameters but omits a `@returns` tag describing the output.

**Recommendation:** Add:
```
 * @returns A sorted ascending array of 30 block numbers between start and end (inclusive)
```

---

### A01-4: Missing `@returns` Tag on `scaleTo18` JSDoc (Lines 88--92) -- Low / Documentation

**Location:** Lines 88--92

The JSDoc documents both parameters but omits a `@returns` tag.

**Recommendation:** Add:
```
 * @returns The value normalized to 18 decimal fixed-point representation
```

---

### A01-5: No JSDoc on Exported Constants (Lines 5, 14, 21, 48) -- Low / Documentation

**Location:** `REWARDS_SOURCES` (line 5), `FACTORIES` (line 14), `CYTOKENS` (line 21), `RPC_URL` (line 48)

None of these four exported constants have JSDoc documentation. While the inline comments on individual array entries are helpful, there is no top-level description of what each constant represents or how it is used in the pipeline.

**Recommendation:** Add brief JSDoc above each constant, e.g.:
```typescript
/** Approved DEX router and orderbook addresses whose transfers qualify for rewards eligibility. */
export const REWARDS_SOURCES = [ ... ];
```

---

### A01-6: Possible Incorrect `underlyingSymbol` for cyFXRP Entry (Line 42) -- Medium / Accuracy

**Location:** Line 42
```typescript
underlyingSymbol: "cyFXRP",
```

The `underlyingSymbol` field for the cyFXRP token is set to `"cyFXRP"`, which is the name of the cyToken itself, not the underlying asset. The established pattern from the other two entries is:

| cyToken | `underlyingSymbol` |
|---------|-------------------|
| cysFLR | `"sFLR"` (underlying asset) |
| cyWETH | `"WETH"` (underlying asset) |
| cyFXRP | `"cyFXRP"` (cyToken name, not underlying) |

Based on the inline comment `// fxrp` on line 41 and the pattern, the expected value would be `"FXRP"` or `"fXRP"`. This may be intentional if the symbol is used only for display purposes and the project prefers this labelling, but it breaks the naming convention of the other entries and contradicts the field name `underlyingSymbol`.

**Recommendation:** Verify whether this should be `"FXRP"` to match the pattern. If the current value is intentional, add an inline comment explaining the deviation.

---

### A01-7: Minor Grammatical Error in Assertion Message (Line 79) -- Low / Documentation

**Location:** Line 79
```typescript
`failed to generated expected number of snapshots, expected: 30, got: ${snapshots.length}`
```

The word `"generated"` should be `"generate"` (infinitive form after "failed to").

**Recommendation:** Change to:
```
`failed to generate expected number of snapshots, expected: 30, got: ${snapshots.length}`
```

---

### A01-8: Inline Comment Capitalization Inconsistencies (Lines 25, 33) -- Informational

**Location:** Line 25 (`// sFlr`), Line 33 (`// weth`)

The inline comments beside `underlyingAddress` use informal capitalization (`sFlr`, `weth`) that does not match the corresponding `underlyingSymbol` values (`sFLR`, `WETH`). This is cosmetic and does not affect behavior.

**Recommendation:** Optionally align comment capitalization with the symbol values for consistency.

---

## Summary

| ID | Severity | Category | Description |
|----|----------|----------|-------------|
| A01-1 | Low | Code Quality | Unused `Epoch` import on line 2 |
| A01-2 | Low | Documentation | Missing JSDoc on exported `isSameAddress` function |
| A01-3 | Low | Documentation | Missing `@returns` tag on `generateSnapshotBlocks` JSDoc |
| A01-4 | Low | Documentation | Missing `@returns` tag on `scaleTo18` JSDoc |
| A01-5 | Low | Documentation | No JSDoc on four exported constants |
| A01-6 | Medium | Accuracy | `underlyingSymbol: "cyFXRP"` may be incorrect; breaks pattern |
| A01-7 | Low | Documentation | Grammatical error `"generated"` -> `"generate"` in assertion message |
| A01-8 | Informational | Documentation | Inline comment capitalization inconsistencies on lines 25, 33 |

**Total findings: 8**
**Medium: 1 | Low: 6 | Informational: 1**
