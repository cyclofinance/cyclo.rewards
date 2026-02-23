# Audit Triage — 2026-02-23-01

## Pass 0: Process Review
| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| A00-1 | MEDIUM | `.env` variables don't match CLAUDE.md documentation | PENDING |
| A00-4 | MEDIUM | CLAUDE.md describes diffCalculator inaccurately | PENDING |
| A00-2 | LOW | `.env.example` is stale | PENDING |
| A00-3 | LOW | CLAUDE.md does not mention `RPC_URL` | PENDING |
| A00-5 | LOW | CLAUDE.md says "cysFLR and cyWETH" but code now supports cyFXRP | PENDING |
| A00-6 | LOW | No mention of `scripts/` directory or fetch script | PENDING |
| A00-7 | LOW | CI workflow `start` script includes epoch-specific diffCalculator | PENDING |

## Pass 1: Security
| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| A02-1 | CRITICAL | `REWARD_POOL` incorrect value due to float precision loss | DISMISSED — dust-level (2^24 wei ≈ 0.000002% of pool), consistent across all outputs |
| A06-1 | CRITICAL | `processTransfer` token address lookup not lowercased | FIXED — added `.toLowerCase()` at lookup site |
| A06-2 | CRITICAL | `processLiquidityPositions` token address lookup not lowercased | FIXED — added `.toLowerCase()` at lookup site |
| A07-1 | CRITICAL | GraphQL `skip` pagination ceiling causes silent data truncation | DISMISSED — incorrect; uses Goldsky not The Graph hosted service, 370K records successfully fetched |
| A03-1 | HIGH | Out-of-bounds access on `oldRewards` when distributedCount exceeds length | FIXED — added explicit bounds check with descriptive error |
| A06-3 | HIGH | `processLiquidityPositions` owner not case-normalized as map key | FIXED — added `.toLowerCase()` via local `owner` variable |
| A06-6 | HIGH | `final` balance can go negative, producing negative rewards | DISMISSED — blocklist integrity test guards against duplicate cheaters; root cause (clamp final to 0n) deferred to future work |
| A01-1 | MEDIUM | No input validation on `generateSnapshotBlocks` parameters | PENDING |
| A03-2 | MEDIUM | Greedy allocation algorithm is order-dependent and non-deterministic | DISMISSED — order matches original distribution pattern, least surprising for recipients |
| A03-3 | MEDIUM | `remainingRewards` can go negative without detection | FIXED — added assertion that remainingRewards >= 0n |
| A03-4 | MEDIUM | No validation that reward strings are valid non-negative integers | PENDING |
| A04-1 | MEDIUM | No validation of `SEED` env var (non-null assertion on undefined) | PENDING |
| A04-2 | MEDIUM | `START_SNAPSHOT`/`END_SNAPSHOT` silently default to 0 | PENDING |
| A04-3 | MEDIUM | Unchecked JSON.parse on every line of JSONL data files | PENDING |
| A05-1 | MEDIUM | Silent omission of failed pool tick queries inflates rewards | FIXED — added codesize check to distinguish undeployed pools from real slot0 failures |
| A06-5 | MEDIUM | Division by zero in `calculateRewards` if totalBalances is 0 | PENDING |
| A06-7 | MEDIUM | Multiple reports against same cheater cause excessive penalty | DISMISSED — blocklist integrity test guards against duplicate cheaters; root cause deferred to future work |
| A06-10 | MEDIUM | Transient RPC failures permanently cached as false | FIXED — throw instead of caching false after exhausting retries |
| A06-11 | MEDIUM | `epochLength` not validated against `snapshots.length` | PENDING |
| A07-2 | MEDIUM | Unbounded in-memory accumulation / O(n^2) I/O | PENDING |
| A07-3 | MEDIUM | Relative file paths for output | PENDING |
| A07-4 | MEDIUM | No validation of `END_SNAPSHOT` numeric value | PENDING |
| A07-5 | MEDIUM | Silent exit code 0 on fatal error | PENDING |
| A08-1 | MEDIUM | Unbranded `string` for Ethereum addresses in types | PENDING |
| A08-2 | MEDIUM | Numeric values stored as `string` without parse validation | PENDING |
| A01-2 | LOW | Possible duplicate snapshot blocks | PENDING |
| A01-3 | LOW | Inconsistent address casing in constants | PENDING |
| A02-2 | LOW | `ONE` uses intermediate float; correct but fragile pattern | PENDING |
| A03-5 | LOW | No address format validation in readCsv | PENDING |
| A03-6 | LOW | `main()` executes unconditionally on module import | PENDING |
| A03-7 | LOW | Hardcoded file paths and block range identifiers | PENDING |
| A03-8 | LOW | Duplicate addresses in input CSV silently accepted | PENDING |
| A04-4 | LOW | File paths from env vars without sanitization | PENDING |
| A04-5 | LOW | Race condition: output dir created after first write | PENDING |
| A04-6 | LOW | Mutation of `addresses` array with splice(-1,1) risk | PENDING |
| A04-7 | LOW | Blocklist parsing does not validate address format | PENDING |
| A05-2 | LOW | Fixed retry delay, not exponential backoff as documented | PENDING |
| A05-3 | LOW | No validation of `blockNumber` parameter | PENDING |
| A05-4 | LOW | No pool address format validation | PENDING |
| A05-5 | LOW | Unbounded pool array could cause oversized RPC request | PENDING |
| A06-4 | LOW | Division by zero if `sumOfInverseFractions` is 0 | PENDING |
| A06-8 | LOW | `accountTransfers` map keys not case-normalized | PENDING |
| A06-9 | LOW | Non-null assertions on `Map.get()` with no defensive checks | PENDING |
| A06-12 | LOW | Duplicate snapshot block numbers not prevented | PENDING |
| A06-14 | LOW | No validation that `transfer.value` is non-negative | PENDING |
| A07-6 | LOW | No integrity check on subgraph response shape | PENDING |
| A07-7 | LOW | Hardcoded subgraph URL | PENDING |
| A07-8 | LOW | No rate limiting or backoff on subgraph requests | PENDING |
| A08-3 | LOW | `blockNumber` and `timestamp` as unguarded `number` | PENDING |
| A08-4 | LOW | `LiquidityChangeV3` tick/fee accept arbitrary `number` | PENDING |
| A08-5 | LOW | `LiquidityChangeType` enum cast from unvalidated string | PENDING |
| A08-6 | LOW | `EligibleBalances`/`RewardsPerToken` use unkeyed `Map<string>` | PENDING |

