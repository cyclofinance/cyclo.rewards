# Audit Triage — 2026-02-22-01

## Pass 0: Process Review
| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| A00-1 | MEDIUM | `.env` variables don't match CLAUDE.md documentation | PENDING |
| A00-2 | LOW | `.env.example` is stale and misleading | PENDING |
| A00-3 | LOW | CLAUDE.md does not mention `RPC_URL` environment variable | PENDING |
| A00-6 | MEDIUM | Branch name suggests active work on env variable fix | PENDING |

## Pass 1: Security
| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| A01-1 | MEDIUM | No input validation on `generateSnapshotBlocks` parameters | PENDING |
| A01-2 | LOW | Possible duplicate snapshot blocks (no uniqueness guarantee) | PENDING |
| A01-3 | LOW | Mixed-case address constants | PENDING |
| A02-1 | LOW | Fragile BigInt construction from float intermediate (`ONE`) | PENDING |
| A02-2 | LOW | REWARD_POOL constructed via numeric literal exceeding MAX_SAFE_INTEGER | PENDING |
| A03-1 | MEDIUM | Greedy allocation algorithm is order-dependent | PENDING |
| A03-2 | MEDIUM | No validation that reward string is valid non-negative integer | PENDING |
| A03-3 | LOW | No address format validation in readCsv | PENDING |
| A03-4 | LOW | Hardcoded file paths create brittle logic | PENDING |
| A03-5 | LOW | `main()` executes on import as side effect | PENDING |
| A03-6 | MEDIUM | Potential out-of-bounds access on `oldRewards` array | PENDING |
| A03-7 | MEDIUM | Arithmetic on `remainingRewards` can go negative without detection | PENDING |
| A04-1 | MEDIUM | Non-null assertion on `process.env.SEED` without validation | PENDING |
| A04-2 | MEDIUM | Environment variable defaults silently produce invalid block range | PENDING |
| A04-3 | MEDIUM | Unsanitized data in CSV output | PENDING |
| A04-4 | MEDIUM | JSON.parse on untrusted file content without schema validation | PENDING |
| A04-5 | LOW | File write before directory creation (race condition) | PENDING |
| A04-6 | LOW | Blocklist parsing does not validate address format | PENDING |
| A04-7 | LOW | Mutating array while iterating over Map (splice with indexOf -1) | PENDING |
| A04-8 | LOW | Relative file paths depend on working directory | PENDING |
| A05-1 | MEDIUM | Silent omission of failed pool tick queries | PENDING |
| A05-2 | LOW | Fixed retry delay without exponential backoff (doc mismatch) | PENDING |
| A05-4 | LOW | No validation of `blockNumber` parameter | PENDING |
| A05-5 | LOW | Potential DoS via unbounded pool array | PENDING |
| A06-1 | MEDIUM | Division-by-zero when all eligible balances are zero or negative | PENDING |
| A06-2 | MEDIUM | Token address case sensitivity mismatch in map lookups | PENDING |
| A06-3 | MEDIUM | Negative `final` balance from excessive penalties distorts rewards | PENDING |
| A06-4 | LOW | Exhausted retries silently treats approved source as unapproved | PENDING |
| A06-5 | LOW | `client` parameter typed as `any` bypasses type safety | PENDING |
| A06-6 | LOW | Liquidity positions and transfers use divergent balance tracking | PENDING |
| A07-1 | MEDIUM | Unbounded memory growth from in-memory accumulation | PENDING |
| A07-2 | HIGH | Subgraph `skip` pagination limit (5000) may cause silent data truncation | PENDING |
| A07-3 | LOW | `parseInt` without validation on subgraph response fields | PENDING |
| A07-5 | LOW | No retry logic or timeout on network requests | PENDING |
| A07-6 | LOW | Relative file paths for output files | PENDING |
| A08-1 | MEDIUM | Address fields lack branded/opaque typing | PENDING |
| A08-2 | MEDIUM | Numeric value fields use `string` with no format enforcement | PENDING |
| A08-3 | LOW | No `readonly` modifiers on any interface fields | PENDING |
| A08-4 | LOW | `Transfer` and `TransferRecord` near-duplication | PENDING |
| A08-7 | LOW | Map keys lack normalization guarantee | PENDING |

