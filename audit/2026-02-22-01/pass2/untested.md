# Test Coverage Audit - Pass 2: Untested Source Files

**Audit Date:** 2026-02-22
**Agent ID:** A09
**Scope:** Source files with no corresponding test files

---

## Files Analyzed

| Source File | Test File Exists | Indirect Coverage |
|---|---|---|
| `src/scraper.ts` | No | None |
| `src/constants.ts` | No | Partial (indirect) |
| `src/index.ts` | No | None |
| `src/types.ts` | No | Partial (indirect, type-only) |

---

## File-by-File Evidence of Thorough Reading

### 1. `src/scraper.ts` (245 lines)

**Module-level constants and configuration:**
- `SUBGRAPH_URL` (line 9-10): Hardcoded Goldsky GraphQL endpoint
- `BATCH_SIZE` (line 11): 1000
- `UNTIL_SNAPSHOT` (line 16): Derived from `process.env.END_SNAPSHOT + 1`
- `config()` call at line 7 (dotenv)
- `assert(process.env.END_SNAPSHOT, ...)` at line 15 (runtime assertion)

**Types defined (local, not exported except one):**
- `SubgraphTransfer` (interface, line 18-26)
- `SubgraphLiquidityChangeBase` (type, line 28-38)
- `SubgraphLiquidityChangeV2` (type, line 40-42)
- `SubgraphLiquidityChangeV3` (type, line 44-51)
- `SubgraphLiquidityChange` (exported type, line 53) -- union of V2 and V3

**Functions defined:**
- `scrapeTransfers()` (async, line 55-129): Fetches transfers from subgraph in batches, writes to `data/transfers.dat`
- `scrapeLiquidityChanges()` (async, line 131-236): Fetches liquidity changes from subgraph in batches, writes to `data/liquidity.dat` and `data/pools.dat`
- `main()` (async, line 239-242): Orchestrates both scrape functions
- Top-level `main().catch(console.error)` (line 244): Entry point

**Imports used:** `graphql-request`, `fs/promises`, `./types`, `dotenv`, `assert`

### 2. `src/constants.ts` (2 lines)

**Constants defined:**
- `ONE` (line 1): `BigInt(10 ** 18)` -- 1e18 as BigInt, used for fixed-point arithmetic precision
- `REWARD_POOL` (line 2): `BigInt(1000000000000000000000000)` -- 1,000,000 tokens (1M * 1e18)

**Consumers (production code):**
- `src/processor.ts` line 19: imports `ONE`, used at line 355 for inverse fraction calculation
- `src/index.ts` line 5: imports `REWARD_POOL`, used at lines 157, 232, 233
- `src/diffCalculator.ts` line 2: imports `REWARD_POOL`, used at line 80

### 3. `src/index.ts` (242 lines)

**Module-level constants:**
- `START_SNAPSHOT` (line 10): `parseInt(process.env.START_SNAPSHOT || "0")`
- `END_SNAPSHOT` (line 11): `parseInt(process.env.END_SNAPSHOT || "0")`
- `REWARDS_CSV_COLUMN_HEADER_ADDRESS` (line 15): `"recipient address"`
- `REWARDS_CSV_COLUMN_HEADER_REWARD` (line 16): `"amount wei"`

**Functions defined:**
- `main()` (async, line 18-236): Full pipeline:
  - Generates snapshot blocks (line 20)
  - Writes snapshots to file (lines 23-26)
  - Creates output directory (line 32)
  - Reads `data/transfers.dat` (lines 36-41)
  - Reads `data/liquidity.dat` (lines 45-50)
  - Reads `data/pools.dat` (lines 54-56)
  - Reads `data/blocklist.txt` (lines 60-71)
  - Instantiates `Processor` (line 75)
  - Processes all transfers in loop (lines 80-87)
  - Processes all liquidity changes in loop (lines 92-99)
  - Calls `processor.processLpRange()` (line 103)
  - Gets eligible balances (line 108)
  - Per-token balance logging (lines 111-145)
  - Writes `balances-*.csv` (lines 148-200)
  - Calculates rewards (line 157)
  - Sorts addresses by total rewards (lines 173-178)
  - Writes `rewards-*.csv` (lines 212-224)
  - Verifies total rewards vs. pool (lines 227-233)
