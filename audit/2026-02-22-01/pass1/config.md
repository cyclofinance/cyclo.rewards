# Security Audit Pass 1 - config.ts

**Auditor:** A01
**Date:** 2026-02-22
**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/config.ts`
**Lines:** 77

---

## Evidence of Thorough Reading

### Module
`src/config.ts` -- Configuration module exporting approved contract addresses, token definitions, RPC URL, and utility functions for the rewards calculator.

### Imports (Lines 1-3)
- `assert` from `"assert"` (line 1)
- `{ CyToken, Epoch }` from `"./types"` (line 2) -- note: `Epoch` is imported but never used in this file
- `seedrandom` from `"seedrandom"` (line 3) -- version 3.0.5

### Constants Defined
| Name | Line | Type | Description |
|------|------|------|-------------|
| `REWARDS_SOURCES` | 5-12 | `string[]` (inferred) | Array of 6 approved DEX router/orderbook addresses |
| `FACTORIES` | 14-19 | `string[]` (inferred) | Array of 4 factory contract addresses (Sparkdex V2, V3, V3.1, Blazeswap) |
| `CYTOKENS` | 21-36 | `CyToken[]` | Array of 2 token definitions (cysFLR, cyWETH), each with name, address, underlyingAddress, underlyingSymbol, receiptAddress |
| `RPC_URL` | 38 | `string` | Hardcoded Flare Network RPC endpoint: `https://flare-api.flare.network/ext/C/rpc` |

### Functions Defined
| Name | Line | Signature | Description |
|------|------|-----------|-------------|
| `isSameAddress` | 40-42 | `(a: string, b: string): boolean` | Case-insensitive address comparison via `.toLowerCase()` |
| `generateSnapshotBlocks` | 50-76 | `(seed: string, start: number, end: number): number[]` | Generates 30 deterministic snapshot block numbers using seedrandom PRNG |

### Types/Errors
- No custom types or errors defined in this file (types are imported from `./types.ts`)

---

## Security Findings

### A01-1: No Input Validation on `generateSnapshotBlocks` Parameters

**Severity:** MEDIUM

**Location:** Lines 50-76

**Description:** The `generateSnapshotBlocks` function does not validate its `start` and `end` parameters. Specifically:

1. **No check that `start < end`:** If `start > end`, then `range = end - start + 1` produces a negative number. `Math.floor(rng() * negativeRange) + start` would generate blocks *below* the start value, which are outside the intended epoch. If `start === end`, `range = 1` and all 30 snapshots would be the same block (minus possible floating-point edge cases).

2. **No check that `start` and `end` are positive integers:** The parameters are typed as `number`, which allows negative numbers, fractional values, `NaN`, `Infinity`, etc. Block numbers should always be positive integers.

3. **No check for `NaN` or non-finite values:** If environment variables are missing or malformed, `parseInt` in `index.ts` (line 10-11) will produce `NaN` (for non-numeric strings) or `0` (for the fallback default). `NaN` propagation through arithmetic would silently corrupt all generated snapshot blocks.

**Caller context:** In `src/index.ts` line 10-11, `parseInt(process.env.START_SNAPSHOT || "0")` defaults to `0` if unset, and `process.env.SEED!` uses a non-null assertion that will pass `undefined` at runtime if SEED is unset. `seedrandom(undefined)` falls back to `Math.random()` entropy, making snapshot selection non-deterministic -- breaking the core invariant of the system.

**Recommendation:** Add validation at the top of `generateSnapshotBlocks`:
```typescript
assert.ok(Number.isFinite(start) && Number.isInteger(start) && start > 0, "start must be a positive integer");
assert.ok(Number.isFinite(end) && Number.isInteger(end) && end > 0, "end must be a positive integer");
assert.ok(start < end, "start must be less than end");
assert.ok(seed && typeof seed === "string" && seed.length > 0, "seed must be a non-empty string");
```

---

### A01-2: Possible Duplicate Snapshot Blocks (No Uniqueness Guarantee)

**Severity:** LOW

**Location:** Lines 58-64

**Description:** The function generates 28 random blocks and adds `start` and `end` as fixed boundary blocks. There is no deduplication. If a randomly generated block happens to equal `start`, `end`, or another generated block, the resulting 30-element array will contain duplicate block numbers.

