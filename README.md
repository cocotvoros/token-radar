# Pulse Radar — token launch radar (token-radar-01)

A working token launch radar for the make.fun bounty `token-radar-01`. It reads the
sealed DefiLlama snapshot, finds every protocol that records no token yet and is not a
wrapped, staked, bridged or versioned product of one that trades, ranks them by implied
launch value, and hands in a static dashboard with a detail view and a farm plan for each.

## The model

Implied value is priced from the market's own record, not a flat multiple:

- For each category, take the median market-cap-to-TVL ratio of the protocols in that
  category whose token already trades (global median as fallback). Each live ratio is
  capped at 10× first, so one thin-TVL protocol cannot price a whole category.
- `implied = TVL × category multiple × growth × maturity × breadth`
  - growth: the 7-day TVL change, clamped to −40%…+120%, weight 0.35
  - maturity: 0.80 for a new listing, rising to 1.20 after four years tracked with no
    token (unknown listing date: 0.85)
  - breadth: +3% per additional chain, up to five

On this snapshot the board holds 198 protocols: all 40 on the house watchlist plus 158
early finds below its $50M floor. Live-token protocols are never ranked; the 24 largest
ride along as the comparables the multiples came from. The dashboard recomputes each
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
