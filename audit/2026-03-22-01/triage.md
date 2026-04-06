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
| A07-3 | LOW | `getUniqueAddresses` does not normalize addresses (downstream of A07-1) | PENDING — #33 |
| A07-4 | LOW | Penalty redistribution mechanism is implicit; CLAUDE.md description imprecise | PENDING — #34 |
| A08-1 | MEDIUM | Skip-based pagination ceiling risk (Goldsky may relax limit, but code is fragile) | PENDING — #35 |
| A08-2 | LOW | `parseIntStrict` uses `parseInt` without radix, accepts trailing garbage | PENDING — #36 |
| A08-3 | LOW | `transactionHash` passed through without validation | PENDING — #37 |
| A08-4 | LOW | No runtime validation of subgraph response shape | PENDING — #38 |
| A10-1 | MEDIUM | Code injection via `python3 -c` string interpolation of RPC data in fetch script | DISMISSED — script is Dec 2025-specific, removed from CI, not used for current epochs |
| A10-2 | LOW | Relative output path assumes working directory in fetch script | DISMISSED — Dec 2025 specific, not in active use |
| A10-3 | LOW | No validation of `cast tx` output format in fetch script | DISMISSED — Dec 2025 specific, not in active use |

## Pass 2: Test Coverage
| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| A01-P2-1 | LOW | `generateSnapshotBlocks` does not test start/end always included | PENDING — #39 |
| A01-P2-2 | LOW | No test for inverted range (`start > end`) in `generateSnapshotBlocks` | PENDING — #40 |
| A01-P2-3 | LOW | `parseEnv` silently accepts `"123abc"` — no test documents this | PENDING — #41 |
| A02-P2-1 | MEDIUM | `validateAddress` (only function in constants.ts) has zero test coverage | FIXED — 8 direct tests added |
| A02-P2-2 | LOW | `DEC25_REWARD_POOL` value never directly asserted | DISMISSED — Dec 2025 specific, not in active use |
| A02-P2-3 | LOW | `BOUNTY_PERCENT` not tested | PENDING — #42 |
| A03-P2-1 | MEDIUM | No CRLF line ending test for `readCsv` | FIXED — normalize CRLF to LF in readCsv; LF and CRLF tests added |
| A03-P2-2 | MEDIUM | No duplicate address test for `calculateDiff` inputs | FIXED — duplicate of A03-1 |
| A03-P2-3 | MEDIUM | No negative reward test for `calculateDiff` | FIXED — duplicate of A03-6 |
| A03-P2-4 | LOW | No large BigInt value test for `readCsv` | PENDING — #43 |
| A03-P2-5 | LOW | `main()` in diffCalculator not independently testable | DISMISSED — Dec 2025 specific, not in active use |
| A03-P2-6 | LOW | No explicit whitespace-in-address test for `readCsv` | PENDING — #44 |
| A04-P2-1 | MEDIUM | No unit test for reward pool tolerance check (index.ts lines 163-173) | FIXED — extracted verifyRewardPoolTolerance to pipeline.ts; 5 tests added |
| A04-P2-2 | MEDIUM | No unit test for balance verification throw (index.ts lines 125-127) | DISMISSED — summarizeTokenBalances.verified already tested in pipeline.test.ts |
| A04-P2-3 | LOW | No test for silent transfer file read errors | PENDING — #45 |
| A04-P2-4 | LOW | No test for pools JSON.parse without validation | PENDING — #46 |
| A05-P2-1 | MEDIUM | `client.getCode()` throwing during failure classification untested | FIXED — test added showing getCode errors propagate correctly |
| A05-P2-2 | LOW | setTimeout delay duration never asserted in retry tests | PENDING — #47 |
| A05-P2-3 | LOW | Fractional/Infinity blockNumber not tested | PENDING — #48 |
| A05-P2-4 | LOW | Success on third (final) retry attempt untested | PENDING — #49 |
| A06-P2-1 | LOW | `filterZeroRewards` address absent from map untested | PENDING — #50 |
| A06-P2-2 | LOW | `formatRewardsCsv` address absent from map untested | PENDING — #51 |
| A06-P2-3 | LOW | `formatBalancesCsv` `!tokenBalance` branch never exercised separately | PENDING — #52 |
| A06-P2-4 | LOW | `formatBalancesCsv` `totalRewardsPerAddress` missing entry untested | PENDING — #53 |
| A06-P2-5 | LOW | `formatBalancesCsv` inner-map miss untested | PENDING — #54 |
| A06-P2-6 | LOW | `parseBlocklist` malformed whitespace untested | PENDING — #55 |
| A07-P2-1 | MEDIUM | `transferIsDeposit`/`transferIsWithdraw` have no direct branch-level tests | FIXED — 6 direct tests: match, no match, wrong change type for each |
| A07-P2-2 | MEDIUM | Penalty/bounty logic only tested with single token | FIXED — multi-token penalty test verifying independent per-token penalties and bounties |
| A07-P2-3 | MEDIUM | Inverse-fraction reward weighting has no correctness test (existing test is tautological) | FIXED — 4 tests: unequal split, equal split, single token, 3 tokens with different decimals |
| A07-P2-4 | MEDIUM | `processLpRange` negative-balance clamping untested | FIXED — covered by V3 end-to-end out-of-range test |
| A07-P2-5 | LOW | `getUniqueAddresses`, `calculateTotalEligibleBalances`, `getTokensWithBalance` only tested indirectly | PENDING — #56 |
| A07-P2-6 | LOW | `organizeLiquidityPositions` ineligible-token skip untested | PENDING — #57 |
| A08-P2-1 | MEDIUM | `parseIntStrict` accepts trailing garbage — no test covers this | FIXED — use Number() + Number.isInteger() + round-trip; 5 tests added |
| A08-P2-2 | MEDIUM | `scrapeTransfers` entirely untested (pagination, chunking, crash recovery) | PENDING — #58 |
| A08-P2-3 | MEDIUM | `scrapeLiquidityChanges` entirely untested | PENDING — #59 |
| A08-P2-4 | LOW | Module-level END_SNAPSHOT assertion untested | PENDING — #60 |
| A08-P2-5 | LOW | `main().catch()` error handling untested | PENDING — #61 |
| A09-P2-1 | LOW | `LpV3Position` has no direct test coverage | PENDING — #62 |
| A10-P2-1 | LOW | No unit test for `decode_tx()` ABI decoding logic | PENDING — #63 |
| A10-P2-2 | LOW | CSV header never asserted in fetch script tests | PENDING — #64 |
| A10-P2-3 | LOW | `.toLowerCase()` masks address format regressions | PENDING — #65 |