## Pass 2: Test Coverage
| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| A01-1 | HIGH | `isSameAddress` has zero test coverage | PENDING |
| A03-7 | HIGH | No test for `calculateDiff` with zero-reward entries | PENDING |
| A05-1 | HIGH | `getPoolsTick` function is entirely untested | PENDING |
| A05-2 | HIGH | Retry-then-succeed path never tested | PENDING |
| A06-1 | HIGH | `isApprovedSource` has no dedicated tests | PENDING |
| A06-10 | HIGH | `calculateRewardsPoolsPertoken` division by zero untested | PENDING |
| A07-1 | HIGH | No test file exists for `scraper.ts` | PENDING |
| A07-2 | HIGH | `scrapeTransfers()` data mapping logic untested | PENDING |
| A07-3 | HIGH | `scrapeLiquidityChanges()` data mapping logic untested | PENDING |
| A01-2 | MEDIUM | `generateSnapshotBlocks` not tested with `start === end` | PENDING |
| A01-3 | MEDIUM | `generateSnapshotBlocks` not tested with `start > end` | PENDING |
| A01-4 | MEDIUM | `generateSnapshotBlocks` not tested with adjacent blocks | PENDING |
| A01-9 | MEDIUM | `generateSnapshotBlocks` not tested with very large range | PENDING |
| A02-5 | MEDIUM | `REWARD_POOL` likely incorrect due to float precision loss | PENDING |
| A03-2 | MEDIUM | No test for `readCsv` header content validation | PENDING |
| A03-3 | MEDIUM | No test for `calculateDiff` with negative remaining budget | PENDING |
| A03-6 | MEDIUM | No test for `calculateDiff` case-insensitivity | PENDING |
| A03-8 | MEDIUM | No test for underpaid/covered/uncovered mutual exclusion | PENDING |
| A03-11 | MEDIUM | `main()` side-effects on import limit test isolation | PENDING |
| A03-14 | MEDIUM | No test that `totalRemainingUncovered` equals uncovered sum | PENDING |
| A04-2 | MEDIUM | File parsing logic in `main()` is untested | PENDING |
| A04-3 | MEDIUM | CSV output generation logic is untested | PENDING |
| A05-3 | MEDIUM | Retry exhaustion and error re-throw never tested | PENDING |
| A05-4 | MEDIUM | Retry delay timing is never asserted | PENDING |
| A06-2 | MEDIUM | `processTransfer` unknown tokenAddress throw path untested | PENDING |
| A06-3 | MEDIUM | `processLiquidityPositions` unknown tokenAddress throw untested | PENDING |
| A06-4 | MEDIUM | `processLiquidityPositions` with V3 events not tested | PENDING |
| A06-5 | MEDIUM | `processLiquidityPositions` skipping ineligible tokens untested | PENDING |
| A06-6 | MEDIUM | `processTransfer` skipping ineligible tokens untested | PENDING |
| A06-11 | MEDIUM | No test for transfer exactly at snapshot block boundary | PENDING |
| A06-12 | MEDIUM | No test for liquidity event exactly at snapshot block boundary | PENDING |
| A07-4 | MEDIUM | Pagination/batching logic is untested | PENDING |
| A07-5 | MEDIUM | File writing (JSONL serialization) is untested | PENDING |
| A07-6 | MEDIUM | `UNTIL_SNAPSHOT` off-by-one calculation is untested | PENDING |
| A01-5 | LOW | `generateSnapshotBlocks` not tested with empty seed string | PENDING |
| A01-6 | LOW | No tests verify ascending sort with duplicate blocks | PENDING |
| A01-7 | LOW | Exported constants have no structural tests | PENDING |
| A02-1 | LOW | `ONE` constant has no direct test coverage | PENDING |
| A02-2 | LOW | `REWARD_POOL` has no direct unit test for its value | PENDING |
| A02-4 | LOW | CSV column header constants not directly asserted | PENDING |
| A03-1 | LOW | No test for `readCsv` with whitespace-padded values | PENDING |
| A03-4 | LOW | No test for `calculateDiff` with duplicate addresses in newRewards | PENDING |
| A03-5 | LOW | No test for `calculateDiff` with duplicate addresses in oldRewards | PENDING |
| A03-9 | LOW | No test for `readCsv` with single data row | PENDING |
| A03-10 | LOW | No test for `readCsv` with very large reward values | PENDING |
| A03-12 | LOW | No test for `calculateDiff` with distributedCount = oldRewards.length | PENDING |
| A03-13 | LOW | No test for greedy algorithm ordering with splice reordering | PENDING |
| A03-15 | LOW | No test for `calculateDiff` with all entries underpaid | PENDING |
| A03-16 | LOW | `main()` CSV output tests do not verify underpaid scenario | PENDING |
| A03-17 | LOW | No test for `readCsv` with Windows-style CRLF line endings | PENDING |
| A04-1 | LOW | No test file exists for `src/index.ts` | PENDING |
| A04-4 | LOW | Zero-reward address filtering splice pattern untested | PENDING |
| A04-5 | LOW | Reward total verification is log-only and untested | PENDING |
| A04-6 | LOW | Balance verification logic is log-only and untested | PENDING |
| A04-7 | LOW | Snapshot file written before output dir created, untested | PENDING |
| A04-8 | LOW | Environment variable handling defaults are untested | PENDING |
| A05-5 | LOW | `BigInt` conversion of `blockNumber` in `getPoolsTick` untested | PENDING |
| A05-6 | LOW | Negative tick value boundary not explicitly validated | PENDING |
| A05-7 | LOW | Tick value at zero not tested | PENDING |
| A05-8 | LOW | Duplicate pool addresses not tested | PENDING |
| A06-7 | LOW | `getUniqueAddresses` not independently tested | PENDING |
| A06-8 | LOW | `calculateTotalEligibleBalances` not independently tested | PENDING |
| A06-9 | LOW | `getTokensWithBalance` not independently tested | PENDING |
| A06-13 | LOW | No test for empty snapshots array | PENDING |
| A06-14 | LOW | No test for single snapshot | PENDING |
| A06-15 | LOW | Multiple reports against same cheater not tested | PENDING |
| A06-16 | LOW | Reporter who is also a cheater not tested | PENDING |
| A06-17 | LOW | `processLpRange` clamping to zero not tested | PENDING |
| A06-18 | LOW | `accountTransfers` tracking never verified | PENDING |
| A06-19 | LOW | `calculateRewards` with penalty-reduced balances not tested | PENDING |
| A06-20 | LOW | `processLiquidityPositions` withdrawal exceeding balance untested | PENDING |
| A07-7 | LOW | Module auto-executes on import, preventing unit testing | PENDING |
| A07-8 | LOW | Exported type `SubgraphLiquidityChange` has no consumer tests | PENDING |
| A07-9 | LOW | Error handling for network failures and malformed responses untested | PENDING |
| A08-2 | LOW | `LiquidityChangeType.Transfer` enum value never exercised | PENDING |

