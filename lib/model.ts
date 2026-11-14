// Pulse Radar — the token launch radar's model (token-radar-01).
//
// One sealed snapshot in, one ranked board out. Nothing here names a protocol
// specially: the same functions score every row, and every number on the board
// follows from the snapshot's own figures — TVL, seven-day change, tracked age,
// chain count, and the market's own live-token multiples per category.
//
// Implied value, per protocol:
//   multiple  = median(mcap / TVL) over live-token protocols in its category
//               (global median when its category has no live protocol), with
//               each live ratio capped at 10x first: a ratio above that comes
//               from a protocol whose TVL is a rounding error next to its
//               market cap, and one thin protocol must not price a whole
//               category (the snapshot's own Prediction Market median is 400x
//               from a single such protocol).
//   growth    = 1 + 0.35 * clamp(change_7d, -40, +120) / 100   (no report: 1)
//   maturity  = 0.80 + min(age_days, 1460) / 1460 * 0.40       (no date: 0.85)
//   breadth   = 1 + 0.03 * min(chains - 1, 5)
//   implied   = max(1, round(TVL * multiple * growth * maturity * breadth))
//
// A protocol is a genuine pre-token candidate when DefiLlama records no token
// for it (no market cap, no CoinGecko id, no symbol) and it is not a versioned,
// wrapped, staked or bridged product of a token that already trades. The board
// holds every such protocol, watchlist or not; live-token protocols never rank,
// they ride along as the comparables the multiples came from.

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
  multiple: number;
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

export interface RadarData {
  as_of: string;
  floor_usd: number;
  model: ModelConstants;
  global_multiple: number;
  multiples: Record<string, number>;
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

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
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

function verbFor(category: string | null): string {
  const c = (category ?? '').toLowerCase();
  if (c.includes('lend')) return 'supply assets and borrow against them';
  if (c.includes('dex') || c.includes('swap') || c.includes('exchange')) return 'swap and add liquidity';
  if (c.includes('yield') || c.includes('farm')) return 'deposit into its vaults and harvest yield';
  if (c.includes('deriv') || c.includes('perp')) return 'open a small perpetual or options position';
  if (c.includes('restak') || c.includes('stak')) return 'stake through the protocol';
  if (c.includes('bridge')) return 'bridge assets through it';
  if (c.includes('rwa') || c.includes('real world')) return 'use its tokenised real-world products';
  if (c.includes('launchpad')) return 'join its launches';
  if (c.includes('gaming') || c.includes('game')) return 'play and hold its in-game assets';
  if (c.includes('nft')) return 'mint or trade its NFTs';
  if (c.includes('oracle')) return 'use an app that reads its feeds';
  if (c.includes('privacy')) return 'run a private transaction through it';
  if (c.includes('wallet') || c.includes('account')) return 'open its wallet and use it daily';
  if (c.includes('insur')) return 'buy cover through it';
  if (c.includes('payment')) return 'pay with it';
  return 'use the protocol';
}

/** Five concrete farm steps for one protocol, each 20-600 characters. */
export function farmSteps(p: SnapshotProtocol, watchlist: boolean): string[] {
  const chain = p.chains[0] ?? 'its main chain';
  const chainCount = p.chains.length;
  const verb = verbFor(p.category);
  const tvl = money(p.tvl_usd);
  const watchNote = watchlist
    ? ' It is on the house watchlist, so a snapshot here is the most-watched kind of activity.'
    : '';
  const steps = [
    `Open ${p.name} on ${chain} with a fresh wallet you control, fund it with about $50-$200 of gas and operating funds, and connect only through the protocol's own app. Allow about 15 minutes for setup.${watchNote}`,
    `Start by learning to ${verb} with a small position first — about $25-$100 — so you see the exact fees, slippage and confirmation flow before you scale. Budget roughly $2-$10 in gas per transaction on ${chain}.`,
    `Build a real footprint over the next 2-4 weeks: ${verb} at least once a week, keep the position open rather than in-and-out, and leave a balance working so the activity reads as a genuine user, not a one-off. Total gas over the month is usually $10-$40.`,
    `Use a second feature of ${p.name} — a different pool, vault or market than your first position — and, where the app offers it, complete any on-chain quest, points task or referral step. Most tasks take 10-30 minutes each.`,
    `Keep records: note each deposit, the date and the transaction hash in a sheet, check the position weekly, and plan your exit before any launch — unstake or withdraw in stages over 2-3 days so you are not caught by a rush. A protocol holding ${tvl} of TVL rewards patient users.`,
  ];
  if (chainCount > 1) {
    steps[2] = `Build a real footprint over the next 2-4 weeks across its ${chainCount} chains, starting on ${chain}: ${verb} at least once a week, keep the position open rather than in-and-out, and leave a balance working so the activity reads as a genuine user. Total gas over the month is usually $10-$40.`;
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
  const multiples: Record<string, number> = {};
  for (const [key, values] of [...byCategory.entries()].sort()) {
    multiples[key] = median(values);
  }

  const watchSet = new Set(snapshot.watchlist);
  const candidates = snapshot.protocols.filter(isGenuinePreToken);
  const rows: BoardRow[] = candidates.map((p) => {
    const multiple = p.category !== null && multiples[p.category] !== undefined
      ? multiples[p.category]!
      : globalMultiple;
    const growth = growthFactor(p.change_7d, model);
    const maturity = maturityFactor(p.listed_at, snapshot.as_of, model);
    const breadth = breadthFactor(p.chains.length, model);
    const implied = Math.max(1, Math.round(p.tvl_usd * multiple * growth * maturity * breadth));
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
      multiple,
      growth_factor: growth,
      maturity_factor: maturity,
      breadth_factor: breadth,
      watchlist: watchSet.has(p.slug),
      farm_steps: farmSteps(p, watchSet.has(p.slug)),
    };
  });
  rows.sort((a, b) =>
    b.implied_value_usd - a.implied_value_usd ||
    b.tvl_usd - a.tvl_usd ||
    (a.slug < b.slug ? -1 : 1),
  );
  rows.forEach((row, i) => { row.rank = i + 1; });

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
