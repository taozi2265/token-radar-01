// Token Radar, model radar-4: one sealed snapshot in, one ranked board out.
//
// The board ranks every protocol that could still launch a token, by an implied
// value priced off a curve the snapshot itself fitted — and, new in radar-4,
// the price is a fitted curve, not a flat multiple.
//
// What counts as a launch candidate. A protocol is a candidate when the snapshot
// records no token for it (no market cap, no CoinGecko id, no symbol) AND it is
// not a wrapped, staked or bridged product of something that already trades.
// That second half is the watchlist's own rule, applied here to every row: the
// categories Bridge, Canonical Bridge, Cross Chain Bridge, Liquid Staking,
// Liquid Restaking, Restaked BTC and CEX are out; a name carrying a whole word
// wrapped, staked or staking is out; a name beginning with an exchange's name is
// out; a name ending in a version marker (V2, v2, 2.0 and the like) is out.
// WBTC is Bitcoin on Ethereum and Binance staked ETH is ETH in a staking
// product: neither is a token that does not exist yet, however large its TVL.
//
// How implied value is priced: a fitted size curve. Radar-3 priced every
// protocol off one market-wide median multiple (0.246x). Radar-4 tested that
// choice against a curve fitted to the snapshot's live tokens, and the curve
// wins out of sample: leave-one-out on the 90 live protocols the curve is
// fitted on puts the flat multiple at a 4.76x median miss (36% within 3x of
// the real market cap) against 3.47x (43%) for the fitted curve, and the
// walk-forward test, fitted on protocols listed before 2024-07-15 and tested
// on those listed after, gives 4.37x (35%) against 2.49x (56%). The curve is
// a Huber fit (robust to the fat-tailed residuals) of log10(market cap) on
// log10(TVL), fitted on the live protocols that are not themselves wrappers:
// the wrapper categories (Bridge, Liquid Staking and the rest) are set aside
// from the fit because their market cap is mechanically near their TVL, so
// they would bend the curve toward 1.0. Then:
//
//   implied = round(10 ^ (a + b x log10(tvl_usd)) x 0.5)
//
//   a, b       the fitted curve: log10(mcap) = a + b x log10(TVL), fitted on
//              the snapshot's live tokens (Huber, 90 protocols)
//   0.5        the pre-token discount: a token that does not exist yet carries
//              launch, vesting and liquidity risk a live token does not
//
// The terms the leaders use were tested, one at a time, and dropped when they
// did not help out of sample: family (category) offsets help leave-one-out
// (3.23x) but not walk-forward (2.57x against 2.49x for the curve alone), a
// fitted 7-day growth term is near zero and helps neither test, and fitted
// listing-age and chain-breadth terms are unstable out of time (walk-forward
// misses of 28x and 39x on the small pre-cutoff fit set), so the model keeps
// the curve alone. The ablation table on the dashboard shows every variant's
// numbers, so the choice is measured, not asserted.
//
// The band: each row's implied value carries a P25-P75 band from 200 bootstrap
// refits of the curve (a seeded generator, so the board is deterministic),
// widened by the out-of-sample miss — the 25th and 75th percentiles of the
// live tokens' actual-to-predicted ratios from leave-one-out. The band is
// wide because the model is rough: the typical live market cap lands about
// 3.5x from the curve. A multiple is a central tendency, not a price.
//
// Farm verdicts, netted with launch odds. A farm plan costs gas plus the
// yield forgone on the capital it locks (5% a year, stated). If the protocol
// launches, the airdrop is taken as 10% of the implied value (stated),
// split equally among 10,000 farmers (stated) — the slice if launch. The
// break-even odds are the launch probability at which the farm repays its
// cost: cost / slice. Farm when those odds are 10% or better, thin when they
// are 33% or better, skip when even a certain launch would not pay. The net
// per hands-on hour is the expected slice at a stated 25% launch chance,
// minus the cost, over the plan's hands-on hours. The verdict and its
// one-line reason travel on every row, so the board says which rows are worth
// the work, not just which are biggest.
//
// No protocol name is ever special-cased: the same function scores every row,
// and the dashboard recomputes each row from the same figures so the page and
// board.json agree.

/** One protocol record: exactly the ten fields the sealed input carries. */
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

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  /** The pre-token discount: a stated haircut, not a fitted number. */
  pre_token_discount: number;
  /** The airdrop, if the protocol launches, as a share of the implied value. */
  airdrop_pct: number;
  /** Farmers splitting that airdrop, equally. */
  farmers: number;
  /** Break-even odds at or below this mean "farm". */
  farm_odds: number;
  /** Break-even odds at or below this mean "thin". */
  thin_odds: number;
  /** The launch chance the net-per-hour is planned at. */
  launch_p: number;
  /** Forgone yearly yield on the capital a farm locks. */
  opportunity_apr: number;
  /** Huber's tuning constant for the robust fit. */
  huber_k: number;
  /** Huber reweighting passes. */
  huber_iters: number;
  /** Bootstrap refits behind each row's band. */
  refits: number;
  /** The seed of the bootstrap generator: the board is deterministic. */
  band_seed: number;
  /** Family offsets are shrunk by this pseudo-count. */
  shrink_pseudo: number;
}