## Pass 2: Test Coverage
| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| P2-A01-1 | HIGH | `isSameAddress` has no unit test | PENDING |
| P2-A01-2 | MEDIUM | Internal assertion failure path never tested | PENDING |
| P2-A01-3 | MEDIUM | Ascending order test assumes no duplicate blocks | PENDING |
| P2-A01-4 | MEDIUM | No edge-case testing for boundary inputs (start===end, start>end) | PENDING |
| P2-A01-5 | LOW | Exported constants have no structural validation tests | PENDING |
| P2-A03-01 | CRITICAL | `main()` function has zero unit test coverage | PENDING |
| P2-A03-02 | CRITICAL | `main()` executes on module import | PENDING |
| P2-A03-03 | HIGH | No test for covered/uncovered splitting algorithm | PENDING |
| P2-A03-04 | HIGH | No test for diff calculation for underpaid accounts | PENDING |
| P2-A03-05 | HIGH | No test for `DISTRIBUTED_COUNT` boundary behavior | PENDING |
| P2-A03-06 | HIGH | No test for CSV file write correctness | PENDING |
| P2-A03-07 | MEDIUM | No test for `readCsv` with non-numeric reward value | PENDING |
| P2-A03-08 | MEDIUM | No test for `readCsv` with negative or zero reward values | PENDING |
| P2-A03-09 | MEDIUM | No test for duplicate addresses in CSV input | PENDING |
| P2-A03-10 | MEDIUM | `diffCalculatorOutput.test.ts` does not validate diff CSV | PENDING |
| P2-A03-11 | MEDIUM | No test that accounting invariants hold | PENDING |
| P2-A03-12 | LOW | Case-insensitive comparison is redundant | PENDING |
| P2-A03-13 | LOW | `main()` console output not tested | PENDING |
| P2-A05-1 | CRITICAL | `getPoolsTick` (retry wrapper) has ZERO test coverage | PENDING |
| P2-A05-2 | HIGH | No test for retry succeeding after initial failure(s) | PENDING |
| P2-A05-3 | MEDIUM | No test for retry delay timing | PENDING |
| P2-A05-4 | MEDIUM | No test for `BigInt(blockNumber)` conversion edge cases | PENDING |
| P2-A05-5 | HIGH | No test verifying error thrown after exhausting retries | PENDING |
| P2-A05-7 | LOW | No test for duplicate pool addresses in input | PENDING |
| P2-A05-8 | LOW | No test verifying `allowFailure: true` resilience | PENDING |
| P2-A06-1 | HIGH | `isApprovedSource` entirely mocked — zero direct tests | PENDING |
| P2-A06-2 | HIGH | `processTransfer` error path for unknown token untested | PENDING |
| P2-A06-3 | HIGH | `processLiquidityPositions` error path for unknown token untested | PENDING |
| P2-A06-4 | MEDIUM | `processTransfer` non-CYTOKENS token early return untested | PENDING |
| P2-A06-5 | MEDIUM | `processLiquidityPositions` non-CYTOKENS early return untested | PENDING |
| P2-A06-6 | HIGH | V3 liquidity tracking through `processLiquidityPositions` never exercised | PENDING |
| P2-A06-7 | LOW | `getUniqueAddresses` no direct test | PENDING |
| P2-A06-8 | LOW | `getTokensWithBalance` no direct test | PENDING |
| P2-A06-9 | LOW | `calculateTotalEligibleBalances` no direct test | PENDING |
| P2-A06-10 | CRITICAL | Division by zero in `calculateRewardsPoolsPertoken` untested | PENDING |
| P2-A06-11 | MEDIUM | No test for zero reward pool | PENDING |
| P2-A06-12 | HIGH | Penalty can make `final` negative — no test for multiple reports against same cheater | PENDING |
| P2-A06-13 | MEDIUM | Transfer at exact snapshot block boundary not tested | PENDING |
| P2-A06-14 | MEDIUM | Liquidity event at exact snapshot block boundary not tested | PENDING |
| P2-A06-15 | MEDIUM | Zero-value transfer not tested | PENDING |
| P2-A06-16 | LOW | Zero depositedBalanceChange not tested | PENDING |
| P2-A06-17 | MEDIUM | `epochLength` vs `snapshots.length` mismatch unvalidated | PENDING |
| P2-A06-18 | LOW | Reporter-only-has-bounty scenario not explicitly tested | PENDING |
| P2-A06-19 | LOW | Balance goes negative from deductions — zero-clamping not tested | PENDING |
| P2-A06-20 | MEDIUM | `accountTransfers` tracking not tested | PENDING |
| P2-A06-21 | MEDIUM | Sender balance from unapproved transfer reduction not tested | PENDING |
| P2-A09-1 | HIGH | `scraper.ts` has zero test coverage | PENDING |
| P2-A09-2 | HIGH | `index.ts` has zero test coverage | PENDING |
| P2-A09-3 | MEDIUM | `REWARD_POOL` financial constant never directly validated | PENDING |
| P2-A09-4 | MEDIUM | `ONE` precision constant never directly validated | PENDING |
| P2-A09-5 | MEDIUM | `scraper.ts` runtime assertion on `END_SNAPSHOT` untested | PENDING |
| P2-A09-6 | LOW | `types.ts` unused type definitions | PENDING |
| P2-A09-8 | MEDIUM | Blocklist parsing logic fragile and untested | PENDING |

