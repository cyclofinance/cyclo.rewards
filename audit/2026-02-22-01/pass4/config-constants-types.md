# Code Quality Audit - Pass 4 (Agent A11)
## Files: `config.ts`, `constants.ts`, `types.ts`

---

## Evidence of Thorough Reading

### `/Users/thedavidmeister/Code/cyclo.rewards/src/config.ts` (77 lines)

**Imports:** `assert` (line 1), `CyToken`, `Epoch` from `./types` (line 2), `seedrandom` (line 3)

**Exports:**
- `REWARDS_SOURCES` (line 5) - `string[]` constant of 6 approved DEX router/orderbook addresses
- `FACTORIES` (line 14) - `string[]` constant of 4 factory contract addresses
- `CYTOKENS` (line 21) - `CyToken[]` constant containing cysFLR and cyWETH definitions
- `RPC_URL` (line 38) - string constant for Flare RPC endpoint
- `isSameAddress(a: string, b: string): boolean` (line 40) - case-insensitive address comparison
- `generateSnapshotBlocks(seed: string, start: number, end: number): number[]` (line 50) - generates 30 deterministic snapshot block numbers using seedrandom

### `/Users/thedavidmeister/Code/cyclo.rewards/src/constants.ts` (2 lines)

**Exports:**
- `ONE` (line 1) - `BigInt(10 ** 18)` representing 1 token in wei
- `REWARD_POOL` (line 2) - `BigInt(1000000000000000000000000)` representing 1,000,000 tokens in wei

### `/Users/thedavidmeister/Code/cyclo.rewards/src/types.ts` (123 lines)

**Interfaces:**
- `CyToken` (line 1) - fields: `name`, `address`, `underlyingAddress`, `underlyingSymbol`, `receiptAddress`
- `Transfer` (line 9) - fields: `from`, `to`, `value`, `blockNumber`, `timestamp`, `tokenAddress`
- `TransferDetail` (line 18) - fields: `value`, `fromIsApprovedSource`
- `AccountBalance` (line 23) - fields: `transfersInFromApproved`, `transfersOut`, `netBalanceAtSnapshots`, `currentNetBalance`
- `Report` (line 30) - fields: `reporter`, `cheater`
- `AccountSummary` (line 35) - fields: `address`, `balanceAtSnapshot1`, `balanceAtSnapshot2`, `averageBalance`, `penalty`, `bounty`, `finalBalance`, `reports`, `transfers`
- `TokenBalances` (line 58) - fields: `snapshots`, `average`, `penalty`, `bounty`, `final`
- `TransferRecord` (line 70) - fields: `from`, `to`, `value`, `blockNumber`, `timestamp`, `fromIsApprovedSource?`
- `AccountTransfers` (line 79) - fields: `transfersIn`, `transfersOut`

**Type Aliases:**
- `EligibleBalances` (line 66) - `Map<string, Map<string, TokenBalances>>`
- `RewardsPerToken` (line 68) - `Map<string, Map<string, bigint>>`
- `LiquidityChangeBase` (line 90) - base type with 8 fields for liquidity events
- `LiquidityChangeV2` (line 101) - intersection of `LiquidityChangeBase` & `{ __typename: "LiquidityV2Change" }`
- `LiquidityChangeV3` (line 105) - intersection of `LiquidityChangeBase` & `{ __typename: "LiquidityV3Change", tokenId, poolAddress, fee, lowerTick, upperTick }`
- `LiquidityChange` (line 114) - union of `LiquidityChangeV2 | LiquidityChangeV3`
- `Epoch` (line 116) - `{ length: number, timestamp: number, date?: string }`

**Enum:**
- `LiquidityChangeType` (line 84) - values: `Deposit = 'DEPOSIT'`, `Transfer = 'TRANSFER'`, `Withdraw = 'WITHDRAW'`

---

## Findings

### A11-1: Unused import of `Epoch` in `config.ts` (MEDIUM)

**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/config.ts`, line 2

The `Epoch` type is imported from `./types` but is never used anywhere in `config.ts`. The import reads:
```typescript
import { CyToken, Epoch } from "./types";
```
Only `CyToken` is used (for the `CYTOKENS` constant on line 21). This suggests either leftover code from a removed function (possibly one called `generateSnapshotTimestampForEpoch` referenced in the test describe block) or an accidental import.

**Recommendation:** Remove `Epoch` from the import.

---

### A11-2: `generateSnapshotBlocks` does not guarantee unique snapshots (MEDIUM)

**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/config.ts`, lines 50-76

The function generates 28 random blocks plus start and end, but does not deduplicate. With a small block range (e.g., `start=100, end=110`), the 30 generated values will contain many duplicates. Verified experimentally: with range [100, 110] and seed "test", only 10 unique values out of 30 were produced.

