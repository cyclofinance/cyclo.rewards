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

```
nix develop -c npm run start
```