export const MODEL: ModelConstants = {
  pre_token_discount: 0.5,
  airdrop_pct: 0.1,
  farmers: 10000,
  farm_odds: 0.1,
  thin_odds: 0.33,
  launch_p: 0.25,
  opportunity_apr: 0.05,
  huber_k: 1.345,
  huber_iters: 30,
  refits: 200,
  band_seed: 20261114,
  shrink_pseudo: 4,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-4';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** Grid points of the scatter plot's fitted curve and band. */
export const BAND_GRID_POINTS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** A farm verdict: whether the row is worth farming, net of its cost. */
export type Verdict = 'farm' | 'thin' | 'skip';

/** What one farm position costs: gas plus the yield forgone on locked capital. */
export interface FarmCost {
  capital_usd: number;
  hold_days: number;
  gas_usd: number;
  opportunity_usd: number;
  total_usd: number;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
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
  token_status: 'pre-token';
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  band_p25_usd: number;
  band_p75_usd: number;
  model: {
    curve_value_usd: number;
    log_tvl: number;
    fitted_log_mcap: number;
    adjust_usd: number;
  };
  verdict: Verdict;
  verdict_reason: string;
  farm_cost_usd: number;
  farmer_share_usd: number;
  value_per_cost: number;
  breakeven_odds: number;
  net_per_hour_usd: number;
  farm_steps: string[];
}

/** The dashboard's compact view of one row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  band_p25_usd: number;
  band_p75_usd: number;
  curve_value_usd: number;
  log_tvl: number;
  fitted_log_mcap: number;
  adjust_usd: number;
  verdict: Verdict;
  verdict_reason: string;
  farm_cost_usd: number;
  farmer_share_usd: number;
  value_per_cost: number;
  breakeven_odds: number;
  net_per_hour_usd: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  /** Whether the curve was fitted on this protocol. */
  in_fit: boolean;
}

/** The fitted size curve, as the dashboard states and recomputes it. */
export interface CurveData {
  intercept: number;
  slope: number;
  fit_n: number;
  fit_note: string;
  /** The band's grid: the curve and its P25-P75 band at log-spaced TVLs. */
  band_grid: { tvl_usd: number; curve_usd: number; lo_usd: number; hi_usd: number }[];
}

/** One row of the ablation table: one model variant, tested both ways. */
export interface AblationRow {
  variant: string;
  loo_miss: number;
  within_3x_pct: number;
  within_2x_pct: number;
  rho: number;
  wf_miss: number;
  wf_within_3x_pct: number;
  /** Whether the entry's model is this variant. */
  used: boolean;
}

/** One validation test's numbers: how the model did on live market caps. */
export interface ValidationStats {
  n: number;
  median_miss: number;
  median_ape_pct: number;
  within_3x: number;
  within_3x_pct: number;
  within_2x: number;
  within_2x_pct: number;
  median_ratio: number;
  rho: number;
}

/** The model's validation, computed from the sealed snapshot alone. */
export interface Validation {
  /** Leave-one-out on the live protocols the curve is fitted on. */
  loo: ValidationStats;
  /** Walk-forward: fitted on protocols listed before the cutoff, tested after. */
  walk_forward: ValidationStats & { cutoff: string; fit_n: number; test_n: number };
  /** Every model variant, each term added in turn, tested both ways. */
  ablation: AblationRow[];
  /** The variant the entry's model is. */
  final_variant: string;
  /** The out-of-sample miss the bands are widened by (actual/predicted). */
  loo_ratio_p25: number;
  loo_ratio_p75: number;
}

/** Everything the dashboard needs: the board, the live set, the curve, the model. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
  scatter_live: LiveRow[];
  live_pool_size: number;
  curve: CurveData;
  validation: Validation;
}

/** Why a snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a non-empty array of numbers (the two middle values averaged for an even count). */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length / 2;
  if (sorted.length % 2 === 1) return sorted[Math.floor(mid)]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** The q-th quantile (nearest rank) of a non-empty array of numbers. */
function quantile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const at = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))));
  return sorted[at]!;
}

/** A dollar figure as a short string: $1,605, $19, $1.96. */
export function fmtMoney(n: number): string {
  if (n >= 1000) return `$${Math.round(n).toLocaleString('en-US')}`;
  if (n >= 10) return `$${Math.round(n)}`;
  return `$${n.toFixed(2)}`;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A seeded generator (mulberry32): the bootstrap refits are deterministic. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Solve A x = b by Gaussian elimination with partial pivoting. The matrix is
 * small (the design matrix has at most six columns). A pivot too small to
 * trust is pinned, so a degenerate fit returns a wild coefficient instead of
 * NaN — the walk-forward test then shows it for what it is.
 */
function solveLinear(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r]![c]!) > Math.abs(m[piv]![c]!)) piv = r;
    const tmp = m[c]!;
    m[c] = m[piv]!;
    m[piv] = tmp;
    let pv = m[c]![c]!;
    if (Math.abs(pv) < 1e-12) {
      pv = pv < 0 ? -1e-12 : 1e-12;
      m[c]![c] = pv;
    }
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = m[r]![c]! / pv;
      for (let k = c; k <= n; k++) m[r]![k] = m[r]![k]! - f * m[c]![k]!;
    }
  }
  return m.map((row, i) => row[n]! / row[i]!);
}