- Top-level `main().catch(...)` with `process.exit(1)` (lines 238-241)

**Imports used:** `fs/promises`, `./processor`, `dotenv`, `./config`, `./constants`

### 4. `src/types.ts` (123 lines)

**Interfaces defined:**
- `CyToken` (line 1-7): `name`, `address`, `underlyingAddress`, `underlyingSymbol`, `receiptAddress`
- `Transfer` (line 9-16): `from`, `to`, `value`, `blockNumber`, `timestamp`, `tokenAddress`
- `TransferDetail` (line 18-21): `value`, `fromIsApprovedSource`
- `AccountBalance` (line 23-28): `transfersInFromApproved`, `transfersOut`, `netBalanceAtSnapshots`, `currentNetBalance`
- `Report` (line 30-33): `reporter`, `cheater`
- `AccountSummary` (line 35-56): `address`, `balanceAtSnapshot1`, `balanceAtSnapshot2`, `averageBalance`, `penalty`, `bounty`, `finalBalance`, `reports`, `transfers`
- `TokenBalances` (line 58-64): `snapshots`, `average`, `penalty`, `bounty`, `final`
- `TransferRecord` (line 70-77): `from`, `to`, `value`, `blockNumber`, `timestamp`, `fromIsApprovedSource?`
- `AccountTransfers` (line 79-82): `transfersIn`, `transfersOut`

**Type aliases defined:**
- `EligibleBalances` (line 66): `Map<string, Map<string, TokenBalances>>`
- `RewardsPerToken` (line 68): `Map<string, Map<string, bigint>>`
- `LiquidityChangeBase` (line 90-99)
- `LiquidityChangeV2` (line 101-103)
- `LiquidityChangeV3` (line 105-112)
- `LiquidityChange` (line 114): Union of V2 and V3
- `Epoch` (line 116-122): `length`, `timestamp`, `date?`

**Enums defined:**
- `LiquidityChangeType` (line 84-88): `Deposit = 'DEPOSIT'`, `Transfer = 'TRANSFER'`, `Withdraw = 'WITHDRAW'`

---

## Indirect Test Coverage Analysis

### Constants (`src/constants.ts`)

- **`ONE`**: Not directly imported in any test file. However, `processor.test.ts` defines its own local `ONE = "1000000000000000000"` and `ONEn = 1000000000000000000n` (lines 22-23) which mirror the same value. The constant `ONE` is used in production code at `processor.ts` line 355 in `calculateRewardsPoolsPertoken()`, and that method is exercised by `processor.test.ts` reward calculation tests. So `ONE` has **indirect coverage through processor tests**, but its actual exported value is never directly validated.
- **`REWARD_POOL`**: Not imported in any test file. `diffCalculator.test.ts` does not import it. `diffCalculatorOutput.test.ts` does not import it. `processor.test.ts` uses local `ONEn` and `1_000_000n * ONEn` as reward pool values. The production `REWARD_POOL` value (1e24) is **never directly tested or asserted**.

### Types (`src/types.ts`)

- Types are imported and used structurally in `processor.test.ts` (line 4: `LiquidityChange`, `LiquidityChangeType`, `Transfer`). The enum `LiquidityChangeType` is used at runtime in tests (e.g., `LiquidityChangeType.Deposit` at line 532).
- However, this is **structural/type-level usage only** -- there are no tests that validate the types themselves (which would be unusual for TypeScript interfaces, though the enum has runtime behavior).
- `AccountSummary` and `TransferRecord` are defined but **never referenced** in any test file and appear unused in production code as well.

### Scraper (`src/scraper.ts`)

- No test file references scraper functions. `scrapeTransfers()` and `scrapeLiquidityChanges()` are not exported and are not tested anywhere.
- The `SubgraphLiquidityChange` type is exported but not imported in any test.

### Index (`src/index.ts`)

- No test file references index.ts. The `main()` function is not exported and is not tested anywhere.

---

## Findings

### A09-1: `scraper.ts` has zero test coverage [HIGH]

