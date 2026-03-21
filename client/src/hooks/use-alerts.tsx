import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { MarketSnapshot, PortfolioSummary } from "@shared/schema";
import { toast } from "@/hooks/use-toast";
import { useLocalStorageState } from "@/hooks/use-local-storage";

export type AlertRuleType =
  | "price_move"
  | "time_window_move"
  | "exposure_limit"
  | "market_drawdown"
  | "portfolio_drawdown"
  | "liquidity_drop";

export type AlertSeverity = "info" | "warning" | "critical";

export type AlertDeliveryChannels = {
  inApp: boolean;
  browser: boolean;
  email: boolean;
  webhook: boolean;
  mobilePush: boolean;
};

export type AlertRule = {
  id: string;
  type: AlertRuleType;
  label: string;
  enabled: boolean;
  marketId?: string;
  threshold: number;
  timeWindowMinutes: number;
  cooldownMinutes: number;
  severity: AlertSeverity;
  channels: AlertDeliveryChannels;
  tag?: string;
  assetClass?: "crypto" | "sports" | "politics" | "other";
  portfolioName?: string;
};

export type AlertEvent = {
  id: string;
  ruleId?: string;
  severity: AlertSeverity;
  channels: AlertDeliveryChannels;
  title: string;
  description: string;
  createdAt: string;
};

type MarketHistoryPoint = {
  at: string;
  currentPrice: number;
  openInterest: number;
};

type PortfolioHistoryPoint = {
  at: string;
  grossExposure: number;
};

type AlertContextValue = {
  rules: AlertRule[];
  events: AlertEvent[];
  notificationPermission: NotificationPermission | "unsupported";
  addRule: (rule: Omit<AlertRule, "id">) => void;
  removeRule: (ruleId: string) => void;
  setRuleEnabled: (ruleId: string, enabled: boolean) => void;
  requestPermission: () => Promise<void>;
  ingestExternalAlert: (title: string, description: string) => void;
  getRuleDiagnostics: (ruleId: string) => {
    lastFiredAt: string | null;
    firedCount7d: number;
    backtestHits: number;
  };
  evaluateAlerts: (input: {
    markets: MarketSnapshot[];
    previousMarkets: Record<string, MarketSnapshot | undefined>;
    portfolioSummary?: PortfolioSummary;
  }) => void;
};

const AlertContext = createContext<AlertContextValue | null>(null);

function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function findHistoryPointAtOrBefore<T extends { at: string }>(points: T[], cutoffMs: number): T | undefined {
  const sorted = [...points].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const t = Date.parse(sorted[i].at);
    if (Number.isNaN(t)) continue;
    if (t <= cutoffMs) return sorted[i];
  }
  return undefined;
}

