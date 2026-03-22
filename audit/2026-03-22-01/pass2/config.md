# Pass 2: Test Coverage — `src/config.ts`

**Auditor:** A01
**Date:** 2026-03-22

## Evidence of Reading

### Source: `src/config.ts` (139 lines)

| Item | Line(s) | Type |
|---|---|---|
| `REWARDS_SOURCES` | 7–14 | `const string[]` — 6 approved DEX router/orderbook addresses |
| `FACTORIES` | 17–22 | `const string[]` — 4 factory contract addresses |
| `CYTOKENS` | 25–50 | `const CyToken[]` — 3 token definitions (cysFLR, cyWETH, cyFXRP) |
| `assert(process.env.RPC_URL, ...)` | 52 | Module-level assertion |
| `RPC_URL` | 54 | `const string` export |
| `isSameAddress(a, b)` | 62–66 | Function: case-insensitive address comparison with validation |
| `generateSnapshotBlocks(seed, start, end)` | 75–105 | Function: deterministic 30-block snapshot generation |
|   — empty seed assertion | 80 | Error path |
|   — range < 30 assertion | 84 | Error path |
|   — start/end seeded into Set | 86 | Key invariant: start and end always included |
|   — length === 30 assertion | 96–99 | Post-condition check |
|   — ascending sort | 102 | Output ordering |
| `scaleTo18(value, decimals)` | 113–124 | Function: scale bigint to 18 decimal places |
|   — invalid decimals check | 114–116 | Error path: non-integer, negative, NaN |
|   — decimals === 18 fast path | 117–118 | Branch |
|   — decimals > 18 (divide) | 119–120 | Branch |
|   — decimals < 18 (multiply) | 121–123 | Branch |
| `parseEnv()` | 126–138 | Function: parse SEED, START_SNAPSHOT, END_SNAPSHOT from env |
|   — missing SEED assertion | 127 | Error path |
|   — missing START_SNAPSHOT assertion | 128 | Error path |
|   — missing END_SNAPSHOT assertion | 129 | Error path |
|   — NaN START_SNAPSHOT assertion | 134 | Error path |
|   — NaN END_SNAPSHOT assertion | 135 | Error path |

### Tests: `src/config.test.ts` (291 lines)

| Describe Block | Line(s) | Covers |
|---|---|---|
| `Test generateSnapshotTimestampForEpoch` | 5–71 | `generateSnapshotBlocks` — 8 tests |
| `RPC_URL` | 73–89 | Module-level RPC_URL assertion — 2 tests |
| `parseEnv` | 91–142 | `parseEnv()` — 6 tests |
| `isSameAddress` | 144–167 | `isSameAddress()` — 5 tests |
| `Test math functions` | 169–223 | `scaleTo18()` — 8 tests |
| `REWARDS_SOURCES` | 225–236 | Constant validation — 2 tests |
| `FACTORIES` | 238–249 | Constant validation — 2 tests |
| `CYTOKENS` | 251–281 | Constant validation — 4 tests |
| `REWARDS_SOURCES and FACTORIES` | 283–290 | Cross-set no-overlap — 1 test |

## Findings

### PASS2-1 [LOW] — `generateSnapshotBlocks`: start and end inclusion not tested

`generateSnapshotBlocks` explicitly seeds the Set with `start` and `end` on line 86. This is a key invariant — if someone refactors to remove that seeding, the boundary blocks could be missed. No test asserts that the returned array contains both `start` and `end`.

**Fix:** `.fixes/A01-PASS2-1.md`

---

### PASS2-2 [LOW] — `generateSnapshotBlocks`: no test for `start > end`

When `start > end`, `range` is negative. The assertion on line 84 catches this (`range >= 30` fails), but the resulting error message is misleading: "Snapshot range must be at least 30, got -N". There is no test confirming the function rejects inverted ranges.

**Fix:** `.fixes/A01-PASS2-2.md`

---

### PASS2-3 [LOW] — `parseEnv`: no test for partial-numeric strings

`parseInt("123abc")` returns `123`, which passes the `isNaN` check on lines 134–135. This means `START_SNAPSHOT=123abc` silently parses to `123`. Whether this is desired behavior or a bug is debatable, but there is no test documenting the expectation.

**Fix:** `.fixes/A01-PASS2-3.md`

---

### PASS2-4 [INFO] — No cross-set validation between CYTOKENS and REWARDS_SOURCES/FACTORIES

There is a test ensuring REWARDS_SOURCES and FACTORIES don't overlap (line 283–290), but no test ensuring CYTOKENS addresses (address, underlyingAddress, receiptAddress) don't overlap with REWARDS_SOURCES or FACTORIES. A cyToken address appearing in the router set could cause incorrect reward eligibility logic.

**Fix:** `.fixes/A01-PASS2-4.md`
