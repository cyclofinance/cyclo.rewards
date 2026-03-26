# Audit Triage — 2026-03-22-01

Findings are deduplicated across passes. When the same issue was flagged in multiple passes, it is listed under the most relevant pass with cross-references.

## Pass 0: Process Review
| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| A00-1 | MEDIUM | CLAUDE.md constants.ts description stale: says `ONE` (renamed to `ONE_18`), says 1M tokens (now 500K), omits ~15 new exports | FIXED — updated constants.ts description to list current exports |
| A00-2 | MEDIUM | CLAUDE.md Architecture omits `src/pipeline.ts` and `src/index.ts` | FIXED — added index.ts and pipeline.ts entries |
| A00-3 | MEDIUM | CLAUDE.md pipeline description inaccurate: includes diffCalculator.ts in pipeline arrow; says processor.ts outputs CSVs (index.ts does) | FIXED — corrected pipeline arrow, processor.ts description, diffCalculator.ts marked standalone |

## Pass 1: Security
| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| A01-1 | LOW | `parseInt` without radix in `parseEnv` accepts hex/floats/trailing garbage (also P4-CFG-02 MEDIUM, P5-SCRAPER-02 MEDIUM) | FIXED — replaced with `Number()` + `Number.isInteger()` + string round-trip; 3 tests added |
| A01-2 | LOW | `generateSnapshotBlocks` does not validate `start <= end` or safe integer inputs | FIXED — added non-negative integer assertions for start/end; 4 tests added |
| A01-3 | LOW | Potential unbounded loop in `generateSnapshotBlocks` when range exactly 30 | FIXED — replaced rejection sampling with Fisher-Yates shuffle (src/shuffle.ts, 9 tests); O(n) guaranteed termination |
| A03-1 | MEDIUM | Duplicate addresses in `newRewards` cause silent double-counting in `calculateDiff` | FIXED — added duplicate address validation for both newRewards and oldRewards; 2 tests added |
| A03-2 | MEDIUM | `diffCalculator.ts` `main()` executes unconditionally on module import (also P4 HIGH) | FIXED — extracted reusable exports to src/diff.ts; diffCalculator.ts is now a pure script; main() side-effect tests moved to dedicated file |
| A03-3 | LOW | No address format validation in `readCsv` despite `validateAddress` existing | FIXED — added validateAddress call in readCsv; 1 test added, 5 existing tests updated to use valid addresses |
| A03-4 | LOW | `readCsv` does not validate CSV header row | FIXED — added header validation against expected constants; 1 test added |
| A03-5 | LOW | Hardcoded file paths and `DISTRIBUTED_COUNT` in diffCalculator | DOCUMENTED — added JSDoc to DISTRIBUTED_COUNT and main() explaining Dec 2025 epoch context |
| A03-6 | LOW | Negative reward values accepted without validation in `readCsv` | FIXED — added negative reward check in readCsv; test updated from accepts→rejects |
| A03-7 | LOW | No validation that `distributedCount` is a non-negative integer | FIXED — added Number.isInteger + non-negative check; 3 tests added |
| A04-1 | LOW | Pool data `JSON.parse` with type assertion, no runtime validation | FIXED — extracted parsePools to pipeline.ts with array/string/address validation; 5 tests added; index.ts updated to use it |
| A04-2 | LOW | Missing transfer files silently swallowed via `.catch(() => "")` | FIXED — extracted readOptionalFile to pipeline.ts; only swallows ENOENT, propagates other errors; 3 tests added |
| A05-1 | LOW | Unnecessary 10s sleep on final retry failure before rethrowing | FIXED — swapped throw before sleep on final iteration |
| A05-2 | LOW | No runtime validation of pool addresses in `getPoolsTickMulticall` | DOCUMENTED — validation belongs at boundary (parsePools); added precondition note to JSDoc |
| A06-1 | MEDIUM | `parseJsonl` returns `any[]` with no schema validation (also P4-PIPE-1) | FIXED — generic validate callback on parseJsonl; validateTransfer and validateLiquidityChange with full field, format, txHash, non-negative block/timestamp checks; 43 tests; wired into index.ts |
| A06-2 | LOW | `parseBlocklist` silently ignores extra space-separated tokens per line | FIXED — validate exactly 2 parts per line; 2 tests added |
| A06-3 | LOW | Non-null assertions in `sortAddressesByReward` | DISMISSED — keys come from `rewards.keys()`, always exist |
| A07-1 | MEDIUM | `processTransfer` uses un-normalized addresses as Map keys; case mismatch with other methods | FIXED — Raw/Normalized type pairs; normalizeTransfer/normalizeLiquidityChange lowercase at boundary; ~40 redundant .toLowerCase() calls removed from processor, pipeline, liquidity, index, and tests |
| A07-2 | MEDIUM | `balance.final` can go negative with duplicate cheater reports; no clamp to 0 | FIXED — parseBlocklist now rejects duplicate cheater addresses; test added |
| A07-3 | LOW | `getUniqueAddresses` does not normalize addresses (downstream of A07-1) | PENDING |
| A07-4 | LOW | Penalty redistribution mechanism is implicit; CLAUDE.md description imprecise | PENDING |
| A08-1 | MEDIUM | Skip-based pagination ceiling risk (Goldsky may relax limit, but code is fragile) | PENDING |
| A08-2 | LOW | `parseIntStrict` uses `parseInt` without radix, accepts trailing garbage | PENDING |
| A08-3 | LOW | `transactionHash` passed through without validation | PENDING |
| A08-4 | LOW | No runtime validation of subgraph response shape | PENDING |
| A10-1 | MEDIUM | Code injection via `python3 -c` string interpolation of RPC data in fetch script | DISMISSED — script is Dec 2025-specific, removed from CI, not used for current epochs |
| A10-2 | LOW | Relative output path assumes working directory in fetch script | PENDING |
| A10-3 | LOW | No validation of `cast tx` output format in fetch script | PENDING |

