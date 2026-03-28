
import type { MarketSnapshot, PositionRecord } from "@shared/schema";

const DATA_API_BASE = "https://data-api.polymarket.com";
const CLOB_API_BASE = "https://clob.polymarket.com";

export type PolymarketFetchOptions = {
  timeoutMs: number;
  retryAttempts: number;
  retryBaseDelayMs: number;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryFetchError(err: unknown) {
  const msg = (err as any)?.message ? String((err as any).message) : "";
  const code = (err as any)?.code ? String((err as any).code) : "";
  return (
    code === "UND_ERR_CONNECT_TIMEOUT" ||
    msg.includes("Connect Timeout") ||
    msg.includes("fetch failed") ||
    code === "ETIMEDOUT" ||
    code === "ECONNRESET" ||
    code === "EAI_AGAIN"
  );
}

async function fetchWithRetry(url: string, init: RequestInit, opts: PolymarketFetchOptions) {
  let lastErr: unknown = null;
  const attempts = Math.max(1, opts.retryAttempts);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.max(1000, opts.timeoutMs));
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timeout);

      // Retry on rate-limit or server errors.
      if (!res.ok && (res.status === 429 || res.status >= 500)) {
        lastErr = new Error(`HTTP ${res.status} from ${url}`);
        await sleep(opts.retryBaseDelayMs * 2 ** attempt);
        continue;
      }

      return res;
    } catch (err) {
      clearTimeout(timeout);
      lastErr = err;
      if (!shouldRetryFetchError(err) || attempt === attempts - 1) {
        throw err;
      }
      await sleep(opts.retryBaseDelayMs * 2 ** attempt);
    }
  }
  throw lastErr ?? new Error("Fetch failed");
}

// --- Polymarket API types (production response shapes) ---

export interface PolymarketPosition {
  conditionId: string;
  asset: string;
  size: number;
  avgPrice: number;
  outcome: string;
  outcomeIndex?: number;
  title?: string;
  curPrice?: number;
  currentValue?: number;
  initialValue?: number;
  cashPnl?: number;
  percentPnl?: number;
  oppositeAsset?: string;
}

export interface PolymarketMarket {
  id?: string;
  conditionId?: string;
  condition_id?: string;
  question?: string;
  title?: string;
  clobTokenIds?: string[] | string;
  outcomes?: string[] | string;
  tokens?: Array<{ token_id?: string; tokenId?: string; outcome?: string; name?: string }> | string;
  outcomePrices?: string | number[]; 
  volume?: number;
  volume24hr?: number;
  openInterest?: number;
  openInterestNum?: number;
  liquidity?: number;
  liquidityNum?: number;
  enableOrderBook?: boolean;
  active?: boolean;
  closed?: boolean;
  slug?: string;
  archived?: boolean;
  events?: Array<{ slug?: string; title?: string }>;
  category?: string;
  // Gamma markets include tags and categories; keep them generic.
  tags?: Array<{ id?: string; name?: string; label?: string; slug?: string }>;
}

export interface ScannedMarket {
  id: string;
  title: string;
  conditionId: string;
  clobTokenIds: string[];
  outcomes: string[];
  outcomePrices: number[];
  volume24hr: number;
  slug?: string;
}

interface GammaTag {
  id: string;
  name: string;
}

export interface OrderBookLevel {
  price: string;
  size: string;
}

export interface OrderBookSummary {
  market: string;
  asset_id: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  last_trade_price?: string;
  min_order_size?: string;
  tick_size?: string;
  neg_risk?: boolean;
  timestamp?: string;
  hash?: string;
}

export type OrderBook = OrderBookSummary;

function parseNum(s: string | number | undefined): number {
  if (s === undefined || s === null) return 0;
  if (typeof s === "number") return s;
  const n = Number(s);
  return Number.isNaN(n) ? 0 : n;
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item : String(item ?? "")))
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => (typeof item === "string" ? item : String(item ?? "")))
          .map((item) => item.trim())
          .filter(Boolean);
      }
    } catch {
      // Some responses may be comma-separated instead of JSON.
      return raw
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }
  return [];
}

