# Audit Triage — 2026-02-24-01

## Pass 0: Process Review
| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| A00-1 | MEDIUM | `.env` variables don't match CLAUDE.md documentation | FIXED — RPC_URL added to CLAUDE.md; config.ts now reads from env with assert; tests added |
| A00-2 | MEDIUM | `.env.example` is completely stale | FIXED — updated to list SEED, START_SNAPSHOT, END_SNAPSHOT, RPC_URL |
| A00-3 | MEDIUM | CI env vars diverge from `.env` without explanation | FIXED — updated .env to Jan 2026 epoch values matching CI |
| A00-4 | MEDIUM | CLAUDE.md architecture description is inaccurate | FIXED — corrected transfers file naming and diffCalculator description |
| A00-5 | LOW | CLAUDE.md says "cysFLR and cyWETH" but code supports cyFXRP | FIXED — added cyFXRP to Project Overview |
| A00-6 | LOW | No mention of `scripts/` directory | FIXED — added scripts/fetch-dec-2025-distributed.sh to Architecture section |
| A00-7 | LOW | CI workflow references epoch-specific script and file paths | DOCUMENTED — added epoch transition checklist to CLAUDE.md Key Concepts |
| A00-8 | LOW | CLAUDE.md `npm run start` description incomplete | FIXED — corrected to "scrape → process"; diff was only needed for Dec epoch |
| A00-9 | LOW | CLAUDE.md Data Files section `pools.dat` described as JSONL but is JSON | FIXED — split Data Files entry; pools.dat now described as JSON array |