## Pass 3: Documentation
| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| A02-4 | CRITICAL | `REWARD_POOL` incorrect value due to float precision loss | PENDING |
| A03-1 | HIGH | `calculateDiff` has no JSDoc or documentation | PENDING |
| A03-2 | HIGH | CLAUDE.md description of `diffCalculator.ts` is incorrect | PENDING |
| A01-2 | LOW | Exported constants lack JSDoc documentation | PENDING |
| A01-4 | LOW | Unused import: `Epoch` imported but never referenced | PENDING |
| A02-1 | LOW | `ONE` has no documentation | PENDING |
| A02-2 | LOW | `REWARD_POOL` has no documentation | PENDING |
| A02-3 | LOW | `REWARD_POOL` is raw numeric literal, hard to verify | PENDING |
| A02-6 | LOW | CSV column header comment doesn't state which constants it covers | PENDING |
| A03-3 | MEDIUM | `DiffResult` interface fields are completely undocumented | PENDING |
| A03-4 | MEDIUM | `RewardEntry` and `DiffEntry` type aliases are undocumented | PENDING |
| A03-5 | MEDIUM | `DISTRIBUTED_COUNT` constant has no documentation | PENDING |
| A03-6 | MEDIUM | `readCsv` JSDoc is incomplete and partially inaccurate | PENDING |
| A03-7 | LOW | `main()` function has no documentation | PENDING |
| A03-8 | LOW | Inline comment on line 67 contains a typo | PENDING |
| A03-9 | LOW | Inline comment on line 73 has typos and is misleading | PENDING |
| A03-10 | LOW | Inline comment on line 95 has minor grammar issue | PENDING |
| A03-11 | LOW | Console output has hardcoded, potentially misleading count | PENDING |
| A04-1 | LOW | No JSDoc or file-level documentation on `main()` | PENDING |
| A04-2 | LOW | No documentation on `START_SNAPSHOT` and `END_SNAPSHOT` | PENDING |
| A04-4 | LOW | Comment on line 196 is inaccurate (wrong filename) | PENDING |
| A04-5 | LOW | Import path inconsistency: `./processor.js` vs `./config` | PENDING |
| A04-6 | MEDIUM | No documentation on the blocklist file format | PENDING |
| A04-10 | LOW | Non-null assertion on `process.env.SEED!` is undocumented | PENDING |
| A05-1 | LOW | `getPoolsTickMulticall` has no documentation at all | PENDING |
| A05-2 | LOW | `getPoolsTick` JSDoc is incomplete and partially inaccurate | PENDING |
| A05-4 | LOW | `abi` constant is undocumented | PENDING |
| A05-7 | LOW | Hardcoded multicall address is undocumented | PENDING |
| A06-1 | LOW | Class `Processor` has no JSDoc documentation | PENDING |
| A06-2 | LOW | Constructor parameters are undocumented | PENDING |
| A06-3 | LOW | No JSDoc on any of the 10 public methods | PENDING |
| A06-5 | LOW | Method name `calculateRewardsPoolsPertoken` has inconsistent casing | PENDING |
| A06-7 | MEDIUM | `epochLength` vs `snapshots.length` inconsistency undocumented | PENDING |
| A06-8 | LOW | `processLpRange` comment lacks side effects / calling order | PENDING |
| A07-1 | MEDIUM | `scrapeTransfers()` function has no documentation | PENDING |
| A07-2 | MEDIUM | `scrapeLiquidityChanges()` function has no documentation | PENDING |
| A07-3 | MEDIUM | Exported type `SubgraphLiquidityChange` has no documentation | PENDING |
| A07-4 | MEDIUM | CLAUDE.md omits `data/pools.dat` from scraper description | PENDING |
| A07-5 | MEDIUM | `UNTIL_SNAPSHOT` off-by-one has insufficient documentation | PENDING |
| A07-6 | LOW | No module-level documentation or file header | PENDING |
| A07-7 | LOW | `SubgraphTransfer` interface has no documentation | PENDING |
| A07-8 | LOW | `SubgraphLiquidityChangeBase`/V2/V3 types have no documentation | PENDING |
| A07-9 | LOW | `SUBGRAPH_URL` constant has no documentation | PENDING |
| A07-10 | LOW | `BATCH_SIZE` constant has no documentation | PENDING |
| A07-11 | LOW | `main()` function has minimal documentation | PENDING |
| A07-12 | LOW | Inline comments use inconsistent terminology | PENDING |
| A08-1 | LOW | `CyToken` interface has no documentation | PENDING |
| A08-2 | LOW | `Transfer` interface has no documentation | PENDING |
| A08-3 | LOW | `TransferDetail` interface has no documentation | PENDING |
| A08-4 | LOW | `AccountBalance` interface has no documentation | PENDING |
| A08-5 | LOW | `Report` interface has no documentation | PENDING |
| A08-6 | MEDIUM | `AccountSummary` has no docs and complex nested structure | PENDING |
| A08-7 | LOW | `TokenBalances` interface has no documentation | PENDING |
| A08-9 | LOW | `TransferRecord` has no docs and overlaps with `Transfer` | PENDING |
| A08-10 | LOW | `AccountTransfers` interface has no documentation | PENDING |
| A08-11 | LOW | `LiquidityChangeType` enum has no documentation | PENDING |
| A08-12 | LOW | `LiquidityChange` type family has no documentation | PENDING |
| A08-13 | LOW | `Epoch` type alias has partial inline documentation | PENDING |
| A01-1 | LOW | `isSameAddress` function lacks JSDoc documentation | PENDING |