export function AlertsProvider({ children }: { children: React.ReactNode }) {
  const [rules, setRules] = useLocalStorageState<AlertRule[]>("polyopt-alert-rules", [
    {
      id: "default-price-move",
      type: "price_move",
      label: "BTC market price move > 4%",
      enabled: true,
      marketId: "0x123",
      threshold: 0.04,
      timeWindowMinutes: 30,
      cooldownMinutes: 60,
      severity: "warning",
      channels: { inApp: true, browser: true, email: false, webhook: false, mobilePush: false },
      tag: "default",
      assetClass: "crypto",
    },
    {
      id: "default-exposure",
      type: "exposure_limit",
      label: "Net exposure exceeds $250",
      enabled: true,
      threshold: 250,
      timeWindowMinutes: 30,
      cooldownMinutes: 60,
      severity: "critical",
      channels: { inApp: true, browser: true, email: false, webhook: false, mobilePush: false },
      tag: "risk",
      assetClass: "other",
    },
  ]);
  const [events, setEvents] = useLocalStorageState<AlertEvent[]>("polyopt-alert-events", []);
  const [lastFired, setLastFired] = useLocalStorageState<Record<string, string>>(
    "polyopt-alert-last-fired",
    {},
  );
  const [marketHistory, setMarketHistory] = useLocalStorageState<Record<string, MarketHistoryPoint[]>>(
    "polyopt-alert-market-history",
    {},
  );
  const [portfolioHistory, setPortfolioHistory] = useLocalStorageState<PortfolioHistoryPoint[]>(
    "polyopt-alert-portfolio-history",
    [],
  );

  const [hydratedFromServer, setHydratedFromServer] = useState(false);
  const [serverSyncEnabled, setServerSyncEnabled] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Keep latest snapshot for evaluateAlerts without recreating the callback (prevents AlertMonitor effect loops). */
  const rulesRef = useRef(rules);
  const lastFiredRef = useRef(lastFired);
  const marketHistoryRef = useRef(marketHistory);
  const portfolioHistoryRef = useRef(portfolioHistory);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch("/api/pro/meta", { credentials: "include" });
        if (!r.ok) {
          setHydratedFromServer(true);
          return;
        }
        const meta = (await r.json()) as { proMode?: boolean };
        if (cancelled) return;
        if (!meta.proMode) {
          setHydratedFromServer(true);
          return;
        }
        setServerSyncEnabled(true);
        const ar = await fetch("/api/pro/alerts", { credentials: "include" });
        if (!ar.ok) {
          setHydratedFromServer(true);
          return;
        }
        const body = (await ar.json()) as { rules?: AlertRule[]; events?: AlertEvent[] };
        if (cancelled) return;
        if (Array.isArray(body.rules)) setRules(body.rules);
        if (Array.isArray(body.events)) setEvents(body.events);
      } catch {
        /* non-pro or offline */
      } finally {
        if (!cancelled) setHydratedFromServer(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!serverSyncEnabled || !hydratedFromServer) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void fetch("/api/pro/alerts", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules, events }),
      }).catch(() => undefined);
    }, 1200);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [rules, events, serverSyncEnabled, hydratedFromServer]);

  const notificationPermission =
    typeof window === "undefined" || !("Notification" in window)
      ? "unsupported"
      : Notification.permission;

  const notificationPermissionRef = useRef(notificationPermission);
  useEffect(() => {
    rulesRef.current = rules;
    lastFiredRef.current = lastFired;
    marketHistoryRef.current = marketHistory;
    portfolioHistoryRef.current = portfolioHistory;
    notificationPermissionRef.current = notificationPermission;
  });

  const pushEvent = useCallback(
    (
      title: string,
      description: string,
      options: {
        ruleId?: string;
        severity?: AlertSeverity;
        channels?: AlertDeliveryChannels;
      } = {},
    ) => {
      const severity = options.severity ?? "info";
      const channels: AlertDeliveryChannels =
        options.channels ?? { inApp: true, browser: true, email: false, webhook: false, mobilePush: false };
      const event: AlertEvent = {
        id: createId("alert"),
        ruleId: options.ruleId,
        severity,
        channels,
        title,
        description,
        createdAt: new Date().toISOString(),
      };

      setEvents((current) => [event, ...current].slice(0, 200));
      if (channels.inApp) {
        toast({
          title,
          description,
          variant: severity === "critical" ? "destructive" : "default",
        });
      }

      if (channels.browser && notificationPermissionRef.current === "granted") {
        new Notification(title, { body: description });
      }
    },
    [setEvents],
  );

  const markRuleFired = useCallback((ruleId: string) => {
    const now = new Date().toISOString();
    setLastFired((current) => {
      const next = { ...current, [ruleId]: now };
      lastFiredRef.current = next;
      return next;
    });
  }, [setLastFired]);

  const shouldFireRule = useCallback((ruleId: string, minimumIntervalMs: number) => {
    const last = lastFiredRef.current[ruleId];
    if (!last) {
      return true;
    }
    const lastTime = Date.parse(last);
    if (Number.isNaN(lastTime)) {
      return true;
    }
    return Date.now() - lastTime >= minimumIntervalMs;
  }, []);

  const getRuleDiagnostics = useCallback((ruleId: string) => {
    const lastFiredAt = lastFired[ruleId] ?? null;
    const cutoff7d = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const firedCount7d = events.filter((event) => event.ruleId === ruleId && Date.parse(event.createdAt) >= cutoff7d).length;
    // Backtest proxy: count how many historical events for this rule exist.
    const backtestHits = events.filter((event) => event.ruleId === ruleId).length;
    return { lastFiredAt, firedCount7d, backtestHits };
  }, [events, lastFired]);

  const evaluateAlerts = useCallback(
    ({
      markets,
      previousMarkets,
      portfolioSummary,
    }: {
      markets: MarketSnapshot[];
      previousMarkets: Record<string, MarketSnapshot | undefined>;
      portfolioSummary?: PortfolioSummary;
    }) => {
      const nowIso = new Date().toISOString();
      const nowMs = Date.now();
      const rulesSnapshot = rulesRef.current;

      const nextMH: Record<string, MarketHistoryPoint[]> = { ...marketHistoryRef.current };
      for (const market of markets) {
        const existing = nextMH[market.id] ?? [];
        const appended = [
          ...existing,
          { at: nowIso, currentPrice: market.currentPrice, openInterest: market.openInterest },
        ];
        nextMH[market.id] = appended
          .filter((point) => Date.parse(point.at) >= nowMs - 8 * 24 * 60 * 60 * 1000)
          .slice(-500);
      }
      marketHistoryRef.current = nextMH;
      setMarketHistory(nextMH);
      const marketHistory = nextMH;

      let portfolioHistory = portfolioHistoryRef.current;
      if (portfolioSummary) {
        const appended = [
          ...portfolioHistoryRef.current,
          { at: nowIso, grossExposure: portfolioSummary.grossExposure },
        ];
        portfolioHistory = appended
          .filter((point) => Date.parse(point.at) >= nowMs - 8 * 24 * 60 * 60 * 1000)
          .slice(-500);
        portfolioHistoryRef.current = portfolioHistory;
        setPortfolioHistory(portfolioHistory);
      }

      for (const rule of rulesSnapshot.filter((item) => item.enabled)) {
        const cooldownMs = Math.max(1, rule.cooldownMinutes || 1) * 60_000;

        if (rule.type === "price_move" && rule.marketId) {
          const current = markets.find((market) => market.id === rule.marketId);
          const previous = previousMarkets[rule.marketId];
          if (!current || !previous) {
            continue;
          }

          const change = Math.abs(current.currentPrice - previous.currentPrice);
          if (change >= rule.threshold) {
            if (!shouldFireRule(rule.id, cooldownMs)) {
              continue;
            }
            markRuleFired(rule.id);
            pushEvent(
              rule.label,
              `${current.question} moved ${Math.round(change * 10000) / 100}%`,
              { ruleId: rule.id, severity: rule.severity, channels: rule.channels },
            );
          }
        }

        if (rule.type === "exposure_limit" && portfolioSummary) {
          if (Math.abs(portfolioSummary.netExposure) >= rule.threshold) {
            if (!shouldFireRule(rule.id, cooldownMs)) {
              continue;
            }
            markRuleFired(rule.id);
            pushEvent(
              rule.label,
              `Portfolio net exposure reached ${portfolioSummary.netExposure.toFixed(2)} USD`,
              { ruleId: rule.id, severity: rule.severity, channels: rule.channels },
            );
          }
        }

        if (rule.type === "time_window_move" && rule.marketId) {
          const current = markets.find((market) => market.id === rule.marketId);
          const history = marketHistory[rule.marketId] ?? [];
          if (!current || history.length === 0) continue;
          const cutoff = nowMs - Math.max(1, rule.timeWindowMinutes || 30) * 60_000;
          const base = findHistoryPointAtOrBefore(history, cutoff);
          if (!base) continue;
          const move = Math.abs(current.currentPrice - base.currentPrice);
          if (move >= rule.threshold) {
            if (!shouldFireRule(rule.id, cooldownMs)) continue;
            markRuleFired(rule.id);
            pushEvent(
              rule.label,
              `${current.question} moved ${(move * 100).toFixed(2)}% over ${rule.timeWindowMinutes}m`,
              { ruleId: rule.id, severity: rule.severity, channels: rule.channels },
            );
          }
        }

        if (rule.type === "market_drawdown" && rule.marketId) {
          const current = markets.find((market) => market.id === rule.marketId);
          const history = marketHistory[rule.marketId] ?? [];
          if (!current || history.length === 0) continue;
          const cutoff = nowMs - Math.max(1, rule.timeWindowMinutes || 30) * 60_000;
          const windowPoints = history.filter((point) => Date.parse(point.at) >= cutoff);
          const peak = Math.max(...windowPoints.map((point) => point.currentPrice), current.currentPrice);
          if (peak <= 0) continue;
          const drawdown = (peak - current.currentPrice) / peak;
          if (drawdown >= rule.threshold) {
            if (!shouldFireRule(rule.id, cooldownMs)) continue;
            markRuleFired(rule.id);
            pushEvent(
              rule.label,
              `${current.question} drawdown ${(drawdown * 100).toFixed(2)}% from recent peak`,
              { ruleId: rule.id, severity: rule.severity, channels: rule.channels },
            );
          }
        }

        if (rule.type === "portfolio_drawdown" && portfolioSummary) {
          const cutoff = nowMs - Math.max(1, rule.timeWindowMinutes || 30) * 60_000;
          const points = portfolioHistory.filter((point) => Date.parse(point.at) >= cutoff);
          if (points.length === 0) continue;
          const peak = Math.max(...points.map((point) => point.grossExposure), portfolioSummary.grossExposure);
          if (peak <= 0) continue;
          const drawdown = (peak - portfolioSummary.grossExposure) / peak;
          if (drawdown >= rule.threshold) {
            if (!shouldFireRule(rule.id, cooldownMs)) continue;
            markRuleFired(rule.id);
            pushEvent(
              rule.label,
              `Portfolio drawdown ${(drawdown * 100).toFixed(2)}% over ${rule.timeWindowMinutes}m`,
              { ruleId: rule.id, severity: rule.severity, channels: rule.channels },
            );
          }
        }

        if (rule.type === "liquidity_drop" && rule.marketId) {
          const current = markets.find((market) => market.id === rule.marketId);
          const history = marketHistory[rule.marketId] ?? [];
          if (!current || history.length === 0) continue;
          const cutoff = nowMs - Math.max(1, rule.timeWindowMinutes || 30) * 60_000;
          const base = findHistoryPointAtOrBefore(history, cutoff);
          if (!base || base.openInterest <= 0) continue;
          const drop = Math.max(0, (base.openInterest - current.openInterest) / base.openInterest);
          if (drop >= rule.threshold) {
            if (!shouldFireRule(rule.id, cooldownMs)) continue;
            markRuleFired(rule.id);
            pushEvent(
              rule.label,
              `${current.question} open interest dropped ${(drop * 100).toFixed(2)}% over ${rule.timeWindowMinutes}m`,
              { ruleId: rule.id, severity: rule.severity, channels: rule.channels },
            );
          }
        }
      }
    },
    [markRuleFired, pushEvent, setMarketHistory, setPortfolioHistory, shouldFireRule],
  );

  const value = useMemo<AlertContextValue>(
    () => ({
      rules,
      events,
      notificationPermission,
      addRule: (rule) => setRules((current) => [...current, { ...rule, id: createId("rule") }]),
      removeRule: (ruleId) => setRules((current) => current.filter((rule) => rule.id !== ruleId)),
      setRuleEnabled: (ruleId, enabled) =>
        setRules((current) => current.map((rule) => (rule.id === ruleId ? { ...rule, enabled } : rule))),
      requestPermission: async () => {
        if (notificationPermission === "unsupported") {
          return;
        }
        await Notification.requestPermission();
      },
      ingestExternalAlert: (title: string, description: string) => {
        pushEvent(title, description, {
          severity: "info",
          channels: { inApp: true, browser: false, email: false, webhook: false, mobilePush: false },
        });
      },
      getRuleDiagnostics,
      evaluateAlerts,
    }),
    [
      evaluateAlerts,
      events,
      getRuleDiagnostics,
      notificationPermission,
      pushEvent,
      rules,
      setRules,
    ],
  );

  useEffect(() => {
    if (events.length > 200) {
      setEvents((current) => current.slice(0, 200));
    }
  }, [events.length, setEvents]);

  return <AlertContext.Provider value={value}>{children}</AlertContext.Provider>;
}

export function useAlerts() {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error("useAlerts must be used within AlertsProvider");
  }
  return context;
}