## Pass 1: Security
| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| A02-1 | CRITICAL | `REWARD_POOL` incorrect value due to float precision loss | DISMISSED — dust-level (2^24 wei ~ 0.000002% of pool), consistent across all outputs |
| A06-1 | HIGH | Case normalization mismatch for account addresses in `accountBalancesPerToken` | FIXED — added `.toLowerCase()` at lookup site |
| A06-2 | HIGH | Case normalization mismatch in `processLiquidityPositions` owner lookup | FIXED — added `.toLowerCase()` at lookup site |
| A04-1 | HIGH | Non-null assertion on `process.env.SEED` | FIXED — `parseEnv()` asserts SEED is set; index.ts no longer uses `process.env.SEED!` |
| A01-1 | MEDIUM | No input validation on `generateSnapshotBlocks` parameters | DISMISSED — assert on line 69 validates range >= 30, catching start > end and start === end; inputs come from parseEnv which validates |
| A01-2 | MEDIUM | Duplicate snapshot blocks possible and not deduplicated | FIXED — use Set for sampling without replacement; assert range >= 30 |
| A03-1 | MEDIUM | Greedy/order-dependent budget allocation | DISMISSED — order matches original distribution pattern, least surprising for recipients |
| A03-4 | MEDIUM | Duplicate addresses in `newRewards` cause silent double-counting | PENDING |
| A03-6 | MEDIUM | `main()` executes on module import | PENDING |
| A04-2 | MEDIUM | `START_SNAPSHOT`/`END_SNAPSHOT` default to 0 silently | FIXED — extracted `parseEnv()` into config.ts with asserts for SEED, START_SNAPSHOT, END_SNAPSHOT |
| A04-3 | MEDIUM | Unchecked `JSON.parse` on JSONL data files | FIXED — parseJsonl now catches and rethrows with line number context |
| A04-6 | MEDIUM | `transfers` typed as `any[]` with no schema validation | FIXED — typed as `Transfer[]` in index.ts |
| A06-3 | MEDIUM | `epochLength` vs `snapshots.length` divergence risk | FIXED — removed redundant `epochLength` parameter; use `this.snapshots.length` directly |
| A06-4 | MEDIUM | Division by zero in `calculateRewardsPoolsPertoken` | DISMISSED — `getTokensWithBalance` filters to tokens with balance > 0; loop doesn't execute when empty |
| A06-5 | MEDIUM | Division by zero in `calculateRewards` | DISMISSED — same guard via `getTokensWithBalance`; divisor always > 0 |
| A06-6 | MEDIUM | Non-null assertions on `Map.get()` throughout | DISMISSED — all guarded by prior `.has()`/`.set()` calls or loop over known keys; safe in practice |
| A07-1 | MEDIUM | GraphQL skip pagination ceiling | DISMISSED — incorrect; uses Goldsky not The Graph hosted service, 370K records successfully fetched |
| A07-2 | MEDIUM | No validation of subgraph response data | PENDING |
| A08-1 | MEDIUM | Unbranded string for Ethereum addresses | PENDING |
| A08-2 | MEDIUM | Numeric string fields without runtime validation | PENDING |
| A08-8 | MEDIUM | Map key type erosion in `EligibleBalances`/`RewardsPerToken` | PENDING |
| A01-3 | LOW | Mixed-case addresses in constants | FIXED — lowercased all addresses in config.ts |
| A01-4 | LOW | `scaleTo18` does not validate `decimals` parameter | PENDING |
| A01-5 | LOW | `isSameAddress` does not validate address format | PENDING |
| A02-2 | LOW | `ONE` uses fragile `Number`-to-`BigInt` pattern | FIXED — changed to `10n ** 18n` with test assertion |
| A03-2 | LOW | No address format validation in `readCsv` | PENDING |
| A03-3 | LOW | `readCsv` does not validate CSV header row | PENDING |
| A03-7 | LOW | Hardcoded file paths and `DISTRIBUTED_COUNT` | PENDING |
| A03-8 | LOW | Negative reward values accepted without validation | PENDING |
| A03-10 | LOW | No validation that `distributedCount` is a non-negative integer | PENDING |
| A04-4 | LOW | Relative file paths for all I/O | PENDING |
| A04-5 | LOW | Write-before-mkdir race condition | FIXED — moved mkdir before first writeFile |
| A04-7 | LOW | `splice` with `indexOf` can silently remove wrong element | FIXED — replaced with filterZeroRewards() which filters without mutation |
| A04-9 | LOW | Blocklist parsing does not validate address format | PENDING |
| A05-2 | LOW | Sequential `getCode` calls for missing pools | PENDING |
| A05-3 | LOW | No timeout on individual RPC calls | PENDING |
| A05-6 | LOW | No validation of `blockNumber` parameter | PENDING |
| A05-9 | LOW | No rate limiting on RPC calls | PENDING |
| A06-7 | LOW | Negative final balance from penalty exceeding average | DISMISSED — blocklist integrity test guards against duplicate cheaters; root cause deferred to future work |
| A06-8 | LOW | Approved source cache error matching is fragile | FIXED — throw instead of caching false after exhausting retries |
| A06-9 | LOW | `processTransfer` double-accounting pattern confusing | PENDING |
| A06-10 | LOW | `lp3TrackList` accumulates without bounds checking | PENDING |
| A06-11 | LOW | `organizeLiquidityPositions` silently drops duplicate events | PENDING |
| A07-3 | LOW | `parseInt(END_SNAPSHOT)` NaN not detected | PENDING |
| A07-4 | LOW | Entire transfer array in memory with O(n^2) I/O | PENDING |
| A07-5 | LOW | File split write-every-iteration fragile | PENDING |
| A07-6 | LOW | `main()` executes on import with no guard | PENDING |
| A07-10 | LOW | Error handling swallows failures silently | PENDING |
| A08-3 | LOW | `Transfer` and `TransferRecord` near-duplication | FIXED — removed dead TransferRecord type |
| A08-4 | LOW | No `readonly` modifiers on financial data structures | PENDING |
| A08-5 | LOW | `currentNetBalance` can be negative without type-level constraint | PENDING |
| A08-7 | LOW | `parseInt` on tick/fee fields with no NaN guard | PENDING |