/** Ordinary least squares on a design matrix: (X'X)^-1 X'y. */
function ols(design: number[][], y: number[], weights?: number[]): number[] {
  const k = design[0]!.length;
  const a: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const b: number[] = new Array<number>(k).fill(0);
  for (let r = 0; r < design.length; r++) {
    const w = weights === undefined ? 1 : weights[r]!;
    const row = design[r]!;
    for (let i = 0; i < k; i++) {
      b[i] = b[i]! + w * row[i]! * y[r]!;
      for (let j = 0; j < k; j++) a[i]![j] = a[i]![j]! + w * row[i]! * row[j]!;
    }
  }
  return solveLinear(a, b);
}

/** Categories whose product is another token's wrapper, stake or bridge, not a launch of its own. */
const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Cross Chain Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** A whole word wrapped, staked or staking anywhere in a name. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** A name beginning with an exchange's name. */
const EXCHANGE_START = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/** The live-token protocols the model is judged on: a market cap, a TVL, not an exchange. */
export function livePool(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter(
    (p) =>
      !(p.mcap_usd === null && p.gecko_id === null && p.symbol === null) &&
      p.mcap_usd !== null &&
      p.mcap_usd > 0 &&
      p.tvl_usd > 0 &&
      p.category !== 'CEX',
  );
}

/**
 * The protocols the curve is fitted on: the live pool without the wrapper
 * categories. A liquid-staking or bridge token's market cap is mechanically
 * near its TVL, so fitting on it would bend the curve toward 1.0 and hide
 * how the market actually prices a protocol's TVL.
 */
export function fitPool(snapshot: Snapshot): SnapshotProtocol[] {
  return livePool(snapshot).filter((p) => !EXCLUDED_CATEGORIES.has(p.category ?? ''));
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is a launch candidate: pre-token and not a wrapped, staked or bridged product. */
export function isLaunchCandidate(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (EXCLUDED_CATEGORIES.has(p.category ?? '')) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_START.test(p.name)) return false;
  if (VERSIONED.test(p.name)) return false;
  return true;
}

/** The features one protocol carries, in the order the variants add them. */
export interface FeatureSpec {
  growth: boolean;
  age: boolean;
  breadth: boolean;
}

/** One protocol's feature row: the intercept, log10(TVL), then the terms in turn. */
function features(p: SnapshotProtocol, asOf: string, spec: FeatureSpec): number[] {
  const row = [1, Math.log10(Math.max(1, p.tvl_usd))];
  if (spec.growth) {
    row.push(Math.min(120, Math.max(-60, finite(p.change_7d, 0))) / 100);
  }
  if (spec.age) {
    const age = ageDays(asOf, p.listed_at) ?? 365;
    row.push(Math.exp(-age / 240));
  }
  if (spec.breadth) {
    row.push(Math.min(Math.max(p.chains.length - 1, 0), 4));
  }
  return row;
}

/** A fitted variant: its coefficients, its family offsets, and how it was fitted. */
export interface FittedVariant {
  id: string;
  coef: number[] | null;
  median: number | null;
  offsets: Map<string, number>;
  spec: FeatureSpec;
}

/**
 * Huber's robust fit: ordinary least squares, then reweighted least squares
 * with Huber weights from the residuals' own scale, so one wild market cap
 * cannot drag the curve. The weights come from the median absolute deviation,
 * so the fit is the data's, not a guess.
 */
function huberFit(design: number[][], y: number[], model: ModelConstants): number[] {
  let coef = ols(design, y);
  for (let pass = 0; pass < model.huber_iters; pass++) {
    const residuals = design.map((row, i) => y[i]! - row.reduce((s, v, j) => s + v * coef[j]!, 0));
    const med = median(residuals);
    const mad = median(residuals.map((r) => Math.abs(r - med))) || 1e-9;
    const s = 1.4826 * mad;
    const weights = residuals.map((r) => (Math.abs(r) <= model.huber_k * s ? 1 : (model.huber_k * s) / Math.abs(r)));
    coef = ols(design, y, weights);
  }
  return coef;
}

/** A category's offset: its median residual, shrunk toward zero by a pseudo-count. */
function familyOffsets(
  pool: SnapshotProtocol[],
  asOf: string,
  spec: FeatureSpec,
  coef: number[],
  model: ModelConstants,
): Map<string, number> {
  const grouped = new Map<string, number[]>();
  for (const p of pool) {
    const pred = features(p, asOf, spec).reduce((s, v, j) => s + v * coef[j]!, 0);
    const list = grouped.get(p.category ?? 'Other') ?? [];
    list.push(Math.log10(p.mcap_usd!) - pred);
    grouped.set(p.category ?? 'Other', list);
  }
  const offsets = new Map<string, number>();
  for (const [category, list] of grouped) {
    offsets.set(category, (list.length * median(list)) / (list.length + model.shrink_pseudo));
  }
  return offsets;
}

/**
 * Fit one ablation variant on a pool. The variants add one term at a time, so
 * each row of the ablation table is the model with one more term than the row
 * above it: a flat multiple, the size curve, Huber weights, family offsets,
 * fitted 7-day growth, fitted listing age, chain breadth.
 */
