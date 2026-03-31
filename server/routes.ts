import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { spawn } from "child_process";
import { createHmac } from "crypto";
import { WebSocketServer, WebSocket } from "ws";
import type { AuthUser, User } from "@shared/schema";
import {
  buildCorrelationMatrix,
  buildDashboard,
  buildPortfolioDetail,
  buildProPortfolioRiskReport,
  normalizePortfolio,
} from "./analytics";
import { createRateLimiter } from "./rate-limit";
import { hashPassword, verifyPassword } from "./auth";
import {
  fetchUserPositions,
  fetchMarketsForPositions,
  fetchOrderBooks,
  getTokenIdsFromPositions,
  getMarketTokenIds,
  normalizePolymarketPositions,
  normalizePolymarketMarkets,
  fetchTopMarketsByCategory,
} from "./polymarket";
import { startPolymarketPoller, type SubscriptionMap } from "./polymarket-stream";
import { sessionMiddleware } from "./session";
import type { AppConfig } from "./config";
import { proAlertStatePutSchema } from "@shared/schema";

const POLYMARKET_VIRTUAL_PORTFOLIO = {
  id: 1,
  name: "Polymarket Account",
  userId: 0,
} as import("@shared/schema").Portfolio;

function buildPolyL2Signature(
  secret: string,
  timestamp: number,
  method: string,
  requestPath: string,
  body?: string,
): string {
  const sanitized = secret.replace(/-/g, "+").replace(/_/g, "/").replace(/[^A-Za-z0-9+/=]/g, "");
  const key = Buffer.from(sanitized, "base64");
  let message = `${timestamp}${method}${requestPath}`;
  if (body !== undefined) {
    message += body;
  }
  const base64 = createHmac("sha256", key).update(message).digest("base64");
  // Polymarket uses URL-safe base64 while preserving "=" padding.
  return base64.replace(/\+/g, "-").replace(/\//g, "_");
}

export async function registerRoutes(
  httpServer: Server,
  app: Express,
  config: AppConfig,
): Promise<Server> {
  const apiRateLimit = createRateLimiter(config, "api");
  const authRateLimit = createRateLimiter(config, "auth");
  app.use((req, res, next) => {
    if (!config.proMode) {
      return next();
    }
    const p = req.path || "";
    if (p === "/api/auth/login" || p === "/api/auth/register") {
      return authRateLimit(req, res, next);
    }
    if (p.startsWith("/api")) {
      return apiRateLimit(req, res, next);
    }
    return next();
  });

  function toAuthUser(user: User): AuthUser {
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      walletAddress: user.walletAddress ?? null,
    };
  }

  async function seedUserPortfolio(userId: number) {
    if (!config.demoMode) return;
    try {
      const existingPortfolios = await storage.getPortfolios(userId);
      if (existingPortfolios.length === 0) {
        const port = await storage.createPortfolio(userId, { name: "Main Trading Portfolio" });
        await storage.createPosition(userId, port.id, {
          marketId: "0x123",
          yesShares: "500",
          noShares: "0",
          price: "0.65"
        });
        await storage.createPosition(userId, port.id, {
          marketId: "0x456",
          yesShares: "0",
          noShares: "200",
          price: "0.58"
        });
        await storage.createPosition(userId, port.id, {
          marketId: "0x789",
          yesShares: "320",
          noShares: "0",
          price: "0.54"
        });
        await storage.createPosition(userId, port.id, {
          marketId: "0xabc",
          yesShares: "150",
          noShares: "90",
          price: "0.47"
        });
      }
    } catch (error) {
      console.error("Failed to seed database:", error);
    }
  }

  async function getState(userId: number) {
    const assembledAt = new Date().toISOString();
    const user = await storage.getUser(userId);
    const polymarketVirtualPortfolio = {
      ...POLYMARKET_VIRTUAL_PORTFOLIO,
      name: user?.username ?? POLYMARKET_VIRTUAL_PORTFOLIO.name,
    };
    const dataWallet =
      config.polymarketWalletAddress ||
      user?.walletAddress?.trim() ||
      "";

    const fingerprint =
      dataWallet && dataWallet.length > 10
        ? `${dataWallet.slice(0, 6)}…${dataWallet.slice(-4)}`
        : dataWallet || null;

    const emptyMeta = {
      assembledAt,
      staleWarningAfterMs: config.staleWarningAfterMs,
      proMode: config.proMode,
      demoMode: config.demoMode,
      dataWalletFingerprint: fingerprint,
      sources: {
        dataApi: "unconfigured" as const,
        gamma: "skipped" as const,
        clob: "none" as const,
      },
    };

    if (!dataWallet) {
      return {
        portfolios: [normalizePortfolio(polymarketVirtualPortfolio)],
        positions: [] as ReturnType<typeof normalizePolymarketPositions>,
        markets: [] as Awaited<ReturnType<typeof normalizePolymarketMarkets>>,
        feedMeta: emptyMeta,
      };
    }
    try {
      const polyPositions = await fetchUserPositions(
        dataWallet,
        500,
        {
          timeoutMs: config.polymarketDataTimeoutMs,
          retryAttempts: config.polymarketRetryAttempts,
          retryBaseDelayMs: config.polymarketRetryBaseDelayMs,
        },
      );
      const positions = normalizePolymarketPositions(polyPositions);
      const polyMarkets = await fetchMarketsForPositions(polyPositions, {
        timeoutMs: config.polymarketGammaTimeoutMs,
        retryAttempts: config.polymarketRetryAttempts,
        retryBaseDelayMs: config.polymarketRetryBaseDelayMs,
      });
      const { tokenIds, tokenToCondition, tokenToOutcome } = getTokenIdsFromPositions(polyPositions);
      const books = await fetchOrderBooks(tokenIds, {
        timeoutMs: config.polymarketClobTimeoutMs,
        retryAttempts: config.polymarketRetryAttempts,
        retryBaseDelayMs: config.polymarketRetryBaseDelayMs,
      });
      const orderBooksByTokenId = new Map<string, import("./polymarket").OrderBook>();
      tokenIds.forEach((tid, i) => {
        if (books[i]) orderBooksByTokenId.set(tid, books[i]);
      });
      const marketsRaw = normalizePolymarketMarkets(
        polyMarkets,
        positions,
        orderBooksByTokenId,
        tokenToCondition,
        tokenToOutcome,
      );
      const markets = marketsRaw.map((m) => ({
        ...m,
        serverAssembledAt: assembledAt,
      }));

      const uniqueConditions = new Set(positions.map((p) => p.marketId));
      const gammaStatus =
        polyMarkets.length === 0
          ? ("skipped" as const)
          : polyMarkets.length >= uniqueConditions.size
            ? ("ok" as const)
            : ("partial" as const);

      const booksOk = tokenIds.filter((_, i) => Boolean(books[i])).length;
      const clobStatus =
        tokenIds.length === 0
          ? ("none" as const)
          : booksOk === tokenIds.length
            ? ("ok" as const)
            : ("partial" as const);

      return {
        portfolios: [normalizePortfolio(polymarketVirtualPortfolio)],
        positions,
        markets,
        feedMeta: {
          assembledAt,
          staleWarningAfterMs: config.staleWarningAfterMs,
          proMode: config.proMode,
          demoMode: config.demoMode,
          dataWalletFingerprint: fingerprint,
          sources: {
            dataApi: "ok" as const,
            gamma: gammaStatus,
            clob: clobStatus,
          },
        },
      };
    } catch (err) {
      console.error("Polymarket getState error:", err);
      return {
        portfolios: [normalizePortfolio(polymarketVirtualPortfolio)],
        positions: [],
        markets: [],
        feedMeta: {
          assembledAt,
          staleWarningAfterMs: config.staleWarningAfterMs,
          proMode: config.proMode,
          demoMode: config.demoMode,
          dataWalletFingerprint: fingerprint,
          sources: {
            dataApi: "error" as const,
            gamma: "skipped" as const,
            clob: "none" as const,
          },
        },
      };
    }
  }

  async function getPortfolioState(userId: number, portfolioId: number) {
    if (portfolioId !== POLYMARKET_VIRTUAL_PORTFOLIO.id) {
      return null;
    }
    const state = await getState(userId);
    const virtualPortfolioRecord =
      state.portfolios.find((p) => p.id === POLYMARKET_VIRTUAL_PORTFOLIO.id) ??
      normalizePortfolio(POLYMARKET_VIRTUAL_PORTFOLIO);
    const detail = buildPortfolioDetail(
      virtualPortfolioRecord,
      state.positions,
      state.markets,
    );
    return {
      ...state,
      detail,
    };
  }

  function parsePortfolioId(rawPortfolioId: string): number | null {
    const portfolioId = Number.parseInt(rawPortfolioId, 10);
    return Number.isNaN(portfolioId) ? null : portfolioId;
  }

  const wsSubscriptions: SubscriptionMap = new Map();

  async function publishMarketSnapshots(userId: number, ws: WebSocket, marketIds: string[]) {
    wsSubscriptions.set(ws, { userId, marketIds });
    const { markets } = await getState(userId);
    const requested = marketIds.length > 0
      ? markets.filter((market) => marketIds.includes(market.id))
      : markets;

    for (const market of requested) {
      if (ws.readyState !== WebSocket.OPEN) {
        return;
      }

      ws.send(JSON.stringify({
        type: "market_snapshot",
        payload: market,
      }));
    }
  }

  function getSessionUser(req: any): AuthUser | null {
    return req.session?.user ?? null;
  }

  async function requireAuth(req: any, res: any, next: any) {
    const sessionUser = getSessionUser(req);
    if (!sessionUser) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const dbUser = await storage.getUser(sessionUser.id);
    if (!dbUser) {
      req.session.destroy(() => undefined);
      return res.status(401).json({ message: "User session is no longer valid" });
    }

    req.session.user = toAuthUser(dbUser);
    next();
  }

  app.get(api.auth.session.path, async (req, res) => {
    const sessionUser = getSessionUser(req);
    if (!sessionUser) {
      return res.json({ user: null });
    }

    const dbUser = await storage.getUser(sessionUser.id);
    if (!dbUser) {
      req.session.destroy(() => undefined);
      return res.json({ user: null });
    }

    const authUser = toAuthUser(dbUser);
    req.session.user = authUser;
    res.json({ user: authUser });
  });

  app.post(api.auth.register.path, async (req, res) => {
    try {
      const input = api.auth.register.input.parse(req.body);
      const existingUser = await storage.getUserByUsername(input.username);
      if (existingUser) {
        return res.status(409).json({ message: "Username already exists" });
      }

      const passwordHash = await hashPassword(input.password);
      const user = await storage.createUser({
        username: input.username,
        displayName: input.displayName,
        passwordHash,
        walletAddress: null,
        role: "operator",
      });
      await seedUserPortfolio(user.id);

      const authUser = toAuthUser(user);
      req.session.user = authUser;
      res.status(201).json({ user: authUser });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.post(api.auth.login.path, async (req, res) => {
    try {
      const input = api.auth.login.input.parse(req.body);
      const user = await storage.getUserByUsername(input.username);
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const validPassword = await verifyPassword(input.password, user.passwordHash);
      if (!validPassword) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const authUser = toAuthUser(user);
      req.session.user = authUser;
      res.json({ user: authUser });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.post(api.auth.logout.path, (req, res) => {
    req.session.destroy(() => {
      res.json({ user: null });
    });
  });

  app.get(api.dashboard.get.path, requireAuth, async (_req, res) => {
    const user = getSessionUser(_req);
    if (!user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const state = await getState(user.id);
    res.json(buildDashboard(state.portfolios, state.positions, state.markets));
  });

  app.get(api.portfolios.list.path, requireAuth, async (req, res) => {
    const user = getSessionUser(req);
    if (!user) {
      return res.status(401).json({ message: "Authentication required" });
    }
    const { portfolios } = await getState(user.id);
    res.json(portfolios);
  });

  app.put("/api/user/wallet", requireAuth, async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ message: "Authentication required" });
    const walletAddress =
      typeof req.body?.walletAddress === "string"
        ? req.body.walletAddress.trim() || null
        : null;
    const updated = await storage.updateUserWallet(user.id, walletAddress);
    if (!updated) return res.status(404).json({ message: "User not found" });
    req.session.user = toAuthUser(updated);
    res.json({ user: toAuthUser(updated) });
  });

  app.post(api.portfolios.create.path, requireAuth, async (req, res) => {
    if (!config.demoMode) {
      return res.status(403).json({
        message: "Portfolios are read-only from Polymarket; create is disabled.",
      });
    }
    try {
      const user = getSessionUser(req);
      if (!user) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const input = api.portfolios.create.input.parse(req.body);
      const port = await storage.createPortfolio(user.id, input);
      res.status(201).json(normalizePortfolio(port));
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.get(api.portfolios.get.path, requireAuth, async (req, res) => {
    const user = getSessionUser(req);
    if (!user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const portfolioId = parsePortfolioId(req.params.portfolioId);
    if (portfolioId === null) {
      return res.status(400).json({ message: "Invalid portfolio ID" });
    }

    const state = await getPortfolioState(user.id, portfolioId);
    if (!state) {
      return res.status(404).json({ message: "Portfolio not found" });
    }

    res.json(state.detail);
  });

  app.get(api.positions.list.path, requireAuth, async (req, res) => {
    const user = getSessionUser(req);
    if (!user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const portfolioId = parsePortfolioId(req.params.portfolioId);
    if (portfolioId === null) return res.status(400).json({ message: "Invalid portfolio ID" });

    const state = await getPortfolioState(user.id, portfolioId);
    if (!state) {
      return res.status(404).json({ message: "Portfolio not found" });
    }

    res.json(state.detail.positions);
  });

  app.post(api.positions.add.path, requireAuth, async (req, res) => {
    if (!config.demoMode) {
      return res.status(403).json({
        message: "Positions are read-only from Polymarket; add is disabled.",
      });
    }
    const user = getSessionUser(req);
    if (!user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const portfolioId = parsePortfolioId(req.params.portfolioId);
    if (portfolioId === null) return res.status(400).json({ message: "Invalid portfolio ID" });

    try {
      const input = api.positions.add.input.parse(req.body);
      const portfolio = await storage.getPortfolio(user.id, portfolioId);
      if (!portfolio) {
        return res.status(404).json({ message: "Portfolio not found" });
      }

      const pos = await storage.createPosition(user.id, portfolioId, {
        marketId: input.marketId,
        yesShares: String(input.yesShares),
        noShares: String(input.noShares),
        price: String(input.price)
      });

      const state = await getPortfolioState(user.id, portfolioId);
      const created = state?.detail.positions.find((position) => position.id === pos.id);
      if (!created) {
        return res.status(500).json({ message: "Position analytics could not be refreshed" });
      }
      res.status(201).json(created);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.post(api.optimization.run.path, requireAuth, async (req, res) => {
    const user = getSessionUser(req);
    if (!user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const portfolioId = parsePortfolioId(req.params.portfolioId);
    if (portfolioId === null) {
      return res.status(400).json({ message: "Invalid portfolio ID" });
    }

    try {
      const input = api.optimization.run.input.parse(req.body);
      const state = await getPortfolioState(user.id, portfolioId);
      if (!state) {
        return res.status(404).json({ message: "Portfolio not found" });
      }

      const correlationMatrix = buildCorrelationMatrix(state.markets);

      const optimizerCmdFromEnv = process.env.OPTIMIZER_CMD;
      const optimizerArgsFromEnv = process.env.OPTIMIZER_ARGS;

      let optimizerCommand: string;
      let optimizerArgs: string[];

      if (optimizerCmdFromEnv) {
        optimizerCommand = optimizerCmdFromEnv;
        optimizerArgs = optimizerArgsFromEnv
          ? optimizerArgsFromEnv.split(" ").filter((part) => part.length > 0)
          : ["server/optimize.py"];
      } else {
        optimizerCommand = "uv";
        optimizerArgs = ["run", "python", "server/optimize.py"];
      }

      const pyProcess = spawn(optimizerCommand, optimizerArgs);
      
      let outputData = "";
      let errorData = "";
      let processFailed = false;

      pyProcess.stdout.on("data", (data) => {
        outputData += data.toString();
      });

      pyProcess.stderr.on("data", (data) => {
        errorData += data.toString();
      });

      pyProcess.on("close", (code) => {
        if (res.headersSent || processFailed) {
          return;
        }

        if (code !== 0) {
          console.error("Python Error:", errorData);
          if (!res.headersSent) {
            res.status(500).json({ message: "Optimization failed: " + errorData });
          }
          return;
        }

        try {
          const result = api.optimization.run.responses[200].parse(JSON.parse(outputData));
          res.json(result);
        } catch (e) {
          console.error("Python JSON Error:", outputData);
          if (!res.headersSent) {
            res.status(500).json({ message: "Invalid output from optimization script" });
          }
        }
      });

      pyProcess.on("error", (error) => {
        console.error("Python process error:", error);
        processFailed = true;
        if (!res.headersSent) {
          res.status(500).json({ message: "Unable to start optimization engine" });
        }
      });

      pyProcess.stdin.write(JSON.stringify({
        request: input,
        portfolio: state.detail.portfolio,
        positions: state.detail.positions,
        correlations: correlationMatrix,
      }));
      pyProcess.stdin.end();

    } catch (err) {
       if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.optimization.preview.path, requireAuth, async (req, res) => {
    const user = getSessionUser(req);
    if (!user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    try {
      const input = api.optimization.preview.input.parse(req.body);
      const state = await getPortfolioState(user.id, POLYMARKET_VIRTUAL_PORTFOLIO.id);
      if (!state) {
        return res.status(404).json({ message: "Portfolio not found" });
      }

      // Use the full correlation matrix for scenario simulation.
      const correlationMatrix = buildCorrelationMatrix(state.markets);

      const optimizerCmdFromEnv = process.env.OPTIMIZER_CMD;
      const optimizerArgsFromEnv = process.env.OPTIMIZER_ARGS;

      let optimizerCommand: string;
      let optimizerArgs: string[];

      if (optimizerCmdFromEnv) {
        optimizerCommand = optimizerCmdFromEnv;
        optimizerArgs = optimizerArgsFromEnv
          ? optimizerArgsFromEnv.split(" ").filter((part) => part.length > 0)
          : ["server/optimize.py"];
      } else {
        optimizerCommand = "uv";
        optimizerArgs = ["run", "python", "server/optimize.py"];
      }

      const pyProcess = spawn(optimizerCommand, optimizerArgs);

      let outputData = "";
      let errorData = "";
      let processFailed = false;

      pyProcess.stdout.on("data", (data) => {
        outputData += data.toString();
      });

      pyProcess.stderr.on("data", (data) => {
        errorData += data.toString();
      });

      pyProcess.on("close", (code) => {
        if (res.headersSent || processFailed) {
          return;
        }

        if (code !== 0) {
          console.error("Python Error:", errorData);
          if (!res.headersSent) {
            res.status(500).json({ message: "Preview calculation failed: " + errorData });
          }
          return;
        }

        try {
          const result = api.optimization.run.responses[200].parse(JSON.parse(outputData));
          res.json(result);
        } catch (e) {
          console.error("Python JSON Error:", outputData);
          if (!res.headersSent) {
            res.status(500).json({ message: "Invalid output from preview script" });
          }
        }
      });

      pyProcess.on("error", (error) => {
        console.error("Python process error:", error);
        processFailed = true;
        if (!res.headersSent) {
          res.status(500).json({ message: "Unable to start optimization engine" });
        }
      });

      pyProcess.stdin.write(
        JSON.stringify({
          mode: "preview",
          request: input,
          portfolio: state.detail.portfolio,
          positions: state.detail.positions,
          correlations: correlationMatrix,
        }),
      );
      pyProcess.stdin.end();
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(api.markets.list.path, requireAuth, async (_req, res) => {
    const user = getSessionUser(_req);
    if (!user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const { markets, feedMeta } = await getState(user.id);
    res.json(api.markets.list.responses[200].parse({ markets, meta: feedMeta }));
  });

  app.get("/api/polymarket/tokens", requireAuth, async (req, res) => {
    const raw = req.query.conditionIds;
    const conditionIds = typeof raw === "string" ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [];
    const map = await getMarketTokenIds(conditionIds, {
      timeoutMs: config.polymarketGammaTimeoutMs,
      retryAttempts: config.polymarketRetryAttempts,
      retryBaseDelayMs: config.polymarketRetryBaseDelayMs,
    });
    res.json(map);
  });

  app.post("/api/polymarket/order", requireAuth, async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ message: "Authentication required" });
    const body = req.body as Record<string, unknown>;
    if (!body || typeof body !== "object") {
      return res.status(400).json({ message: "Request body must be a JSON object (SendOrder)" });
    }
    const polyHeaders: Record<string, string> = {};
    const forwardHeaders = ["POLY_API_KEY", "POLY_ADDRESS", "POLY_SIGNATURE", "POLY_PASSPHRASE", "POLY_TIMESTAMP"];
    for (const name of forwardHeaders) {
      const value = req.get(name);
      if (value) polyHeaders[name] = value;
    }
    for (const [key, value] of Object.entries(config.clobRelayHeaders)) {
      if (value && !polyHeaders[key]) {
        polyHeaders[key] = value;
      }
    }
    const relayBody = JSON.stringify(body);
    const hasCoreL2Headers =
      typeof polyHeaders.POLY_API_KEY === "string" &&
      polyHeaders.POLY_API_KEY.trim().length > 0 &&
      typeof polyHeaders.POLY_ADDRESS === "string" &&
      polyHeaders.POLY_ADDRESS.trim().length > 0 &&
      typeof polyHeaders.POLY_PASSPHRASE === "string" &&
      polyHeaders.POLY_PASSPHRASE.trim().length > 0;
    const needsGeneratedL2Sig =
      hasCoreL2Headers &&
      Boolean(config.clobRelaySecret) &&
      (!polyHeaders.POLY_SIGNATURE || !polyHeaders.POLY_TIMESTAMP);
    if (needsGeneratedL2Sig) {
      const ts = Math.floor(Date.now() / 1000);
      polyHeaders.POLY_TIMESTAMP = String(ts);
      polyHeaders.POLY_SIGNATURE = buildPolyL2Signature(
        config.clobRelaySecret as string,
        ts,
        "POST",
        "/order",
        relayBody,
      );
    }
    const missingHeaders = forwardHeaders.filter((name) => {
      const value = polyHeaders[name];
      return !(typeof value === "string" && value.trim().length > 0);
    });
    if (missingHeaders.length > 0) {
      return res.status(400).json({
        success: false,
        errorMsg: `Missing Polymarket auth headers: ${missingHeaders.join(", ")}.`,
      });
    }
    try {
      const r = await fetch("https://clob.polymarket.com/order", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...polyHeaders },
        body: relayBody,
      });
      const rawData = await r.json().catch(async () => {
        const text = await r.text().catch(() => "");
        return text ? { errorMsg: text } : {};
      });
      const data =
        rawData && typeof rawData === "object"
          ? (rawData as Record<string, unknown>)
          : { message: String(rawData ?? "") };
      if (!r.ok && !data.errorMsg) {
        data.errorMsg = `Polymarket CLOB rejected order (${r.status}).`;
      }
      if (r.status === 403) {
        data.errorMsg =
          typeof data.errorMsg === "string" && data.errorMsg.length > 0
            ? data.errorMsg
            : "Polymarket authorization failed. Verify POLY_* API headers and wallet/API-key permissions.";
      }
      res.status(r.status).json(data);
    } catch (err) {
      console.error("Polymarket order relay error:", err);
      res.status(502).json({ message: "Failed to relay order to Polymarket" });
    }
  });

  app.get(api.correlations.get.path, requireAuth, async (req, res) => {
    const user = getSessionUser(req);
    if (!user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const { markets } = await getState(user.id);
    const q = req.query as Record<string, unknown>;
    const parseWeight = (key: string, defaultValue = 1): number => {
      const raw = q[key];
      const value = Array.isArray(raw) ? raw[0] : raw;
      if (value === undefined) return defaultValue;
      if (value === "0" || value === 0 || value === "false" || value === false) return 0;
      if (value === "1" || value === 1 || value === "true" || value === true) return 1;
      const n = typeof value === "string" ? Number(value) : Number(value);
      return Number.isFinite(n) ? n : defaultValue;
    };

    res.json(
      buildCorrelationMatrix(markets, {
        price: parseWeight("price", 1),
        direction: parseWeight("direction", 1),
        openInterest: parseWeight("openInterest", 1),
        totalShares: parseWeight("totalShares", 1),
        confidence: parseWeight("confidence", 1),
      }),
    );
  });

  app.get(api.pro.meta.path, requireAuth, (_req, res) => {
    const hasServerRelayHeaders = Object.values(config.clobRelayHeaders).some((v) => Boolean(v));
    res.json(
      api.pro.meta.responses[200].parse({
        proMode: config.proMode,
        demoMode: config.demoMode,
        productionHardening: config.nodeEnv === "production",
        staleWarningAfterMs: config.staleWarningAfterMs,
        features: {
          serverAlertPersistence: config.proMode,
          serverClobRelay: hasServerRelayHeaders,
          riskAttributionApi: config.proMode,
          rateLimitedApi: config.proMode,
        },
        clobRelayConfigured: Object.values(config.clobRelayHeaders).filter(Boolean).length >= 2,
      }),
    );
  });

  app.get(api.pro.alerts.get.path, requireAuth, async (req, res) => {
    if (!config.proMode) {
      return res.status(403).json({ message: "Alert persistence requires Pro mode (APP_TIER=pro)." });
    }
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ message: "Authentication required" });
    const row = await storage.getAlertState(user.id);
    let rulesRaw: unknown = [];
    let eventsRaw: unknown = [];
    try {
      rulesRaw = row ? JSON.parse(row.rulesJson) : [];
    } catch {
      rulesRaw = [];
    }
    try {
      eventsRaw = row ? JSON.parse(row.eventsJson) : [];
    } catch {
      eventsRaw = [];
    }
    const rulesParsed = proAlertStatePutSchema.shape.rules.safeParse(rulesRaw);
    const eventsParsed = proAlertStatePutSchema.shape.events.safeParse(eventsRaw);
    const rules = rulesParsed.success ? rulesParsed.data : [];
    const events = eventsParsed.success ? eventsParsed.data : [];
    res.json(
      api.pro.alerts.get.responses[200].parse({
        rules,
        events,
        updatedAt: row?.updatedAt ?? new Date(0).toISOString(),
      }),
    );
  });

  app.put(api.pro.alerts.put.path, requireAuth, async (req, res) => {
    if (!config.proMode) {
      return res.status(403).json({ message: "Alert persistence requires Pro mode (APP_TIER=pro)." });
    }
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ message: "Authentication required" });
    try {
      const body = proAlertStatePutSchema.parse(req.body);
      const saved = await storage.upsertAlertState(user.id, {
        rulesJson: JSON.stringify(body.rules),
        eventsJson: JSON.stringify(body.events),
      });
      res.json(
        api.pro.alerts.put.responses[200].parse({
          rules: body.rules,
          events: body.events,
          updatedAt: saved.updatedAt,
        }),
      );
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0]?.message ?? "Invalid alert payload" });
      }
      throw err;
    }
  });

  app.get(api.pro.riskReport.path, requireAuth, async (req, res) => {
    if (!config.proMode) {
      return res.status(403).json({ message: "Risk report API requires Pro mode (APP_TIER=pro)." });
    }
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ message: "Authentication required" });
    const state = await getPortfolioState(user.id, POLYMARKET_VIRTUAL_PORTFOLIO.id);
    if (!state) {
      return res.status(404).json({ message: "Portfolio not found" });
    }
    const report = buildProPortfolioRiskReport(state.detail, state.markets);
    res.json(api.pro.riskReport.responses[200].parse(report));
  });

  app.get("/api/market-scan/:category", requireAuth, async (req, res) => {
    const raw = (req.params.category || "").toLowerCase();
    if (raw !== "crypto" && raw !== "sports" && raw !== "politics") {
      return res.status(400).json({ message: "Invalid category" });
    }
    const rawLimit = Number(req.query.limit);
    const limit = Number.isFinite(rawLimit)
      ? Math.min(50, Math.max(1, Math.trunc(rawLimit)))
      : 24;
    try {
      const markets = await fetchTopMarketsByCategory(
        raw as "crypto" | "sports" | "politics",
        limit,
        {
          timeoutMs: config.polymarketGammaTimeoutMs,
          retryAttempts: config.polymarketRetryAttempts,
          retryBaseDelayMs: config.polymarketRetryBaseDelayMs,
        },
      );
      res.json(markets);
    } catch (err) {
      console.error("Market scan error:", err);
      res.status(500).json({ message: "Unable to fetch market scan data" });
    }
  });

  app.get("/api/health", async (_req, res) => {
    try {
      // Lightweight DB check; failure will be caught below.
      await storage.getUser(1).catch(() => undefined);

      const fetchOptsData = {
        timeoutMs: config.polymarketDataTimeoutMs,
        retryAttempts: config.polymarketRetryAttempts,
        retryBaseDelayMs: config.polymarketRetryBaseDelayMs,
      };
      const fetchOptsGamma = {
        timeoutMs: config.polymarketGammaTimeoutMs,
        retryAttempts: config.polymarketRetryAttempts,
        retryBaseDelayMs: config.polymarketRetryBaseDelayMs,
      };

      let polymarketDataReachable = false;
      if (config.polymarketWalletAddress) {
        try {
          await fetchUserPositions(config.polymarketWalletAddress, 1, fetchOptsData);
          polymarketDataReachable = true;
        } catch (e) {
          polymarketDataReachable = false;
        }
      }

      let polymarketGammaReachable = false;
      try {
        await fetchTopMarketsByCategory("crypto", 1, fetchOptsGamma);
        polymarketGammaReachable = true;
      } catch {
        polymarketGammaReachable = false;
      }

      let polymarketClobReachable = false;
      try {
        const clobRes = await fetch("https://clob.polymarket.com/healthz", { method: "GET" });
        polymarketClobReachable = clobRes.ok;
      } catch {
        polymarketClobReachable = false;
      }

      res.json({
        ok: true,
        proMode: config.proMode,
        nodeEnv: config.nodeEnv,
        uptimeSeconds: Math.round(process.uptime()),
        demoMode: config.demoMode,
        polymarketWalletConfigured: !!config.polymarketWalletAddress,
        polymarketDataReachable,
        polymarketGammaReachable,
        polymarketClobReachable,
      });
    } catch (err) {
      console.error("Health check failed:", err);
      res.status(500).json({ ok: false, message: "Health check failed" });
    }
  });

  startPolymarketPoller(getState, wsSubscriptions);

  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws, request) => {
    const sessionResponseStub = {
      getHeader: () => undefined,
      setHeader: () => undefined,
      end: () => undefined,
    };

    sessionMiddleware(request as any, sessionResponseStub as any, async () => {
      const user = getSessionUser(request);
      if (!user) {
        ws.close(1008, "Authentication required");
        return;
      }

      const dbUser = await storage.getUser(user.id);
      if (!dbUser) {
        ws.close(1008, "User session is no longer valid");
        return;
      }

      ws.on('close', () => {
        wsSubscriptions.delete(ws);
      });

      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message.toString());
          if (data.type === 'subscribe') {
            const payload = z.object({
              type: z.literal("subscribe"),
              payload: z.object({
                market_ids: z.array(z.string()),
              }),
            }).parse(data);

            void publishMarketSnapshots(user.id, ws, payload.payload.market_ids);
          }
        } catch (e) {
          console.error("WS parse error", e);
        }
      });
    });
  });

  return httpServer;
}