// Pulse Radar v2 — the token launch radar's model (token-radar-01).
//
// One sealed snapshot in, one ranked board out. Nothing here names a protocol
// specially: the same functions score every row, and every number on the board
// follows from the snapshot's own figures — TVL, seven-day change, tracked age,
// chain count, and the market's own live-token multiples per category.
//
// Implied value, per protocol:
//   multiple  = shrunk median(mcap / TVL) over live-token protocols in its
//               category: (n * categoryMedian + 3 * globalMedian) / (n + 3),
//               so a category priced by one or two thin protocols is pulled
//               toward the market's global median instead of letting one
//               protocol price a whole category. Each live ratio is capped at
//               10x first, and the global median is used when a category has
//               no live protocol at all.
//   growth    = 1 + 0.35 * clamp(change_7d, -40, +120) / 100   (no report: 1)
//   maturity  = 0.80 + min(age_days, 1460) / 1460 * 0.40       (no date: 0.85)
//   breadth   = 1 + 0.03 * min(chains - 1, 5)
//   implied   = max(1, round(TVL * multiple * growth * maturity * breadth))
//
// Implied range: the same formula with the category's first and third
// quartiles of capped live ratios (shrunk the same way) in place of the
// median, so every row shows a low-high range, not a false point precision.
// Verdict: FARM when even the low end clears the house floor ($50M),
// WATCH when only the point estimate clears it, SKIP otherwise.
//
// Validation is real and out of sample: the 128 live-token protocols are
// split in two by slug order (even = fit, odd = holdout). Category medians
// are fit on the fit half only, then the full formula predicts the holdout
// half's market caps. The dashboard reports the typical miss, the share
// within 2x, and the rank correlation — the model orders launches better
// than it prices them, so read ranks first, values second.
//
// A protocol is a genuine pre-token candidate when DefiLlama records no token
// for it (no market cap, no CoinGecko id, no symbol) and it is not a versioned,
// wrapped, staked or bridged product of a token that already trades. The board
// holds every such protocol, watchlist or not; live-token protocols never rank,
// they ride along as the comparables the multiples came from. The protocols
// the board sets aside, and the ones that already trade, are counted in the
// open so the whole snapshot adds up: ranked + set aside + already trading
// = 758.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** One ranked row of the board. Factors are kept so the page can recompute. */
export interface BoardRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  rank: number;
  implied_value_usd: number;
  implied_low_usd: number;
  implied_high_usd: number;
  verdict: 'FARM' | 'WATCH' | 'SKIP';
  multiple: number;
  multiple_raw: number;
  comparables_n: number;
  growth_factor: number;
  maturity_factor: number;
  breadth_factor: number;
  watchlist: boolean;
  farm_steps: string[];
}

/** A live-token protocol shown as a comparable, never ranked. */
export interface Comparable {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  mcap_usd: number;
  ratio: number;
}

export interface Validation {
  method: string;
  fit_n: number;
  holdout_n: number;
  median_abs_log_error: number;
  typical_miss_factor: number;
  within_2x: number;
  spearman: number;
  recompute_match: string;
}

export interface Universe {
  total: number;
  ranked: number;
  set_aside: number;
  set_aside_reasons: Record<string, number>;
  already_trading: number;
}

export interface RadarData {
  as_of: string;
  floor_usd: number;
  model: ModelConstants;
  global_multiple: number;
  multiples: Record<string, number>;
  validation: Validation;
  universe: Universe;
  rows: BoardRow[];
  comparables: Comparable[];
}

export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_factor: number;
  breadth_step: number;
  breadth_max_extra: number;
  multiple_cap: number;
  shrink_k: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.35,
  growth_floor: -40,
  growth_cap: 120,
  maturity_floor: 0.8,
  maturity_range: 0.4,
  maturity_days: 1460,
  unknown_age_factor: 0.85,
  breadth_step: 0.03,
  breadth_max_extra: 5,
  multiple_cap: 10,
  shrink_k: 3,
};

const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