## Pass 3: Documentation
| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| A01-P3-1 | LOW | `parseEnv` has no JSDoc | PENDING — #66 |
| A01-P3-2 | LOW | No module-level JSDoc on `config.ts` | PENDING — #67 |
| A02-P3-1 | LOW | `REWARD_POOL`/`DEC25_REWARD_POOL` hardcoded without derivation logic in source | PENDING — #68 |
| A02-P3-2 | LOW | CLAUDE.md references stale `ONE` name and wrong REWARD_POOL amount (dup of A00-1) | PENDING — #69 |
| A03-P3-1 | LOW | `readCsv` JSDoc says "array and map" but only array returned | DISMISSED — Dec 2025 specific, not in active use |
| A03-P3-2 | LOW | `readCsv` missing `@returns` tag | DISMISSED — Dec 2025 specific, not in active use |
| A03-P3-3 | LOW | `readCsv` missing `@throws` documentation | DISMISSED — Dec 2025 specific, not in active use |
| A03-P3-4 | MEDIUM | `calculateDiff` has no JSDoc | DISMISSED — Dec 2025 specific, not in active use |
| A03-P3-5 | MEDIUM | `DISTRIBUTED_COUNT = 100` magic constant unexplained | FIXED — duplicate of A03-5 |
| A03-P3-6 | LOW | `main()` in diffCalculator undocumented | DISMISSED — Dec 2025 specific, not in active use |
| A03-P3-7 | LOW | Typo: "distirbuted" (line 70) | DISMISSED — Dec 2025 specific, not in active use |
| A03-P3-8 | LOW | Typo: "undistruibuted" / "thos" (line 76) | DISMISSED — Dec 2025 specific, not in active use |
| A03-P3-9 | LOW | Hardcoded "3 accounts" in log; should use `result.underpaid.length` | DISMISSED — Dec 2025 specific, not in active use |
| A03-P3-10 | LOW | Typo: "cant" should be "can't" (line 98) | DISMISSED — Dec 2025 specific, not in active use |
| A03-P3-11 | LOW | `RewardEntry`, `DiffEntry`, `DiffResult` types undocumented | DISMISSED — Dec 2025 specific, not in active use |
| A04-P3-1 | LOW | `main()` JSDoc omits thrown errors | PENDING — #70 |
| A04-P3-2 | LOW | `main()` JSDoc omits output files | PENDING — #71 |
| A04-P3-3 | LOW | `main()` JSDoc doesn't mention pools data file | PENDING — #72 |
| A05-P3-1 | LOW | Missing `@throws` on `getPoolsTick` | PENDING — #73 |
| A05-P3-2 | LOW | `blockNumber` type difference undocumented between exported functions | PENDING — #74 |
| A05-P3-3 | LOW | Missing `@throws` on `getPoolsTickMulticall` | PENDING — #75 |
| A06-P3-1 | LOW | No module-level JSDoc on `pipeline.ts` | PENDING — #76 |
| A06-P3-2 | LOW | `TokenSummary` interface undocumented | PENDING — #77 |
| A06-P3-3 | LOW | `summarizeTokenBalances` undocumented | PENDING — #78 |
| A06-P3-4 | LOW | `aggregateRewardsPerAddress` undocumented | PENDING — #79 |
| A06-P3-5 | LOW | `sortAddressesByReward` undocumented | PENDING — #80 |
| A06-P3-7 | LOW | `formatRewardsCsv` undocumented | PENDING — #81 |
| A06-P3-8 | MEDIUM | `formatBalancesCsv` undocumented (6 params, complex column generation) | FIXED — added JSDoc with all params and return |
| A06-P3-9 | LOW | `parseJsonl` undocumented | PENDING — #82 |
| A06-P3-10 | LOW | `parseBlocklist` undocumented | PENDING — #83 |
| A07-P3-1 | LOW | `getEligibleBalances` doesn't document that `final` can be negative | PENDING — #84 |
| A07-P3-2 | LOW | `processTransfer` doesn't document reversal logic | PENDING — #85 |
| A07-P3-3 | LOW | `processLiquidityPositions` doesn't document Transfer vs Deposit/Withdraw handling | PENDING — #86 |
| A07-P3-4 | LOW | `calculateRewardsPoolsPerToken` doesn't document formula or ONE_18 scaling | PENDING — #87 |
| A08-P3-1 | LOW | `parseIntStrict` JSDoc overstates strictness | PENDING — #88 |
| A08-P3-2 | LOW | `SubgraphTransfer` lacks per-field JSDoc | PENDING — #89 |
| A08-P3-3 | LOW | `SubgraphLiquidityChangeBase` lacks per-field JSDoc | PENDING — #90 |
| A08-P3-4 | LOW | `SUBGRAPH_URL` JSDoc missing epoch-update note | PENDING — #91 |
| A09-P3-1 | LOW | `CyToken.name` and `CyToken.address` lack JSDoc | PENDING — #92 |
| A09-P3-2 | MEDIUM | `AccountBalance.currentNetBalance` JSDoc invariant is violated by LP transfer events | FIXED — currentNetBalance replaced with boughtCap + lpBalance; boughtCap invariant (= transfersInFromApproved - transfersOut) verified to hold |
| A09-P3-3 | LOW | `LiquidityChangeType` enum values lack per-value JSDoc | PENDING — #93 |
| A09-P3-4 | LOW | `LiquidityChangeBase.lpAddress` ambiguous without JSDoc | PENDING — #94 |
| A09-P3-5 | LOW | `LiquidityChangeV3.poolAddress` lacks JSDoc | PENDING — #95 |
| A09-P3-6 | LOW | `LpV3Position.value` JSDoc says "deposited balance" but is net cumulative | PENDING — #96 |
| A10-P3-1 | LOW | `decode_tx()` lacks function-level doc comment | PENDING — #97 |
| A10-P3-2 | LOW | ABI comment hardcodes "50" as array length but code reads dynamically | PENDING — #98 |
| A10-P3-3 | LOW | No comment explaining why `python3` used (256-bit overflow) | PENDING — #99 |

