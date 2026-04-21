import { useEffect, useMemo, useRef, useState } from "react";
import { useRoute } from "wouter";
import { usePortfolioDetails } from "@/hooks/use-portfolios";
import { useOptimize } from "@/hooks/use-optimization";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Cpu } from "lucide-react";
import { Link } from "wouter";
import { OptimizationResults } from "@/components/portfolio/optimization-results";
import { PositionsTable } from "@/components/portfolio/positions-table";
import { PortfolioSummaryCards } from "@/components/portfolio/summary-cards";
import { formatCurrency, formatPercent, formatSignedCurrency } from "@/lib/formatters";
import { toast } from "@/hooks/use-toast";
import { useLocalStorageState } from "@/hooks/use-local-storage";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { proApi } from "@/lib/api";
import { useWallet } from "@/hooks/use-wallet";
import { useBalance } from "wagmi";

export default function PortfolioDetails() {
  const [, params] = useRoute("/portfolio/:id");
  const portfolioId = Number(params?.id);
  
  const { data: detail, isLoading: isPortfolioLoading } = usePortfolioDetails(portfolioId);
  const { walletAddress } = useWallet();
  const walletBalanceQuery = useBalance({
    address: walletAddress ? (walletAddress as `0x${string}`) : undefined,
    chainId: 137,
    query: { enabled: Boolean(walletAddress) },
  });
  const optimize = useOptimize(portfolioId);
  const [budget, setBudget] = useState("1000");
  const [riskTolerance, setRiskTolerance] = useState("0.45");
  const [maxPositionWeight, setMaxPositionWeight] = useState("0.35");
  const [scenarioPreset, setScenarioPreset] = useState<"baseline" | "vol_spike" | "liquidity_crunch" | "market_gap">("baseline");
  const [savedPresets, setSavedPresets] = useLocalStorageState<Array<{
    name: string;
    budget: string;
    riskTolerance: string;
    maxPositionWeight: string;
    scenarioPreset: "baseline" | "vol_spike" | "liquidity_crunch" | "market_gap";
  }>>("polyopt-optimizer-presets", []);
  const [riskHistory, setRiskHistory] = useLocalStorageState<Array<{
    at: string;
    grossExposure: number;
    netExposure: number;
    diversificationScore: number;
    unrealizedPnl: number;
    drawdown: number;
  }>>("polyopt-risk-history", []);
  const [auditTrail, setAuditTrail] = useLocalStorageState<Array<{
    at: string;
    portfolioId: number;
    budget: number;
    riskTolerance: number;
    maxPositionWeight: number;
    scenarioPreset: string;
    cvarBefore?: number;
    cvarAfter?: number;
    stressBefore?: number;
    stressAfter?: number;
  }>>("polyopt-audit-trail", []);
  const lastAutofilledWalletRef = useRef<string | null>(null);

  const handleOptimize = () => {
    if (!detail || detail.positions.length === 0) return;

    optimize.mutate(
      {
        budget: Number(budget),
        riskTolerance: Number(riskTolerance),
        maxPositionWeight: Number(maxPositionWeight),
        scenarioPreset,
      },
      {
        onSuccess: (res) => {
          setAuditTrail((current) => [
            {
              at: new Date().toISOString(),
              portfolioId,
              budget: Number(budget),
              riskTolerance: Number(riskTolerance),
              maxPositionWeight: Number(maxPositionWeight),
              scenarioPreset,
              cvarBefore: res.metrics.cvarBefore,
              cvarAfter: res.metrics.cvarAfter,
              stressBefore: res.metrics.stressLossBefore,
              stressAfter: res.metrics.stressLossAfter,
            },
            ...current,
          ].slice(0, 500));
        },
        onError: (err) => {
          let description = "Unknown error";
          if (err instanceof Error) {
            try {
              const body = JSON.parse(err.message);
              if (typeof body?.message === "string") description = body.message;
              else description = err.message;
            } catch {
              description = err.message;
            }
          }
          toast({
            title: "Optimization failed",
            description,
            variant: "destructive",
          });
        },
      }
    );
  };

  const optimizationData = optimize.data;
  const summary = detail?.summary;

  useEffect(() => {
    if (!walletAddress) {
      lastAutofilledWalletRef.current = null;
      return;
    }
    const balance = walletBalanceQuery.data;
    if (!balance) return;
    if (lastAutofilledWalletRef.current === walletAddress) return;
    const n = Number(balance.formatted);
    if (Number.isFinite(n)) {
      setBudget(n.toFixed(4));
      lastAutofilledWalletRef.current = walletAddress;
    }
  }, [walletAddress, walletBalanceQuery.data]);

  const topContributors = useMemo(() => {
    if (!detail?.positions) return [];
    return [...detail.positions]
      .sort((a, b) => Math.abs(b.netExposure) - Math.abs(a.netExposure))
      .slice(0, 5);
  }, [detail?.positions]);

  const clusterContributors = useMemo(() => {
    if (!detail?.positions) return [];
    const groups = new Map<string, { cluster: string; exposure: number; pnl: number }>();
    for (const p of detail.positions) {
      const cluster = p.netExposure >= 0 ? "Long-bias cluster" : "Short-bias cluster";
      const g = groups.get(cluster) ?? { cluster, exposure: 0, pnl: 0 };
      g.exposure += p.netExposure;
      g.pnl += p.pnl;
      groups.set(cluster, g);
    }
    return Array.from(groups.values());
  }, [detail?.positions]);

  useEffect(() => {
    if (!summary) return;
    const now = Date.now();
    const peak = Math.max(summary.grossExposure, ...riskHistory.map((r) => r.grossExposure), 1);
    const drawdown = peak > 0 ? (peak - summary.grossExposure) / peak : 0;
    setRiskHistory((current) => {
      const next = [
        ...current,
        {
          at: new Date(now).toISOString(),
          grossExposure: summary.grossExposure,
          netExposure: summary.netExposure,
          diversificationScore: summary.diversificationScore,
          unrealizedPnl: summary.unrealizedPnl,
          drawdown,
        },
      ];
      const cutoff = now - 14 * 24 * 60 * 60 * 1000;
      return next.filter((x) => Date.parse(x.at) >= cutoff).slice(-600);
    });
  }, [setRiskHistory, summary]);

  const diagnosticsQuery = useQuery({
    queryKey: ["/api/health", "trading-pages"],
    queryFn: async () => {
      const r = await fetch("/api/health", { credentials: "include" });
      if (!r.ok) throw new Error("Health failed");
      return (await r.json()) as any;
    },
    retry: false,
    refetchInterval: 60000,
  });

  const proMetaQuery = useQuery({
    queryKey: ["/api/pro/meta"],
    queryFn: () => proApi.getMeta(),
    staleTime: 60_000,
  });

  const riskReportQuery = useQuery({
    queryKey: ["/api/pro/risk-report"],
    queryFn: () => proApi.getRiskReport(),
    enabled: Boolean(proMetaQuery.data?.proMode),
    staleTime: 30_000,
  });

  const riskSeries = useMemo(
    () =>
      riskHistory.map((r) => ({
        t: new Date(r.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        gross: r.grossExposure,
        net: r.netExposure,
        drawdown: r.drawdown * 100,
        diversification: r.diversificationScore * 100,
      })),
    [riskHistory],
  );

  const portfolioAuditRows = useMemo(
    () => auditTrail.filter((x) => x.portfolioId === portfolioId),
    [auditTrail, portfolioId],
  );

  return (
    <div className="space-y-6 pb-20">
      <Link href="/" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors mb-2">
        <ArrowLeft className="w-4 h-4 mr-2" /> Back to Portfolios
      </Link>
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground glow-text-blue">
            {detail?.portfolio.name ?? "Portfolio Strategy"}
          </h1>
          <p className="text-muted-foreground font-mono-data mt-1 text-sm">
            P-{portfolioId.toString().padStart(4, "0")} • Deterministic scenario analytics and hedge design
          </p>
        </div>
      </div>

      {summary && <PortfolioSummaryCards summary={summary} />}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:items-stretch">
        <Card className="glass-panel flex flex-col border-border/50 lg:col-span-2 lg:row-start-1 lg:min-h-[36rem]">
          <CardHeader className="shrink-0">
            <CardTitle className="text-lg">Position Analytics</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col pt-0">
            {isPortfolioLoading ? (
              <div className="flex h-40 flex-1 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary"></div>
              </div>
            ) : (
              <div className="flex-1 overflow-x-auto">
                <PositionsTable positions={detail?.positions ?? []} />
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="glass-panel flex flex-col border-primary/20 bg-gradient-to-b from-card/80 to-primary/5 lg:col-span-1 lg:row-start-1 lg:min-h-[36rem]">
          <CardHeader className="shrink-0">
            <CardTitle className="text-lg">Optimization Engine</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col space-y-6 pt-0">
              <div className="space-y-2">
                <Label className="text-muted-foreground text-xs uppercase tracking-wider">
                  Allocation Budget ({walletBalanceQuery.data?.symbol ?? "$"})
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {walletBalanceQuery.data?.symbol ?? "$"}
                  </span>
                  <Input 
                    type="number" 
                    value={budget} 
                    onChange={e => setBudget(e.target.value)}
                    className="pl-8 bg-black/60 font-mono-data text-lg h-12 border-primary/30 focus:border-primary focus:ring-primary/20"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-muted-foreground text-xs uppercase tracking-wider">
                  Risk Tolerance
                </Label>
                <Input
                  type="number"
                  min="0"
                  max="1"
                  step="0.05"
                  value={riskTolerance}
                  onChange={(event) => setRiskTolerance(event.target.value)}
                  className="bg-black/60 font-mono-data"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-muted-foreground text-xs uppercase tracking-wider">
                  Max Position Weight
                </Label>
                <Input
                  type="number"
                  min="0.05"
                  max="1"
                  step="0.05"
                  value={maxPositionWeight}
                  onChange={(event) => setMaxPositionWeight(event.target.value)}
                  className="bg-black/60 font-mono-data"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-muted-foreground text-xs uppercase tracking-wider">
                  Scenario Preset
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ["baseline", "Baseline"],
                      ["vol_spike", "Vol spike"],
                      ["liquidity_crunch", "Liquidity crunch"],
                      ["market_gap", "Market gap"],
                    ] as const
                  ).map(([key, label]) => (
                    <Button
                      key={key}
                      size="sm"
                      variant={scenarioPreset === key ? "default" : "outline"}
                      onClick={() => setScenarioPreset(key)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-muted-foreground text-xs uppercase tracking-wider">Saved Presets</Label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const name = `Preset ${savedPresets.length + 1}`;
                      setSavedPresets((current) => [
                        ...current,
                        { name, budget, riskTolerance, maxPositionWeight, scenarioPreset },
                      ]);
                    }}
                  >
                    Save current
                  </Button>
                  {savedPresets.slice(-5).map((p, idx) => (
                    <Button
                      key={`${p.name}-${idx}`}
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setBudget(p.budget);
                        setRiskTolerance(p.riskTolerance);
                        setMaxPositionWeight(p.maxPositionWeight);
                        setScenarioPreset(p.scenarioPreset);
                      }}
                    >
                      {p.name}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="bg-black/40 p-4 rounded-lg border border-border/50 text-sm text-muted-foreground">
                The engine builds deterministic stress scenarios from backend-derived market probabilities,
                liquidity concentration, and the correlation matrix, then minimizes projected CVaR.
              </div>

              <Button 
                onClick={handleOptimize}
                disabled={optimize.isPending || !detail?.positions.length}
                className="w-full h-12 text-md font-semibold bg-primary hover:bg-primary/90 shadow-[0_0_20px_rgba(59,130,246,0.3)] transition-all"
              >
                {optimize.isPending ? (
                  <span className="flex items-center">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                    COMPUTING...
                  </span>
                ) : (
                  "RUN ALGORITHM"
                )}
              </Button>

              {summary && (
                <div className="grid grid-cols-1 gap-3 text-sm">
                  <EngineMetric label="Current Gross Exposure" value={formatCurrency(summary.grossExposure)} />
                  <EngineMetric label="Current Net Exposure" value={formatSignedCurrency(summary.netExposure)} />
                  <EngineMetric label="Current Portfolio PnL" value={formatSignedCurrency(summary.unrealizedPnl)} />
                  <EngineMetric label="Diversification Score" value={formatPercent(summary.diversificationScore)} />
                </div>
              )}

              <div className="rounded-lg border border-border/50 bg-black/20 p-3 text-xs text-muted-foreground">
                <div className="font-semibold text-foreground mb-1">Source diagnostics</div>
                <div>Pro tier: {diagnosticsQuery.data?.proMode ? "on" : "off"}</div>
                <div>Data API: {diagnosticsQuery.data?.polymarketDataReachable ? "reachable" : "unreachable"}</div>
                <div>Gamma API: {diagnosticsQuery.data?.polymarketGammaReachable ? "reachable" : "unreachable"}</div>
                <div>CLOB: {diagnosticsQuery.data?.polymarketClobReachable ? "reachable" : "unreachable"}</div>
              </div>
          </CardContent>
        </Card>

        <div className="flex w-full flex-col gap-6 lg:col-span-3 lg:col-start-1 lg:row-start-2">
          {optimizationData ? <OptimizationResults result={optimizationData} /> : null}
        </div>
      </div>

      <Card className="glass-panel border-border/50">
        <CardHeader>
          <CardTitle>Risk Attribution</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-border/50 bg-black/20 p-4">
            <div className="text-sm font-semibold text-foreground mb-2">Top Risk Contributors (by |net exposure|)</div>
            <div className="space-y-2">
              {topContributors.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 text-sm">
                  <div className="truncate text-foreground">{p.question}</div>
                  <div className="font-mono-data text-muted-foreground">{formatSignedCurrency(p.netExposure)}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-border/50 bg-black/20 p-4">
            <div className="text-sm font-semibold text-foreground mb-2">Cluster Contribution</div>
            <div className="space-y-2">
              {clusterContributors.map((c) => (
                <div key={c.cluster} className="flex items-center justify-between gap-3 text-sm">
                  <div className="text-foreground">{c.cluster}</div>
                  <div className="font-mono-data text-muted-foreground">
                    {formatSignedCurrency(c.exposure)} / {formatSignedCurrency(c.pnl)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {proMetaQuery.data?.proMode && riskReportQuery.isLoading ? (
        <Card className="glass-panel border-border/50">
          <CardContent className="py-6 text-sm text-muted-foreground animate-pulse">
            Loading Pro risk report…
          </CardContent>
        </Card>
      ) : null}

      {riskReportQuery.data ? (
        <Card className="glass-panel border-emerald-500/20">
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              Pro risk report
              <span className="text-xs font-normal text-muted-foreground">
                Generated {new Date(riskReportQuery.data.generatedAt).toLocaleString()}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p className="text-xs text-muted-foreground leading-relaxed border border-border/40 rounded-md p-3 bg-black/20">
              {riskReportQuery.data.disclosure}
            </p>
            <div>
              <div className="font-semibold text-foreground mb-2">Concentration</div>
              <div className="text-muted-foreground">
                HHI {formatPercent(riskReportQuery.data.concentration.herfindahl)} · Largest weight{" "}
                {formatPercent(riskReportQuery.data.concentration.largestWeight)}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {riskReportQuery.data.concentration.interpretation}
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-lg border border-border/50 bg-black/20 p-3 max-h-56 overflow-y-auto">
                <div className="font-semibold text-foreground mb-2">Top exposure sleeves</div>
                {riskReportQuery.data.clusterAttribution.map((c) => (
                  <div key={c.name} className="flex justify-between gap-2 text-xs py-1 border-b border-border/30 last:border-0">
                    <span>{c.name}</span>
                    <span className="font-mono-data text-muted-foreground">
                      {formatSignedCurrency(c.netExposure)} ({formatPercent(c.weightOfGross)})
                    </span>
                  </div>
                ))}
              </div>
              <div className="rounded-lg border border-border/50 bg-black/20 p-3 max-h-56 overflow-y-auto">
                <div className="font-semibold text-foreground mb-2">Liquidity watchlist</div>
                {riskReportQuery.data.liquidityWatchlist.slice(0, 8).map((row) => (
                  <div key={row.marketId} className="text-xs py-1 border-b border-border/30 last:border-0">
                    <div className="truncate text-foreground">{row.question}</div>
                    <div className="font-mono-data text-muted-foreground">
                      OI {formatCurrency(row.openInterest)} · {row.flag}
                      {row.spread != null ? ` · spread ${(row.spread * 100).toFixed(2)}¢` : ""}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card className="glass-panel border-border/50">
        <CardHeader>
          <CardTitle>Portfolio Risk History (14d local)</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={riskSeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis dataKey="t" stroke="#71717a" />
              <YAxis stroke="#71717a" />
              <Tooltip />
              <Area type="monotone" dataKey="gross" stroke="#3b82f6" fill="#3b82f633" />
              <Area type="monotone" dataKey="drawdown" stroke="#ef4444" fill="#ef444422" />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="glass-panel border-border/50">
        <CardHeader>
          <CardTitle>Audit Trail & Export</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const rows = portfolioAuditRows.map((r) => ({
                  time: r.at,
                  budget: r.budget,
                  riskTolerance: r.riskTolerance,
                  maxPositionWeight: r.maxPositionWeight,
                  scenarioPreset: r.scenarioPreset,
                  cvarBefore: r.cvarBefore ?? "",
                  cvarAfter: r.cvarAfter ?? "",
                  stressBefore: r.stressBefore ?? "",
                  stressAfter: r.stressAfter ?? "",
                }));
                const header = Object.keys(rows[0] ?? {}).join(",");
                const body = rows
                  .map((row) =>
                    Object.values(row)
                      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
                      .join(","),
                  )
                  .join("\n");
                const csv = `${header}\n${body}`;
                const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `portfolio-${portfolioId}-audit.csv`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              }}
            >
              Export CSV
            </Button>
            <Button size="sm" variant="outline" onClick={() => window.print()}>
              Export PDF (Print)
            </Button>
          </div>
          <div className="max-h-48 overflow-y-auto rounded-lg border border-border/50 bg-black/20 p-3 text-xs">
            {portfolioAuditRows.length === 0 ? (
              <div className="text-muted-foreground">No audit entries yet.</div>
            ) : (
              portfolioAuditRows.slice(0, 50).map((r, idx) => (
                <div key={`${r.at}-${idx}`} className="border-b border-border/30 py-1 last:border-b-0">
                  {new Date(r.at).toLocaleString()} | budget {formatCurrency(r.budget)} | {r.scenarioPreset}
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function EngineMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/50 bg-black/30 p-3">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono-data text-sm text-foreground">{value}</div>
    </div>
  );
}