## Pass 2: Test Coverage
| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| A01-P2-1 | LOW | `generateSnapshotBlocks` does not test start/end always included | PENDING |
| A01-P2-2 | LOW | No test for inverted range (`start > end`) in `generateSnapshotBlocks` | PENDING |
| A01-P2-3 | LOW | `parseEnv` silently accepts `"123abc"` — no test documents this | PENDING |
| A02-P2-1 | MEDIUM | `validateAddress` (only function in constants.ts) has zero test coverage | FIXED — 8 direct tests added |
| A02-P2-2 | LOW | `DEC25_REWARD_POOL` value never directly asserted | PENDING |
| A02-P2-3 | LOW | `BOUNTY_PERCENT` not tested | PENDING |
| A03-P2-1 | MEDIUM | No CRLF line ending test for `readCsv` | FIXED — normalize CRLF to LF in readCsv; LF and CRLF tests added |
| A03-P2-2 | MEDIUM | No duplicate address test for `calculateDiff` inputs | FIXED — duplicate of A03-1 |
| A03-P2-3 | MEDIUM | No negative reward test for `calculateDiff` | FIXED — duplicate of A03-6 |
| A03-P2-4 | LOW | No large BigInt value test for `readCsv` | PENDING |
| A03-P2-5 | LOW | `main()` in diffCalculator not independently testable | PENDING |
| A03-P2-6 | LOW | No explicit whitespace-in-address test for `readCsv` | PENDING |
| A04-P2-1 | MEDIUM | No unit test for reward pool tolerance check (index.ts lines 163-173) | PENDING |
| A04-P2-2 | MEDIUM | No unit test for balance verification throw (index.ts lines 125-127) | PENDING |
| A04-P2-3 | LOW | No test for silent transfer file read errors | PENDING |
| A04-P2-4 | LOW | No test for pools JSON.parse without validation | PENDING |
| A05-P2-1 | MEDIUM | `client.getCode()` throwing during failure classification untested | PENDING |
| A05-P2-2 | LOW | setTimeout delay duration never asserted in retry tests | PENDING |
| A05-P2-3 | LOW | Fractional/Infinity blockNumber not tested | PENDING |
| A05-P2-4 | LOW | Success on third (final) retry attempt untested | PENDING |
| A06-P2-1 | LOW | `filterZeroRewards` address absent from map untested | PENDING |
| A06-P2-2 | LOW | `formatRewardsCsv` address absent from map untested | PENDING |
| A06-P2-3 | LOW | `formatBalancesCsv` `!tokenBalance` branch never exercised separately | PENDING |
| A06-P2-4 | LOW | `formatBalancesCsv` `totalRewardsPerAddress` missing entry untested | PENDING |
| A06-P2-5 | LOW | `formatBalancesCsv` inner-map miss untested | PENDING |
| A06-P2-6 | LOW | `parseBlocklist` malformed whitespace untested | PENDING |
| A07-P2-1 | MEDIUM | `transferIsDeposit`/`transferIsWithdraw` have no direct branch-level tests | PENDING |
| A07-P2-2 | MEDIUM | Penalty/bounty logic only tested with single token | PENDING |
| A07-P2-3 | MEDIUM | Inverse-fraction reward weighting has no correctness test (existing test is tautological) | PENDING |
| A07-P2-4 | MEDIUM | `processLpRange` negative-balance clamping untested | PENDING |
| A07-P2-5 | LOW | `getUniqueAddresses`, `calculateTotalEligibleBalances`, `getTokensWithBalance` only tested indirectly | PENDING |
| A07-P2-6 | LOW | `organizeLiquidityPositions` ineligible-token skip untested | PENDING |
| A08-P2-1 | MEDIUM | `parseIntStrict` accepts trailing garbage — no test covers this | PENDING |
| A08-P2-2 | MEDIUM | `scrapeTransfers` entirely untested (pagination, chunking, crash recovery) | PENDING |
| A08-P2-3 | MEDIUM | `scrapeLiquidityChanges` entirely untested | PENDING |
| A08-P2-4 | LOW | Module-level END_SNAPSHOT assertion untested | PENDING |
| A08-P2-5 | LOW | `main().catch()` error handling untested | PENDING |
| A09-P2-1 | LOW | `LpV3Position` has no direct test coverage | PENDING |
| A10-P2-1 | LOW | No unit test for `decode_tx()` ABI decoding logic | PENDING |
| A10-P2-2 | LOW | CSV header never asserted in fetch script tests | PENDING |
| A10-P2-3 | LOW | `.toLowerCase()` masks address format regressions | PENDING |