function parseTokens(value: unknown): Array<{ token_id: string; outcome: string }> {
  const normalize = (item: unknown) => {
    const token = item as { token_id?: unknown; tokenId?: unknown; outcome?: unknown; name?: unknown };
    const tokenIdRaw = token?.token_id ?? token?.tokenId;
    const tokenId = typeof tokenIdRaw === "string" ? tokenIdRaw : String(tokenIdRaw ?? "").trim();
    const outcomeRaw = token?.outcome ?? token?.name;
    const outcome = typeof outcomeRaw === "string" ? outcomeRaw : String(outcomeRaw ?? "").trim();
    if (!tokenId) return null;
    return { token_id: tokenId, outcome };
  };

  if (Array.isArray(value)) {
    return value.map(normalize).filter((v): v is { token_id: string; outcome: string } => !!v);
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.map(normalize).filter((v): v is { token_id: string; outcome: string } => !!v);
      }
    } catch {
      return [];
    }
  }
  return [];
}

function parseNumberArray(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === "number" ? v : Number(v)))
      .filter((n) => Number.isFinite(n));
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .map((v) => (typeof v === "number" ? v : Number(v)))
          .filter((n) => Number.isFinite(n));
      }
    } catch {
      return [];
    }
  }
  return [];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export async function fetchUserPositions(
  walletAddress: string,
  limit = 500,
  opts?: Partial<PolymarketFetchOptions>,
): Promise<PolymarketPosition[]> {
  const effective: PolymarketFetchOptions = {
    timeoutMs: opts?.timeoutMs ?? 20000,
    retryAttempts: opts?.retryAttempts ?? 3,
    retryBaseDelayMs: opts?.retryBaseDelayMs ?? 500,
  };
  const normalized = walletAddress.startsWith("0x") ? walletAddress : `0x${walletAddress}`;
  const url = `${DATA_API_BASE}/positions?user=${encodeURIComponent(
    normalized,
  )}&limit=${encodeURIComponent(String(limit))}`;
  const res = await fetchWithRetry(url, { method: "GET" }, effective);
  if (!res.ok) {
    throw new Error(`Polymarket positions failed: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as PolymarketPosition[];
  return Array.isArray(data) ? data : [];
}

export async function fetchMarketsForPositions(
  positions: PolymarketPosition[],
  opts?: Partial<PolymarketFetchOptions>,
): Promise<PolymarketMarket[]> {
  const effective: PolymarketFetchOptions = {
    timeoutMs: opts?.timeoutMs ?? 20000,
    retryAttempts: opts?.retryAttempts ?? 3,
    retryBaseDelayMs: opts?.retryBaseDelayMs ?? 500,
  };
  const conditionIds = Array.from(new Set(positions.map((p) => p.conditionId)));
  if (conditionIds.length === 0) return [];

  const byCondition = new Map<string, PolymarketMarket>();
  const cidKey = (m: PolymarketMarket) => m.conditionId ?? m.condition_id ?? "";

  async function fetchGammaMarketsByConditionIds(batch: string[]): Promise<PolymarketMarket[]> {

    const attempts: string[] = [`[${batch.join(",")}]`, batch.join(",")];
    for (const condIdsValue of attempts) {
      const url = new URL("https://gamma-api.polymarket.com/markets");
      url.searchParams.set("condition_ids", condIdsValue);
      try {
        const res = await fetchWithRetry(url.toString(), { method: "GET" }, effective);
        if (!res.ok) continue;
        const data = (await res.json()) as PolymarketMarket[];
        if (Array.isArray(data) && data.length > 0) return data;
      } catch {
        // try next encoding
      }
    }
    return [];
  }

  const pageLimit = 50;
  for (let i = 0; i < conditionIds.length; i += pageLimit) {
    const batch = conditionIds.slice(i, i + pageLimit);
    const data = await fetchGammaMarketsByConditionIds(batch);
    for (const m of data) {
      const cid = cidKey(m);
      if (!cid) continue;
      if (m.active === false) continue;
      if (m.closed === true) continue;
      byCondition.set(cid, m);
    }
  }

  const result: PolymarketMarket[] = [];
  for (const cid of conditionIds) {
    const fromGamma = byCondition.get(cid);
    if (fromGamma) {
      result.push(fromGamma);
      continue;
    }
    const first = positions.find((p) => p.conditionId === cid);
    result.push({
      conditionId: cid,
      condition_id: cid,
      question: first?.title ?? `Market ${cid.slice(0, 10)}...`,
      title: first?.title,
    });
  }
  return result;
}

const CATEGORY_KEYWORDS: Record<"crypto" | "sports" | "politics", string[]> = {
  crypto: [
    "crypto",
    "bitcoin",
    "btc",
    "ethereum",
    "eth",
    "solana",
    "sol",
    "doge",
    "xrp",
    "defi",
    "binance",
    "coinbase",
  ],
  sports: [
    "sports",
    "game",
    "match",
    "nba",
    "nfl",
    "mlb",
    "nhl",
    "soccer",
    "football",
    "tennis",
    "ufc",
    "f1",
    "golf",
  ],
  politics: [
    "politic",
    "election",
    "vote",
    "primary",
    "president",
    "senate",
    "governor",
    "congress",
    "parliament",
    "minister",
    "trump",
    "biden",
  ],
};

function marketText(market: PolymarketMarket): string {
  const tags = market.tags ?? [];
  const eventTitles = market.events?.map((event) => event.title).filter(Boolean) ?? [];
  return [
    market.title,
    market.question,
    market.category,
    market.slug,
    ...eventTitles,
    ...tags.map((t) => t.name ?? t.label ?? t.slug),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function marketCategoryScore(
  market: PolymarketMarket,
  category: keyof typeof CATEGORY_KEYWORDS,
): number {
  const haystack = marketText(market);
  if (!haystack) return 0;
  const keywords = CATEGORY_KEYWORDS[category];
  let score = 0;
  for (const keyword of keywords) {
    if (haystack.includes(keyword)) {
      score += keyword.length > 5 ? 2 : 1;
    }
  }
  if ((market.category ?? "").toLowerCase().includes(category.toLowerCase())) {
    score += 3;
  }
  return score;
}

function primaryMarketTitle(market: PolymarketMarket, conditionId: string): string {
  return (
    market.question ??
    market.title ??
    market.events?.find((event) => typeof event.title === "string" && event.title.trim().length > 0)?.title ??
    `Market ${conditionId.slice(0, 10)}...`
  );
}

function marketActivityScore(market: PolymarketMarket): number {
  const volume24h = parseNum(market.volume24hr);
  const openInterest = parseNum(market.openInterestNum ?? market.openInterest);
  const liquidity = parseNum(market.liquidityNum ?? market.liquidity);
  return volume24h * 1.2 + openInterest * 0.8 + liquidity * 0.4;
}

export async function fetchTopMarketsByCategory(
  category: "crypto" | "sports" | "politics",
  limit = 24,
  opts?: Partial<PolymarketFetchOptions>,
): Promise<ScannedMarket[]> {
  const effective: PolymarketFetchOptions = {
    timeoutMs: opts?.timeoutMs ?? 20000,
    retryAttempts: opts?.retryAttempts ?? 3,
    retryBaseDelayMs: opts?.retryBaseDelayMs ?? 500,
  };
  // Fetch a broad slice of markets from Gamma and filter client-side.
  const url = new URL("https://gamma-api.polymarket.com/markets");
  url.searchParams.set("limit", "400");
  url.searchParams.set("active", "true");
  url.searchParams.set("closed", "false");

  const res = await fetchWithRetry(url.toString(), { method: "GET" }, effective);
  if (!res.ok) {
    throw new Error(
      `Gamma markets request failed: ${res.status} ${res.statusText}`,
    );
  }
  const all = (await res.json()) as PolymarketMarket[];

  const live = all.filter((m) => m.active !== false && m.closed !== true && m.archived !== true);
  const scored = live
    .map((market) => ({
      market,
      relevance: marketCategoryScore(market, category),
      activity: marketActivityScore(market),
    }))
    .filter((entry) => entry.relevance > 0)
    .sort((left, right) => {
      if (right.relevance !== left.relevance) return right.relevance - left.relevance;
      return right.activity - left.activity;
    });

  const deduped = new Map<string, (typeof scored)[number]>();
  for (const entry of scored) {
    const m = entry.market;
    const cid = m.conditionId ?? m.condition_id ?? "";
    const dedupeKey =
      cid ||
      (m.slug ? `slug:${m.slug.toLowerCase()}` : `title:${primaryMarketTitle(m, cid).toLowerCase()}`);
    if (!deduped.has(dedupeKey)) {
      deduped.set(dedupeKey, entry);
    }
  }

  const top = Array.from(deduped.values()).slice(0, Math.max(1, limit));
  return top.map(({ market: m }) => {
    const cid = m.conditionId ?? m.condition_id ?? "";
    const tokens = parseTokens(m.tokens);
    const clobTokenIds = parseStringArray(m.clobTokenIds);
    const outcomes = parseStringArray(m.outcomes);
    const outcomePrices = parseNumberArray(m.outcomePrices);
    const fallbackTokenIds = tokens.map((t) => t.token_id).filter(Boolean);
    const fallbackOutcomes = tokens.map((t) => t.outcome).filter(Boolean);
    const eventSlug = m.events?.find((e) => typeof e.slug === "string" && e.slug.trim().length > 0)?.slug;

    return {
      id: m.id ?? cid,
      title: primaryMarketTitle(m, cid),
      conditionId: cid,
      clobTokenIds: clobTokenIds.length > 0 ? clobTokenIds : fallbackTokenIds,
      outcomes: outcomes.length > 0 ? outcomes : fallbackOutcomes,
      outcomePrices,
      volume24hr: m.volume24hr ?? 0,
      slug: eventSlug ?? m.slug,
    };
  });
}

export async function fetchOrderBooks(
  tokenIds: string[],
  opts?: Partial<PolymarketFetchOptions>,
): Promise<OrderBook[]> {
  const effective: PolymarketFetchOptions = {
    timeoutMs: opts?.timeoutMs ?? 20000,
    retryAttempts: opts?.retryAttempts ?? 3,
    retryBaseDelayMs: opts?.retryBaseDelayMs ?? 500,
  };
  const unique = Array.from(new Set(tokenIds)).filter(Boolean);
  if (unique.length === 0) return [];

  if (unique.length === 1) {
    const url = `${CLOB_API_BASE}/book?token_id=${encodeURIComponent(unique[0])}`;
    const res = await fetchWithRetry(url, { method: "GET" }, effective);
    if (!res.ok) return [];
    const one = (await res.json()) as OrderBook;
    return [one];
  }

  const res = await fetchWithRetry(
    `${CLOB_API_BASE}/books`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(unique.map((token_id) => ({ token_id }))),
    },
    effective,
  );
  if (!res.ok) return [];
  const data = (await res.json()) as OrderBook[];
  return Array.isArray(data) ? data : [];
}

/**
 * Derive mid price from order book (best bid + best ask) / 2.
 */
export function midPriceFromBook(book: OrderBook): number {
  const bestBid = book.bids?.[0]?.price;
  const bestAsk = book.asks?.[0]?.price;
  if (bestBid != null && bestAsk != null) {
    const bid = parseNum(bestBid);
    const ask = parseNum(bestAsk);
    return clamp((bid + ask) / 2, 0.01, 0.99);
  }
  const last = book.last_trade_price;
  if (last != null) return clamp(parseNum(last), 0.01, 0.99);
  return 0.5;
}

type OrderBookStats = {
  bestBidPrice?: number;
  bestAskPrice?: number;
  spread?: number;
  topBidDepth?: number;
  topAskDepth?: number;
};

function orderBookStatsFromBook(book: OrderBook, topLevels = 3): OrderBookStats {
  const bestBidRaw = book.bids?.[0]?.price;
  const bestAskRaw = book.asks?.[0]?.price;

  const bestBid = bestBidRaw != null ? clamp(parseNum(bestBidRaw), 0.01, 0.99) : undefined;
  const bestAsk = bestAskRaw != null ? clamp(parseNum(bestAskRaw), 0.01, 0.99) : undefined;

  const spread = bestBid != null && bestAsk != null ? round(Math.max(0, bestAsk - bestBid), 6) : undefined;

  const topBidDepth =
    book.bids && book.bids.length > 0
      ? book.bids.slice(0, topLevels).reduce((sum, level) => sum + parseNum(level.size), 0)
      : undefined;
  const topAskDepth =
    book.asks && book.asks.length > 0
      ? book.asks.slice(0, topLevels).reduce((sum, level) => sum + parseNum(level.size), 0)
      : undefined;

  return {
    bestBidPrice: bestBid,
    bestAskPrice: bestAsk,
    spread,
    topBidDepth,
    topAskDepth,
  };
}

function invertNoSideStats(stats: OrderBookStats | undefined): OrderBookStats | undefined {
  if (!stats) return undefined;
  // If token represents NO probability pNo, then YES probability pYes = 1 - pNo.
  // Invert best bid/ask and swap depth sides.
  const bestBidPrice = stats.bestAskPrice != null ? round(1 - stats.bestAskPrice, 6) : undefined;
  const bestAskPrice = stats.bestBidPrice != null ? round(1 - stats.bestBidPrice, 6) : undefined;
  const spread = stats.spread != null ? stats.spread : undefined;
  return {
    bestBidPrice: bestBidPrice != null ? clamp(bestBidPrice, 0.01, 0.99) : undefined,
    bestAskPrice: bestAskPrice != null ? clamp(bestAskPrice, 0.01, 0.99) : undefined,
    spread,
    topBidDepth: stats.topAskDepth,
    topAskDepth: stats.topBidDepth,
  };
}

/**
 * Normalize Polymarket positions into PositionRecord[] (one row per conditionId).
 * Aggregates YES and NO outcome rows into yesShares / noShares; uses weighted avg for entryPrice.
 * Uses virtual portfolio id 1 ("Polymarket Account") and synthetic numeric ids.
 */
export function normalizePolymarketPositions(
  polyPositions: PolymarketPosition[],
): PositionRecord[] {
  type Agg = { yesShares: number; noShares: number; yesCost: number; noCost: number; title?: string };
  const byCondition = new Map<string, Agg>();

  for (const p of polyPositions) {
    const size = Math.max(0, Number(p.size) || 0);
    const avg = clamp(Number(p.avgPrice) ?? 0.5, 0.01, 0.99);
    const outcome = (p.outcome || "").toLowerCase();
    let agg = byCondition.get(p.conditionId);
    if (!agg) {
      agg = { yesShares: 0, noShares: 0, yesCost: 0, noCost: 0, title: p.title };
      byCondition.set(p.conditionId, agg);
    }
    if (outcome === "yes") {
      agg.yesShares += size;
      agg.yesCost += size * avg;
    } else {
      agg.noShares += size;
      agg.noCost += size * avg;
    }
  }

  const VIRTUAL_PORTFOLIO_ID = 1;
  const records: PositionRecord[] = [];
  let syntheticId = 1;
  for (const [marketId, agg] of Array.from(byCondition.entries())) {
    const totalShares = agg.yesShares + agg.noShares;
    const totalCost = agg.yesCost + agg.noCost;
    const entryPrice = totalShares > 0 ? clamp(totalCost / totalShares, 0.01, 0.99) : 0.5;
    records.push({
      id: syntheticId++,
      portfolioId: VIRTUAL_PORTFOLIO_ID,
      marketId,
      yesShares: round(agg.yesShares, 2),
      noShares: round(agg.noShares, 2),
      entryPrice: round(entryPrice, 4),
    });
  }
  return records;
}

export function normalizePolymarketMarkets(
  polyMarkets: PolymarketMarket[],
  positions: PositionRecord[],
  orderBooksByTokenId: Map<string, OrderBook>,
  tokenIdToConditionId: Map<string, string>,
  tokenIdToOutcome?: Map<string, string>,
): MarketSnapshot[] {
  const marketByCondition = new Map<string, PolymarketMarket>();
  const cidKey = (m: PolymarketMarket) => m.conditionId ?? m.condition_id ?? "";
  for (const m of polyMarkets) {
    const cid = cidKey(m);
    if (cid) marketByCondition.set(cid, m);
  }

  const posByMarket = new Map<string, PositionRecord[]>();
  for (const p of positions) {
    const list = posByMarket.get(p.marketId) ?? [];
    list.push(p);
    posByMarket.set(p.marketId, list);
  }

  const snapshots: MarketSnapshot[] = [];
  const now = new Date().toISOString();

  for (const [conditionId, marketPositions] of Array.from(posByMarket.entries())) {
    const totalYesShares = marketPositions.reduce((sum: number, p: PositionRecord) => sum + p.yesShares, 0);
    const totalNoShares = marketPositions.reduce((sum: number, p: PositionRecord) => sum + p.noShares, 0);
    const totalShares = totalYesShares + totalNoShares;


    let yesPrice = 0.5;
    let yesStats: OrderBookStats | undefined;
    let fallbackNoBook: OrderBook | undefined;
    let fallbackNoTokenId: string | undefined;

    for (const [tokenId, condition] of Array.from(tokenIdToConditionId.entries())) {
      if (condition !== conditionId) continue;
      const book = orderBooksByTokenId.get(tokenId);
      if (!book) continue;

      const outcome = tokenIdToOutcome?.get(tokenId)?.toLowerCase();
      if (outcome === "yes") {
        yesPrice = midPriceFromBook(book);
        yesStats = orderBookStatsFromBook(book);
        break;
      }

      if (!fallbackNoBook) {
        fallbackNoBook = book;
        fallbackNoTokenId = tokenId;
      }
    }

    if (!yesStats && fallbackNoBook) {
      const stats = orderBookStatsFromBook(fallbackNoBook);
      yesStats = invertNoSideStats(stats);
      const noMid = midPriceFromBook(fallbackNoBook);
      yesPrice = clamp(1 - noMid, 0.01, 0.99);
      void fallbackNoTokenId;
    }
    yesPrice = clamp(yesPrice, 0.01, 0.99);
    const noPrice = round(1 - yesPrice, 4);
    const currentPrice = yesPrice;

    const yesExposure = totalYesShares * currentPrice;
    const noExposure = totalNoShares * (1 - currentPrice);
    const openInterest = yesExposure + noExposure;
    const netExposure = yesExposure - noExposure;
    const confidence =
      totalShares > 0 ? Math.abs(totalYesShares - totalNoShares) / totalShares : 0;
    const confidenceBreakdown = {
      imbalanceRatio: round(confidence, 4),
      yesShares: round(totalYesShares, 2),
      noShares: round(totalNoShares, 2),
      totalShares: round(totalShares, 2),
      bookMidAvailable: !!yesStats,
      note: yesStats
        ? "Confidence equals YES/NO share imbalance ratio; mid price from YES order book."
        : "Confidence from share imbalance; YES mid may be inferred from NO token book.",
    };

    const meta = marketByCondition.get(conditionId);
    const question =
      meta?.question ?? meta?.title ?? `Market ${conditionId.slice(0, 10)}...`;
    const polymarketUrl = meta?.slug
      ? `https://polymarket.com/event/${meta.slug}`
      : undefined;

    snapshots.push({
      id: conditionId,
      question,
      active: totalShares > 0,
      polymarketUrl,
      currentPrice: round(currentPrice, 4),
      yesPrice: round(yesPrice, 4),
      noPrice,
      totalYesShares: round(totalYesShares, 2),
      totalNoShares: round(totalNoShares, 2),
      totalShares: round(totalShares, 2),
      yesExposure: round(yesExposure, 2),
      noExposure: round(noExposure, 2),
      netExposure: round(netExposure, 2),
      openInterest: round(openInterest, 2),
      liquidityScore: 0, // optional: set from meta.liquidity if needed
      confidence: round(confidence, 4),
      confidenceBreakdown,
      bestBidPrice: yesStats?.bestBidPrice != null ? round(yesStats.bestBidPrice, 4) : undefined,
      bestAskPrice: yesStats?.bestAskPrice != null ? round(yesStats.bestAskPrice, 4) : undefined,
      spread: yesStats?.spread != null ? round(yesStats.spread, 6) : undefined,
      topBidDepth: yesStats?.topBidDepth != null ? round(yesStats.topBidDepth, 4) : undefined,
      topAskDepth: yesStats?.topAskDepth != null ? round(yesStats.topAskDepth, 4) : undefined,
      updatedAt: now,
    });
  }

  const maxOi = snapshots.reduce((m, s) => Math.max(m, s.openInterest), 0);
  for (const s of snapshots) {
    s.liquidityScore = maxOi > 0 ? round(s.openInterest / maxOi, 4) : 0;
  }

  return snapshots.sort((a, b) => b.openInterest - a.openInterest);
}


export function getTokenIdsFromPositions(polyPositions: PolymarketPosition[]): {
  tokenIds: string[];
  tokenToCondition: Map<string, string>;
  tokenToOutcome: Map<string, "yes" | "no">;
} {
  const tokenIds: string[] = [];
  const tokenToCondition = new Map<string, string>();
  const tokenToOutcome = new Map<string, "yes" | "no">();
  for (let i = 0; i < polyPositions.length; i++) {
    const p = polyPositions[i];
    if (p.asset) {
      tokenIds.push(p.asset);
      tokenToCondition.set(p.asset, p.conditionId);
      const outcome = (p.outcome || "").toLowerCase();
      if (outcome === "yes" || outcome.includes("yes")) tokenToOutcome.set(p.asset, "yes");
      else if (outcome === "no" || outcome.includes("no")) tokenToOutcome.set(p.asset, "no");
    }
  }
  return { tokenIds, tokenToCondition, tokenToOutcome };
}

/**
 * Resolve condition IDs to YES/NO token IDs for order building.
 * Fetches Gamma API markets and maps conditionId -> { yesTokenId, noTokenId }.
 */
export async function getMarketTokenIds(
  conditionIds: string[],
  opts?: Partial<PolymarketFetchOptions>,
): Promise<Record<string, { yesTokenId: string; noTokenId: string }>> {
  const effective: PolymarketFetchOptions = {
    timeoutMs: opts?.timeoutMs ?? 20000,
    retryAttempts: opts?.retryAttempts ?? 3,
    retryBaseDelayMs: opts?.retryBaseDelayMs ?? 500,
  };
  const result: Record<string, { yesTokenId: string; noTokenId: string }> = {};
  const uniqueConditionIds = Array.from(new Set(conditionIds.map((id) => id.trim()).filter(Boolean)));
  if (uniqueConditionIds.length === 0) return result;

  const normalizeOutcome = (value: string) => value.trim().toLowerCase();
  const extractTokenPair = (market: PolymarketMarket): { yesTokenId: string; noTokenId: string } => {
    let yesTokenId = "";
    let noTokenId = "";

    const tokens = parseTokens(market.tokens);
    for (const token of tokens) {
      const outcome = normalizeOutcome(token.outcome || "");
      if (!yesTokenId && (outcome === "yes" || outcome.includes("yes"))) {
        yesTokenId = token.token_id;
      } else if (!noTokenId && (outcome === "no" || outcome.includes("no"))) {
        noTokenId = token.token_id;
      }
    }

    if (!yesTokenId || !noTokenId) {
      const clobTokenIds = parseStringArray(market.clobTokenIds);
      const outcomes = parseStringArray(market.outcomes);
      for (let i = 0; i < Math.min(clobTokenIds.length, outcomes.length); i += 1) {
        const outcome = normalizeOutcome(outcomes[i] || "");
        if (!yesTokenId && (outcome === "yes" || outcome.includes("yes"))) {
          yesTokenId = clobTokenIds[i];
        } else if (!noTokenId && (outcome === "no" || outcome.includes("no"))) {
          noTokenId = clobTokenIds[i];
        }
      }
    }

    return { yesTokenId, noTokenId };
  };

  async function fetchGammaMarketsByConditionIds(batch: string[]): Promise<PolymarketMarket[]> {
    const attempts: string[] = [`[${batch.join(",")}]`, batch.join(",")];
    for (const condIdsValue of attempts) {
      const url = new URL("https://gamma-api.polymarket.com/markets");
      url.searchParams.set("condition_ids", condIdsValue);
      try {
        const res = await fetchWithRetry(url.toString(), { method: "GET" }, effective);
        if (!res.ok) continue;
        const data = (await res.json()) as PolymarketMarket[];
        if (Array.isArray(data) && data.length > 0) return data;
      } catch {
        // try next encoding
      }
    }
    return [];
  }

  try {
    const pageLimit = 50;
    for (let i = 0; i < uniqueConditionIds.length; i += pageLimit) {
      const batch = uniqueConditionIds.slice(i, i + pageLimit);
      const markets = await fetchGammaMarketsByConditionIds(batch);
      for (const market of markets) {
        const cid = market.conditionId ?? market.condition_id ?? "";
        if (!cid) continue;
        const pair = extractTokenPair(market);
        if (pair.yesTokenId || pair.noTokenId) {
          result[cid] = pair;
        }
      }
    }
  } catch {
    // ignore; best-effort endpoint
  }

  return result;
}