## Pass 2: Test Coverage
| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| A02-P2-1 | CRITICAL | `REWARD_POOL` precision loss has zero test coverage | FIXED — used `n` suffix for BigInt literal; added constants.test.ts with exact value assertions |
| A01-1 | HIGH | `isSameAddress` has zero test coverage | FIXED — added 3 tests: identical, different casing, different addresses |
| A04-2 | HIGH | Environment variable handling unvalidated | FIXED — parseEnv() validates all env vars with assertions; 6 tests in config.test.ts |
| A04-6 | HIGH | Zero-reward splice has known bug pattern | FIXED — replaced with filterZeroRewards() which filters without mutation |
| A06-1 | HIGH | `isApprovedSource` has no dedicated tests (real implementation almost entirely untested) | FIXED — added 5 tests: direct source, case insensitive, factory approved, factory non-approved, no factory function, cache hit |
| GAP-LIQ-01 | CRITICAL | `getPoolsTick` has zero unit tests | FIXED — added 4 tests for retry wrapper: first success, BigInt conversion, retry-then-succeed, throw after 3 failures |
| A01-2 | MEDIUM | `generateSnapshotBlocks` missing edge case tests (start===end, start>end, adjacent) | FIXED — added large range, empty seed tests; start===end/start>end/adjacent all caught by assert(range >= 30) |
| A01-3 | MEDIUM | `scaleTo18` missing edge case tests | FIXED — added tests for decimals=0, zero value, decimals=6 (cyFXRP), truncation to zero |
| A01-4 | MEDIUM | `REWARDS_SOURCES`, `FACTORIES`, `CYTOKENS` have no structural validation tests | FIXED — address format, uniqueness, non-negative decimals, no overlap tests |
| A02-P2-2 | MEDIUM | `ONE` constant not imported or tested from source | FIXED — constants.test.ts asserts ONE === 10n ** 18n |
| A03-1 | MEDIUM | No CRLF line ending test for `readCsv` | PENDING |
| A03-4 | MEDIUM | No zero-reward entry test for `calculateDiff` | PENDING |
| A03-6 | MEDIUM | No duplicate address test for `calculateDiff` inputs | PENDING |
| A03-8 | MEDIUM | Underpaid scenario not tested in CSV output | PENDING |
| A04-1 | MEDIUM | `main()` has zero test coverage | PENDING |
| A04-3 | MEDIUM | JSONL file parsing untested and fragile | FIXED — extracted parseJsonl with 5 tests including error context |
| A04-4 | MEDIUM | Blocklist parsing assumes exact format | FIXED — extracted parseBlocklist with 8 tests |
| A04-5 | MEDIUM | CSV output generation format untested | FIXED — extracted formatRewardsCsv (3 tests) and formatBalancesCsv (5 tests) |
| A04-7 | MEDIUM | Balance verification is console-only, never fails | FIXED — index.ts now throws on failed balance verification and excessive reward pool drift |
| GAP-LIQ-02 | MEDIUM | Tick value of zero not tested | FIXED — test verifies tick=0 returned correctly |
| GAP-LIQ-03 | MEDIUM | Duplicate pool addresses in input not tested | FIXED — test documents last-write-wins behavior |
| GAP-LIQ-04 | MEDIUM | `getCode` returning undefined not tested | FIXED — test verifies pool skipped when getCode returns undefined |
| A06-2 | MEDIUM | `processTransfer` unknown `tokenAddress` throw path untested | DISMISSED — unreachable; constructor initializes all CYTOKENS in map |
| A06-3 | MEDIUM | `processLiquidityPositions` unknown `tokenAddress` throw untested | DISMISSED — same as A06-2; defensive guard only |
| A06-4 | MEDIUM | `processLiquidityPositions` with V3 events not tested | FIXED — test with LiquidityV3Change including tokenId, poolAddress, tick range |
| A06-5 | MEDIUM | `processLiquidityPositions` skipping ineligible tokens untested | FIXED — test verifies ineligible token silently skipped |
| A06-6 | MEDIUM | `processTransfer` skipping ineligible tokens untested | FIXED — test verifies ineligible token transfer silently skipped |
| A06-7 | MEDIUM | No test for transfer exactly at snapshot block boundary | FIXED — test verifies transfer at exact snapshot block included (<= comparison) |
| A06-8 | MEDIUM | No test for liquidity event exactly at snapshot block boundary | FIXED — test verifies liquidity event at exact snapshot block included |
| A07-1 | MEDIUM | Transfer data mapping logic untested (no test file for scraper) | PENDING |
| A07-2 | MEDIUM | V2/V3 discrimination logic untested | PENDING |
| A07-3 | MEDIUM | Pagination logic untested | PENDING |
| A01-5 | LOW | `RPC_URL` has no test coverage | FIXED — 2 tests in config.test.ts: reads from env, errors if unset |
| A03-2 | LOW | No whitespace-in-address test for `readCsv` | PENDING |
| A03-3 | LOW | No large BigInt value test for `readCsv` | PENDING |
| A03-5 | LOW | No mixed-case address test for `calculateDiff` | PENDING |
| A03-7 | LOW | `main()` not independently testable | PENDING |
| A03-9 | LOW | No single-data-row success case test for `readCsv` | PENDING |
| A03-11 | LOW | No negative reward test for `calculateDiff` | PENDING |
| A07-4 | LOW | File splitting logic untested | PENDING |
| A07-5 | LOW | `UNTIL_SNAPSHOT` calculation untested | PENDING |
| A07-6 | LOW | `main()` orchestration untested | PENDING |
| A07-7 | LOW | V3 pool collection untested | PENDING |
| A08-1 | LOW | `LiquidityChangeType.Transfer` and `.Withdraw` have thin coverage | FIXED — added tests: Transfer updates currentNetBalance, Withdraw does not |