## Pass 3: Documentation
| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| A01-P3-1 | LOW | `parseEnv` has no JSDoc | PENDING |
| A01-P3-2 | LOW | No module-level JSDoc on `config.ts` | PENDING |
| A02-P3-1 | LOW | `REWARD_POOL`/`DEC25_REWARD_POOL` hardcoded without derivation logic in source | PENDING |
| A02-P3-2 | LOW | CLAUDE.md references stale `ONE` name and wrong REWARD_POOL amount (dup of A00-1) | PENDING |
| A03-P3-1 | LOW | `readCsv` JSDoc says "array and map" but only array returned | PENDING |
| A03-P3-2 | LOW | `readCsv` missing `@returns` tag | PENDING |
| A03-P3-3 | LOW | `readCsv` missing `@throws` documentation | PENDING |
| A03-P3-4 | MEDIUM | `calculateDiff` has no JSDoc | PENDING |
| A03-P3-5 | MEDIUM | `DISTRIBUTED_COUNT = 100` magic constant unexplained | FIXED — duplicate of A03-5 |
| A03-P3-6 | LOW | `main()` in diffCalculator undocumented | PENDING |
| A03-P3-7 | LOW | Typo: "distirbuted" (line 70) | PENDING |
| A03-P3-8 | LOW | Typo: "undistruibuted" / "thos" (line 76) | PENDING |
| A03-P3-9 | LOW | Hardcoded "3 accounts" in log; should use `result.underpaid.length` | PENDING |
| A03-P3-10 | LOW | Typo: "cant" should be "can't" (line 98) | PENDING |
| A03-P3-11 | LOW | `RewardEntry`, `DiffEntry`, `DiffResult` types undocumented | PENDING |
| A04-P3-1 | LOW | `main()` JSDoc omits thrown errors | PENDING |
| A04-P3-2 | LOW | `main()` JSDoc omits output files | PENDING |
| A04-P3-3 | LOW | `main()` JSDoc doesn't mention pools data file | PENDING |
| A05-P3-1 | LOW | Missing `@throws` on `getPoolsTick` | PENDING |
| A05-P3-2 | LOW | `blockNumber` type difference undocumented between exported functions | PENDING |
| A05-P3-3 | LOW | Missing `@throws` on `getPoolsTickMulticall` | PENDING |
| A06-P3-1 | LOW | No module-level JSDoc on `pipeline.ts` | PENDING |
| A06-P3-2 | LOW | `TokenSummary` interface undocumented | PENDING |
| A06-P3-3 | LOW | `summarizeTokenBalances` undocumented | PENDING |
| A06-P3-4 | LOW | `aggregateRewardsPerAddress` undocumented | PENDING |
| A06-P3-5 | LOW | `sortAddressesByReward` undocumented | PENDING |
| A06-P3-7 | LOW | `formatRewardsCsv` undocumented | PENDING |
| A06-P3-8 | MEDIUM | `formatBalancesCsv` undocumented (6 params, complex column generation) | PENDING |
| A06-P3-9 | LOW | `parseJsonl` undocumented | PENDING |
| A06-P3-10 | LOW | `parseBlocklist` undocumented | PENDING |
| A07-P3-1 | LOW | `getEligibleBalances` doesn't document that `final` can be negative | PENDING |
| A07-P3-2 | LOW | `processTransfer` doesn't document reversal logic | PENDING |
| A07-P3-3 | LOW | `processLiquidityPositions` doesn't document Transfer vs Deposit/Withdraw handling | PENDING |
| A07-P3-4 | LOW | `calculateRewardsPoolsPerToken` doesn't document formula or ONE_18 scaling | PENDING |
| A08-P3-1 | LOW | `parseIntStrict` JSDoc overstates strictness | PENDING |
| A08-P3-2 | LOW | `SubgraphTransfer` lacks per-field JSDoc | PENDING |
| A08-P3-3 | LOW | `SubgraphLiquidityChangeBase` lacks per-field JSDoc | PENDING |
| A08-P3-4 | LOW | `SUBGRAPH_URL` JSDoc missing epoch-update note | PENDING |
| A09-P3-1 | LOW | `CyToken.name` and `CyToken.address` lack JSDoc | PENDING |
| A09-P3-2 | MEDIUM | `AccountBalance.currentNetBalance` JSDoc invariant is violated by LP transfer events | FIXED — currentNetBalance replaced with boughtCap + lpBalance; boughtCap invariant (= transfersInFromApproved - transfersOut) verified to hold |
| A09-P3-3 | LOW | `LiquidityChangeType` enum values lack per-value JSDoc | PENDING |
| A09-P3-4 | LOW | `LiquidityChangeBase.lpAddress` ambiguous without JSDoc | PENDING |
| A09-P3-5 | LOW | `LiquidityChangeV3.poolAddress` lacks JSDoc | PENDING |
| A09-P3-6 | LOW | `LpV3Position.value` JSDoc says "deposited balance" but is net cumulative | PENDING |
| A10-P3-1 | LOW | `decode_tx()` lacks function-level doc comment | PENDING |
| A10-P3-2 | LOW | ABI comment hardcodes "50" as array length but code reads dynamically | PENDING |
| A10-P3-3 | LOW | No comment explaining why `python3` used (256-bit overflow) | PENDING |