## Pass 3: Documentation
| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| P3-A01-2 | MEDIUM | No documentation on `REWARDS_SOURCES` | PENDING |
| P3-A01-3 | MEDIUM | No documentation on `FACTORIES` | PENDING |
| P3-A01-4 | MEDIUM | No documentation on `CYTOKENS` | PENDING |
| P3-A01-6 | MEDIUM | No documentation on `isSameAddress` | PENDING |
| P3-A01-7 | LOW | `generateSnapshotBlocks` JSDoc incomplete | PENDING |
| P3-A01-8 | LOW | No module-level documentation for config.ts | PENDING |
| P3-A06-1 | HIGH | No JSDoc on `Processor` class | PENDING |
| P3-A06-2 | MEDIUM | No JSDoc on `isApprovedSource` | PENDING |
| P3-A06-3 | HIGH | No JSDoc on `processTransfer` | PENDING |
| P3-A06-4 | MEDIUM | No JSDoc on `getEligibleBalances` | PENDING |
| P3-A06-5 | MEDIUM | No JSDoc on `calculateRewardsPoolsPertoken` | PENDING |
| P3-A06-6 | HIGH | No JSDoc on `processLiquidityPositions` | PENDING |
| P3-A06-7 | MEDIUM | No JSDoc on `processLpRange` | PENDING |
| P3-A06-8 | MEDIUM | No JSDoc on `calculateRewards` | PENDING |
| P3-A06-9 | LOW | No JSDoc on utility methods | PENDING |
| P3-A06-10 | LOW | No JSDoc on `calculateTotalEligibleBalances` | PENDING |
| P3-A06-14 | MEDIUM | Constructor `epochLength` relationship undocumented | PENDING |
| P3-A06-15 | LOW | `client` typed as `any` | PENDING |
| P3-A06-17 | HIGH | Missing documentation on required calling order between methods | PENDING |
| P3-A10-1 | MEDIUM | `readCsv` JSDoc says "array and map" but only returns array | PENDING |
| P3-A10-2 | MEDIUM | `getPoolsTickMulticall` exported but undocumented | PENDING |
| P3-A10-3 | LOW | `getPoolsTick` JSDoc incomplete | PENDING |
| P3-A10-4 | LOW | `ONE` and `REWARD_POOL` undocumented | PENDING |
| P3-A10-5 | LOW | `REWARD_POOL` uses raw literal instead of deriving from `ONE` | PENDING |
| P3-A10-6 | MEDIUM | All 18 types in types.ts lack JSDoc | PENDING |
| P3-A10-7 | LOW | `index.ts` main() undocumented | PENDING |
| P3-A10-8 | MEDIUM | `scrapeTransfers`/`scrapeLiquidityChanges` undocumented | PENDING |
| P3-A10-9 | LOW | Exported `SubgraphLiquidityChange` undocumented | PENDING |
| P3-A10-10 | MEDIUM | `diffCalculator.ts` main() has magic numbers and no docs | PENDING |
| P3-A10-11 | LOW | Hardcoded versioned subgraph URL undocumented | PENDING |
| P3-A10-12 | LOW | Hardcoded Multicall3 address undocumented | PENDING |
| P3-A10-14 | MEDIUM | `Transfer` and `TransferRecord` overlap undocumented | PENDING |
| P3-A10-15 | HIGH | `blockNumber` type mismatch between related public functions | PENDING |