## Pass 3: Documentation
| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| A02-1 | CRITICAL | `REWARD_POOL` has silent precision loss (8,388,608 wei deficit); no documentation of intended value | FIXED — changed to 500_000_000_000_000_000_000_000n with test assertion |
| A02-2 | HIGH | `ONE` uses fragile `BigInt(Number)` pattern; happens to be correct but undocumented | FIXED — changed to 10n ** 18n with test assertion |
| A02-3 | HIGH | `DEC25_REWARD_POOL` has no documentation explaining its purpose or relationship to `REWARD_POOL` | DOCUMENTED — added comments explaining epoch, amount, and usage |
| A06-DOC-003 | HIGH | All 13 public methods on `Processor` class lack JSDoc | PENDING |
| A01-6 | MEDIUM | `underlyingSymbol: "cyFXRP"` may be incorrect; breaks naming pattern of other entries | FIXED — changed to "FXRP" to match pattern (sFLR, WETH) |
| A03-4 | MEDIUM | `calculateDiff` has no JSDoc at all (core exported function of the module) | PENDING |
| A03-5 | MEDIUM | `DISTRIBUTED_COUNT = 100` magic constant with no explanation | PENDING |
| A03-11 | LOW-MEDIUM | `RewardEntry`, `DiffEntry`, `DiffResult` types are undocumented | PENDING |
| A04-DOC-002 | MEDIUM | `main()` in `index.ts` has no JSDoc documentation | PENDING |
| A04-DOC-003 | MEDIUM | Log message says `output/balances.csv` but file is written to dynamic name | FIXED — log now includes snapshot block numbers |
| A04-DOC-004 | MEDIUM | Log message says `output/rewards.csv` but file is written to dynamic name | FIXED — log now includes snapshot block numbers |
| A05-DOC-003 | MEDIUM | `getPoolsTickMulticall()` has no JSDoc documentation | PENDING |
| A05-DOC-004 | MEDIUM | `getPoolsTick()` JSDoc inaccurately implies exponential backoff; code uses fixed 10s delay | FIXED — corrected CLAUDE.md description |
| A06-DOC-002 | MEDIUM | `Processor` class has no JSDoc | PENDING |
| A07-DOC-007 | MEDIUM | `scrapeTransfers()` has no JSDoc | PENDING |
| A07-DOC-008 | MEDIUM | `scrapeLiquidityChanges()` has no JSDoc | PENDING |
| A08-DOC-002 | MEDIUM | `CyToken` interface undocumented; `receiptAddress` purpose unclear | PENDING |
| A08-DOC-005 | MEDIUM | `AccountBalance` interface undocumented; field invariant not documented | PENDING |
| A08-DOC-008 | MEDIUM | `TokenBalances` interface undocumented; `final` vs `final18` distinction critical | PENDING |
| A01-1 | LOW | Unused `Epoch` import on line 2 of `config.ts` | FIXED — removed unused import |
| A01-2 | LOW | Missing JSDoc on `isSameAddress` | PENDING |
| A01-3 | LOW | Missing `@returns` tag on `generateSnapshotBlocks` JSDoc | PENDING |
| A01-4 | LOW | Missing `@returns` tag on `scaleTo18` JSDoc | PENDING |
| A01-5 | LOW | No JSDoc on exported constants (`REWARDS_SOURCES`, `FACTORIES`, `CYTOKENS`, `RPC_URL`) | PENDING |
| A01-7 | LOW | Grammatical error "generated" -> "generate" in assertion message | PENDING |
| A02-4 | LOW | CSV column header comment is accurate but ambiguous in scope | PENDING |
| A02-5 | LOW | No file-level documentation in `constants.ts` | PENDING |
| A03-1 | LOW | `readCsv` JSDoc says "array and map" but only array is returned (stale) | PENDING |
| A03-2 | LOW | `readCsv` missing `@returns` tag | PENDING |
| A03-3 | LOW | `readCsv` missing `@throws` documentation for 5 error conditions | PENDING |
| A03-6 | LOW | `main()` in `diffCalculator.ts` is undocumented | PENDING |
| A03-7 | LOW | Typo: "distirbuted" should be "distributed" (line 70) | PENDING |
| A03-8 | LOW | Typo: "undistruibuted" / "thos" (line 76) | PENDING |
| A03-9 | LOW | Hardcoded "3 accounts" in log message; should use `result.underpaid.length` | PENDING |
| A03-10 | LOW | Typo: "cant" should be "can't" (line 98) | PENDING |
| A04-DOC-001 | LOW | No module-level JSDoc on `index.ts` | PENDING |
| A04-DOC-008 | LOW | No comment explaining multi-file transfer split | PENDING |
| A04-DOC-009 | LOW | No comment documenting `blocklist.txt` format | PENDING |
| A04-DOC-010 | LOW | `any[]` type hides data shape documentation | PENDING |
| A05-DOC-001 | LOW | No module-level JSDoc on `liquidity.ts` | PENDING |
| A05-DOC-002 | LOW | ABI constant undocumented | PENDING |
| A05-DOC-007 | LOW | Hardcoded Multicall3 address undocumented | PENDING |
| A06-DOC-001 | LOW | No module-level JSDoc on `processor.ts` | PENDING |
| A06-DOC-004 | LOW | `calculateRewardsPoolsPertoken` inconsistent casing (lowercase `t`) | FIXED — renamed to `calculateRewardsPoolsPerToken` |
| A06-DOC-007 | LOW | `isApprovedSource` three-phase pipeline undocumented | PENDING |
| A06-DOC-011 | LOW | "First pass" comment says penalties but pass does not calculate them | FIXED — corrected to "calculate base balances" |
| A06-DOC-012 | LOW | "Second pass" comment omits penalty calculation | FIXED — corrected to "calculate penalties and bounties" |
| A06-DOC-018 | LOW | No private field documentation on `Processor` | PENDING |
| A06-DOC-019 | LOW | Constructor has no JSDoc | PENDING |
| A07-DOC-001 | LOW | No module-level JSDoc on `scraper.ts` | PENDING |
| A07-DOC-002 | LOW | `SubgraphTransfer` interface undocumented | PENDING |
| A07-DOC-003 | LOW | `SubgraphLiquidityChangeBase` type undocumented | PENDING |
| A07-DOC-004 | LOW | `SubgraphLiquidityChangeV2` type undocumented | PENDING |
| A07-DOC-005 | LOW | `SubgraphLiquidityChangeV3` type undocumented | PENDING |
| A07-DOC-006 | LOW | `SubgraphLiquidityChange` exported type undocumented | PENDING |
| A07-DOC-009 | LOW | `main()` in `scraper.ts` has no JSDoc | PENDING |
| A07-DOC-012 | LOW | Comment says "split into 2 files" but code splits into N files | PENDING |
| A07-DOC-016 | LOW | `SUBGRAPH_URL` constant undocumented | PENDING |
| A08-DOC-001 | LOW | No module-level JSDoc on `types.ts` | PENDING |
| A08-DOC-003 | LOW | `Transfer` interface undocumented | PENDING |
| A08-DOC-004 | LOW | `TransferDetail` interface undocumented | PENDING |
| A08-DOC-006 | LOW | `Report` interface undocumented; possibly redundant with inline type in processor | FIXED — removed dead Report type |
| A08-DOC-007 | LOW | `AccountSummary` interface undocumented; possibly unused | FIXED — removed dead AccountSummary type |
| A08-DOC-009 | LOW | `EligibleBalances` has inline comment but no JSDoc | PENDING |
| A08-DOC-010 | LOW | `RewardsPerToken` has inline comment but no JSDoc | PENDING |
| A08-DOC-011 | LOW | `TransferRecord` undocumented; overlap with `Transfer` unclear | FIXED — removed dead TransferRecord type |
| A08-DOC-012 | LOW | `AccountTransfers` undocumented; asymmetric field types | PENDING |
| A08-DOC-013 | LOW | `LiquidityChangeType` enum undocumented | PENDING |
| A08-DOC-014 | LOW | `LiquidityChangeBase` undocumented; `depositedBalanceChange` name misleading | PENDING |
| A08-DOC-015 | LOW | `LiquidityChangeV2` undocumented | PENDING |
| A08-DOC-016 | LOW | `LiquidityChangeV3` undocumented; V3-specific fields need explanation | PENDING |
| A08-DOC-017 | LOW | `LiquidityChange` union type undocumented | PENDING |
| A08-DOC-018 | LOW | `Epoch` has inline field comments but no JSDoc; possibly unused | FIXED — removed dead Epoch type |

