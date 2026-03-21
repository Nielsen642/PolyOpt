import type { Portfolio } from "@shared/schema";
import type {
  CorrelationMatrix,
  DashboardData,
  MarketSnapshot,
  PortfolioDetail,
  PortfolioSummary,
  Position,
  PositionAnalytics,
  PositionRecord,
  PortfolioRecord,
  ProRiskReport,
} from "@shared/schema";

const KNOWN_MARKET_QUESTIONS: Record<string, string> = {
  "0x123": "Will Bitcoin hit $100k this cycle?",
  "0x456": "Will the Fed cut rates at the next meeting?",
  "0x789": "Will ETH outperform BTC this quarter?",
  "0xabc": "Will the S&P 500 close higher this month?",
};

function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function toNumber(value: string | number): number {
  return typeof value === "number" ? value : Number(value);
}

function fallbackQuestion(marketId: string): string {
  if (KNOWN_MARKET_QUESTIONS[marketId]) {
    return KNOWN_MARKET_QUESTIONS[marketId];
  }

  return `Derived market ${marketId.slice(0, 8)}`;
}

export function normalizePortfolio(portfolio: Portfolio): PortfolioRecord {
  return {
    id: portfolio.id,
    name: portfolio.name,
  };
}

export function normalizePosition(position: Position): PositionRecord {
  return {
    id: position.id,
    portfolioId: position.portfolioId,
    marketId: position.marketId,
    yesShares: toNumber(position.yesShares),
    noShares: toNumber(position.noShares),
    entryPrice: clamp(toNumber(position.price), 0.01, 0.99),
  };
}

export function buildMarketSnapshots(positions: PositionRecord[]): MarketSnapshot[] {
  const grouped = new Map<string, PositionRecord[]>();

  for (const position of positions) {
    const list = grouped.get(position.marketId) ?? [];
    list.push(position);
    grouped.set(position.marketId, list);
  }

  const rawMarkets = Array.from(grouped.entries()).map(([marketId, marketPositions]) => {
    const totalYesShares = marketPositions.reduce((sum, item) => sum + item.yesShares, 0);
    const totalNoShares = marketPositions.reduce((sum, item) => sum + item.noShares, 0);
    const totalShares = totalYesShares + totalNoShares;
    const weightedPriceNumerator = marketPositions.reduce(
      (sum, item) => sum + item.entryPrice * (item.yesShares + item.noShares),
      0,
    );
    const currentPrice = clamp(
      totalShares > 0 ? weightedPriceNumerator / totalShares : 0.5,
      0.01,
      0.99,
    );
    const yesExposure = totalYesShares * currentPrice;
    const noExposure = totalNoShares * (1 - currentPrice);
    const openInterest = yesExposure + noExposure;
    const netExposure = yesExposure - noExposure;
    const confidence = totalShares > 0 ? Math.abs(totalYesShares - totalNoShares) / totalShares : 0;

    return {
      id: marketId,
      question: fallbackQuestion(marketId),
      active: totalShares > 0,
      currentPrice,
      yesPrice: currentPrice,
      noPrice: 1 - currentPrice,
      totalYesShares,
      totalNoShares,
      totalShares,
      yesExposure,
      noExposure,
      netExposure,
      openInterest,
      confidence,
    };
  });

  const maxOpenInterest = rawMarkets.reduce((max, item) => Math.max(max, item.openInterest), 0);

  return rawMarkets
    .map((market) => ({
      ...market,
      currentPrice: round(market.currentPrice),
      yesPrice: round(market.yesPrice),
      noPrice: round(market.noPrice),
      totalYesShares: round(market.totalYesShares, 2),
      totalNoShares: round(market.totalNoShares, 2),
      totalShares: round(market.totalShares, 2),
      yesExposure: round(market.yesExposure, 2),
      noExposure: round(market.noExposure, 2),
      netExposure: round(market.netExposure, 2),
      openInterest: round(market.openInterest, 2),
      liquidityScore: round(maxOpenInterest > 0 ? market.openInterest / maxOpenInterest : 0, 4),
      confidence: round(market.confidence, 4),
      updatedAt: new Date().toISOString(),
    }))
    .sort((left, right) => right.openInterest - left.openInterest);
}

function determineSide(position: PositionRecord): PositionAnalytics["side"] {
  if (position.yesShares > 0 && position.noShares > 0) {
    return "mixed";
  }
  if (position.yesShares > 0) {
    return "yes";
  }
  if (position.noShares > 0) {
    return "no";
  }
  return "flat";
}