export function fitVariant(
  id: string,
  pool: SnapshotProtocol[],
  asOf: string,
  model: ModelConstants = MODEL,
): FittedVariant {
  if (id === 'flat') {
    return {
      id,
      coef: null,
      median: median(pool.map((p) => p.mcap_usd! / p.tvl_usd)),
      offsets: new Map(),
      spec: { growth: false, age: false, breadth: false },
    };
  }
  const spec: FeatureSpec =
    id === 'curve'
      ? { growth: false, age: false, breadth: false }
      : id === 'huber'
        ? { growth: false, age: false, breadth: false }
        : id === 'family'
          ? { growth: false, age: false, breadth: false }
          : id === 'growth'
            ? { growth: true, age: false, breadth: false }
            : id === 'age'
              ? { growth: true, age: true, breadth: false }
              : { growth: true, age: true, breadth: true };
  const design = pool.map((p) => features(p, asOf, spec));
  const y = pool.map((p) => Math.log10(p.mcap_usd!));
  const coef = id === 'curve' ? ols(design, y) : huberFit(design, y, model);
  const offsets = id === 'flat' || id === 'curve' || id === 'huber' ? new Map<string, number>() : familyOffsets(pool, asOf, spec, coef, model);
  return { id, coef, median: null, offsets, spec };
}

/** What one fitted variant says a protocol's market cap is. */
export function predictVariant(variant: FittedVariant, p: SnapshotProtocol, asOf: string): number {
  if (variant.id === 'flat') return Math.max(1, p.tvl_usd * (variant.median ?? 0.25));
  const logValue = features(p, asOf, variant.spec).reduce((s, v, j) => s + v * variant.coef![j]!, 0);
  const offset = variant.offsets.get(p.category ?? 'Other') ?? 0;
  return Math.max(1, Math.pow(10, logValue + offset));
}

/** The fitted size curve the entry prices off: the Huber variant. */
export function fitCurve(pool: SnapshotProtocol[], asOf: string, model: ModelConstants = MODEL): FittedVariant {
  return fitVariant('huber', pool, asOf, model);
}

/** Spearman's rank correlation between two lists of numbers. */
function spearman(x: number[], y: number[]): number {
  const rankOf = (values: number[]): number[] => {
    const order = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
    const ranks = new Array<number>(values.length).fill(0);
    let i = 0;
    while (i < order.length) {
      let j = i;
      while (j + 1 < order.length && order[j + 1]!.v === order[i]!.v) j++;
      const meanRank = (i + j) / 2;
      for (let k = i; k <= j; k++) ranks[order[k]!.i] = meanRank;
      i = j + 1;
    }
    return ranks;
  };
  const rx = rankOf(x);
  const ry = rankOf(y);
  const n = x.length;
  const mx = rx.reduce((s, v) => s + v, 0) / n;
  const my = ry.reduce((s, v) => s + v, 0) / n;
  let cov = 0;
  let vx = 0;
  let vy = 0;
  for (let i = 0; i < n; i++) {
    cov += (rx[i]! - mx) * (ry[i]! - my);
    vx += (rx[i]! - mx) * (rx[i]! - mx);
    vy += (ry[i]! - my) * (ry[i]! - my);
  }
  if (vx === 0 || vy === 0) return 0;
  return cov / Math.sqrt(vx * vy);
}

/** One test's numbers from its predictions: median miss, shares within 2x and 3x, rank correlation. */
function statsOf(predictions: { actual: number; predicted: number }[]): ValidationStats {
  const misses = predictions.map((p) => Math.max(p.actual / p.predicted, p.predicted / p.actual));
  const apes = predictions.map((p) => Math.abs(p.predicted - p.actual) / p.actual);
  const ratios = predictions.map((p) => p.predicted / p.actual);
  const within2 = predictions.filter((p) => p.predicted / p.actual >= 0.5 && p.predicted / p.actual <= 2).length;
  const within3 = predictions.filter((p) => p.predicted / p.actual >= 1 / 3 && p.predicted / p.actual <= 3).length;
  return {
    n: predictions.length,
    median_miss: round2(median(misses)),
    median_ape_pct: Math.round(median(apes) * 1000) / 10,
    within_3x: within3,
    within_3x_pct: predictions.length > 0 ? Math.round((within3 / predictions.length) * 100) : 0,
    within_2x: within2,
    within_2x_pct: predictions.length > 0 ? Math.round((within2 / predictions.length) * 100) : 0,
    median_ratio: round2(median(ratios)),
    rho: round2(spearman(predictions.map((p) => p.actual), predictions.map((p) => p.predicted))),
  };
}

/** Leave-one-out for one variant: every protocol predicted from a fit without itself. */
function looStats(pool: SnapshotProtocol[], asOf: string, variant: string, model: ModelConstants): ValidationStats {
  const predictions: { actual: number; predicted: number }[] = [];
  for (let i = 0; i < pool.length; i++) {
    const rest = pool.filter((_, j) => j !== i);
    const fitted = fitVariant(variant, rest, asOf, model);
    predictions.push({ actual: pool[i]!.mcap_usd!, predicted: predictVariant(fitted, pool[i]!, asOf) });
  }
  return statsOf(predictions);
}

