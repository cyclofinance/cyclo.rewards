# Documentation Audit - Pass 3 (Remaining Files)

**Agent:** A10
**Date:** 2026-02-22
**Scope:** `constants.ts`, `diffCalculator.ts`, `index.ts`, `liquidity.ts`, `scraper.ts`, `types.ts`

---

## File Inventories

### 1. `src/constants.ts` (2 lines)

| Export | Kind | Line |
|--------|------|------|
| `ONE` | `const` (BigInt) | 1 |
| `REWARD_POOL` | `const` (BigInt) | 2 |

No functions. No JSDoc or inline comments.

### 2. `src/diffCalculator.ts` (139 lines)

| Export / Symbol | Kind | Line |
|-----------------|------|------|
| `DISTRIBUTED_COUNT` | `const` (101, module-private) | 4 |
| `readCsv` | exported function | 10-44 |
| `main` | function (module-private) | 46-136 |

JSDoc present: `readCsv` (lines 6-9).

### 3. `src/index.ts` (242 lines)

| Export / Symbol | Kind | Line |
|-----------------|------|------|
| `START_SNAPSHOT` | `const` (module-private) | 10 |
| `END_SNAPSHOT` | `const` (module-private) | 11 |
| `REWARDS_CSV_COLUMN_HEADER_ADDRESS` | `const` (module-private) | 15 |
| `REWARDS_CSV_COLUMN_HEADER_REWARD` | `const` (module-private) | 16 |
| `main` | `async function` (module-private) | 18-236 |

No exported functions. No JSDoc on any symbol.

### 4. `src/liquidity.ts` (95 lines)

| Export / Symbol | Kind | Line |
|-----------------|------|------|
| `abi` | `const` (module-private, slot0 ABI) | 3-47 |
| `getPoolsTickMulticall` | exported async function | 49-76 |
| `getPoolsTick` | exported async function | 79-95 |

JSDoc present: `getPoolsTick` (line 78).

### 5. `src/scraper.ts` (244 lines)

| Export / Symbol | Kind | Line |
|-----------------|------|------|
| `SUBGRAPH_URL` | `const` (module-private) | 9-10 |
| `BATCH_SIZE` | `const` (module-private) | 11 |
| `UNTIL_SNAPSHOT` | `const` (module-private) | 16 |
| `SubgraphTransfer` | interface (module-private) | 18-26 |
| `SubgraphLiquidityChangeBase` | type (module-private) | 28-38 |
| `SubgraphLiquidityChangeV2` | type (module-private) | 40-42 |
| `SubgraphLiquidityChangeV3` | type (module-private) | 44-51 |
| `SubgraphLiquidityChange` | exported type | 53 |
| `scrapeTransfers` | async function (module-private) | 55-129 |
| `scrapeLiquidityChanges` | async function (module-private) | 131-236 |
| `main` | async function (module-private) | 239-242 |

No JSDoc on any function or type (only inline comments on lines 13-14, 238).

### 6. `src/types.ts` (122 lines)

| Export / Symbol | Kind | Line |
|-----------------|------|------|
| `CyToken` | interface | 1-7 |
| `Transfer` | interface | 9-16 |
| `TransferDetail` | interface | 18-21 |
| `AccountBalance` | interface | 23-28 |
| `Report` | interface | 30-33 |
| `AccountSummary` | interface | 35-56 |
| `TokenBalances` | interface | 58-64 |
| `EligibleBalances` | type alias | 66 |
| `RewardsPerToken` | type alias | 68 |
| `TransferRecord` | interface | 70-77 |
| `AccountTransfers` | interface | 79-82 |
| `LiquidityChangeType` | enum | 84-88 |
| `LiquidityChangeBase` | type | 90-99 |
| `LiquidityChangeV2` | type | 101-103 |
| `LiquidityChangeV3` | type | 105-112 |
| `LiquidityChange` | type alias | 114 |
| `Epoch` | type | 116-122 |

Inline comments on `EligibleBalances` (line 66), `RewardsPerToken` (line 68), and `Epoch` fields (lines 117-120). No JSDoc on any type or interface.

---

## Findings

### A10-1: `readCsv` JSDoc says it returns "an array and map" but implementation returns only an array (MEDIUM)

**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/diffCalculator.ts`, lines 6-9

**JSDoc states:**
```
Reads a CSV file and returns the data as an array and map
```

**Implementation (line 10) returns:**
```typescript
export function readCsv(filePath: string): Array<{address: string; reward: bigint}>
```

The function returns only `Array<{address: string; reward: bigint}>`. There is no `Map` in the return type. The documentation is inaccurate and misleading.

---

### A10-2: `getPoolsTickMulticall` is exported but has no documentation (MEDIUM)

**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/liquidity.ts`, lines 49-76

This is a public/exported function that performs a multicall to read Uniswap V3 pool `slot0` data at a specific block number, extracting current tick values. It accepts a `PublicClient`, an array of pool addresses, and a block number. No JSDoc or inline comment describes its purpose, parameters, return value, or the significance of the multicall address.

---

### A10-3: `getPoolsTick` JSDoc is incomplete (LOW)