export function buildPortfolioSummary(
  portfolio: PortfolioRecord,
  positions: PositionAnalytics[],
): PortfolioSummary {
  const grossExposure = positions.reduce((sum, item) => sum + item.currentValue, 0);
  const totalCostBasis = positions.reduce((sum, item) => sum + item.costBasis, 0);
  const netExposure = positions.reduce((sum, item) => sum + item.netExposure, 0);
  const unrealizedPnl = positions.reduce((sum, item) => sum + item.pnl, 0);
  const yesExposure = positions.reduce((sum, item) => sum + item.yesExposure, 0);
  const noExposure = positions.reduce((sum, item) => sum + item.noExposure, 0);
  const largestPositionWeight = positions.reduce(
    (max, item) => Math.max(max, item.allocationWeight),
    0,
  );
  const diversificationPenalty = positions.reduce(
    (sum, item) => sum + item.allocationWeight ** 2,
    0,
  );
  const diversificationScore = positions.length > 0 ? 1 - diversificationPenalty : 0;
  const uniqueMarkets = new Set(positions.map((item) => item.marketId));

  return {
    portfolioId: portfolio.id,
    name: portfolio.name,
    positionCount: positions.length,
    marketCount: uniqueMarkets.size,
    totalCostBasis: round(totalCostBasis, 2),
    grossExposure: round(grossExposure, 2),
    netExposure: round(netExposure, 2),
    unrealizedPnl: round(unrealizedPnl, 2),
    unrealizedPnlPct: round(totalCostBasis > 0 ? unrealizedPnl / totalCostBasis : 0, 4),
    yesExposure: round(yesExposure, 2),
    noExposure: round(noExposure, 2),
    largestPositionWeight: round(largestPositionWeight, 4),
    diversificationScore: round(clamp(diversificationScore, 0, 1), 4),
  };
}

export function buildPortfolioDetail(
  portfolio: PortfolioRecord,
  positions: PositionRecord[],
  markets: MarketSnapshot[],
): PortfolioDetail {
  const marketMap = new Map(markets.map((market) => [market.id, market]));

  const preliminary = positions.map((position) => {
    const market = marketMap.get(position.marketId);
    const currentPrice = market?.currentPrice ?? position.entryPrice;
    const currentValue =
      position.yesShares * currentPrice + position.noShares * (1 - currentPrice);
    const costBasis =
      position.yesShares * position.entryPrice + position.noShares * (1 - position.entryPrice);
    const pnl = currentValue - costBasis;
    const yesExposure = position.yesShares * currentPrice;
    const noExposure = position.noShares * (1 - currentPrice);
    const netExposure = yesExposure - noExposure;

    return {
      ...position,
      question: market?.question ?? fallbackQuestion(position.marketId),
      polymarketUrl: market?.polymarketUrl,
      currentPrice,
      costBasis,
      currentValue,
      pnl,
      yesExposure,
      noExposure,
      netExposure,
      side: determineSide(position),
    };
  });

  const totalValue = preliminary.reduce((sum, item) => sum + item.currentValue, 0);

  const analytics: PositionAnalytics[] = preliminary
    .map((position) => ({
      ...position,
      currentPrice: round(position.currentPrice),
      costBasis: round(position.costBasis, 2),
      currentValue: round(position.currentValue, 2),
      pnl: round(position.pnl, 2),
      pnlPct: round(position.costBasis > 0 ? position.pnl / position.costBasis : 0, 4),
      yesExposure: round(position.yesExposure, 2),
      noExposure: round(position.noExposure, 2),
      netExposure: round(position.netExposure, 2),
      allocationWeight: round(totalValue > 0 ? position.currentValue / totalValue : 0, 4),
    }))
    .sort((left, right) => right.currentValue - left.currentValue);

  return {
    portfolio,
    summary: buildPortfolioSummary(portfolio, analytics),
    positions: analytics,
  };
}

export function buildDashboard(
  portfolios: PortfolioRecord[],
  positions: PositionRecord[],
  markets: MarketSnapshot[],
): DashboardData {
  const portfoliosWithSummary = portfolios.map((portfolio) => {
    const detail = buildPortfolioDetail(
      portfolio,
      positions.filter((position) => position.portfolioId === portfolio.id),
      markets,
    );

    return {
      portfolio,
      summary: detail.summary,
    };
  });

  const overview = {
    totalPortfolios: portfolios.length,
    totalPositions: positions.length,
    totalMarkets: markets.length,
    totalGrossExposure: round(
      portfoliosWithSummary.reduce((sum, item) => sum + item.summary.grossExposure, 0),
      2,
    ),
    totalNetExposure: round(
      portfoliosWithSummary.reduce((sum, item) => sum + item.summary.netExposure, 0),
      2,
    ),
    totalUnrealizedPnl: round(
      portfoliosWithSummary.reduce((sum, item) => sum + item.summary.unrealizedPnl, 0),
      2,
    ),
  };

  return {
    overview,
    portfolios: portfoliosWithSummary,
  };
}

function cosineSimilarity(left: number[], right: number[]): number {
  const numerator = left.reduce((sum, value, index) => sum + value * right[index], 0);
  const leftMagnitude = Math.sqrt(left.reduce((sum, value) => sum + value ** 2, 0));
  const rightMagnitude = Math.sqrt(right.reduce((sum, value) => sum + value ** 2, 0));

  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return 0;
  }

  return numerator / (leftMagnitude * rightMagnitude);
}

