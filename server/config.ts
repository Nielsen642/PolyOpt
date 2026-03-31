export interface AppConfig {
  port: number;
  host: string;
  sessionSecret: string;
  nodeEnv: string;
  proMode: boolean;
  demoMode: boolean;
  polymarketWalletAddress: string | null;
  optimizerCmd: string | null;
  optimizerArgs: string | null;
  polymarketRetryAttempts: number;
  polymarketRetryBaseDelayMs: number;
  polymarketDataTimeoutMs: number;
  polymarketGammaTimeoutMs: number;
  polymarketClobTimeoutMs: number;
  staleWarningAfterMs: number;
  clobRelayHeaders: {
    POLY_API_KEY?: string;
    POLY_ADDRESS?: string;
    POLY_SIGNATURE?: string;
    POLY_PASSPHRASE?: string;
    POLY_TIMESTAMP?: string;
  };
  clobRelaySecret?: string;
  apiRateLimitWindowMs: number;
  apiRateLimitMax: number;
  authRateLimitWindowMs: number;
  authRateLimitMax: number;
}

const DEV_SESSION_FALLBACK = "polyopt-dev-session-secret";

export function loadConfig(): AppConfig {
  const port = Number.parseInt(process.env.PORT || "5000", 10);
  const host =
    process.env.HOST ||
    (process.platform === "win32" ? "127.0.0.1" : "0.0.0.0");
  const nodeEnv = process.env.NODE_ENV || "development";
  const proMode =
    process.env.APP_TIER?.toLowerCase() === "pro" ||
    process.env.PRO_MODE === "1" ||
    process.env.PRO_MODE === "true";

  const sessionSecret = process.env.SESSION_SECRET || DEV_SESSION_FALLBACK;

  const relay: AppConfig["clobRelayHeaders"] = {};
  if (process.env.POLY_API_KEY) relay.POLY_API_KEY = process.env.POLY_API_KEY;
  if (process.env.POLY_ADDRESS) relay.POLY_ADDRESS = process.env.POLY_ADDRESS;
  if (process.env.POLY_SIGNATURE) relay.POLY_SIGNATURE = process.env.POLY_SIGNATURE;
  if (process.env.POLY_PASSPHRASE) relay.POLY_PASSPHRASE = process.env.POLY_PASSPHRASE;
  if (process.env.POLY_TIMESTAMP) relay.POLY_TIMESTAMP = process.env.POLY_TIMESTAMP;
  const clobRelaySecret = process.env.POLY_SECRET?.trim() || undefined;

  return {
    port,
    host,
    sessionSecret,
    nodeEnv,
    proMode,
    demoMode:
      process.env.DEMO_MODE === "true" || process.env.DEMO_MODE === "1",
    polymarketWalletAddress:
      process.env.POLYMARKET_WALLET_ADDRESS?.trim() || null,
    optimizerCmd: process.env.OPTIMIZER_CMD || null,
    optimizerArgs: process.env.OPTIMIZER_ARGS || null,
    polymarketRetryAttempts: Number.parseInt(process.env.POLYMARKET_RETRY_ATTEMPTS || "3", 10),
    polymarketRetryBaseDelayMs: Number.parseInt(process.env.POLYMARKET_RETRY_BASE_DELAY_MS || "500", 10),
    polymarketDataTimeoutMs: Number.parseInt(process.env.POLYMARKET_DATA_TIMEOUT_MS || "20000", 10),
    polymarketGammaTimeoutMs: Number.parseInt(process.env.POLYMARKET_GAMMA_TIMEOUT_MS || "20000", 10),
    polymarketClobTimeoutMs: Number.parseInt(process.env.POLYMARKET_CLOB_TIMEOUT_MS || "20000", 10),
    staleWarningAfterMs: Number.parseInt(process.env.FEED_STALE_WARNING_MS || "120000", 10),
    clobRelayHeaders: relay,
    clobRelaySecret,
    apiRateLimitWindowMs: Number.parseInt(process.env.API_RATE_LIMIT_WINDOW_MS || "60000", 10),
    apiRateLimitMax: Number.parseInt(process.env.API_RATE_LIMIT_MAX || "300", 10),
    authRateLimitWindowMs: Number.parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || "900000", 10),
    authRateLimitMax: Number.parseInt(process.env.AUTH_RATE_LIMIT_MAX || "40", 10),
  };
}

export function assertProductionConfig(config: AppConfig): void {
  const prod = config.nodeEnv === "production";
  if (!prod) return;
  if (config.proMode && config.sessionSecret === DEV_SESSION_FALLBACK) {
    throw new Error(
      "PRO_MODE/APP_TIER=pro in production requires a strong SESSION_SECRET (not the dev default).",
    );
  }
  if (config.proMode && !config.polymarketWalletAddress) {
    console.warn(
      "[pro] POLYMARKET_WALLET_ADDRESS is unset — portfolio/market feeds will be empty until configured.",
    );
  }
}