While the actual production usage likely has a sufficiently large range (millions of blocks on Flare) making duplicates extremely unlikely, the function does not defend against this edge case. The existing test in `config.test.ts` line 32 asserts `toBeGreaterThan` (strict inequality), which would fail if duplicates occurred in the test's range, but this is only coincidentally safe because the test uses range [5000, 9000].

If duplicate snapshots occur, the reward calculation would over-weight certain block heights, skewing results.

**Recommendation:** Either add deduplication logic (e.g., use a `Set` and keep generating until 30 unique blocks exist), or add a precondition check asserting the range is sufficiently large (e.g., `assert(range >= 30)`).

---

### A11-3: `ONE` constant uses `BigInt(10 ** 18)` with intermediate float (LOW)

**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/constants.ts`, line 1

```typescript
export const ONE = BigInt(10 ** 18);
```

The expression `10 ** 18` is evaluated as a JavaScript `Number` (float64) first, then converted to `BigInt`. `10^18 = 1,000,000,000,000,000,000` exceeds `Number.MAX_SAFE_INTEGER` (9,007,199,254,740,991). However, `10^18` happens to be exactly representable as a float64 because it's a product of powers of 2 and 5 that fits within the 53-bit mantissa when expressed in IEEE 754. So the value is actually correct.

Despite being correct in this specific case, the pattern is fragile and misleading. A reader cannot easily verify correctness without reasoning about float representation, and if the exponent were changed (e.g., `10 ** 19`), precision loss would silently occur.

**Recommendation:** Use `10n ** 18n` (BigInt exponentiation) or `BigInt("1000000000000000000")` to avoid the intermediate float entirely.

---

### A11-4: `REWARD_POOL` uses magic number without expressing intent (LOW)

**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/constants.ts`, line 2

```typescript
export const REWARD_POOL = BigInt(1000000000000000000000000);
```

This is `1,000,000 * 10^18` (1 million tokens in wei), but it's written as a raw 25-digit number. This is hard to visually verify and has the same intermediate-float concern as `ONE` (though this number also happens to be exactly representable as float64).

**Recommendation:** Express as `1_000_000n * 10n ** 18n` or `BigInt("1000000") * ONE` to make the intent (1M tokens) self-documenting and avoid float intermediates.

---

### A11-5: Dead types - `AccountSummary`, `TransferDetail`, `TransferRecord`, `Report` appear unused outside `types.ts` (MEDIUM)

**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/types.ts`

Several exported types have no imports or usages anywhere in the codebase outside their definition file:

| Type | Line | Usages outside `types.ts` |
|------|------|--------------------------|
| `AccountSummary` | 35 | None |
| `TransferDetail` | 18 | Only referenced by `AccountTransfers` (line 80), which is itself only used by `AccountSummary` |
| `TransferRecord` | 70 | None |
| `Report` | 30 | None |

`AccountSummary` contains hardcoded `balanceAtSnapshot1`/`balanceAtSnapshot2` fields (lines 37-38) which assume exactly 2 snapshots, contradicting the rest of the system which uses 30 snapshots. This suggests `AccountSummary` is a legacy type from an earlier design.

`AccountTransfers` (line 79) is only used as a field type of `AccountSummary`, making it transitively dead.

**Recommendation:** Remove `AccountSummary`, `TransferDetail`, `TransferRecord`, `Report`, and `AccountTransfers` if they are confirmed unused. If they are part of a planned API, add a comment indicating their intended use.

---

### A11-6: Inconsistent address casing across `REWARDS_SOURCES`, `FACTORIES`, and `CYTOKENS` (LOW)

**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/config.ts`

Addresses in the configuration arrays use mixed casing:
- `REWARDS_SOURCES` (line 5): First entry is all-lowercase (`0xcee8cd...`), remaining entries use EIP-55 mixed case (`0x0f3D8a...`)
- `FACTORIES` (line 14): All entries use EIP-55 mixed case
- `CYTOKENS` (line 21): Mixed - some addresses are lowercase (`0x1502fa4be69d...` on line 32), others are mixed case

The codebase consistently uses `.toLowerCase()` comparisons (via `isSameAddress` and direct calls), so this is not a correctness bug. However, the inconsistent casing makes the config harder to read and review. EIP-55 checksummed addresses also provide a built-in integrity check that is lost when addresses are lowercased.

**Recommendation:** Normalize all addresses to EIP-55 checksum format. The `viem` library (already a dependency) provides `getAddress()` for this.

---

### A11-7: Misnamed test describe block in `config.test.ts` (INFO)

