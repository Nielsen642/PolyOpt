import type { MarketSnapshot } from "@shared/schema";
import { Activity, BellRing, Info, Network } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCompactNumber, formatCurrency, formatPercent, formatSignedCurrency } from "@/lib/formatters";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip as RechartsTooltip } from "recharts";
import { Link } from "wouter";

type LiveOverlay = {
  currentPrice: number;
  yesPrice: number;
  noPrice: number;
  openInterest: number;
  direction?: "up" | "down" | "none";
};

function truncateId(id: string, start = 8, end = 6): string {
  if (!id || id.length <= start + end) return id;
  return `${id.slice(0, start)}…${id.slice(-end)}`;
}

type HistoryPoint = {
  atMs: number;
  prob: number;
  openInterest: number;
};

export function MarketCard({
  market,
  liveData,
}: {
  market: MarketSnapshot;
  liveData?: LiveOverlay;
}) {
  const currentPrice = liveData?.currentPrice ?? market.currentPrice;
  const yesPrice = liveData?.yesPrice ?? market.yesPrice;
  const noPrice = liveData?.noPrice ?? market.noPrice;
  const openInterest = liveData?.openInterest ?? market.openInterest;

  const historyMinutes = 15;
  const maxPoints = 60;
  const historyRef = useRef<HistoryPoint[]>([]);
  const lastSampleAtRef = useRef<number>(0);
  const [history, setHistory] = useState<HistoryPoint[]>([]);

  useEffect(() => {
    const now = Date.now();
    if (now - lastSampleAtRef.current < 10_000) return;
    lastSampleAtRef.current = now;

    const cutoff = now - historyMinutes * 60_000;
    const next: HistoryPoint = { atMs: now, prob: currentPrice, openInterest };
    const updated = [...historyRef.current, next].filter((p) => p.atMs >= cutoff).slice(-maxPoints);
    historyRef.current = updated;
    setHistory(updated);
  }, [currentPrice, openInterest, market.id]);

  const maxOI = useMemo(() => Math.max(...history.map((p) => p.openInterest), 1), [history]);
  const chartData = useMemo(
    () =>
      history.map((p) => ({
        t: new Date(p.atMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        prob: p.prob,
        oiNorm: maxOI > 0 ? p.openInterest / maxOI : 0,
        oi: p.openInterest,
      })),
    [history, maxOI],
  );
  const updatedAtMs = Date.parse(market.updatedAt);
  const stale = Number.isFinite(updatedAtMs) ? Date.now() - updatedAtMs > 2 * 60_000 : false;

  return (
    <Card className="glass-panel h-full border-border/50 transition-all duration-300 hover:border-primary/30 overflow-hidden">
      <CardContent className="flex h-full min-w-0 flex-col justify-between p-5">
        <div className="min-w-0 space-y-4">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <Badge
              variant="outline"
              className="min-w-0 max-w-[calc(100%-5rem)] shrink border-border/50 font-mono-data text-muted-foreground truncate"
              title={market.id}
            >
              <span className="truncate">{truncateId(market.id)}</span>
            </Badge>
            <Badge
              variant="outline"
              className={market.active ? "border-emerald-500/30 text-emerald-400" : "border-border/50 text-muted-foreground"}
            >
              {market.active ? "ACTIVE" : "INACTIVE"}
            </Badge>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-foreground">{market.question}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Prices/depth from CLOB. Volume/open-interest/liquidity from Polymarket Gamma API.
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <PriceCell
              label="YES"
              value={formatPercent(yesPrice)}
              className={liveData?.direction === "up" ? "border-emerald-500/50" : "border-border/50"}
            />
            <PriceCell
              label="NO"
              value={formatPercent(noPrice)}
              className={liveData?.direction === "down" ? "border-red-500/50" : "border-border/50"}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <Metric label="Market Open Interest" value={market.marketOpenInterest != null ? formatCurrency(market.marketOpenInterest) : "n/a"} />
            <Metric label="24h Volume" value={market.marketVolume24h != null ? formatCurrency(market.marketVolume24h) : "n/a"} />
            <Metric label="Liquidity" value={market.marketLiquidity != null ? formatCurrency(market.marketLiquidity) : "n/a"} />
            <Metric label="Your Net Exposure" value={formatSignedCurrency(market.netExposure)} />
          </div>

          <div className="rounded-lg border border-border/40 bg-black/15 p-3 text-[11px] text-muted-foreground leading-relaxed">
            <div className="font-semibold text-foreground text-xs mb-1.5">Position context</div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-1">
              <span>Your shares (YES / NO)</span>
              <span className="font-mono-data text-foreground text-right">
                {formatCompactNumber(market.totalYesShares)} / {formatCompactNumber(market.totalNoShares)}
              </span>
              <span>Position value proxy</span>
              <span className="font-mono-data text-foreground text-right">{formatCurrency(openInterest)}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Activity className="h-4 w-4" />
            Current probability: {formatPercent(currentPrice)}
          </div>
          <div className={`text-[11px] ${stale ? "text-amber-400" : "text-muted-foreground"}`}>
            Feed update: {Number.isFinite(updatedAtMs) ? new Date(updatedAtMs).toLocaleTimeString() : "unknown"}
            {stale ? " (stale)" : ""}
            {market.serverAssembledAt ? (
              <span className="block text-muted-foreground/80">
                Server batch: {new Date(market.serverAssembledAt).toLocaleTimeString()}
              </span>
            ) : null}
          </div>

          {/* Execution context + short trend */}
          <div className="rounded-lg border border-border/40 bg-black/15 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-semibold text-foreground flex items-center gap-2">
                <Info className="h-4 w-4 text-primary" />
                Execution context
              </div>
              <div className="text-[11px] text-muted-foreground">Top-of-book</div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <MiniMetric label="Best Bid" value={market.bestBidPrice != null ? formatPercent(market.bestBidPrice) : "n/a"} />
              <MiniMetric label="Best Ask" value={market.bestAskPrice != null ? formatPercent(market.bestAskPrice) : "n/a"} />
              <MiniMetric
                label="Spread"
                value={market.spread != null ? `${(market.spread * 100).toFixed(2)}pp` : "n/a"}
              />
              <MiniMetric
                label="Depth (top)"
                value={
                  market.topBidDepth != null || market.topAskDepth != null
                    ? formatCompactNumber((market.topBidDepth ?? 0) + (market.topAskDepth ?? 0))
                    : "n/a"
                }
              />
            </div>

            {chartData.length > 3 ? (
              <div className="mt-3 h-16">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <XAxis dataKey="t" hide />
                    <YAxis hide domain={[0, 1]} />
                    <RechartsTooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const row = payload[0]?.payload as any;
                        return (
                          <div className="rounded-md border border-border/50 bg-black/90 px-2 py-1 text-xs text-foreground shadow-lg">
                            <div className="font-mono-data">{row.t}</div>
                            <div className="text-muted-foreground">Prob: {formatPercent(row.prob)}</div>
                            <div className="text-muted-foreground">OI: {formatCurrency(row.oi)}</div>
                          </div>
                        );
                      }}
                    />
                    <Line type="monotone" dataKey="prob" stroke="#3b82f6" strokeWidth={1.5} dot={false} />
                    <Line type="monotone" dataKey="oiNorm" stroke="#a78bfa" strokeWidth={1.25} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="mt-3 text-[11px] text-muted-foreground">Trend will appear after a few samples.</div>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <ActionPill
            icon={<Network className="h-4 w-4" />}
            label="Hedge Map"
            href={`/hedge-map?marketId=${encodeURIComponent(market.id)}`}
          />
          <ActionPill
            icon={<BellRing className="h-4 w-4" />}
            label="Correlations"
            href={`/correlations?marketId=${encodeURIComponent(market.id)}`}
          />
          <ActionPill
            icon={<BellRing className="h-4 w-4" />}
            label="Alert"
            href={`/alerts?type=price_move&marketId=${encodeURIComponent(market.id)}&threshold=0.05`}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function PriceCell({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={`rounded-lg border bg-black/20 p-3 text-center ${className ?? ""}`}>
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-2 font-mono-data text-xl font-bold text-foreground">{value}</div>
    </div>
  );
}

function Metric({ label, value }: { label: ReactNode; value: string }) {
  return (
    <div className="rounded-lg border border-border/50 bg-black/20 p-3">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono-data text-sm text-foreground">{value}</div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border/30 bg-black/20 p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono-data text-[12px] text-foreground truncate">{value}</div>
    </div>
  );
}

function ActionPill({ href, icon, label }: { href: string; icon: ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 rounded-md border border-border/50 bg-black/20 px-2 py-1 text-xs text-foreground hover:bg-white/5 transition-colors"
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}