**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/liquidity.ts`, line 78

**JSDoc states:**
```
/** Tries to get pools ticks (with max 3 retries) */
```

The JSDoc omits:
- `@param` descriptions for `client`, `pools`, `blockNumber`
- `@returns` description
- No mention of the 10-second exponential backoff delay between retries
- The description says "max 3 retries" but the code does 3 attempts (loop `i < 3`), which is 2 retries after the first attempt. The wording is ambiguous -- "3 retries" could mean 4 total attempts.

Looking at the implementation: the loop runs `i = 0, 1, 2` (3 iterations). On failure at `i >= 2` (i.e., `i === 2`, the third attempt), it throws. So there are 3 total attempts (1 initial + 2 retries). The JSDoc saying "max 3 retries" is technically inaccurate if "retry" means "re-attempt after failure" -- there are only 2 retries.

---

### A10-4: `constants.ts` -- `ONE` and `REWARD_POOL` have no documentation (LOW)

**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/constants.ts`, lines 1-2

Both exported constants lack any JSDoc or comment. `ONE` represents 1e18 (the standard EVM decimal scaling factor). `REWARD_POOL` is `1_000_000 * 1e18` (1 million tokens in wei). Neither has documentation explaining its purpose or units.

---

### A10-5: `REWARD_POOL` uses a raw numeric literal instead of deriving from `ONE` (LOW)

**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/constants.ts`, line 2

```typescript
export const ONE = BigInt(10 ** 18);
export const REWARD_POOL = BigInt(1000000000000000000000000);
```

`REWARD_POOL` is written as a raw 25-digit numeric literal rather than being expressed as `1_000_000n * ONE` or `BigInt(1_000_000) * ONE`. This makes it harder to verify the intended value at a glance and is a maintainability concern. The relationship between the two constants is not documented.

---

### A10-6: All types and interfaces in `types.ts` lack JSDoc (MEDIUM)

**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/types.ts`, lines 1-122

18 exported types/interfaces/enums have no JSDoc documentation. These are the core domain types used throughout the codebase:

- `CyToken` -- no docs on what a CyToken represents or what each field means (e.g., `receiptAddress`)
- `Transfer` -- no docs
- `TransferDetail` -- no docs on what `fromIsApprovedSource` means
- `AccountBalance` -- no docs on the difference between `transfersInFromApproved`, `netBalanceAtSnapshots`, `currentNetBalance`
- `Report` -- no docs
- `AccountSummary` -- no docs (complex nested structure)
- `TokenBalances` -- no docs on the meaning of `penalty`, `bounty`, `final` or how they relate
- `EligibleBalances` -- only an inline comment `// token address -> user address -> balances`
- `RewardsPerToken` -- only an inline comment `// token address -> user address -> reward`
- `TransferRecord` -- no docs on how it differs from `Transfer`
- `AccountTransfers` -- no docs
- `LiquidityChangeType` -- no docs
- `LiquidityChangeBase`, `LiquidityChangeV2`, `LiquidityChangeV3`, `LiquidityChange` -- no docs
- `Epoch` -- inline comments on fields only (`length`, `timestamp`)

---

### A10-7: `index.ts` `main()` function has no documentation (LOW)

**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/index.ts`, lines 18-236

The main entry point orchestrating the entire pipeline (read data files, process transfers, process liquidity, compute balances, compute rewards, write CSVs) has no JSDoc. The function is 218 lines long. While it is not exported, it is the primary entry point for `npm run start`.

---

### A10-8: `scraper.ts` functions `scrapeTransfers` and `scrapeLiquidityChanges` have no documentation (MEDIUM)

**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/scraper.ts`

- `scrapeTransfers` (line 55) -- No JSDoc. This is a core pipeline function that fetches all transfer events from the Goldsky subgraph in batches of 1000, filters by `END_SNAPSHOT`, and writes to `data/transfers.dat` in JSONL format.
- `scrapeLiquidityChanges` (line 131) -- No JSDoc. Fetches all liquidity change events (V2 and V3), collects V3 pool addresses, writes to `data/liquidity.dat` and `data/pools.dat`.
- `main` (line 239) -- Has only an inline comment. No JSDoc.

---

### A10-9: `SubgraphLiquidityChange` is the only exported type from `scraper.ts` and has no documentation (LOW)

**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/scraper.ts`, line 53

```typescript
export type SubgraphLiquidityChange = SubgraphLiquidityChangeV2 | SubgraphLiquidityChangeV3
```

This union type is exported but lacks documentation explaining when each variant applies or what the discriminant (`__typename`) values mean.

---

### A10-10: `diffCalculator.ts` `main()` has hardcoded file paths and magic number with no documentation (MEDIUM)

**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/diffCalculator.ts`, lines 46-136

The `main` function:
- Uses `DISTRIBUTED_COUNT = 101` (line 4) with no documentation explaining why 101 accounts were distributed or what this constant represents.
- Hardcodes file paths like `./output/rewards-51504517-52994045.csv` and `./output/rewards-51504517-52994045-old.csv` without explanation.
- Contains typos in comments: "distirbuted" (line 51), "undistruibuted" (line 57), "thos" (line 57), "Receieved" (line 54).
- Has no JSDoc or module-level comment explaining that this is a special-purpose script for the December 2025 rewards recalculation case.

