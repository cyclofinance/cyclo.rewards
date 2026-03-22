# Pass 2: Test Coverage — `src/diffCalculator.ts`

**Auditor:** A03
**Date:** 2026-03-22
**Source:** `src/diffCalculator.ts` (182 lines)
**Test files:**
- `src/diffCalculator.test.ts` (441 lines)
- `src/diffCalculatorOutput.test.ts` (221 lines)

---

## Evidence of Thorough Reading

### Source: `diffCalculator.ts`

| Line | Symbol | Kind |
|------|--------|------|
| 4 | `DISTRIBUTED_COUNT` | exported const (100) |
| 10 | `readCsv(filePath)` | exported function |
| 14-16 | empty file error | branch/error path |
| 18-20 | header-only error | branch/error path |
| 24-41 | line parsing loop | logic block |
| 26-28 | fewer than 2 columns error | error path |
| 29-31 | more than 2 columns error | error path |
| 33-35 | empty address error | error path |
| 37-39 | empty reward error | error path |
| 40 | `BigInt(rewardStr)` — non-numeric throws | implicit error path |
| 40 | `address.toLowerCase()` | normalization |
| 46 | `RewardEntry` | exported type |
| 47 | `DiffEntry` | exported type |
| 49-59 | `DiffResult` | exported interface |
| 61-132 | `calculateDiff(newRewards, oldRewards, distributedCount, rewardPool)` | exported function |
| 67-69 | distributedCount > oldRewards.length error | error path |
| 71 | `structuredClone(newRewards)` | non-mutation guard |
| 77-96 | distributed account loop | logic block |
| 81 | findIndex with case-insensitive match | branch |
| 82-95 | found in new rewards (splice + underpaid check) | branch |
| 85-93 | `diff > 0n` — underpaid path | branch |
| 94 | splice from remaining | mutation |
| 99-102 | `remainingRewards < 0n` error | error path |
| 108-119 | greedy coverage loop | logic block |
| 111-113 | `diff < 0n` — uncovered path | branch |
| 114-118 | covered path | branch |
| 134-178 | `main()` | non-exported function |
| 136-137 | reads two CSV files | I/O |
| 139 | calls `calculateDiff` | orchestration |
| 142-168 | writes three CSV files | I/O |
| 170-178 | `console.log` reporting | side-effects |

### Tests: `diffCalculator.test.ts`

| Line | Test |
|------|------|
| 28-32 | hoisted header matches constants |
| 39-44 | readCsv: empty file throws |
| 46-51 | readCsv: header-only throws |
| 53-59 | readCsv: fewer than 2 columns throws |
| 61-69 | readCsv: more than 2 columns throws |
| 71-78 | readCsv: empty address throws |
| 80-87 | readCsv: empty reward throws |
| 89-95 | readCsv: lowercase addresses |
| 97-106 | readCsv: parse valid CSV (two rows) |
| 108-113 | readCsv: non-numeric reward throws |
| 115-120 | readCsv: floating point throws |
| 122-128 | readCsv: accepts negative reward |
| 130-136 | readCsv: accepts zero reward |
| 138-147 | readCsv: duplicate addresses returned as separate entries |
| 154-183 | calculateDiff: covered/uncovered split |
| 185-204 | calculateDiff: underpaid identification |
| 206-219 | calculateDiff: not flagged if overpaid/exact |
| 222-236 | calculateDiff: removes distributed from remaining |
| 238-254 | calculateDiff: old account not in new rewards |
| 256-269 | calculateDiff: zero distributedCount |
| 271-282 | calculateDiff: exact budget fit |
| 284-292 | calculateDiff: empty new rewards |
| 294-309 | calculateDiff: does not mutate inputs |
| 311-334 | calculateDiff: covered+uncovered = remaining undistributed (invariant) |
| 336-350 | calculateDiff: totalNewDistribution + remainingRewardsDiff = remainingRewards (invariant) |
| 352-364 | calculateDiff: greedy ordering test |
| 366-374 | calculateDiff: distributedCount exceeds oldRewards throws |
| 376-384 | calculateDiff: totalAlreadyPaid exceeds rewardPool throws |
| 387-441 | main() CSV output: 4 tests via mock |

### Tests: `diffCalculatorOutput.test.ts`

| Line | Test |
|------|------|
| 6-13 | `parseCsv` helper |
| 15-22 | `parseDiffCsv` helper |
| 36-43 | covered+uncovered addresses = remaining undistributed addresses |
| 45-51 | covered+uncovered rewards = remaining undistributed rewards |
| 54-57 | new rewards no negative values |
| 59-64 | new rewards total <= DEC25_REWARD_POOL |
| 66-69 | all new rewards positive |
| 71-74 | no duplicate addresses in new rewards |
| 76-79 | no duplicate addresses in old rewards |
| 81-84 | no duplicate addresses in covered |
| 86-89 | no duplicate addresses in uncovered |
| 91-97 | every underpaid address in old distributed and new rewards |
| 99-104 | diff old values match old rewards |
| 106-111 | diff new values match new rewards |
| 113-116 | no duplicate addresses in diff |
| 118-125 | underpaid addresses not in covered/uncovered |
| 127-132 | diff entries correct arithmetic, positive diffs |
| 134-139 | covered total <= remaining pool |
| 142-147 | old distributed + covered <= DEC25_REWARD_POOL |
| 149-152 | all covered rewards positive |
| 154-157 | all uncovered rewards positive |
| 159-161 | old rewards >= DISTRIBUTED_COUNT entries |
| 163-167 | all old distributed rewards positive |
| 169-175 | covered and uncovered no overlap |
| 178-207 | on-chain distribution verification (4 tests) |
| 209-220 | blocklist integrity |