## Pass 4: Code Quality
| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| A01-P4-1 | LOW | Magic number `30` repeated 4 times without named constant | PENDING |
| A01-P4-3 | LOW | Mixed `assert()` vs `assert.ok()` style | PENDING |
| A01-P4-4 | LOW | Module-level RPC_URL assertion couples pure utility imports to env state | PENDING |
| A01-P4-7 | LOW | Duplicate env parsing logic between config.ts and scraper.ts | PENDING |
| A02-P4-1 | LOW | REWARD_POOL/DEC25_REWARD_POOL use opaque literals instead of derivation expressions | PENDING |
| A02-P4-2 | LOW | TRANSFER_FILE_COUNT decoupled from scraper — no assertion prevents data loss | PENDING |
| A03-P4-1 | MEDIUM | Inconsistent indentation in diffCalculator.ts (4-space vs 2-space) | PENDING |
| A03-P4-2 | MEDIUM | ~20 missing semicolons in diffCalculator.ts | PENDING |
| A03-P4-3 | HIGH | `main()` executes unconditionally on import (dup of A03-2) | PENDING |
| A03-P4-4 | HIGH | 5 hardcoded epoch-specific file paths in diffCalculator `main()` | PENDING |
| A03-P4-6 | MEDIUM | Redundant `.toLowerCase()` calls in `calculateDiff` | PENDING |
| A03-P4-7 | LOW | Inconsistent `./` prefix in file paths | PENDING |
| A03-P4-8 | LOW | CSV header construction duplicated | PENDING |
| A03-P4-9 | LOW | `DISTRIBUTED_COUNT` epoch-specific but exported as general | PENDING |
| A03-P4-10 | LOW | Greedy budget allocation order-dependent but undocumented | PENDING |
| A03-P4-11 | LOW | `structuredClone` on flat objects where shallow copy suffices | PENDING |
| A04-P4-1 | MEDIUM | Tolerance check uses manual BigInt abs and magic `1000n` — not testable independently | PENDING |
| A04-P4-2 | LOW | Quadratic array growth via spread in transfer loading loop | PENDING |
| A04-P4-3 | LOW | UPPER_CASE local variables (SEED, START_SNAPSHOT, etc.) | PENDING |
| A04-P4-4 | LOW | Missing semicolons in index.ts | PENDING |
| A04-P4-5 | LOW | Balance verification interleaves 7 console.log with safety-critical throw | PENDING |
| A05-P4-1 | MEDIUM | Fixed 10s retry ignores `RETRY_BASE_DELAY_MS` from constants; magic numbers | PENDING |
| A05-P4-2 | LOW | Inline comment "retry 3 times" contradicts JSDoc "3 attempts" | PENDING |
| A05-P4-3 | LOW | `blockNumber` type inconsistency between exported functions | PENDING |
| A05-P4-4 | LOW | `resolve("")` passes unused empty string | PENDING |
| A05-P4-5 | LOW | Magic numbers for retry policy (3, 10_000, 2) | PENDING |
| A06-P4-2 | LOW | Redundant iterations in `summarizeTokenBalances` | PENDING |
| A06-P4-3 | LOW | Non-null assertions inconsistent with file style | PENDING |
| A06-P4-4 | LOW | Fragile whitespace handling in `parseBlocklist` | PENDING |
| A07-P4-1 | LOW | Inconsistent semicolons in processor.ts | PENDING |
| A07-P4-2 | LOW | AccountBalance init literal duplicated 3 times | PENDING |
| A07-P4-3 | LOW | `processLiquidityPositions` duplicates `updateSnapshots` logic inline | PENDING |
| A07-P4-4 | MEDIUM | `processLpRange` O(snapshots * tokens * accounts * positions) | PENDING |
| A07-P4-5 | LOW | `calculateTotalEligibleBalances` called 4 times with same input | PENDING |
| A07-P4-7 | LOW | Inline ABI literal inconsistent with module-level pattern in liquidity.ts | PENDING |
| A07-P4-10 | MEDIUM | V3 position IDs built by string interpolation in two locations with no shared helper | PENDING |
| A07-P4-11 | MEDIUM | `processTransfer` is a 72-line god method with confusing credit-then-undo pattern | FIXED — replaced with 18-line bought cap model; LP movements return early |
| A08-P4-1 | MEDIUM | `VALID_CHANGE_TYPES` duplicates `LiquidityChangeType` enum — two sources of truth | PENDING |
| A08-P4-2 | LOW | Duplicate import statements from `./constants` | PENDING |
| A08-P4-3 | LOW | `UNTIL_SNAPSHOT` adds `+1` despite inclusive `blockNumber_lte` | PENDING |
| A08-P4-4 | LOW | Duplicated pagination/batching structure in scraper | PENDING |
| A09-P4-1 | LOW | `LiquidityChangeBase` exported but never imported outside types.ts | PENDING |
| A10-P4-1 | MEDIUM | `python3` per-iteration in loop; overlaps injection finding A10-1 | PENDING |
| A10-P4-2 | LOW | Magic numbers in ABI offset arithmetic | PENDING |
| A10-P4-3 | LOW | Duplicated decode-and-append for TX1/TX2 | PENDING |
| A10-P4-4 | LOW | `local` declarations misleading in bash function scope | PENDING |
| A10-P4-5 | LOW | Inconsistent variable naming in fetch script | PENDING |

