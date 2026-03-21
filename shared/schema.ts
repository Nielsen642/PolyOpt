import { pgTable, text, serial, numeric, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  passwordHash: text("password_hash").notNull(),
  walletAddress: text("wallet_address"),
  role: text("role").notNull().default("operator"),
});

export const portfolios = pgTable("portfolios", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(),
});

export const positions = pgTable("positions", {
  id: serial("id").primaryKey(),
  portfolioId: integer("portfolio_id").notNull(),
  marketId: text("market_id").notNull(),
  yesShares: numeric("yes_shares").notNull(),
  noShares: numeric("no_shares").notNull(),
  price: numeric("price").notNull(),
});

export const userAlertState = pgTable("user_alert_state", {
  userId: integer("user_id").primaryKey(),
  rulesJson: text("rules_json").notNull().default("[]"),
  eventsJson: text("events_json").notNull().default("[]"),
  updatedAt: text("updated_at").notNull(),
});

export const insertPortfolioSchema = createInsertSchema(portfolios).omit({ id: true });
export const insertPositionSchema = createInsertSchema(positions).omit({ id: true });
export const insertUserSchema = createInsertSchema(users).omit({ id: true });

export type Portfolio = typeof portfolios.$inferSelect;
export type InsertPortfolio = z.infer<typeof insertPortfolioSchema>;

export type Position = typeof positions.$inferSelect;
export type InsertPosition = z.infer<typeof insertPositionSchema>;

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type UserAlertStateRow = typeof userAlertState.$inferSelect;

export const portfolioSchema = z.object({
  id: z.number(),
  name: z.string().min(1),
});

export const positionRecordSchema = z.object({
  id: z.number(),
  portfolioId: z.number(),
  marketId: z.string().min(1),
  yesShares: z.number().nonnegative(),
  noShares: z.number().nonnegative(),
  entryPrice: z.number().min(0).max(1),
});

export const confidenceBreakdownSchema = z.object({
  /** |yes - no| / totalShares — same numeric basis as confidence in this app */
  imbalanceRatio: z.number().min(0).max(1),
  yesShares: z.number().nonnegative(),
  noShares: z.number().nonnegative(),
  totalShares: z.number().nonnegative(),
  bookMidAvailable: z.boolean(),
  note: z.string(),
});

export const marketSnapshotSchema = z.object({
  id: z.string(),
  question: z.string(),
  active: z.boolean(),
  polymarketUrl: z.string().url().optional(),
  currentPrice: z.number().min(0).max(1),
  yesPrice: z.number().min(0).max(1),
  noPrice: z.number().min(0).max(1),
  bestBidPrice: z.number().min(0).max(1).optional(),
  bestAskPrice: z.number().min(0).max(1).optional(),
  spread: z.number().min(0).optional(),
  topBidDepth: z.number().nonnegative().optional(),
  topAskDepth: z.number().nonnegative().optional(),
  totalYesShares: z.number().nonnegative(),
  totalNoShares: z.number().nonnegative(),
  totalShares: z.number().nonnegative(),
  yesExposure: z.number(),
  noExposure: z.number(),
  netExposure: z.number(),
  openInterest: z.number().nonnegative(),
  liquidityScore: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  confidenceBreakdown: confidenceBreakdownSchema.optional(),
  serverAssembledAt: z.string().optional(),
  updatedAt: z.string(),
});

export const marketsFeedMetaSchema = z.object({
  assembledAt: z.string(),
  staleWarningAfterMs: z.number().int().nonnegative(),
  proMode: z.boolean(),
  demoMode: z.boolean(),
  dataWalletFingerprint: z.string().nullable(),
  sources: z.object({
    dataApi: z.enum(["ok", "unconfigured", "error"]),
    gamma: z.enum(["ok", "partial", "skipped"]),
    clob: z.enum(["ok", "partial", "none"]),
  }),
});

export const marketsListResponseSchema = z.object({
  markets: z.array(marketSnapshotSchema),
  meta: marketsFeedMetaSchema,
});

export const alertDeliveryChannelsSchema = z.object({
  inApp: z.boolean(),
  browser: z.boolean(),
  email: z.boolean(),
  webhook: z.boolean(),
  mobilePush: z.boolean(),
});