const EXCHANGE_PREFIXES = [
  'Binance',
  'Coinbase',
  'Bybit',
  'Kraken',
  'Bitget',
  'OKX',
  'Bitfinex',
  'Gemini',
];

const VERSION_SUFFIX = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

function isGenuinePreToken(p: SnapshotProtocol): boolean {
  if (p.mcap_usd !== null || p.gecko_id !== null || p.symbol !== null) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSION_SUFFIX.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  for (const prefix of EXCHANGE_PREFIXES) {
    if (p.name.startsWith(prefix + ' ') || p.name === prefix) return false;
  }
  return true;
}

/** The one reason a null-token protocol is set aside, first match wins. */
function setAsideReason(p: SnapshotProtocol): string | null {
  if (p.mcap_usd !== null || p.gecko_id !== null || p.symbol !== null) return null;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return 'bridged / staked / CEX category';
  if (VERSION_SUFFIX.test(p.name)) return 'versioned name (V2 / 2.0)';
  if (WRAPPED_WORD.test(p.name)) return 'wrapped / staked product name';
  for (const prefix of EXCHANGE_PREFIXES) {
    if (p.name.startsWith(prefix + ' ') || p.name === prefix) return 'exchange-branded name';
  }
  return null;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function quartile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

function ageDays(listedAt: string | null, asOf: string): number | null {
  if (listedAt === null) return null;
  const start = Date.parse(listedAt + 'T00:00:00Z');
  const end = Date.parse(asOf + 'T00:00:00Z');
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return Math.max(0, Math.floor((end - start) / 86_400_000));
}

function growthFactor(change7d: number | null, m: ModelConstants): number {
  if (change7d === null || Number.isNaN(change7d)) return 1;
  const clamped = Math.min(m.growth_cap, Math.max(m.growth_floor, change7d));
  return 1 + m.growth_weight * (clamped / 100);
}

function maturityFactor(listedAt: string | null, asOf: string, m: ModelConstants): number {
  const age = ageDays(listedAt, asOf);
  if (age === null) return m.unknown_age_factor;
  return m.maturity_floor + (Math.min(age, m.maturity_days) / m.maturity_days) * m.maturity_range;
}

function breadthFactor(chainCount: number, m: ModelConstants): number {
  return 1 + m.breadth_step * Math.min(Math.max(chainCount - 1, 0), m.breadth_max_extra);
}

/** Shrink a category statistic toward the global one: thin categories move most. */
function shrink(stat: number, globalStat: number, n: number, k: number): number {
  return (n * stat + k * globalStat) / (n + k);
}

function money(n: number): string {
  if (n >= 1_000_000_000) return '$' + (n / 1_000_000_000).toFixed(2) + 'B';
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return '$' + (n / 1_000).toFixed(0) + 'K';
  return '$' + String(Math.round(n));
}

function pct(change7d: number | null): string {
  if (change7d === null) return 'unreported';
  return (change7d >= 0 ? '+' : '') + change7d.toFixed(1) + '%';
}

/** What farming actually looks like in one category: core action, weekly habit, second feature. */
interface Playbook { core: string; weekly: string; second: string; }

const PLAYBOOKS: Record<string, Playbook> = {
  'Risk Curators': {
    core: 'deposit into a curator vault and pick the risk profile that fits you, starting with a stablecoin vault',
    weekly: 'rebalance between vaults and check the curator\'s allocation reports',
    second: 'try a second curator vault with a different risk profile and compare their yields',
  },
  'Dexs': {
    core: 'swap a small amount and add liquidity to a pool with steady volume, in the pair you understand best',
    weekly: 'collect fees, check your pool\'s share and move liquidity if the range drifts',
    second: 'provide liquidity in a second pool on a different chain and use the limit-order feature if it has one',
  },
  'Onchain Capital Allocator': {
    core: 'allocate into a vault that invests on-chain and read its strategy sheet before you commit',
    weekly: 'review the vault\'s positions and performance report',
    second: 'allocate a smaller amount to a second vault with a different strategy and track both',
  },
  'RWA': {
    core: 'buy a small position in a tokenised treasury or credit product after reading its backing documents',
    weekly: 'check the underlying asset report and any yield distribution',
    second: 'try a second real-world product — a different asset class than your first — and compare lock-ups',
  },
  'Lending': {
    core: 'supply a stablecoin as collateral and borrow a small amount against it to learn the rates',
    weekly: 'top up collateral or repay a little so your health factor stays comfortable',
    second: 'supply a second asset and test a different market, watching borrow rates on both',
  },
  'Yield': {
    core: 'deposit into a yield vault and note the advertised APY, the fees and the lock-up before you confirm',
    weekly: 'harvest or compound rewards and check whether the APY still holds',
    second: 'try a second vault with a different underlying and compare net yield after fees',
  },
  'Derivatives': {
    core: 'open a small perpetual or options position with isolated margin, sized so a bad day costs little',
    weekly: 'review open positions, funding costs and margin, and close anything you no longer understand',
    second: 'try a second market or an options hedge, keeping total exposure small',
  },
  'CDP': {
    core: 'lock collateral and mint a small amount of its stablecoin, keeping the ratio well above liquidation',
    weekly: 'check your collateral ratio and top it up if the market moves against you',
    second: 'mint in a second collateral type and compare stability fees',
  },
  'Yield Aggregator': {
    core: 'deposit into its auto-compounding vault and watch one full compounding cycle first',
    weekly: 'compare the vault\'s net APY against holding the underlying directly',
    second: 'try a second strategy vault and keep a note of which one actually paid more',
  },
  'Basis Trading': {
    core: 'open a small basis position — long spot, short the future — and track the funding rate daily',
    weekly: 'check funding and roll the position before expiry if the basis is still there',
    second: 'try the same trade on a second pair and compare funding costs',
  },
  'Chain': {
    core: 'bridge a small amount over, stake or delegate it, and run a real transaction on the chain',
    weekly: 'use one live app on the chain and check validator or staking rewards',
    second: 'try a second app on the same chain — a DEX or a lending market — and hold a balance there',
  },
  'Staking Pool': {
    core: 'stake a small amount in the pool and confirm the reward rate, unbonding time and fees first',
    weekly: 'check accrued rewards and whether the validator set changed',
    second: 'stake a smaller amount in a second pool and compare net yield and unbonding',
  },
  'Liquidity Manager': {
    core: 'deposit into a managed liquidity position and read how it rebalances your range',
    weekly: 'check your position\'s range, fees earned and impermanent loss',
    second: 'try a second managed pool in a different pair and compare fee income',
  },
  'Leveraged Farming': {
    core: 'open a small leveraged farm position, at most 2x, and set a clear stop level before you start',
    weekly: 'check your leverage ratio and health, and deleverage if the market turns',
    second: 'try a second farm with a different pair at the same small size',
  },
  'Restaking': {
    core: 'restake a small amount through the protocol and read which operators and AVSs you secure',
    weekly: 'review operator performance and any new restaking rewards',
    second: 'restake through a second operator and compare reward rates',
  },
  'Anchor BTC': {
    core: 'mint or hold a small amount of its BTC-backed asset and verify the backing on-chain',
    weekly: 'check the backing ratio and any redemption queue',
    second: 'use the BTC asset as collateral in a second app and watch the borrow rate',
  },
  'Decentralized BTC': {
    core: 'mint a small amount of its decentralised BTC and confirm the mint and redemption path',
    weekly: 'check the peg and the collateral backing it',
    second: 'provide liquidity for the BTC asset in a second pool',
  },
  'CeDeFi': {
    core: 'deposit a small amount into its CeFi-linked yield product and read the custodian and audit notes',
    weekly: 'check yield payouts and any change in the underlying CeFi exposure',
    second: 'try a second CeDeFi product with a different risk profile',
  },
  'Dual-Token Stablecoin': {
    core: 'mint a small amount of the stablecoin against collateral and keep the ratio conservative',
    weekly: 'check the peg of both tokens and your collateral ratio',
    second: 'use the stablecoin in a second pool or lending market',
  },
  'Farm': {
    core: 'deposit into a farm and stake the LP token, noting the reward token and emission schedule',
    weekly: 'harvest rewards and check whether emissions are falling',
    second: 'farm a second pool with a different pair and compare real yield',
  },
  'Prediction Market': {
    core: 'place a small bet on a market you follow closely, with money you can afford to lose',
    weekly: 'review your open positions and settle or hedge as outcomes clarify',
    second: 'trade a second market in a different topic and keep stakes small',
  },
  'Stablecoin Wrapper': {
    core: 'wrap a small amount into its stablecoin wrapper and verify the 1:1 backing',
    weekly: 'check the peg and redemption path still work',
    second: 'use the wrapped stablecoin as collateral in a second market',
  },
  'Uncollateralized Lending': {
    core: 'lend a small amount to a vetted borrower pool after reading the credit assessment',
    weekly: 'check repayments and the pool\'s default history',
    second: 'lend to a second pool with a different borrower profile',
  },
  'Interest Rate Derivatives': {
    core: 'open a small fixed-rate position and compare it with the floating rate you would otherwise pay',
    weekly: 'check the rate curve and unwind if the fixed rate no longer helps',
    second: 'try a second tenor and see how the rate changes with time',
  },
  'Cross Chain Bridge': {
    core: 'bridge a small amount between two chains you use and time the transfer and its fee',
    weekly: 'bridge a small amount the other way and compare fees and speed',
    second: 'try a second route or destination chain the bridge supports',
  },
  'CDP Manager': {
    core: 'open a small managed CDP position and let it automate your collateral ratio',
    weekly: 'check the manager\'s rebalancing and your ratio',
    second: 'compare a self-managed position against the managed one at the same size',
  },
  'OTC Marketplace': {
    core: 'complete one small OTC trade through its escrow, checking the counterparty rating first',
    weekly: 'review open offers and your completed trade history',
    second: 'list a small offer of your own and manage it through settlement',
  },
  'Insurance': {
    core: 'buy a small cover policy for a protocol you use, after reading exactly what it covers',
    weekly: 'check active covers and any claims activity in the pool',
    second: 'cover a second protocol you use and compare premiums',
  },
  'Payments': {
    core: 'pay for something real through it — a bill or a transfer — and confirm it settles',
    weekly: 'use it for one regular payment so the history shows steady use',
    second: 'try a second payment rail or currency it supports',
  },
  'Governance Incentives': {
    core: 'lock a small amount for voting power and vote on one live proposal after reading it',
    weekly: 'vote on new proposals and check your incentive accrual',
    second: 'delegate a small amount to a second delegate and compare their voting record',
  },
  'Crypto Card Issuer': {
    core: 'order the card and make one small real purchase, noting fees and cashback',
    weekly: 'use the card for one everyday purchase and check the statement',
    second: 'try a second card tier or reward option and compare net benefit',
  },
  'Indexes': {
    core: 'buy a small amount of the index and read exactly which assets it holds and their weights',
    weekly: 'check the index rebalance and your share of it',
    second: 'compare a second index with a different weighting and track both',
  },
  'Collateral Markets': {
    core: 'supply collateral in a market you understand and borrow a small amount against it',
    weekly: 'watch your collateral ratio and the market\'s liquidation rules',
    second: 'supply in a second collateral market and compare rates',
  },
};

const GENERIC_PLAYBOOK: Playbook = {
  core: 'use its main feature with a small position first, about $25-$100, and learn the fees before you scale',
  weekly: 'return at least once a week and keep a working balance in the protocol',
  second: 'try a second feature of the protocol — a different pool, vault or market than your first position',
};

/** Five concrete farm steps for one protocol, each 20-600 characters. */
export function farmSteps(p: SnapshotProtocol, watchlist: boolean, impliedLow: number, impliedHigh: number): string[] {
  const chain = p.chains[0] ?? 'its main chain';
  const chainCount = p.chains.length;
  const play = PLAYBOOKS[p.category ?? ''] ?? GENERIC_PLAYBOOK;
  const tvl = money(p.tvl_usd);
  const watchNote = watchlist
    ? ' It is on the house watchlist, so a snapshot here is the most-watched kind of activity.'
    : '';
  const steps = [
    `Open ${p.name} on ${chain} with a fresh wallet you control, fund it with about $50-$200 of gas and operating funds, and connect only through the protocol's own app. Allow about 15 minutes for setup.${watchNote}`,
    `Start by learning to ${play.core}. Budget roughly $2-$10 in gas per transaction on ${chain}.`,
    `Build a real footprint over the next 2-4 weeks: ${play.weekly}, keep the position open rather than in-and-out, and leave a balance working so the activity reads as a genuine user, not a one-off. Total gas over the month is usually $10-$40.`,
    `${play.second.charAt(0).toUpperCase() + play.second.slice(1)}, and, where the app offers it, complete any on-chain quest, points task or referral step. Most tasks take 10-30 minutes each.`,
    `Keep records: note each deposit, the date and the transaction hash in a sheet, check the position weekly, and plan your exit before any launch — unstake or withdraw in stages over 2-3 days so you are not caught by a rush. Implied range ${money(impliedLow)}-${money(impliedHigh)} on ${tvl} of TVL rewards patient users.`,
  ];
  if (chainCount > 1) {
    steps[2] = `Build a real footprint over the next 2-4 weeks across its ${chainCount} chains, starting on ${chain}: ${play.weekly}, keep the position open rather than in-and-out, and leave a balance working so the activity reads as a genuine user. Total gas over the month is usually $10-$40.`;
  }
  return steps;
}

export function parseSnapshot(text: string): Snapshot {
  const raw = JSON.parse(text) as Snapshot;
  if (!Array.isArray(raw.protocols) || !Array.isArray(raw.watchlist)) {
    throw new Error('snapshot: protocols and watchlist must be arrays');
  }
  const protocols = [...raw.protocols].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  return { as_of: raw.as_of, source: raw.source, floor_usd: raw.floor_usd, protocols, watchlist: raw.watchlist };
}

function spearman(xs: number[], ys: number[]): number {
  const ranks = (a: number[]): number[] => {
    const order = a.map((v, i) => [v, i] as const).sort((x, y) => x[0] - y[0]);
    const rk = new Array<number>(a.length);
    order.forEach(([v, i], pos) => { rk[i] = pos + 1; });
    return rk;
  };
  const rx = ranks(xs);
  const ry = ranks(ys);
  const n = xs.length;
  const mx = rx.reduce((a, b) => a + b, 0) / n;
  const my = ry.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    num += (rx[i]! - mx) * (ry[i]! - my);
    dx += (rx[i]! - mx) ** 2;
    dy += (ry[i]! - my) ** 2;
  }
  return dx === 0 || dy === 0 ? 0 : num / Math.sqrt(dx * dy);
}

