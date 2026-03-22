# Pass 0: Process Review — 2026-03-22-01

## A00-1 | MEDIUM | CLAUDE.md constants.ts description is stale

**File:** CLAUDE.md line 38

CLAUDE.md says:
> `src/constants.ts` — `ONE` (1e18 as BigInt) and `REWARD_POOL` (1M tokens as BigInt).

Actual state:
- `ONE` was renamed to `ONE_18` in the prior audit
- `REWARD_POOL` is 500K tokens (Jan 2026 epoch), not 1M
- File now contains ~20 exports: CSV headers, `VALID_ADDRESS_REGEX`, `validateAddress`, `BOUNTY_PERCENT`, `RETRY_BASE_DELAY_MS`, file path constants, `TRANSFER_CHUNK_SIZE`, `TRANSFER_FILE_COUNT`, `DEC25_REWARD_POOL`

A future session relying on CLAUDE.md would use stale names and wrong amounts.

## A00-2 | MEDIUM | CLAUDE.md Architecture section omits `src/pipeline.ts` and `src/index.ts`

**File:** CLAUDE.md lines 29–39

`src/pipeline.ts` contains core helpers extracted during the prior audit: `parseJsonl`, `parseBlocklist`, `formatBalancesCsv`, `formatRewardsCsv`, `summarizeTokenBalances`, `aggregateRewardsPerAddress`, `sortAddressesByReward`, `filterZeroRewards`. It is imported by `index.ts` and is a significant module.

`src/index.ts` is the main entry point (`package.json` "main" field, `npm run start` target). It orchestrates the entire processor pipeline — loading data, running the Processor, and writing output CSVs. It is not mentioned in Architecture at all.

## A00-3 | MEDIUM | CLAUDE.md pipeline description is inaccurate

**File:** CLAUDE.md line 31

CLAUDE.md says:
> **Pipeline:** `scraper.ts` → `processor.ts` + `liquidity.ts` → `diffCalculator.ts`

Actual `npm run start` pipeline:
`scraper.ts` → `index.ts` → `processor.ts` + `pipeline.ts` + `liquidity.ts`

`diffCalculator.ts` is NOT part of `npm run start`. It is a standalone script for Dec 2025 epoch reconciliation. Including it in the pipeline arrow implies it runs as part of the standard flow.

Additionally, CLAUDE.md says `processor.ts` "Outputs `balances-*.csv` and `rewards-*.csv`" — but `processor.ts` computes balances/rewards in memory. The actual CSV writing is done by `index.ts` using formatters from `pipeline.ts`.