The test at line 32-33 in `config.test.ts` asserts `blocks[i] > blocks[i-1]` (strictly greater), which would fail if duplicates occurred. However, with a typical range of thousands of blocks, the probability of collision is low enough that this test passes for the specific test seed. With a very small range (e.g., `end - start < 30`), duplicates become likely or guaranteed.

**Impact:** Duplicate snapshots mean that a particular block's balances are sampled multiple times and given extra weight in the average. This could subtly skew reward distributions, though in practice the large block range makes this unlikely.

**Recommendation:** Either enforce uniqueness (e.g., using a `Set` and regenerating on collision) or document that the range must be significantly larger than 30.

---

### A01-3: Mixed-Case Address Constants

**Severity:** LOW

**Location:** Lines 5-36

**Description:** The addresses in `REWARDS_SOURCES`, `FACTORIES`, and `CYTOKENS` use mixed casing (EIP-55 checksummed format). In the consuming code (`processor.ts` lines 71, 93-94, 130, 416), comparisons are done through `isSameAddress()` which lowercases both sides, or via explicit `.toLowerCase()` calls. This is correct and safe.

However, the mixed casing approach creates a latent risk: if any future consumer compares these constants using strict equality (`===`) without calling `isSameAddress()` or `.toLowerCase()`, the comparison will fail for addresses that arrive in lowercase (e.g., from subgraph data, which typically returns lowercase addresses).

**Recommendation:** Consider normalizing all address constants to lowercase at declaration time, or add a comment warning that all comparisons must use `isSameAddress()`.

---

### A01-4: Unused Import (`Epoch`)

**Severity:** INFO

**Location:** Line 2

**Description:** The `Epoch` type is imported from `./types` but never used anywhere in `config.ts`. This is a dead import -- no security impact but indicates possible code drift.

**Recommendation:** Remove the unused import.

---

### A01-5: Hardcoded Public RPC URL

**Severity:** INFO

**Location:** Line 38

**Description:** `RPC_URL` is hardcoded to `https://flare-api.flare.network/ext/C/rpc`. This is a public RPC endpoint, so there is no secret exposure. However:

1. If the RPC endpoint is ever rate-limited, compromised, or returns malicious data, there is no easy override mechanism without code changes.
2. There is no authentication or API key, which is expected for a public endpoint but means the application has no protection against RPC endpoint manipulation at the DNS/network level beyond TLS.

**Recommendation:** Consider allowing RPC_URL to be overridden via environment variable (e.g., `process.env.RPC_URL || "https://flare-api.flare.network/ext/C/rpc"`) for operational flexibility.

---

### A01-6: `seedrandom` Is Not Cryptographically Secure

**Severity:** INFO

**Location:** Line 55

**Description:** `seedrandom` (v3.0.5) is a deterministic PRNG, not a CSPRNG. This is by design -- the project needs determinism (same seed produces same snapshots) for reproducibility and CI validation. However, if the `SEED` environment variable is predictable or leaked, an adversary could pre-compute which blocks will be sampled and potentially manipulate their balances to appear higher at those specific blocks.

**Impact assessment:** The SEED is stored as an environment variable and in CI secrets. The threat model assumes the seed is kept confidential until after the epoch completes. If the seed is disclosed before the epoch's END_SNAPSHOT block is reached, an attacker with sufficient capital could concentrate their holdings at known snapshot blocks.

**Recommendation:** This is an inherent property of the system design, not a bug. Ensure the SEED value is treated as confidential during the active epoch. Consider documenting this threat in project documentation.

---

## Summary

| ID | Severity | Title |
|----|----------|-------|
| A01-1 | MEDIUM | No input validation on `generateSnapshotBlocks` parameters |
| A01-2 | LOW | Possible duplicate snapshot blocks (no uniqueness guarantee) |
| A01-3 | LOW | Mixed-case address constants |
| A01-4 | INFO | Unused import (`Epoch`) |
| A01-5 | INFO | Hardcoded public RPC URL |
| A01-6 | INFO | `seedrandom` is not cryptographically secure (by design) |

No CRITICAL or HIGH severity findings were identified in this file.
