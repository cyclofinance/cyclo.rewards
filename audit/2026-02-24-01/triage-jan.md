# Jan Epoch Triage — PENDING items only

Filtered from `triage.md` — excludes diffCalculator (A03-*) items and all FIXED/DISMISSED/DOCUMENTED items.

## Pass 1: Security

| ID | Severity | Source | Finding |
|----|----------|--------|---------|
| A07-2 | MEDIUM | scraper.ts | No validation of subgraph response data |
| A08-1 | MEDIUM | types.ts | Unbranded string for Ethereum addresses |
| A08-2 | MEDIUM | types.ts | Numeric string fields without runtime validation |
| A08-8 | MEDIUM | types.ts | Map key type erosion in `EligibleBalances`/`RewardsPerToken` |
| A01-4 | LOW | config.ts | `scaleTo18` does not validate `decimals` parameter |
| A01-5 | LOW | config.ts | `isSameAddress` does not validate address format |
| A04-4 | LOW | index.ts | Relative file paths for all I/O |
| A04-9 | LOW | index.ts | Blocklist parsing does not validate address format |
| A05-2 | LOW | liquidity.ts | Sequential `getCode` calls for missing pools |
| A05-3 | LOW | liquidity.ts | No timeout on individual RPC calls |
| A05-6 | LOW | liquidity.ts | No validation of `blockNumber` parameter |
| A05-9 | LOW | liquidity.ts | No rate limiting on RPC calls |
| A06-9 | LOW | processor.ts | `processTransfer` double-accounting pattern confusing |
| A06-10 | LOW | processor.ts | `lp3TrackList` accumulates without bounds checking |
| A06-11 | LOW | processor.ts | `organizeLiquidityPositions` silently drops duplicate events |
| A07-3 | LOW | scraper.ts | `parseInt(END_SNAPSHOT)` NaN not detected |
| A07-4 | LOW | scraper.ts | Entire transfer array in memory with O(n^2) I/O |
| A07-5 | LOW | scraper.ts | File split write-every-iteration fragile |
| A07-6 | LOW | scraper.ts | `main()` executes on import with no guard |
| A07-10 | LOW | scraper.ts | Error handling swallows failures silently |
| A08-4 | LOW | types.ts | No `readonly` modifiers on financial data structures |
| A08-5 | LOW | types.ts | `currentNetBalance` can be negative without type-level constraint |
| A08-7 | LOW | types.ts | `parseInt` on tick/fee fields with no NaN guard |

## Pass 2: Test Coverage

| ID | Severity | Source | Finding |
|----|----------|--------|---------|
| A04-1 | MEDIUM | index.ts | `main()` has zero test coverage |
| A07-1 | MEDIUM | scraper.ts | Transfer data mapping logic untested |
| A07-2 | MEDIUM | scraper.ts | V2/V3 discrimination logic untested |
| A07-3 | MEDIUM | scraper.ts | Pagination logic untested |
| A07-4 | LOW | scraper.ts | File splitting logic untested |
| A07-5 | LOW | scraper.ts | `UNTIL_SNAPSHOT` calculation untested |
| A07-6 | LOW | scraper.ts | `main()` orchestration untested |
| A07-7 | LOW | scraper.ts | V3 pool collection untested |

## Pass 3: Documentation

