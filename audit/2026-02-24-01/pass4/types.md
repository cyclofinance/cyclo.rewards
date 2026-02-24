# A08 -- Code Quality Audit: `src/types.ts`

**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/types.ts`
**Lines:** 128
**Audit date:** 2026-02-24
**Pass:** 4 (Code Quality)

---

## Findings

### A08-1 -- HIGH -- Five exported types are dead code: `Report`, `AccountSummary`, `TransferRecord`, `TransferDetail`, `AccountTransfers`

**Location:** Lines 20-23 (`TransferDetail`), 32-35 (`Report`), 37-58 (`AccountSummary`), 73-81 (`TransferRecord`), 83-86 (`AccountTransfers`)

**Description:** A comprehensive grep of the `src/` directory confirms that these five types are never imported or referenced by any production or test file outside of `types.ts` itself:

| Type | Line | Imported by | Referenced by |
|---|---|---|---|
| `Report` | 32 | None | None |
| `AccountSummary` | 37 | None | None |
| `TransferRecord` | 73 | None | None |
| `TransferDetail` | 20 | None | Only as field type of `AccountTransfers.transfersIn` (line 84) |
| `AccountTransfers` | 83 | `processor.ts` (line 14) | Only as field type of `AccountSummary.transfers` (line 57), and `processor.ts` line 31 |

**Update on `AccountTransfers`:** `AccountTransfers` *is* imported by `processor.ts` (line 14) and used for the `accountTransfers` map (line 31). However, previous audit passes (pass 4 from 2026-02-23) identified that this `accountTransfers` map in `processor.ts` is populated but never read -- making it dead code in the processor as well. The data flows into a structure that is never consumed.

`TransferDetail` and `AccountTransfers` form a dependency chain that terminates at `AccountSummary` (which defines `transfers: AccountTransfers`). Since `AccountSummary` is unused, the entire chain is transitively dead.

`TransferRecord` is a near-duplicate of `Transfer` (see A08-2) and is never instantiated anywhere.

`Report` defines a `reporter`/`cheater` pair but is never used; the blocklist processing in `processor.ts` handles reporter/cheater relationships inline without referencing this type.

**Recommendation:** Remove all five types. If they are intended for a future API surface, add comments indicating planned usage.

---

### A08-2 -- MEDIUM -- `Transfer` and `TransferRecord` are near-duplicates

**Location:** Lines 10-18 (`Transfer`), lines 73-81 (`TransferRecord`)

**Description:** These two interfaces share 5 of 7 fields with identical names and types:

| Field | `Transfer` | `TransferRecord` |
|---|---|---|
| `from` | `string` | `string` |
| `to` | `string` | `string` |
| `value` | `string` | `string` |
| `blockNumber` | `number` | `number` |
| `timestamp` | `number` | `number` |
| `transactionHash` | `string` | `string` |
| `tokenAddress` | `string` | -- |
| `fromIsApprovedSource` | -- | `boolean?` (optional) |

`TransferRecord` drops `tokenAddress` and adds an optional `fromIsApprovedSource`. The two types are not related via `extends` or intersection, so changes to one do not propagate to the other. Since `TransferRecord` is unused (A08-1), this is a secondary concern, but if it were ever revived, the duplication would create a maintenance risk.

**Recommendation:** Remove `TransferRecord` (per A08-1). If retained, define it in terms of `Transfer`:

```typescript
export type TransferRecord = Omit<Transfer, 'tokenAddress'> & {
  fromIsApprovedSource?: boolean;
};
```

---

### A08-3 -- MEDIUM -- `AccountSummary` hardcodes 2 snapshot fields; system uses 30

**Location:** Lines 39-40

**Description:**

```typescript
export interface AccountSummary {
  // ...
  balanceAtSnapshot1: string;
  balanceAtSnapshot2: string;
  // ...
}
```

The system generates 30 snapshots per `generateSnapshotBlocks()`. The related `TokenBalances` interface correctly uses `snapshots: bigint[]` (line 61). `AccountSummary` hardcodes exactly two named snapshot fields, which is incompatible with the 30-snapshot design. This strongly suggests `AccountSummary` is a vestige of an earlier design iteration.

Since `AccountSummary` is unused (A08-1), this is a secondary concern but reinforces that the type is stale.

**Recommendation:** Remove per A08-1.

---

### A08-4 -- LOW -- Mixed type definition keywords: `interface` vs `type`

**Location:** Throughout file

**Description:** The file uses both `interface` and `type` keywords without a clear convention:

| Keyword | Types |
|---|---|
| `interface` | `CyToken`, `Transfer`, `TransferDetail`, `AccountBalance`, `Report`, `AccountSummary`, `TokenBalances`, `TransferRecord`, `AccountTransfers` |
| `type` | `EligibleBalances`, `RewardsPerToken`, `LiquidityChangeBase`, `LiquidityChangeV2`, `LiquidityChangeV3`, `LiquidityChange`, `Epoch` |

The `type` keyword is used for:
1. Type aliases wrapping `Map` (`EligibleBalances`, `RewardsPerToken`) -- justified, since `interface` cannot alias `Map`.
2. Union types (`LiquidityChange`) -- justified, since `interface` cannot express unions.
3. Intersection types (`LiquidityChangeV2`, `LiquidityChangeV3`) -- justified, since `extends` on `interface` would be an alternative but intersection is natural for discriminated unions.
4. Plain object shapes (`LiquidityChangeBase`, `Epoch`) -- these could equally be `interface`.

`LiquidityChangeBase` (line 94) and `Epoch` (line 121) are defined as `type` with object literal syntax, which is functionally identical to `interface` for these cases. The inconsistency is harmless but creates a mild cognitive load.

**Recommendation:** Adopt a convention: use `interface` for named object shapes, `type` for aliases, unions, and intersections. Under this rule, `LiquidityChangeBase` and `Epoch` would become `interface`.

---

### A08-5 -- LOW -- Inline anonymous type in `AccountTransfers.transfersOut`

**Location:** Line 85

**Description:**

```typescript
export interface AccountTransfers {
  transfersIn: TransferDetail[];
  transfersOut: { value: string }[];
}
```

`transfersIn` uses the named `TransferDetail` type, but `transfersOut` uses an anonymous inline `{ value: string }`. This asymmetry means:
1. `transfersOut` elements cannot be referenced by name elsewhere.
2. The conceptual relationship between `transfersIn` and `transfersOut` element types is not expressed.
3. Extending `transfersOut` elements in the future requires finding and updating the inline type.

Since `AccountTransfers` is dead code (A08-1), this is a minor concern.

**Recommendation:** If retained, define a named type for the `transfersOut` element or use `Pick<TransferDetail, 'value'>`.

---

### A08-6 -- LOW -- `Epoch` type is imported in `config.ts` but unused

**Location:** Line 121 (definition), cross-reference to `config.ts` line 2

**Description:** `Epoch` is exported from `types.ts` and imported in `config.ts` line 2, but never referenced in the body of `config.ts`. It is not imported anywhere else. The type defines:

```typescript
export type Epoch = {
  length: number;
  timestamp: number;
  date?: string;
};
```

The test file `config.test.ts` references `generateSnapshotTimestampForEpoch` in a describe block name, but this function does not exist in `config.ts`, suggesting it was removed but the type and test description were not cleaned up.

**Recommendation:** Remove `Epoch` from types.ts (or mark as planned), and remove the unused import from `config.ts`.

---

### A08-7 -- LOW -- Numeric string fields lack documentation on denomination/encoding

**Location:** Lines 13 (`Transfer.value`), 21 (`TransferDetail.value`), 76 (`TransferRecord.value`), 85 (`AccountTransfers.transfersOut[].value`), 99 (`LiquidityChangeBase.liquidityChange`, `depositedBalanceChange`), 39-44 (`AccountSummary` string fields)

**Description:** Multiple interfaces use `string` for fields that represent numeric values (wei amounts, balance amounts). There is no documentation indicating:
- Whether these are decimal strings, hex strings, or something else
- What denomination they are in (wei, tokens, etc.)
- Why `string` is used instead of `bigint`

The likely reason is that JSON serialization (for `.dat` files) does not support `bigint`, so values are stored as decimal strings and parsed to `bigint` at processing time. This is a reasonable design, but the implicit contract is undocumented.

Contrast with `TokenBalances` and `AccountBalance`, which use `bigint` for their fields -- these represent in-memory computed values rather than serialized data.

**Recommendation:** Add brief comments on at least `Transfer.value` and `LiquidityChangeBase.liquidityChange` / `depositedBalanceChange` documenting that these are decimal string representations of wei values from JSON serialization.

---

### A08-8 -- INFO -- Zero JSDoc comments across 17 exported definitions

**Location:** All definitions

**Description:** The file exports 17 type definitions (9 interfaces, 1 enum, 7 type aliases) with zero JSDoc comments. The only documentation consists of:
- End-of-line comments on `EligibleBalances` (line 69) and `RewardsPerToken` (line 71)
- Field-level comments on `Epoch` (lines 122-123, 125)

Contrast with `config.ts` which has JSDoc on `generateSnapshotBlocks` and `scaleTo18`.

**Recommendation:** Add JSDoc to at least the actively-used types: `CyToken`, `Transfer`, `AccountBalance`, `TokenBalances`, `EligibleBalances`, `RewardsPerToken`, and the `LiquidityChange` family.

---

### A08-9 -- INFO -- `AccountSummary.reports` uses deeply nested anonymous types

**Location:** Lines 45-56

**Description:**

```typescript
reports: {
  asReporter: {
    cheater: string;
    penalizedAmount: string;
    bountyAwarded: string;
  }[];
  asCheater: {
    reporter: string;
    penalizedAmount: string;
    bountyAwarded: string;
  }[];
};
```

The `reports` field contains two levels of anonymous inline types. The `asReporter` and `asCheater` array element types share two of three fields (`penalizedAmount`, `bountyAwarded`) but differ in the third (`cheater` vs `reporter`). These are not extractable as named types, making them harder to reference, validate, or test.

Since `AccountSummary` is dead code (A08-1), this is informational only.

**Recommendation:** Remove per A08-1. If retained, extract named types.

---

## Cross-File Consistency Observations

### BigInt construction patterns across the three files

| File | Method | Example |
|---|---|---|
| `config.ts` | `BigInt("1" + "0".repeat(...))` | Line 97 |
| `constants.ts` | `BigInt(10 ** 18)` | Line 1 |
| `constants.ts` | `BigInt(500000000000000000000000)` | Line 3 |
| `constants.ts` | `...n` literal | Line 4 |
| `types.ts` | N/A (no BigInt values) | -- |

Four distinct BigInt construction idioms across two files. The `...n` literal syntax is the safest and most readable.

### Address representation

All three files use plain `string` for Ethereum addresses. There is no branded type or use of `viem`'s `Address` (`0x${string}`) to distinguish addresses from arbitrary strings at the type level. The `isSameAddress` function in `config.ts` provides runtime normalization, but the type system does not enforce that addresses pass through this normalization.

### Documentation density

| File | JSDoc comments | Inline comments |
|---|---|---|
| `config.ts` | 2 (on functions) | 6 (on addresses) |
| `constants.ts` | 0 | 1 (CSV format reference) |
| `types.ts` | 0 | 4 (on type aliases and Epoch fields) |

---

## Summary Table

| ID | Severity | Category | Description |
|---|---|---|---|
| A08-1 | HIGH | Dead code | 5 exported types (`Report`, `AccountSummary`, `TransferRecord`, `TransferDetail`, `AccountTransfers`) are unused |
| A08-2 | MEDIUM | Redundancy | `Transfer` and `TransferRecord` are near-duplicates |
| A08-3 | MEDIUM | Staleness | `AccountSummary` hardcodes 2 snapshots; system uses 30 |
| A08-4 | LOW | Style | Mixed `interface` vs `type` for plain object shapes |
| A08-5 | LOW | Style | Inline anonymous type in `AccountTransfers.transfersOut` |
| A08-6 | LOW | Dead code | `Epoch` type defined but unused beyond a dead import in `config.ts` |
| A08-7 | LOW | Documentation | Numeric string fields lack denomination/encoding docs |
| A08-8 | INFO | Documentation | Zero JSDoc across 17 exported definitions |
| A08-9 | INFO | Style | Deeply nested anonymous types in `AccountSummary.reports` |