export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const live = snapshot.protocols.filter(
    (p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0,
  );
  const byCategory = new Map<string, number[]>();
  const allRatios: number[] = [];
  for (const p of live) {
    const ratio = Math.min((p.mcap_usd as number) / p.tvl_usd, model.multiple_cap);
    allRatios.push(ratio);
    const key = p.category ?? '(no category)';
    const list = byCategory.get(key) ?? [];
    list.push(ratio);
    byCategory.set(key, list);
  }
  const globalMultiple = median(allRatios);
  const globalQ1 = quartile(allRatios, 0.25);
  const globalQ3 = quartile(allRatios, 0.75);
  const multiples: Record<string, number> = {};
  for (const [key, values] of [...byCategory.entries()].sort()) {
    multiples[key] = shrink(median(values), globalMultiple, values.length, model.shrink_k);
  }

  // Out-of-sample validation: split the live protocols by slug order.
  const liveSorted = [...live].sort((a, b) => (a.slug < b.slug ? -1 : 1));
  const fitHalf = liveSorted.filter((_, i) => i % 2 === 0);
  const holdHalf = liveSorted.filter((_, i) => i % 2 === 1);
  const fitByCat = new Map<string, number[]>();
  for (const p of fitHalf) {
    const ratio = Math.min((p.mcap_usd as number) / p.tvl_usd, model.multiple_cap);
    const key = p.category ?? '(no category)';
    const list = fitByCat.get(key) ?? [];
    list.push(ratio);
    fitByCat.set(key, list);
  }
  const fitGlobal = median(fitHalf.map((p) => Math.min((p.mcap_usd as number) / p.tvl_usd, model.multiple_cap)));
  const logErrs: number[] = [];
  let within2 = 0;
  const preds: number[] = [];
  const actuals: number[] = [];
  for (const p of holdHalf) {
    const key = p.category ?? '(no category)';
    const arr = fitByCat.get(key);
    const mult = arr !== undefined
      ? shrink(median(arr), fitGlobal, arr.length, model.shrink_k)
      : fitGlobal;
    const f = growthFactor(p.change_7d, model) * maturityFactor(p.listed_at, snapshot.as_of, model) * breadthFactor(p.chains.length, model);
    const pred = Math.max(1, Math.round(p.tvl_usd * mult * f));
    const actual = p.mcap_usd as number;
    preds.push(pred);
    actuals.push(actual);
    logErrs.push(Math.abs(Math.log(pred / actual)));
    if (pred / actual >= 0.5 && pred / actual <= 2) within2++;
  }
  const medianLogErr = median(logErrs);

  // Universe accounting: every protocol in the snapshot is counted once.
  const nullToken = snapshot.protocols.filter(
    (p) => p.mcap_usd === null && p.gecko_id === null && p.symbol === null,
  );
  const setAsideReasons: Record<string, number> = {};
  for (const p of nullToken) {
    const reason = setAsideReason(p);
    if (reason !== null) setAsideReasons[reason] = (setAsideReasons[reason] ?? 0) + 1;
  }
  const universe: Universe = {
    total: snapshot.protocols.length,
    ranked: 0, // filled below
    set_aside: Object.values(setAsideReasons).reduce((a, b) => a + b, 0),
    set_aside_reasons: setAsideReasons,
    already_trading: snapshot.protocols.length - nullToken.length,
  };

  const watchSet = new Set(snapshot.watchlist);
  const candidates = snapshot.protocols.filter(isGenuinePreToken);
  universe.ranked = candidates.length;
  const rows: BoardRow[] = candidates.map((p) => {
    const key = p.category ?? '(no category)';
    const values = byCategory.get(key);
    const rawMultiple = values !== undefined ? median(values) : globalMultiple;
    const multiple = values !== undefined
      ? shrink(rawMultiple, globalMultiple, values.length, model.shrink_k)
      : globalMultiple;
    const q1 = values !== undefined ? shrink(quartile(values, 0.25), globalQ1, values.length, model.shrink_k) : globalQ1;
    const q3 = values !== undefined ? shrink(quartile(values, 0.75), globalQ3, values.length, model.shrink_k) : globalQ3;
    const growth = growthFactor(p.change_7d, model);
    const maturity = maturityFactor(p.listed_at, snapshot.as_of, model);
    const breadth = breadthFactor(p.chains.length, model);
    const implied = Math.max(1, Math.round(p.tvl_usd * multiple * growth * maturity * breadth));
    const low = Math.max(1, Math.round(p.tvl_usd * q1 * growth * maturity * breadth));
    const high = Math.max(1, Math.round(p.tvl_usd * q3 * growth * maturity * breadth));
    const verdict: BoardRow['verdict'] = low >= snapshot.floor_usd
      ? 'FARM'
      : implied >= snapshot.floor_usd ? 'WATCH' : 'SKIP';
    return {
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      listed_at: p.listed_at,
      rank: 0,
      implied_value_usd: implied,
      implied_low_usd: low,
      implied_high_usd: high,
      verdict,
      multiple,
      multiple_raw: rawMultiple,
      comparables_n: values !== undefined ? values.length : 0,
      growth_factor: growth,
      maturity_factor: maturity,
      breadth_factor: breadth,
      watchlist: watchSet.has(p.slug),
      farm_steps: farmSteps(p, watchSet.has(p.slug), low, high),
    };
  });
  rows.sort((a, b) =>
    b.implied_value_usd - a.implied_value_usd ||
    b.tvl_usd - a.tvl_usd ||
    (a.slug < b.slug ? -1 : 1),
  );
  rows.forEach((row, i) => { row.rank = i + 1; });

  // The page recomputes every value from the stored factors; count the matches.
  let matched = 0;
  for (const r of rows) {
    const recomputed = Math.max(1, Math.round(r.tvl_usd * r.multiple * r.growth_factor * r.maturity_factor * r.breadth_factor));
    if (recomputed === r.implied_value_usd) matched++;
  }
  const validation: Validation = {
    method: 'Fit on 64 live-token protocols (even slugs), tested on the other 64 (odd slugs). Full formula: TVL x shrunk category median x growth x maturity x breadth.',
    fit_n: fitHalf.length,
    holdout_n: holdHalf.length,
    median_abs_log_error: medianLogErr,
    typical_miss_factor: Math.exp(medianLogErr),
    within_2x: within2,
    spearman: spearman(preds, actuals),
    recompute_match: `${matched}/${rows.length} ranks and values match`,
  };

  const comparables: Comparable[] = [...live]
    .sort((a, b) => (b.mcap_usd as number) - (a.mcap_usd as number))
    .slice(0, 24)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd as number,
      ratio: (p.mcap_usd as number) / p.tvl_usd,
    }));

  const radar: RadarData = {
    as_of: snapshot.as_of,
    floor_usd: snapshot.floor_usd,
    model,
    global_multiple: globalMultiple,
    multiples,
    validation,
    universe,
    rows,
    comparables,
  };
  return { board: rows, radar };
}