**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/scraper.ts`

**Details:** The scraper module contains three functions (`scrapeTransfers`, `scrapeLiquidityChanges`, `main`) with significant logic:
- GraphQL query construction and pagination (batch loop with `skip`/`hasMore` at lines 56-128 and 132-236)
- Data transformation from subgraph response types to internal types (lines 100-107 and 185-207)
- Conditional V3-specific field mapping (`tokenId`, `poolAddress`, `fee`, `lowerTick`, `upperTick` at lines 197-206)
- V3 pool address collection into a Set (line 205)
- File I/O for progress saving (lines 118-121, 219-222, 229-232)

None of these functions are exported (except the type `SubgraphLiquidityChange`), making them untestable without refactoring. The data transformation logic is particularly risky since incorrect mapping (e.g., wrong field names, missing parseInt conversions) would silently produce corrupt `.dat` files that downstream processing consumes.

**Specific untested logic:**
- `parseInt(t.blockNumber)` and `parseInt(t.blockTimestamp)` conversions (lines 105-106, 194-195)
- `parseInt(t.fee)`, `parseInt(t.lowerTick)`, `parseInt(t.upperTick)` conversions (lines 200-202)
- V3 vs V2 discriminated union handling (line 197: `if (t.__typename === "LiquidityV3Change")`)
- Pagination termination condition: `hasMore = batchTransfers.length === BATCH_SIZE` (lines 114, 215)
- `t.poolAddress.toLowerCase()` for pool set (line 205)

**Risk:** Incorrect data transformation would produce silently wrong reward calculations. The CI determinism check mitigates this somewhat (pipeline output is committed and diffed), but transformation bugs could go undetected if they affect all runs consistently.

---

### A09-2: `index.ts` main pipeline has zero test coverage [HIGH]

**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/index.ts`

**Details:** The main pipeline orchestration function (lines 18-236) contains substantial business logic beyond simple wiring:
- Blocklist parsing with `line.split(" ")` and `.toLowerCase()` (lines 64-70)
- CSV output formatting with dynamic column headers per token per snapshot (lines 149-152)
- Address sorting by total rewards in descending order (lines 173-178)
- Reward aggregation across tokens into `totalRewardsPerAddress` (lines 158-170)
- Filtering zero-reward addresses via splice (lines 207-211)
- Rewards CSV output with specific column headers matching external tool requirements (lines 15-16, 212-223)

None of this logic is exported or testable without refactoring. The CSV output format must match the Flare distribution tool's expected structure (`recipient address,amount wei`), and any formatting error would cause on-chain distribution failure.

**Specific untested logic:**
- `process.env.START_SNAPSHOT || "0"` fallback (line 10) -- if env var is empty string, `parseInt("")` returns `NaN`
- `process.env.SEED!` non-null assertion (line 20) -- will throw at runtime if SEED is undefined
- Blocklist parsing assumes exactly 2 space-separated values per line (line 65)
- `addresses.splice(addresses.indexOf(address), 1)` inside a for-of loop (lines 207-211) -- potential iteration bug if `indexOf` returns -1
- BigInt comparison for sorting uses ternary rather than standard comparator (lines 176-177)

---

### A09-3: `REWARD_POOL` constant value is never directly validated [MEDIUM]

**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/constants.ts`

**Details:** `REWARD_POOL = BigInt(1000000000000000000000000)` (1M * 1e18) is a critical financial constant that determines the total reward distribution. Its value is consumed by `processor.ts` (via `index.ts`) and `diffCalculator.ts` but is never imported or asserted in any test file. Tests in `processor.test.ts` use their own locally defined reward pool values (`ONEn` at line 300, `1_000_000n * ONEn` at line 379).

If someone accidentally changed this value (e.g., adding or removing a zero), no test would catch it. The CI determinism check would catch it indirectly only if the full pipeline is re-run.

**Recommendation:** Add a simple test asserting:
```typescript
expect(REWARD_POOL).toBe(1000000000000000000000000n);
expect(REWARD_POOL).toBe(1_000_000n * ONE);
```

---

### A09-4: `ONE` constant value is never directly validated [MEDIUM]

**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/constants.ts`