## Pass 4: Code Quality
| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| A11-1 | MEDIUM | Unused `Epoch` import in config.ts | PENDING |
| A11-2 | MEDIUM | `generateSnapshotBlocks` allows duplicate snapshots | PENDING |
| A11-3 | LOW | `BigInt(10 ** 18)` uses intermediate float | PENDING |
| A11-4 | LOW | `REWARD_POOL` is opaque magic number | PENDING |
| A11-5 | MEDIUM | Dead types in types.ts | PENDING |
| A11-6 | LOW | Inconsistent address casing | PENDING |
| A11-9 | LOW | `AccountSummary` hardcodes 2 snapshots | PENDING |
| A12-1 | CRITICAL | Inconsistent case normalization of `tokenAddress` | PENDING |
| A12-2 | MEDIUM | Constructor uses inline type instead of `Report` interface | PENDING |
| A12-3 | MEDIUM | Constructor `client` typed as `any` | PENDING |
| A12-4 | LOW | `lp3TrackList` inline type is complex and anonymous | PENDING |
| A12-5 | LOW | Redundant `async` on sync methods | PENDING |
| A12-6 | MEDIUM | Duplicated snapshot balance update logic | PENDING |
| A12-7 | LOW | Duplicated balance initialization pattern | PENDING |
| A12-8 | HIGH | O(tokens * accounts * lpPositions) complexity in processLpRange | PENDING |
| A12-9 | LOW | Method name typo `calculateRewardsPoolsPertoken` | PENDING |
| A12-10 | LOW | `console.log` in library class | PENDING |
| A12-12 | MEDIUM | `epochLength` parameter redundant with `snapshots.length` | PENDING |
| A12-13 | MEDIUM | No validation on constructor inputs | PENDING |
| A12-15 | MEDIUM | `isApprovedSource` caches `false` on exhausted retries | PENDING |
| A12-16 | MEDIUM | Penalty calculation allows double-penalization | PENDING |
| A13-1 | HIGH | diffCalculator main() is hardcoded one-off script in standard pipeline | PENDING |
| A13-2 | MEDIUM | Synchronous vs asynchronous file I/O inconsistency | PENDING |
| A13-3 | LOW | Multiple typos in comments | PENDING |
| A13-4 | LOW | Unreachable code in getPoolsTick retry loop | PENDING |
| A13-5 | MEDIUM | Inconsistent blockNumber parameter types | PENDING |
| A13-6 | MEDIUM | `any` type assertion in scraper liquidity change mapping | PENDING |
| A13-7 | HIGH | Inconsistent env variable validation across entry points | PENDING |
| A13-8 | LOW | Inconsistent module extension in import paths | PENDING |
| A13-9 | MEDIUM | No validation of parsed JSONL data in index.ts | PENDING |
| A13-10 | MEDIUM | Subgraph pagination limited to 5000 results | PENDING |
| A13-11 | LOW | Intermediate file writes on every batch in scraper wasteful | PENDING |
| A13-14 | LOW | Mutating array with splice during iteration in diffCalculator | PENDING |
| A13-15 | MEDIUM | Covered/uncovered split is order-dependent and greedy | PENDING |
| A13-16 | LOW | index.ts splice with indexOf potentially removes wrong element | PENDING |
| A13-19 | LOW | REWARD_POOL not derived from ONE | PENDING |
| A13-20 | LOW | Scraper types partially redundant with types.ts | PENDING |