## Pass 4: Code Quality
| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| A02-1 | CRITICAL | `REWARD_POOL` loses precision due to Number-to-BigInt conversion | PENDING |
| A06-1 | CRITICAL | Inconsistent case normalization on `tokenAddress` map lookups | PENDING |
| A03-1 | HIGH | Side effect on import: `main()` executes unconditionally | PENDING |
| A03-2 | HIGH | Hardcoded file paths in `main()` function | PENDING |
| A06-2 | HIGH | `processLpRange()` has O(S*T*A*L) complexity with string matching | PENDING |
| A08-1 | HIGH | Three exported types completely unused: Report, AccountSummary, TransferRecord | PENDING |
| A03-3 | MEDIUM | Hardcoded console messages reference specific epoch | PENDING |
| A03-4 | MEDIUM | Typos in comments | PENDING |
| A03-5 | MEDIUM | Inconsistent indentation style | PENDING |
| A03-6 | MEDIUM | Redundant `.toLowerCase()` calls in `calculateDiff` | PENDING |
| A04-1 | MEDIUM | God function: `main()` handles entire pipeline (~220 lines) | PENDING |
| A06-3 | MEDIUM | `accountTransfers` is a write-only field (dead code) | PENDING |
| A06-4 | MEDIUM | Constructor `epochLength` is redundant with `snapshots.length` | PENDING |
| A06-5 | MEDIUM | Constructor `reports` uses inline type instead of `Report` interface | PENDING |
| A06-6 | MEDIUM | Constructor `client` is typed as `any` | PENDING |
| A06-7 | MEDIUM | `isApprovedSource` permanently caches false on transient failures | PENDING |
| A06-8 | MEDIUM | Penalty calculation allows negative `final` via double-penalization | PENDING |
| A06-9 | MEDIUM | Duplicated snapshot balance update logic across three locations | PENDING |
| A06-10 | MEDIUM | Redundant `async` on methods that perform no awaits | PENDING |
| A08-2 | MEDIUM | `TransferRecord` is a near-duplicate of `Transfer` | PENDING |
| A08-3 | MEDIUM | `TransferDetail` only used internally, never independently | PENDING |
| A01-1 | LOW | Unused import: `Epoch` | PENDING |
| A01-2 | LOW | Inconsistent address casing across configuration arrays | PENDING |
| A01-4 | LOW | `generateSnapshotBlocks` does not deduplicate snapshots | PENDING |
| A02-2 | LOW | `ONE` uses a fragile pattern that happens to work | PENDING |
| A03-7 | LOW | CSV header construction is duplicated | PENDING |
| A03-8 | LOW | Missing semicolons on several lines | PENDING |
| A03-9 | LOW | `DISTRIBUTED_COUNT` is epoch-specific | PENDING |
| A03-10 | LOW | `structuredClone` vs shallow copy | PENDING |
| A03-11 | LOW | Greedy budget allocation order-dependent but undocumented | PENDING |
| A04-2 | LOW | Duplicated JSONL parsing pattern | PENDING |
| A04-3 | LOW | Inconsistent import path style: `.js` extension on one import | PENDING |
| A04-4 | LOW | Hardcoded file paths throughout | PENDING |
| A04-5 | LOW | Unsafe non-null assertion on `process.env.SEED` | PENDING |
| A04-6 | LOW | Misleading log messages reference wrong filenames | PENDING |
| A04-7 | LOW | Mutating `addresses` array via splice while iterating | PENDING |
| A05-1 | LOW | Misleading retry count in comments | PENDING |
| A05-2 | LOW | Inconsistent `blockNumber` parameter types | PENDING |
| A05-3 | LOW | Fixed delay documented as exponential backoff | PENDING |
| A06-11 | LOW | Duplicated balance initialization pattern | PENDING |
| A06-12 | LOW | `lp3TrackList` inline type is complex and anonymous | PENDING |
| A06-13 | LOW | `calculateRewardsPoolsPertoken` has typo in method name | PENDING |
| A06-14 | LOW | `console.log` in library class for operational output | PENDING |
| A06-15 | LOW | Magic number `10n`/`100n` for bounty percentage | PENDING |
| A06-16 | LOW | Magic number `500` for retry backoff base delay | PENDING |
| A07-1 | LOW | Side effect on import: `config()` and `assert` at module scope | PENDING |
| A07-2 | LOW | Structural duplication between the two scrape functions | PENDING |
| A07-3 | LOW | Unsafe `any` type in liquidity mapping defeats type safety | PENDING |
| A08-4 | LOW | Inconsistent use of `interface` vs `type` for object shapes | PENDING |
| A08-5 | LOW | `AccountSummary` hardcodes 2 snapshots, system uses 30 | PENDING |
| A08-6 | LOW | Inline anonymous type in `AccountTransfers.transfersOut` | PENDING |