---

### A10-11: `scraper.ts` `SUBGRAPH_URL` hardcodes a versioned subgraph endpoint with no documentation (LOW)

**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/scraper.ts`, lines 9-10

```typescript
const SUBGRAPH_URL =
  "https://api.goldsky.com/api/public/project_cm4zggfv2trr301whddsl9vaj/subgraphs/cyclo-flare/2025-12-30-6559/gn";
```

The URL contains a version identifier (`2025-12-30-6559`) but there is no comment explaining what version this is, when it was deployed, or when/why it might need updating.

---

### A10-12: `liquidity.ts` hardcodes multicall address without documentation (LOW)

**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/liquidity.ts`, line 58

```typescript
multicallAddress: "0xcA11bde05977b3631167028862bE2a173976CA11",
```

This is the well-known Multicall3 contract address, but there is no comment identifying it or noting which network it is deployed on (Flare Network).

---

### A10-13: `index.ts` references an external specification without documenting the format (INFO)

**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/index.ts`, lines 13-16

```typescript
// Must match expected structure
// https://github.com/flare-foundation/rnat-distribution-tool/blob/main/README.md#add-csv-file-with-rewards-data
const REWARDS_CSV_COLUMN_HEADER_ADDRESS = "recipient address";
const REWARDS_CSV_COLUMN_HEADER_REWARD = "amount wei";
```

The inline comment references an external URL, which is good. However, the constants are module-private and there is no documentation on the overall CSV output format requirements.

---

### A10-14: `types.ts` `Transfer` and `TransferRecord` overlap significantly with no documentation explaining their difference (MEDIUM)

**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/types.ts`

`Transfer` (lines 9-16):
```typescript
export interface Transfer {
  from: string; to: string; value: string;
  blockNumber: number; timestamp: number; tokenAddress: string;
}
```

`TransferRecord` (lines 70-77):
```typescript
export interface TransferRecord {
  from: string; to: string; value: string;
  blockNumber: number; timestamp: number;
  fromIsApprovedSource?: boolean;
}
```

These two interfaces share 5 of 6 fields. `Transfer` has `tokenAddress` while `TransferRecord` has an optional `fromIsApprovedSource`. There is no documentation explaining why both exist, when each should be used, or whether they should be consolidated.

---

### A10-15: `getPoolsTick` parameter type mismatch with `getPoolsTickMulticall` (HIGH)

**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/liquidity.ts`

`getPoolsTickMulticall` (line 52) accepts `blockNumber: bigint`.
`getPoolsTick` (line 82) accepts `blockNumber: number`, then converts to `BigInt(blockNumber)` on line 87.

This inconsistency in the public API means callers of `getPoolsTick` are limited to `number` precision (safe up to 2^53-1), while `getPoolsTickMulticall` correctly uses `bigint`. For Flare block numbers this is currently safe, but the inconsistency is undocumented and could be a source of subtle bugs if block numbers ever exceed `Number.MAX_SAFE_INTEGER`. The parameter type difference between these two closely related functions should at minimum be documented.

---

## Summary Table

| ID | Severity | File | Description |
|----|----------|------|-------------|
| A10-1 | MEDIUM | `diffCalculator.ts` | `readCsv` JSDoc claims return includes "array and map" but only returns array |
| A10-2 | MEDIUM | `liquidity.ts` | `getPoolsTickMulticall` (exported) has no documentation |
| A10-3 | LOW | `liquidity.ts` | `getPoolsTick` JSDoc is incomplete; "3 retries" is inaccurate (only 2 retries) |
| A10-4 | LOW | `constants.ts` | `ONE` and `REWARD_POOL` have no documentation |
| A10-5 | LOW | `constants.ts` | `REWARD_POOL` uses raw literal instead of deriving from `ONE` |
| A10-6 | MEDIUM | `types.ts` | All 18 exported types/interfaces/enums lack JSDoc |
| A10-7 | LOW | `index.ts` | `main()` (218-line entry point) has no documentation |
| A10-8 | MEDIUM | `scraper.ts` | `scrapeTransfers` and `scrapeLiquidityChanges` have no documentation |
| A10-9 | LOW | `scraper.ts` | Exported `SubgraphLiquidityChange` type has no documentation |
| A10-10 | MEDIUM | `diffCalculator.ts` | `main()` has magic numbers, hardcoded paths, typos, no docs |
| A10-11 | LOW | `scraper.ts` | Hardcoded versioned subgraph URL with no documentation |
| A10-12 | LOW | `liquidity.ts` | Hardcoded Multicall3 address with no documentation |
| A10-13 | INFO | `index.ts` | External spec reference is good but format is not fully documented |
| A10-14 | MEDIUM | `types.ts` | `Transfer` and `TransferRecord` overlap with no docs explaining difference |
| A10-15 | HIGH | `liquidity.ts` | `blockNumber` type mismatch (`number` vs `bigint`) between related public functions |

**Totals:** 1 HIGH, 6 MEDIUM, 7 LOW, 1 INFO