/** Walk-forward for one variant: fitted before the cutoff, tested after it. */
function walkForwardStats(
  pool: SnapshotProtocol[],
  asOf: string,
  variant: string,
  model: ModelConstants,
): ValidationStats & { cutoff: string; fit_n: number; test_n: number } {
  const dated = pool.filter((p) => p.listed_at !== null);
  const cutoff = dated.map((p) => p.listed_at!).sort()[Math.floor(dated.length / 2)]!;
  const fit = pool.filter((p) => p.listed_at !== null && p.listed_at < cutoff);
  const test = pool.filter((p) => p.listed_at !== null && p.listed_at >= cutoff);
  const fitted = fitVariant(variant, fit, asOf, model);
  const predictions = test.map((p) => ({ actual: p.mcap_usd!, predicted: predictVariant(fitted, p, asOf) }));
  return { ...statsOf(predictions), cutoff, fit_n: fit.length, test_n: test.length };
}

/**
 * The model's validation, computed from the sealed snapshot alone: the
 * leave-one-out and walk-forward numbers for the fitted curve, and the
 * ablation table, one row per variant, each term added in turn.
 */
export function validateModel(snapshot: Snapshot, model: ModelConstants = MODEL): Validation {
  const pool = fitPool(snapshot);
  const asOf = snapshot.as_of;
  const loo = looStats(pool, asOf, 'huber', model);
  const walkForward = walkForwardStats(pool, asOf, 'huber', model);
  const variants: { id: string; label: string }[] = [
    { id: 'flat', label: 'TVL x one multiple' },
    { id: 'curve', label: '+ size curve (OLS)' },
    { id: 'huber', label: '+ Huber weights (robust)' },
    { id: 'family', label: '+ family offsets' },
    { id: 'growth', label: '+ fitted 7-day growth' },
    { id: 'age', label: '+ fitted listing age' },
    { id: 'breadth', label: '+ chain breadth' },
  ];
  const ablation: AblationRow[] = variants.map((v) => {
    const l = looStats(pool, asOf, v.id, model);
    const w = walkForwardStats(pool, asOf, v.id, model);
    return {
      variant: v.label,
      loo_miss: l.median_miss,
      within_3x_pct: l.within_3x_pct,
      within_2x_pct: l.within_2x_pct,
      rho: l.rho,
      wf_miss: w.median_miss,
      wf_within_3x_pct: w.within_3x_pct,
      used: v.id === 'huber',
    };
  });
  // The out-of-sample miss the bands are widened by: the live tokens'
  // actual-to-predicted ratios from the curve's leave-one-out run.
  const ratios: number[] = [];
  for (let i = 0; i < pool.length; i++) {
    const rest = pool.filter((_, j) => j !== i);
    const fitted = fitVariant('huber', rest, asOf, model);
    ratios.push(pool[i]!.mcap_usd! / predictVariant(fitted, pool[i]!, asOf));
  }
  return {
    loo,
    walk_forward: walkForward,
    ablation,
    final_variant: '+ Huber weights (robust)',
    loo_ratio_p25: round2(quantile(ratios, 0.25)),
    loo_ratio_p75: round2(quantile(ratios, 0.75)),
  };
}

/**
 * The fitted curve's prediction for one protocol, before the pre-token
 * discount: 10 raised to the fitted log value. The dashboard recomputes it
 * from the same two coefficients, so the page and board.json agree.
 */
export function curveValue(variant: FittedVariant, p: SnapshotProtocol, asOf: string): number {
  return predictVariant(variant, p, asOf);
}

/** The implied value one protocol gets: the curve's prediction, discounted for having no token. */
export function impliedValue(
  p: SnapshotProtocol,
  variant: FittedVariant,
  asOf: string,
  model: ModelConstants = MODEL,
): { implied: number; curveValue: number; logTvl: number; fittedLogMcap: number } {
  const logTvl = Math.log10(Math.max(1, p.tvl_usd));
  const curve = predictVariant(variant, p, asOf);
  const fittedLogMcap = Math.log10(Math.max(1, curve));
  const implied = Math.max(1, Math.round(curve * model.pre_token_discount));
  return { implied, curveValue: Math.round(curve), logTvl: round4(logTvl), fittedLogMcap: round4(fittedLogMcap) };
}

/**
 * Each row's P25-P75 band, from 200 bootstrap refits of the curve: the refit
 * predictions' quartiles, widened by the out-of-sample miss (the 25th and
 * 75th percentiles of the live tokens' actual-to-predicted ratios from
 * leave-one-out). The same loop fills the scatter plot's band grid, so the
 * plot and the table show the same band.
 */
