# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/taozi2265/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/taozi2265/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A dashboard that finds the protocols whose token does not exist yet and ranks them by an implied value, with a farm plan and a netted farm verdict for each one. Entry for the make.fun `token-radar-01` bounty (model radar-3).

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-kit>/input/snapshot.json
```

Node 22.18+ (24 works), standard library only, no network. `main.ts` reads the sealed snapshot, writes `board.json`, `data.js`, `dashboard/` and `screenshots/` to the output directory, and writes `dossier.json` with the vendored make.fun library. Open `out/dashboard/index.html` in a browser to see the radar; the three screenshots in `screenshots/` are the board, a protocol detail view and a filtered view.

## The model

Implied value is priced off the live market in the same sealed snapshot, not off a magic constant:

```
implied = round(tvl_usd x 0.246 x 0.5
              x (1 + clamp(change_7d, -60, 120) / 100 x 0.5)
              x (0.6 + 0.4 x min(age_days, 1095) / 1095)
              x (1 + 0.05 x min(chains - 1, 4)))
```

- **0.246**: the market-wide median market-cap-to-TVL ratio of the live-token protocols in the snapshot. Radar-2 priced each category off its own median; radar-3 tested that choice two ways and it lost both — leave-one-out on the 119 live protocols gave the category model a 94.6% median error (19% within 2x of the real market cap) against 89.4% (27%) for one market median, and a walk-forward test fitted before 2024-02-28 and tested after gave 97.4% (16%) against 86.8% (25%). So the model prices off the market median; the per-category medians are shown on the dashboard as a reference table.
- **0.5**: the pre-token discount — a token that does not exist yet carries launch, vesting and liquidity risk a live token does not.
- **growth / maturity / breadth**: seven-day TVL change, time since first listing (unknown age: 365 days), and distribution across chains.

The validation predicts live market caps with the same formula minus the 0.5 discount, which is a stated haircut, not a fitted number. A multiple is a central tendency, not a price: only about a quarter of live market caps land within 2x of the prediction.

## Farm verdicts

Every row carries a verdict — **farm**, **thin** or **skip** — netting its implied value against what the farm costs. A farmer's share is taken as 5% of the implied value paid to 10,000 farmers (both stated assumptions); the farming cost is gas plus the yield forgone on the locked capital at 5% a year. Farm when the share is at least 3x the cost, thin when it covers the cost, skip when it does not. The board has 36 farm, 48 thin and 113 skip rows.

## What counts as a launch candidate

A protocol records no token (no market cap, no CoinGecko id, no symbol) **and** is not a wrapped, staked or bridged product of a token that already trades: Bridge, Canonical Bridge, Cross Chain Bridge, Liquid Staking, Liquid Restaking, Restaked BTC and CEX categories are out, as are names carrying a whole word wrapped / staked / staking, names beginning with an exchange's name, and names ending in a version marker. WBTC is Bitcoin on Ethereum, not a token that does not exist yet. The board ranks all 197 candidates the snapshot holds: the 40-protocol watchlist plus 157 more below the floor.

## Layout

- `main.ts` — entrypoint: snapshot in, board + dashboard + dossier out.
- `lib/model.ts` — the model: calibration, implied value, validation, farm plans and verdicts, board.
- `dashboard/` — the page: `index.html`, `app.css`, `app.js` (dark radar theme, sortable and filterable table, detail view, calibration table).
- `vendor/makefun-board.ts` — make.fun's dossier library, copied from the kit.
- `.makefun/owner.json` — the claim file naming this account's wallet.

---

<sub>Entered on [make.fun](https://make.fun/?ref=ccsgdszy&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
