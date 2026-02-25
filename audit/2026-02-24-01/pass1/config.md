# Security Audit -- Pass 1 (Security) -- `src/config.ts`

**Auditor:** A01
**Date:** 2026-02-24
**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/config.ts`
**Lines:** 102

---

## 1. Evidence of Thorough Reading

### Module Overview

`config.ts` is the central configuration module for the Cyclo rewards calculator. It exports hardcoded address lists, token definitions, an RPC URL, and three utility/generation functions. It imports `assert` from Node.js stdlib, `CyToken` and `Epoch` types from `./types`, and `seedrandom` from the `seedrandom` npm package (v^3.0.5).

### Imports (lines 1-3)

| Import | Source | Used? |
|---|---|---|
| `assert` | `assert` (Node stdlib) | Yes (line 77) |
| `CyToken` | `./types` | Yes (line 21, type annotation) |
| `Epoch` | `./types` | **No** -- imported but never referenced |
| `seedrandom` | `seedrandom` | Yes (line 65) |

### Exported Constants

| Name | Type | Lines | Description |
|---|---|---|---|
| `REWARDS_SOURCES` | `string[]` | 5-12 | 6 approved DEX router/orderbook addresses |
| `FACTORIES` | `string[]` | 14-19 | 4 factory contract addresses (V2, V3, V3.1, Blazeswap) |
| `CYTOKENS` | `CyToken[]` | 21-46 | 3 cyToken definitions (cysFLR, cyWETH, cyFXRP) |
| `RPC_URL` | `string` | 48 | Flare Network public RPC endpoint |

### Exported Functions

| Name | Lines | Signature | Description |
|---|---|---|---|
| `isSameAddress` | 50-52 | `(a: string, b: string): boolean` | Case-insensitive address comparison via `toLowerCase()` |
| `generateSnapshotBlocks` | 60-86 | `(seed: string, start: number, end: number): number[]` | Generates 30 deterministic snapshot block numbers using seeded PRNG |
| `scaleTo18` | 93-101 | `(value: bigint, decimals: number): bigint` | Scales a bigint value from arbitrary decimal precision to 18 decimals |

### Types/Errors/Constants Defined Inline

No types, custom errors, or additional constants are defined within this file beyond the exports listed above.

### Address Inventory (REWARDS_SOURCES)

| Index | Address | Comment |
|---|---|---|
| 0 | `0xcee8cd002f151a536394e564b84076c41bbbcd4d` | orderbook |
| 1 | `0x0f3D8a38D4c74afBebc2c42695642f0e3acb15D3` | Sparkdex Universal Router |
| 2 | `0x6352a56caadC4F1E25CD6c75970Fa768A3304e64` | OpenOcean Exchange Proxy |
| 3 | `0xeD85325119cCFc6aCB16FA931bAC6378B76e4615` | OpenOcean Exchange Impl |
| 4 | `0x8c7ba8f245aef3216698087461e05b85483f791f` | OpenOcean Exchange Router |
| 5 | `0x9D70B0b90915Bb8b9bdAC7e6a7e6435bBF1feC4D` | Sparkdex TWAP |

### Address Inventory (FACTORIES)

| Index | Address | Comment |
|---|---|---|
| 0 | `0x16b619B04c961E8f4F06C10B42FDAbb328980A89` | Sparkdex V2 |
| 1 | `0xb3fB4f96175f6f9D716c17744e5A6d4BA9da8176` | Sparkdex V3 |
| 2 | `0x8A2578d23d4C532cC9A98FaD91C0523f5efDE652` | Sparkdex V3.1 |
| 3 | `0x440602f459D7Dd500a74528003e6A20A46d6e2A6` | Blazeswap |

### CYTOKENS Details

| Name | Address | Underlying | Receipt | Decimals |
|---|---|---|---|---|
| cysFLR | `0x19831cfB53A0dbeAD9866C43557C1D48DfF76567` | `0x12e605bc104e93B45e1aD99F9e555f659051c2BB` (sFLR) | `0xd387FC43E19a63036d8FCeD559E81f5dDeF7ef09` | 18 |
| cyWETH | `0xd8BF1d2720E9fFD01a2F9A2eFc3E101a05B852b4` | `0x1502fa4be69d526124d453619276faccab275d3d` (WETH) | `0xBE2615A0fcB54A49A1eB472be30d992599FE0968` | 18 |
| cyFXRP | `0xf23595ede14b54817397b1dab899ba061bdce7b5` | `0xAd552A648C74D49E10027AB8a618A3ad4901c5bE` (fxrp) | `0xc46600cebd84ed2fe60ec525df13e341d24642f2` | 6 |

---

## 2. Security Findings

### A01-1 -- MEDIUM -- No input validation on `generateSnapshotBlocks` parameters

**Location:** `src/config.ts` lines 60-86

**Description:** The `generateSnapshotBlocks` function does not validate its inputs before use. Three categories of invalid input can produce silently incorrect results:

1. **`start > end` (inverted range):** `range = end - start + 1` becomes negative. `Math.floor(rng() * negativeRange) + start` produces block numbers outside the intended range, potentially negative. No error is raised.

2. **`start === end` (zero-width range):** `range = 1`, so all 28 random snapshots collapse to `Math.floor(rng() * 1) + start = start`. Combined with `start` and `end` already being the same value, all 30 snapshots are identical. The `sort` comparator returns 0 for all pairs, so the assertion passes. Downstream, the balance averaging across 30 identical snapshots is mathematically valid but semantically meaningless -- it represents a single point-in-time measurement disguised as a time-weighted average.

3. **Non-integer or `NaN` inputs:** JavaScript `number` permits `NaN`, `Infinity`, and floating-point values. `Math.floor(rng() * NaN)` produces `NaN`, which would propagate into the snapshot array silently. In the actual call site (`index.ts` line 15), `parseInt()` can return `NaN` for non-numeric environment variable values, and this `NaN` would flow directly into this function.

4. **Empty or undefined seed:** `seedrandom(undefined)` falls back to entropy-based seeding, which silently breaks the determinism guarantee. In `index.ts` line 15, `process.env.SEED!` uses a non-null assertion; if `SEED` is unset, `undefined` is passed as the seed.

**Impact:** Incorrect snapshot generation leads to incorrect reward calculations. If block range is inverted or degenerate, rewards could be calculated based on nonsensical snapshots, potentially causing financial loss or unfair distribution. The `SEED` issue breaks reproducibility, which is a core design invariant (CI verifies determinism).

**Recommendation:** Add precondition checks at the top of `generateSnapshotBlocks`:

```typescript
export function generateSnapshotBlocks(
  seed: string,
  start: number,
  end: number,
): number[] {
  assert.ok(typeof seed === 'string' && seed.length > 0, 'seed must be a non-empty string');
  assert.ok(Number.isInteger(start) && start >= 0, `start must be a non-negative integer, got: ${start}`);
  assert.ok(Number.isInteger(end) && end >= 0, `end must be a non-negative integer, got: ${end}`);
  assert.ok(end > start, `end (${end}) must be greater than start (${start})`);
  // ...
}
```

---

### A01-2 -- MEDIUM -- Duplicate snapshot blocks are possible and not deduplicated

**Location:** `src/config.ts` lines 68-74

**Description:** The function generates 28 random blocks and adds `start` and `end` as fixed anchors. If any random block equals `start` or `end` (or if two random blocks happen to equal each other), the resulting array will contain duplicate values. The assertion on line 77-80 only checks that the array length is 30, not that all 30 values are unique.

The existing test on lines 31-33 of `config.test.ts` asserts `blocks[i] > blocks[i - 1]` (strictly greater), which would catch duplicates. However, with a range of 4001 (5000-9000 in the test), the probability of collision is low. With a narrower range, duplicates become more likely.

If duplicates occur:
- The test assertion `blocks[i] > blocks[i - 1]` would fail in tests, but no such check exists in production code.
- In production, duplicate snapshots mean a particular block's balance is sampled more than once in the average, giving it disproportionate weight. For example, if `start` appears 3 times in the 30 snapshots, the balance at the start block receives 3x the weight of other snapshots.

**Impact:** Skewed reward distribution. Accounts whose balances are higher at the duplicated block number would receive disproportionately higher rewards. The severity depends on the block range: with real mainnet ranges of hundreds of thousands of blocks, the collision probability is astronomically low. But the code does not enforce uniqueness.

**Recommendation:** Either deduplicate using a `Set` and re-roll collisions, or explicitly assert uniqueness:

```typescript
const snapshotSet = new Set(snapshots);
assert.ok(snapshotSet.size === 30, `Expected 30 unique snapshots, got ${snapshotSet.size}`);
```

---

### A01-3 -- LOW -- Mixed-case addresses in constants create latent comparison risk

**Location:** `src/config.ts` lines 5-46

**Description:** The addresses in `REWARDS_SOURCES`, `FACTORIES`, and `CYTOKENS` use mixed casing (some are EIP-55 checksummed like `0x0f3D8a38D4c74afBebc2c42695642f0e3acb15D3`, others are lowercase like `0xcee8cd002f151a536394e564b84076c41bbbcd4d`). The current consuming code in `processor.ts` consistently uses `isSameAddress()` or `.toLowerCase()` for comparisons, so this is not currently exploitable.

However, the inconsistency creates a latent risk: if any future code path compares these constants using strict equality (`===`) without case normalization, the comparison will fail for addresses that arrive in a different case (e.g., subgraph data typically returns lowercase addresses).

Additionally, EIP-55 checksummed addresses provide a built-in integrity check (the casing encodes a checksum). The current mix of checksummed and non-checksummed addresses means this integrity property is inconsistently applied. Some addresses cannot be verified against their checksum because they are stored in lowercase.

**Impact:** No current vulnerability, but increases risk of future bugs during maintenance. An address comparison bug could cause transfers from an approved source to be incorrectly rejected (rewards lost) or transfers from an unapproved source to be incorrectly accepted (rewards gaming).

**Recommendation:** Normalize all addresses to a single consistent format. Either:
- Store all addresses in lowercase (simplest, avoids comparison issues)
- Store all addresses in EIP-55 checksummed format and validate checksums at startup

---

### A01-4 -- LOW -- `scaleTo18` does not validate `decimals` parameter

**Location:** `src/config.ts` lines 93-101

**Description:** The `scaleTo18` function accepts any `number` for `decimals` but does not validate that it is a non-negative integer. Potential edge cases:

1. **Negative decimals:** `decimals < 0` falls into the `else` branch (since `decimals < 18`). It computes `"1" + "0".repeat(18 - decimals)` where `18 - decimals` is greater than 18. This produces a very large multiplier but is technically valid JavaScript. However, negative decimals have no real-world meaning for token precision.

2. **Non-integer decimals:** `"0".repeat(1.5)` throws a `RangeError` at runtime. This would crash the process.

3. **Very large decimals:** `decimals = 1000` would compute `"1" + "0".repeat(982)`, creating a string with 983 characters. `BigInt()` on this string is valid but the resulting division could produce unexpected precision loss.

In practice, `decimals` comes from the hardcoded `CYTOKENS` array (values 18 and 6), so these edge cases cannot occur without a code change to the constants. The risk is therefore limited to future maintenance.

**Impact:** Low. Only reachable if `CYTOKENS` is modified to include invalid decimal values, which would be a developer error caught during testing.

**Recommendation:** Add a guard:

```typescript
assert.ok(Number.isInteger(decimals) && decimals >= 0, `decimals must be a non-negative integer, got: ${decimals}`);
```

---

### A01-5 -- LOW -- `isSameAddress` does not validate address format

**Location:** `src/config.ts` lines 50-52

**Description:** `isSameAddress` performs a case-insensitive string comparison via `toLowerCase()` but does not verify that either argument is a valid Ethereum address (40 hex characters prefixed with `0x`). Passing arbitrary strings (empty string, non-hex data, addresses of wrong length) would not raise an error -- the function would simply return `true` or `false` based on raw string comparison.

In the current codebase, callers always pass addresses sourced from on-chain subgraph data or the hardcoded constants in this file, so the practical risk is minimal. The `viem` library is already a dependency (package.json line 18) and provides `isAddress()` and `isAddressEqual()` functions that include format validation.

**Impact:** Minimal in current usage. If future code passes malformed address strings, the function would silently accept them rather than flagging the error.

**Recommendation:** Consider replacing with `viem`'s `isAddressEqual()` for both validation and comparison, or add lightweight validation:

```typescript
export function isSameAddress(a: string, b: string): boolean {
  assert.ok(a.startsWith('0x') && a.length === 42, `Invalid address: ${a}`);
  assert.ok(b.startsWith('0x') && b.length === 42, `Invalid address: ${b}`);
  return a.toLowerCase() === b.toLowerCase();
}
```

---

### A01-6 -- INFO -- Unused `Epoch` type import

**Location:** `src/config.ts` line 2

**Description:** The `Epoch` type is imported from `./types` but is never referenced anywhere in the file. This is likely a remnant from a previous version of the code where snapshot generation was epoch-based rather than block-based. The test file's describe block is also named `'Test generateSnapshotTimestampForEpoch'` (in `config.test.ts` line 4), further suggesting a rename occurred without full cleanup.

**Impact:** No security impact. Dead code that slightly reduces readability and may cause confusion during review.

**Recommendation:** Remove the unused import:

```typescript
import { CyToken } from "./types";
```

---

### A01-7 -- INFO -- Hardcoded RPC URL with no failover or validation

**Location:** `src/config.ts` line 48

**Description:** The RPC URL is hardcoded to `https://flare-api.flare.network/ext/C/rpc`. This is a public endpoint. There is no:
- Failover URL if the primary endpoint is down
- Rate limiting awareness
- Timeout configuration at the config level
- Environment variable override capability