| ID | Severity | Source | Finding |
|----|----------|--------|---------|
| A06-DOC-003 | HIGH | processor.ts | All 13 public methods on `Processor` class lack JSDoc |
| A04-DOC-002 | MEDIUM | index.ts | `main()` in `index.ts` has no JSDoc documentation |
| A05-DOC-003 | MEDIUM | liquidity.ts | `getPoolsTickMulticall()` has no JSDoc documentation |
| A06-DOC-002 | MEDIUM | processor.ts | `Processor` class has no JSDoc |
| A07-DOC-007 | MEDIUM | scraper.ts | `scrapeTransfers()` has no JSDoc |
| A07-DOC-008 | MEDIUM | scraper.ts | `scrapeLiquidityChanges()` has no JSDoc |
| A08-DOC-002 | MEDIUM | types.ts | `CyToken` interface undocumented; `receiptAddress` purpose unclear |
| A08-DOC-005 | MEDIUM | types.ts | `AccountBalance` interface undocumented; field invariant not documented |
| A08-DOC-008 | MEDIUM | types.ts | `TokenBalances` interface undocumented; `final` vs `final18` distinction critical |
| A04-DOC-001 | LOW | index.ts | No module-level JSDoc on `index.ts` |
| A04-DOC-008 | LOW | index.ts | No comment explaining multi-file transfer split |
| A04-DOC-009 | LOW | index.ts | No comment documenting `blocklist.txt` format |
| A04-DOC-010 | LOW | index.ts | `any[]` type hides data shape documentation |
| A05-DOC-001 | LOW | liquidity.ts | No module-level JSDoc on `liquidity.ts` |
| A05-DOC-002 | LOW | liquidity.ts | ABI constant undocumented |
| A05-DOC-007 | LOW | liquidity.ts | Hardcoded Multicall3 address undocumented |
| A06-DOC-001 | LOW | processor.ts | No module-level JSDoc on `processor.ts` |
| A06-DOC-007 | LOW | processor.ts | `isApprovedSource` three-phase pipeline undocumented |
| A06-DOC-018 | LOW | processor.ts | No private field documentation on `Processor` |
| A06-DOC-019 | LOW | processor.ts | Constructor has no JSDoc |
| A07-DOC-001 | LOW | scraper.ts | No module-level JSDoc on `scraper.ts` |
| A07-DOC-002 | LOW | scraper.ts | `SubgraphTransfer` interface undocumented |
| A07-DOC-003 | LOW | scraper.ts | `SubgraphLiquidityChangeBase` type undocumented |
| A07-DOC-004 | LOW | scraper.ts | `SubgraphLiquidityChangeV2` type undocumented |
| A07-DOC-005 | LOW | scraper.ts | `SubgraphLiquidityChangeV3` type undocumented |
| A07-DOC-006 | LOW | scraper.ts | `SubgraphLiquidityChange` exported type undocumented |
| A07-DOC-009 | LOW | scraper.ts | `main()` in `scraper.ts` has no JSDoc |
| A07-DOC-012 | LOW | scraper.ts | Comment says "split into 2 files" but code splits into N files |
| A07-DOC-016 | LOW | scraper.ts | `SUBGRAPH_URL` constant undocumented |
| A08-DOC-001 | LOW | types.ts | No module-level JSDoc on `types.ts` |
| A08-DOC-003 | LOW | types.ts | `Transfer` interface undocumented |
| A08-DOC-009 | LOW | types.ts | `EligibleBalances` has inline comment but no JSDoc |
| A08-DOC-010 | LOW | types.ts | `RewardsPerToken` has inline comment but no JSDoc |
| A08-DOC-013 | LOW | types.ts | `LiquidityChangeType` enum undocumented |
| A08-DOC-014 | LOW | types.ts | `LiquidityChangeBase` undocumented; `depositedBalanceChange` name misleading |
| A08-DOC-015 | LOW | types.ts | `LiquidityChangeV2` undocumented |
| A08-DOC-016 | LOW | types.ts | `LiquidityChangeV3` undocumented; V3-specific fields need explanation |
| A08-DOC-017 | LOW | types.ts | `LiquidityChange` union type undocumented |

## Pass 4: Code Quality

| ID | Severity | Source | Finding |
|----|----------|--------|---------|
| A06-3 | MEDIUM | processor.ts | Duplicated snapshot balance update logic (3+ repetitions) |
| A04-1 | MEDIUM | index.ts | God function: `main()` spans ~230 lines |
| A05-3 | LOW | liquidity.ts | Inconsistent `blockNumber` parameter type (`number` vs `bigint`) |
| A05-4 | LOW | liquidity.ts | Hardcoded Multicall3 contract address |
| A04-3 | LOW | index.ts | Duplicated JSONL parsing pattern across three data sources |
| A04-5 | LOW | index.ts | Hardcoded file paths and magic numbers scattered throughout |
| A07-1 | LOW | scraper.ts | Module-level side effects: `config()` and `assert` execute on import |
| A07-2 | LOW | scraper.ts | Structural duplication between `scrapeTransfers` and `scrapeLiquidityChanges` |
| A07-3 | LOW | scraper.ts | Unsafe `any` type in liquidity change mapping defeats type safety |
| A07-4 | LOW | scraper.ts | Hardcoded magic number `270000` for file splitting |
| A07-5 | LOW | scraper.ts | Full accumulator rewritten on every batch iteration |
| A08-7 | LOW | types.ts | Numeric string fields lack documentation on denomination/encoding |

## Summary

| Pass | MEDIUM+ | LOW | Total |
|------|---------|-----|-------|
| Security | 4 | 19 | 23 |
| Test Coverage | 4 | 4 | 8 |
| Documentation | 9 | 29 | 38 |
| Code Quality | 2 | 10 | 12 |
| **Total** | **19** | **62** | **81** |