export function computeBands(
  snapshot: Snapshot,
  variant: FittedVariant,
  validation: Validation,
  model: ModelConstants = MODEL,
): { rows: Map<string, { p25: number; p75: number }>; grid: { tvl_usd: number; curve_usd: number; lo_usd: number; hi_usd: number }[] } {
  const pool = fitPool(snapshot);
  const asOf = snapshot.as_of;
  const rand = mulberry32(model.band_seed);
  const candidates = snapshot.protocols.filter((p) => isLaunchCandidate(p));
  const minTvl = Math.min(...candidates.map((p) => p.tvl_usd));
  const maxTvl = Math.max(...candidates.map((p) => p.tvl_usd));
  const gridTvl: number[] = [];
  for (let i = 0; i < BAND_GRID_POINTS; i++) {
    gridTvl.push(Math.round(Math.pow(10, Math.log10(minTvl) + ((Math.log10(maxTvl) - Math.log10(minTvl)) * i) / (BAND_GRID_POINTS - 1))));
  }
  const rowPreds = new Map<string, number[]>();
  for (const p of candidates) rowPreds.set(p.slug, []);
  const gridPreds: number[][] = gridTvl.map(() => []);
  for (let r = 0; r < model.refits; r++) {
    const sample: SnapshotProtocol[] = [];
    for (let i = 0; i < pool.length; i++) sample.push(pool[Math.floor(rand() * pool.length)]!);
    const refit = fitVariant('huber', sample, asOf, model);
    for (const p of candidates) {
      rowPreds.get(p.slug)!.push(predictVariant(refit, p, asOf) * model.pre_token_discount);
    }
    for (let g = 0; g < gridTvl.length; g++) {
      const probe: SnapshotProtocol = {
        slug: 'grid',
        name: 'grid',
        category: null,
        chains: [],
        tvl_usd: gridTvl[g]!,
        change_7d: null,
        mcap_usd: null,
        listed_at: null,
        gecko_id: null,
        symbol: null,
      };
      gridPreds[g]!.push(predictVariant(refit, probe, asOf) * model.pre_token_discount);
    }
  }
  const widen = (p25: number, p75: number): { p25: number; p75: number } => ({
    p25: Math.max(1, Math.round(p25 * validation.loo_ratio_p25)),
    p75: Math.max(1, Math.round(p75 * validation.loo_ratio_p75)),
  });
  const rows = new Map<string, { p25: number; p75: number }>();
  for (const [slug, preds] of rowPreds) {
    rows.set(slug, widen(quantile(preds, 0.25), quantile(preds, 0.75)));
  }
  const grid = gridTvl.map((tvl, g) => {
    const band = widen(quantile(gridPreds[g]!, 0.25), quantile(gridPreds[g]!, 0.75));
    return {
      tvl_usd: tvl,
      curve_usd: Math.max(1, Math.round(predictVariant(variant, {
        slug: 'grid', name: 'grid', category: null, chains: [], tvl_usd: tvl,
        change_7d: null, mcap_usd: null, listed_at: null, gecko_id: null, symbol: null,
      }, asOf) * model.pre_token_discount)),
      lo_usd: band.p25,
      hi_usd: band.p75,
    };
  });
  return { rows, grid };
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The hands-on hours a farm plan takes: setup, one weekly action, claim, log. */
export function handsOnHours(holdDays: number): number {
  return round2(0.25 + (holdDays / 7) * (10 / 60) + 10 / 60 + 5 / 60);
}

/**
 * What one farm position costs: the gas to set it up and keep it active, plus
 * the yield forgone on the capital it locks, at the model's stated yearly rate.
 * The capital itself is not spent — it is deposited and comes back — so only
 * the gas and the forgone yield are costs.
 */
export function farmCost(p: SnapshotProtocol, age: number | null, model: ModelConstants = MODEL): FarmCost {
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = (capital >= 150 ? 8 : 4) + 2 * Math.ceil(hold / 7);
  const opportunity = (capital * model.opportunity_apr * hold) / 365;
  return {
    capital_usd: capital,
    hold_days: hold,
    gas_usd: round2(gas),
    opportunity_usd: round2(opportunity),
    total_usd: round2(gas + opportunity),
  };
}

/**
 * The farm verdict, netted with launch odds: the slice if launch is the
 * airdrop — 10% of the implied value, split equally among 10,000 farmers —
 * and the break-even odds are the launch probability at which the farm repays
 * its cost. Farm when those odds are 10% or better, thin when they are 33%
 * or better, skip when even a certain launch would not pay. The net per
 * hands-on hour plans the slice at a stated 25% launch chance. The reason
 * carries the numbers, so the verdict is checkable from the row.
 */
export function farmVerdict(
  implied: number,
  cost: FarmCost,
  model: ModelConstants = MODEL,
): { verdict: Verdict; share_usd: number; ratio: number; breakeven: number; net_per_hour: number; reason: string } {
  const share = (implied * model.airdrop_pct) / model.farmers;
  const shareUsd = round2(share);
  const ratio = cost.total_usd > 0 ? share / cost.total_usd : 0;
  const breakeven = share > 0 ? cost.total_usd / share : Number.POSITIVE_INFINITY;
  const hours = handsOnHours(cost.hold_days);
  const netPerHour = round2((share * model.launch_p - cost.total_usd) / hours);
  const shareText = fmtMoney(shareUsd);
  const costText = fmtMoney(cost.total_usd);
  const oddsPct = breakeven === Number.POSITIVE_INFINITY ? 'over 100' : String(Math.round(breakeven * 100));
  const assumption = `if the protocol pays ${Math.round(model.airdrop_pct * 100)}% of its ${fmtMoney(implied)} implied value to ${model.farmers.toLocaleString('en-US')} farmers`;
  const ratioRounded = round2(ratio);
  if (breakeven <= model.farm_odds) {
    return {
      verdict: 'farm',
      share_usd: shareUsd,
      ratio: ratioRounded,
      breakeven: round4(breakeven),
      net_per_hour: netPerHour,
      reason: `Farm: a slice of about ${shareText} if it launches is ${ratioRounded}x the ${costText} it costs to farm — the launch odds that repay the cost are ${oddsPct}% (farm at ${Math.round(model.farm_odds * 100)}% or better), ${assumption}.`,
    };
  }
  if (breakeven <= model.thin_odds) {
    return {
      verdict: 'thin',
      share_usd: shareUsd,
      ratio: ratioRounded,
      breakeven: round4(breakeven),
      net_per_hour: netPerHour,
      reason: `Thin: a slice of about ${shareText} if it launches is ${ratioRounded}x the ${costText} it costs to farm — the launch odds that repay the cost are ${oddsPct}% (thin to ${Math.round(model.thin_odds * 100)}%), ${assumption}.`,
    };
  }
  return {
    verdict: 'skip',
    share_usd: shareUsd,
    ratio: ratioRounded,
    breakeven: breakeven === Number.POSITIVE_INFINITY ? 999 : round4(breakeven),
    net_per_hour: netPerHour,
    reason: `Skip: a slice of about ${shareText} if it launches is ${ratioRounded}x the ${costText} it costs to farm — the launch odds that repay the cost are ${oddsPct}% (a certain launch would not pay), ${assumption}.`,
  };
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return `Supply $${capital} of USDC to ${name} on ${chain} as collateral and keep the loan-to-value low.`;
  }
  if (c.includes('dex') || c.includes('liquidity manager')) {
    return `Provide $${capital} of liquidity to ${name}'s deepest pool on ${chain} and keep the position in range.`;
  }
  if (c.includes('yield') || c.includes('leveraged farm') || c.includes('farm')) {
    return `Deposit $${capital} into ${name}'s highest-yield vault on ${chain} and leave it compounding.`;
  }
  if (c.includes('basis')) {
    return `Deposit $${capital} into ${name}'s basis strategy on ${chain} and keep the position open.`;
  }
  if (c.includes('staking') || c.includes('restak')) {
    return `Stake $${capital} of the chain's staking asset through ${name} and hold the receipt.`;
  }
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) {
    return `Deposit $${capital} of USDC as margin on ${name} and open one small hedged position.`;
  }
  if (c.includes('prediction')) {
    return `Fund $${capital} and place one market position on ${name}.`;
  }
  if (c.includes('curator') || c.includes('allocator') || c.includes('capital')) {
    return `Deposit $${capital} into a ${name} vault on ${chain} and keep the vault shares.`;
  }
  if (c.includes('stable')) {
    return `Mint or hold $${capital} of the stable asset through ${name} on ${chain}.`;
  }
  if (c.includes('rwa')) {
    return `Mint $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it.`;
  }
  if (c.includes('insurance')) {
    return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  }
  if (c.includes('index')) {
    return `Buy $${capital} of ${name}'s index token on ${chain} and hold it.`;
  }
  if (c.includes('payment') || c.includes('card')) {
    return `Spend $${capital} through ${name} on ${chain} and keep the account active.`;
  }
  if (c.includes('chain')) {
    return `Bridge $${capital} of USDC to ${name}'s chain, use its app once, and keep the balance there.`;
  }
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time.
 * The plan is derived from the protocol's own record (category, chains, TVL,
 * age), never from a hand-written list of names. It says the protocol records
 * no token; it never promises one.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  return [
    {
      text: `Open a fresh wallet that holds only the funds you plan to farm, and write its seed phrase on paper, never in a screenshot or a chat.`,
      cost: 'nothing to set up; under $3 of gas for the first transaction',
      time: '10 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Do one qualifying action each week on ${p.name} — a deposit, a swap, a borrow, or a vote — so the wallet shows steady use.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days, so the activity is counted in more than one snapshot window.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open ${p.name}'s own points or rewards page from its official site and claim only through the link it publishes; never pay a fee to claim and never trust a link from a direct message.`,
      cost: 'no fee to check',
      time: '10 minutes',
    },
    {
      text: `Write the wallet address, the dates, and every transaction hash in a farm log, so you can repeat the position or unwind it without guessing.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The pieces the board needs, computed once and shared by the board and the radar. */
export interface ModelPieces {
  variant: FittedVariant;
  validation: Validation;
  bands: { rows: Map<string, { p25: number; p75: number }>; grid: { tvl_usd: number; curve_usd: number; lo_usd: number; hi_usd: number }[] };
}

/** Fit the curve, validate it and build the bands, once per run. */
export function modelPieces(snapshot: Snapshot, model: ModelConstants = MODEL): ModelPieces {
  const variant = fitCurve(fitPool(snapshot), snapshot.as_of, model);
  const validation = validateModel(snapshot, model);
  const bands = computeBands(snapshot, variant, validation, model);
  return { variant, validation, bands };
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL, pre?: ModelPieces): BoardRow[] {
  const { variant, bands } = pre ?? modelPieces(snapshot, model);
  const watchlist = new Set(snapshot.watchlist);
  // Every launch candidate the snapshot holds: the watchlist is the floor, and
  // every candidate below it is a row too, so the board is the whole field.
  const candidates = snapshot.protocols.filter((p) => isLaunchCandidate(p));
  const scored = candidates.map((p) => {
    const v = impliedValue(p, variant, snapshot.as_of, model);
    const age = ageDays(snapshot.as_of, p.listed_at);
    const cost = farmCost(p, age, model);
    const verdict = farmVerdict(v.implied, cost, model);
    return { p, ...v, age, cost, verdict };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  // Ranks are strict: an exact tie after rounding steps down by a dollar, and
  // the step is recorded so the dashboard recomputes the same number.
  const adjust = new Map<string, number>();
  let prev = Number.POSITIVE_INFINITY;
  for (const s of scored) {
    let value = s.implied;
    let step = 0;
    while (value >= prev) {
      value -= 1;
      step -= 1;
    }
    adjust.set(s.p.slug, step);
    s.implied = Math.max(1, value);
    prev = s.implied;
  }
  return scored.map((s, i) => {
    const band = bands.rows.get(s.p.slug) ?? { p25: 1, p75: s.implied };
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token',
      watchlist: watchlist.has(s.p.slug),
      age_days: s.age,
      implied_value_usd: s.implied,
      band_p25_usd: band.p25,
      band_p75_usd: band.p75,
      model: {
        curve_value_usd: s.curveValue,
        log_tvl: s.logTvl,
        fitted_log_mcap: s.fittedLogMcap,
        adjust_usd: adjust.get(s.p.slug) ?? 0,
      },
      verdict: s.verdict.verdict,
      verdict_reason: s.verdict.reason,
      farm_cost_usd: s.cost.total_usd,
      farmer_share_usd: s.verdict.share_usd,
      value_per_cost: s.verdict.ratio,
      breakeven_odds: s.verdict.breakeven,
      net_per_hour_usd: s.verdict.net_per_hour,
      farm_steps: farmSteps(s.p, s.age).map(stepText),
    };
  });
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  const fitSlugs = new Set(fitPool(snapshot).map((p) => p.slug));
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      in_fit: fitSlugs.has(p.slug),
    }));
}

