# Pulse Radar — token launch radar (token-radar-01)

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/cocotvoros/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/cocotvoros/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Entry for the make.fun bounty [Build the best token launch radar](https://make.fun/bounty/token-radar-01).

A working token launch radar for the make.fun bounty `token-radar-01`. It reads the
sealed DefiLlama snapshot, finds every protocol that records no token yet and is not a
wrapped, staked, bridged or versioned product of one that trades, ranks them by implied
launch value, and hands in a static dashboard with a detail view and a farm plan for each.

## The model

Implied value is priced from the market's own record. Earlier versions used per-category
median market-cap-to-TVL ratios; a printed model tournament (leave-one-out over all 128
live-token protocols, plus a seeded 200-split resampling study) showed those medians —
most resting on a handful of protocols — were the model's weak point, so v4's core is:

- A log–log size curve fitted on the 128 live-token protocols, `log(mcap) = a + b·log(TVL)`,
  plus a per-category offset: the category's mean log residual under the curve, shrunk by
  `n / (n + 8)` so thin categories are pulled toward the curve.
- `implied = size curve × category offset × growth × maturity × breadth`
  - growth: the 7-day TVL change, clamped to −40%…+120%, weight 0.35
  - maturity: 0.80 for a new listing, rising to 1.20 after four years tracked with no
    token (unknown listing date: 0.85)
  - breadth: +3% per additional chain, up to five
- Each row's range is the model's own interquartile residual band, and each row carries a
  farm verdict net of gas for a $1,000 / 4-week farmer. Out of sample, the v4 core's
  leave-one-out typical miss is ×3.58 against the old core's ×5.16.

On this snapshot the board holds 198 protocols: all 40 on the house watchlist plus 158
early finds below its $50M floor. Live-token protocols are never ranked; the 24 largest
ride along as the comparables the curve and offsets were fitted on. The dashboard recomputes each
row's implied value in the page from the same factors, so board and code visibly agree.

## Run it

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-snapshot.json>
```

Node 22.18+, standard library only, no network. Writes `board.json`, `data.js`,
`dashboard/`, `screenshots/` and `dossier.json` into the output directory,
deterministically — two runs write the same bytes.

## Layout

- `main.ts` — entrypoint: snapshot in, deliverables out
- `lib/model.ts` — the value model, the genuine-pre-token filter, farm plans, board validation
- `dashboard/` — the static page (board, filters, sorting, detail drawer, live comparables)
- `screenshots/` — the board, a protocol detail, and a filtered view
- `vendor/makefun-board.ts` — the vendored make.fun dossier library, as the kit ships it

An implied value is this board's own claim about what a launch would be worth if the
protocol's record stayed as it is. It is not a prediction that a token will be issued,
and not financial advice. A protocol recording no token on DefiLlama is not proof that
it has none.
