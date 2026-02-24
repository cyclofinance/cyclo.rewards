# Security Audit Pass 1 -- diffCalculator.ts

**Agent:** A03
**Date:** 2026-02-22
**File:** `/Users/thedavidmeister/Code/cyclo.rewards/src/diffCalculator.ts`
**Lines:** 140

---

## Evidence of Thorough Reading

### Module Purpose
Compares newly calculated rewards against previously distributed (old) rewards for the Dec 2025 rewards case. Identifies accounts that were underpaid, splits remaining undistributed accounts into "covered" (payable from the remaining reward pool) and "uncovered" (insufficient remaining funds), and writes three output CSVs.

### Imports (lines 1-2)
- `readFileSync`, `writeFileSync` from `"fs"` (line 1)
- `REWARD_POOL` from `"./constants"` (line 2)

### Constants Defined
- `DISTRIBUTED_COUNT = 101 as const` (line 4) -- number of accounts from oldRewards that were already distributed to

### Exported Functions
- `readCsv(filePath: string): Array<{address: string; reward: bigint}>` (lines 10-44) -- reads and validates a two-column CSV, returns address/reward pairs

### Internal Functions
- `main()` (lines 46-136) -- top-level script logic; called immediately at line 139

### Inline Types
- `{address: string; reward: bigint}` -- return element of `readCsv` (line 10, 23)
- `{address: string; old: bigint; new: bigint; diff: bigint}` -- elements of `oldAccountsThatReceivedLess` (lines 67-72, implicit)

### Errors Thrown (all in `readCsv`)
- `"CSV file is empty: ${filePath}"` (line 15)
- `"CSV file has no data rows (only header): ${filePath}"` (line 19)
- `"CSV line ${i + 1} has fewer than 2 columns in ${filePath}: ..."` (line 27)
- `"CSV line ${i + 1} has more than 2 columns in ${filePath}: ..."` (line 30)
- `"CSV line ${i + 1} has empty address in ${filePath}: ..."` (line 34)
- `"CSV line ${i + 1} has empty reward in ${filePath}: ..."` (line 38)

---

## Security Findings

### A03-1 -- Greedy Allocation Algorithm Can Produce Arbitrary, Order-Dependent Coverage [MEDIUM]

**Location:** Lines 86-97 (`main`, the covered/uncovered partitioning loop)

**Description:** The algorithm iterates `remainingUndistributed` in the order inherited from `newRewards` (which comes from the CSV file order) and greedily subtracts each account's reward from the remaining pool. If a reward exceeds the remaining budget, it is placed in the "uncovered" list; otherwise it is placed in "covered."

This is a greedy first-fit algorithm whose result depends entirely on input ordering. A different row order in the source CSV could cause a completely different set of accounts to be classified as "covered" vs "uncovered." For a financial distribution system, this is problematic because:

1. An account with a large reward appearing early could exhaust the pool, pushing many small-reward accounts to "uncovered," while reordering would cover all the small accounts.
2. There is no deterministic sort applied before the loop, so the output is non-deterministic relative to input ordering.
3. An adversary who can influence CSV row order (e.g., by controlling the order transfers appear in the subgraph scrape) could influence which accounts get paid.

**Recommendation:** Sort `remainingUndistributed` by a deterministic criterion (e.g., descending reward, or alphabetically by address) before the allocation loop, or document the intended allocation policy explicitly. Consider whether a different allocation strategy (e.g., proportional reduction) would be fairer.

---

### A03-2 -- No Validation That `BigInt(rewardStr)` Receives a Valid Integer String [MEDIUM]

**Location:** Line 40 in `readCsv`

**Description:** The code calls `BigInt(rewardStr)` on user-supplied CSV data. While empty strings are checked on line 37, the code does not validate that `rewardStr` is a valid non-negative integer before calling `BigInt()`. Invalid values will cause `BigInt()` to throw a `SyntaxError` with an unhelpful generic message (e.g., `"Cannot convert xyz to a BigInt"`).

More critically:
- **Negative values** are accepted silently. A row like `0xabc,-1000` would parse to `BigInt(-1000)` without error. Negative rewards would corrupt all downstream arithmetic (totals, diffs, remaining pool calculations).
- **Hex strings** like `0x1234` are accepted by `BigInt()` and could represent a completely different magnitude than intended.
- **Whitespace-only strings** after trim pass the truthy check but would fail in `BigInt()`.

**Recommendation:** Add explicit validation: check that `rewardStr` matches `/^\d+$/` (non-negative decimal integer), or at minimum validate `reward >= 0n` after conversion. Provide a descriptive error message on failure that includes the file path and line number.

---

### A03-3 -- No Address Format Validation [LOW]

**Location:** Lines 32-35, 40 in `readCsv`

**Description:** The only validation on the `address` field is a truthiness check (non-empty after trim). There is no validation that it is a well-formed Ethereum address (e.g., `0x` prefix, 40 hex characters, 42 characters total). Malformed addresses would silently pass through and appear in the output CSVs, potentially causing downstream on-chain distribution transactions to fail or, worse, send funds to unintended addresses.

Given that the `viem` library is already a project dependency and provides address validation utilities, adding a check would be straightforward.

