# Audit Pass 4 — Code Quality — `src/types.ts`

**Agent:** A08
**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/types.ts`
**Date:** 2026-02-23

---

### A08-1 — HIGH — Three exported types are completely unused: `Report`, `AccountSummary`, `TransferRecord`

The following types are defined and exported in `src/types.ts` but are never imported or referenced anywhere else in the codebase (no usage in any `.ts` file outside of `types.ts` itself):

- **`Report`** (line 30) -- Defined with `reporter` and `cheater` fields, never imported.
- **`AccountSummary`** (line 35) -- A detailed interface with nested inline types for reports, never imported.
- **`TransferRecord`** (line 70) -- Nearly identical to `Transfer` but with an optional `fromIsApprovedSource` field, never imported.

Dead exported types increase cognitive overhead for developers, suggest incomplete refactoring, and risk becoming silently stale relative to the actual data structures in use.

**Recommendation:** Remove these three types, or if they are intended for future use, mark them with a `// TODO` comment explaining the planned usage.

---

### A08-2 — MEDIUM — `TransferRecord` is a near-duplicate of `Transfer`

`Transfer` (line 9):
```typescript
export interface Transfer {
  from: string;
  to: string;
  value: string;
  blockNumber: number;
  timestamp: number;
  tokenAddress: string;
}
```

`TransferRecord` (line 70):
```typescript
export interface TransferRecord {
  from: string;
  to: string;
  value: string;
  blockNumber: number;
  timestamp: number;
  fromIsApprovedSource?: boolean;
}
```

These share 5 of 6 fields. `TransferRecord` drops `tokenAddress` and adds an optional `fromIsApprovedSource`. This is a structural overlap that suggests `TransferRecord` should either extend `Transfer` (via `Omit<Transfer, 'tokenAddress'> & { fromIsApprovedSource?: boolean }`) or be consolidated into a single type. Since `TransferRecord` is unused (see A08-1), the simplest fix is to remove it entirely.

---

### A08-3 — MEDIUM — `TransferDetail` is only used internally within `AccountTransfers`, never independently

`TransferDetail` (line 18) is exported but its only usage is as the element type of `AccountTransfers.transfersIn` (line 80). It is never imported by name in any other file. While not strictly dead code (it is reachable through `AccountTransfers`), exporting it as a standalone top-level type is misleading since it has no independent consumers.

**Recommendation:** Either inline the type within `AccountTransfers` or keep it but add a comment clarifying it is a sub-type of `AccountTransfers`.

---

### A08-4 — LOW — Inconsistent use of `interface` vs `type` for object shapes

The file mixes `interface` and `type` declarations for plain object shapes with no clear rationale:

- `interface`: `CyToken`, `Transfer`, `TransferDetail`, `AccountBalance`, `Report`, `AccountSummary`, `TokenBalances`, `TransferRecord`, `AccountTransfers` (lines 1-82)
- `type`: `LiquidityChangeBase`, `LiquidityChangeV2`, `LiquidityChangeV3`, `Epoch` (lines 90-122)

The `type` keyword is justified for `LiquidityChangeV2` and `LiquidityChangeV3` because they use intersection (`&`) to extend `LiquidityChangeBase`. However, `LiquidityChangeBase` itself and `Epoch` are plain object shapes that could just as well be `interface` declarations for consistency with the rest of the file.

**Recommendation:** Use `interface` consistently for standalone object shapes, reserving `type` for unions, intersections, and aliases. Alternatively, adopt `type` everywhere and document the convention.

---

### A08-5 — LOW — `AccountSummary` hardcodes `balanceAtSnapshot1` and `balanceAtSnapshot2` instead of using an array

```typescript
balanceAtSnapshot1: string;
balanceAtSnapshot2: string;
```

The system uses 30 snapshot blocks (per CLAUDE.md and `generateSnapshotBlocks()`), yet this type names only two snapshots. If this type were ever used, it would not generalize to the actual snapshot count. The related `TokenBalances` interface correctly uses `snapshots: bigint[]`.

This is a lesser concern since `AccountSummary` is unused (A08-1), but if it is ever revived, the hardcoded snapshot fields will be incorrect.

**Recommendation:** If `AccountSummary` is retained, replace the two named fields with `balancesAtSnapshots: string[]` to mirror `TokenBalances.snapshots`.

---

### A08-6 — LOW — Inline anonymous type `{ value: string }` in `AccountTransfers.transfersOut`

```typescript
export interface AccountTransfers {
  transfersIn: TransferDetail[];
  transfersOut: { value: string }[];
}
```

`transfersIn` uses the named `TransferDetail` type, but `transfersOut` uses an anonymous inline object type `{ value: string }`. This asymmetry reduces readability and makes it harder to extend `transfersOut` in the future. The anonymous type `{ value: string }` is also a subset of `TransferDetail` (which has `value: string` and `fromIsApprovedSource: boolean`), so there is a conceptual relationship that is not made explicit.

**Recommendation:** Define a named type (e.g., `TransferOutDetail`) for the `transfersOut` element type, or use `Pick<TransferDetail, 'value'>` to make the relationship to `TransferDetail` explicit.

---

### A08-7 — INFO — No JSDoc comments on any type or field

None of the 15 exported types/interfaces/enums have JSDoc comments. The inline comments on `EligibleBalances` and `RewardsPerToken` (e.g., `// token address -> user address -> balances`) are helpful but use end-of-line comments rather than JSDoc. Fields like `CyToken.receiptAddress`, `AccountBalance.transfersInFromApproved`, and `TokenBalances.penalty` would benefit from brief documentation explaining their semantics.

**Recommendation:** Add JSDoc comments to at least the non-obvious types and fields, particularly `CyToken`, `AccountBalance`, `TokenBalances`, and the `LiquidityChange` family.

---

### A08-8 — INFO — `LiquidityChangeBase` is never directly referenced outside `types.ts`

`LiquidityChangeBase` (line 90) is exported but only used within `types.ts` itself to compose `LiquidityChangeV2` and `LiquidityChangeV3`. No other file imports `LiquidityChangeBase`. It serves a legitimate structural role as a base for intersection types, but exporting it invites external consumers to use it directly when they should be using the discriminated union `LiquidityChange` or one of its variants.

**Recommendation:** Consider not exporting `LiquidityChangeBase`, making it file-private. If external code needs the common fields, they can use `LiquidityChange` and narrow via the `__typename` discriminant.

---

## Summary

| ID    | Severity | Category               | Description                                              |
|-------|----------|------------------------|----------------------------------------------------------|
| A08-1 | HIGH     | Dead code              | 3 exported types (`Report`, `AccountSummary`, `TransferRecord`) are completely unused |
| A08-2 | MEDIUM   | Redundancy             | `TransferRecord` near-duplicates `Transfer`              |
| A08-3 | MEDIUM   | Dead code / scope      | `TransferDetail` only used as sub-type of `AccountTransfers` |
| A08-4 | LOW      | Style inconsistency    | Mixed `interface` vs `type` for plain object shapes      |
| A08-5 | LOW      | Design / correctness   | `AccountSummary` hardcodes 2 snapshots, system uses 30   |
| A08-6 | LOW      | Style inconsistency    | Inline anonymous type in `AccountTransfers.transfersOut`  |
| A08-7 | INFO     | Documentation          | No JSDoc comments on any type or field                   |
| A08-8 | INFO     | Encapsulation          | `LiquidityChangeBase` exported but only used internally  |
