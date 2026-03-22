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

- **Approved sources**: Transfers are only reward-eligible if they come from approved DEX routers/orderbook (`REWARDS_SOURCES` in config). Direct wallet-to-wallet transfers are not eligible.
- **Snapshots**: 30 blocks are deterministically chosen between START_SNAPSHOT and END_SNAPSHOT using seedrandom. Balances are sampled at each snapshot and averaged for reward calculation.
- **Penalties/Bounties**: Accounts in `data/blocklist.txt` have rewards redistributed. A bounty portion goes to the reporter, remainder goes back to the reward pool.
- **LP positions**: V2 and V3 liquidity positions are tracked. V3 positions query on-chain tick data to determine if they're in range.
- **Determinism**: CI (`git-clean.yaml`) runs the full pipeline and asserts no uncommitted changes, ensuring outputs are reproducible.
- **Epoch transitions**: Each new epoch requires: (1) move prior epoch outputs to `output/dispersed/`, (2) update `.env` and CI workflow `git-clean.yaml` with new `SEED`, `START_SNAPSHOT`, `END_SNAPSHOT`, (3) re-scrape and re-run the pipeline. The `diffCalculator.ts` script is only needed when a prior epoch had a partial distribution requiring reconciliation (e.g., Dec 2025).

## rFLR Emissions Epochs Schedule

All dates are epoch end dates at 12:00 UTC (source: [Flare rFLR guide](https://flare.network/news/a-guide-to-rflr-rewards)):

| # | Epoch End | Seed Pattern |
|---|-----------|-------------|
| 1 | 06 Jul 2024 12:00 | |
| 2 | 05 Aug 2024 12:00 | |
| 3 | 04 Sep 2024 12:00 | |
| 4 | 04 Oct 2024 12:00 | |
| 5 | 03 Nov 2024 12:00 | |
| 6 | 03 Dec 2024 12:00 | |
| 7 | 02 Jan 2025 12:00 | |
| 8 | 01 Feb 2025 12:00 | |
| 9 | 03 Mar 2025 12:00 | |
| 10 | 02 Apr 2025 12:00 | |
| 11 | 02 May 2025 12:00 | |
| 12 | 01 Jun 2025 12:00 | |
| 13 | 01 Jul 2025 12:00 | |
| 14 | 31 Jul 2025 12:00 | |
| 15 | 30 Aug 2025 12:00 | |
| 16 | 29 Sep 2025 12:00 | |
| 17 | 29 Oct 2025 12:00 | |
| 18 | 28 Nov 2025 12:00 | `cyclo-rewards-for-nov-2025` |
| 19 | 28 Dec 2025 12:00 | `cyclo-rewards-for-dec-2025` |
| 20 | 27 Jan 2026 12:00 | `cyclo-rewards-for-jan-2026` |
| 21 | 26 Feb 2026 12:00 | `cyclo-rewards-for-feb-2026` |
| 22 | 28 Mar 2026 12:00 | `cyclo-rewards-for-mar-2026` |
| 23 | 27 Apr 2026 12:00 | `cyclo-rewards-for-apr-2026` |
| 24 | 27 May 2026 12:00 | `cyclo-rewards-for-may-2026` |

## Data Files

- `data/transfers*.dat`, `data/liquidity.dat` — Cached JSONL from subgraph (large files, committed)
- `data/pools.dat` — Cached JSON array of pool addresses from subgraph
- `data/blocklist.txt` — Penalty/bounty targets
- `output/` — Generated CSVs (balances, rewards, diffs)
- `output/dispersed/` — Previously distributed reward CSVs (historical reference)