---

## Coverage Analysis

### `readCsv` — All explicit error paths tested

| Path | Tested? | Test(s) |
|------|---------|---------|
| Empty file | YES | L39-44 |
| Header-only | YES | L46-51 |
| < 2 columns | YES | L53-59 |
| > 2 columns | YES | L61-69 |
| Empty address | YES | L71-78 |
| Empty reward | YES | L80-87 |
| Non-numeric reward (BigInt throws) | YES | L108-113 |
| Floating point reward | YES | L115-120 |
| Lowercase normalization | YES | L89-95 |
| Valid multi-row parse | YES | L97-106 |
| Negative reward | YES | L122-128 |
| Zero reward | YES | L130-136 |
| Duplicate addresses | YES | L138-147 |

### `calculateDiff` — All branches tested

| Path | Tested? | Test(s) |
|------|---------|---------|
| distributedCount > oldRewards error | YES | L366-374 |
| totalAlreadyPaid > rewardPool error | YES | L376-384 |
| Underpaid detection (diff > 0) | YES | L185-204 |
| Not flagged when exact/overpaid | YES | L206-219 |
| Old account missing from new rewards | YES | L238-254 |
| Greedy coverage split | YES | L154-183 |
| Zero distributed count | YES | L256-269 |
| Exact budget fit | YES | L271-282 |
| Empty inputs | YES | L284-292 |
| Input non-mutation | YES | L294-309 |
| Invariant: covered+uncovered = remaining | YES | L311-334 |
| Invariant: distribution + remaining = budget | YES | L336-350 |
| Greedy ordering bias | YES | L352-364 |

### `main()` — Partially tested

| Path | Tested? | Test(s) |
|------|---------|---------|
| Writes 3 files | YES | L396-398 |
| Covered CSV format | YES | L400-409 |
| Uncovered CSV format | YES | L411-418 |
| Diff CSV format | YES | L420-427 |
| Only non-distributed in covered | YES | L429-440 |

---

## Prior Audit Item Status

| ID | Prior Finding | Status | Evidence |
|----|--------------|--------|----------|
| A03-1 | No CRLF line ending test for readCsv | STILL OPEN | No test with `\r\n` line endings exists. `readCsv` splits on `\n`, so `\r` would remain appended to values. |
| A03-2 | No whitespace-in-address test for readCsv | RESOLVED | L25 in source calls `.map(v => v.trim())` on split values. The lowercase test (L89-95) and the valid CSV test (L97-106) use trimmed inputs. However, there is no explicit test that verifies whitespace is stripped from addresses. Downgrading: the behavior is tested implicitly but not explicitly. |
| A03-3 | No large BigInt value test for readCsv | STILL OPEN | No test with 18-decimal-scale values (e.g. `1000000000000000000`). All test values use small integers. |
| A03-4 | No zero-reward entry test for calculateDiff | RESOLVED | L130-136 tests zero reward in `readCsv`. For `calculateDiff`, zero reward entries are not explicitly tested, but the function has no special handling for them — they flow through the same paths. |
| A03-5 | No mixed-case address test for calculateDiff | RESOLVED | L81 in source does `.toLowerCase()` comparison. The readCsv function normalizes to lowercase before data reaches calculateDiff. The `readCsv` test at L89-95 verifies this. |
| A03-6 | No duplicate address test for calculateDiff inputs | STILL OPEN | `readCsv` test at L138-147 shows duplicates are returned, but no test verifies `calculateDiff` behavior when given duplicate addresses in `newRewards` or `oldRewards`. The function uses `findIndex` which would match only the first occurrence. |
| A03-7 | main() not independently testable | STILL OPEN | `main()` is not exported; tested only as a side-effect of module import with mocked fs. Cannot be called independently with custom parameters. |
| A03-8 | Underpaid scenario not tested in CSV output | RESOLVED | `diffCalculatorOutput.test.ts` L91-132 tests underpaid entries extensively (address membership, old/new value matching, arithmetic, positive diffs). The mock-based test in `diffCalculator.test.ts` L420-427 also tests diff CSV format (header-only because identical data). |
| A03-9 | No single-data-row success case test for readCsv | RESOLVED | The lowercase test at L89-95 uses a single data row (`header + '\n0xAaBbCcDdEeFf,1000\n'`). |
| A03-11 | No negative reward test for calculateDiff | STILL OPEN | No test passes negative reward values to `calculateDiff`. The function has no guard against negative rewards, which could produce nonsensical results (e.g., a negative reward would always pass the `diff > 0n` underpaid check incorrectly, and would increase `remainingRewardsDiff` in the coverage loop). |

