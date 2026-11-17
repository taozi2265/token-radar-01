// Token Radar, model radar-3: one sealed snapshot in, one ranked board out.
//
// The board ranks every protocol that could still launch a token, by an implied
// value priced off the market that already trades in the same snapshot — and,
// new in radar-3, the price is one the snapshot itself tested, not one it
// merely asserted.
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
// How implied value is priced, and why the multiple is the market's, not a
// category's. Radar-2 priced each category off its own live-token median. Radar-3
// tested that choice against the snapshot's live tokens, two ways, and the
// category multiples lost both times: leave-one-out on the 119 live protocols
// put the category model at a 94.6% median error with 19% of predictions within
// 2x of the real market cap, while one market-wide median scored 89.4% and 27%;
// a walk-forward test, fitted on protocols listed before 2024-02-28 and tested
// on those listed after, gave 97.4% and 16% for the category model against
// 86.8% and 25% for the market median. The category differences are mostly
// noise, so radar-3 prices every protocol off the market-wide median
// market-cap-to-TVL ratio of the live protocols in this snapshot (winsorized
// to [0.01, 2.00], clamped to [0.02, 0.80]). The per-category medians are still
// computed and shown, as the reference table, so the choice is auditable.
// Then:
//
//   implied = round(tvl_usd x multiple x 0.5 x growth x maturity x breadth)
//
//   multiple   the market-wide median mcap/TVL of live protocols (0.246 here)
//   0.5        the pre-token discount: a token that does not exist yet carries
//              launch, vesting and liquidity risk a live token does not
//   growth     1 + clamp(change_7d, -60, 120) / 100 x 0.5
//   maturity   0.6 + 0.4 x min(age_days, 1095) / 1095 (unknown age: 365 days)
//   breadth    1 + 0.05 x min(chains - 1, 4): distribution across chains
//
// The validation tests the live-token prediction — the same formula without the
// 0.5 pre-token discount, which is a stated haircut, not a fitted number — so a
// reader can see what the model gets right and where it is rough: the typical
// live market cap lands about 5x from the prediction, and the multiple is a
// central tendency, not a price.
//
// Farm verdicts, netted. A farm plan costs gas plus the yield forgone on the
// capital it locks (5% a year, stated). A farmer's share, if the protocol
// launches, is taken as 5% of the implied value paid to farmers, split among
// 10,000 farmers — both stated assumptions, not facts. Farm when that share is
// at least 3x the farming cost, thin when it covers the cost, skip when it
// does not. The verdict and its one-line reason travel on every row, so the
// board says which rows are worth the work, not just which are biggest.
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
  pre_token_discount: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  breadth_step: number;
  breadth_cap: number;
  shrink_pseudo: number;
  min_comparables: number;
  multiple_floor: number;
  multiple_cap: number;
  winsor_low: number;
  winsor_high: number;
  /** Share of the implied value paid to farmers, if the protocol launches. */
  farmer_share_pct: number;
  /** Farmers splitting that share. */
  farmers: number;
  /** A farmer's share must be this many times the farming cost for "farm". */
  farm_multiple: number;
  /** A farmer's share must be this many times the farming cost for "thin". */
  thin_multiple: number;
  /** Forgone yearly yield on the capital a farm locks. */
  opportunity_apr: number;
}

export const MODEL: ModelConstants = {
  pre_token_discount: 0.5,
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  breadth_step: 0.05,
  breadth_cap: 4,
  shrink_pseudo: 4,
  min_comparables: 3,
  multiple_floor: 0.02,
  multiple_cap: 0.8,
  winsor_low: 0.01,
  winsor_high: 2.0,
  farmer_share_pct: 0.05,
  farmers: 10000,
  farm_multiple: 3,
  thin_multiple: 1,
  opportunity_apr: 0.05,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-3';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

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
  model: {
    multiple: number;
    category_multiple: number;
    comparables: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    age_days: number | null;
  };
  verdict: Verdict;
  verdict_reason: string;
  farm_cost_usd: number;
  farmer_share_usd: number;
  value_per_cost: number;
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
  multiple: number;
  category_multiple: number;
  comparables: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  verdict: Verdict;
  verdict_reason: string;
  farm_cost_usd: number;
  farmer_share_usd: number;
  value_per_cost: number;
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
}

/** One row of the calibration table the dashboard shows. */
export interface CalibrationRow {
  category: string;
  comparables: number;
  multiple: number;
}

/** One validation test's numbers: how the model did on live market caps. */
export interface ValidationStats {
  n: number;
  median_ape_pct: number;
  within_2x: number;
  within_2x_pct: number;
  median_ratio: number;
}