**Recommendation:** Validate that each address matches the pattern `/^0x[0-9a-fA-F]{40}$/` or use `viem`'s `isAddress()` utility. Throw a descriptive error on mismatch.

---

### A03-4 -- Hardcoded File Paths Create Brittle, Non-Reusable Logic [LOW]

**Location:** Lines 48-49, 105-126 in `main`

**Description:** All input and output file paths are hardcoded with specific block-range identifiers (e.g., `rewards-51504517-52994045.csv`). The `DISTRIBUTED_COUNT` constant (101) is also hardcoded. This means:

1. The `main()` function is a one-off script for a single rewards period, not a reusable tool.
2. If any file path is incorrect or missing, the error will be a raw Node.js `ENOENT` error rather than a user-friendly message.
3. Path strings are relative (e.g., `"./output/..."`), making behavior dependent on the working directory at execution time.

While this is more of a robustness concern than a direct security vulnerability, in a financial system, brittle file handling increases the risk of miscalculation from operator error (e.g., running from the wrong directory, using stale files).

**Recommendation:** Accept file paths and the distributed count as parameters or environment variables. Validate file existence before processing. Use absolute paths or `path.resolve()` for reliability.

---

### A03-5 -- `main()` Executes on Import as a Side Effect [LOW]

**Location:** Lines 139

**Description:** The `main()` function is called unconditionally at module scope (line 139). This means importing the module for testing or reuse (e.g., importing `readCsv`) will also execute the entire `main()` function as a side effect, which reads files and writes output. The test file (`diffCalculator.test.ts`) works around this by mocking `fs` functions via `vi.hoisted()`, but this is fragile -- any change to the mock setup could cause unintended file system operations during testing.

**Recommendation:** Guard the `main()` invocation behind a check such as:
```typescript
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
```
Or separate the reusable logic (`readCsv`) into its own module.

---

### A03-6 -- Potential Out-of-Bounds Access on `oldRewards` Array [MEDIUM]

**Location:** Lines 58-60 in `main`

**Description:** The loop iterates from `0` to `DISTRIBUTED_COUNT` (101), accessing `oldRewards[i]` on each iteration. If the `oldRewards` CSV contains fewer than 101 data rows, `oldRewards[i]` will be `undefined`, and accessing `.reward` or `.address` on `undefined` will throw a `TypeError` at runtime.

There is no check that `oldRewards.length >= DISTRIBUTED_COUNT` before entering the loop. While the current CSV data may have sufficient rows, this is an unvalidated assumption about input data in a financial calculation.

**Recommendation:** Add a guard before the loop:
```typescript
if (oldRewards.length < DISTRIBUTED_COUNT) {
  throw new Error(`oldRewards has ${oldRewards.length} rows but expected at least ${DISTRIBUTED_COUNT}`);
}
```

---

### A03-7 -- Arithmetic on `remainingRewards` Can Go Negative Without Detection [MEDIUM]

**Location:** Lines 80, 135

**Description:** On line 80, `remainingRewards = REWARD_POOL - totalAlreadyPaid`. If the old rewards CSV contains inflated values (either from corruption or a different reward pool configuration), `totalAlreadyPaid` could exceed `REWARD_POOL`, making `remainingRewards` negative. The subsequent loop (lines 86-97) would then classify every account as "uncovered" since `remainingRewardsDiff - item.reward` would always be negative.

On line 135, the "EXTRA needed" calculation `totalOldAccountsWhoReceievedLess + totalRemainingUncovered - remainingRewardsDiff` could also yield unexpected results if `remainingRewardsDiff` is negative (it would reduce the "extra needed" figure, masking the true shortfall).

There is no assertion that `remainingRewards >= 0n`, so the script would complete silently with misleading output.

**Recommendation:** Assert `remainingRewards >= 0n` after line 80 and halt with a clear error if the invariant is violated. This protects against corrupted or mismatched input files.

---

### A03-8 -- CSV Injection via Address Field [INFO]

**Location:** Lines 100-126 (CSV output writing)

**Description:** Address values from the input CSVs are written directly into output CSVs without sanitization. If an address field in the input contained characters meaningful to spreadsheet applications (e.g., starting with `=`, `+`, `-`, `@`), the output CSV could trigger formula injection when opened in Excel or Google Sheets.

In practice, Ethereum addresses always start with `0x`, so this is extremely unlikely given that the addresses originate from on-chain data. However, since there is no address format validation (see A03-3), there is no structural guarantee against this.

**Recommendation:** This is addressed implicitly by implementing A03-3 (address format validation). If addresses are validated as proper hex-prefixed Ethereum addresses, CSV injection is not possible.

---

## Summary

| ID | Severity | Title |
|----|----------|-------|
| A03-1 | MEDIUM | Greedy allocation algorithm is order-dependent |
| A03-2 | MEDIUM | No validation that reward string is a valid non-negative integer |
| A03-3 | LOW | No address format validation |
| A03-4 | LOW | Hardcoded file paths create brittle logic |
| A03-5 | LOW | `main()` executes on import as side effect |
| A03-6 | MEDIUM | Potential out-of-bounds access on `oldRewards` array |
| A03-7 | MEDIUM | Arithmetic on `remainingRewards` can go negative without detection |
| A03-8 | INFO | CSV injection via address field (theoretical) |
