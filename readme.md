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
git add .
git commit -am'move dispersed csvs'
```

## 3. Pick new block numbers

Please don't overcomplicate this, just pick two blocks anywhere in the previous
month. You can roll a dice a few times if you need to.

E.g. Pick a day 0-30 in the month:

```
echo "$(($RANDOM % 30))"
```

Put them both in `.env` and in `.github/workflows/git-clean.yaml` as `SNAPSHOT_BLOCK_1`
and `SNAPSHOT_BLOCK_2`.

E.g. `.env`

```
SNAPSHOT_BLOCK_1=41280134
SNAPSHOT_BLOCK_2=41280134
```

`git-clean.yaml`

```
      - run: nix develop -c npm run start
        env:
          SNAPSHOT_BLOCK_1: 41280134
          SNAPSHOT_BLOCK_2: 41900134
```

## 4. Run the script local

The script will fetch all transfers and build csvs of the balances and rewards.

```
nix develop -c npm run start
```

You should see updates to `data/transfers.dat` and a new `output/balances-X-Y.csv`
and `output/rewards-X-Y.csv` where `X` and `Y` match the block numbers in the
environment.

## 5. Commit and setup a PR

Just commit all the changes from setting up the environment and running the script.

Create a PR on the repo, and check that the `git-clean` workflow passes on CI.

Then let thedavidmeister know in TG so that he can eyeball the result and
announce to the community.