**Details:** `ONE = BigInt(10 ** 18)` is used as a precision multiplier in `processor.ts` line 355 for inverse fraction calculation. While `processor.test.ts` defines a local mirror (`ONEn = 1000000000000000000n` at line 23), the actual exported constant is never imported or asserted in tests.

Note: `BigInt(10 ** 18)` evaluates correctly to `1000000000000000000n` because `10 ** 18` is within JavaScript's safe integer range (`Number.MAX_SAFE_INTEGER` is ~9e15, and `10**18` is 1e18 which actually exceeds it). However, `10**18 = 1000000000000000000` is representable exactly as a float64, so the conversion is safe in practice. A more robust definition would be `10n ** 18n`, but the current form works.

---

### A09-5: `scraper.ts` runtime assertion on `END_SNAPSHOT` is untested [MEDIUM]

**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/scraper.ts`, line 15

**Details:** The module-level `assert(process.env.END_SNAPSHOT, "undefined END_SNAPSHOT env variable")` executes on import and will throw if the environment variable is missing. This is a top-level side effect that makes the module difficult to test in isolation without setting the environment variable. No test validates this assertion behavior.

---

### A09-6: `types.ts` contains unused type definitions [LOW]

**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/types.ts`

**Details:** The following types appear to be defined but never used in production or test code:
- `AccountSummary` (lines 35-56): Not imported anywhere in the codebase
- `TransferRecord` (lines 70-77): Not imported anywhere in the codebase
- `Epoch` (lines 116-122): Only imported in `config.ts` (line 2) but only as a type annotation

These unused types contribute no runtime behavior and pose no functional risk, but they add maintenance burden and may indicate incomplete refactoring.

---

### A09-7: `types.ts` `LiquidityChangeType` enum has indirect coverage only [INFO]

**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/types.ts`, lines 84-88

**Details:** The `LiquidityChangeType` enum is the only runtime-relevant export from `types.ts` (interfaces and type aliases are erased at compile time). It is imported and used in `processor.test.ts` (line 4) and exercised via `LiquidityChangeType.Deposit` (line 532) and `LiquidityChangeType.Withdraw` (line 586). The `Transfer` variant (`LiquidityChangeType.Transfer`) is not exercised in any test.

---

### A09-8: `index.ts` blocklist parsing logic is fragile and untested [MEDIUM]

**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/index.ts`, lines 64-70

**Details:** The blocklist is parsed with:
```typescript
const [reporter, reported] = line.split(" ");
return {
  reporter: reporter.toLowerCase(),
  cheater: reported.toLowerCase(),
};
```

This assumes:
- Exactly one space separator (tabs or multiple spaces would fail)
- Exactly two values per line (extra values silently ignored, missing value causes `undefined.toLowerCase()` crash)
- No trailing whitespace (would produce empty string entries after `filter(Boolean)`)

This parsing logic is entirely untested. A malformed blocklist line could crash the entire pipeline at runtime.

---

## Summary

| ID | Severity | File | Description |
|---|---|---|---|
| A09-1 | HIGH | `scraper.ts` | Zero test coverage for data scraping and transformation logic |
| A09-2 | HIGH | `index.ts` | Zero test coverage for main pipeline orchestration and CSV output |
| A09-3 | MEDIUM | `constants.ts` | `REWARD_POOL` financial constant never directly validated |
| A09-4 | MEDIUM | `constants.ts` | `ONE` precision constant never directly validated |
| A09-5 | MEDIUM | `scraper.ts` | Runtime assertion on `END_SNAPSHOT` env var untested |
| A09-6 | LOW | `types.ts` | Unused type definitions (`AccountSummary`, `TransferRecord`) |
| A09-7 | INFO | `types.ts` | `LiquidityChangeType.Transfer` variant never exercised in tests |
| A09-8 | MEDIUM | `index.ts` | Blocklist parsing logic is fragile and untested |

**Mitigating factor:** The CI workflow (`git-clean.yaml`) runs the full pipeline and asserts no uncommitted changes, which provides an integration-level safety net. However, this does not substitute for unit tests that would catch regressions in isolated logic paths (e.g., data transformation edge cases, CSV formatting, blocklist parsing).