/** The model's validation, computed from the sealed snapshot alone. */
export interface Validation {
  /** Leave-one-out on the live protocols: each one predicted without itself. */
  loo: ValidationStats;
  /** Walk-forward: fitted on protocols listed before the cutoff, tested after. */
  walk_forward: ValidationStats & { cutoff: string; fit_n: number; test_n: number };
  /** The radar-2 category-multiple model, same tests, for comparison. */
  baseline_loo: ValidationStats;
  baseline_walk_forward: ValidationStats;
}

/** Everything the dashboard needs: the board, the live set, the calibration, the model. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  global_median: number;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
  calibration: CalibrationRow[];
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

/** The median of a non-empty array of numbers. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

/** A ratio pulled inside [low, high] before it is allowed to set a price. */
function winsorize(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/** A dollar figure as a short string: $1,605, $19, $1.96. */
export function fmtMoney(n: number): string {
  if (n >= 1000) return `$${Math.round(n).toLocaleString('en-US')}`;
  if (n >= 10) return `$${Math.round(n)}`;
  return `$${n.toFixed(2)}`;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/**
 * The market's own pricing table, built from the live-token protocols in this
 * snapshot alone: the median market-cap-to-TVL ratio per category, and the
 * market-wide median behind it. A live protocol counts only when it has a
 * positive market cap and TVL and is not an exchange.
 */
export interface Calibration {
  globalMedian: number;
  byCategory: Map<string, { comparables: number; multiple: number }>;
}

export function calibrate(snapshot: Snapshot, model: ModelConstants = MODEL): Calibration {
  const live = livePool(snapshot);
  const ratios = live.map((p) => winsorize(p.mcap_usd! / p.tvl_usd, model.winsor_low, model.winsor_high));
  const globalMedian = ratios.length > 0 ? median(ratios) : 0.25;
  const grouped = new Map<string, number[]>();
  for (const p of live) {
    const key = p.category ?? 'Other';
    const list = grouped.get(key) ?? [];
    list.push(winsorize(p.mcap_usd! / p.tvl_usd, model.winsor_low, model.winsor_high));
    grouped.set(key, list);
  }
  const byCategory = new Map<string, { comparables: number; multiple: number }>();
  for (const [category, list] of grouped) {
    const n = list.length;
    const multiple =
      n >= model.min_comparables
        ? (n * median(list) + model.shrink_pseudo * globalMedian) / (n + model.shrink_pseudo)
        : globalMedian;
    byCategory.set(category, {
      comparables: n,
      multiple: Math.min(model.multiple_cap, Math.max(model.multiple_floor, multiple)),
    });
  }
  return { globalMedian, byCategory };
}

/** The live-token protocols the calibration is built from. */
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
 * The multiple radar-3 prices off: the market-wide median, clamped like every
 * multiple. The category medians lost to it out of sample (see validateModel),
 * so the model uses one market price and shows the category table for reference.
 */
export function pricingMultiple(calibration: Calibration, model: ModelConstants = MODEL): number {
  return Math.min(model.multiple_cap, Math.max(model.multiple_floor, calibration.globalMedian));
}

/** A category's own median multiple, for the reference table and the baseline test. */
export function categoryMultiple(category: string | null, calibration: Calibration, model: ModelConstants = MODEL): { multiple: number; comparables: number } {
  const entry = calibration.byCategory.get(category ?? 'Other');
  if (entry === undefined) return { multiple: calibration.globalMedian, comparables: 0 };
  return { multiple: entry.multiple, comparables: entry.comparables };
}

/** The five factors and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  calibration: Calibration,
  model: ModelConstants = MODEL,
): {
  implied: number;
  multiple: number;
  categoryMultiple: number;
  comparables: number;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  breadthMult: number;
  age: number | null;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const multiple = pricingMultiple(calibration, model);
  const cat = categoryMultiple(protocol.category, calibration, model);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_floor +
    (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const extraChains = Math.min(Math.max(protocol.chains.length - 1, 0), model.breadth_cap);
  const breadthMult = 1 + model.breadth_step * extraChains;
  const implied = Math.max(
    1,
    Math.round(protocol.tvl_usd * multiple * model.pre_token_discount * growthMult * maturityMult * breadthMult),
  );
  return { implied, multiple, categoryMultiple: cat.multiple, comparables: cat.comparables, growthPct, growthMult, maturityMult, breadthMult, age };
}

/** The growth, maturity and breadth multipliers one protocol gets, shared by the model and its tests. */
export function factors(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants = MODEL,
): { growthMult: number; maturityMult: number; breadthMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_floor +
    (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const extraChains = Math.min(Math.max(protocol.chains.length - 1, 0), model.breadth_cap);
  const breadthMult = 1 + model.breadth_step * extraChains;
  return { growthMult, maturityMult, breadthMult, age };
}

/**
 * What the model would say a live token is worth: the same formula as the
 * board, without the pre-token discount, which is a stated haircut, not a
 * fitted number. The validation predicts market caps with this.
 */
export function predictMcap(
  protocol: SnapshotProtocol,
  asOf: string,
  multiple: number,
  model: ModelConstants = MODEL,
): number {
  const f = factors(protocol, asOf, model);
  return Math.max(1, Math.round(protocol.tvl_usd * multiple * f.growthMult * f.maturityMult * f.breadthMult));
}

/** One test's numbers from its predictions: median error, share within 2x, median ratio. */
function statsOf(predictions: { actual: number; predicted: number }[]): ValidationStats {
  const apes = predictions.map((p) => Math.abs(p.predicted - p.actual) / p.actual);
  const ratios = predictions.map((p) => p.predicted / p.actual);
  const within = predictions.filter((p) => p.predicted / p.actual >= 0.5 && p.predicted / p.actual <= 2).length;
  return {
    n: predictions.length,
    median_ape_pct: Math.round(median(apes) * 1000) / 10,
    within_2x: within,
    within_2x_pct: predictions.length > 0 ? Math.round((within / predictions.length) * 100) : 0,
    median_ratio: round2(median(ratios)),
  };
}

/**
 * The model's validation, computed from the sealed snapshot alone.
 *
 * Leave-one-out: every live protocol is predicted from a calibration built
 * without itself, so no protocol ever prices itself. Walk-forward: the
 * calibration is fitted only on protocols listed before the median listing
 * date and tested on those listed after, so no later protocol leaks into the
 * fit. Both tests are run twice: once for radar-3 (the market-wide median)
 * and once for the radar-2 baseline (each category's own median), so the
 * choice between them is measured, not asserted.
 */
export function validateModel(snapshot: Snapshot, model: ModelConstants = MODEL): Validation {
  const pool = livePool(snapshot);

  const loo3: { actual: number; predicted: number }[] = [];
  const looBase: { actual: number; predicted: number }[] = [];
  for (const p of pool) {
    const rest = pool.filter((q) => q.slug !== p.slug);
    const cal = calibrate({ ...snapshot, protocols: rest }, model);
    loo3.push({ actual: p.mcap_usd!, predicted: predictMcap(p, snapshot.as_of, pricingMultiple(cal, model), model) });
    looBase.push({ actual: p.mcap_usd!, predicted: predictMcap(p, snapshot.as_of, categoryMultiple(p.category, cal, model).multiple, model) });
  }

  const dated = pool.filter((p) => p.listed_at !== null);
  const cutoff = dated.map((p) => p.listed_at!).sort()[Math.floor(dated.length / 2)]!;
  const fit = pool.filter((p) => p.listed_at !== null && p.listed_at < cutoff);
  const test = pool.filter((p) => p.listed_at !== null && p.listed_at >= cutoff);
  const fitCal = calibrate({ ...snapshot, protocols: fit }, model);
  const wf3 = test.map((p) => ({
    actual: p.mcap_usd!,
    predicted: predictMcap(p, snapshot.as_of, pricingMultiple(fitCal, model), model),
  }));
  const wfBase = test.map((p) => ({
    actual: p.mcap_usd!,
    predicted: predictMcap(p, snapshot.as_of, categoryMultiple(p.category, fitCal, model).multiple, model),
  }));

  return {
    loo: statsOf(loo3),
    walk_forward: { ...statsOf(wf3), cutoff, fit_n: fit.length, test_n: test.length },
    baseline_loo: statsOf(looBase),
    baseline_walk_forward: statsOf(wfBase),
  };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

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

/** A whole word wrapped, staked or staking anywhere in a name. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** A name beginning with an exchange's name. */
const EXCHANGE_START = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

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

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const calibration = calibrate(snapshot, model);
  const index = bySlug(snapshot.protocols);
  const watchlist = new Set(snapshot.watchlist);
  // Every launch candidate the snapshot holds: the watchlist is the floor, and
  // every candidate below it is a row too, so the board is the whole field.
  const candidates = snapshot.protocols.filter((p) => isLaunchCandidate(p));
  const scored = candidates.map((p) => {
    const v = impliedValue(p, snapshot.as_of, calibration, model);
    const cost = farmCost(p, v.age, model);
    const verdict = farmVerdict(v.implied, cost, model);
    return { p, ...v, cost, verdict };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
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
    model: {
      multiple: s.multiple,
      category_multiple: s.categoryMultiple,
      comparables: s.comparables,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      breadth_multiplier: round4(s.breadthMult),
      age_days: s.age,
    },
    verdict: s.verdict.verdict,
    verdict_reason: s.verdict.reason,
    farm_cost_usd: s.cost.total_usd,
    farmer_share_usd: s.verdict.share_usd,
    value_per_cost: s.verdict.ratio,
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
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
 * The farm verdict, netted: a farmer's share of the implied value, if the
 * protocol launches and pays the model's stated share of it to the model's
 * stated number of farmers, against what the farm costs. Farm when the share
 * is at least farm_multiple times the cost, thin when it covers the cost,
 * skip when it does not. The reason carries the numbers, so the verdict is
 * checkable from the row.
 */
export function farmVerdict(
  implied: number,
  cost: FarmCost,
  model: ModelConstants = MODEL,
): { verdict: Verdict; share_usd: number; ratio: number; reason: string } {
  const share = (implied * model.farmer_share_pct) / model.farmers;
  const ratio = cost.total_usd > 0 ? share / cost.total_usd : 0;
  const shareUsd = round2(share);
  const ratioRounded = round2(ratio);
  const shareText = fmtMoney(shareUsd);
  const costText = fmtMoney(cost.total_usd);
  const assumption = `if the protocol pays ${Math.round(model.farmer_share_pct * 100)}% of its ${fmtMoney(implied)} implied value to ${model.farmers.toLocaleString('en-US')} farmers`;
  if (ratio >= model.farm_multiple) {
    return {
      verdict: 'farm',
      share_usd: shareUsd,
      ratio: ratioRounded,
      reason: `Farm: a farmer's share of about ${shareText} is ${ratioRounded}x the ${costText} it costs to farm, ${assumption}.`,
    };
  }
  if (ratio >= model.thin_multiple) {
    return {
      verdict: 'thin',
      share_usd: shareUsd,
      ratio: ratioRounded,
      reason: `Thin: a farmer's share of about ${shareText} is ${ratioRounded}x the ${costText} it costs to farm — it covers the cost, barely, ${assumption}.`,
    };
  }
  return {
    verdict: 'skip',
    share_usd: shareUsd,
    ratio: ratioRounded,
    reason: `Skip: a farmer's share of about ${shareText} is ${ratioRounded}x the ${costText} it costs to farm — the prize does not pay for the farm, ${assumption}.`,
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

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
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
    multiple: row.model.multiple,
    category_multiple: row.model.category_multiple,
    comparables: row.model.comparables,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    breadth_multiplier: row.model.breadth_multiplier,
    verdict: row.verdict,
    verdict_reason: row.verdict_reason,
    farm_cost_usd: row.farm_cost_usd,
    farmer_share_usd: row.farmer_share_usd,
    value_per_cost: row.value_per_cost,
  };
}

/** The calibration table: one row per category the board uses, by multiple. */
export function calibrationRows(snapshot: Snapshot, model: ModelConstants = MODEL): CalibrationRow[] {
  const calibration = calibrate(snapshot, model);
  const used = new Set<string>();
  for (const p of snapshot.protocols) {
    if (isLaunchCandidate(p)) used.add(p.category ?? 'Other');
  }
  const rows: CalibrationRow[] = [];
  for (const category of [...used].sort()) {
    const entry = calibration.byCategory.get(category);
    rows.push({
      category,
      comparables: entry?.comparables ?? 0,
      multiple: entry === undefined ? calibration.globalMedian : entry.multiple,
    });
  }
  return rows.sort((a, b) => b.multiple - a.multiple || (a.category < b.category ? -1 : 1));
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const calibration = calibrate(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !r.watchlist).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    global_median: round4(calibration.globalMedian),
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
    calibration: calibrationRows(snapshot, model),
    validation: validateModel(snapshot, model),
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

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, farm steps, and verdicts. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (r.verdict !== 'farm' && r.verdict !== 'thin' && r.verdict !== 'skip') return `${r.slug} has verdict ${String(r.verdict)}`;
    if (typeof r.verdict_reason !== 'string' || r.verdict_reason.length < 20 || r.verdict_reason.length > 400) return `${r.slug} has a verdict reason of ${r.verdict_reason.length} characters`;
    if (!(r.farm_cost_usd > 0) || !(r.farmer_share_usd >= 0) || !(r.value_per_cost >= 0)) return `${r.slug} has a bad farm verdict figure`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
