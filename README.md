# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/taozi2265/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/taozi2265/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A dashboard that finds the protocols whose token does not exist yet and ranks them by an implied value, with a farm plan and a netted farm verdict for each one. Entry for the make.fun `token-radar-01` bounty (model radar-4).

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-kit>/input/snapshot.json
```

Node 22.18+ (24 works), standard library only, no network. `main.ts` reads the sealed snapshot, writes `board.json`, `data.js`, `dashboard/` and `screenshots/` to the output directory, and writes `dossier.json` with the vendored make.fun library. Open `out/dashboard/index.html` in a browser to see the radar; the three screenshots in `screenshots/` are the board, a protocol detail view and a filtered view.

## The model

Implied value is priced off a curve fitted to the live market in the same sealed snapshot — not a flat multiple, and not a category median:

```
log10 market cap = 3.6466 + 0.4376 x log10 TVL
implied value    = round(10 ^ (3.6466 + 0.4376 x log10 tvl_usd) x 0.5)
```

The curve is a Huber fit (robust to outliers) on the 90 live-token protocols that are not wrapped, staked, bridged or restaked products of a token that already trades. The market caps of those 90 protocols are prices the market has already printed; the curve is the size-to-value relationship they actually show. A protocol with no token is priced by reading its TVL off that curve, then taking a flat 0.5 haircut for the fact that it has not launched.

- **3.6466 + 0.4376 x log10 TVL**: the fitted curve. A flat multiple values a $2.8B protocol the same way it values a $5M one; the curve does not — market cap grows with the 0.44 power of TVL, so the top implied values are far lower than a multiple would give: Sentora Curator at $30.0M, Steakhouse Financial at $30.0M, Gauntlet at $23.5M.
- **0.5**: the pre-token discount — a token that does not exist yet carries launch, vesting and liquidity risk a live token does not. It is a stated haircut, not a fitted number.
- **Nothing else**: the model tests category offsets, a fitted 7-day growth term, fitted listing age and chain breadth, and keeps none of them — see the validation below.

## Validation

The model is tested out of sample on the live-token protocols, and the numbers are on the dashboard:

- **Leave-one-out** (n=90): each live protocol is predicted from a curve fitted without it. Median miss **3.47x**, 43% within 3x, 36% within 2x, rank correlation 0.32.
- **Walk-forward**: the curve is fitted on the 34 live protocols listed before 2024-07-15 and tested on the 34 listed after. Median miss **2.49x**, 56% within 3x.
- **Ablation** (each term added in turn, leave-one-out / walk-forward median miss): one flat multiple 4.76x / 4.37x; + size curve (OLS) 3.62x / 2.14x; + Huber weights 3.47x / 2.49x — the model; + family offsets 3.23x / 2.57x; + fitted 7-day growth 3.24x / 2.76x; + fitted listing age 3.26x / 29.74x; + chain breadth 3.68x / 39.09x.

The curve is the big win over a flat multiple. Family offsets help leave-one-out but not walk-forward, so they are not used. Fitted growth is near zero. Fitted listing age and chain breadth are unstable out of time — their walk-forward misses blow up on the small pre-cutoff fit set — so they are not used either. Every implied value carries a P25–P75 band from 200 refits of the curve, widened by the leave-one-out miss of live tokens near the same size; the dashboard shows the curve, the band and every protocol on a scatter plot.

A curve is a central tendency, not a price: only about 36% of live market caps land within 2x of it, and the band says how uncertain the model knows itself to be.

## Farm verdicts

Every row carries a verdict — **farm**, **thin** or **skip** — netting its implied value against what the farm costs. If a token launches, the model assumes 10% of its implied value goes to airdrops, split equally among 10,000 farmers, because a single farmer usually has no basis for claiming a larger share. The farming cost is gas plus the yield forgone on the locked capital at 5% a year. The verdict is the launch odds that would repay the cost: **farm** if the cost is repaid at 10% launch odds or less, **thin** up to 33%, **skip** beyond that. The board has 5 farm, 53 thin and 139 skip rows — the top rows are mostly skip, because a big TVL thins the slice. Each row also shows its net per hands-on hour at a 25% launch chance, and the detail view shows the full cost breakdown, the slice if it launches, and a pro-rata reality check (what the same capital would earn if the airdrop were split by deposit alone).

## What counts as a launch candidate

A protocol records no token (no market cap, no CoinGecko id, no symbol) **and** is not a wrapped, staked or bridged product of a token that already trades: Bridge, Canonical Bridge, Cross Chain Bridge, Liquid Staking, Liquid Restaking, Restaked BTC and CEX categories are out, as are names carrying a whole word wrapped / staked / staking, names beginning with an exchange's name, and names ending in a version marker. WBTC is Bitcoin on Ethereum, not a token that does not exist yet. The board ranks all 197 candidates the snapshot holds: the 40-protocol watchlist plus 157 more below the floor.

## Layout

- `main.ts` — entrypoint: snapshot in, board + dashboard + dossier out.
- `lib/model.ts` — the model: the fitted curve, implied value, bands, validation, farm plans and verdicts, board.
- `dashboard/` — the page: `index.html`, `app.css`, `app.js` (dark radar theme, sortable and filterable table, detail view, scatter plot of the fit, validation panel with the ablation table).
- `vendor/makefun-board.ts` — make.fun's dossier library, copied from the kit.
- `.makefun/owner.json` — the claim file naming this account's wallet.

---

<sub>Entered on [make.fun](https://make.fun/?ref=ccsgdszy&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