export const alertRuleApiSchema = z.object({
  id: z.string().min(1),
  type: z.enum([
    "price_move",
    "time_window_move",
    "exposure_limit",
    "market_drawdown",
    "portfolio_drawdown",
    "liquidity_drop",
  ]),
  label: z.string().min(1),
  enabled: z.boolean(),
  marketId: z.string().optional(),
  threshold: z.number(),
  timeWindowMinutes: z.number().nonnegative(),
  cooldownMinutes: z.number().nonnegative(),
  severity: z.enum(["info", "warning", "critical"]),
  channels: alertDeliveryChannelsSchema,
  tag: z.string().optional(),
  assetClass: z.enum(["crypto", "sports", "politics", "other"]).optional(),
  portfolioName: z.string().optional(),
});

export const alertEventApiSchema = z.object({
  id: z.string().min(1),
  ruleId: z.string().optional(),
  severity: z.enum(["info", "warning", "critical"]),
  channels: alertDeliveryChannelsSchema,
  title: z.string().min(1),
  description: z.string(),
  createdAt: z.string(),
});

export const proAlertStatePutSchema = z.object({
  rules: z.array(alertRuleApiSchema),
  events: z.array(alertEventApiSchema).max(500),
});

export const proRiskReportSchema = z.object({
  generatedAt: z.string(),
  disclosure: z.string(),
  topRiskByExposure: z.array(
    z.object({
      marketId: z.string(),
      question: z.string(),
      netExposure: z.number(),
      shareOfGross: z.number(),
      currentPrice: z.number(),
      spread: z.number().optional(),
    }),
  ),
  clusterAttribution: z.array(
    z.object({
      name: z.string(),
      netExposure: z.number(),
      weightOfGross: z.number(),
    }),
  ),
  liquidityWatchlist: z.array(
    z.object({
      marketId: z.string(),
      question: z.string(),
      openInterest: z.number(),
      spread: z.number().optional(),
      flag: z.enum(["ok", "wide_spread", "thin_book"]),
    }),
  ),
  concentration: z.object({
    herfindahl: z.number(),
    largestWeight: z.number(),
    interpretation: z.string(),
  }),
});

export const positionAnalyticsSchema = positionRecordSchema.extend({
  question: z.string(),
  polymarketUrl: z.string().url().optional(),
  currentPrice: z.number().min(0).max(1),
  costBasis: z.number(),
  currentValue: z.number(),
  pnl: z.number(),
  pnlPct: z.number(),
  yesExposure: z.number(),
  noExposure: z.number(),
  netExposure: z.number(),
  allocationWeight: z.number().min(0).max(1),
  side: z.enum(["yes", "no", "mixed", "flat"]),
});

export const portfolioSummarySchema = z.object({
  portfolioId: z.number(),
  name: z.string(),
  positionCount: z.number().int().nonnegative(),
  marketCount: z.number().int().nonnegative(),
  totalCostBasis: z.number(),
  grossExposure: z.number(),
  netExposure: z.number(),
  unrealizedPnl: z.number(),
  unrealizedPnlPct: z.number(),
  yesExposure: z.number(),
  noExposure: z.number(),
  largestPositionWeight: z.number().min(0).max(1),
  diversificationScore: z.number().min(0).max(1),
});

export const dashboardOverviewSchema = z.object({
  totalPortfolios: z.number().int().nonnegative(),
  totalPositions: z.number().int().nonnegative(),
  totalMarkets: z.number().int().nonnegative(),
  totalGrossExposure: z.number(),
  totalNetExposure: z.number(),
  totalUnrealizedPnl: z.number(),
});

export const dashboardPortfolioSchema = z.object({
  portfolio: portfolioSchema,
  summary: portfolioSummarySchema,
});

export const dashboardSchema = z.object({
  overview: dashboardOverviewSchema,
  portfolios: z.array(dashboardPortfolioSchema),
});

export const portfolioDetailSchema = z.object({
  portfolio: portfolioSchema,
  summary: portfolioSummarySchema,
  positions: z.array(positionAnalyticsSchema),
});

