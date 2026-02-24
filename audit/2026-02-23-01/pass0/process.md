# Pass 0: Process Review — 2026-02-23-01

## Documents Reviewed
- `CLAUDE.md`
- `.env`
- `.env.example`
- `.github/workflows/git-clean.yaml`

## Findings

### A00-1 — MEDIUM — `.env` variables don't match CLAUDE.md documentation

CLAUDE.md documents `SEED`, `START_SNAPSHOT`, `END_SNAPSHOT` as `.env` variables. Actual `.env` contains `SNAPSHOT_BLOCK_1`, `SNAPSHOT_BLOCK_2`, `RPC_URL` — none of the documented names. The CI workflow uses the documented names. A future session following CLAUDE.md would set the wrong variables.

### A00-2 — LOW — `.env.example` is stale

`.env.example` contains `SNAPSHOT_BLOCK_1` and `SNAPSHOT_BLOCK_2` which are not the env vars used by any source file (`SEED`, `START_SNAPSHOT`, `END_SNAPSHOT` in `index.ts`; `RPC_URL` in `config.ts` and `scripts/`). The example file is misleading.

### A00-3 — LOW — CLAUDE.md does not mention `RPC_URL`

`RPC_URL` is used by `config.ts` (hardcoded there currently) and by `scripts/fetch-dec-2025-distributed.sh` (from env). CLAUDE.md's Environment Variables section doesn't list it.

### A00-4 — MEDIUM — CLAUDE.md describes diffCalculator inaccurately

CLAUDE.md says diffCalculator "Compares new rewards against previously distributed amounts in `output/dispersed/`". In reality, `diffCalculator.ts` compares against `output/rewards-*-old.csv` (hardcoded paths), not `output/dispersed/`. The `output/dispersed/` directory contains historical CSVs from previous months but is not read by any code.

### A00-5 — LOW — CLAUDE.md says "cysFLR and cyWETH" but code now supports cyFXRP

PR #27 adds cyFXRP as a third token. The project overview in CLAUDE.md only mentions two tokens. While this is on a different branch, the description should be kept current.

### A00-6 — LOW — No mention of `scripts/` directory or `fetch-dec-2025-distributed.sh`

The new script for fetching on-chain distribution data is not documented in CLAUDE.md's Commands or Architecture sections.

### A00-7 — LOW — CI workflow uses `npm run start` which includes diffCalculator

The `start` script runs `scrape && tsx src/index.ts && tsx src/diffCalculator.ts`. The diffCalculator has hardcoded paths to December-specific files. If these files don't exist (e.g., on a future month's branch), `npm run start` will fail in CI. The CI pipeline couples a one-off reconciliation script to the standard build verification.
