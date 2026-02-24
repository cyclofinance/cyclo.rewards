# Audit A02 -- Pass 2 (Test Coverage) -- `src/constants.ts`

## Source File Summary

**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/constants.ts` (11 lines)

### Evidence of Thorough Reading -- All Constants Defined

| Line | Constant | Value |
|------|----------|-------|
| 1 | `ONE` | `BigInt(10 ** 18)` -- i.e. `1000000000000000000n` |
| 2 | `REWARD_POOL` | `BigInt(1000000000000000000000000)` -- i.e. 1M tokens in wei (1e24) |
| 6 | `REWARDS_CSV_COLUMN_HEADER_ADDRESS` | `"recipient address"` |
| 7 | `REWARDS_CSV_COLUMN_HEADER_REWARD` | `"amount wei"` |
| 8 | `DIFF_CSV_COLUMN_HEADER_OLD` | `"old"` |
| 9 | `DIFF_CSV_COLUMN_HEADER_NEW` | `"new"` |
| 10 | `DIFF_CSV_COLUMN_HEADER_DIFF` | `"diff"` |

### Existing Test Coverage

- **No dedicated `constants.test.ts` file exists.** There is no test file that directly imports all constants and validates them.
- `REWARD_POOL` is imported and used in `diffCalculatorOutput.test.ts` (line 4) for assertions about output totals.
- `REWARDS_CSV_COLUMN_HEADER_ADDRESS`, `REWARDS_CSV_COLUMN_HEADER_REWARD`, `DIFF_CSV_COLUMN_HEADER_OLD`, `DIFF_CSV_COLUMN_HEADER_NEW`, `DIFF_CSV_COLUMN_HEADER_DIFF` are imported and used in `diffCalculator.test.ts` (line 24) for constructing expected CSV headers.
- `ONE` is **not imported from `constants.ts` in any test file**. The processor test (`processor.test.ts`, line 22) defines its own local `const ONE = "1000000000000000000"` as a string, which is **not** derived from the shared constant.

---

## Findings

### A02-1 -- LOW -- `ONE` constant has no direct test coverage

The constant `ONE = BigInt(10 ** 18)` on line 1 is not directly tested anywhere. While the value `10 ** 18` is a well-known quantity (1e18), the expression `BigInt(10 ** 18)` relies on JavaScript first evaluating `10 ** 18` as a `Number` and then converting to `BigInt`. The value `10 ** 18` is `1000000000000000000` which is within `Number.MAX_SAFE_INTEGER` (approx 9e15) -- actually, `1e18` exceeds `Number.MAX_SAFE_INTEGER` (which is `2^53 - 1 = 9007199254740991`, approximately `9.0e15`). This means `10 ** 18` as a JavaScript `Number` is `1000000000000000000` but is beyond the safe integer range and could theoretically lose precision depending on the exact floating-point representation. In practice `10 ** 18` does evaluate to exactly `1000000000000000000` because it is a power of 10 that happens to be exactly representable as a double, but this is a subtle correctness concern that should be verified by a test.

A test should assert that `ONE === 1000000000000000000n` (using a BigInt literal) to guard against any future refactoring that might alter the expression or introduce precision issues.

### A02-2 -- LOW -- `REWARD_POOL` constant has no direct unit test for its value

`REWARD_POOL = BigInt(1000000000000000000000000)` on line 2 is used in `diffCalculatorOutput.test.ts` but only as an input to inequality assertions (e.g., `total <= REWARD_POOL`). No test verifies that `REWARD_POOL` itself equals the expected value of `1000000000000000000000000n` (1 million tokens at 18 decimals = 1e24). If this literal were accidentally changed (e.g., a missing or extra zero), the inequality-based tests would still pass as long as the pool were "big enough." A direct assertion such as `expect(REWARD_POOL).toBe(1_000_000_000_000_000_000_000_000n)` would catch such regressions.

Additionally, there is a similar concern to `ONE`: the expression `BigInt(1000000000000000000000000)` first evaluates `1000000000000000000000000` as a JavaScript `Number`. The value `1e24` exceeds `Number.MAX_SAFE_INTEGER`. However, `BigInt(1000000000000000000000000)` receives `1e24` which as a float is exactly `999999999999999983222784`. This means **`REWARD_POOL` is not actually `1e24`** -- it evaluates to `999999999999999983222784n` due to floating-point precision loss before BigInt conversion. A test asserting the exact value would surface whether this is intentional or a bug. The safer expression would be `BigInt("1000000000000000000000000")` or `1000000000000000000000000n` using a BigInt literal.

### A02-3 -- INFO -- `processor.test.ts` redefines `ONE` locally instead of importing from `constants.ts`

In `processor.test.ts` (line 22), `ONE` is redefined as a local string constant `"1000000000000000000"` rather than importing from `constants.ts`. This creates a maintenance risk: if the canonical `ONE` value in `constants.ts` were ever changed, the processor tests would silently continue using the old hardcoded value. This is rated INFO because it does not represent a missing test, but it is a coupling/drift risk between the test and the source of truth.

### A02-4 -- LOW -- CSV column header constants are used but not directly asserted for correctness

The five CSV header constants (`REWARDS_CSV_COLUMN_HEADER_ADDRESS`, `REWARDS_CSV_COLUMN_HEADER_REWARD`, `DIFF_CSV_COLUMN_HEADER_OLD`, `DIFF_CSV_COLUMN_HEADER_NEW`, `DIFF_CSV_COLUMN_HEADER_DIFF`) are imported in `diffCalculator.test.ts` and used to build expected header strings, but no test asserts that each constant equals its expected string value. The constants serve as a contract with the external [rnat-distribution-tool](https://github.com/flare-foundation/rnat-distribution-tool/blob/main/README.md#add-csv-file-with-rewards-data) which expects specific column names. If a header string were accidentally changed, the existing tests would not catch it because they construct expected values from the same constants. A snapshot or literal assertion (e.g., `expect(REWARDS_CSV_COLUMN_HEADER_ADDRESS).toBe("recipient address")`) would guard against accidental changes breaking the external integration contract.

### A02-5 -- MEDIUM -- `REWARD_POOL` likely has an incorrect value due to floating-point precision loss in BigInt conversion

As detailed in A02-2, the expression `BigInt(1000000000000000000000000)` on line 2 does **not** produce `1e24` as a BigInt. JavaScript evaluates the numeric literal `1000000000000000000000000` as a `Number` first (yielding `9.999999999999999e+23` in IEEE 754), then converts to BigInt. The actual value is `999999999999999983222784n`, which is `16777216` less than the intended `1000000000000000000000000n`. This means the reward pool is approximately 0.0000000000000017% smaller than 1M tokens. If the intent is exactly 1M tokens (1e24 wei), the correct expression is `1000000000000000000000000n` (BigInt literal) or `BigInt("1000000000000000000000000")` (string conversion). A test asserting `REWARD_POOL === 1000000000000000000000000n` would immediately reveal this discrepancy.

Note: The same concern applies to `ONE = BigInt(10 ** 18)`. However, `10 ** 18 = 1e18` happens to be exactly representable as an IEEE 754 double (since it equals `2^18 * 5^18` and `5^18 = 3814697265625` which is under `2^53`), so `ONE` is correct. `10 ** 24` is NOT exactly representable.