export type CorrelationVectorWeights = {
  price: number;
  direction: number;
  openInterest: number;
  totalShares: number;
  confidence: number;
};

export function buildCorrelationMatrix(
  markets: MarketSnapshot[],
  weights: Partial<CorrelationVectorWeights> = {},
): CorrelationMatrix {
  if (markets.length === 0) {
    return {
      markets: [],
      matrix: [],
    };
  }

  const maxOpenInterest = Math.max(...markets.map((market) => market.openInterest), 1);
  const maxTotalShares = Math.max(...markets.map((market) => market.totalShares), 1);

  const w = {
    price: weights.price ?? 1,
    direction: weights.direction ?? 1,
    openInterest: weights.openInterest ?? 1,
    totalShares: weights.totalShares ?? 1,
    confidence: weights.confidence ?? 1,
  };

  const vectors = markets.map((market) => {
    const direction = market.openInterest > 0 ? market.netExposure / market.openInterest : 0;
    return [
      (market.currentPrice - 0.5) * w.price,
      direction * w.direction,
      (market.openInterest / maxOpenInterest) * w.openInterest,
      (market.totalShares / maxTotalShares) * w.totalShares,
      market.confidence * w.confidence,
    ];
  });

  const matrix = markets.map((_leftMarket, leftIndex) =>
    markets.map((_rightMarket, rightIndex) => {
      if (leftIndex === rightIndex) {
        return 1;
      }

      return round(clamp(cosineSimilarity(vectors[leftIndex], vectors[rightIndex]), -1, 1), 4);
    }),
  );

  return {
    markets: markets.map((market) => ({
      id: market.id,
      label: market.question,
      currentPrice: market.currentPrice,
      netExposure: market.netExposure,
      openInterest: market.openInterest,
      totalShares: market.totalShares,
      confidence: market.confidence,
      polymarketUrl: market.polymarketUrl,
    })),
    matrix,
  };
}
export function buildProPortfolioRiskReport(
  detail: PortfolioDetail,
  markets: MarketSnapshot[],
): ProRiskReport {
  const gross = Math.max(detail.summary.grossExposure, 1e-9);
  const mById = new Map(markets.map((m) => [m.id, m]));

  const topRiskByExposure = [...detail.positions]
    .sort((a, b) => Math.abs(b.netExposure) - Math.abs(a.netExposure))
    .slice(0, 12)
    .map((p) => {
      const mk = mById.get(p.marketId);
      return {
        marketId: p.marketId,
        question: p.question,
        netExposure: round(p.netExposure, 2),
        shareOfGross: round(Math.abs(p.netExposure) / gross, 4),
        currentPrice: round(p.currentPrice, 4),
        spread: mk?.spread != null ? round(mk.spread, 6) : undefined,
      };
    });

  let longExp = 0;
  let shortExp = 0;
  for (const p of detail.positions) {
    if (p.netExposure >= 0) longExp += p.netExposure;
    else shortExp += p.netExposure;
  }

  const clusterAttribution = [
    {
      name: "Net-long sleeve",
      netExposure: round(longExp, 2),
      weightOfGross: round(Math.max(longExp, 0) / gross, 4),
    },
    {
      name: "Net-short sleeve",
      netExposure: round(shortExp, 2),
      weightOfGross: round(Math.abs(Math.min(shortExp, 0)) / gross, 4),
    },
  ];

  const liquidityWatchlist = [...markets]
    .sort((a, b) => b.openInterest - a.openInterest)
    .slice(0, 16)
    .map((m) => {
      const sp = m.spread ?? 0;
      let flag: "ok" | "wide_spread" | "thin_book" = "ok";
      if (sp > 0.08) flag = "wide_spread";
      else if ((m.topBidDepth ?? 0) + (m.topAskDepth ?? 0) < 50 && m.openInterest > 500) {
        flag = "thin_book";
      }
      return {
        marketId: m.id,
        question: m.question,
        openInterest: round(m.openInterest, 2),
        spread: m.spread != null ? round(m.spread, 6) : undefined,
        flag,
      };
    });

  const weights = detail.positions.map((p) => p.allocationWeight);
  const hhi = weights.reduce((s, w) => s + w * w, 0);
  const largestWeight = weights.length > 0 ? Math.max(...weights) : 0;
  const interpretation =
    hhi > 0.25
      ? "Concentrated book — few markets dominate portfolio variance."
      : hhi > 0.15
        ? "Moderate concentration — monitor top contributors."
        : "Relatively diversified by allocation weight.";

  return {
    generatedAt: new Date().toISOString(),
    disclosure:
      "CVaR, stress metrics, and correlation scores are model outputs derived from engineered features and simulated scenarios. They do not predict realized PnL or guarantee execution. Use for decision support and risk framing only.",
    topRiskByExposure,
    clusterAttribution,
    liquidityWatchlist,
    concentration: {
      herfindahl: round(hhi, 4),
      largestWeight: round(largestWeight, 4),
      interpretation,
    },
  };
}
