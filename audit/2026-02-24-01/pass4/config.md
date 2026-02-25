# A01 -- Code Quality Audit: `src/config.ts`

**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/config.ts`
**Lines:** 102
**Audit date:** 2026-02-24
**Pass:** 4 (Code Quality)

---

## Findings

### A01-1 -- MEDIUM -- Unused `Epoch` import

**Location:** Line 2

**Description:** `config.ts` imports `Epoch` from `./types` but never references it anywhere in the file body. The import statement is:

```typescript
import { CyToken, Epoch } from "./types";
```

`CyToken` is used on line 21 (`CYTOKENS: CyToken[]`), but `Epoch` is not referenced on any other line. This is dead code in the import statement. A grep for `Epoch` across the entire `src/` directory confirms it is only used in this import and in its own definition in `types.ts`, plus a test file name reference (`generateSnapshotTimestampForEpoch` in `config.test.ts` which is a describe block name, not an actual type usage).

**Recommendation:** Remove `Epoch` from the import:

```typescript
import { CyToken } from "./types";
```

---

### A01-2 -- MEDIUM -- Inconsistent address casing across constant arrays

**Location:** Lines 5-18 (REWARDS_SOURCES), lines 14-19 (FACTORIES), lines 21-46 (CYTOKENS)

**Description:** Ethereum addresses in the three constant arrays use inconsistent casing conventions:

| Constant | Example | Casing Pattern |
|---|---|---|
| `REWARDS_SOURCES[0]` | `0xcee8cd002f151a536394e564b84076c41bbbcd4d` | All lowercase |
| `REWARDS_SOURCES[1]` | `0x0f3D8a38D4c74afBebc2c42695642f0e3acb15D3` | Mixed (checksum) |
| `REWARDS_SOURCES[5]` | `0x8c7ba8f245aef3216698087461e05b85483f791f` | All lowercase |
| `FACTORIES[0]` | `0x16b619B04c961E8f4F06C10B42FDAbb328980A89` | Mixed (checksum) |
| `CYTOKENS[0].address` | `0x19831cfB53A0dbeAD9866C43557C1D48DfF76567` | Mixed (checksum) |
| `CYTOKENS[1].underlyingAddress` | `0x1502fa4be69d526124d453619276faccab275d3d` | All lowercase |
| `CYTOKENS[2].address` | `0xf23595ede14b54817397b1dab899ba061bdce7b5` | All lowercase |
| `CYTOKENS[2].receiptAddress` | `0xc46600cebd84ed2fe60ec525df13e341d24642f2` | All lowercase |

Some addresses use EIP-55 checksum casing (mixed case), while others are all lowercase. This is not a correctness bug because `isSameAddress()` normalizes to lowercase for comparison. However, it creates visual inconsistency and makes it harder to visually verify addresses against block explorers (which use checksum casing).

**Recommendation:** Normalize all address constants to EIP-55 checksum casing for consistency and easier visual verification against block explorers.

---

### A01-3 -- LOW -- Inconsistent indentation in `scaleTo18` function

**Location:** Lines 93-101

**Description:** The `scaleTo18` function uses 4-space indentation for the function body, but the `if`/`else if`/`else` branches internally mix styles:

```typescript
export function scaleTo18(value: bigint, decimals: number): bigint {
    if (decimals === 18) {
      return value;                                          // 6-space indent
    } else if (decimals > 18) {
        return value / BigInt("1" + "0".repeat(decimals - 18));  // 8-space indent
    } else {
        return value * BigInt("1" + "0".repeat(18 - decimals));  // 8-space indent
    }
}
```

The `decimals === 18` branch uses 6-space indentation for its `return`, while the other two branches use 8-space indentation. The rest of the file uses 2-space indentation (e.g., `generateSnapshotBlocks` on lines 60-86). This function's outer indentation (4-space) also differs from the rest of the file.

**Recommendation:** Normalize to 2-space indentation to match the rest of the file.

---

### A01-4 -- LOW -- Inconsistent BigInt construction method in `scaleTo18`

**Location:** Lines 97, 99

**Description:** The `scaleTo18` function constructs BigInt values via string concatenation:

```typescript
BigInt("1" + "0".repeat(decimals - 18))
```

Elsewhere in the codebase, BigInt is constructed via:
- `BigInt(10 ** 18)` in `constants.ts` line 1
- `BigInt(500000000000000000000000)` in `constants.ts` line 3
- `1_000_000_000_000_000_000_000_000n` literal syntax in `constants.ts` line 4
- `0n` literal syntax in `processor.ts`

The string-concatenation approach in `scaleTo18` is correct (and arguably necessary since the exponent is dynamic), but the codebase uses at least four different BigInt construction idioms. See also A02-1.

**Recommendation:** This specific usage is justified (dynamic exponent), but could use `10n ** BigInt(decimals - 18)` for clarity and consistency with the arithmetic-based approach used elsewhere.

---

### A01-5 -- LOW -- `generateSnapshotBlocks` does not guarantee uniqueness of snapshot blocks

**Location:** Lines 60-86

**Description:** The function generates 28 random blocks plus `start` and `end`, but does not check for duplicate values. If `rng()` produces two identical random blocks (possible when the range is small relative to 28), the result would contain duplicate block numbers. The function asserts `length === 30` but not uniqueness.

This is a code quality observation rather than a bug in production (with block ranges in the hundreds of thousands, collision probability is negligible), but the absence of a uniqueness assertion means the function's contract is not fully documented or enforced.

**Recommendation:** Add a comment documenting that duplicates are acceptable by design, or add a uniqueness check/assertion if duplicates would be problematic.

---

### A01-6 -- INFO -- `isSameAddress` is a utility function that could live in a utility module

**Location:** Lines 50-52

**Description:** `isSameAddress` is a general-purpose address comparison utility. It lives in `config.ts` alongside domain-specific configuration constants and snapshot generation logic. This creates a minor coupling issue: any module that needs address comparison must import from `config.ts`, pulling in the conceptual dependency on configuration even if it only needs the utility.

**Recommendation:** Minor concern. If the codebase grows, consider extracting to a `utils.ts` file.

---

## Style Consistency Observations

| Aspect | Pattern in config.ts | Pattern elsewhere |
|---|---|---|
| Indentation | Mixed 2-space and 4-space | 2-space (types.ts, constants.ts) |
| JSDoc comments | Present on `generateSnapshotBlocks` and `scaleTo18` | Absent in types.ts and constants.ts |
| Trailing commas | Used in arrays (lines 12, 19) | Consistent |
| Semicolons | Present | Present in constants.ts; absent in types.ts (interface fields use `;`) |
| BigInt construction | `BigInt("1" + "0".repeat(...))` | `BigInt(...)`, `...n` literal, `BigInt(10 ** 18)` |

---

## Summary Table

| ID | Severity | Category | Description |
|---|---|---|---|
| A01-1 | MEDIUM | Dead code | Unused `Epoch` import on line 2 |
| A01-2 | MEDIUM | Address casing | Inconsistent address casing across constant arrays |
| A01-3 | LOW | Style | Inconsistent indentation in `scaleTo18` |
| A01-4 | LOW | Style / consistency | Inconsistent BigInt construction method |
| A01-5 | LOW | Defensive coding | `generateSnapshotBlocks` does not guarantee snapshot uniqueness |
| A01-6 | INFO | Coupling | `isSameAddress` utility in config module |