/** Every live-token protocol, for the scatter plot: the fit pool and the set-aside wrappers. */
export function scatterLive(snapshot: Snapshot): LiveRow[] {
  const fitSlugs = new Set(fitPool(snapshot).map((p) => p.slug));
  return livePool(snapshot).map((p) => ({
    slug: p.slug,
    name: p.name,
    category: p.category,
    chains: p.chains,
    tvl_usd: p.tvl_usd,
    mcap_usd: p.mcap_usd,
    change_7d: p.change_7d,
    in_fit: fitSlugs.has(p.slug),
  }));
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    watchlist: row.watchlist,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    band_p25_usd: row.band_p25_usd,
    band_p75_usd: row.band_p75_usd,
    curve_value_usd: row.model.curve_value_usd,
    log_tvl: row.model.log_tvl,
    fitted_log_mcap: row.model.fitted_log_mcap,
    adjust_usd: row.model.adjust_usd,
    verdict: row.verdict,
    verdict_reason: row.verdict_reason,
    farm_cost_usd: row.farm_cost_usd,
    farmer_share_usd: row.farmer_share_usd,
    value_per_cost: row.value_per_cost,
    breakeven_odds: row.breakeven_odds,
    net_per_hour_usd: row.net_per_hour_usd,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const pieces = modelPieces(snapshot, model);
  const board = buildBoard(snapshot, model, pieces);
  const pool = fitPool(snapshot);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !r.watchlist).length;
  const curve: CurveData = {
    intercept: round4(pieces.variant.coef![0]!),
    slope: round4(pieces.variant.coef![1]!),
    fit_n: pool.length,
    fit_note: 'Huber fit of log10(market cap) on log10(TVL), on the live protocols that are not themselves wrappers',
    band_grid: pieces.bands.grid,
  };
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
    scatter_live: scatterLive(snapshot),
    live_pool_size: livePool(snapshot).length,
    curve,
    validation: pieces.validation,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, farm steps, bands and verdicts. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd >= board[i - 1]!.implied_value_usd) return `row ${i + 1} does not sit below row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (!(r.band_p25_usd > 0) || !(r.band_p75_usd >= r.band_p25_usd) || !(r.implied_value_usd >= r.band_p25_usd) || !(r.implied_value_usd <= r.band_p75_usd)) {
      return `${r.slug} has a band that does not hold its implied value: P25 $${r.band_p25_usd}, implied $${r.implied_value_usd}, P75 $${r.band_p75_usd}`;
    }
    if (r.verdict !== 'farm' && r.verdict !== 'thin' && r.verdict !== 'skip') return `${r.slug} has verdict ${String(r.verdict)}`;
    if (typeof r.verdict_reason !== 'string' || r.verdict_reason.length < 20 || r.verdict_reason.length > 400) return `${r.slug} has a verdict reason of ${r.verdict_reason.length} characters`;
    if (!(r.farm_cost_usd > 0) || !(r.farmer_share_usd >= 0) || !(r.value_per_cost >= 0) || !(r.breakeven_odds > 0)) return `${r.slug} has a bad farm verdict figure`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