The RPC URL is used by `liquidity.ts` for on-chain multicall queries. If the endpoint is unavailable or rate-limits requests, the pipeline could fail or produce incomplete data.

**Impact:** Availability concern rather than security vulnerability. A denial-of-service on the public RPC would prevent reward calculations from completing. However, the pipeline is run offline/in-CI and results are committed, so transient failures can be retried.

**Recommendation:** Consider allowing the RPC URL to be overridden via environment variable:

```typescript
export const RPC_URL = process.env.RPC_URL || "https://flare-api.flare.network/ext/C/rpc";
```

---

### A01-8 -- INFO -- `Math.floor(rng() * range)` has minor floating-point bias

**Location:** `src/config.ts` line 72

**Description:** The expression `Math.floor(rng() * range) + start` is the standard "multiply-and-floor" approach to generating a random integer in `[start, end]`. This method has a well-known minor bias: because IEEE 754 floating-point cannot uniformly represent all fractions of arbitrary integers, some block numbers in the range have a marginally higher probability of being selected than others.

For the use case of selecting 28 blocks from a range of hundreds of thousands or millions of blocks, this bias is negligible (on the order of 2^-53 per block). It does not meaningfully affect the fairness of snapshot selection.

**Impact:** Negligible. The bias is orders of magnitude smaller than any practical effect on reward distribution.

