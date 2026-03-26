# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Cyclo rewards calculator for the Flare Network. Calculates token reward distributions for cysFLR, cyWETH, and cyFXRP holders by scraping on-chain data from a Goldsky subgraph, computing eligible balances across 30 deterministic snapshot blocks, and generating CSV outputs for on-chain distribution.

## Commands

All commands should be run through nix for reproducibility:

```bash
nix develop -c npm i               # Install dependencies
nix develop -c npm run start        # Full pipeline: scrape → process
nix develop -c npm run scrape       # Scrape only (fetches from subgraph into data/*.dat)
nix develop -c npm run test         # Run vitest (runs in watch mode by default)
nix develop -c npm run build        # TypeScript compilation check
```

Without nix (if nix is unavailable):
```bash
npm run test
npm run start
```

Vitest runs in watch mode. For a single run, use `nix develop -c npx vitest run`.

## Architecture

**Pipeline:** `scraper.ts` → `index.ts` (`processor.ts` + `pipeline.ts` + `liquidity.ts`)

- **`src/scraper.ts`** — Fetches transfer and liquidity events from Goldsky GraphQL subgraph up to END_SNAPSHOT block. Writes JSONL to `data/transfers1.dat` through `data/transfersN.dat` (split to avoid GitHub 100MB limit) and `data/liquidity.dat`.
- **`src/index.ts`** — Main pipeline entry point. Loads env config via `parseEnv()`, reads scraped data files, runs the `Processor`, and writes balance/reward CSVs to `output/`.
- **`src/processor.ts`** — Core logic. Replays all transfers to compute per-account balances at each snapshot block. Handles approved source detection (DEX routers in config), Uniswap V2/V3 LP position tracking via factory contracts, penalties/bounties from `data/blocklist.txt`.
- **`src/pipeline.ts`** — Extracted helpers for data parsing and output formatting: `parseJsonl`, `parseBlocklist`, `formatBalancesCsv`, `formatRewardsCsv`, `summarizeTokenBalances`, `aggregateRewardsPerAddress`, `sortAddressesByReward`, `filterZeroRewards`.
- **`src/liquidity.ts`** — Queries Uniswap V3 pool tick data via multicall at specific blocks. Uses 3 attempts with fixed 10-second delay between retries.
- **`src/diffCalculator.ts`** — Standalone script (not part of `npm run start`). Compares new rewards CSV against a previous rewards CSV (e.g., `output/rewards-*-old.csv`) to produce diff CSVs for underpaid, covered, and uncovered accounts. Currently configured for Dec 2025 epoch reconciliation.
- **`src/config.ts`** — Approved DEX routers (`REWARDS_SOURCES`), factory contracts (`FACTORIES`), cyToken definitions (`CYTOKENS`), RPC URL, and `generateSnapshotBlocks()` which uses seedrandom for deterministic block selection.
- **`src/constants.ts`** — Shared constants: `ONE_18` (1e18 BigInt), `REWARD_POOL` (current epoch pool amount), `DEC25_REWARD_POOL` (Dec 2025 historical), CSV column headers, `VALID_ADDRESS_REGEX`, `validateAddress()`, `BOUNTY_PERCENT`, `RETRY_BASE_DELAY_MS`, data file path constants (`DATA_DIR`, `OUTPUT_DIR`, etc.), and transfer file splitting constants.
- **`src/types.ts`** — TypeScript interfaces for transfers, balances, liquidity changes, reports.
- **`scripts/fetch-dec-2025-distributed.sh`** — Decodes on-chain distribution transactions to produce `output/dec-2025-distributed.csv`. Run in CI before the main pipeline.

## Environment Variables

Set in `.env` (and mirrored in `.github/workflows/git-clean.yaml`):

- `SEED` — Seed phrase for deterministic snapshot block generation
- `START_SNAPSHOT` — Starting block number
- `END_SNAPSHOT` — Ending block number
- `RPC_URL` — Flare RPC endpoint

## Key Concepts

- **Eligible balances (2026+)**: Only LP-deposited cy* tokens earn rewards. Users must buy cy* from approved DEX routers/orderbook (`REWARDS_SOURCES` in config) and then LP them into a pool. Simply holding cy* in a wallet does not earn rewards.
- **Snapshots**: 30 blocks are deterministically chosen between START_SNAPSHOT and END_SNAPSHOT using seedrandom. Balances are sampled at each snapshot and averaged for reward calculation.
- **Penalties/Bounties**: Accounts in `data/blocklist.txt` have rewards redistributed. A bounty portion goes to the reporter, remainder goes back to the reward pool.
- **LP positions**: V2 and V3 liquidity positions are tracked. V3 positions query on-chain tick data to determine if they're in range. Only in-range V3 positions count toward rewards at each snapshot.
- **Determinism**: CI (`git-clean.yaml`) runs the full pipeline and asserts no uncommitted changes, ensuring outputs are reproducible.
- **Epoch transitions**: See `readme.md` for the step-by-step process and the full rFLR emissions epochs schedule. The `diffCalculator.ts` script is only needed when a prior epoch had a partial distribution requiring reconciliation (e.g., Dec 2025).

## Data Files

- `data/transfers*.dat`, `data/liquidity.dat` — Cached JSONL from subgraph (large files, committed)
- `data/pools.dat` — Cached JSON array of pool addresses from subgraph
- `data/blocklist.txt` — Penalty/bounty targets
- `output/` — Generated CSVs (balances, rewards, diffs)
- `output/dispersed/` — Previously distributed reward CSVs (historical reference)