/** The gate's shape, checked before anything is written. Returns a reason or null. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `board has ${board.length} rows, need 100-4000`;
  const ranks = new Set(board.map((r) => r.rank));
  if (ranks.size !== board.length) return 'ranks are not unique';
  for (let i = 0; i < board.length; i++) {
    if (board[i]!.rank !== i + 1) return `rank at position ${i} is ${board[i]!.rank}, want ${i + 1}`;
    if (i > 0 && board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) {
      return `implied value rises at rank ${board[i]!.rank}`;
    }
  }
  const slugs = new Set(board.map((r) => r.slug));
  for (const slug of snapshot.watchlist) {
    if (!slugs.has(slug)) return `watchlist slug ${slug} is missing from the board`;
  }
  for (const row of board) {
    if (row.implied_value_usd < 1 || !Number.isInteger(row.implied_value_usd)) {
      return `row ${row.slug} has a bad implied value`;
    }
    if (row.implied_low_usd < 1 || row.implied_high_usd < row.implied_low_usd) {
      return `row ${row.slug} has a bad implied range`;
    }
    if (row.implied_value_usd < row.implied_low_usd || row.implied_value_usd > row.implied_high_usd) {
      return `row ${row.slug} has a point estimate outside its range`;
    }
    if (row.verdict !== 'FARM' && row.verdict !== 'WATCH' && row.verdict !== 'SKIP') {
      return `row ${row.slug} has a bad verdict`;
    }
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) {
      return `row ${row.slug} has ${row.farm_steps.length} farm steps`;
    }
    for (const step of row.farm_steps) {
      const len = step.trim().length;
      if (len < 20 || len > 600) return `row ${row.slug} has a farm step of ${len} characters`;
    }
  }
  if (board.length > 1 && board.every((r) => r.implied_value_usd === board[0]!.implied_value_usd)) {
    return 'all implied values are equal, not a ranking';
  }
  return null;
}

/** The dashboard's data file, deterministic: same board, same bytes. */
export function dataScript(radar: RadarData): string {
  return 'window.PULSE_RADAR = ' + JSON.stringify(radar) + ';\n';
}

export { money, pct };
