# Pass 0: Process Review

## Documents Reviewed
- `CLAUDE.md`
- `.env` / `.env.example`
- `.github/workflows/git-clean.yaml`
- `.github/workflows/test.yaml`
- `package.json`
- `flake.nix`
- `tsconfig.json`

## Findings

### A00-1 [MEDIUM] — `.env` variables don't match CLAUDE.md documentation

**CLAUDE.md** documents three environment variables: `SEED`, `START_SNAPSHOT`, `END_SNAPSHOT`.

**`.env`** contains different variables: `SNAPSHOT_BLOCK_1`, `SNAPSHOT_BLOCK_2`.

**`.env.example`** also uses the old names: `SNAPSHOT_BLOCK_1`, `SNAPSHOT_BLOCK_2`.

The CI workflow (`git-clean.yaml`) uses `SEED`, `START_SNAPSHOT`, `END_SNAPSHOT` — matching CLAUDE.md but not the local `.env` files.

A future session or contributor following `.env.example` would set the wrong variables and get silent failures (undefined env vars defaulting to undefined, potentially breaking snapshot block generation).

### A00-2 [LOW] — `.env.example` is stale and misleading

`.env.example` defines `SNAPSHOT_BLOCK_1` and `SNAPSHOT_BLOCK_2` with empty values. These variable names don't match what the code or CI actually uses (`SEED`, `START_SNAPSHOT`, `END_SNAPSHOT`). The example file actively misleads new contributors.

### A00-3 [LOW] — CLAUDE.md does not mention `RPC_URL` environment variable

CLAUDE.md's Architecture section references `src/config.ts` as containing "RPC URL", but the Environment Variables section only lists `SEED`, `START_SNAPSHOT`, and `END_SNAPSHOT`. If `RPC_URL` is configured via environment variable, it should be documented. If it's hardcoded in config, the architecture description is slightly misleading by calling it out alongside configurable items.

### A00-4 [INFO] — CI workflow `test.yaml` doesn't pass environment variables

`test.yaml` runs `npm run test` without setting `SEED`, `START_SNAPSHOT`, or `END_SNAPSHOT`. If any test depends on these being set (rather than having test-local defaults), it would fail silently or with confusing errors. This may be intentional if tests are self-contained, but it's undocumented.

### A00-5 [INFO] — CI uses `actions/checkout@v2` (outdated)

Both workflows use `actions/checkout@v2`. The current version is v4. While v2 still works, it lacks Node 20 runtime support (GitHub deprecated Node 16 runners). This may cause CI warnings or eventual breakage.

### A00-6 [MEDIUM] — Branch name suggests active work on environment variable fix

The current branch is `2026-01-31-fix-dec-rewards`, suggesting the `.env` / variable mismatch (A00-1) may be a known issue being addressed. However, the branch is clean with no uncommitted changes, so it's unclear if the fix is complete or pending.