---

## New Findings

### A03-P2-1 (MEDIUM): CRLF line endings silently corrupt addresses and rewards

`readCsv` splits on `\n` but does not strip `\r`. A CSV file with Windows-style `\r\n` line endings would leave `\r` appended to the reward value (last column), causing `BigInt("\r")` to throw an opaque error, and on any intermediate column the `\r` would silently become part of the value. No test covers this.

**Source:** `diffCalculator.ts` L12, L25
**Impact:** Files from Windows environments or tools that produce CRLF would fail or produce corrupt data.

### A03-P2-2 (MEDIUM): No test for duplicate addresses in calculateDiff inputs

`calculateDiff` uses `findIndex` (L81) which matches only the first occurrence of a duplicate address. If `newRewards` contains duplicate addresses, only the first would be matched and spliced; the second would remain in `remainingUndistributed` and be allocated additional rewards. If `oldRewards` contains duplicates in the first `distributedCount` entries, each occurrence would independently match and splice from `remainingUndistributed`. No test exercises either scenario.

**Source:** `diffCalculator.ts` L77-96
**Impact:** Duplicate addresses could lead to double-counting or missing allocations.

### A03-P2-3 (MEDIUM): No test for negative rewards in calculateDiff

Negative reward values in `newRewards` or `oldRewards` could produce incorrect results:
- A negative `oldRewards[i].reward` at L79 would decrease `totalAlreadyPaid`, inflating `remainingRewards`.
- A negative `newItem.reward` at L84 could create a misleading diff.
- A negative `item.reward` at L110 would always satisfy `diff < 0n` = false (since subtracting a negative increases the value), so negative-reward entries would always be "covered" and actually increase the budget.

No test verifies behavior with negative inputs.

**Source:** `diffCalculator.ts` L79, L84, L110
**Impact:** Negative rewards could inflate the remaining pool or misclassify accounts.

### A03-P2-4 (LOW): No large BigInt value test for readCsv

All `readCsv` tests use small integers (1000, 2000). Production data uses 18-decimal values like `1000000000000000000000000`. While BigInt handles arbitrary precision, a test with realistic magnitudes would guard against any future regressions that introduce numeric conversions.

**Source:** `diffCalculator.ts` L40

### A03-P2-5 (LOW): main() not independently testable

`main()` is not exported and executes unconditionally on module import (L181). It can only be tested via side-effects of importing the module with mocked `fs`. This means:
- Cannot test `main()` with custom inputs without changing the mock between imports.
- Console output is not verified in any test.
- The hardcoded file paths in `main()` (L136-137, L148, L156, L166) are not parameterized.

**Source:** `diffCalculator.ts` L134-181

### A03-P2-6 (LOW): No explicit whitespace-in-address test for readCsv

While L25 calls `.trim()` on split values, no test explicitly verifies that leading/trailing whitespace in addresses is stripped. The implicit coverage through other tests is fragile — a change to the trim logic would not be caught.

**Source:** `diffCalculator.ts` L25, L32

### A03-P2-7 (INFO): Zero-reward entries flow through calculateDiff without special handling

A `newRewards` entry with `reward: 0n` would be "covered" (since `remainingRewardsDiff - 0n >= 0n`), producing a zero-value row in the covered CSV. This is arguably correct but worth noting — zero-reward entries consume a CSV row without distributing anything. The `diffCalculatorOutput.test.ts` guards against this at L66-69 and L149-152 (all rewards positive), but only for the actual output data.

**Source:** `diffCalculator.ts` L108-118

### A03-P2-8 (INFO): main() CSV output test relies on mock returning identical old/new data

The `main()` CSV output test block (L387-441) only exercises the scenario where old and new rewards are identical (no underpaid accounts, no uncovered accounts with the large implicit reward pool). The underpaid CSV output path (L161-168 in source) is tested to produce header-only output, but never tested to produce actual data rows via the mock-based test. The output tests in `diffCalculatorOutput.test.ts` do cover this with real data, partially mitigating this gap.

---

## Summary

| Severity | Count | IDs |
|----------|-------|-----|
| CRITICAL | 0 | — |
| HIGH | 0 | — |
| MEDIUM | 3 | A03-P2-1, A03-P2-2, A03-P2-3 |
| LOW | 3 | A03-P2-4, A03-P2-5, A03-P2-6 |
| INFO | 2 | A03-P2-7, A03-P2-8 |

### Prior Items Resolved: 5 of 10
- RESOLVED: A03-2 (partial), A03-4, A03-5, A03-8, A03-9
- STILL OPEN: A03-1 (now A03-P2-1), A03-3 (now A03-P2-4), A03-6 (now A03-P2-2), A03-7 (now A03-P2-5), A03-11 (now A03-P2-3)