export const correlationMarketSchema = z.object({
  id: z.string(),
  label: z.string(),
  currentPrice: z.number().min(0).max(1),
  netExposure: z.number(),
  openInterest: z.number().nonnegative(),
  totalShares: z.number().nonnegative(),
  confidence: z.number().min(0).max(1),
  polymarketUrl: z.string().url().optional(),
});

export const correlationMatrixSchema = z.object({
  markets: z.array(correlationMarketSchema),
  matrix: z.array(z.array(z.number().min(-1).max(1))),
});

export const optimizationRequestSchema = z.object({
  budget: z.number().nonnegative().default(0),
  riskTolerance: z.number().min(0).max(1).default(0.5),
  maxPositionWeight: z.number().min(0.05).max(1).default(0.35),
  scenarioPreset: z.enum(["baseline", "vol_spike", "liquidity_crunch", "market_gap"]).default("baseline"),
});

export const hedgePreviewRequestSchema = z.object({
  marketIds: z.array(z.string().min(1)).min(1).max(2),
  budget: z.number().nonnegative(),
  splitEvenly: z.boolean().default(true),
});

export const hedgeTradeSchema = z.object({
  marketId: z.string(),
  question: z.string(),
  polymarketUrl: z.string().url().optional(),
  tradeType: z.enum(["buy_yes", "buy_no"]),
  amount: z.number().nonnegative(),
  estimatedShares: z.number().nonnegative(),
  entryPrice: z.number().min(0).max(1),
  expectedScenarioReturn: z.number(),
  worstCaseProtection: z.number(),
});

export const optimizationMetricsSchema = z.object({
  cvarBefore: z.number(),
  cvarAfter: z.number(),
  expectedReturnBefore: z.number(),
  expectedReturnAfter: z.number(),
  stressLossBefore: z.number(),
  stressLossAfter: z.number(),
  budgetUsed: z.number().nonnegative(),
});

export const optimizationResponseSchema = z.object({
  trades: z.array(hedgeTradeSchema),
  metrics: optimizationMetricsSchema,
});

export const authUserSchema = z.object({
  id: z.number(),
  username: z.string(),
  displayName: z.string(),
  role: z.string(),
  walletAddress: z.string().nullable().optional(),
});

export const authLoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const authRegisterSchema = z.object({
  username: z.string().min(3),
  displayName: z.string().min(2),
  password: z.string().min(8),
});

export const authSessionSchema = z.object({
  user: authUserSchema.nullable(),
});

export type PortfolioRecord = z.infer<typeof portfolioSchema>;
export type PositionRecord = z.infer<typeof positionRecordSchema>;
export type MarketSnapshot = z.infer<typeof marketSnapshotSchema>;
export type PositionAnalytics = z.infer<typeof positionAnalyticsSchema>;
export type PortfolioSummary = z.infer<typeof portfolioSummarySchema>;
export type DashboardOverview = z.infer<typeof dashboardOverviewSchema>;
export type DashboardData = z.infer<typeof dashboardSchema>;
export type PortfolioDetail = z.infer<typeof portfolioDetailSchema>;
export type CorrelationMatrix = z.infer<typeof correlationMatrixSchema>;
export type OptimizationRequest = z.infer<typeof optimizationRequestSchema>;
export type HedgePreviewRequest = z.infer<typeof hedgePreviewRequestSchema>;
export type HedgeTrade = z.infer<typeof hedgeTradeSchema>;
export type OptimizationResponse = z.infer<typeof optimizationResponseSchema>;
export type AuthUser = z.infer<typeof authUserSchema>;
export type AuthLogin = z.infer<typeof authLoginSchema>;
export type AuthRegister = z.infer<typeof authRegisterSchema>;
export type AuthSession = z.infer<typeof authSessionSchema>;
export type ConfidenceBreakdown = z.infer<typeof confidenceBreakdownSchema>;
export type MarketsFeedMeta = z.infer<typeof marketsFeedMetaSchema>;
export type MarketsListResponse = z.infer<typeof marketsListResponseSchema>;
export type ProAlertStatePut = z.infer<typeof proAlertStatePutSchema>;
export type ProRiskReport = z.infer<typeof proRiskReportSchema>;