## Pass 4: Code Quality
| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| A01-P4-1 | LOW | Magic number `30` repeated 4 times without named constant | PENDING — #100 |
| A01-P4-3 | LOW | Mixed `assert()` vs `assert.ok()` style | PENDING — #101 |
| A01-P4-4 | LOW | Module-level RPC_URL assertion couples pure utility imports to env state | PENDING — #102 |
| A01-P4-7 | LOW | Duplicate env parsing logic between config.ts and scraper.ts | PENDING — #103 |
| A02-P4-1 | LOW | REWARD_POOL/DEC25_REWARD_POOL use opaque literals instead of derivation expressions | PENDING — #104 |
| A02-P4-2 | LOW | TRANSFER_FILE_COUNT decoupled from scraper — no assertion prevents data loss | PENDING — #105 |
| A03-P4-1 | MEDIUM | Inconsistent indentation in diffCalculator.ts (4-space vs 2-space) | DISMISSED — Dec 2025 specific, not in active use |
| A03-P4-2 | MEDIUM | ~20 missing semicolons in diffCalculator.ts | DISMISSED — Dec 2025 specific, not in active use |
| A03-P4-3 | HIGH | `main()` executes unconditionally on import (dup of A03-2) | DISMISSED — Dec 2025 specific, not in active use |
| A03-P4-4 | HIGH | 5 hardcoded epoch-specific file paths in diffCalculator `main()` | DISMISSED — Dec 2025 specific, not in active use |
| A03-P4-6 | MEDIUM | Redundant `.toLowerCase()` calls in `calculateDiff` | DISMISSED — Dec 2025 specific, not in active use |
| A03-P4-7 | LOW | Inconsistent `./` prefix in file paths | DISMISSED — Dec 2025 specific, not in active use |
| A03-P4-8 | LOW | CSV header construction duplicated | DISMISSED — Dec 2025 specific, not in active use |
| A03-P4-9 | LOW | `DISTRIBUTED_COUNT` epoch-specific but exported as general | DISMISSED — Dec 2025 specific, not in active use |
| A03-P4-10 | LOW | Greedy budget allocation order-dependent but undocumented | DISMISSED — Dec 2025 specific, not in active use |
| A03-P4-11 | LOW | `structuredClone` on flat objects where shallow copy suffices | DISMISSED — Dec 2025 specific, not in active use |
| A04-P4-1 | MEDIUM | Tolerance check uses manual BigInt abs and magic `1000n` — not testable independently | FIXED — extracted verifyRewardPoolTolerance (dup of A04-P2-1) |
| A04-P4-2 | LOW | Quadratic array growth via spread in transfer loading loop | PENDING — #106 |
| A04-P4-3 | LOW | UPPER_CASE local variables (SEED, START_SNAPSHOT, etc.) | PENDING — #107 |
| A04-P4-4 | LOW | Missing semicolons in index.ts | PENDING — #108 |
| A04-P4-5 | LOW | Balance verification interleaves 7 console.log with safety-critical throw | PENDING — #109 |
| A05-P4-1 | MEDIUM | Fixed 10s retry ignores `RETRY_BASE_DELAY_MS` from constants; magic numbers | FIXED — extracted MAX_ATTEMPTS and RETRY_DELAY_MS constants |
| A05-P4-2 | LOW | Inline comment "retry 3 times" contradicts JSDoc "3 attempts" | PENDING — #110 |
| A05-P4-3 | LOW | `blockNumber` type inconsistency between exported functions | PENDING — #111 |
| A05-P4-4 | LOW | `resolve("")` passes unused empty string | PENDING — #112 |
| A05-P4-5 | LOW | Magic numbers for retry policy (3, 10_000, 2) | PENDING — #113 |
| A06-P4-2 | LOW | Redundant iterations in `summarizeTokenBalances` | PENDING — #114 |
| A06-P4-3 | LOW | Non-null assertions inconsistent with file style | PENDING — #115 |
| A06-P4-4 | LOW | Fragile whitespace handling in `parseBlocklist` | PENDING — #116 |
| A07-P4-1 | LOW | Inconsistent semicolons in processor.ts | PENDING — #117 |
| A07-P4-2 | LOW | AccountBalance init literal duplicated 3 times | PENDING — #118 |
| A07-P4-3 | LOW | `processLiquidityPositions` duplicates `updateSnapshots` logic inline | PENDING — #119 |
| A07-P4-4 | MEDIUM | `processLpRange` O(snapshots * tokens * accounts * positions) | PENDING — #120 |
| A07-P4-5 | LOW | `calculateTotalEligibleBalances` called 4 times with same input | PENDING — #121 |
| A07-P4-7 | LOW | Inline ABI literal inconsistent with module-level pattern in liquidity.ts | PENDING — #122 |
| A07-P4-10 | MEDIUM | V3 position IDs built by string interpolation in two locations with no shared helper | FIXED — extracted lpV3PositionId helper |
| A07-P4-11 | MEDIUM | `processTransfer` is a 72-line god method with confusing credit-then-undo pattern | FIXED — replaced with 18-line bought cap model; LP movements return early |
| A08-P4-1 | MEDIUM | `VALID_CHANGE_TYPES` duplicates `LiquidityChangeType` enum — two sources of truth | FIXED — scraper now derives from Object.values(LiquidityChangeType) |
| A08-P4-2 | LOW | Duplicate import statements from `./constants` | PENDING — #123 |
| A08-P4-3 | LOW | `UNTIL_SNAPSHOT` adds `+1` despite inclusive `blockNumber_lte` | PENDING — #124 |
| A08-P4-4 | LOW | Duplicated pagination/batching structure in scraper | PENDING — #125 |
| A09-P4-1 | LOW | `LiquidityChangeBase` exported but never imported outside types.ts | PENDING — #126 |
| A10-P4-1 | MEDIUM | `python3` per-iteration in loop; overlaps injection finding A10-1 | DISMISSED — Dec 2025 script, not in active use |
| A10-P4-2 | LOW | Magic numbers in ABI offset arithmetic | PENDING — #127 |
| A10-P4-3 | LOW | Duplicated decode-and-append for TX1/TX2 | PENDING — #128 |
| A10-P4-4 | LOW | `local` declarations misleading in bash function scope | PENDING — #129 |
| A10-P4-5 | LOW | Inconsistent variable naming in fetch script | PENDING — #130 |