## Pass 5: Correctness / Intent Verification
| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| A01-P5-1 | LOW | Test describe block named `generateSnapshotTimestampForEpoch` but tests `generateSnapshotBlocks` | PENDING |
| A05-P5-1 | MEDIUM | V3 in-range check uses `<=` upper bound; Uniswap V3 requires `<` (processor.ts:644) | FIXED — changed to `<` with TDD test |
| A05-P5-2 | LOW | Magic index `result[1]` for tick extraction | PENDING |
| A05-P5-3 | LOW | Wasted 10s sleep on final retry | PENDING |
| A06-P5-1 | LOW | `sortAddressesByReward` non-deterministic for equal rewards (no tiebreaker) | PENDING |
| A06-P5-2 | LOW | `parseBlocklist` `split(" ")` fails on double spaces/tabs | PENDING |
| A07-P5-1 | LOW | `processTransfer` double-updates snapshots on approved non-deposit transfers | PENDING |
| A07-P5-2 | LOW | Reward calculation truncation — total rewards can be < pool (correct direction) | PENDING |
| A07-P5-3 | LOW | Test "should track approved transfers correctly" name misleading | PENDING |
| A07-P5-4 | LOW | No test for multi-cheater penalty stacking; negative final possible | PENDING |
| A04-P5-1 | LOW | `getEligibleBalances()` computed twice in index.ts (once for verification, once inside calculateRewards) | PENDING |
| A04-P5-2 | LOW | Transfer/liquidity data parsed via `parseJsonl` returning `any[]` with no schema validation | PENDING |
| A08-P5-1 | LOW | No runtime guard against unknown `__typename` in V2/V3 discrimination | PENDING |
| A08-P5-2 | LOW | `UNTIL_SNAPSHOT` +1 fetches one extra block beyond stated intent | PENDING |
| A09-P5-1 | LOW | `currentNetBalance` JSDoc invariant violated by LP transfer events | PENDING |
| A09-P5-2 | LOW | `depositedBalanceChange` JSDoc omits Transfer variant sign convention | PENDING |
| A10-P5-1 | MEDIUM | Undocumented function signature makes ABI layout unverifiable in fetch script | PENDING |
| A10-P5-2 | LOW | No validation that address and amount arrays have equal length | PENDING |
| A10-P5-3 | LOW | No validation that address zero-padding bytes are zero | PENDING |
