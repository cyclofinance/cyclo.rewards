# Process

## 1. Start a new branch

The CSV will be public in Github for about a week to allow the community to
review and correct any bugs or submit/contest bounties.

This means all the changes will need to be committed and visible in a clearly
labelled PR.

```
git checkout -b `date -Idate`-<month>
```

Where `<month>` is the current month

E.g.

```
git checkout -b `date -Idate`-may
```

## 2. Move old outputs

Any csvs in `output` that already exist are from previous distributions and so
need to be moved into `output/dispersed`.

```
mv output/**.csv output/dispersed
mv output/**.txt output/dispersed
git add .
git commit -am'move dispersed csvs'
```

## 3. Pick a seed phrase and block range

Pick the seed phrase and block range for the current epoch. The seed follows the
pattern `cyclo-rewards-for-{month}-{year}`. Block range should cover the epoch
period from the schedule below. Set these in `.env` and `.github/workflows/git-clean.yaml`.

E.g. `.env`

```
SEED="this-is-my-seed"
START_SNAPSHOT=41280134
END_SNAPSHOT=41290134
```

`git-clean.yaml`

```
      - run: nix develop -c npm run start
        env:
          SEED: "this-is-my-seed"
          START_SNAPSHOT: 41280134
          END_SNAPSHOT: 41290134
```

## 4. Run the script local

The script will fetch all transfers and build csvs of the balances and rewards.

```
nix develop -c npm run start
```

You should see updates to `data/transfers*.dat` and a new `output/balances-X-Y.csv`
and `output/rewards-X-Y.csv` where `X` and `Y` match the block numbers in the
environment.

## 5. Commit and setup a PR

Just commit all the changes from setting up the environment and running the script.

Create a PR on the repo, and check that the `git-clean` workflow passes on CI.

Then let thedavidmeister know in TG so that he can eyeball the result and
announce to the community.

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