**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/config.test.ts`, line 4

```typescript
describe('Test generateSnapshotTimestampForEpoch', () => {
```

The describe block is named `generateSnapshotTimestampForEpoch` but the function being tested is `generateSnapshotBlocks`. This is likely a remnant from when the function had a different name or signature, consistent with the unused `Epoch` import in `config.ts` (finding A11-1). This suggests a refactor occurred where an epoch-based timestamp function was replaced with a block-based one, but the test description and import were not cleaned up.

**Recommendation:** Rename the describe block to match the actual function name.

---

### A11-8: `isSameAddress` duplicates functionality available in `viem` (INFO)

**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/config.ts`, line 40

```typescript
export function isSameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}
```

The `viem` library (already a project dependency) provides `isAddressEqual` which performs the same comparison with additional type safety (it validates that both inputs are valid addresses). The custom function works correctly but provides no input validation.

**Recommendation:** Consider using `viem`'s `isAddressEqual` for stronger type guarantees, or document why the simpler version is preferred (e.g., performance in hot paths).

---

### A11-9: `AccountSummary.balanceAtSnapshot1` / `balanceAtSnapshot2` hardcodes 2 snapshots (LOW)

**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/types.ts`, lines 37-38

```typescript
balanceAtSnapshot1: string;
balanceAtSnapshot2: string;
```

The system generates 30 snapshots, and `TokenBalances.snapshots` (line 59) correctly uses `bigint[]`. However, `AccountSummary` hardcodes exactly 2 snapshot balance fields. This is inconsistent with the rest of the type system and the 30-snapshot design.

Since `AccountSummary` appears unused (see A11-5), this is a secondary concern, but it reinforces that this type is stale.

---

### A11-10: Style inconsistency - `interface` vs `type` for object shapes (INFO)

**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/types.ts`

The file mixes `interface` and `type` declarations for object shapes:
- `interface`: `CyToken` (line 1), `Transfer` (line 9), `TransferDetail` (line 18), `AccountBalance` (line 23), `Report` (line 30), `AccountSummary` (line 35), `TokenBalances` (line 58), `TransferRecord` (line 70), `AccountTransfers` (line 79)
- `type`: `LiquidityChangeBase` (line 90), `Epoch` (line 116)

Both `LiquidityChangeBase` and `Epoch` are plain object shapes that could equally be `interface` declarations. The `type` keyword is necessary for `LiquidityChangeV2` and `LiquidityChangeV3` (intersection types) and `LiquidityChange` (union type), but `LiquidityChangeBase` and `Epoch` don't need it.

This is a minor stylistic inconsistency. The choice between `interface` and `type` for object shapes is largely preference, but consistency within a file improves readability.

---

### A11-11: `RPC_URL` is hardcoded rather than configurable via environment (INFO)

**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/config.ts`, line 38

```typescript
export const RPC_URL = "https://flare-api.flare.network/ext/C/rpc";
```

Other configuration values (`SEED`, `START_SNAPSHOT`, `END_SNAPSHOT`) are read from environment variables (per `.env` / CLAUDE.md), but the RPC URL is hardcoded. This prevents using alternative RPC endpoints (e.g., a local node, a private RPC, or a different network) without code changes.

**Recommendation:** Consider making this configurable via `process.env.RPC_URL` with the current value as a default fallback.

---

## Summary

| ID | Severity | File | Description |
|----|----------|------|-------------|
| A11-1 | MEDIUM | config.ts:2 | Unused `Epoch` import |
| A11-2 | MEDIUM | config.ts:50-76 | `generateSnapshotBlocks` allows duplicate snapshots |
| A11-3 | LOW | constants.ts:1 | `BigInt(10 ** 18)` uses intermediate float beyond MAX_SAFE_INTEGER |
| A11-4 | LOW | constants.ts:2 | `REWARD_POOL` is opaque magic number |
| A11-5 | MEDIUM | types.ts | 5 exported types (`AccountSummary`, `TransferDetail`, `TransferRecord`, `Report`, `AccountTransfers`) appear unused |
| A11-6 | LOW | config.ts | Inconsistent address casing across config arrays |
| A11-7 | INFO | config.test.ts:4 | Test describe block name does not match tested function |
| A11-8 | INFO | config.ts:40 | `isSameAddress` duplicates `viem.isAddressEqual` |
| A11-9 | LOW | types.ts:37-38 | `AccountSummary` hardcodes 2 snapshots, system uses 30 |
| A11-10 | INFO | types.ts | Inconsistent use of `interface` vs `type` for object shapes |
| A11-11 | INFO | config.ts:38 | `RPC_URL` hardcoded, not configurable via env |

**Totals:** 0 CRITICAL, 0 HIGH, 3 MEDIUM, 4 LOW, 4 INFO