## Pass 5: Correctness / Intent Verification
| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| A01-P5-1 | LOW | Test describe block named `generateSnapshotTimestampForEpoch` but tests `generateSnapshotBlocks` | PENDING — #131 |
| A05-P5-1 | MEDIUM | V3 in-range check uses `<=` upper bound; Uniswap V3 requires `<` (processor.ts:644) | FIXED — changed to `<` with TDD test |
| A05-P5-2 | LOW | Magic index `result[1]` for tick extraction | PENDING — #132 |
| A05-P5-3 | LOW | Wasted 10s sleep on final retry | PENDING — #133 |
| A06-P5-1 | LOW | `sortAddressesByReward` non-deterministic for equal rewards (no tiebreaker) | PENDING — #134 |
| A06-P5-2 | LOW | `parseBlocklist` `split(" ")` fails on double spaces/tabs | PENDING — #135 |
| A07-P5-1 | LOW | `processTransfer` double-updates snapshots on approved non-deposit transfers | PENDING — #136 |
| A07-P5-2 | LOW | Reward calculation truncation — total rewards can be < pool (correct direction) | PENDING — #137 |
| A07-P5-3 | LOW | Test "should track approved transfers correctly" name misleading | PENDING — #138 |
| A07-P5-4 | LOW | No test for multi-cheater penalty stacking; negative final possible | PENDING — #139 |
| A04-P5-1 | LOW | `getEligibleBalances()` computed twice in index.ts (once for verification, once inside calculateRewards) | PENDING — #140 |
| A04-P5-2 | LOW | Transfer/liquidity data parsed via `parseJsonl` returning `any[]` with no schema validation | PENDING — #141 |
| A08-P5-1 | LOW | No runtime guard against unknown `__typename` in V2/V3 discrimination | PENDING — #142 |
| A08-P5-2 | LOW | `UNTIL_SNAPSHOT` +1 fetches one extra block beyond stated intent | PENDING — #143 |
| A09-P5-1 | LOW | `currentNetBalance` JSDoc invariant violated by LP transfer events | PENDING — #144 |
| A09-P5-2 | LOW | `depositedBalanceChange` JSDoc omits Transfer variant sign convention | PENDING — #145 |
| A10-P5-1 | MEDIUM | Undocumented function signature makes ABI layout unverifiable in fetch script | DISMISSED — Dec 2025 script, not in active use |
| A10-P5-2 | LOW | No validation that address and amount arrays have equal length | PENDING — #146 |
| A10-P5-3 | LOW | No validation that address zero-padding bytes are zero | PENDING — #147 |
