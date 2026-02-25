# Pass 0: Process Review — 2026-02-24-01

## Documents Reviewed
- `CLAUDE.md`
- `.env`
- `.env.example`
- `package.json`
- `.github/workflows/git-clean.yaml`
- `.github/workflows/test.yaml`
- `scripts/fetch-dec-2025-distributed.sh`

## Evidence of Thorough Reading

### CLAUDE.md
- Sections: Project Overview, Commands, Architecture, Environment Variables, Key Concepts, Data Files
- References 5 main source files, 3 env vars, pipeline description

### .env
- 4 variables: SEED, START_SNAPSHOT, END_SNAPSHOT, RPC_URL

### .env.example
- 2 variables: SNAPSHOT_BLOCK_1, SNAPSHOT_BLOCK_2

### package.json
- Scripts: start, scrape, build, test
- 5 dependencies, 5 devDependencies

### git-clean.yaml
- Steps: checkout, nix install, npm i, fetch-dec-2025-distributed.sh, npm run start (with SEED/START_SNAPSHOT/END_SNAPSHOT env), git add, git diff --exit-code
- CI env vars: SEED="cyclo-rewards-for-jan-2026", START_SNAPSHOT=52974045, END_SNAPSHOT=54474045

### test.yaml
- Steps: checkout, nix install, npm i, npm run test

### scripts/fetch-dec-2025-distributed.sh
- Decodes two hardcoded on-chain transactions to produce output/dec-2025-distributed.csv

## Findings

### A00-1 — MEDIUM — `.env` variables don't match CLAUDE.md documentation
CLAUDE.md lists 3 env vars: `SEED`, `START_SNAPSHOT`, `END_SNAPSHOT`. The actual `.env` also contains `RPC_URL`. CLAUDE.md does not mention `RPC_URL` as an environment variable despite the code using it in `config.ts` (line 48) as a hardcoded fallback.

### A00-2 — MEDIUM — `.env.example` is completely stale
`.env.example` defines `SNAPSHOT_BLOCK_1` and `SNAPSHOT_BLOCK_2` which do not correspond to any variables used in the codebase. The actual env vars are `SEED`, `START_SNAPSHOT`, `END_SNAPSHOT`, and `RPC_URL`. This will mislead anyone setting up the project.

### A00-3 — MEDIUM — CI env vars diverge from `.env` without explanation
`.env` has `SEED="cyclo-rewards-for-dec-2025"` with START_SNAPSHOT=51504517, END_SNAPSHOT=52994045. CI (`git-clean.yaml`) uses `SEED="cyclo-rewards-for-jan-2026"` with START_SNAPSHOT=52974045, END_SNAPSHOT=54474045. CLAUDE.md says `.env` is "mirrored" in the CI workflow, but the values are entirely different. This suggests the `.env` is stale or the CI is running a different epoch.

### A00-4 — MEDIUM — CLAUDE.md architecture description is inaccurate
- CLAUDE.md says scraper writes to `data/transfers.dat` (singular), but scraper.ts actually writes to `data/transfers1.dat` through `data/transfersN.dat` (split files to avoid GitHub 100MB limit). Similarly, `index.ts` reads from `data/transfers1.dat` through `data/transfers10.dat`.
- CLAUDE.md says diffCalculator "compares new rewards against previously distributed amounts in `output/dispersed/`" but the actual code compares against `output/rewards-51504517-52994045-old.csv`, with no reference to `output/dispersed/` directory.

### A00-5 — LOW — CLAUDE.md says "cysFLR and cyWETH" but code supports cyFXRP
`config.ts` CYTOKENS array includes cyFXRP (added with decimals: 6), but CLAUDE.md Project Overview only mentions "cysFLR and cyWETH holders."

### A00-6 — LOW — No mention of `scripts/` directory
CLAUDE.md does not document the `scripts/` directory or `fetch-dec-2025-distributed.sh`, which is used in CI to fetch on-chain distribution data. A future session would not know about this tooling.

### A00-7 — LOW — CI workflow references epoch-specific script and file paths
`git-clean.yaml` runs `scripts/fetch-dec-2025-distributed.sh` which is specific to the Dec 2025 epoch. When the epoch changes, the CI workflow, the script, and the diffCalculator main() all need manual updates to new file paths and block ranges. This fragility is not documented.

### A00-8 — LOW — CLAUDE.md `npm run start` description incomplete
CLAUDE.md says `npm run start` is "Full pipeline: scrape -> process -> diff" but `package.json` shows `start` only runs `npm run scrape && tsx src/index.ts`. The diff calculation (`diffCalculator.ts`) is a separate manual step not included in `npm run start`.

### A00-9 — LOW — CLAUDE.md Data Files section lists `data/pools.dat` under scraper description but not under Data Files
The Architecture section mentions pools data is written by the scraper, and the Data Files section does list `data/pools.dat`, but the description says "Cached JSONL from subgraph" — `pools.dat` is actually JSON (an array), not JSONL.
