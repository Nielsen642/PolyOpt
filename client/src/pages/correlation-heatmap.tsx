import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";
import { CorrelationMatrixGrid, type CorrelationCellClick } from "@/components/correlations/correlation-matrix";
import { useCorrelations, type CorrelationVectorWeights } from "@/hooks/use-correlations";
import { portfolioApi } from "@/lib/api";
import { formatCompactNumber, formatCurrency, formatPercent, formatSignedCurrency } from "@/lib/formatters";
import { useLocation } from "wouter";

function compLabel(key: keyof CorrelationVectorWeights) {
  switch (key) {
    case "price":
      return "Probability (price deviation)";
    case "direction":
      return "Exposure bias (netExposure/openInterest)";
    case "openInterest":
      return "Liquidity proxy (open interest scale)";
    case "totalShares":
      return "Size proxy (total shares scale)";
    case "confidence":
      return "Signal quality (confidence)";
    default:
      return key;
  }
}

function truncateId(id: string, start = 10, end = 8) {
  if (!id || id.length <= start + end + 1) return id;
  return `${id.slice(0, start)}...${id.slice(-end)}`;
}

export default function CorrelationHeatmap() {
  const [location] = useLocation();
  const [include, setInclude] = useState({
    price: true,
    direction: true,
    openInterest: true,
    totalShares: true,
    confidence: true,
  });

  const requestedMarketId = useMemo(() => {
    if (!location) return null;
    const parts = location.split("?");
    if (parts.length < 2) return null;
    const params = new URLSearchParams(parts[1]);
    const mid = params.get("marketId");
    return mid && mid.length > 0 ? mid : null;
  }, [location]);

  const weights = useMemo<CorrelationVectorWeights>(
    () => ({
      price: include.price ? 1 : 0,
      direction: include.direction ? 1 : 0,
      openInterest: include.openInterest ? 1 : 0,
      totalShares: include.totalShares ? 1 : 0,
      confidence: include.confidence ? 1 : 0,
    }),
    [include],
  );

  const { data: correlations, isLoading, isError } = useCorrelations(true, weights);

  const [pairDialogOpen, setPairDialogOpen] = useState(false);
  const [selectedPair, setSelectedPair] = useState<{
    leftId: string;
    rightId: string;
    value: number;
  } | null>(null);

  const [hedgeBudget, setHedgeBudget] = useState(1000);
  const [hedgeLeft, setHedgeLeft] = useState(true);
  const [hedgeRight, setHedgeRight] = useState(true);

  const hedgeMarketIds = useMemo(() => {
    const ids: string[] = [];
    if (selectedPair && hedgeLeft) ids.push(selectedPair.leftId);
    if (selectedPair && hedgeRight) ids.push(selectedPair.rightId);
    return ids;
  }, [hedgeLeft, hedgeRight, selectedPair]);

  const hedgePreviewMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPair) return null;
      if (hedgeMarketIds.length === 0) return null;
      const splitEvenly = hedgeMarketIds.length === 2;
      return portfolioApi.previewHedge({
        marketIds: hedgeMarketIds,
        budget: hedgeBudget,
        splitEvenly,
      });
    },
  });

  const selectedLeft = useMemo(() => {
    if (!correlations || !selectedPair) return null;
    return correlations.markets.find((m) => m.id === selectedPair.leftId) ?? null;
  }, [correlations, selectedPair]);

  const selectedRight = useMemo(() => {
    if (!correlations || !selectedPair) return null;
    return correlations.markets.find((m) => m.id === selectedPair.rightId) ?? null;
  }, [correlations, selectedPair]);

  const didAutoSelectRef = useRef(false);

  useEffect(() => {
    if (!requestedMarketId || !correlations) return;
    if (didAutoSelectRef.current) return;

    const idx = correlations.markets.findIndex((m) => m.id === requestedMarketId);
    if (idx === -1) return;

    let bestJ = -1;
    let bestVal = 0;
    for (let j = 0; j < correlations.markets.length; j += 1) {
      if (j === idx) continue;
      const val = correlations.matrix[idx]?.[j] ?? 0;
      if (!Number.isFinite(val)) continue;
      if (bestJ === -1 || Math.abs(val) > Math.abs(bestVal)) {
        bestJ = j;
        bestVal = val;
      }
    }

    if (bestJ === -1) return;
    const left = correlations.markets[idx];
    const right = correlations.markets[bestJ];
    if (!left || !right) return;

    setSelectedPair({ leftId: left.id, rightId: right.id, value: bestVal });
    setPairDialogOpen(true);
    didAutoSelectRef.current = true;
  }, [correlations, requestedMarketId]);

  const vectorsForExplanation = useMemo(() => {
    if (!correlations || !selectedLeft || !selectedRight) return null;
    const markets = correlations.markets;
    const maxOpenInterest = Math.max(...markets.map((m) => m.openInterest), 1);
    const maxTotalShares = Math.max(...markets.map((m) => m.totalShares), 1);

    const toVector = (m: typeof selectedLeft) => {
      const direction = m.openInterest > 0 ? m.netExposure / m.openInterest : 0;
      return [
        (m.currentPrice - 0.5) * (include.price ? 1 : 0),
        direction * (include.direction ? 1 : 0),
        (m.openInterest / maxOpenInterest) * (include.openInterest ? 1 : 0),
        (m.totalShares / maxTotalShares) * (include.totalShares ? 1 : 0),
        m.confidence * (include.confidence ? 1 : 0),
      ];
    };

    const leftVec = toVector(selectedLeft);
    const rightVec = toVector(selectedRight);

    const products = leftVec.map((lv, i) => lv * rightVec[i]);
    const leftMag = Math.sqrt(leftVec.reduce((sum, v) => sum + v * v, 0));
    const rightMag = Math.sqrt(rightVec.reduce((sum, v) => sum + v * v, 0));

    const labels: Array<keyof typeof include> = ["price", "direction", "openInterest", "totalShares", "confidence"];

    const ranked = labels
      .map((k, i) => ({ key: k, product: products[i] }))
      .sort((a, b) => Math.abs(b.product) - Math.abs(a.product));

    return {
      maxOpenInterest,
      maxTotalShares,
      leftVec,
      rightVec,
      products,
      leftMag,
      rightMag,
      ranked,
    };
  }, [correlations, selectedLeft, selectedRight, include]);

  const topPairs = useMemo(() => {
    if (!correlations) return { positive: [] as Array<any>, negative: [] as Array<any> };

    const pos: Array<{ left: string; right: string; value: number }> = [];
    const neg: Array<{ left: string; right: string; value: number }> = [];

    for (let i = 0; i < correlations.markets.length; i += 1) {
      for (let j = i + 1; j < correlations.markets.length; j += 1) {
        const value = correlations.matrix[i]?.[j];
        if (typeof value !== "number") continue;
        const left = correlations.markets[i];
        const right = correlations.markets[j];
        if (!left || !right) continue;
        if (!Number.isFinite(value)) continue;
        if (value >= 0) pos.push({ left: left.id, right: right.id, value });
        if (value < 0) neg.push({ left: left.id, right: right.id, value });
      }
    }

    pos.sort((a, b) => b.value - a.value);
    neg.sort((a, b) => a.value - b.value);

    return {
      positive: pos.slice(0, 10),
      negative: neg.slice(0, 10),
    };
  }, [correlations]);

  const onCellClick = (payload: CorrelationCellClick) => {
    setSelectedPair({ leftId: payload.left.id, rightId: payload.right.id, value: payload.value });
    setHedgeBudget(1000);
    setHedgeLeft(true);
    setHedgeRight(true);
    hedgePreviewMutation.reset();
    setPairDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Market Correlations</h1>
          <p className="text-muted-foreground mt-1">Analyzing market pair relationships...</p>
        </div>
        <Card className="glass-panel border-border/30 h-96 animate-pulse bg-card/20" />
      </div>
    );
  }

  if (isError || !correlations) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Market Correlations</h1>
        </div>
        <Card className="glass-panel border-border/50">
          <CardContent className="p-8 text-center text-muted-foreground">
            <p>Unable to load correlation data</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
          <TrendingUp className="w-8 h-8 text-primary" />
          Correlation Matrix
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Similarity is a cosine match between correlation vectors built from probability + exposure inputs. Toggle
          components to see what the number is (and is not) measuring.
        </p>
      </div>

      <div className="space-y-6">
        <Card className="glass-panel border-border/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center justify-between">
              <span>Correlation Matrix</span>
              {selectedPair ? <span className="text-xs text-muted-foreground">Selected: {selectedPair.value.toFixed(3)}</span> : null}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            <div className="-mx-4 sm:mx-0 overflow-x-auto pb-2">
              <div className="min-w-max px-4 sm:px-0">
                <CorrelationMatrixGrid
                  correlations={correlations}
                  selectedPair={selectedPair ? { leftId: selectedPair.leftId, rightId: selectedPair.rightId } : null}
                  onCellClick={onCellClick}
                />
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-border/50">
              <div className="text-sm font-semibold text-foreground mb-3">Component Controls (what similarity includes)</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <ToggleLine
                  id="corr-include-price"
                  label={compLabel("price")}
                  checked={include.price}
                  onChange={(v) => setInclude((s) => ({ ...s, price: v }))}
                />
                <ToggleLine
                  id="corr-include-direction"
                  label={compLabel("direction")}
                  checked={include.direction}
                  onChange={(v) => setInclude((s) => ({ ...s, direction: v }))}
                />
                <ToggleLine
                  id="corr-include-oi"
                  label={compLabel("openInterest")}
                  checked={include.openInterest}
                  onChange={(v) => setInclude((s) => ({ ...s, openInterest: v }))}
                />
                <ToggleLine
                  id="corr-include-ts"
                  label={compLabel("totalShares")}
                  checked={include.totalShares}
                  onChange={(v) => setInclude((s) => ({ ...s, totalShares: v }))}
                />
                <ToggleLine
                  id="corr-include-conf"
                  label={compLabel("confidence")}
                  checked={include.confidence}
                  onChange={(v) => setInclude((s) => ({ ...s, confidence: v }))}
                />
                <div className="text-xs text-muted-foreground px-2 py-1 leading-5">
                  Probability-focused components are `price` + `confidence`. Exposure-focused components are `direction` (+ `netExposure/openInterest`) and the size/liquidity scales.
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-panel border-border/50">
          <CardHeader>
            <CardTitle className="text-lg">Top-N Pair List</CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            <div className="space-y-6">
              <PairList
                title="Strongest Positive Pairs"
                pairs={topPairs.positive}
                correlations={correlations}
                onView={(leftId, rightId, value) => {
                  setSelectedPair({ leftId, rightId, value });
                  hedgePreviewMutation.reset();
                  setHedgeLeft(true);
                  setHedgeRight(true);
                  setPairDialogOpen(true);
                }}
              />
              <PairList
                title="Strongest Negative Pairs"
                pairs={topPairs.negative}
                correlations={correlations}
                onView={(leftId, rightId, value) => {
                  setSelectedPair({ leftId, rightId, value });
                  hedgePreviewMutation.reset();
                  setHedgeLeft(true);
                  setHedgeRight(true);
                  setPairDialogOpen(true);
                }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={pairDialogOpen} onOpenChange={setPairDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Market-Pair Drilldown</DialogTitle>
          </DialogHeader>

          {!selectedPair || !selectedLeft || !selectedRight || !vectorsForExplanation ? (
            <div className="text-sm text-muted-foreground">Select a cell to inspect similarity drivers.</div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <MarketInputCard
                  title="Market A"
                  market={selectedLeft}
                  formatPrice={(p) => `${formatPercent(p)} (probability)`}
                />
                <MarketInputCard
                  title="Market B"
                  market={selectedRight}
                  formatPrice={(p) => `${formatPercent(p)} (probability)`}
                />
              </div>

              <div className="rounded-lg border border-border/50 bg-black/10 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm text-muted-foreground">Similarity (cosine)</div>
                    <div className="text-2xl font-bold text-foreground">{selectedPair.value.toFixed(3)}</div>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    Higher magnitude means stronger alignment across enabled components.
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <div className="text-sm font-semibold text-foreground">Why this similarity is high/low</div>
                    <div className="text-xs text-muted-foreground leading-5">
                      The correlation number is the cosine similarity between vectors built from enabled components. The “component products” below show which dimensions
                      push markets toward the same direction (positive) or opposite direction (negative).
                    </div>

                    <div className="mt-3 space-y-2">
                      <div className="text-xs uppercase tracking-wider text-muted-foreground">Dominant (by abs contribution)</div>
                      {vectorsForExplanation.ranked.slice(0, 3).map((r) => (
                        <div key={r.key} className="flex items-center justify-between gap-3 text-sm">
                          <span className={r.product >= 0 ? "text-emerald-300" : "text-red-300"}>{compLabel(r.key as any)}</span>
                          <span className="font-mono text-xs text-muted-foreground">{r.product.toFixed(4)}</span>
                        </div>
                      ))}
                      <div className="text-xs text-muted-foreground leading-5">
                        “Positive product” means the same component contributes in the same direction for both markets; “negative product” means opposing movement or exposure bias.
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-sm font-semibold text-foreground">Component Products</div>
                    <div className="rounded-lg border border-border/50 bg-black/20 p-3 space-y-2">
                      {(
                        [
                          { key: "price", label: "Price deviation", enabled: include.price },
                          { key: "direction", label: "Direction", enabled: include.direction },
                          { key: "openInterest", label: "Open interest scale", enabled: include.openInterest },
                          { key: "totalShares", label: "Total shares scale", enabled: include.totalShares },
                          { key: "confidence", label: "Confidence", enabled: include.confidence },
                        ] as const
                      ).map((c, idx) => {
                        const product = vectorsForExplanation.products[idx] ?? 0;
                        return (
                          <div key={c.key} className="flex items-center justify-between gap-3 text-sm">
                            <span className="text-muted-foreground">
                              {c.label} {c.enabled ? "" : "(ignored)"}
                            </span>
                            <span className={`font-mono text-xs ${product >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                              {product.toFixed(4)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border/50 bg-black/10 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-foreground">Hedge Impact Preview</div>
                    <div className="text-xs text-muted-foreground leading-5 mt-1">
                      Computes how a hedge in the selected market(s) changes portfolio CVaR/stress using scenarios only (no CVaR optimization solve).
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-4">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3">
                      <Checkbox checked={hedgeLeft} onCheckedChange={(v) => setHedgeLeft(Boolean(v))} id="hedge-left" />
                      <label htmlFor="hedge-left" className="text-sm text-foreground">
                        Hedge Market A
                      </label>
                    </div>
                    <div className="flex items-center gap-3">
                      <Checkbox checked={hedgeRight} onCheckedChange={(v) => setHedgeRight(Boolean(v))} id="hedge-right" />
                      <label htmlFor="hedge-right" className="text-sm text-foreground">
                        Hedge Market B
                      </label>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="text-sm text-muted-foreground">Hedge Budget ($)</div>
                    <Input
                      type="number"
                      min={0}
                      step={50}
                      value={hedgeBudget}
                      onChange={(e) => setHedgeBudget(Math.max(0, Number(e.target.value || 0)))}
                      className="w-36"
                    />
                    <Button
                      disabled={hedgePreviewMutation.isPending || hedgeMarketIds.length === 0}
                      onClick={async () => {
                        hedgePreviewMutation.reset();
                        await hedgePreviewMutation.mutateAsync();
                      }}
                    >
                      {hedgePreviewMutation.isPending ? "Computing..." : "Preview Impact"}
                    </Button>
                  </div>

                  {hedgePreviewMutation.data ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <MetricCard
                          label="CVaR (Tail loss, β=0.9)"
                          before={hedgePreviewMutation.data.metrics.cvarBefore}
                          after={hedgePreviewMutation.data.metrics.cvarAfter}
                          format={(n) => formatCurrency(n)}
                        />
                        <MetricCard
                          label="Stress Loss (worst scenario)"
                          before={hedgePreviewMutation.data.metrics.stressLossBefore}
                          after={hedgePreviewMutation.data.metrics.stressLossAfter}
                          format={(n) => formatCurrency(n)}
                        />
                        <MetricCard
                          label="Expected Return"
                          before={hedgePreviewMutation.data.metrics.expectedReturnBefore}
                          after={hedgePreviewMutation.data.metrics.expectedReturnAfter}
                          format={(n) => formatSignedCurrency(n)}
                        />
                        <div className="rounded-lg border border-border/50 bg-black/20 p-4">
                          <div className="text-xs uppercase tracking-wider text-muted-foreground">Budget Used</div>
                          <div className="mt-2 text-2xl font-bold text-foreground">
                            {formatCurrency(hedgePreviewMutation.data.metrics.budgetUsed)}
                          </div>
                        </div>
                      </div>

                      <div className="rounded-lg border border-border/50 bg-black/20 p-4 space-y-3">
                        <div className="text-sm font-semibold text-foreground">Preview Trades</div>
                        {hedgePreviewMutation.data.trades.length === 0 ? (
                          <div className="text-sm text-muted-foreground">No trades produced for the selected hedge market(s).</div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {hedgePreviewMutation.data.trades.map((t) => (
                              <div key={t.marketId} className="rounded-lg border border-border/50 bg-black/10 p-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="text-sm font-semibold text-foreground truncate">{t.question}</div>
                                    <div className="text-xs font-mono text-muted-foreground">{t.marketId}</div>
                                  </div>
                                  {t.polymarketUrl ? (
                                    <a
                                      className="text-xs text-primary hover:underline underline-offset-2"
                                      href={t.polymarketUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      Q&A
                                    </a>
                                  ) : null}
                                </div>
                                <div className="mt-2 text-sm text-muted-foreground">
                                  Side: <span className="text-foreground font-semibold">{t.tradeType === "buy_yes" ? "BUY YES" : "BUY NO"}</span>
                                </div>
                                <div className="mt-1 grid grid-cols-2 gap-2 text-xs">
                                  <div className="rounded bg-black/20 border border-border/50 p-2">
                                    <div className="text-muted-foreground">Amount</div>
                                    <div className="text-foreground font-mono">{formatCurrency(t.amount)}</div>
                                  </div>
                                  <div className="rounded bg-black/20 border border-border/50 p-2">
                                    <div className="text-muted-foreground">Est. Shares</div>
                                    <div className="text-foreground font-mono">{t.estimatedShares.toFixed(4)}</div>
                                  </div>
                                  <div className="rounded bg-black/20 border border-border/50 p-2">
                                    <div className="text-muted-foreground">Entry Price</div>
                                    <div className="text-foreground font-mono">{formatPercent(t.entryPrice)}</div>
                                  </div>
                                  <div className="rounded bg-black/20 border border-border/50 p-2">
                                    <div className="text-muted-foreground">Worst-case protection</div>
                                    <div className="text-foreground font-mono">{formatCurrency(t.worstCaseProtection)}</div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}

                  {hedgePreviewMutation.error ? (
                    <div className="text-sm text-red-300">
                      Hedge preview failed: {String(hedgePreviewMutation.error)}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}

function ToggleLine({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3 px-2 py-1">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(Boolean(v))} id={id} />
      <label htmlFor={id} className="text-sm text-foreground leading-5">
        {label}
      </label>
    </div>
  );
}

function PairList({
  title,
  pairs,
  correlations,
  onView,
}: {
  title: string;
  pairs: Array<{ left: string; right: string; value: number }>;
  correlations: any;
  onView: (leftId: string, rightId: string, value: number) => void;
}) {
  const byId = useMemo(
    () => new Map<string, any>(correlations.markets.map((m: any) => [m.id, m])),
    [correlations],
  );
  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold text-foreground">{title}</div>
      {pairs.length === 0 ? (
        <div className="text-sm text-muted-foreground">No pairs found.</div>
      ) : (
        <div className="space-y-2 max-h-[320px] overflow-auto pr-1">
          {pairs.map((p) => {
            const left = byId.get(p.left);
            const right = byId.get(p.right);
            return (
              <div key={`${p.left}-${p.right}`} className="rounded-lg border border-border/50 bg-black/10 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-mono text-muted-foreground truncate">
                      {left?.id?.slice(0, 8)} ↔ {right?.id?.slice(0, 8)}
                    </div>
                    <div className="text-sm font-semibold text-foreground truncate mt-1">
                      {left?.label} / {right?.label}
                    </div>
                  </div>
                  <div className={`text-sm font-bold ${p.value >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                    {p.value.toFixed(3)}
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    {left?.polymarketUrl ? (
                      <a className="text-xs text-primary hover:underline" href={left.polymarketUrl} target="_blank" rel="noreferrer">
                        Market A
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">A: n/a</span>
                    )}
                    {right?.polymarketUrl ? (
                      <a className="text-xs text-primary hover:underline" href={right.polymarketUrl} target="_blank" rel="noreferrer">
                        Market B
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">B: n/a</span>
                    )}
                  </div>
                  <Button variant="outline" size="sm" onClick={() => onView(p.left, p.right, p.value)}>
                    View
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MarketInputCard({
  title,
  market,
  formatPrice,
}: {
  title: string;
  market: any;
  formatPrice: (p: number) => string;
}) {
  return (
    <div className="rounded-lg border border-border/50 bg-black/10 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-foreground">{title}</div>
          <div className="text-sm text-foreground font-semibold mt-1 truncate">{market.label}</div>
          <div className="text-xs font-mono text-muted-foreground truncate" title={market.id}>
            {truncateId(market.id)}
          </div>
        </div>
        {market.polymarketUrl ? (
          <a
            className="text-xs text-primary hover:underline underline-offset-2"
            href={market.polymarketUrl}
            target="_blank"
            rel="noreferrer"
          >
            Q&A
          </a>
        ) : null}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded bg-black/20 border border-border/50 p-2">
          <div className="text-muted-foreground">Current probability</div>
          <div className="text-foreground font-mono">{formatPrice(market.currentPrice)}</div>
        </div>
        <div className="rounded bg-black/20 border border-border/50 p-2">
          <div className="text-muted-foreground">Confidence</div>
          <div className="text-foreground font-mono">{formatPercent(market.confidence)}</div>
        </div>
        <div className="rounded bg-black/20 border border-border/50 p-2">
          <div className="text-muted-foreground">Net exposure</div>
          <div className="text-foreground font-mono">{formatSignedCurrency(market.netExposure)}</div>
        </div>
        <div className="rounded bg-black/20 border border-border/50 p-2">
          <div className="text-muted-foreground">Open interest</div>
          <div className="text-foreground font-mono">{formatCurrency(market.openInterest)}</div>
        </div>
        <div className="rounded bg-black/20 border border-border/50 p-2 col-span-2">
          <div className="text-muted-foreground">Total shares</div>
          <div className="text-foreground font-mono">{formatCompactNumber(market.totalShares)}</div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  before,
  after,
  format,
}: {
  label: string;
  before: number;
  after: number;
  format: (n: number) => string;
}) {
  return (
    <div className="rounded-lg border border-border/50 bg-black/20 p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="text-sm text-muted-foreground">Before</div>
        <div className="font-mono text-sm text-muted-foreground">{format(before)}</div>
      </div>
      <div className="mt-1 flex items-end justify-between gap-3">
        <div className="text-sm text-muted-foreground">After</div>
        <div className="font-mono text-sm text-foreground">{format(after)}</div>
      </div>
    </div>
  );
}