## Pass 4: Code Quality
| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| A06-12 | HIGH | Case mismatch on map key in `processLiquidityPositions` (line 525 vs 535) | FIXED — use `owner` (lowercased) instead of `liquidityChangeEvent.owner` on line 535 |
| A08-1 | HIGH | Five exported types are dead code: `Report`, `AccountSummary`, `TransferRecord`, `TransferDetail`, `AccountTransfers` | FIXED — removed Report, AccountSummary, TransferRecord, Epoch; TransferDetail/AccountTransfers still used by processor |
| A03-1 | HIGH | Side effect on import: `main()` executes unconditionally at module level | PENDING |
| A03-2 | HIGH | Hardcoded file paths and epoch-specific values in `main()` | PENDING |
| A05-1 | MEDIUM | Fixed 10-second retry delay documented as "exponential backoff" in CLAUDE.md | FIXED — corrected to "3 attempts with fixed 10-second delay" |
| A06-3 | MEDIUM | Duplicated snapshot balance update logic (3+ repetitions) | PENDING |
| A06-5 | MEDIUM | `client` typed as `any` defeats type safety | FIXED — typed as PublicClient on field and constructor parameter |
| A08-2 | MEDIUM | `Transfer` and `TransferRecord` are near-duplicates | FIXED — removed dead TransferRecord type |
| A08-3 | MEDIUM | `AccountSummary` hardcodes 2 snapshot fields; system uses 30 | FIXED — removed dead AccountSummary type |
| A02-1 | MEDIUM | Three different BigInt construction idioms in a 4-line span | FIXED — all constants now use `n` suffix consistently |
| A02-2 | MEDIUM | `REWARD_POOL` uses `BigInt()` with a large numeric literal (precision risk) | FIXED — changed to 500_000_000_000_000_000_000_000n |
| A01-2 | MEDIUM | Inconsistent address casing across constant arrays | FIXED — lowercased all addresses in REWARDS_SOURCES, FACTORIES, CYTOKENS |
| A03-3 | MEDIUM | Typos in comments (lines 70, 76 of `diffCalculator.ts`) | PENDING |
| A03-4 | MEDIUM | Inconsistent indentation: `main()` uses 4-space, rest uses 2-space | PENDING |
| A03-5 | MEDIUM | Inconsistent semicolon usage | PENDING |
| A03-6 | MEDIUM | Redundant `.toLowerCase()` calls in `calculateDiff` | PENDING |
| A04-1 | MEDIUM | God function: `main()` spans ~230 lines handling I/O, processing, reporting, CSV generation | PENDING |
| A04-2 | MEDIUM | `any[]` type on transfers array defeats type safety for entire pipeline | FIXED — typed as Transfer[] in index.ts |
| A01-1 | MEDIUM | Unused `Epoch` import in `config.ts` | FIXED — removed unused import |
| A06-1 | LOW | `accountTransfers` Map is write-only (dead code) | PENDING |
| A06-2 | LOW | Redundant constructor parameter: `epochLength` vs `snapshots.length` | FIXED — removed redundant epochLength parameter |
| A06-4 | LOW | Method name `calculateRewardsPoolsPertoken` has inconsistent casing | FIXED — renamed to `calculateRewardsPoolsPerToken` |
| A06-6 | LOW | Unnecessary `async` on methods that do not await | PENDING |
| A06-7 | LOW | `console.log` in library code | PENDING |
| A06-8 | LOW | Magic numbers for bounty percentage (10n/100n) | PENDING |
| A06-9 | LOW | Magic number for retry backoff base delay (500ms) | PENDING |
| A06-10 | LOW | Complex anonymous type for `lp3TrackList` | PENDING |
| A06-11 | LOW | Inconsistent semicolons and brace style in `processor.ts` | PENDING |
| A06-13 | LOW | Inconsistent address normalization in `accountTransfers` | PENDING |
| A06-14 | LOW | Constructor `reports` uses inline type instead of `Report` interface | PENDING |
| A06-15 | LOW | Unreachable `return false` at end of `isApprovedSource` | PENDING |
| A01-3 | LOW | Inconsistent indentation in `scaleTo18` function | PENDING |
| A01-4 | LOW | Inconsistent BigInt construction method in `scaleTo18` | PENDING |
| A01-5 | LOW | `generateSnapshotBlocks` does not guarantee uniqueness of snapshot blocks | FIXED — uses Set for deduplication |
| A02-3 | LOW | `ONE` naming is ambiguous (does not convey fixed-point scaling purpose) | PENDING |
| A02-4 | LOW | `as const` used inconsistently across BigInt constants | PENDING |
| A02-5 | LOW | `DEC25_REWARD_POOL` embeds a date; `REWARD_POOL` does not (naming inconsistency) | PENDING |
| A03-7 | LOW | Inconsistent use of `./` prefix in file paths | PENDING |
| A03-8 | LOW | CSV header construction duplicated across files | PENDING |
| A03-9 | LOW | `DISTRIBUTED_COUNT` is epoch-specific but exported as general constant | PENDING |
| A03-10 | LOW | Greedy budget allocation is order-dependent but undocumented | PENDING |
| A03-11 | LOW | `structuredClone` on flat objects where shallow copy suffices | PENDING |
| A04-3 | LOW | Duplicated JSONL parsing pattern across three data sources | PENDING |
| A04-4 | LOW | Inconsistent import path style: `.js` extension on one import only | PENDING |
| A04-5 | LOW | Hardcoded file paths and magic numbers scattered throughout | PENDING |
| A04-6 | LOW | Misleading log messages reference wrong output filenames | FIXED — log now includes snapshot block numbers |
| A04-7 | LOW | Mutating `addresses` array via `splice` + `indexOf` is O(n^2) with `-1` edge case | FIXED — replaced with filterZeroRewards() |
| A04-8 | LOW | Unsafe non-null assertion on `process.env.SEED` | FIXED — parseEnv() validates with assert |
| A04-9 | LOW | `mkdir("output")` called after first write to `output/` | FIXED — moved mkdir before first writeFile |
| A05-2 | LOW | JSDoc and inline comment overstate retry count ("3 retries" vs 3 total attempts) | FIXED — corrected CLAUDE.md retry description |
| A05-3 | LOW | Inconsistent `blockNumber` parameter type (`number` vs `bigint`) between functions | PENDING |
| A05-4 | LOW | Hardcoded Multicall3 contract address | PENDING |
| A07-1 | LOW | Module-level side effects: `config()` and `assert` execute on import | PENDING |
| A07-2 | LOW | Structural duplication between `scrapeTransfers` and `scrapeLiquidityChanges` | PENDING |
| A07-3 | LOW | Unsafe `any` type in liquidity change mapping defeats type safety | PENDING |
| A07-4 | LOW | Hardcoded magic number `270000` for file splitting with no shared constant | PENDING |
| A07-5 | LOW | Full accumulator rewritten on every batch iteration | PENDING |
| A08-4 | LOW | Mixed type definition keywords: `interface` vs `type` for plain object shapes | PENDING |
| A08-5 | LOW | Inline anonymous type in `AccountTransfers.transfersOut` | PENDING |
| A08-6 | LOW | `Epoch` type imported in `config.ts` but unused | FIXED — removed unused Epoch import |
| A08-7 | LOW | Numeric string fields lack documentation on denomination/encoding | PENDING |