**Recommendation:** No action needed. This is noted for completeness. If absolute uniformity were required, a rejection-sampling approach could be used, but it is not warranted here.

---

## 3. Summary Table

| Finding ID | Severity | Description |
|---|---|---|
| A01-1 | MEDIUM | No input validation on `generateSnapshotBlocks` parameters (range, seed) |
| A01-2 | MEDIUM | Duplicate snapshot blocks are possible and not deduplicated |
| A01-3 | LOW | Mixed-case addresses in constants create latent comparison risk |
| A01-4 | LOW | `scaleTo18` does not validate `decimals` parameter |
| A01-5 | LOW | `isSameAddress` does not validate address format |
| A01-6 | INFO | Unused `Epoch` type import (dead code) |
| A01-7 | INFO | Hardcoded RPC URL with no failover or env override |
| A01-8 | INFO | `Math.floor(rng() * range)` has minor floating-point bias |

---

## 4. Overall Assessment

**No CRITICAL or HIGH severity issues found.** The file is a compact (102 lines) configuration module with a limited attack surface. The two MEDIUM findings (A01-1, A01-2) are the most actionable: missing precondition validation on `generateSnapshotBlocks` could lead to incorrect snapshot generation if the function is called with invalid parameters. In the current deployment, the parameters originate from environment variables in `index.ts`, where `parseInt()` can silently return `NaN` or `0` for invalid input, and `process.env.SEED!` can pass `undefined` -- both of which would flow into `generateSnapshotBlocks` without any guard.

The address-handling patterns (A01-3, A01-5) are sound in current usage but lack defensive checks that would catch regressions during future maintenance. The `scaleTo18` function (A01-4) is correctly implemented for its current inputs but similarly lacks parameter validation.

The code relies on the correctness of hardcoded addresses (11 addresses across 3 arrays plus 9 addresses in CYTOKENS). These addresses are the security-critical configuration: an incorrect `REWARDS_SOURCES` entry would cause either legitimate rewards to be denied or illegitimate transfers to qualify for rewards. Verification of these addresses against their on-chain contracts is outside the scope of this code audit but is recommended as a separate operational check.
